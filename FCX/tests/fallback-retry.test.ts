import { describe, expect, it, vi } from "vitest";
import {
  runWithSpecialFallbackLoop,
  type SpecialFallbackProgress,
} from "../src/domain/routines/fallback-retry";

describe("normal SBC special fallback loop", () => {
  it("does not replenish when the first target attempt is feasible", async () => {
    const attempt = vi.fn(async () => ({ completedRuns: 1 }));
    const replenish = vi.fn(async (_progress: SpecialFallbackProgress) => true);

    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns: 1,
      attempt,
      replenish,
    });

    expect(outcome).toMatchObject({
      totalCompletedRuns: 1,
      replenishmentCycles: 0,
      attemptCount: 1,
      replenishmentFailed: false,
      stoppedForNoProgress: false,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(replenish).not.toHaveBeenCalled();
  });

  it("replenishes for every new shortage until all three target runs finish", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce({ completedRuns: 0, specialShortage: { groupIds: [83] } })
      .mockResolvedValueOnce({ completedRuns: 1, specialShortage: { groupIds: [83] } })
      .mockResolvedValueOnce({ completedRuns: 1, specialShortage: { groupIds: [83] } })
      .mockResolvedValueOnce({ completedRuns: 1 });
    const replenish = vi.fn(async (_progress: SpecialFallbackProgress) => true);

    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns: 3,
      attempt,
      replenish,
    });

    expect(outcome).toMatchObject({
      totalCompletedRuns: 3,
      replenishmentCycles: 3,
      attemptCount: 4,
      replenishmentFailed: false,
      stoppedForNoProgress: false,
    });
    expect(attempt.mock.calls.map(([runs]) => runs)).toEqual([3, 3, 2, 1]);
    expect(replenish.mock.calls.map(([progress]) => progress)).toEqual([
      { cycle: 1, completedRuns: 0, remainingRuns: 3 },
      { cycle: 2, completedRuns: 1, remainingRuns: 2 },
      { cycle: 3, completedRuns: 2, remainingRuns: 1 },
    ]);
  });

  it("continues only the remaining runs after using existing special cards", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce({ completedRuns: 1, specialShortage: {} })
      .mockResolvedValueOnce({ completedRuns: 2 });

    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns: 3,
      attempt,
      replenish: async () => true,
    });

    expect(attempt.mock.calls.map(([runs]) => runs)).toEqual([3, 2]);
    expect(outcome.totalCompletedRuns).toBe(3);
    expect(outcome.replenishmentCycles).toBe(1);
  });

  it("does not replenish after the final requested run is already complete", async () => {
    const attempt = vi.fn(async () => ({
      completedRuns: 1,
      specialShortage: { groupIds: [83] },
    }));
    const replenish = vi.fn(async () => true);

    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns: 1,
      attempt,
      replenish,
    });

    expect(outcome.totalCompletedRuns).toBe(1);
    expect(outcome.replenishmentCycles).toBe(0);
    expect(replenish).not.toHaveBeenCalled();
  });

  it("stops after a successful replenishment produces no target progress", async () => {
    const attempt = vi.fn(async () => ({
      completedRuns: 0,
      specialShortage: { groupIds: [83] },
    }));
    const replenish = vi.fn(async () => true);

    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns: 3,
      attempt,
      replenish,
    });

    expect(outcome).toMatchObject({
      totalCompletedRuns: 0,
      replenishmentCycles: 1,
      attemptCount: 2,
      replenishmentFailed: false,
      stoppedForNoProgress: true,
    });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(replenish).toHaveBeenCalledTimes(1);
  });

  it("stops without another target attempt when replenishment fails", async () => {
    const shortage = { completedRuns: 0, specialShortage: { groupIds: [23] } };
    const attempt = vi.fn(async () => shortage);

    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns: 1,
      attempt,
      replenish: async () => false,
    });

    expect(outcome.result).toBe(shortage);
    expect(outcome).toMatchObject({
      replenishmentCycles: 0,
      attemptCount: 1,
      replenishmentFailed: true,
      stoppedForNoProgress: false,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("preserves continuous mode while accumulating completed runs", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce({ completedRuns: 2, specialShortage: {} })
      .mockResolvedValueOnce({ completedRuns: 3 });

    const outcome = await runWithSpecialFallbackLoop({
      requestedRuns: -1,
      attempt,
      replenish: async () => true,
    });

    expect(attempt.mock.calls.map(([runs]) => runs)).toEqual([-1, -1]);
    expect(outcome.totalCompletedRuns).toBe(5);
  });
});
