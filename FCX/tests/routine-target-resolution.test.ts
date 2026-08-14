import { describe, expect, it, vi } from "vitest";
import {
  extractPlusRatingMarker,
  resolveRoutineSbcTarget,
  routineNameMatches,
  routineTargetNameMatches,
} from "../src/domain/routines/target-resolution";
import type { EaChallenge, EaSbcCatalog, EaSbcSet } from "../src/types/game";
import type { RoutineSbcStep } from "../src/types/routines";

const award = (kind: "pack" | "pick") => kind === "pack"
  ? { type: "pack", value: 100, isPack: true }
  : { type: "item", value: 200, isItem: true, item: { subtype: 237 } };

function set(id: number, name: string, kind: "pack" | "pick"): EaSbcSet {
  return {
    id,
    name,
    timesCompleted: 0,
    isSingleChallenge: true,
    repeatabilityMode: "UNLIMITED",
    awards: [award(kind)],
    getChallenges: () => [],
    isComplete: () => false,
  } as unknown as EaSbcSet;
}

const packStep = (): RoutineSbcStep => ({
  kind: "sbc",
  id: "target",
  setId: 1332,
  runs: -1,
  target: {
    preferredSetId: 1332,
    nameTokenGroups: [["2", "85", "升级"]],
    expectedRewardKind: "pack",
  },
});

const playerPickStep = (preferredSetId = 1268): RoutineSbcStep => ({
  kind: "sbc",
  id: "player-pick",
  setId: preferredSetId,
  runs: -1,
  target: {
    preferredSetId,
    nameTokenGroups: [["球员", "挑选"], ["player", "pick"]],
    numericMarker: "any_plus",
    expectedRewardKind: "player_pick",
  },
});

const loadChallenges = async (_candidate: EaSbcSet) => ({
  challenges: [] as EaChallenge[],
});

describe("routine target resolution", () => {
  it("matches multilingual token groups", () => {
    expect(routineNameMatches("2名85+球员升级", [["2", "85", "升级"]])).toBe(true);
    expect(routineNameMatches("84+ Player Pick", [["84", "player", "pick"]])).toBe(true);
  });

  it.each([75, 80, 83, 84, 85, 90, 100])(
    "extracts any positive %i+ rating marker",
    (rating) => {
      expect(extractPlusRatingMarker(`1/5 ${rating}+ Player Pick`)).toBe(rating);
      expect(routineTargetNameMatches(playerPickStep(), `${rating}+球员挑选`)).toBe(true);
    },
  );

  it("does not treat pick counts or numbers without plus as ratings", () => {
    expect(extractPlusRatingMarker("1/5 Player Pick")).toBeUndefined();
    expect(extractPlusRatingMarker("2026 球员挑选")).toBeUndefined();
    expect(routineTargetNameMatches(playerPickStep(), "1/5 球员挑选")).toBe(false);
    expect(routineTargetNameMatches(playerPickStep(), "83+球员升级")).toBe(false);
    expect(routineTargetNameMatches(playerPickStep(), "83+稀有球员包")).toBe(false);
  });

  it("loads a matching configured target exactly once", async () => {
    const preferred = set(1268, "1/5 83+ Player Pick", "pick");
    const loader = vi.fn(loadChallenges);
    const result = await resolveRoutineSbcTarget({
      step: playerPickStep(),
      catalog: { sets: [preferred], categories: [] },
      loadChallenges: loader,
    });

    expect(result).toMatchObject({
      source: "preferred",
      configuredSetId: 1268,
      candidateCount: 1,
      matchedRating: 83,
      challengeRequestCount: 1,
      attemptedSetId: 1268,
    });
    expect(result.set?.id).toBe(1268);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(preferred);
  });

  it("uses the only matching catalog name when the configured ID rotated", async () => {
    const fallback = set(1499, "任意90+球员挑选", "pick");
    const catalog: EaSbcCatalog = {
      sets: [
        ...Array.from({ length: 100 }, (_, index) =>
          set(2000 + index, `其他SBC ${index}`, "pack")),
        fallback,
      ],
      categories: [],
    };
    const loader = vi.fn(loadChallenges);
    const result = await resolveRoutineSbcTarget({
      step: playerPickStep(),
      catalog,
      loadChallenges: loader,
    });

    expect(result).toMatchObject({
      source: "fallback",
      configuredSetId: 1268,
      candidateCount: 1,
      matchedRating: 90,
      challengeRequestCount: 1,
      attemptedSetId: 1499,
    });
    expect(result.step.setId).toBe(1499);
    expect(result.set?.id).toBe(1499);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(fallback);
  });

  it("does not read challenges for zero or multiple name candidates", async () => {
    const loader = vi.fn(loadChallenges);
    const missing = await resolveRoutineSbcTarget({
      step: playerPickStep(),
      catalog: { sets: [set(1400, "1/5 Player Pick", "pick")], categories: [] },
      loadChallenges: loader,
    });
    expect(missing).toMatchObject({ source: "unresolved", candidateCount: 0 });

    const ambiguous = await resolveRoutineSbcTarget({
      step: playerPickStep(),
      catalog: {
        sets: [
          set(1401, "1/5 83+ Player Pick", "pick"),
          set(1402, "1/5 84+ Player Pick", "pick"),
        ],
        categories: [],
      },
      loadChallenges: loader,
    });
    expect(ambiguous).toMatchObject({ source: "unresolved", candidateCount: 2 });
    expect(loader).not.toHaveBeenCalled();
  });

  it("does not scan for another target after the chosen reward validation fails", async () => {
    const preferred = set(1268, "84+球员挑选", "pack");
    const matchingFallback = set(1400, "85+球员挑选", "pick");
    const loader = vi.fn(loadChallenges);
    const result = await resolveRoutineSbcTarget({
      step: playerPickStep(),
      catalog: { sets: [preferred, matchingFallback], categories: [] },
      loadChallenges: loader,
    });

    expect(result).toMatchObject({
      source: "unresolved",
      challengeRequestCount: 1,
      attemptedSetId: 1268,
    });
    expect(result.set).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(preferred);
  });

  it("keeps exact-ID pack targets directed to one challenge request", async () => {
    const preferred = set(1332, "2名85+球员升级", "pack");
    const loader = vi.fn(loadChallenges);
    const result = await resolveRoutineSbcTarget({
      step: packStep(),
      catalog: { sets: [preferred, set(1400, "2名85+球员升级", "pack")], categories: [] },
      loadChallenges: loader,
    });

    expect(result.source).toBe("preferred");
    expect(result.set?.id).toBe(1332);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(preferred);
  });

  it("does not enable catalog fallback for ordinary non-pick targets", async () => {
    const matchingOtherId = set(1400, "2名85+球员升级", "pack");
    const loader = vi.fn(loadChallenges);
    const result = await resolveRoutineSbcTarget({
      step: packStep(),
      catalog: { sets: [matchingOtherId], categories: [] },
      loadChallenges: loader,
    });

    expect(result).toMatchObject({ source: "unresolved", candidateCount: 0 });
    expect(loader).not.toHaveBeenCalled();
  });

  it("propagates the one selected challenge request failure", async () => {
    const fallback = set(1400, "80+球员挑选", "pick");
    const loader = vi.fn(async () => {
      throw Object.assign(new Error("读取失败"), { status: 429 });
    });

    await expect(resolveRoutineSbcTarget({
      step: playerPickStep(),
      catalog: { sets: [fallback], categories: [] },
      loadChallenges: loader,
    })).rejects.toMatchObject({ status: 429 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(fallback);
  });
});
