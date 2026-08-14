import { PRICE_DATABASE, STORAGE_KEYS } from "../config/constants";
import type {
  PricePersistenceResult,
  PriceRecord,
  PriceRecordMap,
  PriceStorageTargetResult,
} from "../types/prices";

interface StoredPriceCollection {
  id: string;
  data: PriceRecordMap;
}

const SUPPORTED_PRICE_SOURCES = new Set(["futgg", "futnext", "liveSearch", "unknown"]);

function isUnsupportedPriceRecord(record: PriceRecord): boolean {
  const source = (record as unknown as { source?: unknown }).source;
  return typeof source === "string" && !SUPPORTED_PRICE_SOURCES.has(source);
}

export function removeUnsupportedPriceRecords(
  records: PriceRecordMap,
): { records: PriceRecordMap; removed: number } {
  const sanitized: PriceRecordMap = {};
  let removed = 0;
  for (const [key, record] of Object.entries(records)) {
    if (isUnsupportedPriceRecord(record)) {
      removed += 1;
      continue;
    }
    sanitized[key] = record;
  }
  return { records: sanitized, removed };
}

function timestampOf(record: PriceRecord | undefined): number {
  if (!record) return Number.NEGATIVE_INFINITY;
  const raw = record.timeStamp ?? record.timestamp;
  if (!raw) return Number.NEGATIVE_INFINITY;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

export function isPriceRecordMap(value: unknown): value is PriceRecordMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function comparableTimestamp(record: PriceRecord): string {
  const raw = record.timeStamp ?? record.timestamp;
  if (!raw) return "";
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? new Date(value).toISOString() : String(raw);
}

function comparableRecord(record: PriceRecord | undefined): string {
  if (!record) return "<missing>";
  return JSON.stringify({
    eaId: record.eaId ?? null,
    rating: record.rating ?? null,
    price: Number(record.price),
    timeStamp: comparableTimestamp(record),
    isExtinct: Boolean(record.isExtinct),
    isSbc: Boolean(record.isSbc),
    isObjective: Boolean(record.isObjective),
    name: record.name ?? "",
    source: record.source ?? "unknown",
  });
}

export function countPriceRecordMismatches(
  expected: PriceRecordMap,
  actual: PriceRecordMap,
): number {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  let mismatchCount = 0;
  for (const key of keys) {
    if (comparableRecord(expected[key]) !== comparableRecord(actual[key])) {
      mismatchCount += 1;
    }
  }
  return mismatchCount;
}

export function mergePriceRecordMaps(
  first: PriceRecordMap,
  second: PriceRecordMap,
): PriceRecordMap {
  const merged: PriceRecordMap = { ...first };
  for (const [key, candidate] of Object.entries(second)) {
    const existing = merged[key];
    if (!existing || timestampOf(candidate) >= timestampOf(existing)) {
      merged[key] = candidate;
    }
  }
  return merged;
}

function readRawFallbackPriceRecords(storage: Storage): PriceRecordMap {
  try {
    const serialized = storage.getItem(STORAGE_KEYS.fallbackPrices);
    if (!serialized) return {};
    const parsed: unknown = JSON.parse(serialized);
    return isPriceRecordMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readFallbackPriceRecords(storage: Storage): PriceRecordMap {
  return removeUnsupportedPriceRecords(readRawFallbackPriceRecords(storage)).records;
}

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(PRICE_DATABASE.name);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PRICE_DATABASE.store)) {
        database.createObjectStore(PRICE_DATABASE.store, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(PRICE_DATABASE.store)) {
        resolve(database);
        return;
      }
      const nextVersion = database.version + 1;
      database.close();
      const upgradeRequest = indexedDb.open(PRICE_DATABASE.name, nextVersion);
      upgradeRequest.onupgradeneeded = () => {
        if (!upgradeRequest.result.objectStoreNames.contains(PRICE_DATABASE.store)) {
          upgradeRequest.result.createObjectStore(PRICE_DATABASE.store, {
            keyPath: "id",
          });
        }
      };
      upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
      upgradeRequest.onerror = () =>
        reject(upgradeRequest.error ?? new Error("IndexedDB upgrade failed"));
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function readRawIndexedDbPriceRecords(
  indexedDb: IDBFactory | undefined,
): Promise<PriceRecordMap> {
  if (!indexedDb) return {};
  const database = await openDatabase(indexedDb);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(PRICE_DATABASE.store, "readonly");
      const request = transaction
        .objectStore(PRICE_DATABASE.store)
        .get(PRICE_DATABASE.record);
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (
          typeof value === "object" &&
          value !== null &&
          "data" in value &&
          isPriceRecordMap((value as StoredPriceCollection).data)
        ) {
          resolve((value as StoredPriceCollection).data);
        } else {
          resolve({});
        }
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
  } finally {
    database.close();
  }
}

export async function readIndexedDbPriceRecords(
  indexedDb: IDBFactory | undefined,
): Promise<PriceRecordMap> {
  const records = await readRawIndexedDbPriceRecords(indexedDb);
  return removeUnsupportedPriceRecords(records).records;
}

async function writeIndexedDbPriceRecords(
  records: PriceRecordMap,
  indexedDb: IDBFactory,
): Promise<void> {
  const database = await openDatabase(indexedDb);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PRICE_DATABASE.store, "readwrite");
      transaction
        .objectStore(PRICE_DATABASE.store)
        .put({ id: PRICE_DATABASE.record, data: records } satisfies StoredPriceCollection);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("IndexedDB price save failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB price save aborted"));
    });
  } finally {
    database.close();
  }
}

function unavailableTarget(error: string): PriceStorageTargetResult {
  return {
    available: false,
    written: false,
    readBack: false,
    matches: false,
    recordCount: 0,
    mismatchCount: 0,
    error,
  };
}

export async function loadPriceRecords(
  indexedDb: IDBFactory | undefined,
  storage: Storage,
): Promise<PriceRecordMap> {
  const fallback = readRawFallbackPriceRecords(storage);
  let unsupportedRecordCount = removeUnsupportedPriceRecords(fallback).removed;
  let merged = fallback;
  try {
    const indexed = await readRawIndexedDbPriceRecords(indexedDb);
    unsupportedRecordCount += removeUnsupportedPriceRecords(indexed).removed;
    merged = mergePriceRecordMaps(indexed, fallback);
  } catch {
    merged = fallback;
  }

  const sanitized = removeUnsupportedPriceRecords(merged);
  if (unsupportedRecordCount > 0) {
    await savePriceRecords(sanitized.records, indexedDb, storage);
  }
  return sanitized.records;
}

export async function savePriceRecords(
  records: PriceRecordMap,
  indexedDb: IDBFactory | undefined,
  storage: Storage,
): Promise<PricePersistenceResult> {
  const sanitizedRecords = removeUnsupportedPriceRecords(records).records;
  let localResult: PriceStorageTargetResult;
  try {
    storage.setItem(STORAGE_KEYS.fallbackPrices, JSON.stringify(sanitizedRecords));
    const readBack = readFallbackPriceRecords(storage);
    const mismatchCount = countPriceRecordMismatches(sanitizedRecords, readBack);
    localResult = {
      available: true,
      written: true,
      readBack: true,
      matches: mismatchCount === 0,
      recordCount: Object.keys(readBack).length,
      mismatchCount,
    };
  } catch (error) {
    localResult = unavailableTarget(String(error));
    localResult.available = true;
  }

  let indexedResult: PriceStorageTargetResult;
  if (!indexedDb) {
    indexedResult = unavailableTarget("IndexedDB unavailable");
  } else {
    try {
      await writeIndexedDbPriceRecords(sanitizedRecords, indexedDb);
      const readBack = await readIndexedDbPriceRecords(indexedDb);
      const mismatchCount = countPriceRecordMismatches(sanitizedRecords, readBack);
      indexedResult = {
        available: true,
        written: true,
        readBack: true,
        matches: mismatchCount === 0,
        recordCount: Object.keys(readBack).length,
        mismatchCount,
      };
    } catch (error) {
      indexedResult = unavailableTarget(String(error));
      indexedResult.available = true;
    }
  }

  return {
    success:
      (localResult.written && localResult.readBack && localResult.matches) ||
      (indexedResult.written && indexedResult.readBack && indexedResult.matches),
    expectedCount: Object.keys(sanitizedRecords).length,
    indexedDb: indexedResult,
    localStorage: localResult,
  };
}

export interface PriceStorageInspection {
  indexedDb: {
    available: boolean;
    version?: number;
    hasStore: boolean;
    hasRecord: boolean;
    records: PriceRecordMap;
    error?: string;
  };
  localStorage: {
    available: boolean;
    exists: boolean;
    bytes: number;
    records: PriceRecordMap;
    error?: string;
  };
}

export async function inspectPriceStorage(
  indexedDb: IDBFactory | undefined,
  storage: Storage,
): Promise<PriceStorageInspection> {
  let localStorageInspection: PriceStorageInspection["localStorage"];
  try {
    const serialized = storage.getItem(STORAGE_KEYS.fallbackPrices);
    localStorageInspection = {
      available: true,
      exists: serialized !== null,
      bytes: serialized ? new TextEncoder().encode(serialized).length : 0,
      records: readFallbackPriceRecords(storage),
    };
  } catch (error) {
    localStorageInspection = {
      available: false,
      exists: false,
      bytes: 0,
      records: {},
      error: String(error),
    };
  }

  let indexedDbInspection: PriceStorageInspection["indexedDb"];
  if (!indexedDb) {
    indexedDbInspection = {
      available: false,
      hasStore: false,
      hasRecord: false,
      records: {},
      error: "IndexedDB unavailable",
    };
  } else {
    try {
      const database = await openDatabase(indexedDb);
      const version = database.version;
      const hasStore = database.objectStoreNames.contains(PRICE_DATABASE.store);
      database.close();
      const records = hasStore ? await readIndexedDbPriceRecords(indexedDb) : {};
      indexedDbInspection = {
        available: true,
        version,
        hasStore,
        hasRecord: Object.keys(records).length > 0,
        records,
      };
    } catch (error) {
      indexedDbInspection = {
        available: false,
        hasStore: false,
        hasRecord: false,
        records: {},
        error: String(error),
      };
    }
  }

  return { indexedDb: indexedDbInspection, localStorage: localStorageInspection };
}

export async function clearPriceRecords(
  indexedDb: IDBFactory | undefined,
  storage: Storage,
): Promise<void> {
  storage.removeItem(STORAGE_KEYS.fallbackPrices);
  if (!indexedDb) return;
  const database = await openDatabase(indexedDb);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PRICE_DATABASE.store, "readwrite");
      transaction.objectStore(PRICE_DATABASE.store).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("IndexedDB price clear failed"));
    });
  } finally {
    database.close();
  }
}
