export interface PriceRecord {
  eaId?: number | string;
  rating?: number;
  price: number;
  timeStamp?: string | Date;
  timestamp?: string | Date;
  isExtinct?: boolean;
  isSbc?: boolean;
  isObjective?: boolean;
  name?: string;
  source?: PriceSource;
}

export type PriceRecordMap = Record<string, PriceRecord>;

export type PriceSource =
  | "futgg"
  | "futnext"
  | "liveSearch"
  | "unknown";

export type PricePlatform = "pc" | "console";

export interface PriceRequestSpec {
  source: Exclude<PriceSource, "liveSearch" | "unknown">;
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  retries: number;
}

export interface PriceProviderResult {
  source: Exclude<PriceSource, "liveSearch" | "unknown">;
  requested: Array<number | string>;
  records: PriceRecordMap;
  missing: Array<number | string>;
  status: "complete" | "partial" | "failed" | "skipped";
  httpStatus?: number;
  error?: string;
}

export interface PriceStorageTargetResult {
  available: boolean;
  written: boolean;
  readBack: boolean;
  matches: boolean;
  recordCount: number;
  mismatchCount: number;
  error?: string;
}

export interface PricePersistenceResult {
  success: boolean;
  expectedCount: number;
  indexedDb: PriceStorageTargetResult;
  localStorage: PriceStorageTargetResult;
}

export interface PriceDiagnosticEvent {
  time: string;
  stage: "provider" | "persistence" | "cache";
  status: "info" | "success" | "warning" | "error";
  source?: PriceSource;
  requested?: number;
  returned?: number;
  httpStatus?: number;
  message: string;
}

export interface PriceCacheLayerDiagnostics {
  available: boolean;
  recordCount: number;
  mismatchCount: number;
  matchesMemory: boolean;
  error?: string;
}

export interface PriceCacheDiagnostics {
  checkedAt: string;
  memoryCount: number;
  indexedDb: PriceCacheLayerDiagnostics & {
    version?: number;
    hasStore: boolean;
    hasRecord: boolean;
  };
  localStorage: PriceCacheLayerDiagnostics & {
    exists: boolean;
    bytes: number;
  };
  freshCount: number;
  staleCount: number;
  invalidCount: number;
  sourceCounts: Record<PriceSource, number>;
  oldestTimestamp?: string;
  newestTimestamp?: string;
  lastFetch?: PriceFetchResult;
  lastPersistence?: PricePersistenceResult;
  events: PriceDiagnosticEvent[];
}

export type PriceFetchStatus = "complete" | "partial" | "failed" | "skipped";

export interface PriceFetchResult {
  status: PriceFetchStatus;
  requested: number;
  fetched: number;
  missing: Array<number | string>;
  providers?: PriceProviderResult[];
  persistence?: PricePersistenceResult;
  error?: string;
}

export interface PriceLookupCoordinatorResult extends PriceFetchResult {
  records: PriceRecordMap;
}
