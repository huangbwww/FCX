import { describe, expect, it } from "vitest";
import {
  parseSolveOutcome,
  placeSolverResults,
} from "../src/domain/sbc/solver-outcome";

const solverPlayer = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  possiblePositions: 4,
  Is_Pos: 1,
  ...overrides,
});

describe("solver outcome validation", () => {
  it.each([0, 1, 3] as const)(
    "treats status code %s as terminal without requiring results",
    (statusCode) => {
      expect(
        parseSolveOutcome({ status: "terminal", status_code: statusCode }),
      ).toEqual({
        kind: "failure",
        status: "terminal",
        statusCode,
        ratingOptimization: null,
        failureCode: null,
      });
    },
  );

  it.each([2, 4] as const)(
    "accepts a valid successful response with status code %s",
    (statusCode) => {
      const outcome = parseSolveOutcome({
        status: "success",
        status_code: statusCode,
        results: JSON.stringify([solverPlayer()]),
      });
      expect(outcome.kind).toBe("success");
      if (outcome.kind === "success") {
        expect(outcome.statusCode).toBe(statusCode);
        expect(outcome.players).toHaveLength(1);
      }
    },
  );

  it("rejects successful responses with missing, malformed or incomplete results", () => {
    expect(parseSolveOutcome({ status: "ok", status_code: 4 }).kind).toBe(
      "invalid",
    );
    expect(
      parseSolveOutcome({ status: "ok", status_code: 4, results: "{" }).kind,
    ).toBe("invalid");
    expect(
      parseSolveOutcome({
        status: "ok",
        status_code: 4,
        results: JSON.stringify([{ id: 10 }]),
      }).kind,
    ).toBe("invalid");
  });

  it("preserves minimum-rating diagnostics and failure codes", () => {
    const outcome = parseSolveOutcome({
      status: "proof timeout",
      status_code: 0,
      failure_code: "RATING_OPTIMUM_NOT_PROVEN",
      rating_optimization: {
        target: 83,
        window_min: 83,
        window_max: 83.8,
        minimum_rating: null,
        rating_optimal: false,
        cost_optimal: false,
        failure_code: "RATING_OPTIMUM_NOT_PROVEN",
      },
    });
    expect(outcome).toMatchObject({
      kind: "failure",
      failureCode: "RATING_OPTIMUM_NOT_PROVEN",
      ratingOptimization: { rating_optimal: false },
    });
  });
});

describe("solver player placement", () => {
  it("maps positional and flexible results while preserving brick slots", () => {
    const players = new Map([
      [10, "goalkeeper"],
      [20, "flexible"],
    ]);
    const result = placeSolverResults({
      formation: [4, -1, 6],
      brickIndices: [1],
      results: [
        solverPlayer(),
        solverPlayer({ id: 20, possiblePositions: 99, Is_Pos: 0 }),
      ],
      findPlayer: (id) => players.get(id),
      createBrick: () => "brick",
    });
    expect(result).toEqual(["goalkeeper", "brick", "flexible"]);
  });

  it("fails before applying a partial solution or an unknown player", () => {
    expect(() =>
      placeSolverResults({
        formation: [4, 6],
        brickIndices: [],
        results: [solverPlayer()],
        findPlayer: () => "known",
        createBrick: () => "brick",
      }),
    ).toThrow("未填满阵容位置");

    expect(() =>
      placeSolverResults({
        formation: [4],
        brickIndices: [],
        results: [solverPlayer()],
        findPlayer: () => undefined,
        createBrick: () => "brick",
      }),
    ).toThrow("不在候选列表中");
  });
});
