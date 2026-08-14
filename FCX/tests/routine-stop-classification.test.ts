import { describe, expect, it } from "vitest";
import {
  classifyRoutineExecutionStop,
  isRoutineStepFatal,
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
});
