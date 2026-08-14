import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPECIAL_FALLBACK,
  SPECIAL_FALLBACK_STORAGE_KEY,
  SpecialFallbackStore,
} from "../src/state/special-fallback-store";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("normal SBC special fallback storage", () => {
  it("defaults to a disabled 84+ TOTW fallback", () => {
    expect(new SpecialFallbackStore(new MemoryStorage()).get()).toEqual(
      DEFAULT_SPECIAL_FALLBACK,
    );
  });

  it("persists one normalized configuration shared by all SBC details", () => {
    const storage = new MemoryStorage();
    const store = new SpecialFallbackStore(storage);

    expect(store.save({ enabled: true, setId: 1200, runs: 3 })).toEqual({
      enabled: true,
      setId: 1200,
      runs: 3,
    });
    expect(new SpecialFallbackStore(storage).get()).toEqual({
      enabled: true,
      setId: 1200,
      runs: 3,
    });
  });

  it("falls back safely when storage is corrupt or out of range", () => {
    const storage = new MemoryStorage();
    storage.setItem(SPECIAL_FALLBACK_STORAGE_KEY, "{");
    expect(new SpecialFallbackStore(storage).get()).toEqual(DEFAULT_SPECIAL_FALLBACK);
    storage.setItem(SPECIAL_FALLBACK_STORAGE_KEY, JSON.stringify({
      enabled: true,
      setId: -1,
      runs: 0,
    }));
    expect(new SpecialFallbackStore(storage).get()).toEqual({
      enabled: true,
      setId: 1017,
      runs: 1,
    });
  });
});
