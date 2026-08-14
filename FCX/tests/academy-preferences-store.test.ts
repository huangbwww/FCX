import { describe, expect, it } from "vitest";
import { AcademyPreferencesStore } from "../src/state/academy-preferences-store";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

describe("AcademyPreferencesStore", () => {
  it("falls back safely for missing or corrupt settings", () => {
    expect(new AcademyPreferencesStore(memoryStorage()).get()).toEqual({
      schemaVersion: 1,
      hideMaxed: false,
      presets: {},
    });
    expect(new AcademyPreferencesStore(memoryStorage("{" )).get().presets).toEqual({});
  });

  it("persists visibility and role-specific recommendation order", () => {
    const storage = memoryStorage();
    const store = new AcademyPreferencesStore(storage);
    store.setHideMaxed(true);
    store.savePreset("ST", "poacher", ["rapid", "finesse-shot"]);
    expect(store.get().hideMaxed).toBe(true);
    expect(store.getPreset("ST", "poacher")).toEqual(["rapid", "finesse-shot"]);
    store.deletePreset("ST", "poacher");
    expect(store.getPreset("ST", "poacher")).toBeUndefined();
  });
});
