import type {
  RoutineDefinition,
  RoutineStep,
  RoutineStepResult,
  RoutineRecoveryCursor,
} from "../../types/routines";
import { isRoutineStepFatal } from "./stop-classification";

export interface RoutineSchedulerHooks {
  isCancelled(): boolean;
  runStep(step: RoutineStep, requestedRuns: number): Promise<RoutineStepResult>;
  openRewards(result: RoutineStepResult): Promise<boolean>;
  onCycleStart?(cycle: number, totalCycles: number): void;
  onCursorChange?(cursor: RoutineRecoveryCursor): void;
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
  startCursor: RoutineRecoveryCursor = { cycle: 0, stepIndex: 0, completedInStep: 0 },
): Promise<RoutineScheduleResult> {
  const results: RoutineStepResult[] = [];
  const notices: string[] = [];
  const recordNotice = (result: RoutineStepResult) => {
    const notice = nonFatalNotice(result);
    if (notice && !notices.includes(notice)) notices.push(notice);
  };

  if (routine.mode === "exhaust_step") {
    for (let index = Math.max(0, startCursor.stepIndex); index < routine.steps.length; index += 1) {
      const step = routine.steps[index];
      if (!step) continue;
      if (hooks.isCancelled()) return { results, notices, stoppedReason: "用户结束了任务" };
      const completedBefore = index === startCursor.stepIndex
        ? Math.max(0, startCursor.completedInStep)
        : 0;
      const requestedRuns = step.runs === -1 ? -1 : Math.max(0, step.runs - completedBefore);
      if (requestedRuns === 0) {
        hooks.onCursorChange?.({ cycle: 0, stepIndex: index + 1, completedInStep: 0 });
        continue;
      }
      hooks.onCursorChange?.({ cycle: 0, stepIndex: index, completedInStep: completedBefore });
      const result = await hooks.runStep(step, requestedRuns);
      results.push(result);
      recordNotice(result);
      hooks.onCursorChange?.({
        cycle: 0,
        stepIndex: index,
        completedInStep:
          completedBefore + Number(result.progressUnits ?? result.completedRuns + (result.packsOpened || 0)),
      });
      const stoppedReason = await finishStep(result, hooks);
      if (stoppedReason) return { results, notices, stoppedReason };
      hooks.onCursorChange?.({ cycle: 0, stepIndex: index + 1, completedInStep: 0 });
    }
    return { results, notices };
  }

  const totalCycles = routine.totalCycles === -1 ? -1 : Math.max(1, routine.totalCycles || 5);
  let cycle = Math.max(0, startCursor.cycle);
  while (!hooks.isCancelled() && (totalCycles === -1 || cycle < totalCycles)) {
    hooks.onCycleStart?.(cycle, totalCycles);
    let progressThisCycle = 0;
    const firstStepIndex = cycle === startCursor.cycle ? Math.max(0, startCursor.stepIndex) : 0;
    for (let index = firstStepIndex; index < routine.steps.length; index += 1) {
      const step = routine.steps[index];
      if (!step) continue;
      if (hooks.isCancelled()) return { results, notices, stoppedReason: "用户结束了任务" };
      const completedBefore = cycle === startCursor.cycle && index === startCursor.stepIndex
        ? Math.max(0, startCursor.completedInStep)
        : 0;
      const requestedRuns = step.runs === -1 ? -1 : Math.max(0, step.runs - completedBefore);
      if (requestedRuns === 0) {
        hooks.onCursorChange?.({ cycle, stepIndex: index + 1, completedInStep: 0 });
        continue;
      }
      hooks.onCursorChange?.({ cycle, stepIndex: index, completedInStep: completedBefore });
      const result = await hooks.runStep(step, requestedRuns);
      results.push(result);
      recordNotice(result);
      const progress = Number(
        result.progressUnits ?? result.completedRuns + (result.packsOpened || 0),
      );
      progressThisCycle += progress;
      hooks.onCursorChange?.({
        cycle,
        stepIndex: index,
        completedInStep: completedBefore + progress,
      });
      const stoppedReason = await finishStep(result, hooks);
      if (stoppedReason) return { results, notices, stoppedReason };
      hooks.onCursorChange?.({ cycle, stepIndex: index + 1, completedInStep: 0 });
    }
    if (progressThisCycle === 0) {
      return {
        results,
        notices,
        stoppedReason: "本轮所有步骤均无进展，流程已提前结束。",
      };
    }
    cycle += 1;
    hooks.onCursorChange?.({ cycle, stepIndex: 0, completedInStep: 0 });
  }
  return hooks.isCancelled()
    ? { results, notices, stoppedReason: "用户结束了任务" }
    : { results, notices };
}
