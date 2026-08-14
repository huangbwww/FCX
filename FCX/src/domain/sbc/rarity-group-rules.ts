export interface SbcConstraintLike {
  requirementKey?: string;
  scope?: string;
  count?: number;
  eligibilityValues?: unknown[];
  [key: string]: unknown;
}

const isPositiveRarityGroup = (constraint: SbcConstraintLike): boolean =>
  constraint.requirementKey === "PLAYER_RARITY_GROUP" &&
  constraint.scope !== "LOWER" &&
  Number(constraint.count || 0) > 0 &&
  Array.isArray(constraint.eligibilityValues) &&
  constraint.eligibilityValues.some((value) => Number.isFinite(Number(value)));

export const requiredRarityGroupIds = (constraints: readonly SbcConstraintLike[]): number[] =>
  [...new Set(constraints.filter(isPositiveRarityGroup).flatMap((constraint) =>
    (constraint.eligibilityValues || []).map(Number).filter(Number.isFinite)
  ))];

export function applyFcxRarityGroupPolicy(
  constraints: readonly SbcConstraintLike[],
  allowExtraRequiredRarityGroupPlayers: boolean,
): SbcConstraintLike[] {
  return constraints.map((constraint) => {
    const copy: SbcConstraintLike = { ...constraint };
    if (Array.isArray(constraint.eligibilityValues)) {
      copy.eligibilityValues = [...constraint.eligibilityValues];
    }
    if (
      !allowExtraRequiredRarityGroupPlayers &&
      isPositiveRarityGroup(copy) &&
      copy.scope === "GREATER"
    ) {
      copy.scope = "EXACT";
    }
    return copy;
  });
}
