// @ts-nocheck
// Runtime bridge between the typed routine scheduler and EA's private SBC entities.

const serializableRoutineResults = (results = []) => results.map((result) => ({
  stepId: result.stepId,
  stepKind: result.stepKind,
  ...(result.setId ? { setId: Number(result.setId) } : {}),
  ...(result.packId ? { packId: Number(result.packId) } : {}),
  completedRuns: Number(result.completedRuns || 0),
  ...(result.packsOpened !== undefined ? { packsOpened: Number(result.packsOpened || 0) } : {}),
  ...(result.progressUnits !== undefined ? { progressUnits: Number(result.progressUnits || 0) } : {}),
  rewardPackIds: [...(result.rewardPackIds || [])].map(Number),
  rewardPlayerPickIds: [...(result.rewardPlayerPickIds || [])].map(Number),
  stopKind: result.stopKind,
  ...(result.reason ? { reason: String(result.reason) } : {}),
  ...(result.setName ? { setName: String(result.setName) } : {}),
  ...(result.solveFailure
    ? { solveFailure: structuredClone(result.solveFailure) }
    : {}),
}));

const createRoutineContext = (routine, checkpoint) => ({
  id: checkpoint?.taskId || `fcx-routine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  routineId: routine.id,
  routineSnapshot: structuredClone(routine),
  mode: routine.mode,
  cancelled: false,
  cycle: Number(checkpoint?.cursor?.cycle || 0),
  stepIndex: Number(checkpoint?.cursor?.stepIndex || 0),
  totalCycles: routine.totalCycles === -1 ? -1 : Number(routine.totalCycles || 5),
  completedByStep: { ...(checkpoint?.completedByStep || {}) },
  results: serializableRoutineResults(checkpoint?.results || []),
  notices: [...(checkpoint?.notices || [])],
  packSummary: checkpoint?.packSummary
    ? structuredClone(checkpoint.packSummary)
    : createPackTaskSummary(),
  storageFallback: routine.storageFallback || { enabled: false, setId: 0, runs: 1 },
  storageRecoveryCount: Number(checkpoint?.storageRecoveryCount || 0),
  isTotwFallback: false,
  isSolveFailureFallback: false,
  currentStepCompleted: Number(checkpoint?.cursor?.completedInStep || 0),
  recoveryReloadCount: Number(checkpoint?.reloadCount || 0),
  recoveryErrors: structuredClone(checkpoint?.recoveryErrors || []),
  solveFailureFallbackEvents: structuredClone(
    checkpoint?.solveFailureFallbackEvents || [],
  ),
  recoveryCreatedAt: Number(checkpoint?.createdAt || Date.now()),
  pendingReward: checkpoint?.pendingReward
    ? structuredClone(checkpoint.pendingReward)
    : undefined,
  pendingOperation: checkpoint?.pendingOperation
    ? structuredClone(checkpoint.pendingOperation)
    : undefined,
});

const recoverableRoutineStopKinds = new Set([
  "throttled",
  "submit_failed",
  "pack_failed",
  "invalid",
]);

const isRecoverableRoutineFailure = (stopKind) =>
  recoverableRoutineStopKinds.has(String(stopKind || ""));

const currentRoutineRecoveryStep = (routine, context) =>
  routine?.steps?.[Math.max(0, Number(context?.stepIndex || 0))];

const routineRecoveryOperation = (stopKind, context) => {
  if (context?.pendingOperation?.kind === "sbc_submit") return "提交SBC";
  if (stopKind === "submit_failed") return "提交SBC";
  if (stopKind === "pack_failed") return "处理卡包或奖励";
  if (stopKind === "throttled") return "EA请求限流";
  return "执行永动机流程";
};

const createRoutineRecoveryError = ({
  routine,
  context,
  stopKind,
  reason,
  source,
  result,
  reloadAttempt,
  maxReloads,
}) => {
  const step = currentRoutineRecoveryStep(routine, context);
  const technicalMessage = String(
    source?.message || result?.reason || reason || "永动机流程发生未知错误。"
  );
  const statusFromMessage = technicalMessage.match(/(?:状态|status)\s*[:：]?\s*(\d{3})/i);
  const status = eaResponseStatus(source) ?? (
    statusFromMessage ? Number(statusFromMessage[1]) : undefined
  );
  const friendlyReason = String(reason || technicalMessage);
  const setId = Number(result?.setId || (step?.kind === "sbc" ? step.setId : 0));
  const stepName = String(
    result?.setName
    || (step?.kind === "pack" ? step.packName : "")
    || (setId > 0 ? `SBC #${setId}` : "")
  );
  return {
    occurredAt: new Date().toISOString(),
    reloadAttempt,
    maxReloads,
    stopKind,
    reason: friendlyReason,
    technicalMessage,
    cycle: Math.max(0, Number(context?.cycle || 0)),
    stepIndex: Math.max(0, Number(context?.stepIndex || 0)),
    ...(step?.id ? { stepId: String(step.id) } : {}),
    ...(stepName ? { stepName } : {}),
    ...(setId > 0 ? { setId } : {}),
    operation: routineRecoveryOperation(stopKind, context),
    ...(Number.isFinite(status) ? { status: Number(status) } : {}),
    ...(source?.phase ? { phase: String(source.phase) } : {}),
  };
};

const createRoutineRecoveryCheckpoint = (routine, context, lastError = "") => ({
  version: 2,
  personaId: getCurrentPersonaId({ required: true }),
  taskId: context.id,
  routine: structuredClone(routine),
  recoveryMode: routine.fatalRecoveryMode || "restart",
  cursor: {
    cycle: Math.max(0, Number(context.cycle || 0)),
    stepIndex: Math.max(0, Number(context.stepIndex || 0)),
    completedInStep: Math.max(0, Number(context.currentStepCompleted || 0)),
  },
  completedByStep: { ...(context.completedByStep || {}) },
  results: serializableRoutineResults(context.results || []),
  notices: [...(context.notices || [])],
  packSummary: structuredClone(context.packSummary || createPackTaskSummary()),
  storageRecoveryCount: Number(context.storageRecoveryCount || 0),
  reloadCount: Number(context.recoveryReloadCount || 0),
  createdAt: Number(context.recoveryCreatedAt || Date.now()),
  updatedAt: Date.now(),
  recoveryErrors: structuredClone(context.recoveryErrors || []),
  solveFailureFallbackEvents: structuredClone(
    context.solveFailureFallbackEvents || [],
  ),
  ...((lastError || context.recoveryErrors?.at(-1)?.reason)
    ? { lastError: String(lastError || context.recoveryErrors.at(-1).reason) }
    : {}),
  ...(context.pendingOperation
    ? { pendingOperation: structuredClone(context.pendingOperation) }
    : {}),
  ...(context.pendingReward
    ? { pendingReward: structuredClone(context.pendingReward) }
    : {}),
});

const snapshotPendingRoutineReward = (result) => ({
  stepResult: serializableRoutineResults([result])[0],
  options: structuredClone(result.execution.options),
  rewardPlan: structuredClone(result.execution.rewardPlan),
  packSummary: structuredClone(result.execution.packSummary),
  completedRuns: Number(result.execution.completedRuns || result.completedRuns || 0),
  storageRecoveryCount: Number(result.execution.storageRecoveryCount || 0),
  ...(result.execution.stoppedReason
    ? { stoppedReason: String(result.execution.stoppedReason) }
    : {}),
});

const restorePendingRoutineRewardResult = (pending) => {
  const execution = createSbcExecutionContext(pending.options);
  execution.rewardPlan = structuredClone(pending.rewardPlan);
  execution.packSummary = structuredClone(pending.packSummary);
  execution.completedRuns = Number(pending.completedRuns || 0);
  execution.storageRecoveryCount = Number(pending.storageRecoveryCount || 0);
  execution.stoppedReason = pending.stoppedReason;
  return { ...structuredClone(pending.stepResult), execution };
};

const persistRoutineRecoveryCheckpoint = (routine, context, lastError = "") => {
  if (routine?.fatalRecoveryEnabled !== true) return undefined;
  const checkpoint = fcxRoutineRecoveryStore.save(
    createRoutineRecoveryCheckpoint(routine, context, lastError)
  );
  context.recoveryCreatedAt = checkpoint.createdAt;
  console.info("[FCX][Routine] 恢复检查点已保存并回读", {
    routineId: checkpoint.routine.id,
    routineName: checkpoint.routine.name,
    recoveryMode: checkpoint.recoveryMode,
    reloadCount: checkpoint.reloadCount,
    cursor: checkpoint.cursor,
    pendingOperation: checkpoint.pendingOperation?.kind,
    pendingReward: Boolean(checkpoint.pendingReward),
  });
  return checkpoint;
};

const requestRoutinePageReload = () => {
  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  let unloadObserved = false;
  const markUnloading = () => { unloadObserved = true; };
  pageWindow.addEventListener?.("beforeunload", markUnloading, { once: true });
  pageWindow.addEventListener?.("pagehide", markUnloading, { once: true });
  console.info("[FCX][Routine] 已调用页面刷新", {
    pageWindow: pageWindow === window ? "userscript" : "page",
  });
  try {
    pageWindow.location.reload();
  } catch (error) {
    console.warn("[FCX][Routine] 页面环境刷新失败，正在使用脚本环境后备", error);
    window.location.reload();
  }
  setTimeout(() => {
    if (unloadObserved) return;
    console.warn("[FCX][Routine] 未观察到页面卸载，正在使用地址替换后备刷新");
    window.location.replace(window.location.href);
  }, 1500);
};

const waitForScheduledRoutineReload = async ({
  routine,
  context,
  delayMs,
  errorEvent,
}) => {
  context.recoveryErrors.push(structuredClone(errorEvent));
  const checkpoint = persistRoutineRecoveryCheckpoint(
    routine,
    context,
    errorEvent.reason
  );
  const reasonText = /[。！？.!?]$/.test(errorEvent.reason)
    ? errorEvent.reason
    : `${errorEvent.reason}。`;
  const message = `流程遇到技术错误：${reasonText} ${Math.round(delayMs / 1000)}秒后自动刷新恢复（${errorEvent.reloadAttempt}/${errorEvent.maxReloads}）`;
  reportOperationStatus("Routine", message);
  console.warn("[FCX][Routine] 自动刷新恢复倒计时已开始", {
    routineId: checkpoint.routine.id,
    routineName: checkpoint.routine.name,
    recoveryMode: checkpoint.recoveryMode,
    stopKind: context.stopKind,
    stopReason: context.stopReason,
    cursor: checkpoint.cursor,
    delayMs,
    reloadCount: checkpoint.reloadCount,
    error: errorEvent,
  });
  return waitForRoutineRecoveryCountdown(
    delayMs,
    () => context.cancelled || isTaskCancellationRequested()
  );
};

const activeRoutineStepId = (context) =>
  String(context?.routineSnapshot?.steps?.[Number(context?.stepIndex || 0)]?.id || "unknown");

const beginRoutinePendingSbcSubmission = ({
  setId,
  challengeId,
  beforeSetCompletions,
  countsTowardStep,
  submission,
  execution,
}) => {
  const context = runtimeState.activeRoutineExecution;
  if (
    !context
    || context.cancelled
    || context.routineSnapshot?.fatalRecoveryEnabled !== true
  ) return false;
  context.pendingOperation = {
    kind: "sbc_submit",
    stepId: activeRoutineStepId(context),
    setId: Number(setId),
    challengeId: Number(challengeId),
    beforeSetCompletions: Number(beforeSetCompletions || 0),
    countsTowardStep:
      Boolean(countsTowardStep)
      && !context.isTotwFallback
      && !context.isSolveFailureFallback,
    startedAt: Date.now(),
    submission: structuredClone(submission),
    reward: {
      options: structuredClone(execution.options),
      rewardPlan: structuredClone(execution.rewardPlan),
      packSummary: structuredClone(execution.packSummary),
      completedRuns: Number(execution.completedRuns || 0),
      storageRecoveryCount: Number(execution.storageRecoveryCount || 0),
    },
  };
  persistRoutineRecoveryCheckpoint(context.routineSnapshot, context);
  return true;
};

const completeRoutinePendingSbcSubmission = (execution) => {
  const context = runtimeState.activeRoutineExecution;
  const operation = context?.pendingOperation;
  if (!context || operation?.kind !== "sbc_submit") return;
  if (operation.countsTowardStep !== false) {
    context.currentStepCompleted = Number(context.currentStepCompleted || 0) + 1;
    context.completedByStep[operation.stepId] =
      Number(context.completedByStep[operation.stepId] || 0) + 1;
  }
  context.pendingReward = snapshotPendingRoutineReward({
    stepId: operation.stepId,
    stepKind: "sbc",
    setId: operation.setId,
    completedRuns: Number(execution.completedRuns || 0) + 1,
    progressUnits: 1,
    rewardPackIds: [...(execution.rewardPlan.packIds || [])],
    rewardPlayerPickIds: [...(execution.rewardPlan.playerPickIds || [])],
    stopKind: "done",
    execution,
  });
  context.pendingOperation = undefined;
  try {
    persistRoutineRecoveryCheckpoint(context.routineSnapshot, context);
  } catch (error) {
    console.warn("[FCX][Routine] confirmed SBC checkpoint could not be updated", error);
  }
};

const incrementRecoveredRoutineProgress = (context, operation) => {
  if (operation.countsTowardStep === false) return;
  context.completedByStep[operation.stepId] =
    Number(context.completedByStep[operation.stepId] || 0) + 1;
  if (
    context.routineSnapshot?.steps?.[Number(context.stepIndex || 0)]?.id
    === operation.stepId
  ) {
    context.currentStepCompleted = Number(context.currentStepCompleted || 0) + 1;
  }
};

const reconcileRoutinePendingOperation = async (routine, context) => {
  const operation = context.pendingOperation;
  if (!operation) return;
  reportOperationStatus("Routine", "正在核对刷新前最后一次EA写操作");
  const fresh = await readFreshSbcExecutionState(operation.setId, {
      resetThrottleOnSuccess: false,
  });
  const freshChallenge = fresh.challenges.find(
    (item) => Number(item?.id) === Number(operation.challengeId)
  );
  const applied = Number(fresh.set?.timesCompleted || 0) > operation.beforeSetCompletions
    || String(freshChallenge?.status || "").toUpperCase() === "COMPLETED";
  if (!applied && !freshChallenge) {
    throw new Error("刷新后仍无法确认上一次SBC提交结果，已停止自动恢复以避免重复消耗。");
  }
  if (applied) {
    const rewardExecution = createSbcExecutionContext(operation.reward.options);
    rewardExecution.rewardPlan = structuredClone(operation.reward.rewardPlan);
    rewardExecution.packSummary = structuredClone(operation.reward.packSummary);
    rewardExecution.completedRuns = Number(operation.reward.completedRuns || 0) + 1;
    rewardExecution.storageRecoveryCount = Number(operation.reward.storageRecoveryCount || 0);
    addSbcSubmission(rewardExecution.packSummary, operation.submission);
    context.pendingReward = snapshotPendingRoutineReward({
      stepId: operation.stepId,
      stepKind: "sbc",
      setId: operation.setId,
      completedRuns: 1,
      progressUnits: 1,
      rewardPackIds: [...(rewardExecution.rewardPlan.packIds || [])],
      rewardPlayerPickIds: [...(rewardExecution.rewardPlan.playerPickIds || [])],
      stopKind: "done",
      execution: rewardExecution,
    });
    incrementRecoveredRoutineProgress(context, operation);
    console.info("[FCX][Routine] recovered an applied SBC submission", {
      setId: operation.setId,
      challengeId: operation.challengeId,
    });
  }
  context.pendingOperation = undefined;
  persistRoutineRecoveryCheckpoint(routine, context);
};

const beginRoutineTask = () => {
  resetTaskCancellation();
};

const classifyRewardProcessingStatus = (reason) => {
  const message = String(reason || "");
  if (/挑选/.test(message)) return "pick_failed";
  if (/未分配|仓库|转会列表|安置|分配/.test(message)) {
    return "unassigned_blocked";
  }
  return "pack_failed";
};

const openRoutineRewards = async (result, context, label) => {
  if (!result?.execution) {
    return { ok: true, status: "no_pending" };
  }
  if (!hasPendingTrackedRewards(result.execution.rewardPlan)) {
    mergePackTaskSummary(context.packSummary, result.execution.packSummary);
    result.execution.packSummary = createPackTaskSummary();
    context.pendingReward = undefined;
    try {
      persistRoutineRecoveryCheckpoint(context.routineSnapshot, context);
    } catch (error) {
      console.warn("[FCX][Routine] reward-free checkpoint could not be updated", error);
    }
    return { ok: true, status: "no_pending" };
  }
  if (context.cancelled || isTaskCancellationRequested()) {
    return { ok: false, status: "unassigned_blocked", reason: "用户结束了任务。" };
  }
  showLoader(true);
  reportOperationStatus("Pack", `正在处理 ${label} 的准确奖励`);
  const execution = result.execution;
  // A no-solution result may leave its reason on the shared SBC execution.
  // Reward processing must report only errors raised by the reward operation.
  execution.stoppedReason = undefined;
  execution.storageRecoveryCount = Number(context.storageRecoveryCount || 0);
  context.activeRewardExecution = execution;
  let opened = false;
  let thrownError;
  try {
    opened = await openSbcRewardPlan(execution);
  } catch (error) {
    thrownError = error;
    execution.stoppedReason = String(
      error?.message || error || `${label} 的奖励处理发生异常。`
    );
  } finally {
    context.activeRewardExecution = undefined;
  }
  context.storageRecoveryCount = Number(execution.storageRecoveryCount || 0);
  mergePackTaskSummary(context.packSummary, execution.packSummary);
  execution.packSummary = createPackTaskSummary();
  if (!opened) {
    context.stopKind = "pack_failed";
    context.stopReason = execution.stoppedReason || `${label} 的奖励处理失败。`;
    context.pendingReward = snapshotPendingRoutineReward(result);
    const status = classifyRewardProcessingStatus(context.stopReason);
    console.warn("[FCX][Routine] reward processing failed", {
      label,
      status,
      reason: context.stopReason,
      error: thrownError,
    });
  } else {
    execution.stoppedReason = undefined;
    context.pendingReward = undefined;
  }
  try {
    persistRoutineRecoveryCheckpoint(context.routineSnapshot, context);
  } catch (error) {
    console.warn("[FCX][Routine] reward checkpoint could not be updated", error);
  }
  return opened
    ? { ok: true, status: "processed" }
    : {
        ok: false,
        status: classifyRewardProcessingStatus(context.stopReason),
        reason: context.stopReason,
      };
};

const classifyRoutineStop = (execution, completedRuns) => {
  return classifyRoutineExecutionStop({
    reason: execution?.stoppedReason,
    completedRuns,
    specialShortage: Boolean(execution?.specialShortage),
    cancelled:
      isTaskCancellationRequested()
      || runtimeState.activeRoutineExecution?.cancelled === true,
  });
};

const executeRoutineSet = async (
  routine,
  step,
  requestedRuns,
  context,
  { detectShortage = true } = {}
) => {
  if (context.cancelled || isTaskCancellationRequested()) {
    return {
      stepId: step.id,
      stepKind: "sbc",
      setId: step.setId,
      completedRuns: 0,
      rewardPackIds: [],
      stopKind: "cancelled",
      reason: "用户结束了任务。",
    };
  }
  const configuredSetId = Number(step.target?.preferredSetId || step.setId);
  let catalog;
  let resolution;
  let challengeRequestCount = 0;
  let challengeRequestSetId;
  try {
    catalog = await sbcSets();
    resolution = await resolveRoutineSbcTarget({
      step,
      catalog: catalog || { sets: [], categories: [] },
      loadChallenges: (candidate) => {
        challengeRequestCount += 1;
        challengeRequestSetId = Number(candidate?.id);
        if (challengeRequestCount > 1) {
          throw new Error(
            `永动机目标校验异常：同一步骤尝试读取多个SBC挑战（配置 ${configuredSetId}，当前 ${candidate?.id ?? "未知"}）`
          );
        }
        return getChallenges(candidate, true);
      },
    });
  } catch (error) {
    const status = eaResponseStatus(error);
    const throttled = isEaThrottleStatus(status);
    const failedSetId = Number(challengeRequestSetId || configuredSetId);
    const reason = throttled
      ? `读取SBC ${failedSetId}的挑战受到EA限流（状态 ${status}），本次永动机已安全结束。`
      : `读取SBC ${failedSetId}的挑战失败${status ? `（状态 ${status}）` : ""}，本次永动机已安全结束。`;
    console.warn("[FCX][Routine] target request failed", {
      configuredSetId,
      attemptedSetId: failedSetId,
      challengeRequestCount,
      status,
      stopKind: throttled ? "throttled" : "submit_failed",
    });
    return {
      stepId: step.id,
      stepKind: "sbc",
      setId: configuredSetId,
      completedRuns: 0,
      rewardPackIds: [],
      stopKind: throttled ? "throttled" : "submit_failed",
      reason,
    };
  }
  if (!resolution.set) {
    console.warn("[FCX][Routine] target unresolved", {
      stepId: step.id,
      preferredSetId: Number(step.target?.preferredSetId || step.setId),
      candidateCount: Number(resolution.candidateCount || 0),
      matchedRating: resolution.matchedRating,
      challengeRequestCount: Number(resolution.challengeRequestCount || 0),
      reason: resolution.reason,
    });
    return {
      stepId: step.id,
      stepKind: "sbc",
      setId: step.setId,
      completedRuns: 0,
      rewardPackIds: [],
      stopKind: "unavailable",
      reason: resolution.reason || `SBC ${step.setId} 当前不可用或已过期。`,
    };
  }
  const resolvedStep = resolution.step;
  const set = resolution.set;
  console.info("[FCX][Routine] target resolved", {
    stepId: step.id,
    configuredSetId,
    resolvedSetId: Number(set.id),
    source: resolution.source,
    name: set.name,
    candidateCount: Number(resolution.candidateCount || 0),
    matchedRating: resolution.matchedRating,
    challengeRequestCount: Number(resolution.challengeRequestCount || 0),
    challengeCount: Array.isArray(resolution.challenges)
      ? resolution.challenges.length
      : undefined,
  });
  const repeatability = getSbcRepeatability(set);
  const effectiveRuns = effectiveRequestedRuns(requestedRuns, repeatability);
  if (effectiveRuns === 0) {
    return {
      stepId: step.id,
      stepKind: "sbc",
      setId: step.setId,
      completedRuns: 0,
      rewardPackIds: [],
      stopKind: "exhausted",
      reason: `${set.name} 的可重复次数已经耗尽。`,
    };
  }

  if (context.cancelled || isTaskCancellationRequested()) {
    return {
      stepId: step.id,
      stepKind: "sbc",
      setId: step.setId,
      completedRuns: 0,
      rewardPackIds: [],
      stopKind: "cancelled",
      reason: "用户结束了任务。",
    };
  }

  reportOperationStatus(
    "SBC",
    `${
      context.isTotwFallback
        ? "周黑补给"
        : context.isSolveFailureFallback
          ? "求解失败补偿"
          : "永动机滚卡"
    } · ${set.name}`
  );
  const options = {
    ignoreValue: routine.ignoreValue === true,
    requestedRuns: effectiveRuns,
    deferRewards: true,
    deferSummary: true,
    detectSpecialShortage: detectShortage && !context.isTotwFallback,
    storageFallback: routine.storageFallback || { enabled: false, setId: 0, runs: 1 },
  };
  const execution = createSbcExecutionContext(options);
  const result = await solveSbcSet(
    resolvedStep.setId,
    true,
    false,
    options,
    execution,
    {
      initialExecutionState: {
        set,
        challenges: resolution.challenges || [],
      },
    }
  );
  const completedRuns = Number(result?.completedRuns || 0);
  return {
    stepId: step.id,
    stepKind: "sbc",
    setId: resolvedStep.setId,
    completedRuns,
    progressUnits: completedRuns,
    rewardPackIds: [...(result?.rewardPlan?.packIds || [])],
    rewardPlayerPickIds: [...(result?.rewardPlan?.playerPickIds || [])],
    stopKind: classifyRoutineStop(result, completedRuns),
    ...(result?.stoppedReason
      ? {
          reason:
            classifyRoutineStop(result, completedRuns) === "no_solution"
              ? `步骤“${set.name}”已跳过：${result.stoppedReason}`
              : result.stoppedReason,
        }
      : {}),
    execution: result,
    setName: set.name,
  };
};

const runTotwFallback = async (routine, context) => {
  const fallback = routine.totwFallback;
  if (!fallback?.enabled) {
    return {
      success: false,
      completedRuns: 0,
      stopKind: "unavailable",
      reason: "缺周黑自动补给未启用。",
      failedSetId: Number(fallback?.setId || 0),
      failedSetName: "周黑补给",
    };
  }
  let completedRuns = 0;
  context.isTotwFallback = true;
  try {
    for (let index = 0; index < fallback.runs; index += 1) {
      if (context.cancelled || isTaskCancellationRequested()) {
        return {
          success: false,
          completedRuns,
          stopKind: "cancelled",
          reason: "用户结束了任务。",
          failedSetId: Number(fallback.setId),
          failedSetName: "周黑补给",
        };
      }
      reportOperationStatus(
        "SBC",
        `缺少周黑，正在执行补给 ${index + 1} / ${fallback.runs}`
      );
      const result = await executeRoutineSet(
        routine,
        {
          kind: "sbc",
          id: `totw-fallback-${index + 1}`,
          setId: fallback.setId,
          runs: 1,
        },
        1,
        context,
        { detectShortage: false }
      );
      if (result.completedRuns !== 1 || result.stopKind !== "done") {
        return {
          success: false,
          completedRuns,
          stopKind: result.stopKind || "invalid",
          reason: result.reason || `周黑补给 SBC ${fallback.setId} 未能完整完成。`,
          failedSetId: Number(result.setId || fallback.setId),
          failedSetName: result.setName || `周黑补给 SBC ${fallback.setId}`,
        };
      }
      if (!result.rewardPackIds.length && !result.rewardPlayerPickIds?.length) {
        return {
          success: false,
          completedRuns: completedRuns + 1,
          stopKind: "pack_failed",
          reason: "周黑补给已完成，但没有读取到对应的整组奖励包。",
          failedSetId: Number(result.setId || fallback.setId),
          failedSetName: result.setName || `周黑补给 SBC ${fallback.setId}`,
        };
      }
      const rewardResult = await openRoutineRewards(result, context, "周黑补给");
      if (!rewardResult.ok) {
        return {
          success: false,
          completedRuns: completedRuns + 1,
          stopKind: context.stopKind || "pack_failed",
          reason: rewardResult.reason || context.stopReason || "周黑补给奖励处理失败。",
          failedSetId: Number(result.setId || fallback.setId),
          failedSetName: result.setName || `周黑补给 SBC ${fallback.setId}`,
        };
      }
      completedRuns += 1;
    }
    invalidateSbcCache();
    invalidateInventorySnapshot("club");
    invalidateInventorySnapshot("storage");
    await fetchPlayers({ force: true });
    context.stopKind = undefined;
    context.stopReason = undefined;
    return {
      success: true,
      completedRuns,
      stopKind: "done",
      failedSetId: Number(fallback.setId),
      failedSetName: `周黑补给 SBC ${fallback.setId}`,
    };
  } catch (error) {
    const reason = String(error?.message || error || "周黑补给执行失败。");
    console.error("[FCX][Routine] TOTW fallback failed", error);
    return {
      success: false,
      completedRuns,
      stopKind: "invalid",
      reason,
      failedSetId: Number(fallback.setId),
      failedSetName: `周黑补给 SBC ${fallback.setId}`,
    };
  } finally {
    context.isTotwFallback = false;
  }
};

const executeRoutineStepWithTotwFallback = async (
  routine,
  step,
  requestedRuns,
  context
) => {
  const attemptTarget = async (remainingRuns) => {
    let result = await executeRoutineSet(
      routine,
      step,
      remainingRuns,
      context,
      { detectShortage: true }
    );
    if (
      result.stopKind === "special_shortage"
      && (result.rewardPackIds.length || result.rewardPlayerPickIds?.length)
    ) {
      const rewardResult = await openRoutineRewards(
        result,
        context,
        result.setName || `SBC ${step.setId}`
      );
      if (!rewardResult.ok) {
        result = {
          ...result,
          rewardPackIds: [],
          rewardPlayerPickIds: [],
          stopKind: "pack_failed",
          reason: rewardResult.reason || context.stopReason,
        };
      } else {
        result = {
          ...result,
          rewardPackIds: [],
          rewardPlayerPickIds: [],
        };
      }
    }
    return {
      completedRuns: Number(result.completedRuns || 0),
      specialShortage:
        result.stopKind === "special_shortage"
          ? result.execution?.specialShortage || { detected: true }
          : undefined,
      value: result,
    };
  };

  if (!routine.totwFallback?.enabled) {
    const attempt = await attemptTarget(requestedRuns);
    const result = attempt.value;
    if (result.stopKind !== "special_shortage") return result;
    const shortage = result.execution?.specialShortage;
    const stepName = result.setName || `SBC ${step.setId}`;
    const shortageReason = shortage
      ? `步骤“${stepName}”已跳过：缺少周黑或特殊卡，且未启用“缺周黑自动补给”（需要 ${Number(shortage.required || 0)} 名，当前 ${Number(shortage.available || 0)} 名）。`
      : `步骤“${stepName}”已跳过：缺少周黑或特殊卡，且未启用“缺周黑自动补给”。`;
    console.warn("[FCX][Routine] 缺少特殊卡，已跳过步骤", {
      stepId: step.id,
      setId: Number(step.setId),
      stepName,
      required: Number(shortage?.required || 0),
      available: Number(shortage?.available || 0),
      fallbackEnabled: false,
    });
    reportOperationStatus("Routine", shortageReason, "error");
    return { ...result, reason: shortageReason };
  }

  let lastTotwFallbackResult;
  const outcome = await runWithSpecialFallbackLoop({
    requestedRuns,
    attempt: attemptTarget,
    replenish: async ({ cycle, completedRuns, remainingRuns }) => {
      const targetLabel = requestedRuns === -1
        ? `${completedRuns} / 持续执行`
        : `${completedRuns} / ${requestedRuns}`;
      reportOperationStatus(
        "SBC",
        `主线进度 ${targetLabel} · 正在执行第 ${cycle} 轮周黑补给`
      );
      console.info("[FCX][Routine] TOTW fallback cycle", {
        stepId: step.id,
        setId: Number(step.setId),
        cycle,
        completedRuns,
        remainingRuns,
        fallbackSetId: Number(routine.totwFallback.setId),
        fallbackRuns: Number(routine.totwFallback.runs || 1),
      });
      if (Number(routine.totwFallback.setId) === Number(step.setId)) {
        lastTotwFallbackResult = {
          success: false,
          completedRuns: 0,
          stopKind: "invalid",
          reason: "周黑补给 SBC 不能与当前目标 SBC 相同。",
          failedSetId: Number(routine.totwFallback.setId),
          failedSetName: `周黑补给 SBC ${routine.totwFallback.setId}`,
        };
        return false;
      }
      lastTotwFallbackResult = await runTotwFallback(routine, context);
      return lastTotwFallbackResult.success;
    },
  });
  const result = outcome.result.value;
  const totalCompleted = outcome.totalCompletedRuns;

  if (outcome.replenishmentFailed) {
    const fallbackFailure = lastTotwFallbackResult || {
      stopKind: "invalid",
      reason: "周黑自动补给失败。",
      failedSetId: Number(routine.totwFallback.setId),
      failedSetName: `周黑补给 SBC ${routine.totwFallback.setId}`,
    };
    const stopKind = fallbackFailure.stopKind || "invalid";
    const reason = fallbackFailure.reason || "周黑自动补给失败。";
    context.stopKind = stopKind;
    context.stopReason = reason;
    return {
      ...result,
      completedRuns: totalCompleted,
      rewardPackIds: [],
      rewardPlayerPickIds: [],
      stopKind,
      reason,
      ...(stopKind === "no_solution"
        ? {
            solveFailure: {
              source: "totw_fallback",
              failedSetId: Number(fallbackFailure.failedSetId),
              failedSetName: String(fallbackFailure.failedSetName),
              mainStepId: String(step.id),
              mainSetId: Number(result.setId || step.setId),
              mainStepName: String(result.setName || `SBC ${step.setId}`),
              reason,
            },
          }
        : {}),
    };
  }

  if (outcome.stoppedForNoProgress) {
    const reason =
      `第 ${outcome.replenishmentCycles} 轮周黑补给完成后，主线立即重试仍未找到可用特殊卡，已停止以避免重复补给。请检查球员保护、排除规则和价值设置。`;
    return {
      ...result,
      completedRuns: totalCompleted,
      rewardPackIds: [],
      rewardPlayerPickIds: [],
      stopKind: "special_shortage",
      reason,
    };
  }

  if (requestedRuns !== -1 && totalCompleted >= requestedRuns) {
    return {
      ...result,
      completedRuns: totalCompleted,
      stopKind: "done",
      reason: undefined,
    };
  }

  return {
    ...result,
    completedRuns: totalCompleted,
  };
};

const runSolveFailureFallback = async (
  routine,
  context,
  failedStep,
  failedResult,
  fallbackEvent
) => {
  const fallback = routine.solveFailureFallback;
  if (!fallback?.enabled) {
    return { success: false, attempted: false, completedRuns: 0 };
  }
  const failure = failedResult.solveFailure || {
    source: "main_step",
    failedSetId: Number(failedResult.setId || failedStep.setId),
    failedSetName: String(failedResult.setName || `SBC ${failedStep.setId}`),
    mainStepId: String(failedStep.id),
    mainSetId: Number(failedResult.setId || failedStep.setId),
    mainStepName: String(failedResult.setName || `SBC ${failedStep.setId}`),
    reason: String(failedResult.reason || "当前球员范围内没有可行方案。"),
  };
  const conflictsWithMain = Number(fallback.setId) === Number(failure.mainSetId);
  const conflictsWithFailure = Number(fallback.setId) === Number(failure.failedSetId);
  if (conflictsWithMain || conflictsWithFailure) {
    const conflictTarget = conflictsWithFailure
      ? failure.failedSetName
      : failure.mainStepName;
    return {
      success: false,
      attempted: false,
      completedRuns: 0,
      reason: `求解失败补偿 SBC 不能与“${conflictTarget}”相同。`,
    };
  }

  const requestedRuns = Number(fallback.runs) === -1
    ? -1
    : Math.min(100, Math.max(1, Number(fallback.runs || 1)));
  const failedStepName = failure.mainStepName;
  const failedTargetName = failure.failedSetName;
  let completedRuns = 0;
  let lastReason;
  context.isSolveFailureFallback = true;
  try {
    while (
      !context.cancelled
      && !isTaskCancellationRequested()
      && (requestedRuns === -1 || completedRuns < requestedRuns)
    ) {
      const progressLabel = requestedRuns === -1
        ? `${completedRuns + 1} / 持续执行`
        : `${completedRuns + 1} / ${requestedRuns}`;
      reportOperationStatus(
        "SBC",
        failure.source === "totw_fallback"
          ? `主步骤“${failedStepName}”的周黑补给“${failedTargetName}”无解，正在执行补偿 SBC #${fallback.setId} · ${progressLabel}`
          : `步骤“${failedStepName}”求解无解，正在执行补偿 SBC #${fallback.setId} · ${progressLabel}`
      );
      const result = await executeRoutineSet(
        routine,
        {
          kind: "sbc",
          id: `solve-failure-fallback-${failedStep.id}-${completedRuns + 1}`,
          setId: fallback.setId,
          runs: 1,
        },
        1,
        context,
        { detectShortage: false }
      );

      const completedThisAttempt = Number(result.completedRuns || 0);
      if (result.setName && fallbackEvent) {
        fallbackEvent.fallbackSetName = String(result.setName);
      }
      if (completedThisAttempt > 0) {
        completedRuns += completedThisAttempt;
        if (fallbackEvent) fallbackEvent.completedRuns = completedRuns;
        const rewardResult = await openRoutineRewards(
          result,
          context,
          result.setName || `求解失败补偿 SBC ${fallback.setId}`
        );
        if (!rewardResult.ok) {
          return {
            success: false,
            attempted: true,
            fatal: true,
            completedRuns,
            stopKind: context.stopKind || "pack_failed",
            reason:
              rewardResult.reason
              || context.stopReason
              || "求解失败补偿的奖励处理失败。",
          };
        }
        if (isRoutineStepFatal(result.stopKind)) {
          return {
            success: false,
            attempted: true,
            fatal: true,
            completedRuns,
            stopKind: result.stopKind,
            reason: result.reason || "求解失败补偿在提交后异常结束。",
          };
        }
        continue;
      }

      lastReason = result.reason;
      if (isSolveFailureFallbackExhausted(result.stopKind)) {
        break;
      }
      return {
        success: false,
        attempted: true,
        fatal: true,
        completedRuns,
        stopKind: result.stopKind,
        reason: result.reason || "求解失败补偿未能完成。",
      };
    }

    if (context.cancelled || isTaskCancellationRequested()) {
      return {
        success: false,
        attempted: true,
        fatal: true,
        completedRuns,
        stopKind: "cancelled",
        reason: "用户结束了任务。",
      };
    }
    if (completedRuns <= 0) {
      return {
        success: false,
        attempted: true,
        completedRuns: 0,
        reason:
          lastReason
          || `补偿 SBC ${fallback.setId} 当前不可用，原步骤未能重试。`,
      };
    }

    invalidateSbcCache(fallback.setId);
    invalidateSbcCache(failure.mainSetId);
    if (failure.failedSetId !== failure.mainSetId) {
      invalidateSbcCache(failure.failedSetId);
    }
    invalidateInventorySnapshot("club");
    invalidateInventorySnapshot("storage");
    await fetchPlayers({ force: true });
    context.stopKind = undefined;
    context.stopReason = undefined;
    return {
      success: true,
      attempted: true,
      completedRuns,
      fallbackSetName: fallbackEvent?.fallbackSetName,
    };
  } catch (error) {
    const reason = String(
      error?.message || error || "求解失败补偿执行失败。"
    );
    console.error("[FCX][Routine] solve failure fallback failed", error);
    return {
      success: false,
      attempted: true,
      fatal: true,
      completedRuns,
      stopKind: "invalid",
      reason,
    };
  } finally {
    context.isSolveFailureFallback = false;
  }
};

const executeRoutineStepWithFallback = async (
  routine,
  step,
  requestedRuns,
  context
) => {
  const firstResult = await executeRoutineStepWithTotwFallback(
    routine,
    step,
    requestedRuns,
    context
  );
  const firstCompleted = Number(firstResult.completedRuns || 0);
  if (!shouldTriggerSolveFailureFallback(
    routine.solveFailureFallback?.enabled === true,
    firstResult.stopKind
  )) {
    return firstResult;
  }

  const failure = firstResult.solveFailure || {
    source: "main_step",
    failedSetId: Number(firstResult.setId || step.setId),
    failedSetName: String(firstResult.setName || `SBC ${step.setId}`),
    mainStepId: String(step.id),
    mainSetId: Number(firstResult.setId || step.setId),
    mainStepName: String(firstResult.setName || `SBC ${step.setId}`),
    reason: String(firstResult.reason || "当前球员范围内没有可行方案。"),
  };
  const fallbackEvent = {
    occurredAt: new Date().toISOString(),
    cycle: Math.max(0, Number(context.cycle || 0)),
    stepIndex: Math.max(0, Number(context.stepIndex || 0)),
    mainStepId: failure.mainStepId,
    mainSetId: failure.mainSetId,
    mainStepName: failure.mainStepName,
    failureSource: failure.source,
    failedSetId: failure.failedSetId,
    failedSetName: failure.failedSetName,
    failureReason: failure.reason,
    fallbackSetId: Number(routine.solveFailureFallback.setId),
    requestedRuns: Number(routine.solveFailureFallback.runs),
    completedRuns: 0,
    outcome: "started",
  };
  context.solveFailureFallbackEvents ||= [];
  context.solveFailureFallbackEvents.push(fallbackEvent);
  console.warn("[FCX][Routine] 求解失败补偿已触发", {
    mainStepId: failure.mainStepId,
    mainSetId: failure.mainSetId,
    mainStepName: failure.mainStepName,
    failureSource: failure.source,
    failedSetId: failure.failedSetId,
    failedSetName: failure.failedSetName,
    reason: failure.reason,
    fallbackSetId: Number(routine.solveFailureFallback.setId),
    requestedRuns: Number(routine.solveFailureFallback.runs),
  });

  const hasPendingOriginalRewards = Boolean(
    firstResult.execution
    && hasPendingTrackedRewards(firstResult.execution.rewardPlan)
  );
  if (hasPendingOriginalRewards) {
    const rewardResult = await openRoutineRewards(
      firstResult,
      context,
      firstResult.setName || `SBC ${step.setId}`
    );
    if (!rewardResult.ok) {
      fallbackEvent.outcome = "fallback_failed";
      fallbackEvent.reason =
        rewardResult.reason || context.stopReason || "原步骤奖励处理失败。";
      return {
        ...firstResult,
        rewardPackIds: [],
        rewardPlayerPickIds: [],
        progressUnits: firstCompleted,
        stopKind: "pack_failed",
        reason:
          rewardResult.reason
          || context.stopReason
          || "原步骤已完成部分任务，但奖励处理失败。",
      };
    }
    firstResult.rewardPackIds = [];
    firstResult.rewardPlayerPickIds = [];
  }

  // The original no-solution stays on firstResult/fallbackEvent. Shared
  // context markers belong to fatal runtime errors only.
  context.stopKind = undefined;
  context.stopReason = undefined;
  const recovery = await runSolveFailureFallback(
    routine,
    context,
    step,
    firstResult,
    fallbackEvent
  );
  const recoveryProgress = Number(recovery.completedRuns || 0);
  fallbackEvent.completedRuns = recoveryProgress;
  if (recovery.fallbackSetName) {
    fallbackEvent.fallbackSetName = recovery.fallbackSetName;
  }
  if (!recovery.success) {
    fallbackEvent.outcome = recovery.fatal
      ? "fallback_failed"
      : "fallback_unavailable";
    fallbackEvent.reason = recovery.reason || "求解失败补偿未能完成。";
    if (recovery.fatal) {
      return {
        ...firstResult,
        completedRuns: firstCompleted,
        rewardPackIds: [],
        rewardPlayerPickIds: [],
        progressUnits: firstCompleted + recoveryProgress,
        stopKind: recovery.stopKind || "invalid",
        reason: recovery.reason || "求解失败补偿执行失败。",
      };
    }
    return {
      ...firstResult,
      completedRuns: firstCompleted,
      rewardPackIds: [],
      rewardPlayerPickIds: [],
      progressUnits: firstCompleted + recoveryProgress,
      reason: recovery.reason
        ? `${firstResult.reason || "原步骤求解无解"} ${recovery.reason}`
        : firstResult.reason,
    };
  }

  const remaining = requestedRuns === -1
    ? -1
    : Math.max(0, Number(requestedRuns || 0) - firstCompleted);
  if (remaining === 0) {
    fallbackEvent.outcome = "fallback_completed";
    return {
      ...firstResult,
      completedRuns: firstCompleted,
      rewardPackIds: [],
      rewardPlayerPickIds: [],
      progressUnits: firstCompleted + recoveryProgress,
      stopKind: "done",
      reason: undefined,
    };
  }

  reportOperationStatus(
    "SBC",
    `求解失败补偿已完成 ${recoveryProgress} 次，正在重试步骤“${firstResult.setName || `SBC ${step.setId}`}”`
  );
  context.stopKind = undefined;
  context.stopReason = undefined;
  const retryResult = await executeRoutineStepWithTotwFallback(
    routine,
    step,
    remaining,
    context
  );
  const totalCompleted = firstCompleted + Number(retryResult.completedRuns || 0);
  fallbackEvent.retryStopKind = retryResult.stopKind;
  fallbackEvent.retryReason = retryResult.reason;
  fallbackEvent.outcome = retryResult.stopKind === "done"
    ? "retry_succeeded"
    : retryResult.stopKind === "no_solution"
      ? "retry_no_solution"
      : "retry_failed";
  fallbackEvent.reason = retryResult.stopKind === "done"
    ? `完成补偿 ${recoveryProgress} 次后，原步骤重试成功。`
    : retryResult.reason;
  console.info("[FCX][Routine] 求解失败补偿结束", {
    mainStepId: fallbackEvent.mainStepId,
    failedSetId: fallbackEvent.failedSetId,
    fallbackSetId: fallbackEvent.fallbackSetId,
    fallbackSetName: fallbackEvent.fallbackSetName,
    completedRuns: fallbackEvent.completedRuns,
    outcome: fallbackEvent.outcome,
    retryStopKind: fallbackEvent.retryStopKind,
    retryReason: fallbackEvent.retryReason,
  });
  const retryReason = retryResult.stopKind === "no_solution"
    ? `完成补偿后步骤“${retryResult.setName || firstResult.setName || `SBC ${step.setId}`}”仍无法求解：${retryResult.reason || "当前球员范围内没有可行方案。"}`
    : retryResult.reason;
  return {
    ...retryResult,
    completedRuns: totalCompleted,
    progressUnits: totalCompleted + recoveryProgress,
    ...(retryReason ? { reason: retryReason } : { reason: undefined }),
  };
};

const runSbcWithTotwFallback = async ({
  set,
  challengeId,
  mode,
  requestedRuns,
  ignoreValue,
  autoOpen,
  fallback,
  wholeSetPreview = false,
}) => {
  if (hasBlockingFcxTask()) {
    queueFcxNotification([
      "当前FCX任务尚未结束，请稍候。",
      UINotificationType.NEGATIVE,
    ]);
    return;
  }
  if (!fallback?.enabled) {
    if (mode === "set") {
      return solveSbcSet(set.id, true, autoOpen, {
        ignoreValue,
        requestedRuns,
        wholeSetPreview,
      });
    }
    return solveSBC(set.id, challengeId, true, null, autoOpen, false, {
      ignoreValue,
      requestedRuns,
    });
  }
  if (Number(fallback.setId) === Number(set.id)) {
    queueFcxNotification([
      "周黑补给 SBC 不能与当前目标 SBC 相同。",
      UINotificationType.NEGATIVE,
    ]);
    return;
  }

  beginRoutineTask();
  const routine = {
    id: `manual-special-fallback-${Date.now()}`,
    origin: "custom",
    name: `${set.name} · 缺周黑自动补给`,
    description: "普通 SBC 详情页临时补给流程",
    mode: "exhaust_step",
    totalCycles: 1,
    ignoreValue: ignoreValue === true,
    steps: [{
      kind: "sbc",
      id: "target",
      setId: Number(set.id),
      runs: requestedRuns,
    }],
    totwFallback: { ...fallback },
    solveFailureFallback: { enabled: false, setId: 0, runs: 1 },
    storageFallback: fcxStorageOverflowFallbackStore.get(),
  };
  const context = createRoutineContext(routine);
  runtimeState.activeRoutineExecution = context;
  holdTaskOverlay();

  const attemptTarget = async (runs) => {
    const options = {
      ignoreValue: ignoreValue === true,
      requestedRuns: runs,
      detectSpecialShortage: true,
      autoOpenRewards: false,
      deferRewards: true,
      deferSummary: true,
      wholeSetPreview: wholeSetPreview === true && mode === "set",
    };
    const execution = createSbcExecutionContext(options);
    if (mode === "set") {
      await solveSbcSet(set.id, true, false, options, execution);
    } else {
      await solveSBC(
        set.id,
        challengeId,
        true,
        null,
        false,
        false,
        options,
        execution
      );
    }
    if (autoOpen && hasPendingTrackedRewards(execution.rewardPlan)) {
      const rewardResult = await openRoutineRewards(
        { execution },
        context,
        `主线 ${set.name}`
      );
      if (!rewardResult.ok && !execution.stoppedReason) {
        execution.stoppedReason =
          rewardResult.reason || context.stopReason || "主线奖励包处理失败。";
      }
    } else {
      mergePackTaskSummary(context.packSummary, execution.packSummary);
    }
    return execution;
  };

  try {
    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns,
      attempt: attemptTarget,
      replenish: async ({ cycle, completedRuns, remainingRuns }) => {
        const targetLabel = requestedRuns === -1
          ? `${completedRuns} / 持续执行`
          : `${completedRuns} / ${requestedRuns}`;
        reportOperationStatus(
          "SBC",
          `主线进度 ${targetLabel} · 正在执行第 ${cycle} 轮周黑补给`
        );
        console.info("[FCX][SBC] normal fallback cycle", {
          cycle,
          completedRuns,
          remainingRuns,
          fallbackRuns: Number(fallback.runs || 1),
        });
        const replenished = await runTotwFallback(routine, context);
        if (!replenished.success) {
          context.stopKind = replenished.stopKind || "invalid";
          context.stopReason = replenished.reason || "周黑自动补给失败。";
        }
        if (
          !replenished.success &&
          (context.cancelled || isTaskCancellationRequested()) &&
          !context.stopReason
        ) {
          context.stopKind = "cancelled";
          context.stopReason = "用户结束了任务。";
        }
        return replenished.success;
      },
    });
    const targetExecution = outcome.result;
    targetExecution.completedRuns = outcome.totalCompletedRuns;
    if (outcome.replenishmentFailed) {
      const reason = context.stopReason || "周黑自动补给失败。";
      context.stopReason = reason;
      queueFcxNotification([reason, UINotificationType.NEGATIVE]);
      return targetExecution;
    }
    if (outcome.stoppedForNoProgress) {
      const reason =
        "周黑补给后主线仍未找到可用特殊卡，已停止以避免重复补给。请检查排除特殊卡、球员保护和价值设置。";
      targetExecution.stoppedReason = reason;
      context.stopKind = "invalid";
      context.stopReason = reason;
      queueFcxNotification([
        reason,
        UINotificationType.NEGATIVE,
      ]);
      return targetExecution;
    }
    if (requestedRuns !== -1 && outcome.totalCompletedRuns >= requestedRuns) {
      targetExecution.specialShortage = undefined;
      targetExecution.stoppedReason = undefined;
      reportOperationStatus(
        "SBC",
        `主线已完成 ${outcome.totalCompletedRuns} / ${requestedRuns}`,
        "success"
      );
      queueFcxNotification([
        `主线已完成 ${outcome.totalCompletedRuns} / ${requestedRuns}`,
        UINotificationType.POSITIVE,
      ]);
      return targetExecution;
    }
    if (targetExecution.specialShortage) {
      const reason =
        "主线仍缺少所需特殊卡，任务已停止。";
      targetExecution.stoppedReason = reason;
      context.stopReason = reason;
      queueFcxNotification([reason, UINotificationType.NEGATIVE]);
      return targetExecution;
    }
    if (targetExecution.stoppedReason) {
      context.stopReason = targetExecution.stoppedReason;
    }
    return targetExecution;
  } catch (error) {
    const reason = String(error?.message || error || "周黑自动补给执行失败。");
    context.stopKind = "invalid";
    context.stopReason = reason;
    console.error("[FCX][Routine] manual fallback failed", error);
    queueFcxNotification([reason, UINotificationType.NEGATIVE]);
  } finally {
    runtimeState.activeRoutineExecution = undefined;
    releaseTaskOverlay();
    if (
      context.packSummary.packsOpened > 0 ||
      context.packSummary.picksCompleted > 0 ||
      context.packSummary.players.length > 0 ||
      context.packSummary.sbcSubmissions.length > 0
    ) {
      context.packSummary.stoppedReason = context.stopReason;
      showPackTaskSummary(context.packSummary, { ignoreValue: ignoreValue === true });
    }
    createSBCTab();
  }
};

const getRoutinePackInventory = async () => {
  const response = await getPacks();
  return (response?.packs || []).filter(
    (pack) =>
      pack.isMyPack || pack?.prices?._collection?.COINS?.amount < 101
  );
};

const executeRoutinePackStep = async (routine, step, context) => {
  if (context.cancelled || isTaskCancellationRequested()) {
    return {
      stepId: step.id,
      stepKind: "pack",
      packId: step.packId,
      completedRuns: 0,
      packsOpened: 0,
      progressUnits: 0,
      rewardPackIds: [],
      stopKind: "cancelled",
      reason: "用户结束了任务。",
    };
  }

  const inventory = await getRoutinePackInventory();
  const matching = inventory.filter(
    (pack) =>
      Number(pack.id) === Number(step.packId)
      && Boolean(pack.tradeable) === Boolean(step.tradable)
  );
  const available = matching.length;
  if (available <= 0) {
    reportOperationStatus(
      "Pack",
      `跳过开包步骤 · ${step.packName || `卡包 #${step.packId}`} 当前无库存`
    );
    return {
      stepId: step.id,
      stepKind: "pack",
      packId: step.packId,
      completedRuns: 0,
      packsOpened: 0,
      progressUnits: 0,
      rewardPackIds: [],
      stopKind: "unavailable",
      reason: `${step.packName || `卡包 #${step.packId}`} 当前无库存。`,
    };
  }

  const requested = step.runs === -1
    ? available
    : Math.min(available, Math.max(1, Number(step.runs || 1)));
  const packName = step.packName || `卡包 #${step.packId}`;
  reportOperationStatus(
    "Pack",
    `逐轮开包 · ${packName} · ${requested} / ${available}`
  );
  const packExecution = createSbcExecutionContext({
    ignoreValue: routine.ignoreValue === true,
    storageFallback:
      routine.storageFallback || { enabled: false, setId: 0, runs: 1 },
  });
  packExecution.storageRecoveryCount = Number(context.storageRecoveryCount || 0);
  const result = await runPackSelections(
    [{
      id: Number(step.packId),
      tradable: Boolean(step.tradable),
      quantity: requested,
    }],
    readPackRunOptions(),
    ({ opened, total }) => {
      reportOperationStatus(
        "Pack",
        `逐轮开包 · ${packName} · ${opened} / ${total}`
      );
    },
    {
      internal: true,
      showSummary: false,
      allowPlayerPicks: true,
      onStorageFull: createStorageOverflowRecovery(packExecution),
      summary: context.packSummary,
    }
  );
  context.storageRecoveryCount = Number(packExecution.storageRecoveryCount || 0);
  if (result.summary !== context.packSummary) {
    mergePackTaskSummary(context.packSummary, result.summary);
  }
  const opened = Number(result.opened || 0);
  const cancelled = result.cancelled || isTaskCancellationRequested();
  return {
    stepId: step.id,
    stepKind: "pack",
    packId: step.packId,
    completedRuns: 0,
    packsOpened: opened,
    progressUnits: opened,
    rewardPackIds: [],
    stopKind: cancelled ? "cancelled" : result.stopped ? "pack_failed" : "done",
    ...(result.reason ? { reason: result.reason } : {}),
  };
};

const routineHasTaskResults = (summary) =>
  summary.packsOpened > 0
  || summary.picksCompleted > 0
  || summary.players.length > 0
  || summary.sbcSubmissions.length > 0;

const finalizeRoutineResult = (routine, context) => {
  if (context.stopReason && context.stopReason !== "流程已完成。") {
    context.packSummary.stoppedReason = context.stopReason;
  }
  void saveTaskHistory({
    type: "routine",
    title: routine.name,
    summary: context.packSummary,
    recoveryErrors: context.recoveryErrors,
    solveFailureFallbackEvents: context.solveFailureFallbackEvents,
  });
  if (routineHasTaskResults(context.packSummary)) {
    showPackTaskSummary(context.packSummary, {
      ignoreValue: routine.ignoreValue === true,
    });
    return;
  }
  if (!context.stopReason || context.stopReason === "流程已完成。") return;
  const content = document.createElement("div");
  content.className = "fcx-routine-result";
  const reason = document.createElement("p");
  reason.className = "fcx-pack-summary__reason";
  reason.textContent = context.stopReason;
  content.appendChild(reason);
  const modal = openFcxModal({
    id: "fcx-routine-result-modal",
    title: "任务未完成",
    description: "本次任务没有提交SBC、开启卡包或获得球员。",
    content,
  });
  const done = document.createElement("button");
  done.type = "button";
  done.className = "fcx-button fcx-button--primary";
  done.textContent = "完成";
  done.addEventListener("click", modal.close);
  modal.footer.appendChild(done);
};

const runFcxRoutine = async (routine, recoveryCheckpoint = undefined) => {
  if (hasBlockingFcxTask()) {
    queueFcxNotification([
      "当前FCX任务尚未结束，请稍候。",
      UINotificationType.NEGATIVE,
    ]);
    return;
  }
  beginRoutineTask();
  const context = createRoutineContext(routine, recoveryCheckpoint);
  const resumeMode = recoveryCheckpoint?.recoveryMode;
  let startCursor = resumeMode === "resume"
    ? { ...recoveryCheckpoint.cursor }
    : { cycle: 0, stepIndex: 0, completedInStep: 0 };
  runtimeState.activeRoutineExecution = context;
  holdTaskOverlay();
  const automaticRecoveryEnabled = routine.fatalRecoveryEnabled === true;
  const recoveryMaxReloads = normalizeRoutineRecoveryMaxReloads(
    routine.fatalRecoveryMaxReloads
  );
  let checkpointAvailable = automaticRecoveryEnabled;
  let pageRecoveryScheduled = false;
  if (automaticRecoveryEnabled) {
    try {
      persistRoutineRecoveryCheckpoint(routine, context);
    } catch (error) {
      checkpointAvailable = false;
      console.warn("[FCX][Routine] recovery checkpoint unavailable", error);
    }
  } else {
    fcxRoutineRecoveryStore.clear();
  }
  queueFcxNotification([
    recoveryCheckpoint
      ? `永动机已在刷新后自动恢复：${routine.name}`
      : `永动机滚卡已启动：${routine.name}`,
    UINotificationType.POSITIVE,
  ]);
  console.info("[FCX][Routine] started", {
    id: routine.id,
    mode: routine.mode,
    automaticRecoveryEnabled,
    recoveryMode: routine.fatalRecoveryMode || "restart",
    recoveryMaxReloads,
    resumed: Boolean(recoveryCheckpoint),
  });
  try {
    if (context.pendingOperation) {
      await reconcileRoutinePendingOperation(routine, context);
    }
    if (resumeMode === "restart") {
      context.cycle = 0;
      context.stepIndex = 0;
      context.currentStepCompleted = 0;
      context.completedByStep = {};
      startCursor = { cycle: 0, stepIndex: 0, completedInStep: 0 };
      if (checkpointAvailable) persistRoutineRecoveryCheckpoint(routine, context);
    } else if (resumeMode === "resume") {
      startCursor = {
        cycle: context.cycle,
        stepIndex: context.stepIndex,
        completedInStep: context.currentStepCompleted,
      };
    }
    if (context.pendingReward) {
      reportOperationStatus("Pack", "正在处理刷新前已确认、但尚未完成的奖励");
      const pendingResult = restorePendingRoutineRewardResult(context.pendingReward);
      const rewardResult = await openRoutineRewards(
        pendingResult,
        context,
        `SBC ${pendingResult.setId}`
      );
      if (!rewardResult.ok) {
        context.stopKind = "pack_failed";
        throw new Error(
          rewardResult.reason
          || context.stopReason
          || "中断前的奖励处理恢复失败。"
        );
      }
      context.pendingReward = undefined;
      if (checkpointAvailable) persistRoutineRecoveryCheckpoint(routine, context);
    }
    if (resumeMode === "restart") {
      reportOperationStatus("Routine", `正在从头重新执行：${routine.name}`);
    } else if (resumeMode === "resume") {
      reportOperationStatus(
        "Routine",
        `正在从中断处恢复：${routine.name} · 第 ${context.cycle + 1} 轮第 ${context.stepIndex + 1} 步`
      );
    }
    if (recoveryCheckpoint) {
      console.info("[FCX][Routine] 即将按检查点恢复流程", {
        routineId: routine.id,
        routineName: routine.name,
        recoveryMode: resumeMode,
        cursor: startCursor,
        pendingOperationReconciled: !context.pendingOperation,
        pendingRewardReconciled: !context.pendingReward,
      });
    }
    const schedule = await runRoutineSchedule(routine, {
      isCancelled: () =>
        context.cancelled || isTaskCancellationRequested(),
      onCycleStart: (cycle, totalCycles) => {
        context.cycle = cycle;
        reportOperationStatus(
          "Routine",
          totalCycles === -1
            ? `正在执行第 ${cycle + 1} 轮 · 持续循环`
            : `正在执行第 ${cycle + 1} / ${totalCycles} 轮`
        );
      },
      onCursorChange: (cursor) => {
        context.cycle = cursor.cycle;
        context.stepIndex = cursor.stepIndex;
        context.currentStepCompleted = cursor.completedInStep;
        if (!checkpointAvailable) return;
        try {
          persistRoutineRecoveryCheckpoint(routine, context);
        } catch (error) {
          checkpointAvailable = false;
          console.warn("[FCX][Routine] failed to update recovery checkpoint", error);
        }
      },
      runStep: async (step, requestedRuns) => {
        context.stepIndex = routine.steps.findIndex((candidate) => candidate.id === step.id);
        const completedBeforeRun = Number(context.completedByStep[step.id] || 0);
        const result = step.kind === "pack"
          ? await executeRoutinePackStep(routine, step, context)
          : await executeRoutineStepWithFallback(
              routine,
              step,
              requestedRuns,
              context
            );
        context.completedByStep[step.id] = Math.max(
          Number(context.completedByStep[step.id] || 0),
          completedBeforeRun + Number(result.completedRuns || result.packsOpened || 0)
        );
        context.results.push(...serializableRoutineResults([result]));
        return result;
      },
      openRewards: async (result) => {
        if (result?.execution) {
          context.pendingReward = snapshotPendingRoutineReward(result);
          if (checkpointAvailable) {
            try {
              persistRoutineRecoveryCheckpoint(routine, context);
            } catch (error) {
              checkpointAvailable = false;
              console.warn("[FCX][Routine] failed to save pending reward checkpoint", error);
            }
          }
        }
        const rewardResult = await openRoutineRewards(
          result,
          context,
          `SBC ${result.setId}`
        );
        if (rewardResult.ok) context.pendingReward = undefined;
        else if (result?.execution) context.pendingReward = snapshotPendingRoutineReward(result);
        if (checkpointAvailable) {
          try {
            persistRoutineRecoveryCheckpoint(routine, context);
          } catch (error) {
            checkpointAvailable = false;
            console.warn("[FCX][Routine] failed to save reward checkpoint", error);
          }
        }
        return rewardResult.ok;
      },
    }, startCursor);
    context.notices = [...new Set([...(context.notices || []), ...(schedule.notices || [])])];
    const noticeText = context.notices.join("；");
    if (noticeText && (!schedule.stoppedReason || /所有步骤均无进展/.test(schedule.stoppedReason))) {
      context.stopReason = `流程已结束，但有步骤被跳过：${noticeText}`;
    } else if (schedule.stoppedReason && !context.stopReason) {
      context.stopReason = noticeText
        ? `${schedule.stoppedReason} ${noticeText}`
        : schedule.stoppedReason;
    }
    if (!context.stopReason) context.stopReason = context.notices.length
      ? "流程已结束，但有步骤未能完成。"
      : "流程已完成。";
    const recoveryFailure = resolveRoutineRecoveryFailure({
      results: schedule.results,
      contextStopKind: context.stopKind,
      contextStopReason: context.stopReason,
      scheduleStoppedReason: schedule.stoppedReason,
    });
    const lastFatalResult = recoveryFailure?.result;
    if (recoveryFailure) {
      context.stopKind = recoveryFailure.stopKind;
    } else {
      // Auxiliary SBCs may leave a transient invalid marker in the shared
      // context. A nonfatal no-solution/exhausted result must never inherit it.
      context.stopKind = undefined;
    }
    if (
      checkpointAvailable
      && !context.cancelled
      && !isTaskCancellationRequested()
      && isRecoverableRoutineFailure(context.stopKind)
      && context.recoveryReloadCount < recoveryMaxReloads
    ) {
      context.recoveryReloadCount += 1;
      const delayMs = routineRecoveryDelayMs(context.recoveryReloadCount);
      const errorEvent = createRoutineRecoveryError({
        routine,
        context,
        stopKind: context.stopKind,
        reason: recoveryFailure?.reason || context.stopReason,
        result: lastFatalResult,
        reloadAttempt: context.recoveryReloadCount,
        maxReloads: recoveryMaxReloads,
      });
      pageRecoveryScheduled = await waitForScheduledRoutineReload({
        routine,
        context,
        delayMs,
        errorEvent,
      });
    }
    if (pageRecoveryScheduled) return;
    if (
      isRecoverableRoutineFailure(context.stopKind)
      && context.recoveryReloadCount >= recoveryMaxReloads
    ) {
      context.stopReason = `${context.stopReason} 已达到自动刷新恢复上限（${recoveryMaxReloads}次）。`;
    }
    queueFcxNotification([
      context.cancelled || isTaskCancellationRequested()
        ? "永动机滚卡已结束。"
        : context.stopReason,
      context.cancelled || isTaskCancellationRequested()
        ? UINotificationType.NEUTRAL
        : context.notices.length
          ? UINotificationType.NEUTRAL
          : UINotificationType.POSITIVE,
    ]);
  } catch (error) {
    context.stopKind = "invalid";
    context.stopReason = String(error?.message || error || "永动机滚卡执行失败。");
    console.error("[FCX][Routine] failed", error);
    if (
      checkpointAvailable
      && !context.cancelled
      && !isTaskCancellationRequested()
      && context.recoveryReloadCount < recoveryMaxReloads
    ) {
      context.recoveryReloadCount += 1;
      const delayMs = routineRecoveryDelayMs(context.recoveryReloadCount);
      const errorEvent = createRoutineRecoveryError({
        routine,
        context,
        stopKind: context.stopKind,
        reason: context.stopReason,
        source: error,
        reloadAttempt: context.recoveryReloadCount,
        maxReloads: recoveryMaxReloads,
      });
      pageRecoveryScheduled = await waitForScheduledRoutineReload({
        routine,
        context,
        delayMs,
        errorEvent,
      });
    }
    if (!pageRecoveryScheduled) {
      if (context.recoveryReloadCount >= recoveryMaxReloads) {
        context.stopReason = `${context.stopReason} 已达到自动刷新恢复上限（${recoveryMaxReloads}次）。`;
      }
      queueFcxNotification([context.stopReason, UINotificationType.NEGATIVE]);
    }
  } finally {
    runtimeState.activeRoutineExecution = undefined;
    releaseTaskOverlay();
    if (pageRecoveryScheduled) {
      requestRoutinePageReload();
      return;
    }
    fcxRoutineRecoveryStore.clear();
    finalizeRoutineResult(routine, context);
    createSBCTab();
  }
};

const routineRecoveryReadinessLabels = {
  document: "等待网页基础结构加载",
  services: "等待EA服务初始化",
  user: "等待EA账号服务初始化",
  store: "等待EA卡包仓库初始化",
  persona: "等待EA账号身份就绪",
  home: "等待EA自动进入首页",
  loading: "等待EA首页加载完成",
  task: "等待当前FCX任务结束",
};

const isVisiblePageElement = (element) => {
  if (!element || element.nodeType !== 1 || !element.isConnected) return false;
  const style = window.getComputedStyle(element);
  const rendered = typeof element.getClientRects !== "function"
    || element.getClientRects().length > 0;
  return rendered
    && style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity || 1) > 0;
};

const isNativeEaHomeReady = () => {
  if (isVisiblePageElement(runtimeState.eaHomeRoot)) return true;
  const domHome = document.querySelector(".ut-home-hub-view");
  if (isVisiblePageElement(domHome)) return true;
  try {
    const flow = getCurrentViewController();
    const current = flow?.getCurrentController?.();
    const controller = current?.childViewControllers?.[0] || current;
    return typeof UTHomeHubViewController !== "undefined"
      && controller?.constructor === UTHomeHubViewController;
  } catch {
    return false;
  }
};

const isEaInitialLoaderVisible = () =>
  [...document.querySelectorAll(".loaderIcon")].some(isVisiblePageElement);

const readRecoveryPersonaId = () => {
  try {
    return getCurrentPersonaId({ required: true });
  } catch {
    return undefined;
  }
};

const readRoutineRecoveryReadiness = (checkpoint) => evaluateRoutineRecoveryReadiness({
  documentReadyState: document.readyState,
  services: typeof services !== "undefined" ? services : undefined,
  repositories: typeof repositories !== "undefined" ? repositories : undefined,
  personaId: readRecoveryPersonaId(),
  expectedPersonaId: checkpoint.personaId,
  homeReady: isNativeEaHomeReady(),
  initialLoaderVisible: isEaInitialLoaderVisible(),
});

const normalizeRecoveryCheckpointRoutine = (checkpoint) => {
  const origin = checkpoint.routine?.origin === "builtin" ? "builtin" : "custom";
  const routine = normalizeRoutine(checkpoint.routine, origin);
  if (!routine || routine.id !== checkpoint.routine?.id) {
    throw new Error("恢复检查点中的流程快照无效，未执行任何其他流程。");
  }
  return { ...checkpoint, routine };
};

const waitForRoutineRecoveryReadiness = async (initialCheckpoint) => {
  let checkpoint = initialCheckpoint;
  let lastReason;
  while (checkpoint) {
    const readiness = readRoutineRecoveryReadiness(checkpoint);
    if (readiness.terminal) {
      fcxRoutineRecoveryStore.clear();
      throw new Error("恢复检查点属于其他EA账号，已取消本次自动恢复。");
    }
    const localReason = readiness.ready && hasBlockingFcxTask()
      ? "task"
      : readiness.reason;
    if (localReason !== lastReason) {
      lastReason = localReason;
      if (localReason !== "ready") {
        console.info("[FCX][Routine] 检测到待恢复任务，尚未访问EA业务接口", {
          routineId: checkpoint.routine.id,
          state: localReason,
          message: routineRecoveryReadinessLabels[localReason],
        });
      }
    }
    if (readiness.ready && !hasBlockingFcxTask()) {
      await delayMilliseconds(ROUTINE_RECOVERY_HOME_STABLE_MS);
      checkpoint = fcxRoutineRecoveryStore.load();
      if (!checkpoint) return undefined;
      const stable = readRoutineRecoveryReadiness(checkpoint);
      if (stable.ready && !hasBlockingFcxTask()) return checkpoint;
    }
    await delayMilliseconds(ROUTINE_RECOVERY_READY_POLL_MS);
    checkpoint = fcxRoutineRecoveryStore.load();
  }
  return undefined;
};

let routineRecoveryBootstrapPromise;
const resumePendingRoutineRecovery = () => {
  if (routineRecoveryBootstrapPromise) return routineRecoveryBootstrapPromise;
  routineRecoveryBootstrapPromise = (async () => {
    let checkpoint;
    try {
      checkpoint = fcxRoutineRecoveryStore.load();
    } catch (error) {
      console.warn("[FCX][Routine] 无法读取恢复检查点", error);
      return;
    }
    if (!checkpoint) return;
    try {
      checkpoint = normalizeRecoveryCheckpointRoutine(checkpoint);
    } catch (error) {
      fcxRoutineRecoveryStore.clear();
      queueFcxNotification([String(error?.message || error), UINotificationType.NEGATIVE]);
      return;
    }
    console.info("[FCX][Routine] 检测到恢复检查点", {
      routineId: checkpoint.routine.id,
      routineName: checkpoint.routine.name,
      recoveryMode: checkpoint.recoveryMode,
      reloadCount: checkpoint.reloadCount,
      cursor: checkpoint.cursor,
      pendingOperation: checkpoint.pendingOperation?.kind,
      pendingReward: Boolean(checkpoint.pendingReward),
    });

    if (checkpoint.recoveryMode === "stop") {
      let personaId = readRecoveryPersonaId();
      while (!personaId) {
        await delayMilliseconds(ROUTINE_RECOVERY_READY_POLL_MS);
        checkpoint = fcxRoutineRecoveryStore.load();
        if (!checkpoint) return;
        personaId = readRecoveryPersonaId();
      }
      if (String(personaId) !== String(checkpoint.personaId)) {
        fcxRoutineRecoveryStore.clear();
        queueFcxNotification([
          "恢复检查点属于其他EA账号，已取消本次自动恢复。",
          UINotificationType.NEGATIVE,
        ]);
        return;
      }
      fcxRoutineRecoveryStore.clear();
      const context = createRoutineContext(checkpoint.routine, checkpoint);
      context.stopReason = checkpoint.lastError || "流程已按设置在刷新后停止。";
      finalizeRoutineResult(checkpoint.routine, context);
      queueFcxNotification(["永动机已按设置在刷新后停止。", UINotificationType.NEUTRAL]);
      return;
    }

    try {
      checkpoint = await waitForRoutineRecoveryReadiness(checkpoint);
    } catch (error) {
      console.warn("[FCX][Routine] 恢复任务就绪检查失败", error);
      queueFcxNotification([String(error?.message || error), UINotificationType.NEGATIVE]);
      return;
    }
    if (!checkpoint) return;
    console.info("[FCX][Routine] EA首页和恢复依赖已就绪", {
      routineId: checkpoint.routine.id,
      routineName: checkpoint.routine.name,
      recoveryMode: checkpoint.recoveryMode,
      cursor: checkpoint.cursor,
    });
    invalidateSbcCache(undefined, { catalog: true });
    fcxInventoryCache.invalidate(checkpoint.personaId);
    fcxAutoSbcSessionSnapshot.invalidate();
    await runFcxRoutine(checkpoint.routine, checkpoint);
  })().finally(() => {
    routineRecoveryBootstrapPromise = undefined;
  });
  return routineRecoveryBootstrapPromise;
};
