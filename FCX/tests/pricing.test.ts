import { describe, expect, it } from "vitest";
import { calculateSbcPrice } from "../src/domain/sbc/pricing";

const settings = {
  duplicateDiscount: 50,
  untradeableDiscount: 80,
  conceptPremium: 10,
  evoPremium: 2,
};

const base = {
  marketPrice: 1_000,
  ratingReferencePrice: 900,
  rating: 80,
  fixed: false,
  concept: false,
  evolution: false,
  duplicate: false,
  storage: false,
  tradeable: true,
};

describe("legacy SBC price calculation", () => {
  it("uses the fixed item sentinel price", () => {
    expect(calculateSbcPrice({ ...base, fixed: true }, settings)).toBe(1);
  });

  it("applies the legacy rating discount and value multipliers in order", () => {
    expect(
      calculateSbcPrice(
        {
          ...base,
          duplicate: true,
          storage: true,
          tradeable: false,
        },
        settings,
      ),
    ).toBe(196);
  });

  it("returns concept and evolution premiums before later discounts", () => {
    expect(calculateSbcPrice({ ...base, concept: true }, settings)).toBe(10_000);
    expect(calculateSbcPrice({ ...base, evolution: true }, settings)).toBe(2_000);
  });

  it("preserves the missing-price 1.5 multiplier", () => {
    expect(
      calculateSbcPrice(
        { ...base, marketPrice: -1, ratingReferencePrice: 400 },
        settings,
      ),
    ).toBe(600);
  });

  it("uses rating-based fallback cost when value is ignored", () => {
    expect(
      calculateSbcPrice(
        { ...base, marketPrice: null, ratingReferencePrice: null },
        settings,
      ),
    ).toBe(80);
  });
});
