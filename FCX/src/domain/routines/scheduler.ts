import type {
  RoutineDefinition,
  RoutineStep,
  RoutineStepResult,
} from "../../types/routines";
import { isRoutineStepFatal } from "./stop-classification";

export interface RoutineSchedulerHooks {
  isCancelled(): boolean;
  runStep(step: RoutineStep, requestedRuns: number): Promise<RoutineStepResult>;
  openRewards(result: RoutineStepResult): Promise<boolean>;
  onCycleStart?(cycle: number, totalCycles: number): void;
}

export interface RoutineScheduleResult {
  results: RoutineStepResult[];
  notices: string[];
  stoppedReason?: string;
}

const nonFatalNotice = (result: RoutineStepResult): string | undefined => {
  if (!result.reason) return undefined;
  return ["special_shortage", "no_solution", "unavailable", "exhausted"].includes(
    result.stopKind,
  )
    ? result.reason
    : undefined;
};

async function finishStep(
  result: RoutineStepResult,
  hooks: RoutineSchedulerHooks,
): Promise<string | undefined> {
  if (hooks.isCancelled()) return "用户结束了任务";
  if (
    result.stepKind === "sbc" &&
    result.completedRuns > 0 &&
    (result.rewardPackIds.length > 0 || (result.rewardPlayerPickIds?.length || 0) > 0)
  ) {
    const opened = await hooks.openRewards(result);
    if (!opened) return "奖励卡包处理失败";
  }
  return isRoutineStepFatal(result.stopKind)
    ? result.reason || result.stopKind
    : undefined;
}

export async function runRoutineSchedule(
  routine: RoutineDefinition,
  hooks: RoutineSchedulerHooks,
): Promise<RoutineScheduleResult> {
  const results: RoutineStepResult[] = [];
  const notices: string[] = [];
  const recordNotice = (result: RoutineStepResult) => {
    const notice = nonFatalNotice(result);
    if (notice && !notices.includes(notice)) notices.push(notice);
  };

  if (routine.mode === "exhaust_step") {
    for (const step of routine.steps) {
      if (hooks.isCancelled()) return { results, notices, stoppedReason: "用户结束了任务" };
      const result = await hooks.runStep(step, step.runs);
      results.push(result);
      recordNotice(result);
      const stoppedReason = await finishStep(result, hooks);
      if (stoppedReason) return { results, notices, stoppedReason };
    }
    return { results, notices };
  }

  const totalCycles = routine.totalCycles === -1 ? -1 : Math.max(1, routine.totalCycles || 5);
  let cycle = 0;
  while (!hooks.isCancelled() && (totalCycles === -1 || cycle < totalCycles)) {
    hooks.onCycleStart?.(cycle, totalCycles);
    let progressThisCycle = 0;
    for (const step of routine.steps) {
      if (hooks.isCancelled()) return { results, notices, stoppedReason: "用户结束了任务" };
      const result = await hooks.runStep(step, step.runs);
      results.push(result);
      recordNotice(result);
      progressThisCycle += Number(
        result.progressUnits ?? result.completedRuns + (result.packsOpened || 0),
      );
      const stoppedReason = await finishStep(result, hooks);
      if (stoppedReason) return { results, notices, stoppedReason };
    }
    if (progressThisCycle === 0) {
      return {
        results,
        notices,
        stoppedReason: "本轮所有步骤均无进展，流程已提前结束。",
      };
    }
    cycle += 1;
  }
  return hooks.isCancelled()
    ? { results, notices, stoppedReason: "用户结束了任务" }
    : { results, notices };
}
