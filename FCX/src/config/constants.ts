export const API_URL = "http://127.0.0.1:8000";

export const STORAGE_KEYS = {
  solverSettings: "sbcSolverSettings",
  fixedItems: "fixeditems",
  conceptPlayerTotal: "conceptPlayerTotal",
  fallbackPrices: "futggPrices",
} as const;

export const PRICE_DATABASE = {
  name: "futSBCDatabase",
  store: "priceItems",
  record: "allPriceItems",
} as const;

export const DEFAULT_SEARCH_BATCH_SIZE = 91;
export const PRICE_LOOKUP_BATCH_SIZE = 50;
export const MILLIS_IN_SECOND = 1_000;
