import type { EaSbcSet } from "../../types/game";

export type SbcRepeatability =
  | { kind: "unlimited"; remaining: typeof Infinity }
  | { kind: "finite"; remaining: number }
  | { kind: "unknown"; remaining: null };

export function getSbcRepeatability(set: EaSbcSet): SbcRepeatability {
  const mode = String(set.repeatabilityMode || "").toUpperCase();
  if (["UNLIMITED", "REPEATABLE", "INFINITE"].includes(mode)) {
    return { kind: "unlimited", remaining: Infinity };
  }
  if (mode === "NON_REPEATABLE") {
    return { kind: "finite", remaining: set.timesCompleted > 0 ? 0 : 1 };
  }
  try {
    const remaining = set.getRepeatsRemaining?.();
    if (
      typeof remaining === "number" &&
      Number.isFinite(remaining) &&
      remaining >= 0
    ) {
      return { kind: "finite", remaining: Math.floor(remaining) };
    }
  } catch {
    // EA entities occasionally expose the method before the set is fully loaded.
  }
  return { kind: "unknown", remaining: null };
}

export function effectiveRequestedRuns(
  requestedRuns: number,
  repeatability: SbcRepeatability,
): number {
  if (repeatability.kind === "finite") {
    if (requestedRuns === -1) return repeatability.remaining;
    return Math.min(Math.max(1, requestedRuns), repeatability.remaining);
  }
  if (repeatability.kind === "unknown") return 1;
  return requestedRuns === -1 ? -1 : Math.max(1, requestedRuns);
}

export function shouldContinueSbcTask(context: {
  requestedRuns: number;
  completedRuns: number;
}): boolean {
  return (
    context.requestedRuns === -1 ||
    context.completedRuns < context.requestedRuns
  );
}
