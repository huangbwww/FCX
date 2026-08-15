import type { PackTaskSummary } from "./packs";

export type RoutineExecutionMode = "round_robin" | "exhaust_step";
export type RoutineOrigin = "builtin" | "custom";

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
  builtinSnapshotVersion?: number;
}

export interface RoutineDocument {
  version: 5;
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
