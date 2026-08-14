import type {
  PriceLookupCoordinatorResult,
  PricePersistenceResult,
  PriceProviderResult,
  PriceRecordMap,
} from "../../types/prices";

export interface CoordinatedBatchResult {
  records: PriceRecordMap;
  missing: Array<number | string>;
  providers: PriceProviderResult[];
}

export interface PriceLookupCoordinatorOptions {
  batchSize: number;
  debounceMs: number;
  minimumBatchIntervalMs: number;
  missingCooldownMs: number;
  resolveBatch(ids: Array<number | string>): Promise<CoordinatedBatchResult>;
  persist(records: PriceRecordMap): Promise<PricePersistenceResult | undefined>;
  onResult?(result: PriceLookupCoordinatorResult): void;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export class PriceLookupCoordinator {
  private readonly pending = new Map<string, number | string>();
  private readonly missingUntil = new Map<string, number>();
  private cycle: Deferred<PriceLookupCoordinatorResult> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private lastBatchAt = 0;

  constructor(private readonly options: PriceLookupCoordinatorOptions) {
    if (options.batchSize <= 0) throw new RangeError("batchSize must be positive");
  }

  request(
    ids: readonly (number | string)[],
    requestOptions: { force?: boolean } = {},
  ): Promise<PriceLookupCoordinatorResult> {
    const now = Date.now();
    for (const id of ids) {
      const key = String(id);
      if (!requestOptions.force && (this.missingUntil.get(key) ?? 0) > now) continue;
      this.pending.set(key, id);
    }
    if (!this.pending.size && !this.running) {
      return Promise.resolve({
        status: "skipped",
        requested: 0,
        fetched: 0,
        missing: [],
        records: {},
      });
    }
    this.cycle ??= deferred<PriceLookupCoordinatorResult>();
    if (!this.running && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.drain();
      }, this.options.debounceMs);
    }
    return this.cycle.promise;
  }

  clear(): void {
    this.pending.clear();
    this.missingUntil.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const currentCycle = this.cycle ?? deferred<PriceLookupCoordinatorResult>();
    this.cycle = currentCycle;
    const requestedIds = new Map<string, number | string>();
    const records: PriceRecordMap = {};
    const missing = new Map<string, number | string>();
    const providers: PriceProviderResult[] = [];
    let persistence: PricePersistenceResult | undefined;
    let error: string | undefined;

    try {
      do {
        while (this.pending.size) {
          const batch = [...this.pending.values()].slice(0, this.options.batchSize);
          for (const id of batch) {
            const key = String(id);
            this.pending.delete(key);
            requestedIds.set(key, id);
          }
          const waitMs = Math.max(
            0,
            this.options.minimumBatchIntervalMs - (Date.now() - this.lastBatchAt),
          );
          if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
          this.lastBatchAt = Date.now();
          const result = await this.options.resolveBatch(batch);
          Object.assign(records, result.records);
          providers.push(...result.providers);
          for (const id of result.missing) {
            const key = String(id);
            missing.set(key, id);
            this.missingUntil.set(key, Date.now() + this.options.missingCooldownMs);
          }
        }
        if (Object.keys(records).length) {
          persistence = await this.options.persist(records);
        }
        // Requests that arrive while persistence is running join the same cycle.
      } while (this.pending.size);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      for (const [key, id] of requestedIds) {
        if (!(key in records)) missing.set(key, id);
      }
    }

    const fetched = Object.keys(records).length;
    const result: PriceLookupCoordinatorResult = {
      status: error
        ? "failed"
        : fetched === 0
          ? "failed"
          : missing.size
            ? "partial"
            : "complete",
      requested: requestedIds.size,
      fetched,
      missing: [...missing.values()],
      records,
      providers,
      ...(persistence ? { persistence } : {}),
      ...(error ? { error } : {}),
    };
    this.options.onResult?.(result);
    this.running = false;
    this.cycle = undefined;
    currentCycle.resolve(result);

    if (this.pending.size) {
      this.cycle = deferred<PriceLookupCoordinatorResult>();
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.drain();
      }, this.options.debounceMs);
    }
  }
}
