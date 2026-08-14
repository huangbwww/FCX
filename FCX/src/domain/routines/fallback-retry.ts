export interface SpecialFallbackAttemptResult {
  completedRuns?: number;
  specialShortage?: unknown;
}

export interface SpecialFallbackProgress {
  cycle: number;
  completedRuns: number;
  remainingRuns: number;
}

export interface SpecialFallbackLoopResult<T> {
  result: T;
  totalCompletedRuns: number;
  replenishmentCycles: number;
  attemptCount: number;
  replenishmentFailed: boolean;
  stoppedForNoProgress: boolean;
}

function remainingRuns(requestedRuns: number, completedRuns: number): number {
  return requestedRuns === -1
    ? -1
    : Math.max(0, requestedRuns - completedRuns);
}

export async function runWithSpecialFallbackLoop<
  T extends SpecialFallbackAttemptResult,
>(options: {
  requestedRuns: number;
  attempt(runs: number): Promise<T>;
  replenish(progress: SpecialFallbackProgress): Promise<boolean>;
}): Promise<SpecialFallbackLoopResult<T>> {
  let totalCompletedRuns = 0;
  let replenishmentCycles = 0;
  let attemptCount = 0;
  let replenishedBeforeAttempt = false;

  while (true) {
    const remaining = remainingRuns(options.requestedRuns, totalCompletedRuns);
    const result = await options.attempt(remaining);
    attemptCount += 1;
    const completedThisAttempt = Math.max(
      0,
      Number(result.completedRuns || 0),
    );
    totalCompletedRuns += completedThisAttempt;
    const nextRemaining = remainingRuns(
      options.requestedRuns,
      totalCompletedRuns,
    );

    if (!result.specialShortage || nextRemaining === 0) {
      return {
        result,
        totalCompletedRuns,
        replenishmentCycles,
        attemptCount,
        replenishmentFailed: false,
        stoppedForNoProgress: false,
      };
    }

    if (replenishedBeforeAttempt && completedThisAttempt === 0) {
      return {
        result,
        totalCompletedRuns,
        replenishmentCycles,
        attemptCount,
        replenishmentFailed: false,
        stoppedForNoProgress: true,
      };
    }

    const replenished = await options.replenish({
      cycle: replenishmentCycles + 1,
      completedRuns: totalCompletedRuns,
      remainingRuns: nextRemaining,
    });
    if (!replenished) {
      return {
        result,
        totalCompletedRuns,
        replenishmentCycles,
        attemptCount,
        replenishmentFailed: true,
        stoppedForNoProgress: false,
      };
    }
    replenishmentCycles += 1;
    replenishedBeforeAttempt = true;
  }
}
