export interface PriceCalculationInput {
  marketPrice: number | null;
  ratingReferencePrice: number | null;
  rating: number;
  fixed: boolean;
  concept: boolean;
  evolution: boolean;
  duplicate: boolean;
  storage: boolean;
  tradeable: boolean;
}

export interface PriceCalculationSettings {
  duplicateDiscount: number;
  untradeableDiscount: number;
  conceptPremium: number;
  evoPremium: number;
}

export function calculateSbcPrice(
  input: PriceCalculationInput,
  settings: PriceCalculationSettings,
): number {
  if (input.fixed) {
    return 1;
  }

  let price = Math.max(
    input.marketPrice ?? Number.NEGATIVE_INFINITY,
    input.ratingReferencePrice ?? Number.NEGATIVE_INFINITY,
    100,
  );
  if (input.marketPrice === -1) {
    return price * 1.5;
  }
  if (input.concept) {
    return settings.conceptPremium * price;
  }
  if (input.evolution) {
    return settings.evoPremium * price;
  }

  price -= 100 - input.rating;
  if (input.duplicate) {
    price *= settings.duplicateDiscount / 100;
  }
  if (input.storage) {
    price *= settings.duplicateDiscount / 100;
  }
  if (!input.tradeable) {
    price *= settings.untradeableDiscount / 100;
  }
  return price;
}
