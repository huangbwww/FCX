import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  calculateEaSquadRating,
  formatSquadRatingWindow,
  isSquadRatingInWindow,
  resolveStrictSquadRatingWindow,
  validateMinimumRatingProof,
  validateSolverSquadRating,
} from "../src/domain/sbc/squad-rating";
import type { SbcConstraint, SolverPlayerResult } from "../src/types/backend";

const teamRating = (rating: number): SbcConstraint => ({
  scope: "GREATER",
  count: 0,
  requirementKey: "TEAM_RATING",
  eligibilityValues: [rating],
});

const players = (ratings: number[]) =>
  ratings.map((rating) => ({ rating })) as SolverPlayerResult[];

describe("strict SBC squad rating window", () => {
  it("calculates the EA rating with the actual squad size", () => {
    expect(calculateEaSquadRating(Array(11).fill(83))).toBe(83);
    expect(calculateEaSquadRating(Array(3).fill(83))).toBe(83);
    expect(calculateEaSquadRating([...Array(5).fill(84), ...Array(6).fill(83)])).toBe(83.73);
  });

  it("resolves a fixed 0.8 window for a minimum team rating", () => {
    const window = resolveStrictSquadRatingWindow([teamRating(83)]);
    expect(window).toEqual({ minimum: 83, maximum: 83.8 });
    expect(formatSquadRatingWindow(window!)).toBe("83.00–83.80");
  });

  it.each([
    [0, 83],
    [0.1, 83.1],
    [0.8, 83.8],
    [2, 85],
    [5, 88],
  ])("uses a configurable %s overshoot", (overshoot, maximum) => {
    expect(resolveStrictSquadRatingWindow([teamRating(83)], overshoot)).toEqual({
      minimum: 83,
      maximum,
    });
  });

  it.each([80, 82, 83, 84, 86, 88, 90])(
    "builds a dynamic %i.00-%i.80 window without a hard-coded target",
    (target) => {
      const window = resolveStrictSquadRatingWindow([teamRating(target)]);
      expect(window).toEqual({ minimum: target, maximum: target + 0.8 });
      expect(formatSquadRatingWindow(window!)).toBe(
        `${target.toFixed(2)}–${(target + 0.8).toFixed(2)}`,
      );
    },
  );

  it("requires proof that the returned squad has the minimum displayed rating", () => {
    const window = { minimum: 83, maximum: 83.8 };
    expect(
      validateMinimumRatingProof(
        {
          target: 83,
          window_min: 83,
          window_max: 83.8,
          minimum_rating: 83.18,
          rating_optimal: true,
          cost_optimal: false,
        },
        83.18,
        window,
      ),
    ).toEqual({ ok: true, reason: null });
    expect(validateMinimumRatingProof(null, 83.18, window).ok).toBe(false);
    expect(
      validateMinimumRatingProof(
        {
          target: 83,
          window_min: 83,
          window_max: 83.8,
          minimum_rating: 83,
          rating_optimal: true,
          cost_optimal: true,
        },
        83.18,
        window,
      ).ok,
    ).toBe(false);
  });

  it("accepts only inclusive values inside the configured window", () => {
    const window = { minimum: 83, maximum: 83.8 };
    expect(isSquadRatingInWindow(82.99, window)).toBe(false);
    expect(isSquadRatingInWindow(83, window)).toBe(true);
    expect(isSquadRatingInWindow(83.8, window)).toBe(true);
    expect(isSquadRatingInWindow(83.81, window)).toBe(false);
    expect(isSquadRatingInWindow(86, window)).toBe(false);
  });

  it("rejects an overrated backend result before application", () => {
    expect(validateSolverSquadRating(players(Array(11).fill(86)), [teamRating(83)])).toMatchObject({
      ok: false,
      rating: 86,
      window: { minimum: 83, maximum: 83.8 },
    });
    expect(validateSolverSquadRating(players(Array(11).fill(83)), [teamRating(83)])).toMatchObject({
      ok: true,
      rating: 83,
    });
    expect(
      validateSolverSquadRating(players(Array(11).fill(85)), [teamRating(83)], 2),
    ).toMatchObject({ ok: true, rating: 85, window: { minimum: 83, maximum: 85 } });
  });

  it("does not add a strict minimum window to a maximum-only requirement", () => {
    expect(resolveStrictSquadRatingWindow([{ ...teamRating(83), scope: "LOWER" }])).toBeNull();
  });

  it("runs the rating guard before applying solver players", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/domain/sbc/runtime.ts"),
      "utf8",
    );
    expect(source.indexOf("validateSolverSquadRating(")).toBeGreaterThan(0);
    expect(source.indexOf("validateSolverSquadRating(")).toBeLessThan(
      source.indexOf("placeSolverResults({"),
    );
    expect(source).toContain("本次未应用或提交阵容");
  });
});
