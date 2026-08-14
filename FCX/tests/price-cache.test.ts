import { describe, expect, it } from "vitest";
import {
  getStalePriceIds,
  isCachedPriceOld,
  updateRatingReferencePrices,
} from "../src/domain/market/price-cache";
import type { PriceRecordMap } from "../src/types/prices";

describe("price cache", () => {
  it("updates CBR entries with the cheapest non-extinct player", () => {
    const now = new Date("2026-08-02T00:00:00Z");
    const result = updateRatingReferencePrices(
      {
        1: { rating: 84, price: 2_000 },
        2: { rating: 84, price: 1_500 },
        3: { rating: 84, price: 1_000, isExtinct: true },
      },
      now,
    );
    expect(result["84_CBR"]).toMatchObject({
      eaId: "84_CBR",
      rating: 84,
      price: 1_500,
      isExtinct: false,
      timeStamp: now,
    });
  });

  it("deduplicates player IDs and only returns missing or expired prices", () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    const player = (definitionId: number) => ({
      definitionId,
      isPlayer: () => true,
    });
    const records: PriceRecordMap = {
      1: { price: 1_000, timeStamp: "2026-08-02T11:30:00.000Z" },
      2: { price: 2_000, timeStamp: "2026-08-02T09:00:00.000Z" },
    };

    expect(
      getStalePriceIds(
        [player(1), player(1), player(2), player(3)],
        records,
        60,
        now,
      ),
    ).toEqual([2, 3]);
  });

  it("uses the configured cache duration", () => {
    const now = new Date("2026-08-02T01:01:00Z");
    expect(
      isCachedPriceOld(
        { timeStamp: "2026-08-02T00:00:00Z" },
        60,
        now,
      ),
    ).toBe(true);
  });

  it("refreshes legacy records that have no valid timestamp", () => {
    expect(isCachedPriceOld({} as { timeStamp?: string | Date }, 60)).toBe(true);
    expect(
      isCachedPriceOld({ timeStamp: "not-a-date" }, 60),
    ).toBe(true);
  });
});
