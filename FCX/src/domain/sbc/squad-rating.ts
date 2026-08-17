import type {
  RatingOptimizationDiagnostics,
  SbcConstraint,
  SolverPlayerResult,
} from "../../types/backend";
import { normalizeSquadRatingOvershoot } from "../../config/fcx-sbc-recommendations";

export const STRICT_SQUAD_RATING_OVERSHOOT = 1.8;

export interface StrictSquadRatingWindow {
  minimum: number;
  maximum: number;
}

export interface SquadRatingValidation {
  ok: boolean;
  rating: number | null;
  window: StrictSquadRatingWindow | null;
}

export interface MinimumRatingProofValidation {
  ok: boolean;
  reason: string | null;
}

const roundFractionHalfUp = (numerator: number, denominator: number): number =>
  Math.floor((2 * numerator + denominator) / (2 * denominator));

export function calculateEaSquadRating(
  ratings: readonly number[],
): number | null {
  if (!ratings.length || ratings.some((rating) => !Number.isInteger(rating))) {
    return null;
  }

  const squadSize = ratings.length;
  const totalRating = ratings.reduce((total, rating) => total + rating, 0);
  const excessNumerator = ratings.reduce(
    (total, rating) => total + Math.max(rating * squadSize - totalRating, 0),
    0,
  );
  const adjustedNumerator = totalRating * squadSize + excessNumerator;
  const roundedAdjustedTotal = roundFractionHalfUp(
    adjustedNumerator,
    squadSize,
  );
  const ratingHundredths = roundFractionHalfUp(
    roundedAdjustedTotal * 100,
    squadSize,
  );
  return ratingHundredths / 100;
}

export function resolveStrictSquadRatingWindow(
  constraints: readonly SbcConstraint[],
  overshoot: number = STRICT_SQUAD_RATING_OVERSHOOT,
): StrictSquadRatingWindow | null {
  const targets = constraints
    .filter(
      (constraint) =>
        constraint.requirementKey === "TEAM_RATING" &&
        constraint.scope !== "LOWER",
    )
    .map((constraint) => Number(constraint.eligibilityValues[0]))
    .filter(Number.isFinite);
  if (!targets.length) return null;

  const minimum = Math.max(...targets);
  const normalizedOvershoot = normalizeSquadRatingOvershoot(overshoot);
  return {
    minimum,
    maximum: Math.round((minimum + normalizedOvershoot) * 100) / 100,
  };
}

export function isSquadRatingInWindow(
  rating: number,
  window: StrictSquadRatingWindow,
): boolean {
  const hundredths = Math.round(rating * 100);
  return (
    hundredths >= Math.round(window.minimum * 100) &&
    hundredths <= Math.round(window.maximum * 100)
  );
}

export function validateSolverSquadRating(
  players: readonly Pick<SolverPlayerResult, "rating">[],
  constraints: readonly SbcConstraint[],
  overshoot: number = STRICT_SQUAD_RATING_OVERSHOOT,
): SquadRatingValidation {
  const window = resolveStrictSquadRatingWindow(constraints, overshoot);
  if (!window) return { ok: true, rating: null, window: null };

  const rating = calculateEaSquadRating(players.map((player) => Number(player.rating)));
  return {
    ok: rating !== null && isSquadRatingInWindow(rating, window),
    rating,
    window,
  };
}

export function formatSquadRatingWindow(
  window: StrictSquadRatingWindow,
): string {
  return `${window.minimum.toFixed(2)}–${window.maximum.toFixed(2)}`;
}

export function validateMinimumRatingProof(
  diagnostics: RatingOptimizationDiagnostics | null,
  actualRating: number,
  window: StrictSquadRatingWindow,
): MinimumRatingProofValidation {
  if (!diagnostics || diagnostics.rating_optimal !== true) {
    return {
      ok: false,
      reason: "后端未证明当前方案是最低球队评分，本次未应用或提交阵容。",
    };
  }
  if (!Number.isFinite(diagnostics.minimum_rating)) {
    return {
      ok: false,
      reason: "后端未返回有效的最低球队评分，本次未应用或提交阵容。",
    };
  }

  const expectedMinimum = Math.round(window.minimum * 100);
  const expectedMaximum = Math.round(window.maximum * 100);
  const reportedMinimum = Math.round(Number(diagnostics.window_min) * 100);
  const reportedMaximum = Math.round(Number(diagnostics.window_max) * 100);
  const actualHundredths = Math.round(actualRating * 100);
  const minimumHundredths = Math.round(Number(diagnostics.minimum_rating) * 100);
  if (
    expectedMinimum !== reportedMinimum ||
    expectedMaximum !== reportedMaximum ||
    actualHundredths !== minimumHundredths
  ) {
    return {
      ok: false,
      reason: "前后端球队评分校验不一致，本次未应用或提交阵容。",
    };
  }
  return { ok: true, reason: null };
}
