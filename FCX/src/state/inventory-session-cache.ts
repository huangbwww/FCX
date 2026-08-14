export type InventoryBucket = "club" | "storage";

export interface InventorySnapshotLoadResult<T> {
  items: readonly T[];
  liveCount?: number;
}

interface InventorySnapshot<T> {
  items: T[];
  ids: Set<number>;
  liveCount: number;
  updatedAt: number;
}

export interface ReadInventorySnapshotOptions<T> {
  personaId: string;
  bucket: InventoryBucket;
  load(): Promise<InventorySnapshotLoadResult<T>>;
  force?: boolean;
  now?: number;
  liveCount?: number;
}

const itemId = (item: unknown): number => {
  const candidate = item as { id?: unknown; itemId?: unknown; _id?: unknown } | undefined;
  const value = Number(candidate?.id ?? candidate?.itemId ?? candidate?._id);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const uniqueItems = <T>(items: readonly T[]): T[] => {
  const result: T[] = [];
  const ids = new Set<number>();
  for (const item of items) {
    const id = itemId(item);
    if (id > 0) {
      if (ids.has(id)) continue;
      ids.add(id);
    }
    result.push(item);
  }
  return result;
};

export class InventorySessionCache<T> {
  private readonly snapshots = new Map<string, InventorySnapshot<T>>();
  private readonly inFlight = new Map<string, Promise<T[]>>();

  constructor(private readonly ttlMs = 10 * 60 * 1000) {}

  async read(options: ReadInventorySnapshotOptions<T>): Promise<T[]> {
    const key = this.key(options.personaId, options.bucket);
    const now = options.now ?? Date.now();
    const cached = this.snapshots.get(key);
    const liveCount = Number(options.liveCount);
    const countStillCompatible = !Number.isFinite(liveCount)
      || liveCount < 0
      || !cached
      || liveCount === cached.liveCount;
    if (
      !options.force
      && cached
      && now - cached.updatedAt < this.ttlMs
      && countStillCompatible
    ) {
      return [...cached.items];
    }

    const existing = this.inFlight.get(key);
    if (existing) return [...(await existing)];

    const pending = options.load().then((loaded) => {
      const items = uniqueItems(loaded.items);
      const snapshot: InventorySnapshot<T> = {
        items,
        ids: new Set(items.map(itemId).filter((id) => id > 0)),
        liveCount: Number.isFinite(Number(loaded.liveCount))
          ? Math.max(0, Number(loaded.liveCount))
          : items.length,
        updatedAt: options.now ?? Date.now(),
      };
      this.snapshots.set(key, snapshot);
      return [...items];
    }).finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return [...(await pending)];
  }

  peek(
    personaId: string,
    bucket: InventoryBucket,
    options: { now?: number; liveCount?: number } = {},
  ): T[] | undefined {
    const snapshot = this.snapshots.get(this.key(personaId, bucket));
    if (!snapshot) return undefined;
    const now = options.now ?? Date.now();
    if (now - snapshot.updatedAt >= this.ttlMs) return undefined;
    const liveCount = Number(options.liveCount);
    if (Number.isFinite(liveCount) && liveCount > 0 && liveCount !== snapshot.liveCount) {
      return undefined;
    }
    return [...snapshot.items];
  }

  invalidate(personaId?: string, bucket?: InventoryBucket): void {
    for (const key of [...this.snapshots.keys()]) {
      if (personaId && !key.startsWith(`${personaId}:`)) continue;
      if (bucket && !key.endsWith(`:${bucket}`)) continue;
      this.snapshots.delete(key);
    }
  }

  remove(personaId: string, ids: readonly number[]): void {
    const removeIds = new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0));
    if (!removeIds.size) return;
    for (const bucket of ["club", "storage"] as const) {
      const snapshot = this.snapshots.get(this.key(personaId, bucket));
      if (!snapshot) continue;
      snapshot.items = snapshot.items.filter((item) => !removeIds.has(itemId(item)));
      for (const id of removeIds) snapshot.ids.delete(id);
      snapshot.liveCount = snapshot.items.length;
      snapshot.updatedAt = Date.now();
    }
  }

  upsert(personaId: string, bucket: InventoryBucket, item: T): void {
    const id = itemId(item);
    if (!id) return;
    const otherBucket: InventoryBucket = bucket === "club" ? "storage" : "club";
    const other = this.snapshots.get(this.key(personaId, otherBucket));
    if (other?.ids.has(id)) {
      other.items = other.items.filter((candidate) => itemId(candidate) !== id);
      other.ids.delete(id);
      other.liveCount = other.items.length;
      other.updatedAt = Date.now();
    }
    const snapshot = this.snapshots.get(this.key(personaId, bucket));
    if (!snapshot) return;
    const index = snapshot.items.findIndex((candidate) => itemId(candidate) === id);
    if (index >= 0) snapshot.items[index] = item;
    else snapshot.items.push(item);
    snapshot.ids.add(id);
    snapshot.liveCount = Math.max(snapshot.liveCount, snapshot.items.length);
    snapshot.updatedAt = Date.now();
  }

  updateExisting(personaId: string, item: T): void {
    const id = itemId(item);
    if (!id) return;
    for (const bucket of ["club", "storage"] as const) {
      const snapshot = this.snapshots.get(this.key(personaId, bucket));
      if (!snapshot?.ids.has(id)) continue;
      const index = snapshot.items.findIndex((candidate) => itemId(candidate) === id);
      if (index >= 0) snapshot.items[index] = item;
      snapshot.updatedAt = Date.now();
    }
  }

  private key(personaId: string, bucket: InventoryBucket): string {
    return `${personaId}:${bucket}`;
  }
}
