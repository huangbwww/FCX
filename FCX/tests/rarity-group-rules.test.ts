import { describe, expect, it } from "vitest";
import { applyFcxRarityGroupPolicy, requiredRarityGroupIds } from "../src/domain/sbc/rarity-group-rules";

describe("FCX rarity-group protection", () => {
  const constraints = [
    { requirementKey: "PLAYER_RARITY_GROUP", scope: "GREATER", count: 1, eligibilityValues: [23, 83] },
    { requirementKey: "TEAM_RATING", scope: "GREATER", count: 84, eligibilityValues: [84] },
  ];

  it("limits only the required group to the required amount by default", () => {
    const result = applyFcxRarityGroupPolicy(constraints, false);
    expect(result[0]?.scope).toBe("EXACT");
    expect(result[1]?.scope).toBe("GREATER");
    expect(requiredRarityGroupIds(result)).toEqual([23, 83]);
  });

  it("keeps EA minimum semantics when extra required-group players are allowed", () => {
    expect(applyFcxRarityGroupPolicy(constraints, true)[0]?.scope).toBe("GREATER");
  });

  it("does not modify lower or zero-count requirements", () => {
    const result = applyFcxRarityGroupPolicy([
      { requirementKey: "PLAYER_RARITY_GROUP", scope: "LOWER", count: 1, eligibilityValues: [23] },
      { requirementKey: "PLAYER_RARITY_GROUP", scope: "GREATER", count: 0, eligibilityValues: [83] },
    ], false);
    expect(result.map((item) => item.scope)).toEqual(["LOWER", "GREATER"]);
    expect(requiredRarityGroupIds(result)).toEqual([]);
  });
});
