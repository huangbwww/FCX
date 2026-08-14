import { describe, expect, it } from "vitest";
import { SettingsEditSession } from "../src/state/settings-edit-session";
import { SettingsStore, type StorageAdapter } from "../src/state/settings-store";

class MemoryStorage implements StorageAdapter {
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

describe("settings edit session", () => {
  it("keeps immediately persisted picker values when other changes are discarded", () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    store.saveValue(0, 0, "maxSolveTime", 60);
    const session = new SettingsEditSession(store);

    session.saveValue(0, 0, "maxSolveTime", 30);
    session.persistValue(0, 0, "excludeLeagues", [13, 53]);
    expect(session.isDirty).toBe(true);
    expect(store.getValue(0, 0, "maxSolveTime")).toBe(60);
    expect(store.getValue(0, 0, "excludeLeagues")).toEqual([13, 53]);

    session.discard();
    expect(session.getValue(0, 0, "maxSolveTime")).toBe(60);
    expect(session.getValue(0, 0, "excludeLeagues")).toEqual([13, 53]);
    expect(session.isDirty).toBe(false);
  });

  it("does not overwrite an immediate picker save during a later full commit", () => {
    const store = new SettingsStore(new MemoryStorage());
    const session = new SettingsEditSession(store);
    session.saveValue(0, 0, "maxSolveTime", 45);
    session.persistValue(0, 0, "excludeNations", [14]);
    session.commit();

    expect(store.getValue(0, 0, "maxSolveTime")).toBe(45);
    expect(store.getValue(0, 0, "excludeNations")).toEqual([14]);
    expect(session.isDirty).toBe(false);
  });

  it("isolates a replacement session from a disposed old view", () => {
    const store = new SettingsStore(new MemoryStorage());
    const oldSession = new SettingsEditSession(store);
    const currentSession = new SettingsEditSession(store);
    oldSession.dispose();

    expect(() => oldSession.saveValue(0, 0, "maxSolveTime", 10)).toThrow(
      "设置页面已经关闭",
    );
    currentSession.saveValue(0, 0, "maxSolveTime", 90);
    currentSession.commit();
    expect(store.getValue(0, 0, "maxSolveTime")).toBe(90);
  });
});
