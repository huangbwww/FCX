import { classifySbcRewards } from "../sbc/reward-tracking";
import { getSbcRepeatability } from "../sbc/repeatability";
import type { EaChallenge, EaSbcCatalog, EaSbcSet } from "../../types/game";
import type { RoutineRewardKind, RoutineSbcStep } from "../../types/routines";

export interface RoutineTargetResolution {
  step: RoutineSbcStep;
  set?: EaSbcSet;
  challenges?: EaChallenge[];
  source: "preferred" | "fallback" | "unresolved";
  reason?: string;
  configuredSetId: number;
  candidateCount: number;
  matchedRating?: number;
  challengeRequestCount: number;
  attemptedSetId?: number;
}

export interface RoutineTargetFacts {
  name: string;
  rewardKinds: Set<RoutineRewardKind>;
  challengeCount: number;
  repeatability: "finite" | "unlimited" | "unknown";
}

const normalizedText = (value: unknown) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase()
  .replace(/[×x+＋]/g, " ")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

export function extractPlusRatingMarker(name: string): number | undefined {
  const normalized = String(name || "").normalize("NFKC");
  const match = normalized.match(/(?:^|[^\d])([1-9]\d*)\+/u);
  if (!match?.[1]) return undefined;
  const rating = Number(match[1]);
  return Number.isSafeInteger(rating) && rating > 0 ? rating : undefined;
}

export function routineNameMatches(name: string, groups: readonly string[][]): boolean {
  const candidate = normalizedText(name);
  return groups.some((tokens) => tokens.every((token) => candidate.includes(normalizedText(token))));
}

export function routineTargetNameMatches(step: RoutineSbcStep, name: string): boolean {
  const target = step.target;
  if (!target) return true;
  if (!routineNameMatches(name, target.nameTokenGroups)) return false;
  return target.numericMarker !== "any_plus"
    || extractPlusRatingMarker(name) !== undefined;
}

function rewardKindsFor(set: EaSbcSet, challenges: readonly EaChallenge[]): Set<RoutineRewardKind> {
  const kinds = new Set<RoutineRewardKind>();
  const rewards = classifySbcRewards([
    ...(Array.isArray(set.awards) ? set.awards : []),
    ...challenges.flatMap((challenge) => Array.isArray(challenge.awards) ? challenge.awards : []),
  ]);
  for (const reward of rewards) {
    if (reward.kind === "pack") kinds.add("pack");
    else if (reward.kind === "player_pick") kinds.add("player_pick");
    else kinds.add("other");
  }
  return kinds;
}

export function inspectRoutineTarget(set: EaSbcSet, challenges: readonly EaChallenge[]): RoutineTargetFacts {
  return {
    name: String(set.name || ""),
    rewardKinds: rewardKindsFor(set, challenges),
    challengeCount: challenges.length,
    repeatability: getSbcRepeatability(set).kind,
  };
}

export function routineTargetMatches(step: RoutineSbcStep, facts: RoutineTargetFacts): boolean {
  const target = step.target;
  if (!target) return true;
  if (!routineTargetNameMatches(step, facts.name)) return false;
  if (!facts.rewardKinds.has(target.expectedRewardKind)) return false;
  if (target.minChallenges && facts.challengeCount < target.minChallenges) return false;
  if (target.maxChallenges && facts.challengeCount > target.maxChallenges) return false;
  return !target.repeatability
    || target.repeatability === "any"
    || facts.repeatability === target.repeatability;
}

export async function resolveRoutineSbcTarget(input: {
  step: RoutineSbcStep;
  catalog: EaSbcCatalog;
  loadChallenges(set: EaSbcSet): Promise<{ challenges?: EaChallenge[] } | undefined>;
  now?: number;
}): Promise<RoutineTargetResolution> {
  const { step, catalog, loadChallenges } = input;
  const configuredSetId = Number(step.target?.preferredSetId || step.setId);
  const preferred = catalog.sets.find((candidate) => Number(candidate.id) === configuredSetId);
  const base = {
    configuredSetId,
    challengeRequestCount: 0,
  };

  if (!step.target) {
    if (!preferred) {
      return {
        ...base,
        step,
        source: "unresolved",
        candidateCount: 0,
        reason: `SBC ${configuredSetId} 当前不可用或已经过期。`,
      };
    }
    const response = await loadChallenges(preferred);
    return {
      ...base,
      step: { ...step, setId: configuredSetId },
      set: preferred,
      challenges: Array.isArray(response?.challenges) ? response.challenges : [],
      source: "preferred",
      candidateCount: 1,
      challengeRequestCount: 1,
      attemptedSetId: configuredSetId,
    };
  }

  if (step.target.expiresAt) {
    const expiresAt = Date.parse(step.target.expiresAt);
    if (Number.isFinite(expiresAt) && (input.now ?? Date.now()) >= expiresAt) {
      return {
        ...base,
        step,
        source: "unresolved",
        candidateCount: 0,
        reason: `步骤“${step.id}”配置的 SBC 已过期。`,
      };
    }
  }

  let selected: EaSbcSet | undefined;
  let source: "preferred" | "fallback" = "preferred";
  let candidateCount = 1;
  if (preferred && routineTargetNameMatches(step, String(preferred.name || ""))) {
    selected = preferred;
  } else {
    if (step.target.numericMarker !== "any_plus") {
      return {
        ...base,
        step,
        source: "unresolved",
        candidateCount: 0,
        reason: preferred
          ? `SBC ${configuredSetId} 的名称与流程配置不一致，已跳过。`
          : `SBC ${configuredSetId} 当前不可用或已经过期。`,
      };
    }
    const candidates = catalog.sets.filter((candidate) =>
      routineTargetNameMatches(step, String(candidate.name || "")));
    candidateCount = candidates.length;
    if (candidateCount !== 1) {
      const detail = candidateCount === 0
        ? "当前目录中没有符合名称规则的球员挑选"
        : `当前目录中找到 ${candidateCount} 个符合名称规则的球员挑选，无法唯一确定目标`;
      return {
        ...base,
        step,
        source: "unresolved",
        candidateCount,
        reason: `SBC ${configuredSetId} 当前不可用或名称不符；${detail}，已跳过。`,
      };
    }
    [selected] = candidates;
    source = "fallback";
  }

  if (!selected) {
    return {
      ...base,
      step,
      source: "unresolved",
      candidateCount,
      reason: `SBC ${configuredSetId} 目标解析失败，已跳过。`,
    };
  }

  const selectedId = Number(selected.id);
  const matchedRating = step.target.numericMarker === "any_plus"
    ? extractPlusRatingMarker(String(selected.name || ""))
    : undefined;
  const response = await loadChallenges(selected);
  const challenges = Array.isArray(response?.challenges) ? response.challenges : [];
  if (!routineTargetMatches(step, inspectRoutineTarget(selected, challenges))) {
    return {
      ...base,
      step,
      source: "unresolved",
      candidateCount,
      ...(matchedRating !== undefined ? { matchedRating } : {}),
      challengeRequestCount: 1,
      attemptedSetId: selectedId,
      reason: `SBC ${selectedId} 的奖励类型、挑战数量或重复模式与流程配置不一致，已跳过。`,
    };
  }
  return {
    ...base,
    step: { ...step, setId: selectedId },
    set: selected,
    challenges,
    source,
    candidateCount,
    ...(matchedRating !== undefined ? { matchedRating } : {}),
    challengeRequestCount: 1,
    attemptedSetId: selectedId,
  };
}
