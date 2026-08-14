import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const solverUiSource = readFileSync(
  resolve(root, "src/ui/solver-runtime.ts"),
  "utf8",
);
const sbcRuntimeSource = readFileSync(
  resolve(root, "src/domain/sbc/runtime.ts"),
  "utf8",
);
const settingsSource = readFileSync(
  resolve(root, "src/ui/settings-runtime.ts"),
  "utf8",
);
const taskOverlaySource = readFileSync(
  resolve(root, "src/ui/task-overlay.ts"),
  "utf8",
);
const packRuntimeSource = readFileSync(
  resolve(root, "src/domain/packs/runtime.ts"),
  "utf8",
);

describe("live SBC execution regression coverage", () => {
  it("bypasses the display cache and reads fresh execution entities", () => {
    const resolverStart = solverUiSource.indexOf(
      "const resolveExecutableSbc = async",
    );
    const resolverEnd = solverUiSource.indexOf(
      "let fetchSBCData = async",
      resolverStart,
    );
    const resolver = solverUiSource.slice(resolverStart, resolverEnd);

    expect(solverUiSource).toContain("const readFreshSbcExecutionState");
    expect(solverUiSource).toContain("await requestSbcSets(requestOptions)");
    expect(solverUiSource).toContain("requestSbcChallenges(sbcSet, requestOptions)");
    expect(resolver).toContain(
      "readFreshSbcExecutionState(numericSetId, { freshState: true })",
    );
    expect(resolver).not.toContain("getChallenges(sbcSet");
    expect(sbcRuntimeSource).toContain("normalizeInitialSbcExecutionState(");
    expect(sbcRuntimeSource).toContain(
      "await resolveExecutableSbcFromState(sbcId, challengeId, initialExecutionState)",
    );
    expect(sbcRuntimeSource).toContain(
      ": await resolveExecutableSbc(sbcId, challengeId)",
    );
    expect(sbcRuntimeSource).toContain("initialExecutionState: state");
  });

  it("binds the live challenge and initializes its squad directly", () => {
    expect(sbcRuntimeSource).toContain("newSbcSquad._set = sbcSet");
    expect(sbcRuntimeSource).toContain(
      "newSbcSquad._challenge = liveChallenge",
    );
    expect(sbcRuntimeSource).toContain("newSbcSquad.initWithSquad(liveSquad)");
    expect(sbcRuntimeSource).not.toContain(
      "newSbcSquad.initWithSBCSet",
    );
  });

  it("never falls through from a terminal solver status into squad application", () => {
    const failureBranch = sbcRuntimeSource.slice(
      sbcRuntimeSource.indexOf('if (solveOutcome.kind === "failure")'),
      sbcRuntimeSource.indexOf('if (solveOutcome.kind === "invalid")'),
    );
    expect(failureBranch).toContain("return;");
    expect(failureBranch).not.toContain("正在应用求解方案");
  });

  it("removes the old bottom controls and keeps one top task action", () => {
    expect(settingsSource).not.toContain("const createStopOverlayButton");
    expect(settingsSource).not.toContain("const createLogOverlayToggle");
    expect(taskOverlaySource).toContain('button.id = "fcx-task-end-overlay"');
    expect(taskOverlaySource).toContain('button.textContent = "结束任务"');
    expect(taskOverlaySource).toContain('const TASK_OVERLAY_ROOT_ID = "fcx-task-overlay-root"');
    expect(taskOverlaySource).toContain("root.appendChild(button)");
    expect(taskOverlaySource).not.toContain('querySelector(".ut-click-shield")');
    expect(taskOverlaySource).toContain(
      '"#sbc-log-toggle, #sbc-info, #sbc-stop-overlay"',
    );
  });

  it("uses two-phase whole-set execution and removes solver-log polling", () => {
    expect(sbcRuntimeSource).toContain("executeSbcSetPlan");
    expect(sbcRuntimeSource).toContain("planOnly: true");
    expect(sbcRuntimeSource).toContain("submitPlannedSbcChallenge");
    expect(sbcRuntimeSource).not.toContain("pollSolverLogs");
    expect(sbcRuntimeSource).not.toContain("/solver-logs");
    expect(sbcRuntimeSource).not.toContain("numCounter");
  });

  it("captures reward baselines before submit and processes only new rewards", () => {
    const setRunner = sbcRuntimeSource.slice(
      sbcRuntimeSource.indexOf("let solveSbcSet = async"),
    );
    expect(sbcRuntimeSource).toContain("prepareSbcRewardBaselines");
    expect(sbcRuntimeSource).toContain("registerSubmittedSbcRewards");
    expect(sbcRuntimeSource).toContain("selectNewRewardPacks");
    expect(packRuntimeSource).toContain("runAutomaticPlayerPicks({");
    expect(packRuntimeSource).toContain("selectNewPlayerPickItems(rewardPlan, unassigned)");
    expect(packRuntimeSource).toContain("markPlayerPickProcessed");
    expect(setRunner).toContain("confirmSetRoundCompletion");
    expect(setRunner).toContain("index === total");
    expect(setRunner).not.toContain("sbcData.awards");
    expect(sbcRuntimeSource).toContain("未打开仓库中已有的同名卡包");
    expect(sbcRuntimeSource).toContain("仍有历史挑选未分配");
    expect(sbcRuntimeSource).not.toContain("matchingPacks");
  });

  it("records consumed players only after each successful submit resolves", () => {
    const directSubmit = sbcRuntimeSource.indexOf("await sbcSubmit(_challenge, sbcSet)");
    const directRecord = sbcRuntimeSource.indexOf("addSbcSubmission(sbcExecution.packSummary", directSubmit);
    const plannedSubmit = sbcRuntimeSource.indexOf("await sbcSubmit(controller._challenge, live.set)");
    const plannedRecord = sbcRuntimeSource.indexOf("addSbcSubmission(execution.packSummary", plannedSubmit);
    expect(directSubmit).toBeGreaterThan(-1);
    expect(directRecord).toBeGreaterThan(directSubmit);
    expect(plannedSubmit).toBeGreaterThan(-1);
    expect(plannedRecord).toBeGreaterThan(plannedSubmit);
    expect(sbcRuntimeSource).toContain("snapshotConsumedPlayers(_solutionSquad");
    expect(sbcRuntimeSource).toContain("snapshotConsumedPlayers(planned.payload.solutionSquad");
  });
});
