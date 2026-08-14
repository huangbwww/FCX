import { describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "../src/api/http";
import { PRICE_LOOKUP_BATCH_SIZE } from "../src/config/constants";
import {
  chunkPriceIds,
  resolvePriceBatch,
} from "../src/domain/market/price-providers";

describe("multi-source price providers", () => {
  it("uses the shared 50-id batch size", () => {
    const ids = Array.from({ length: 101 }, (_, index) => index + 1);
    const batches = chunkPriceIds(ids);
    expect(PRICE_LOOKUP_BATCH_SIZE).toBe(50);
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 1]);
  });

  it("passes only unresolved ids from FUT.GG directly to Futnext", async () => {
    const request = vi.fn(async (spec) => {
      if (spec.source === "futgg") {
        return JSON.stringify({
          data: { first: { eaId: 1, price: 1_000 } },
        });
      }
      expect(spec.url).toContain("ids=2_3&platform=ps");
      return JSON.stringify([
        { definitionId: 2, prices: [2_000], updatedAt: 1_785_689_742_816 },
        { definitionId: 3, prices: [3_000], updatedAt: 1_785_689_742_816 },
      ]);
    });

    const result = await resolvePriceBatch([1, 2, 3], {
      request,
      platform: "console",
      now: new Date("2026-08-03T00:00:00Z"),
    });

    expect(result.missing).toEqual([]);
    expect(result.records["1"]?.source).toBe("futgg");
    expect(result.records["2"]?.source).toBe("futnext");
    expect(result.records["3"]?.source).toBe("futnext");
    expect(request).toHaveBeenCalledTimes(2);
    const urls = request.mock.calls.map(([spec]) => new URL(spec.url));
    expect(urls.every((url) => ["www.fut.gg", "enhancer-api.futnext.com"].includes(url.host)))
      .toBe(true);
  });

  it("blocks FUT.GG after a Cloudflare 403 and still resolves through fallbacks", async () => {
    const request = vi.fn(async (spec) => {
      if (spec.source === "futgg") {
        throw new HttpRequestError("Forbidden", 403);
      }
      return JSON.stringify([{ definitionId: 7, prices: [7_500], updatedAt: 1_785_689_742_816 }]);
    });

    const first = await resolvePriceBatch([7], {
      request,
      platform: "pc",
    });
    expect(first.blockFutgg).toBe(true);
    expect(first.records["7"]?.price).toBe(7_500);

    request.mockClear();
    await resolvePriceBatch([8], {
      request,
      platform: "pc",
      skipFutgg: true,
    });
    expect(request.mock.calls.some(([spec]) => spec.source === "futgg")).toBe(false);
  });

  it("sends 50 ids to every provider before the final remainder batch", async () => {
    const ids = Array.from({ length: 50 }, (_, index) => index + 1);
    const request = vi.fn(async (spec) => {
      if (spec.source === "futgg") return JSON.stringify({ data: {} });
      const encodedIds = new URL(spec.url).searchParams.get("ids")?.split("_");
      expect(encodedIds).toHaveLength(50);
      return "[]";
    });
    await resolvePriceBatch(ids, {
      request,
      platform: "console",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
