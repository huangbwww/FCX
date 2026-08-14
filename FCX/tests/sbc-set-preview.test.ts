import { describe, expect, it } from "vitest";
import { executeSbcSetPlan } from "../src/domain/sbc/set-execution";

describe("whole-set preview replanning", () => {
  it("does not submit until the preview confirms", async () => {
    const submitted: number[] = [];
    const result = await executeSbcSetPlan({
      setId: 1,
      setName: "整组",
      challengeIds: [11, 12],
      planChallenge: async (id) => ({ challengeId: id, name: String(id), playerItemIds: [id], payload: {} }),
      reviewPlan: async () => ({ action: "cancel" }),
      submitChallenge: async (planned) => {
        submitted.push(planned.challengeId);
        return { challengeId: planned.challengeId, submitted: true };
      },
    });
    expect(submitted).toEqual([]);
    expect(result.stoppedReason).toContain("取消");
  });

  it("replans all challenges with temporary instance exclusions", async () => {
    const exclusions: number[][] = [];
    let reviewCount = 0;
    const result = await executeSbcSetPlan({
      setId: 1,
      setName: "整组",
      challengeIds: [11, 12],
      planChallenge: async (id, excluded) => {
        exclusions.push([...excluded].sort((a, b) => a - b));
        return { challengeId: id, name: String(id), playerItemIds: [id], payload: {} };
      },
      reviewPlan: async () => {
        reviewCount += 1;
        return reviewCount === 1
          ? { action: "replan", excludedItemIds: new Set([99]) }
          : { action: "submit" };
      },
      submitChallenge: async (planned) => ({ challengeId: planned.challengeId, submitted: true }),
    });
    expect(result.submitted).toHaveLength(2);
    expect(exclusions).toEqual([[], [11], [99], [11, 99]]);
  });

  it("keeps the last valid preview when a temporary exclusion makes replanning impossible", async () => {
    let reviewCount = 0;
    const submitted: number[] = [];
    const result = await executeSbcSetPlan({
      setId: 1,
      setName: "整组",
      challengeIds: [11],
      planChallenge: async (id, excluded) => {
        if (excluded.has(99)) throw new Error("新方案无解");
        return { challengeId: id, name: String(id), playerItemIds: [id], payload: {} };
      },
      reviewPlan: async () => {
        reviewCount += 1;
        return reviewCount === 1
          ? { action: "replan", excludedItemIds: new Set([99]) }
          : { action: "submit" };
      },
      submitChallenge: async (planned) => {
        submitted.push(planned.challengeId);
        return { challengeId: planned.challengeId, submitted: true };
      },
    });
    expect(result.stoppedReason).toBeUndefined();
    expect(submitted).toEqual([11]);
    expect(reviewCount).toBe(2);
  });
});
