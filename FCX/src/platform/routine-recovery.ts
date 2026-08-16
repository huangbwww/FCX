import { areEaWebAppServicesReady } from "./ea-readiness";

export const ROUTINE_RECOVERY_COUNTDOWN_POLL_MS = 100;
export const ROUTINE_RECOVERY_READY_POLL_MS = 250;
export const ROUTINE_RECOVERY_HOME_STABLE_MS = 500;

export type RoutineRecoveryReadinessReason =
  | "document"
  | "services"
  | "user"
  | "store"
  | "persona"
  | "persona_mismatch"
  | "home"
  | "loading"
  | "ready";

export interface RoutineRecoveryReadinessInput {
  documentReadyState: string;
  services: unknown;
  repositories: unknown;
  personaId?: string;
  expectedPersonaId: string;
  homeReady: boolean;
  initialLoaderVisible: boolean;
}

export interface RoutineRecoveryReadiness {
  ready: boolean;
  terminal: boolean;
  reason: RoutineRecoveryReadinessReason;
}

export const delayMilliseconds = (
  delayMs: number,
  schedule: (callback: () => void, delay: number) => unknown = setTimeout,
): Promise<void> => new Promise((resolve) => {
  schedule(resolve, Math.max(0, Math.trunc(Number(delayMs) || 0)));
});

export async function waitForRoutineRecoveryCountdown(
  delayMs: number,
  isCancelled: () => boolean,
  sleep: (delay: number) => Promise<void> = delayMilliseconds,
  pollMs = ROUTINE_RECOVERY_COUNTDOWN_POLL_MS,
): Promise<boolean> {
  let remaining = Math.max(0, Math.trunc(Number(delayMs) || 0));
  const interval = Math.max(1, Math.trunc(Number(pollMs) || 1));
  while (remaining > 0) {
    if (isCancelled()) return false;
    const slice = Math.min(interval, remaining);
    await sleep(slice);
    remaining -= slice;
  }
  return !isCancelled();
}

export function evaluateRoutineRecoveryReadiness(
  input: RoutineRecoveryReadinessInput,
): RoutineRecoveryReadiness {
  if (input.documentReadyState === "loading") {
    return { ready: false, terminal: false, reason: "document" };
  }
  if (!areEaWebAppServicesReady(input.services)) {
    return { ready: false, terminal: false, reason: "services" };
  }
  const serviceBag = input.services as {
    User?: { getUser?: () => unknown };
  };
  if (typeof serviceBag.User?.getUser !== "function") {
    return { ready: false, terminal: false, reason: "user" };
  }
  const repositoryBag = input.repositories as { Store?: unknown } | undefined;
  if (!repositoryBag?.Store) {
    return { ready: false, terminal: false, reason: "store" };
  }
  if (!input.personaId) {
    return { ready: false, terminal: false, reason: "persona" };
  }
  if (String(input.personaId) !== String(input.expectedPersonaId)) {
    return { ready: false, terminal: true, reason: "persona_mismatch" };
  }
  if (!input.homeReady) {
    return { ready: false, terminal: false, reason: "home" };
  }
  if (input.initialLoaderVisible) {
    return { ready: false, terminal: false, reason: "loading" };
  }
  return { ready: true, terminal: false, reason: "ready" };
}
