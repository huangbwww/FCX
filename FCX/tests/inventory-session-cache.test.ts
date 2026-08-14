import { describe, expect, it, vi } from "vitest";
import { InventorySessionCache } from "../src/state/inventory-session-cache";

describe("InventorySessionCache", () => {
  it("reuses a persona snapshot and shares an in-flight load", async () => {
    const cache = new InventorySessionCache<{ id: number }>();
    let resolve!: (value: { items: { id: number }[]; liveCount: number }) => void;
    const load = vi.fn(() => new Promise<{ items: { id: number }[]; liveCount: number }>(
      (done) => (resolve = done),
    ));
    const first = cache.read({ personaId: "1", bucket: "club", load, liveCount: 0 });
    const second = cache.read({ personaId: "1", bucket: "club", load, liveCount: 0 });
    expect(load).toHaveBeenCalledTimes(1);
    resolve({ items: [{ id: 1 }, { id: 2 }], liveCount: 2 });
    await expect(first).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    await expect(second).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    await cache.read({ personaId: "1", bucket: "club", load, liveCount: 2 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("isolates personas and refreshes expired or outgrown snapshots", async () => {
    const cache = new InventorySessionCache<{ id: number }>(100);
    const load = vi.fn(async () => ({ items: [{ id: 1 }], liveCount: 1 }));
    await cache.read({ personaId: "1", bucket: "club", load, now: 0 });
    await cache.read({ personaId: "2", bucket: "club", load, now: 0 });
    await cache.read({ personaId: "1", bucket: "club", load, now: 101 });
    await cache.read({ personaId: "1", bucket: "club", load, now: 102, liveCount: 2 });
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("maintains club and storage snapshots incrementally", async () => {
    const cache = new InventorySessionCache<{ id: number; name?: string }>();
    await cache.read({
      personaId: "1",
      bucket: "club",
      load: async () => ({ items: [{ id: 1 }, { id: 2 }], liveCount: 2 }),
    });
    await cache.read({
      personaId: "1",
      bucket: "storage",
      load: async () => ({ items: [{ id: 3 }], liveCount: 1 }),
    });
    cache.upsert("1", "storage", { id: 2, name: "moved" });
    cache.updateExisting("1", { id: 3, name: "updated" });
    cache.remove("1", [1]);

    await expect(cache.read({
      personaId: "1",
      bucket: "club",
      load: async () => ({ items: [], liveCount: 0 }),
    })).resolves.toEqual([]);
    await expect(cache.read({
      personaId: "1",
      bucket: "storage",
      load: async () => ({ items: [], liveCount: 0 }),
    })).resolves.toEqual([{ id: 3, name: "updated" }, { id: 2, name: "moved" }]);
  });

  it("does not cache failed loads", async () => {
    const cache = new InventorySessionCache<{ id: number }>();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [{ id: 1 }], liveCount: 1 });
    await expect(cache.read({ personaId: "1", bucket: "club", load })).rejects.toThrow("offline");
    await expect(cache.read({ personaId: "1", bucket: "club", load })).resolves.toEqual([{ id: 1 }]);
  });

  it("supports zero-request reads of an existing task snapshot", async () => {
    const cache = new InventorySessionCache<{ id: number }>();
    await cache.read({
      personaId: "1",
      bucket: "club",
      load: async () => ({ items: [{ id: 1 }], liveCount: 1 }),
    });
    expect(cache.peek("1", "club")).toEqual([{ id: 1 }]);
    expect(cache.peek("2", "club")).toBeUndefined();
  });

  it("expires peeked snapshots and detects repository count changes", async () => {
    const cache = new InventorySessionCache<{ id: number }>(100);
    await cache.read({
      personaId: "1",
      bucket: "club",
      now: 0,
      load: async () => ({ items: [{ id: 1 }], liveCount: 1 }),
    });
    expect(cache.peek("1", "club", { now: 99, liveCount: 1 })).toEqual([{ id: 1 }]);
    expect(cache.peek("1", "club", { now: 99, liveCount: 2 })).toBeUndefined();
    expect(cache.peek("1", "club", { now: 100, liveCount: 1 })).toBeUndefined();
  });
});
