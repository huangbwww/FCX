import type { SbcConstraint } from "../../types/backend";
import type { SpecialRequirementShortage } from "../../types/routines";

export interface SpecialCandidate {
  groups?: readonly number[];
  price?: number;
  concept?: boolean;
  futggPrice?: number | null;
}

export const SPECIAL_FALLBACK_GROUP_IDS = Object.freeze([23, 83]);
export const BACKEND_MAX_CANDIDATE_COST = 50_000;

export function supportedSpecialGroupIds(
  constraint: SbcConstraint,
): number[] {
  if (
    constraint.requirementKey !== "PLAYER_RARITY_GROUP" ||
    constraint.scope === "LOWER" ||
    Number(constraint.count) <= 0
  ) {
    return [];
  }
  return constraint.eligibilityValues
    .map(Number)
    .filter((groupId) => SPECIAL_FALLBACK_GROUP_IDS.includes(groupId));
}

export function hasSupportedSpecialRequirement(
  constraints: readonly SbcConstraint[],
): boolean {
  return constraints.some(
    (constraint) => supportedSpecialGroupIds(constraint).length > 0,
  );
}

export function detectTotwShortage(
  constraints: readonly SbcConstraint[],
  candidates: readonly SpecialCandidate[],
  challengeId: number,
): SpecialRequirementShortage | undefined {
  for (const constraint of constraints) {
    const groupIds = supportedSpecialGroupIds(constraint);
    if (!groupIds.length) continue;
    const required = Math.max(0, Number(constraint.count) || 0);
    const available = candidates.filter((candidate) => {
      const price = Number(candidate.price);
      if (!Number.isFinite(price) || price > BACKEND_MAX_CANDIDATE_COST) return false;
      if (
        candidate.concept === true &&
        (candidate.futggPrice === null || !Number.isFinite(Number(candidate.futggPrice)))
      ) return false;
      return candidate.groups?.map(Number).some((group) => groupIds.includes(group));
    }).length;
    if (available < required) {
      return { groupIds, required, available, challengeId };
    }
  }
  return undefined;
}
