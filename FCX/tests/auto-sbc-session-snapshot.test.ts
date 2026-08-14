import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AutoSbcSessionSnapshotStore,
  resolveAutoSbcSessionData,
} from "../src/state/auto-sbc-session-snapshot";

describe("AutoSbcSessionSnapshotStore", () => {
  it("keeps catalog and pack groups for the current page render", () => {
    const store = new AutoSbcSessionSnapshotStore<{ sets: number[] }, { id: number }>();
    const catalog = { sets: [1, 2] };

    store.set(7, catalog, [{ id: 10 }]);

    expect(store.get(7)).toEqual({
      renderVersion: 7,
      catalog,
      packGroups: [{ id: 10 }],
    });
    expect(store.get(8)).toBeUndefined();
  });

  it("treats an empty pack list as a valid snapshot", async () => {
    const store = new AutoSbcSessionSnapshotStore<{ sets: number[] }, { id: number }>();
    const snapshot = store.set(3, { sets: [1] }, []);
    const loadCatalog = vi.fn(async () => ({ sets: [2] }));
    const loadPackGroups = vi.fn(async () => [{ id: 20 }]);

    await expect(resolveAutoSbcSessionData({
      snapshot,
      loadCatalog,
      loadPackGroups,
    })).resolves.toEqual({ catalog: { sets: [1] }, packGroups: [] });
    expect(loadCatalog).not.toHaveBeenCalled();
    expect(loadPackGroups).not.toHaveBeenCalled();
  });

  it("loads catalog and packs once when no page snapshot exists", async () => {
    const loadCatalog = vi.fn(async () => ({ sets: [1] }));
    const loadPackGroups = vi.fn(async () => [{ id: 10 }]);

    await expect(resolveAutoSbcSessionData({
      loadCatalog,
      loadPackGroups,
    })).resolves.toEqual({
      catalog: { sets: [1] },
      packGroups: [{ id: 10 }],
    });
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    expect(loadPackGroups).toHaveBeenCalledTimes(1);
  });

  it("invalidates the active render snapshot", () => {
    const store = new AutoSbcSessionSnapshotStore<object, object>();
    store.set(1, {}, []);
    store.invalidate();
    expect(store.get(1)).toBeUndefined();
  });
});

describe("Auto SBC routine session integration", () => {
  const root = resolve(import.meta.dirname, "..");
  const packsSource = readFileSync(
    resolve(root, "src/domain/packs/runtime.ts"),
    "utf8",
  );
  const routineUiSource = readFileSync(
    resolve(root, "src/ui/routines-runtime.ts"),
    "utf8",
  );
  const routineRuntimeSource = readFileSync(
    resolve(root, "src/domain/routines/runtime.ts"),
    "utf8",
  );

  it("publishes one page snapshot and reuses the shared pack groups", () => {
    expect(packsSource).toContain(
      "fcxAutoSbcSessionSnapshot.set(renderVersion, sbcData, packGroups)",
    );
    expect(packsSource).toContain("const packList = createPackList(packGroups)");
    expect(routineUiSource).toContain(
      "fcxAutoSbcSessionSnapshot.get(autoSbcRenderVersion)",
    );
    expect(routineUiSource).toContain("await resolveAutoSbcSessionData({");
  });

  it("refreshes pack choices explicitly but not the whole catalog on task start", () => {
    expect(routineUiSource).toContain(
      "packGroups = await loadAutoSbcPackGroups()",
    );
    expect(routineRuntimeSource).not.toMatch(
      /try\s*{\s*await refreshSbcCache\(\);\s*const schedule/,
    );
  });
});
