import { describe, expect, it, vi } from "vitest";
import { loadChallengeWithRetry } from "../src/domain/sbc/challenge-loader";

describe("challenge loader", () => {
  it("resolves the outer operation when a retry succeeds", async () => {
    const loadOnce = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("loaded");
    const waitBeforeRetry = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    await expect(
      loadChallengeWithRetry(loadOnce, { waitBeforeRetry, onRetry }),
    ).resolves.toBe("loaded");
    expect(loadOnce).toHaveBeenCalledTimes(2);
    expect(waitBeforeRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it("rejects only after the configured attempts are exhausted", async () => {
    const loadOnce = vi.fn(async () => {
      throw new Error("still unavailable");
    });
    await expect(
      loadChallengeWithRetry(loadOnce, {
        maxRetries: 2,
        waitBeforeRetry: async () => undefined,
      }),
    ).rejects.toThrow("still unavailable");
    expect(loadOnce).toHaveBeenCalledTimes(3);
  });
});
