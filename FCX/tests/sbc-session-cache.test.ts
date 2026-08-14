import { describe, expect, it, vi } from "vitest";
import { SbcSessionCache } from "../src/state/sbc-session-cache";

describe("SbcSessionCache", () => {
  it("reuses cached and in-flight catalog requests", async () => {
    const cache = new SbcSessionCache<{ id: number }, string[]>();
    let resolveCatalog!: (value: { id: number }) => void;
    const loader = vi.fn(
      () => new Promise<{ id: number }>((resolve) => (resolveCatalog = resolve)),
    );

    const first = cache.getCatalog(loader);
    const second = cache.getCatalog(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    resolveCatalog({ id: 1 });
    await expect(first).resolves.toEqual({ id: 1 });
    await expect(second).resolves.toEqual({ id: 1 });
    await cache.getCatalog(loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("caches challenges per set and supports targeted invalidation", async () => {
    const cache = new SbcSessionCache<object, string[]>();
    const firstLoader = vi.fn(async () => ["a"]);
    const secondLoader = vi.fn(async () => ["b"]);

    await expect(cache.getChallenges(10, firstLoader)).resolves.toEqual(["a"]);
    await expect(cache.getChallenges(11, secondLoader)).resolves.toEqual(["b"]);
    cache.invalidateChallenges(10);
    await cache.getChallenges(10, firstLoader);
    await cache.getChallenges(11, secondLoader);

    expect(firstLoader).toHaveBeenCalledTimes(2);
    expect(secondLoader).toHaveBeenCalledTimes(1);
  });

  it("does not poison the cache after a failed request", async () => {
    const cache = new SbcSessionCache<number, string[]>();
    const loader = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(2);

    await expect(cache.getCatalog(loader)).rejects.toThrow("offline");
    await expect(cache.getCatalog(loader)).resolves.toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not restore stale data when an in-flight request is invalidated", async () => {
    const cache = new SbcSessionCache<number, string[]>();
    let resolveOld!: (value: number) => void;
    const oldRequest = cache.getCatalog(
      () => new Promise<number>((resolve) => (resolveOld = resolve)),
    );
    cache.invalidateCatalog();
    const freshRequest = cache.getCatalog(async () => 2);
    resolveOld(1);

    await expect(oldRequest).resolves.toBe(1);
    await expect(freshRequest).resolves.toBe(2);
    await expect(cache.getCatalog(async () => 3)).resolves.toBe(2);
  });

  it("invalidates only one challenge by default and keeps the catalog", async () => {
    const cache = new SbcSessionCache<{ id: number }, string[]>();
    const catalogLoader = vi.fn(async () => ({ id: 1 }));
    const first = vi.fn(async () => ["a"]);
    const second = vi.fn(async () => ["b"]);
    await cache.getCatalog(catalogLoader);
    await cache.getChallenges(1, first);
    await cache.getChallenges(2, second);
    cache.invalidate(1);
    await cache.getCatalog(catalogLoader);
    await cache.getChallenges(1, first);
    await cache.getChallenges(2, second);
    expect(catalogLoader).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("replaces a catalog snapshot without discarding challenge caches", async () => {
    const cache = new SbcSessionCache<{ id: number }, string[]>();
    const challengeLoader = vi.fn(async () => ["a"]);
    cache.replaceCatalog({ id: 2 });
    await cache.getChallenges(1, challengeLoader);
    cache.replaceCatalog({ id: 3 });
    await expect(cache.getCatalog(async () => ({ id: 4 }))).resolves.toEqual({ id: 3 });
    await cache.getChallenges(1, challengeLoader);
    expect(challengeLoader).toHaveBeenCalledTimes(1);
  });

  it("refreshes an expired challenge snapshot and supports replacing fresh state", async () => {
    vi.useFakeTimers();
    try {
      const cache = new SbcSessionCache<object, string[]>(30_000);
      const loader = vi.fn(async () => ["old"]);
      await cache.getChallenges(1, loader);
      vi.advanceTimersByTime(30_001);
      await cache.getChallenges(1, loader);
      cache.replaceChallenges(1, ["fresh"]);
      await expect(cache.getChallenges(1, async () => ["unexpected"])).resolves.toEqual(["fresh"]);
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
