import { describe, expect, it } from "vitest";
import { countPlayersByRating } from "../src/domain/inventory/rating-counts";

describe("rating count UI bins", () => {
  it("preserves the legacy bin boundaries and total", () => {
    const counts = countPlayersByRating(
      [64, 65, 74, 75, 82, 83, 99].map((rating) => ({ rating })),
    );
    expect(counts["<65"]).toBe(1);
    expect(counts["<75"]).toBe(2);
    expect(counts["<83"]).toBe(2);
    expect(counts["83"]).toBe(1);
    expect(counts["99"]).toBe(1);
    expect(counts.total).toBe(7);
  });
});
