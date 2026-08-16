import {
  builtinRoutines,
  FCX_BUILTIN_ROUTINE_SNAPSHOT_VERSION,
} from "../config/builtin-routines";
import type {
  RoutineDefinition,
  RoutineDocument,
  RoutineExecutionMode,
  RoutinePackStep,
  RoutineSbcStep,
  RoutineStep,
  RoutineFatalRecoveryMode,
} from "../types/routines";
import { normalizeStorageOverflowFallback } from "./storage-overflow-fallback-store";
import type { StorageAdapter } from "./settings-store";

export const ROUTINE_STORAGE_KEY = "fcx:2026:routines";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDocument(): RoutineDocument {
  return { version: 8, builtinOverrides: {}, custom: {} };
}

const normalizeFatalRecoveryMode = (value: unknown): RoutineFatalRecoveryMode =>
  value === "stop" || value === "resume" ? value : "restart";

export const normalizeFatalRecoveryMaxReloads = (value: unknown): number => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 3;
};

export function normalizeRoutineRunCount(value: unknown, fallback = 1): number {
  const parsed = Math.trunc(Number(value));
  if (parsed === -1) return -1;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(100, parsed);
}

function normalizeStep(value: unknown, index: number): RoutineStep | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id || `step-${index + 1}`);
  const runs = normalizeRoutineRunCount(record.runs ?? record.maxRuns);
  if (record.kind === "pack") {
    const packId = Number(record.packId);
    if (!Number.isFinite(packId) || packId <= 0) return null;
    return {
      kind: "pack",
      id,
      runs,
      packId,
      tradable: record.tradable === true,
      packName: String(record.packName || `卡包 #${packId}`),
    } satisfies RoutinePackStep;
  }
  const setId = Number(record.setId);
  if (!Number.isFinite(setId) || setId <= 0) return null;
  const target = record.target && typeof record.target === "object"
    ? clone(record.target) as NonNullable<RoutineSbcStep["target"]>
    : undefined;
  const normalizedTarget = target && Number(target.preferredSetId) === setId
    ? target
    : undefined;
  return {
    kind: "sbc",
    id,
    runs,
    setId,
    ...(normalizedTarget ? { target: normalizedTarget } : {}),
  } satisfies RoutineSbcStep;
}

export function normalizeRoutine(
  value: unknown,
  origin: "builtin" | "custom",
): RoutineDefinition | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id || "").trim();
  const name = String(record.name || "").trim();
  const steps = Array.isArray(record.steps)
    ? record.steps
        .map((candidate, index) => normalizeStep(candidate, index))
        .filter((candidate): candidate is RoutineStep => candidate !== null)
    : [];
  if (!id || !name || !steps.length) return null;
  const mode: RoutineExecutionMode =
    record.mode === "round_robin" ? "round_robin" : "exhaust_step";
  const rawFallback =
    record.totwFallback && typeof record.totwFallback === "object"
      ? (record.totwFallback as Record<string, unknown>)
      : {};
  const fallbackSetId = Number(rawFallback.setId);
  const fallbackRuns = Math.trunc(Number(rawFallback.runs));
  const rawSolveFailureFallback =
    record.solveFailureFallback && typeof record.solveFailureFallback === "object"
      ? (record.solveFailureFallback as Record<string, unknown>)
      : {};
  const solveFailureSetId = Number(rawSolveFailureFallback.setId);
  return {
    id,
    origin,
    name,
    description: String(record.description || ""),
    mode,
    totalCycles: normalizeRoutineRunCount(record.totalCycles, 5),
    ignoreValue: record.ignoreValue === true,
    steps,
    totwFallback: {
      enabled: rawFallback.enabled !== false,
      setId:
        Number.isFinite(fallbackSetId) && fallbackSetId > 0
          ? fallbackSetId
          : 1017,
      runs: fallbackRuns > 0 ? fallbackRuns : 1,
    },
    solveFailureFallback: {
      enabled: rawSolveFailureFallback.enabled === true,
      setId:
        Number.isFinite(solveFailureSetId) && solveFailureSetId > 0
          ? solveFailureSetId
          : 0,
      runs: normalizeRoutineRunCount(rawSolveFailureFallback.runs, 1),
    },
    storageFallback: normalizeStorageOverflowFallback(record.storageFallback),
    fatalRecoveryEnabled: record.fatalRecoveryEnabled === true,
    fatalRecoveryMode: normalizeFatalRecoveryMode(record.fatalRecoveryMode),
    fatalRecoveryMaxReloads: normalizeFatalRecoveryMaxReloads(
      record.fatalRecoveryMaxReloads,
    ),
    ...(origin === "builtin"
      ? { builtinSnapshotVersion: Math.max(0, Math.trunc(Number(record.builtinSnapshotVersion) || 0)) }
      : {}),
  };
}

export class RoutineStore {
  private document: RoutineDocument | undefined;
  private builtinCatalog: readonly RoutineDefinition[] = builtinRoutines;
  private builtinCatalogVersion = FCX_BUILTIN_ROUTINE_SNAPSHOT_VERSION;
  private builtinCatalogRevision = 0;

  constructor(private readonly storage: StorageAdapter) {}

  list(): RoutineDefinition[] {
    const document = this.getDocument();
    const builtins = this.builtinCatalog.map((routine) =>
      clone(document.builtinOverrides[routine.id] || routine),
    );
    return [
      ...builtins,
      ...Object.values(document.custom).map((routine) => clone(routine)),
    ];
  }

  get(id: string): RoutineDefinition | undefined {
    return this.list().find((routine) => routine.id === id);
  }

  save(routine: RoutineDefinition): void {
    const normalized = normalizeRoutine(routine, routine.origin);
    if (!normalized) throw new Error("流程配置无效");
    const document = this.getDocument();
    if (normalized.origin === "builtin") {
      if (!this.builtinCatalog.some((item) => item.id === normalized.id)) {
        throw new Error("找不到对应的内置流程");
      }
      document.builtinOverrides[normalized.id] = {
        ...normalized,
        builtinSnapshotVersion: this.builtinCatalogVersion,
      };
    } else {
      document.custom[normalized.id] = normalized;
    }
    this.persist();
  }

  create(name = "新建滚卡流程"): RoutineDefinition {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      origin: "custom",
      name,
      description: "",
      mode: "round_robin",
      totalCycles: 5,
      ignoreValue: true,
      steps: [],
      totwFallback: { enabled: true, setId: 1017, runs: 1 },
      solveFailureFallback: { enabled: false, setId: 0, runs: 1 },
      storageFallback: { enabled: false, setId: 0, runs: 1 },
      fatalRecoveryEnabled: false,
      fatalRecoveryMode: "restart",
      fatalRecoveryMaxReloads: 3,
    };
  }

  deleteCustom(id: string): boolean {
    const document = this.getDocument();
    if (!(id in document.custom)) return false;
    delete document.custom[id];
    this.persist();
    return true;
  }

  resetBuiltin(id: string): boolean {
    const document = this.getDocument();
    if (!(id in document.builtinOverrides)) return false;
    delete document.builtinOverrides[id];
    this.persist();
    return true;
  }

  replaceBuiltinCatalog(
    routines: readonly RoutineDefinition[],
    catalogVersion: number,
  ): boolean {
    if (
      !Number.isSafeInteger(catalogVersion)
      || catalogVersion <= 0
      || catalogVersion < this.builtinCatalogVersion
    ) {
      return false;
    }
    const isCatalogUpgrade = catalogVersion > this.builtinCatalogVersion;
    const document = isCatalogUpgrade ? this.getDocument() : undefined;
    this.builtinCatalog = clone(routines);
    this.builtinCatalogVersion = catalogVersion;
    if (document && Object.keys(document.builtinOverrides).length > 0) {
      document.builtinOverrides = {};
      this.persist();
    }
    this.builtinCatalogRevision += 1;
    return true;
  }

  getBuiltinCatalogVersion(): number {
    return this.builtinCatalogVersion;
  }

  getBuiltinCatalogRevision(): number {
    return this.builtinCatalogRevision;
  }

  private getDocument(): RoutineDocument {
    if (this.document) return this.document;
    const raw = this.storage.getItem(ROUTINE_STORAGE_KEY);
    if (!raw) return (this.document = createDocument());
    try {
      const parsed = JSON.parse(raw) as Partial<RoutineDocument>;
      const document = createDocument();
      for (const [id, value] of Object.entries(parsed.builtinOverrides || {})) {
        const normalized = normalizeRoutine(value, "builtin");
        if (normalized && normalized.id === id) {
          document.builtinOverrides[id] = normalized;
        }
      }
      for (const [id, value] of Object.entries(parsed.custom || {})) {
        const normalized = normalizeRoutine(value, "custom");
        if (normalized && normalized.id === id) document.custom[id] = normalized;
      }
      const removedStaleBuiltinOverrides: string[] = [];
      for (const [id, routine] of Object.entries(document.builtinOverrides)) {
        if (
          Number(routine.builtinSnapshotVersion || 0)
          < this.builtinCatalogVersion
        ) {
          delete document.builtinOverrides[id];
          removedStaleBuiltinOverrides.push(id);
        }
      }
      this.document = document;
      const normalizedBuiltinOverrides = JSON.stringify(document.builtinOverrides);
      const normalizedCustom = JSON.stringify(document.custom);
      if (
        parsed.version !== 8
        || removedStaleBuiltinOverrides.length > 0
        || normalizedBuiltinOverrides !== JSON.stringify(parsed.builtinOverrides || {})
        || normalizedCustom !== JSON.stringify(parsed.custom || {})
      ) {
        this.storage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(document));
      }
      return document;
    } catch {
      return (this.document = createDocument());
    }
  }

  private persist(): void {
    this.storage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(this.getDocument()));
  }
}
