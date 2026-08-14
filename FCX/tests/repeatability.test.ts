import { describe, expect, it } from "vitest";
import {
  effectiveRequestedRuns,
  getSbcRepeatability,
  shouldContinueSbcTask,
} from "../src/domain/sbc/repeatability";
import type { EaSbcSet } from "../src/types/game";

function set(value: Partial<EaSbcSet>): EaSbcSet {
  return { timesCompleted: 0, ...value } as EaSbcSet;
}

describe("SBC repeatability", () => {
  it("models unlimited, non-repeatable, finite and unknown sets", () => {
    expect(getSbcRepeatability(set({ repeatabilityMode: "UNLIMITED" })).kind).toBe(
      "unlimited",
    );
    expect(getSbcRepeatability(set({ repeatabilityMode: "REPEATABLE" })).kind).toBe(
      "unlimited",
    );
    expect(getSbcRepeatability(set({ repeatabilityMode: "INFINITE" })).kind).toBe(
      "unlimited",
    );
    expect(
      getSbcRepeatability(
        set({ repeatabilityMode: "NON_REPEATABLE", timesCompleted: 1 }),
      ),
    ).toEqual({ kind: "finite", remaining: 0 });
    expect(
      getSbcRepeatability(set({ getRepeatsRemaining: () => 4 })),
    ).toEqual({ kind: "finite", remaining: 4 });
    expect(getSbcRepeatability(set({}))).toEqual({
      kind: "unknown",
      remaining: null,
    });
  });

  it("caps requested runs and preserves -1 only for unlimited sets", () => {
    expect(
      effectiveRequestedRuns(-1, { kind: "finite", remaining: 3 }),
    ).toBe(3);
    expect(
      effectiveRequestedRuns(8, { kind: "finite", remaining: 3 }),
    ).toBe(3);
    expect(
      effectiveRequestedRuns(-1, { kind: "unlimited", remaining: Infinity }),
    ).toBe(-1);
    expect(effectiveRequestedRuns(-1, { kind: "unknown", remaining: null })).toBe(
      1,
    );
    expect(shouldContinueSbcTask({ requestedRuns: 5, completedRuns: 4 })).toBe(
      true,
    );
    expect(shouldContinueSbcTask({ requestedRuns: 5, completedRuns: 5 })).toBe(
      false,
    );
  });
});
