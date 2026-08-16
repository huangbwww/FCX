import { describe, expect, it } from "vitest";
import {
  classifyRoutineExecutionStop,
  isSolveFailureFallbackExhausted,
  isRoutineStepFatal,
  resolveRoutineRecoveryFailure,
  shouldTriggerSolveFailureFallback,
} from "../src/domain/routines/stop-classification";

describe("routine stop classification", () => {
  it("treats an exhausted or infeasible step as local to that step", () => {
    expect(classifyRoutineExecutionStop({
      reason: "当前没有可执行的下一轮挑战，本步骤已结束。",
      completedRuns: 3,
    })).toBe("exhausted");
    expect(classifyRoutineExecutionStop({
      reason: "该SBC当前没有可执行的未完成挑战。",
    })).toBe("exhausted");
    expect(classifyRoutineExecutionStop({
      reason: "无法在 83.00–83.80 内完成该 SBC。",
    })).toBe("no_solution");
    expect(classifyRoutineExecutionStop({
      reason: "没有找到可行方案",
    })).toBe("no_solution");
    expect(classifyRoutineExecutionStop({
      reason: "未能在求解时间内证明最低球队评分，请提高最大求解时间。",
    })).toBe("no_solution");
    expect(classifyRoutineExecutionStop({ specialShortage: true })).toBe(
      "special_shortage",
    );
    expect(isRoutineStepFatal("exhausted")).toBe(false);
    expect(isRoutineStepFatal("no_solution")).toBe(false);
    expect(isRoutineStepFatal("special_shortage")).toBe(false);
  });

  it("still terminates the whole routine for unsafe failures", () => {
    expect(classifyRoutineExecutionStop({ reason: "SBC提交失败" })).toBe(
      "submit_failed",
    );
    expect(classifyRoutineExecutionStop({ reason: "已达到每小时提交提醒值" })).toBe(
      "done",
    );
    expect(isRoutineStepFatal("submit_failed")).toBe(true);
    expect(isRoutineStepFatal("pack_failed")).toBe(true);
    expect(isRoutineStepFatal("throttled")).toBe(true);
  });

  it("does not let an auxiliary invalid marker turn no-solution into page recovery", () => {
    expect(resolveRoutineRecoveryFailure({
      results: [{
        stepId: "target",
        stepKind: "sbc",
        setId: 1017,
        completedRuns: 0,
        rewardPackIds: [],
        stopKind: "no_solution",
        reason: "无法在84.00–84.80内完成该SBC。",
      }],
      contextStopKind: "invalid",
      contextStopReason: "无法在84.00–84.80内完成该SBC。",
      scheduleStoppedReason: "本轮所有步骤均无进展，流程已提前结束。",
    })).toBeUndefined();
    expect(resolveRoutineRecoveryFailure({
      results: [{
        stepId: "target",
        stepKind: "sbc",
        setId: 1017,
        completedRuns: 0,
        rewardPackIds: [],
        stopKind: "submit_failed",
        reason: "SBC提交失败（状态403）。",
      }],
    })).toMatchObject({
      stopKind: "submit_failed",
      reason: "SBC提交失败（状态403）。",
    });
  });

  it("triggers solve-failure compensation only for a no-solution result", () => {
    expect(shouldTriggerSolveFailureFallback(true, "no_solution")).toBe(true);
    expect(shouldTriggerSolveFailureFallback(false, "no_solution")).toBe(false);
    for (const stopKind of [
      "special_shortage",
      "exhausted",
      "unavailable",
      "throttled",
      "submit_failed",
      "pack_failed",
      "cancelled",
    ] as const) {
      expect(shouldTriggerSolveFailureFallback(true, stopKind)).toBe(false);
    }
    expect(isSolveFailureFallbackExhausted("no_solution")).toBe(true);
    expect(isSolveFailureFallbackExhausted("exhausted")).toBe(true);
    expect(isSolveFailureFallbackExhausted("unavailable")).toBe(true);
    expect(isSolveFailureFallbackExhausted("submit_failed")).toBe(false);
  });
});
