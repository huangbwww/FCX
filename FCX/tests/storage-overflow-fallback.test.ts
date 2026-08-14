import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORAGE_OVERFLOW_FALLBACK,
  StorageOverflowFallbackStore,
} from "../src/state/storage-overflow-fallback-store";
import {
  expandPackSelections,
  insertImmediatePackSelections,
  nextStorageRecoveryRound,
  storageProgressMade,
} from "../src/domain/packs/storage-recovery";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("storage overflow fallback", () => {
  it("defaults to disabled and normalizes invalid targets", () => {
    const storage = new MemoryStorage();
    const store = new StorageOverflowFallbackStore(storage);
    expect(store.get()).toEqual(DEFAULT_STORAGE_OVERFLOW_FALLBACK);
    expect(store.save({ enabled: true, setId: Number.NaN, runs: 101 })).toEqual({
      enabled: false,
      setId: 0,
      runs: 100,
    });
    expect(store.save({ enabled: true, setId: 1017, runs: -1 })).toEqual({
      enabled: true,
      setId: 1017,
      runs: -1,
    });
    storage.setItem(
      "fcx:2026:storage-overflow-fallback",
      JSON.stringify({ enabled: true, setId: 1017 }),
    );
    expect(new StorageOverflowFallbackStore(storage).get()).toEqual({
      enabled: true,
      setId: 1017,
      runs: 1,
    });
  });

  it("keeps standalone packs unchanged and recovers only structured storage blocks", () => {
    const root = resolve(import.meta.dirname, "..");
    const packRuntime = readFileSync(
      resolve(root, "src/domain/packs/runtime.ts"),
      "utf8",
    );
    const inventoryRuntime = readFileSync(
      resolve(root, "src/domain/inventory/runtime.ts"),
      "utf8",
    );
    const sbcRuntime = readFileSync(
      resolve(root, "src/domain/sbc/runtime.ts"),
      "utf8",
    );
    expect(packRuntime).toContain('routing.stopCode === "storage_full"');
    expect(packRuntime).toContain("MAX_STORAGE_RECOVERY_ROUNDS = 10");
    expect(packRuntime).toContain("requestedRuns: cleanupRuns");
    expect(packRuntime).toContain(
      "if (cleanupRuns !== -1 && cleanupRuns <= 0)",
    );
    expect(packRuntime).not.toContain("if (cleanupRuns <= 0)");
    expect(packRuntime).toContain("{ suppressFinalUi: true }");
    expect(packRuntime).toContain("const catalog = await refreshSbcCache()");
    expect(packRuntime).toContain("storage cleanup availability");
    expect(packRuntime).toContain("storage cleanup completed partially");
    expect(packRuntime).toContain("父任务仍在运行，已阻止内部子任务提前展示总结");
    expect(sbcRuntime).not.toContain("waitForNextRepeatableSbcRound");
    expect(sbcRuntime).not.toContain("正在等待 EA 刷新下一轮可执行挑战");
    expect(sbcRuntime).not.toContain("probeRepeatable");
    expect(sbcRuntime).toContain("该SBC当前没有可执行的未完成挑战");
    expect(sbcRuntime).toContain("当前没有可执行的下一轮挑战，本步骤已结束");
    expect(packRuntime).toContain("insertImmediatePackSelections(");
    expect(packRuntime).toContain("markRewardPacksProcessed(work.rewardPlan");
    expect(inventoryRuntime).toContain('"transfer_full"');
    expect(inventoryRuntime).toContain('"storage_full"');
    expect(packRuntime).not.toContain(
      "runPackSelections(selections, readPackRunOptions(), undefined, { onStorageFull",
    );
  });

  it("inserts cleanup rewards at the current cursor without replaying opened packs", () => {
    const queue = expandPackSelections([
      { id: 1, tradable: false, quantity: 1 },
      { id: 2, tradable: false, quantity: 1 },
    ]);
    const opened = queue[0];
    const inserted = insertImmediatePackSelections(
      queue,
      1,
      [{ id: 99, tradable: true, quantity: 2 }],
      { kind: "cleanup" },
    );
    expect(inserted).toBe(2);
    expect(queue.map(({ id }) => id)).toEqual([1, 99, 99, 2]);
    expect(queue[0]).toBe(opened);
    expect(queue[1]?.rewardPlan).toEqual({ kind: "cleanup" });
  });

  it("requires real storage progress and stops after ten recovery rounds", () => {
    expect(storageProgressMade(
      { count: 100, capacity: 100, available: 0 },
      { count: 99, capacity: 100, available: 1 },
    )).toBe(true);
    expect(storageProgressMade(
      { count: 100, capacity: 100, available: 0 },
      { count: 100, capacity: 100, available: 0 },
    )).toBe(false);
    expect(nextStorageRecoveryRound(9)).toEqual({ allowed: true, next: 10 });
    expect(nextStorageRecoveryRound(10)).toEqual({ allowed: false, next: 10 });
  });

  it("exposes one group save action and both cleanup configuration surfaces", () => {
    const root = resolve(import.meta.dirname, "..");
    const packRuntime = readFileSync(
      resolve(root, "src/domain/packs/runtime.ts"),
      "utf8",
    );
    const routineUi = readFileSync(
      resolve(root, "src/ui/routines-runtime.ts"),
      "utf8",
    );
    expect(packRuntime).toContain('createModalButton("保存")');
    expect(packRuntime).toContain('id: "fcx-sbc-rules-saved-modal"');
    expect(packRuntime).toContain('title: "已保存"');
    expect(packRuntime).toContain("当前 SBC 的整组规则已保存。");
    expect(packRuntime).not.toContain('createModalButton("保存整组规则")');
    expect(packRuntime).toContain("仓库满自动清仓");
    expect(packRuntime).toContain("每次清仓次数");
    expect(packRuntime).toContain("-1 表示持续执行");
    expect(packRuntime).toContain("saveCandidateRuleEdits(0)");
    expect(packRuntime).toContain("standaloneSaveChallengeId");
    expect(packRuntime).toContain("saveCandidateRuleEdits(standaloneSaveChallengeId())");
    expect(packRuntime).toContain("当前 SBC 的规则已保存。");
    expect(routineUi).toContain("draft.storageFallback");
    expect(routineUi).toContain("启用仓库满自动清仓");
    expect(routineUi).toContain("storageRuns");
    expect(routineUi).toContain("-1 表示持续执行");
  });
});
