import type { SbcConstraint } from "../../types/backend";

export const MINIMUM_RATING_FIRST_CAPABILITY = 2;

export function requiresMinimumRatingFirst(
  constraints: readonly Pick<SbcConstraint, "requirementKey" | "scope">[],
): boolean {
  return constraints.some(
    (constraint) =>
      constraint.requirementKey === "TEAM_RATING" &&
      constraint.scope !== "LOWER",
  );
}

export function supportsMinimumRatingFirst(health: unknown): boolean {
  if (!health || typeof health !== "object") return false;
  const solverFeatures = (health as Record<string, unknown>).solver_features;
  if (!solverFeatures || typeof solverFeatures !== "object") return false;
  return (
    Number(
      (solverFeatures as Record<string, unknown>).minimum_rating_first,
    ) >= MINIMUM_RATING_FIRST_CAPABILITY
  );
}
