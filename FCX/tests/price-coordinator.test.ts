import { describe, expect, it, vi } from "vitest";
import { PriceLookupCoordinator } from "../src/domain/market/price-coordinator";

describe("price lookup coordinator", () => {
  it("coalesces callers, de-duplicates ids and uses 50-id batches", async () => {
    const batches: Array<Array<number | string>> = [];
    const persist = vi.fn(async () => undefined);
    const coordinator = new PriceLookupCoordinator({
      batchSize: 50,
      debounceMs: 0,
      minimumBatchIntervalMs: 0,
      missingCooldownMs: 60_000,
      resolveBatch: async (ids) => {
        batches.push(ids);
        return {
          records: Object.fromEntries(
            ids.map((id) => [String(id), { eaId: id, price: 1000 }]),
          ),
          missing: [],
          providers: [],
        };
      },
      persist,
    });

    const first = coordinator.request(Array.from({ length: 60 }, (_, index) => index + 1));
    const second = coordinator.request(Array.from({ length: 26 }, (_, index) => index + 50));
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe(secondResult);
    expect(batches.map((batch) => batch.length)).toEqual([50, 25]);
    expect(firstResult.requested).toBe(75);
    expect(firstResult.fetched).toBe(75);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("cools down missing ids without sending another request", async () => {
    const resolveBatch = vi.fn(async (ids: Array<number | string>) => ({
      records: {},
      missing: ids,
      providers: [],
    }));
    const coordinator = new PriceLookupCoordinator({
      batchSize: 50,
      debounceMs: 0,
      minimumBatchIntervalMs: 0,
      missingCooldownMs: 60_000,
      resolveBatch,
      persist: async () => undefined,
    });
    const first = await coordinator.request([9]);
    const second = await coordinator.request([9]);
    expect(first.status).toBe("failed");
    expect(second.status).toBe("skipped");
    expect(resolveBatch).toHaveBeenCalledTimes(1);
  });
});
