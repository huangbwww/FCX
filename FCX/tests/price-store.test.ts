import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config/constants";
import {
  clearPriceRecords,
  loadPriceRecords,
  mergePriceRecordMaps,
  readFallbackPriceRecords,
  readIndexedDbPriceRecords,
  savePriceRecords,
} from "../src/state/price-store";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class MemoryIndexedDb {
  private record: unknown;
  private hasStore = false;

  readonly factory = {
    open: () => {
      const request: Record<string, unknown> = {
        result: undefined,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      const database = this.createDatabase();
      request.result = database;
      queueMicrotask(() => {
        if (!this.hasStore) {
          (request.onupgradeneeded as (() => void) | null)?.();
        }
        (request.onsuccess as (() => void) | null)?.();
      });
      return request;
    },
  } as unknown as IDBFactory;

  seed(records: unknown): void {
    this.hasStore = true;
    this.record = { id: "allPriceItems", data: records };
  }

  private createDatabase(): IDBDatabase {
    const database = {
      objectStoreNames: {
        contains: () => this.hasStore,
      },
      createObjectStore: () => {
        this.hasStore = true;
        return {};
      },
      close: () => undefined,
      transaction: () => {
        const transaction: Record<string, unknown> = {
          error: null,
          oncomplete: null,
          onerror: null,
          onabort: null,
        };
        const store = {
          get: () => {
            const request: Record<string, unknown> = {
              result: undefined,
              error: null,
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => {
              request.result = this.record;
              (request.onsuccess as (() => void) | null)?.();
            });
            return request;
          },
          put: (value: unknown) => {
            this.record = value;
            queueMicrotask(() => {
              (transaction.oncomplete as (() => void) | null)?.();
            });
          },
          clear: () => {
            this.record = undefined;
            queueMicrotask(() => {
              (transaction.oncomplete as (() => void) | null)?.();
            });
          },
        };
        transaction.objectStore = () => store;
        return transaction;
      },
    };
    return database as unknown as IDBDatabase;
  }
}

describe("price persistence", () => {
  let storage: MemoryStorage;
  let indexedDb: MemoryIndexedDb;

  beforeEach(() => {
    storage = new MemoryStorage();
    indexedDb = new MemoryIndexedDb();
  });

  it("prefers the newest timestamp when stores contain the same player", () => {
    const merged = mergePriceRecordMaps(
      {
        1: { price: 1_000, timeStamp: "2026-08-01T00:00:00Z" },
        2: { price: 2_000, timeStamp: "2026-08-03T00:00:00Z" },
      },
      {
        1: { price: 1_500, timeStamp: "2026-08-02T00:00:00Z" },
        2: { price: 1_800, timeStamp: "2026-08-02T00:00:00Z" },
      },
    );

    expect(merged["1"]?.price).toBe(1_500);
    expect(merged["2"]?.price).toBe(2_000);
  });

  it("saves to IndexedDB and mirrors the legacy localStorage key", async () => {
    const records = {
      123: {
        eaId: 123,
        rating: 88,
        price: 19_000,
        timeStamp: "2026-08-02T00:00:00Z",
      },
    };

    const result = await savePriceRecords(records, indexedDb.factory, storage);

    expect(result.success).toBe(true);
    expect(result.indexedDb.matches).toBe(true);
    expect(result.localStorage.matches).toBe(true);
    expect(readFallbackPriceRecords(storage)).toEqual(records);
    await expect(loadPriceRecords(indexedDb.factory, storage)).resolves.toEqual(
      records,
    );
  });

  it("uses a newer localStorage record and clears both stores", async () => {
    await savePriceRecords(
      { 7: { price: 700, timeStamp: "2026-08-01T00:00:00Z" } },
      indexedDb.factory,
      storage,
    );
    storage.setItem(
      STORAGE_KEYS.fallbackPrices,
      JSON.stringify({
        7: { price: 900, timeStamp: "2026-08-02T00:00:00Z" },
      }),
    );

    const loaded = await loadPriceRecords(indexedDb.factory, storage);
    expect(loaded["7"]?.price).toBe(900);

    await clearPriceRecords(indexedDb.factory, storage);
    await expect(loadPriceRecords(indexedDb.factory, storage)).resolves.toEqual({});
  });

  it("removes records from unsupported price sources while loading", async () => {
    indexedDb.seed({
      1: {
        price: 1_000,
        source: "retired-provider",
        timeStamp: "2026-08-03T00:00:00Z",
      },
      2: {
        price: 2_000,
        source: "futnext",
        timeStamp: "2026-08-03T00:00:00Z",
      },
    });
    storage.setItem(
      STORAGE_KEYS.fallbackPrices,
      JSON.stringify({
        1: {
          price: 1_500,
          source: "retired-provider",
          timeStamp: "2026-08-04T00:00:00Z",
        },
        3: {
          price: 3_000,
          source: "futgg",
          timeStamp: "2026-08-03T00:00:00Z",
        },
      }),
    );
    await expect(loadPriceRecords(indexedDb.factory, storage)).resolves.toEqual({
      2: {
        price: 2_000,
        source: "futnext",
        timeStamp: "2026-08-03T00:00:00Z",
      },
      3: {
        price: 3_000,
        source: "futgg",
        timeStamp: "2026-08-03T00:00:00Z",
      },
    });
    expect(readFallbackPriceRecords(storage)).not.toHaveProperty("1");
    await expect(readIndexedDbPriceRecords(indexedDb.factory)).resolves.not.toHaveProperty("1");
  });

  it("opens an existing version 2 database without requesting a downgrade", async () => {
    const open = vi.fn((_name: string, version?: number) => {
      const request: Record<string, unknown> = {
        result: undefined,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };
      const database = {
        version: 2,
        objectStoreNames: { contains: () => true },
        close() {},
        transaction() {
          return {
            objectStore: () => ({
              get: () => {
                const getRequest: Record<string, unknown> = {
                  result: undefined,
                  onsuccess: null,
                  onerror: null,
                };
                queueMicrotask(() =>
                  (getRequest.onsuccess as (() => void) | null)?.(),
                );
                return getRequest;
              },
            }),
          };
        },
      };
      request.result = database;
      queueMicrotask(() => (request.onsuccess as (() => void) | null)?.());
      return request;
    });

    await expect(
      loadPriceRecords({ open } as unknown as IDBFactory, storage),
    ).resolves.toEqual({});
    expect(open).toHaveBeenCalledWith("futSBCDatabase");
    expect(open.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("accepts either verified storage target and fails only when both fail", async () => {
    const localOnly = await savePriceRecords(
      { 8: { price: 800, timeStamp: "2026-08-03T00:00:00Z" } },
      undefined,
      storage,
    );
    expect(localOnly.success).toBe(true);
    expect(localOnly.localStorage.matches).toBe(true);
    expect(localOnly.indexedDb.available).toBe(false);

    const brokenStorage = {
      get length() { return 0; },
      clear() { throw new Error("blocked"); },
      getItem() { throw new Error("blocked"); },
      key() { return null; },
      removeItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    } as Storage;
    const indexedOnly = await savePriceRecords(
      { 9: { price: 900, timeStamp: "2026-08-03T00:00:00Z" } },
      indexedDb.factory,
      brokenStorage,
    );
    expect(indexedOnly.success).toBe(true);
    expect(indexedOnly.indexedDb.matches).toBe(true);

    const neither = await savePriceRecords(
      { 10: { price: 1_000, timeStamp: "2026-08-03T00:00:00Z" } },
      undefined,
      brokenStorage,
    );
    expect(neither.success).toBe(false);
  });
});
