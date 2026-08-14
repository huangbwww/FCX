import { describe, expect, it } from "vitest";
import { getSbcCatalogStatus } from "../src/domain/sbc/catalog-status";
import type { EaSbcSet } from "../src/types/game";

const set = (value: Partial<EaSbcSet>) => ({ timesCompleted: 0, ...value }) as EaSbcSet;

describe("SBC catalog status", () => {
  it("formats finite, unlimited and unknown completion counts", () => {
    expect(getSbcCatalogStatus(set({ timesCompleted: 3, getRepeatsRemaining: () => 4 })).label)
      .toBe("已完成 3 次 · 剩余 4 次");
    expect(getSbcCatalogStatus(set({ timesCompleted: 8, repeatabilityMode: "UNLIMITED" })).label)
      .toBe("已完成 8 次 · 无限重复");
    expect(getSbcCatalogStatus(set({ timesCompleted: 2 })).label)
      .toBe("已完成 2 次 · 次数未知");
  });
});
