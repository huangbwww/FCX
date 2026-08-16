import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  requiresMinimumRatingFirst,
  supportsConfigurableRatingWindow,
  supportsMinimumRatingFirst,
} from "../src/domain/sbc/backend-features";

describe("minimum-rating-first backend capability", () => {
  it("requires the capability for minimum and exact team-rating rules", () => {
    expect(
      requiresMinimumRatingFirst([
        { requirementKey: "TEAM_RATING", scope: "GREATER" },
      ]),
    ).toBe(true);
    expect(
      requiresMinimumRatingFirst([
        { requirementKey: "TEAM_RATING", scope: "EXACT" },
      ]),
    ).toBe(true);
  });

  it("detects configurable rating-window support independently", () => {
    expect(
      supportsConfigurableRatingWindow({
        solver_features: { configurable_rating_window: 1 },
      }),
    ).toBe(true);
    expect(
      supportsConfigurableRatingWindow({
        solver_features: { configurable_rating_window: 0 },
      }),
    ).toBe(false);
    expect(supportsConfigurableRatingWindow({ status: "ok" })).toBe(false);
  });

  it("does not require the capability for maximum-only or unrelated rules", () => {
    expect(
      requiresMinimumRatingFirst([
        { requirementKey: "TEAM_RATING", scope: "LOWER" },
        { requirementKey: "PLAYER_MIN_OVR", scope: "GREATER" },
      ]),
    ).toBe(false);
  });

  it("accepts only minimum-rating-first capability version 2 or newer", () => {
    expect(
      supportsMinimumRatingFirst({
        solver_features: { minimum_rating_first: 2 },
      }),
    ).toBe(true);
    expect(
      supportsMinimumRatingFirst({
        solver_features: { minimum_rating_first: 1 },
      }),
    ).toBe(false);
    expect(supportsMinimumRatingFirst({ status: "ok" })).toBe(false);
  });

  it("checks health before solving and gives old EXE users a clear message", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../vite.config.ts"),
      "utf8",
    );
    const featureCheck = source.indexOf(
      "await assertMinimumRatingBackend(backendPort, input)",
    );
    const solveRequest = source.indexOf(
      "return await makePostRequest(solveUrl, input, timeoutMs)",
    );
    expect(featureCheck).toBeGreaterThan(0);
    expect(featureCheck).toBeLessThan(solveRequest);
    expect(source).toContain(
      "当前 FCX 后端不支持最低评分优先，请更新 FCX 后端 EXE。",
    );
  });
});
