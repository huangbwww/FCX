import type { EaChallenge, EaSbcSet, EaSbcSquad } from "./game";
import type { PackTaskSummary } from "./packs";
import type { UnassignedRoutingResult } from "./packs";
import type {
  SpecialRequirementShortage,
  StorageOverflowFallback,
} from "./routines";

export interface SbcRunOptions {
  ignoreValue: boolean;
  requestedRuns: number;
  /** Leave exact set rewards for an owning workflow to process. */
  deferRewards: boolean;
  /** Leave the final pack summary for an owning workflow to display. */
  deferSummary: boolean;
  /** Detect a real TOTW candidate shortage before contacting the solver. */
  detectSpecialShortage: boolean;
  /** Per-task remote override; null preserves challenge/set/global settings. */
  submitStrategy: "never" | "feasible" | "optimal" | null;
  /** Per-task remote override; null preserves challenge/set/global settings. */
  autoOpenRewards: boolean | null;
  /** Explicit workflow setting; null uses the ordinary global fallback. */
  storageFallback: StorageOverflowFallback | null;
  /** Ordinary web UI only: preview a full set before the first submit. */
  wholeSetPreview: boolean;
}

export type SbcRunMode = "challenge" | "set";

export interface PlannedSbcChallenge<TPayload = unknown> {
  challengeId: number;
  name: string;
  playerItemIds: number[];
  payload: TPayload;
}

export interface SbcSetExecutionPlan<TPayload = unknown> {
  setId: number;
  setName: string;
  challenges: PlannedSbcChallenge<TPayload>[];
}

export interface SbcChallengeExecutionResult {
  challengeId: number;
  submitted: boolean;
  reason?: string;
}

export interface SbcRewardPlan {
  packIds: number[];
  expectedById: Record<number, number>;
  playerPickIds: number[];
  playerPickExpectedById: Record<number, number>;
  playerPickLabelsById: Record<number, string>;
  packBaselineByKey: Record<string, number>;
  playerPickBaselineById: Record<number, number>;
  playerPickBaselineKeysById: Record<number, string[]>;
  processedPackByKey: Record<string, number>;
  processedPlayerPickById: Record<number, number>;
  capturedPackIds: Record<number, boolean>;
  capturedPlayerPickIds: Record<number, boolean>;
  unsupportedRewards: string[];
}

export interface SbcExecutionContext {
  id: string;
  options: SbcRunOptions;
  mode: SbcRunMode;
  activeCalls: number;
  completedRuns: number;
  currentChallengeIndex: number;
  totalChallenges: number;
  attemptedChallengeIds: Set<number>;
  submittedChallengeIds: Set<number>;
  rewardPlan: SbcRewardPlan;
  orchestrating: boolean;
  stoppedReason?: string;
  specialShortage?: SpecialRequirementShortage;
  packSummary: PackTaskSummary;
  summaryShown: boolean;
  priceRuleAcknowledgedSetIds: Set<number>;
  awaitingPriceConfirmation: boolean;
  storageRecoveryCount: number;
  lastUnassignedRouting?: UnassignedRoutingResult;
}

export interface ExecutableSbcContext {
  setId: number;
  challengeId: number;
  set: EaSbcSet;
  challenge: EaChallenge;
  squad: EaSbcSquad;
  challenges: EaChallenge[];
}

export const defaultSbcRunOptions: Readonly<SbcRunOptions> = {
  ignoreValue: false,
  requestedRuns: 1,
  deferRewards: false,
  deferSummary: false,
  detectSpecialShortage: false,
  submitStrategy: null,
  autoOpenRewards: null,
  storageFallback: null,
  wholeSetPreview: false,
};

export function normalizeSbcRunOptions(
  options: Partial<SbcRunOptions> | undefined,
): SbcRunOptions {
  const requested = Number(options?.requestedRuns ?? 1);
  return {
    ignoreValue: options?.ignoreValue === true,
    deferRewards: options?.deferRewards === true,
    deferSummary: options?.deferSummary === true,
    detectSpecialShortage: options?.detectSpecialShortage === true,
    submitStrategy:
      options?.submitStrategy === "never"
      || options?.submitStrategy === "feasible"
      || options?.submitStrategy === "optimal"
        ? options.submitStrategy
        : null,
    autoOpenRewards:
      typeof options?.autoOpenRewards === "boolean"
        ? options.autoOpenRewards
        : null,
    storageFallback:
      options?.storageFallback && typeof options.storageFallback === "object"
        ? {
            enabled: options.storageFallback.enabled === true,
            setId:
              Number.isFinite(Number(options.storageFallback.setId))
              && Number(options.storageFallback.setId) > 0
                ? Number(options.storageFallback.setId)
                : 0,
            runs:
              Math.trunc(Number(options.storageFallback.runs)) === -1
                ? -1
                : Number.isFinite(Number(options.storageFallback.runs))
                  ? Math.min(
                      100,
                      Math.max(1, Math.trunc(Number(options.storageFallback.runs))),
                    )
                  : 1,
          }
        : null,
    wholeSetPreview: options?.wholeSetPreview === true,
    requestedRuns:
      requested === -1
        ? -1
        : Number.isInteger(requested) && requested > 0
          ? requested
          : 1,
  };
}

let executionSequence = 0;

export function createSbcExecutionContext(
  options: Partial<SbcRunOptions> | undefined,
): SbcExecutionContext {
  executionSequence += 1;
  return {
    id: `fcx-sbc-${Date.now()}-${executionSequence}`,
    options: normalizeSbcRunOptions(options),
    mode: "challenge",
    activeCalls: 0,
    completedRuns: 0,
    currentChallengeIndex: 0,
    totalChallenges: 0,
    attemptedChallengeIds: new Set<number>(),
    submittedChallengeIds: new Set<number>(),
    rewardPlan: {
      packIds: [],
      expectedById: {},
      playerPickIds: [],
      playerPickExpectedById: {},
      playerPickLabelsById: {},
      packBaselineByKey: {},
      playerPickBaselineById: {},
      playerPickBaselineKeysById: {},
      processedPackByKey: {},
      processedPlayerPickById: {},
      capturedPackIds: {},
      capturedPlayerPickIds: {},
      unsupportedRewards: [],
    },
    orchestrating: false,
    packSummary: {
      packsOpened: 0,
      picksCompleted: 0,
      players: [],
      sbcSubmissions: [],
      destinations: {
        club: 0,
        storage: 0,
        transfer: 0,
        sold: 0,
        remaining: 0,
      },
    },
    summaryShown: false,
    priceRuleAcknowledgedSetIds: new Set<number>(),
    awaitingPriceConfirmation: false,
    storageRecoveryCount: 0,
  };
}
