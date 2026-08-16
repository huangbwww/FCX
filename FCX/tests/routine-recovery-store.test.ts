import { describe, expect, it } from "vitest";
import { builtinRoutines } from "../src/config/builtin-routines";
import {
  ROUTINE_RECOVERY_STORAGE_KEY,
  ROUTINE_RECOVERY_TTL_MS,
  RoutineRecoveryStore,
  normalizeRoutineRecoveryMaxReloads,
  routineRecoveryDelayMs,
} from "../src/state/routine-recovery-store";
import type { RoutineRecoveryCheckpoint } from "../src/types/routines";

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

const emptySummary = () => ({
  packsOpened: 0,
  picksCompleted: 0,
  players: [],
  sbcSubmissions: [],
  destinations: {
    club: 0,
    storage: 0,
    transfer: 0,
    sold: 0,
    remaining: 0,
  },
});

const checkpoint = (now: number): RoutineRecoveryCheckpoint => ({
  version: 2,
  personaId: "persona-1",
  taskId: "task-1",
  routine: { ...structuredClone(builtinRoutines[0]!), fatalRecoveryMode: "resume" },
  recoveryMode: "resume",
  cursor: { cycle: 2, stepIndex: 1, completedInStep: 3 },
  completedByStep: { first: 3 },
  results: [],
  notices: [],
  packSummary: emptySummary(),
  storageRecoveryCount: 0,
  reloadCount: 1,
  createdAt: now,
  updatedAt: now,
  recoveryErrors: [],
});

describe("routine recovery store", () => {
  it("bounds per-routine reload limits and keeps the 5/15/30 second schedule", () => {
    expect(normalizeRoutineRecoveryMaxReloads(1)).toBe(1);
    expect(normalizeRoutineRecoveryMaxReloads(3)).toBe(3);
    expect(normalizeRoutineRecoveryMaxReloads(10)).toBe(10);
    expect(normalizeRoutineRecoveryMaxReloads(100)).toBe(100);
    expect(normalizeRoutineRecoveryMaxReloads(0)).toBe(3);
    expect(normalizeRoutineRecoveryMaxReloads(101)).toBe(3);
    expect(normalizeRoutineRecoveryMaxReloads("invalid")).toBe(3);
    expect([1, 2, 3, 4, 100].map(routineRecoveryDelayMs)).toEqual([
      5_000,
      15_000,
      30_000,
      30_000,
      30_000,
    ]);
  });

  it("round-trips a persona-scoped checkpoint", () => {
    const storage = new MemoryStorage();
    const now = Date.UTC(2026, 7, 16);
    const store = new RoutineRecoveryStore(storage, () => now);
    expect(store.save(checkpoint(now))).toMatchObject({
      personaId: "persona-1",
      cursor: { cycle: 2, stepIndex: 1, completedInStep: 3 },
      reloadCount: 1,
    });
    expect(store.load("persona-1")?.routine.id).toBe(builtinRoutines[0]!.id);
  });

  it("clears expired, corrupt and cross-persona checkpoints", () => {
    const storage = new MemoryStorage();
    const now = Date.UTC(2026, 7, 16);
    storage.setItem(ROUTINE_RECOVERY_STORAGE_KEY, JSON.stringify({
      ...checkpoint(now),
      updatedAt: now - ROUTINE_RECOVERY_TTL_MS - 1,
    }));
    expect(new RoutineRecoveryStore(storage, () => now).load("persona-1")).toBeUndefined();
    expect(storage.getItem(ROUTINE_RECOVERY_STORAGE_KEY)).toBeNull();

    storage.setItem(ROUTINE_RECOVERY_STORAGE_KEY, "not-json");
    expect(new RoutineRecoveryStore(storage, () => now).load("persona-1")).toBeUndefined();

    storage.setItem(ROUTINE_RECOVERY_STORAGE_KEY, JSON.stringify(checkpoint(now)));
    expect(new RoutineRecoveryStore(storage, () => now).load("persona-2")).toBeUndefined();
    expect(storage.getItem(ROUTINE_RECOVERY_STORAGE_KEY)).toBeNull();

    storage.setItem(ROUTINE_RECOVERY_STORAGE_KEY, JSON.stringify({
      ...checkpoint(now),
      pendingOperation: { kind: "pack_open", packId: 0 },
    }));
    expect(new RoutineRecoveryStore(storage, () => now).load("persona-1")).toBeUndefined();
  });

  it("migrates a legacy lastError into a structured recovery event", () => {
    const storage = new MemoryStorage();
    const now = Date.UTC(2026, 7, 16);
    const legacy = {
      ...checkpoint(now),
      version: 1,
      recoveryErrors: undefined,
      lastError: "提交SBC失败（状态403）。",
      routine: {
        ...checkpoint(now).routine,
        fatalRecoveryMaxReloads: undefined,
      },
    };
    storage.setItem(ROUTINE_RECOVERY_STORAGE_KEY, JSON.stringify(legacy));
    const restored = new RoutineRecoveryStore(storage, () => now).load("persona-1");
    expect(restored?.version).toBe(2);
    expect(restored?.routine.fatalRecoveryMaxReloads).toBe(3);
    expect(restored?.recoveryErrors).toHaveLength(1);
    expect(restored?.recoveryErrors[0]).toMatchObject({
      reloadAttempt: 1,
      maxReloads: 3,
      reason: "提交SBC失败（状态403）。",
    });
  });
});
