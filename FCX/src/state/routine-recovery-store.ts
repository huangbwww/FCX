import type {
  RoutineRecoveryCheckpoint,
  RoutineRecoveryCursor,
  RoutineRecoveryErrorEvent,
  RoutineRecoveryPendingOperation,
} from "../types/routines";
import type { StorageAdapter } from "./settings-store";

export const ROUTINE_RECOVERY_STORAGE_KEY = "fcx:2026:routine-recovery";
export const ROUTINE_RECOVERY_TTL_MS = 30 * 60 * 1_000;
export const ROUTINE_RECOVERY_DEFAULT_MAX_RELOADS = 3;
export const ROUTINE_RECOVERY_DELAYS_MS = [5_000, 15_000, 30_000] as const;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const normalizeRoutineRecoveryMaxReloads = (value: unknown): number => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100
    ? parsed
    : ROUTINE_RECOVERY_DEFAULT_MAX_RELOADS;
};

export const routineRecoveryDelayMs = (reloadAttempt: unknown): number => {
  const attempt = Math.max(1, Math.trunc(Number(reloadAttempt) || 1));
  return ROUTINE_RECOVERY_DELAYS_MS[
    Math.min(attempt - 1, ROUTINE_RECOVERY_DELAYS_MS.length - 1)
  ]!;
};

type StoredRoutineRecoveryCheckpoint = Omit<
  RoutineRecoveryCheckpoint,
  "version" | "recoveryErrors"
> & {
  version?: 1 | 2;
  recoveryErrors?: RoutineRecoveryErrorEvent[];
};

function validRecoveryError(value: unknown): value is RoutineRecoveryErrorEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RoutineRecoveryErrorEvent>;
  return typeof event.occurredAt === "string"
    && Number.isSafeInteger(event.reloadAttempt)
    && Number(event.reloadAttempt) >= 1
    && Number.isSafeInteger(event.maxReloads)
    && Number(event.maxReloads) >= 1
    && Number(event.maxReloads) <= 100
    && typeof event.stopKind === "string"
    && typeof event.reason === "string"
    && typeof event.technicalMessage === "string"
    && Number.isSafeInteger(event.cycle)
    && Number(event.cycle) >= 0
    && Number.isSafeInteger(event.stepIndex)
    && Number(event.stepIndex) >= 0;
}

function validCursor(value: unknown): value is RoutineRecoveryCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as RoutineRecoveryCursor;
  return [cursor.cycle, cursor.stepIndex, cursor.completedInStep].every(
    (item) => Number.isSafeInteger(Number(item)) && Number(item) >= 0,
  );
}

function validPendingOperation(value: unknown): value is RoutineRecoveryPendingOperation {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<RoutineRecoveryPendingOperation>;
  if (typeof operation.stepId !== "string" || !operation.stepId) return false;
  if (!Number.isFinite(operation.startedAt)) return false;
  if (operation.kind === "sbc_submit") {
    return Number.isFinite(operation.setId)
      && Number(operation.setId) > 0
      && Number.isFinite(operation.challengeId)
      && Number(operation.challengeId) > 0
      && Number.isSafeInteger(operation.beforeSetCompletions)
      && Number(operation.beforeSetCompletions) >= 0
      && typeof operation.countsTowardStep === "boolean"
      && Boolean(operation.submission)
      && Boolean(operation.reward);
  }
  return false;
}

export class RoutineRecoveryStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly now: () => number = () => Date.now(),
  ) {}

  load(personaId?: string | number): RoutineRecoveryCheckpoint | undefined {
    const raw = this.storage.getItem(ROUTINE_RECOVERY_STORAGE_KEY);
    if (!raw) return undefined;
    try {
      const rawValue = JSON.parse(raw) as StoredRoutineRecoveryCheckpoint;
      const legacyErrors: RoutineRecoveryErrorEvent[] = rawValue.version === 1 && rawValue.lastError
        ? [{
            occurredAt: new Date(Number(rawValue.updatedAt) || this.now()).toISOString(),
            reloadAttempt: Math.max(1, Number(rawValue.reloadCount) || 1),
            maxReloads: ROUTINE_RECOVERY_DEFAULT_MAX_RELOADS,
            stopKind: "invalid",
            reason: String(rawValue.lastError),
            technicalMessage: String(rawValue.lastError),
            cycle: Math.max(0, Number(rawValue.cursor?.cycle) || 0),
            stepIndex: Math.max(0, Number(rawValue.cursor?.stepIndex) || 0),
          }]
        : [];
      const value = {
        ...rawValue,
        version: 2 as const,
        routine: {
          ...rawValue.routine,
          fatalRecoveryMaxReloads: normalizeRoutineRecoveryMaxReloads(
            rawValue.routine?.fatalRecoveryMaxReloads,
          ),
        },
        recoveryErrors: Array.isArray(rawValue.recoveryErrors)
          ? rawValue.recoveryErrors
          : legacyErrors,
      } as RoutineRecoveryCheckpoint;
      const valid = (rawValue?.version === 1 || rawValue?.version === 2)
        && typeof value.personaId === "string"
        && typeof value.taskId === "string"
        && value.routine && typeof value.routine === "object"
        && ["stop", "resume", "restart"].includes(value.recoveryMode)
        && validCursor(value.cursor)
        && Number.isSafeInteger(value.reloadCount)
        && value.reloadCount >= 0
        && Number.isFinite(value.createdAt)
        && Number.isFinite(value.updatedAt)
        && value.recoveryErrors.every(validRecoveryError)
        && validPendingOperation(value.pendingOperation)
        && this.now() - value.updatedAt <= ROUTINE_RECOVERY_TTL_MS;
      if (!valid || (personaId !== undefined && value.personaId !== String(personaId))) {
        this.clear();
        return undefined;
      }
      return clone(value);
    } catch {
      this.clear();
      return undefined;
    }
  }

  save(value: RoutineRecoveryCheckpoint): RoutineRecoveryCheckpoint {
    const next = clone({
      ...value,
      version: 2 as const,
      routine: {
        ...value.routine,
        fatalRecoveryMaxReloads: normalizeRoutineRecoveryMaxReloads(
          value.routine.fatalRecoveryMaxReloads,
        ),
      },
      recoveryErrors: Array.isArray(value.recoveryErrors) ? value.recoveryErrors : [],
      updatedAt: this.now(),
    });
    this.storage.setItem(ROUTINE_RECOVERY_STORAGE_KEY, JSON.stringify(next));
    const verified = this.load(next.personaId);
    if (!verified || verified.taskId !== next.taskId) {
      throw new Error("永动机恢复检查点保存后回读失败");
    }
    return verified;
  }

  clear(): void {
    this.storage.removeItem(ROUTINE_RECOVERY_STORAGE_KEY);
  }
}
