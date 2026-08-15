import type { RoutineStopKind } from "../../types/routines";

export interface RoutineStopClassificationInput {
  reason?: unknown;
  completedRuns?: number;
  specialShortage?: boolean;
  cancelled?: boolean;
}

export function classifyRoutineExecutionStop(
  input: RoutineStopClassificationInput,
): RoutineStopKind {
  const reason = String(input.reason || "");
  const completedRuns = Number(input.completedRuns || 0);
  if (input.cancelled || /用户结束|取消/.test(reason)) return "cancelled";
  if (/提交提醒值|仅记录.*不限制/.test(reason)) return "done";
  if (/429|限流|请求过于频繁|频繁操作/.test(reason)) return "throttled";
  if (input.specialShortage) return "special_shortage";
  if (
    /没有可执行|可重复次数.*耗尽|次数已经耗尽|不再可重复|没有可执行的下一轮挑战|没有可执行的未完成挑战/.test(
      reason,
    )
  ) {
    return "exhausted";
  }
  if (
    /无解|不可行|INFEASIBLE|(?:没有找到|找不到)可行方案|无法生成|无法在.+(?:完成|范围)|最低评分证明超时|未能.*证明最低球队评分/.test(
      reason,
    )
  ) {
    return "no_solution";
  }
  if (completedRuns > 0 && !reason) return "done";
  return reason ? "submit_failed" : "done";
}

export function isRoutineStepFatal(stopKind: RoutineStopKind): boolean {
  return [
    "cancelled",
    "limit",
    "throttled",
    "submit_failed",
    "pack_failed",
    "invalid",
  ].includes(stopKind);
}

export function shouldTriggerSolveFailureFallback(
  enabled: boolean,
  stopKind: RoutineStopKind,
): boolean {
  return enabled && stopKind === "no_solution";
}

export function isSolveFailureFallbackExhausted(
  stopKind: RoutineStopKind,
): boolean {
  return ["no_solution", "exhausted", "unavailable"].includes(stopKind);
}
