import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RuntimeState } from "../src/state/runtime-state";

const root = resolve(import.meta.dirname, "..");
const readSource = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const solverUi = readSource("src/ui/solver-runtime.ts");
const sbcRuntime = readSource("src/domain/sbc/runtime.ts");
const packRuntime = readSource("src/domain/packs/runtime.ts");
const routineRuntime = readSource("src/domain/routines/runtime.ts");
const hooksRuntime = readSource("src/hooks/items-runtime.ts");

describe("FCX cooperative cancellation", () => {
  it("starts with one global cancel flag and no legacy cancellation booleans", () => {
    const state = new RuntimeState();
    expect(state.cancelRequested).toBe(false);
    expect(state.taskOverlayHolds).toBe(0);
    expect(state.taskShieldOwned).toBe(false);
    expect(state.taskShieldUsesFallback).toBe(false);
    expect(state).not.toHaveProperty("createSbc");
    expect(state).not.toHaveProperty("packRunCancelled");
  });

  it("holds the task shield until the outer routine releases it", () => {
    expect(solverUi).toContain("const holdTaskOverlay");
    expect(solverUi).toContain("const releaseTaskOverlay");
    expect(solverUi).toContain("fcxTaskShield.acquire()");
    expect(solverUi).toContain("fcxTaskShield.release()");
    expect(solverUi).toContain("if (runtimeState.taskOverlayHolds > 0)");
    expect(solverUi).not.toContain("MutationObserver");
    expect(routineRuntime.indexOf("holdTaskOverlay()")).toBeLessThan(
      routineRuntime.indexOf("await runRoutineSchedule("),
    );
    expect(routineRuntime.indexOf("releaseTaskOverlay()")).toBeGreaterThan(
      routineRuntime.indexOf("runtimeState.activeRoutineExecution = undefined"),
    );
  });

  it("owns the shield for standalone SBC and pack tasks without nesting internal work", () => {
    expect(sbcRuntime.match(/if \(isNewExecution\) holdTaskOverlay\(\)/g)).toHaveLength(2);
    expect(sbcRuntime.match(/if \(isNewExecution\) releaseTaskOverlay\(\)/g)).toHaveLength(2);
    expect(packRuntime).toContain(
      "const ownsTaskOverlay = taskOptions.internal !== true",
    );
    expect(packRuntime).toContain("if (ownsTaskOverlay) holdTaskOverlay()");
    expect(packRuntime).toContain("if (ownsTaskOverlay) releaseTaskOverlay()");
  });

  it("does not let nested SBC or pack operations reset cancellation", () => {
    expect(routineRuntime.match(/resetTaskCancellation\(\)/g)).toHaveLength(1);
    expect(packRuntime).toContain("if (taskOptions.internal !== true) resetTaskCancellation()");
    expect(sbcRuntime).toContain("if (isNewExecution) resetTaskCancellation()");
    expect(sbcRuntime).not.toContain("runtimeState.cancelRequested = false");
    expect(packRuntime).not.toContain("runtimeState.cancelRequested = false");
  });

  it("clears the cancellation flag only after every outer task has settled", () => {
    expect(solverUi).toContain("const settleTaskCancellationIfIdle");
    expect(solverUi).toContain("runtimeState.taskOverlayHolds === 0");
    expect(solverUi).toContain("!hasBlockingFcxTask()");
    expect(solverUi).toContain("settleTaskCancellationIfIdle();\n    queueMicrotask");
    expect(solverUi).toContain("queueMicrotask(settleTaskCancellationIfIdle)");
    const settle = solverUi.indexOf("settleTaskCancellationIfIdle();");
    const readFlag = solverUi.indexOf(
      "return runtimeState.cancelRequested === true",
      settle,
    );
    expect(settle).toBeGreaterThan(-1);
    expect(readFlag).toBeGreaterThan(settle);
  });

  it("discards a late solver response before parsing or applying it", () => {
    const request = sbcRuntime.indexOf("let solution = await requestSbcSolution");
    const cancelCheck = sbcRuntime.indexOf(
      "if (isTaskCancellationRequested())",
      request,
    );
    const parse = sbcRuntime.indexOf("const solveOutcome = parseSolveOutcome", request);
    expect(request).toBeGreaterThan(-1);
    expect(cancelCheck).toBeGreaterThan(request);
    expect(cancelCheck).toBeLessThan(parse);
    expect(hooksRuntime).toContain(
      'if (isTaskCancellationRequested())',
    );
  });

  it("finishes routing the current pack before observing cancellation", () => {
    const loop = packRuntime.indexOf("while (cursor < queue.length)");
    const open = packRuntime.indexOf("await openPackInstance", loop);
    const route = packRuntime.indexOf("await processPackItems", open);
    const nextCancelCheck = packRuntime.indexOf(
      "isTaskCancellationRequested()",
      route,
    );
    expect(open).toBeGreaterThan(loop);
    expect(route).toBeGreaterThan(open);
    expect(nextCancelCheck).toBeGreaterThan(route);
  });

  it("blocks standalone packs while allowing internal reward handling", () => {
    expect(packRuntime).toContain("taskOptions.internal !== true");
    expect(packRuntime).toContain("runtimeState.activeRoutineExecution");
    expect(packRuntime).toContain("当前FCX任务尚未结束，请稍候。");
    expect(sbcRuntime).toContain(
      "internal: true",
    );
    expect(sbcRuntime).toContain("onStorageFull");
  });
});
