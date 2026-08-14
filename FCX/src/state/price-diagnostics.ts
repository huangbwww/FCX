import { countRecordsBySource } from "../domain/market/price-providers";
import { isCachedPriceOld } from "../domain/market/price-cache";
import type {
  PriceCacheDiagnostics,
  PriceDiagnosticEvent,
  PriceFetchResult,
  PricePersistenceResult,
  PriceRecordMap,
} from "../types/prices";
import {
  countPriceRecordMismatches,
  inspectPriceStorage,
} from "./price-store";

export function appendPriceDiagnosticEvent(
  events: PriceDiagnosticEvent[],
  event: Omit<PriceDiagnosticEvent, "time"> & { time?: string },
  limit = 50,
): void {
  events.push({
    ...event,
    time: event.time ?? new Date().toISOString(),
  });
  if (events.length > limit) events.splice(0, events.length - limit);
}

export interface CollectPriceDiagnosticsOptions {
  memoryRecords: PriceRecordMap;
  indexedDb: IDBFactory | undefined;
  storage: Storage;
  cacheMinutes: number;
  lastFetch?: PriceFetchResult;
  lastPersistence?: PricePersistenceResult;
  events?: readonly PriceDiagnosticEvent[];
  now?: Date;
}

export async function collectPriceCacheDiagnostics(
  options: CollectPriceDiagnosticsOptions,
): Promise<PriceCacheDiagnostics> {
  const now = options.now ?? new Date();
  const inspection = await inspectPriceStorage(options.indexedDb, options.storage);
  const memoryEntries = Object.values(options.memoryRecords);
  let freshCount = 0;
  let staleCount = 0;
  let invalidCount = 0;
  const timestamps: number[] = [];

  for (const record of memoryEntries) {
    const validPrice =
      (Number.isFinite(Number(record.price)) && Number(record.price) > 0) ||
      Boolean(record.isExtinct || record.isSbc || record.isObjective);
    if (!validPrice) invalidCount += 1;
    else if (isCachedPriceOld(record, options.cacheMinutes, now)) staleCount += 1;
    else freshCount += 1;

    const rawTimestamp = record.timeStamp ?? record.timestamp;
    if (rawTimestamp) {
      const value = new Date(rawTimestamp).getTime();
      if (Number.isFinite(value)) timestamps.push(value);
    }
  }

  const indexedMismatch = countPriceRecordMismatches(
    options.memoryRecords,
    inspection.indexedDb.records,
  );
  const localMismatch = countPriceRecordMismatches(
    options.memoryRecords,
    inspection.localStorage.records,
  );
  const oldest = timestamps.length ? Math.min(...timestamps) : undefined;
  const newest = timestamps.length ? Math.max(...timestamps) : undefined;

  return {
    checkedAt: now.toISOString(),
    memoryCount: Object.keys(options.memoryRecords).length,
    indexedDb: {
      available: inspection.indexedDb.available,
      recordCount: Object.keys(inspection.indexedDb.records).length,
      mismatchCount: indexedMismatch,
      matchesMemory: indexedMismatch === 0,
      hasStore: inspection.indexedDb.hasStore,
      hasRecord: inspection.indexedDb.hasRecord,
      ...(inspection.indexedDb.version !== undefined
        ? { version: inspection.indexedDb.version }
        : {}),
      ...(inspection.indexedDb.error ? { error: inspection.indexedDb.error } : {}),
    },
    localStorage: {
      available: inspection.localStorage.available,
      recordCount: Object.keys(inspection.localStorage.records).length,
      mismatchCount: localMismatch,
      matchesMemory: localMismatch === 0,
      exists: inspection.localStorage.exists,
      bytes: inspection.localStorage.bytes,
      ...(inspection.localStorage.error
        ? { error: inspection.localStorage.error }
        : {}),
    },
    freshCount,
    staleCount,
    invalidCount,
    sourceCounts: countRecordsBySource(options.memoryRecords),
    ...(oldest !== undefined ? { oldestTimestamp: new Date(oldest).toISOString() } : {}),
    ...(newest !== undefined ? { newestTimestamp: new Date(newest).toISOString() } : {}),
    ...(options.lastFetch ? { lastFetch: options.lastFetch } : {}),
    ...(options.lastPersistence
      ? { lastPersistence: options.lastPersistence }
      : {}),
    events: [...(options.events ?? [])],
  };
}

export function serializePriceDiagnostics(diagnostics: PriceCacheDiagnostics): string {
  const missing = diagnostics.lastFetch?.missing.slice(0, 20) ?? [];
  return JSON.stringify(
    {
      ...diagnostics,
      lastFetch: diagnostics.lastFetch
        ? { ...diagnostics.lastFetch, missing }
        : undefined,
    },
    null,
    2,
  );
}
