import type { PackTaskSummary, SbcSubmissionSummary } from "./packs";
import type { SbcRewardPlan, SbcRunOptions } from "./sbc-run";

export type RoutineExecutionMode = "round_robin" | "exhaust_step";
export type RoutineOrigin = "builtin" | "custom";
export type RoutineFatalRecoveryMode = "stop" | "resume" | "restart";

export interface RoutineStepBase {
  id: string;
  runs: number;
}

export type RoutineRewardKind = "pack" | "player_pick" | "other";

export interface RoutineSbcTarget {
  preferredSetId: number;
  nameTokenGroups: string[][];
  numericMarker?: "any_plus";
  expectedRewardKind: RoutineRewardKind;
  minChallenges?: number;
  maxChallenges?: number;
  repeatability?: "finite" | "unlimited" | "any";
  expiresAt?: string;
}

export interface RoutineSbcStep extends RoutineStepBase {
  kind: "sbc";
  setId: number;
  target?: RoutineSbcTarget;
}

export interface RoutinePackStep extends RoutineStepBase {
  kind: "pack";
  packId: number;
  tradable: boolean;
  packName: string;
}

export type RoutineStep = RoutineSbcStep | RoutinePackStep;

export interface RoutineTotwFallback {
  enabled: boolean;
  setId: number;
  runs: number;
}

export interface StorageOverflowFallback {
  enabled: boolean;
  setId: number;
  runs: number;
}

export interface RoutineSolveFailureFallback {
  enabled: boolean;
  setId: number;
  runs: number;
}

export interface RoutineDefinition {
  id: string;
  origin: RoutineOrigin;
  name: string;
  description: string;
  mode: RoutineExecutionMode;
  totalCycles: number;
  ignoreValue: boolean;
  steps: RoutineStep[];
  totwFallback: RoutineTotwFallback;
  solveFailureFallback: RoutineSolveFailureFallback;
  storageFallback: StorageOverflowFallback;
  fatalRecoveryEnabled: boolean;
  fatalRecoveryMode: RoutineFatalRecoveryMode;
  fatalRecoveryMaxReloads: number;
  builtinSnapshotVersion?: number;
}

export interface RoutineDocument {
  version: 8;
  builtinOverrides: Record<string, RoutineDefinition>;
  custom: Record<string, RoutineDefinition>;
}

export type RoutineStopKind =
  | "done"
  | "cancelled"
  | "limit"
  | "throttled"
  | "unavailable"
  | "exhausted"
  | "no_solution"
  | "special_shortage"
  | "submit_failed"
  | "pack_failed"
  | "invalid";

export interface RoutineSolveFailureContext {
  source: "main_step" | "totw_fallback";
  failedSetId: number;
  failedSetName: string;
  mainStepId: string;
  mainSetId: number;
  mainStepName: string;
  reason: string;
}

export type RoutineSolveFailureFallbackOutcome =
  | "started"
  | "fallback_completed"
  | "fallback_unavailable"
  | "fallback_failed"
  | "retry_succeeded"
  | "retry_no_solution"
  | "retry_failed";

export interface RoutineSolveFailureFallbackEvent {
  occurredAt: string;
  cycle: number;
  stepIndex: number;
  mainStepId: string;
  mainSetId: number;
  mainStepName: string;
  failureSource: RoutineSolveFailureContext["source"];
  failedSetId: number;
  failedSetName: string;
  failureReason: string;
  fallbackSetId: number;
  fallbackSetName?: string;
  requestedRuns: number;
  completedRuns: number;
  outcome: RoutineSolveFailureFallbackOutcome;
  reason?: string;
  retryStopKind?: RoutineStopKind;
  retryReason?: string;
}

export interface RoutineStepResult {
  stepId: string;
  stepKind: "sbc" | "pack";
  setId?: number;
  packId?: number;
  completedRuns: number;
  packsOpened?: number;
  progressUnits?: number;
  rewardPackIds: number[];
  rewardPlayerPickIds?: number[];
  stopKind: RoutineStopKind;
  reason?: string;
  setName?: string;
  solveFailure?: RoutineSolveFailureContext;
}

export interface RoutineExecutionContext {
  id: string;
  routineId: string;
  mode: RoutineExecutionMode;
  cancelled: boolean;
  cycle: number;
  totalCycles: number;
  stepIndex: number;
  completedByStep: Record<string, number>;
  results: RoutineStepResult[];
  notices?: string[];
  packSummary: PackTaskSummary;
  storageFallback: StorageOverflowFallback;
  storageRecoveryCount: number;
  stopKind?: RoutineStopKind;
  stopReason?: string;
  isTotwFallback: boolean;
  isSolveFailureFallback: boolean;
  currentStepCompleted: number;
  recoveryErrors?: RoutineRecoveryErrorEvent[];
  solveFailureFallbackEvents?: RoutineSolveFailureFallbackEvent[];
  pendingOperation?: RoutineRecoveryPendingOperation;
}

export interface RoutineRecoveryCursor {
  cycle: number;
  stepIndex: number;
  completedInStep: number;
}

export type RoutineRecoveryPendingOperation = {
  kind: "sbc_submit";
  stepId: string;
  setId: number;
  challengeId: number;
  beforeSetCompletions: number;
  countsTowardStep: boolean;
  startedAt: number;
  submission: Omit<SbcSubmissionSummary, "sequence">;
  reward: {
    options: SbcRunOptions;
    rewardPlan: SbcRewardPlan;
    packSummary: PackTaskSummary;
    completedRuns: number;
    storageRecoveryCount: number;
  };
};

export interface RoutineRecoveryErrorEvent {
  occurredAt: string;
  reloadAttempt: number;
  maxReloads: number;
  stopKind: RoutineStopKind;
  reason: string;
  technicalMessage: string;
  cycle: number;
  stepIndex: number;
  stepId?: string;
  stepName?: string;
  setId?: number;
  operation?: string;
  status?: number;
  phase?: string;
}

export interface RoutineRecoveryCheckpoint {
  version: 2;
  personaId: string;
  taskId: string;
  routine: RoutineDefinition;
  recoveryMode: RoutineFatalRecoveryMode;
  cursor: RoutineRecoveryCursor;
  completedByStep: Record<string, number>;
  results: RoutineStepResult[];
  notices: string[];
  packSummary: PackTaskSummary;
  storageRecoveryCount: number;
  reloadCount: number;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  recoveryErrors: RoutineRecoveryErrorEvent[];
  solveFailureFallbackEvents?: RoutineSolveFailureFallbackEvent[];
  pendingOperation?: RoutineRecoveryPendingOperation;
  pendingReward?: {
    stepResult: RoutineStepResult;
    options: SbcRunOptions;
    rewardPlan: SbcRewardPlan;
    packSummary: PackTaskSummary;
    completedRuns: number;
    storageRecoveryCount: number;
    stoppedReason?: string;
  };
}

export interface SubmissionCounterSnapshot {
  hour: number;
  day: number;
  hourLimit: number;
  dayLimit: number;
  remaining: number;
  nextAvailableAt?: number;
}

export interface SpecialRequirementShortage {
  groupIds: number[];
  required: number;
  available: number;
  challengeId: number;
}
