import { describe, expect, it, vi } from "vitest";
import { collectPriceCacheDiagnostics } from "../src/state/price-diagnostics";
import type { PriceCacheDiagnostics } from "../src/types/prices";
import { openPriceCacheDiagnosticsDialog } from "../src/ui/price-cache-diagnostics";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const emptyDiagnostics: PriceCacheDiagnostics = {
  checkedAt: "2026-08-03T00:00:00.000Z",
  memoryCount: 0,
  indexedDb: {
    available: false,
    recordCount: 0,
    mismatchCount: 0,
    matchesMemory: true,
    hasStore: false,
    hasRecord: false,
  },
  localStorage: {
    available: true,
    recordCount: 0,
    mismatchCount: 0,
    matchesMemory: true,
    exists: false,
    bytes: 0,
  },
  freshCount: 0,
  staleCount: 0,
  invalidCount: 0,
  sourceCounts: { futgg: 0, futnext: 0, liveSearch: 0, unknown: 0 },
  events: [],
};

describe("price cache diagnostics", () => {
  it("computes source, freshness and local consistency without networking", async () => {
    const storage = new MemoryStorage();
    const records = {
      1: { price: 1_000, source: "futgg" as const, timeStamp: "2026-08-03T00:00:00Z" },
      2: { price: 2_000, source: "futnext" as const, timeStamp: "2026-07-01T00:00:00Z" },
    };
    storage.setItem("futggPrices", JSON.stringify(records));
    const diagnostics = await collectPriceCacheDiagnostics({
      memoryRecords: records,
      indexedDb: undefined,
      storage,
      cacheMinutes: 1440,
      now: new Date("2026-08-03T12:00:00Z"),
    });
    expect(diagnostics.freshCount).toBe(1);
    expect(diagnostics.staleCount).toBe(1);
    expect(diagnostics.sourceCounts.futgg).toBe(1);
    expect(diagnostics.sourceCounts.futnext).toBe(1);
    expect(diagnostics.localStorage.matchesMemory).toBe(true);
  });

  it("opens and refreshes the diagnostic dialog without a price request", async () => {
    document.body.replaceChildren();
    const load = vi.fn(async () => emptyDiagnostics);
    await openPriceCacheDiagnosticsDialog({ load, documentRef: document });
    expect(document.getElementById("fcx-price-cache-modal")).not.toBeNull();
    expect(document.body.textContent).toContain("价格缓存诊断");
    expect(document.body.textContent).toContain("复制调试信息");
    const refresh = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "重新检查",
    );
    refresh?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
