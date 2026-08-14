import { describe, expect, it } from "vitest";
import { executeSbcSetPlan } from "../src/domain/sbc/set-execution";

describe("FCX SBC set execution", () => {
  it("plans every challenge before submitting and reserves item instances", async () => {
    const events: string[] = [];
    const exclusions: number[][] = [];
    const result = await executeSbcSetPlan({
      setId: 12,
      setName: "整组测试",
      challengeIds: [101, 102],
      planChallenge: async (challengeId, excluded) => {
        events.push(`plan:${challengeId}`);
        exclusions.push([...excluded]);
        return {
          challengeId,
          name: `挑战 ${challengeId}`,
          playerItemIds: challengeId === 101 ? [1, 2] : [3, 4],
          payload: { challengeId },
        };
      },
      submitChallenge: async (planned) => {
        events.push(`submit:${planned.challengeId}`);
        return { challengeId: planned.challengeId, submitted: true };
      },
    });

    expect(events).toEqual(["plan:101", "plan:102", "submit:101", "submit:102"]);
    expect(exclusions).toEqual([[], [1, 2]]);
    expect(result.submitted).toHaveLength(2);
    expect(result.stoppedReason).toBeUndefined();
  });

  it("submits nothing when any challenge cannot be planned", async () => {
    const submitted: number[] = [];
    const result = await executeSbcSetPlan({
      setId: 12,
      setName: "整组测试",
      challengeIds: [101, 102],
      planChallenge: async (challengeId) => {
        if (challengeId === 102) throw new Error("第二个挑战无解");
        return {
          challengeId,
          name: "第一个挑战",
          playerItemIds: [1],
          payload: null,
        };
      },
      submitChallenge: async (planned) => {
        submitted.push(planned.challengeId);
        return { challengeId: planned.challengeId, submitted: true };
      },
    });

    expect(submitted).toEqual([]);
    expect(result.stoppedReason).toBe("第二个挑战无解");
  });

  it("stops sequential submission after the first failure", async () => {
    const submitted: number[] = [];
    const result = await executeSbcSetPlan({
      setId: 12,
      setName: "整组测试",
      challengeIds: [101, 102, 103],
      planChallenge: async (challengeId) => ({
        challengeId,
        name: `挑战 ${challengeId}`,
        playerItemIds: [challengeId],
        payload: null,
      }),
      submitChallenge: async (planned) => {
        submitted.push(planned.challengeId);
        return {
          challengeId: planned.challengeId,
          submitted: planned.challengeId !== 102,
          ...(planned.challengeId === 102 ? { reason: "EA提交失败" } : {}),
        };
      },
    });

    expect(submitted).toEqual([101, 102]);
    expect(result.stoppedReason).toBe("EA提交失败");
  });
});
