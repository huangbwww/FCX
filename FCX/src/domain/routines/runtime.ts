// @ts-nocheck
// Runtime bridge between the typed routine scheduler and EA's private SBC entities.

const createRoutineContext = (routine) => ({
  id: `fcx-routine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  routineId: routine.id,
  mode: routine.mode,
  cancelled: false,
  cycle: 0,
  stepIndex: 0,
  totalCycles: routine.totalCycles === -1 ? -1 : Number(routine.totalCycles || 5),
  completedByStep: {},
  results: [],
  packSummary: createPackTaskSummary(),
  storageFallback: routine.storageFallback || { enabled: false, setId: 0, runs: 1 },
  storageRecoveryCount: 0,
  isTotwFallback: false,
  isSolveFailureFallback: false,
});

const beginRoutineTask = () => {
  resetTaskCancellation();
};

const openRoutineRewards = async (result, context, label) => {
  if (!result?.execution) {
    return true;
  }
  if (!hasPendingTrackedRewards(result.execution.rewardPlan)) {
    mergePackTaskSummary(context.packSummary, result.execution.packSummary);
    return true;
  }
  if (context.cancelled || isTaskCancellationRequested()) return false;
  showLoader(true);
  reportOperationStatus("Pack", `正在处理 ${label} 的准确奖励包`);
  const execution = result.execution;
  execution.storageRecoveryCount = Number(context.storageRecoveryCount || 0);
  const opened = await openSbcRewardPlan(execution);
  context.storageRecoveryCount = Number(execution.storageRecoveryCount || 0);
  mergePackTaskSummary(context.packSummary, execution.packSummary);
  if (!opened) {
    context.stopKind = "pack_failed";
    context.stopReason = execution.stoppedReason || `${label} 的奖励处理失败。`;
  }
  return opened;
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
  if (!fallback?.enabled) return false;
  context.isTotwFallback = true;
  try {
    for (let index = 0; index < fallback.runs; index += 1) {
      if (context.cancelled || isTaskCancellationRequested()) return false;
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
        context.stopKind = result.stopKind === "cancelled" ? "cancelled" : "invalid";
        context.stopReason =
          result.reason || `周黑补给 SBC ${fallback.setId} 未能完整完成。`;
        return false;
      }
      if (!result.rewardPackIds.length && !result.rewardPlayerPickIds?.length) {
        context.stopKind = "pack_failed";
        context.stopReason = "周黑补给已完成，但没有读取到对应的整组奖励包。";
        return false;
      }
      if (!(await openRoutineRewards(result, context, "周黑补给"))) {
        return false;
      }
    }
    invalidateSbcCache();
    invalidateInventorySnapshot("club");
    invalidateInventorySnapshot("storage");
    await fetchPlayers({ force: true });
    return true;
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
      const opened = await openRoutineRewards(
        result,
        context,
        result.setName || `SBC ${step.setId}`
      );
      if (!opened) {
        result = {
          ...result,
          rewardPackIds: [],
          rewardPlayerPickIds: [],
          stopKind: "pack_failed",
          reason: context.stopReason,
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
        context.stopKind = "invalid";
        context.stopReason = "周黑补给 SBC 不能与当前目标 SBC 相同。";
        return false;
      }
      return runTotwFallback(routine, context);
    },
  });
  const result = outcome.result.value;
  const totalCompleted = outcome.totalCompletedRuns;

  if (outcome.replenishmentFailed) {
    return {
      ...result,
      completedRuns: totalCompleted,
      rewardPackIds: [],
      rewardPlayerPickIds: [],
      stopKind: context.stopKind || "invalid",
      reason: context.stopReason || "周黑自动补给失败。",
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
  failedResult
) => {
  const fallback = routine.solveFailureFallback;
  if (!fallback?.enabled) {
    return { success: false, attempted: false, completedRuns: 0 };
  }
  if (Number(fallback.setId) === Number(failedResult.setId || failedStep.setId)) {
    return {
      success: false,
      attempted: false,
      completedRuns: 0,
      reason: "求解失败补偿 SBC 不能与当前失败 SBC 相同。",
    };
  }

  const requestedRuns = Number(fallback.runs) === -1
    ? -1
    : Math.min(100, Math.max(1, Number(fallback.runs || 1)));
  const failedStepName = failedResult.setName || `SBC ${failedStep.setId}`;
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
        `步骤“${failedStepName}”求解无解，正在执行补偿 SBC #${fallback.setId} · ${progressLabel}`
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
      if (completedThisAttempt > 0) {
        completedRuns += completedThisAttempt;
        const opened = await openRoutineRewards(
          result,
          context,
          result.setName || `求解失败补偿 SBC ${fallback.setId}`
        );
        if (!opened) {
          return {
            success: false,
            attempted: true,
            fatal: true,
            completedRuns,
            stopKind: context.stopKind || "pack_failed",
            reason: context.stopReason || "求解失败补偿的奖励处理失败。",
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
    invalidateSbcCache(failedResult.setId || failedStep.setId);
    invalidateInventorySnapshot("club");
    invalidateInventorySnapshot("storage");
    await fetchPlayers({ force: true });
    return {
      success: true,
      attempted: true,
      completedRuns,
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

  if (
    firstResult.rewardPackIds.length
    || firstResult.rewardPlayerPickIds?.length
    || firstResult.execution
  ) {
    const opened = await openRoutineRewards(
      firstResult,
      context,
      firstResult.setName || `SBC ${step.setId}`
    );
    if (!opened) {
      return {
        ...firstResult,
        rewardPackIds: [],
        rewardPlayerPickIds: [],
        progressUnits: firstCompleted,
        stopKind: "pack_failed",
        reason: context.stopReason || "原步骤已完成部分任务，但奖励处理失败。",
      };
    }
  }

  const recovery = await runSolveFailureFallback(
    routine,
    context,
    step,
    firstResult
  );
  const recoveryProgress = Number(recovery.completedRuns || 0);
  if (!recovery.success) {
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
  const retryResult = await executeRoutineStepWithTotwFallback(
    routine,
    step,
    remaining,
    context
  );
  const totalCompleted = firstCompleted + Number(retryResult.completedRuns || 0);
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
      const opened = await openRoutineRewards(
        { execution },
        context,
        `主线 ${set.name}`
      );
      if (!opened && !execution.stoppedReason) {
        execution.stoppedReason = context.stopReason || "主线奖励包处理失败。";
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
        if (
          !replenished &&
          (context.cancelled || isTaskCancellationRequested()) &&
          !context.stopReason
        ) {
          context.stopKind = "cancelled";
          context.stopReason = "用户结束了任务。";
        }
        return replenished;
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
    }
  );
  context.storageRecoveryCount = Number(packExecution.storageRecoveryCount || 0);
  mergePackTaskSummary(context.packSummary, result.summary);
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

const runFcxRoutine = async (routine) => {
  if (hasBlockingFcxTask()) {
    queueFcxNotification([
      "当前FCX任务尚未结束，请稍候。",
      UINotificationType.NEGATIVE,
    ]);
    return;
  }
  beginRoutineTask();
  const context = createRoutineContext(routine);
  runtimeState.activeRoutineExecution = context;
  holdTaskOverlay();
  queueFcxNotification([`永动机滚卡已启动：${routine.name}`, UINotificationType.POSITIVE]);
  console.info("[FCX][Routine] started", { id: routine.id, mode: routine.mode });
  try {
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
      runStep: async (step, requestedRuns) => {
        context.stepIndex = routine.steps.findIndex((candidate) => candidate.id === step.id);
        const result = step.kind === "pack"
          ? await executeRoutinePackStep(routine, step, context)
          : await executeRoutineStepWithFallback(
              routine,
              step,
              requestedRuns,
              context
            );
        context.completedByStep[step.id] =
          (context.completedByStep[step.id] || 0)
          + Number(result.completedRuns || result.packsOpened || 0);
        return result;
      },
      openRewards: async (result) =>
        openRoutineRewards(
          result,
          context,
          `SBC ${result.setId}`
        ),
    });
    context.results = schedule.results;
    context.notices = schedule.notices || [];
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
    queueFcxNotification([context.stopReason, UINotificationType.NEGATIVE]);
  } finally {
    runtimeState.activeRoutineExecution = undefined;
    releaseTaskOverlay();
    if (context.stopReason && context.stopReason !== "流程已完成。") {
      context.packSummary.stoppedReason = context.stopReason;
    }
    void saveTaskHistory({
      type: "routine",
      title: routine.name,
      summary: context.packSummary,
    });
    const hasTaskResults =
      context.packSummary.packsOpened > 0
      || context.packSummary.picksCompleted > 0
      || context.packSummary.players.length > 0
      || context.packSummary.sbcSubmissions.length > 0;
    if (hasTaskResults) {
      showPackTaskSummary(context.packSummary, {
        ignoreValue: routine.ignoreValue === true,
      });
    } else if (context.stopReason && context.stopReason !== "流程已完成。") {
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
    }
    createSBCTab();
  }
};
