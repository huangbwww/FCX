import { describe, expect, it } from "vitest";
import { PLAYSTYLE_ACADEMY_CONFIG } from "../src/config/playstyle-academy";
import {
  academyPlayerPositions,
  buildAcademyApplyPlan,
  canSetPlayStyleTarget,
  countTargetPlayStyles,
  isAcademyEligiblePlayer,
  localizeAcademyError,
  nextPlayStyleTarget,
  readPlayStyleCounts,
  recommendPlayStyles,
  snapshotPlayStyleLevels,
} from "../src/domain/evolutions/playstyle-academy";
import type { AcademyPlayerLike } from "../src/types/academy";

function player(overrides: Partial<AcademyPlayerLike> = {}): AcademyPlayerLike {
  return {
    id: 100,
    definitionId: 200,
    rareflag: 16,
    loans: 0,
    preferredPosition: 25,
    possiblePositions: [21],
    isPlayer: () => true,
    isLimitedUse: () => false,
    isGK: () => false,
    getNumBasicPlayStyles: () => 0,
    getNumPlusPlayStyles: () => 0,
    hasBasePlayStyle: () => false,
    hasPlusPlayStyle: () => false,
    ...overrides,
  };
}

describe("PlayStyle Academy snapshot", () => {
  it("ships the complete captured configuration", () => {
    expect(PLAYSTYLE_ACADEMY_CONFIG.schemaVersion).toBe(1);
    expect(PLAYSTYLE_ACADEMY_CONFIG.capturedAt).toBe("2026-08-07");
    expect(PLAYSTYLE_ACADEMY_CONFIG.limits).toEqual({ basic: 8, plus: 4 });
    expect(PLAYSTYLE_ACADEMY_CONFIG.eligibleRarities).toEqual([16, 30, 94, 98, 103, 109]);
    expect(PLAYSTYLE_ACADEMY_CONFIG.definitions).toHaveLength(36);
    expect(Object.keys(PLAYSTYLE_ACADEMY_CONFIG.recommendations)).toHaveLength(9);
    expect(Object.values(PLAYSTYLE_ACADEMY_CONFIG.recommendations).flat()).toHaveLength(37);
    for (const definition of PLAYSTYLE_ACADEMY_CONFIG.definitions) {
      expect(definition.base?.slotId).toBeGreaterThan(0);
      expect(definition.base?.rewardId).toBeGreaterThan(0);
      expect(definition.plus?.slotId).toBeGreaterThan(0);
      expect(definition.plus?.rewardId).toBeGreaterThan(0);
    }
  });
});

describe("PlayStyle Academy player rules", () => {
  it("filters rarity, rentals and limited-use players", () => {
    expect(isAcademyEligiblePlayer(player(), PLAYSTYLE_ACADEMY_CONFIG)).toBe(true);
    expect(isAcademyEligiblePlayer(player({ rareflag: 1 }), PLAYSTYLE_ACADEMY_CONFIG)).toBe(false);
    expect(isAcademyEligiblePlayer(player({ loans: 1 }), PLAYSTYLE_ACADEMY_CONFIG)).toBe(false);
    expect(isAcademyEligiblePlayer(player({ isLimitedUse: () => true }), PLAYSTYLE_ACADEMY_CONFIG)).toBe(false);
  });

  it("reads owned states and never allows removing them", () => {
    const owned = player({
      getNumBasicPlayStyles: () => 2,
      getNumPlusPlayStyles: () => 1,
      hasBasePlayStyle: (id) => id === 0,
      hasPlusPlayStyle: (id) => id === 1,
    });
    const original = snapshotPlayStyleLevels(owned, PLAYSTYLE_ACADEMY_CONFIG);
    expect(original.get(0)).toBe(1);
    expect(original.get(1)).toBe(2);
    expect(readPlayStyleCounts(owned)).toEqual({ basic: 2, plus: 1 });
    expect(canSetPlayStyleTarget({
      traitId: 0,
      level: 0,
      original,
      target: new Map(original),
      counts: { basic: 2, plus: 1 },
      config: PLAYSTYLE_ACADEMY_CONFIG,
      goalkeeper: false,
    })).toBe(false);
  });

  it("enforces the 8 + 4 limits and goalkeeper-only styles", () => {
    const original = snapshotPlayStyleLevels(player(), PLAYSTYLE_ACADEMY_CONFIG);
    const target = new Map(original);
    expect(canSetPlayStyleTarget({
      traitId: 0,
      level: 1,
      original,
      target,
      counts: { basic: 8, plus: 0 },
      config: PLAYSTYLE_ACADEMY_CONFIG,
      goalkeeper: false,
    })).toBe(false);
    expect(canSetPlayStyleTarget({
      traitId: 30,
      level: 2,
      original,
      target,
      counts: { basic: 0, plus: 0 },
      config: PLAYSTYLE_ACADEMY_CONFIG,
      goalkeeper: false,
    })).toBe(false);
  });

  it("cycles only through legal targets and restores the original state", () => {
    const original = snapshotPlayStyleLevels(player(), PLAYSTYLE_ACADEMY_CONFIG);
    const target = new Map(original);
    const input = {
      traitId: 0,
      original,
      target,
      counts: { basic: 0, plus: 0 },
      config: PLAYSTYLE_ACADEMY_CONFIG,
      goalkeeper: false,
    };
    expect(nextPlayStyleTarget(input)).toBe(1);
    target.set(0, 1);
    expect(nextPlayStyleTarget({ ...input, target })).toBe(2);
    target.set(0, 2);
    expect(nextPlayStyleTarget({ ...input, target })).toBe(0);
  });

  it("recommends Plus first and builds Base operations before Plus operations", () => {
    const candidate = player();
    const original = snapshotPlayStyleLevels(candidate, PLAYSTYLE_ACADEMY_CONFIG);
    const recommendation = recommendPlayStyles({
      keys: ["finesse-shot", "chip-shot", "power-shot", "dead-ball", "precision-header"],
      player: candidate,
      config: PLAYSTYLE_ACADEMY_CONFIG,
      original,
      counts: { basic: 0, plus: 0 },
    });
    expect(recommendation.selected).toBe(5);
    expect([...recommendation.target.values()].filter((level) => level === 2)).toHaveLength(4);
    expect([...recommendation.target.values()].filter((level) => level === 1)).toHaveLength(1);
    const plan = buildAcademyApplyPlan(original, recommendation.target, PLAYSTYLE_ACADEMY_CONFIG);
    expect(plan).toHaveLength(5);
    expect(plan.map((item) => item.target)).toEqual([1, 2, 2, 2, 2]);
    expect(countTargetPlayStyles(original, recommendation.target, { basic: 0, plus: 0 }))
      .toEqual({ basic: 1, plus: 4 });
  });

  it("maps EA positions to the nine recommendation groups", () => {
    expect(academyPlayerPositions(player())).toEqual([
      { code: "ST", group: "ST" },
      { code: "CF", group: "ST" },
    ]);
  });

  it("localizes common EA Academy errors", () => {
    expect(localizeAcademyError({ status: 458 })).toContain("人机验证");
    expect(localizeAcademyError({ status: 470 })).toContain("不足");
    expect(localizeAcademyError(new Error("离线"))).toContain("离线");
  });
});
