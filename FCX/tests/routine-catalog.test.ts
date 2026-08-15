import { describe, expect, it, vi } from "vitest";

import catalogSource from "../src/config/builtin-routines.json";
import {
  parseRoutineCatalog,
  parseRoutineCatalogValue,
} from "../src/domain/routines/catalog";
import { RoutineStore } from "../src/state/routine-store";
import {
  requestRoutineCatalog,
  RoutineCatalogUpdateController,
} from "../src/update/routine-catalog";
import type {
  GmCompatRequest,
  GmCompatRequestOptions,
} from "../src/types/userscript";

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

function catalog(version = 53) {
  return {
    schema_version: 1,
    catalog_version: version,
    published_at: "2026-08-13T00:00:00Z",
    routines: [
      {
        id: "server-routine",
        name: "服务器流程",
        description: "声明式流程",
        mode: "round_robin",
        totalCycles: 3,
        ignoreValue: true,
        steps: [
          {
            kind: "sbc",
            id: "one",
            runs: 2,
            setId: 1017,
            target: {
              preferredSetId: 1017,
              nameTokenGroups: [["84", "totw", "升级"]],
              expectedRewardKind: "pack",
              repeatability: "unlimited",
            },
          },
          {
            kind: "pack",
            id: "pack",
            runs: -1,
            packId: 9001,
            tradable: false,
            packName: "奖励卡包",
          },
        ],
        totwFallback: { enabled: true, setId: 1017, runs: 1 },
        storageFallback: { enabled: false, setId: 0, runs: 1 },
      },
    ],
  };
}

describe("FCX routine catalog", () => {
  it("uses the validated JSON file as the bundled fallback", () => {
    const parsed = parseRoutineCatalogValue(catalogSource);
    expect(parsed.catalogVersion).toBe(52);
    expect(parsed.routines).toHaveLength(7);
    expect(parsed.routines.every((routine) => routine.origin === "builtin")).toBe(true);
    expect(parsed.routines.every((routine) => routine.builtinSnapshotVersion === 52)).toBe(true);
    expect(parsed.routines.every((routine) => (
      !routine.solveFailureFallback.enabled
      && routine.solveFailureFallback.setId === 0
      && routine.solveFailureFallback.runs === 1
    ))).toBe(true);
    expect(parsed.routines.find((routine) => routine.id === "upgrade-84-x10")?.steps)
      .toEqual(expect.arrayContaining([expect.objectContaining({ setId: 1355 })]));
    expect(parsed.routines.find((routine) => routine.id === "solve-all-dailies")?.steps
      .map((step) => step.kind === "sbc" ? step.setId : step.packId))
      .toEqual([1037, 1038]);
    expect(parsed.routines.find((routine) => routine.id === "provisions-to-picks")?.steps)
      .toEqual(expect.arrayContaining([expect.objectContaining({ setId: 1351 })]));
    expect(parsed.routines.find((routine) => routine.id === "futties-provisions-x5")?.steps)
      .toEqual(expect.arrayContaining([expect.objectContaining({ setId: 1354 })]));
  });

  it("accepts only the supported declarative schema", () => {
    expect(parseRoutineCatalog(JSON.stringify(catalog())).routines[0])
      .toMatchObject({
        id: "server-routine",
        origin: "builtin",
        solveFailureFallback: { enabled: false, setId: 0, runs: 1 },
      });

    const withSolveFailureFallback = structuredClone(catalog()) as any;
    withSolveFailureFallback.routines[0].solveFailureFallback = {
      enabled: true,
      setId: 1261,
      runs: -1,
    };
    expect(parseRoutineCatalogValue(withSolveFailureFallback).routines[0])
      .toMatchObject({
        solveFailureFallback: { enabled: true, setId: 1261, runs: -1 },
      });

    const invalidSolveFailureFallback = structuredClone(catalog()) as any;
    invalidSolveFailureFallback.routines[0].solveFailureFallback = {
      enabled: true,
      setId: 1261,
      runs: 101,
    };
    expect(() => parseRoutineCatalogValue(invalidSolveFailureFallback))
      .toThrow("1–100");

    const withScript = structuredClone(catalog()) as Record<string, unknown>;
    withScript.script = "alert(1)";
    expect(() => parseRoutineCatalogValue(withScript)).toThrow("不允许的字段");

    const withHtml = structuredClone(catalog());
    withHtml.routines[0]!.description = "<img src=x>";
    expect(() => parseRoutineCatalogValue(withHtml)).toThrow("HTML");

    const withUrl = structuredClone(catalog());
    withUrl.routines[0]!.name = "https://example.com";
    expect(() => parseRoutineCatalogValue(withUrl)).toThrow("URL");

    const badRuns = structuredClone(catalog());
    badRuns.routines[0]!.steps[0]!.runs = 101;
    expect(() => parseRoutineCatalogValue(badRuns)).toThrow("1–100");

    const badType = structuredClone(catalog()) as any;
    badType.routines[0].steps[0].kind = "javascript";
    expect(() => parseRoutineCatalogValue(badType)).toThrow("步骤类型无效");

    const oversizedId = structuredClone(catalog());
    oversizedId.routines[0]!.steps[0]!.setId = 3_000_000_000;
    oversizedId.routines[0]!.steps[0]!.target!.preferredSetId = 3_000_000_000;
    expect(() => parseRoutineCatalogValue(oversizedId)).toThrow("超出允许范围");

    const withNumericMarker = structuredClone(catalog()) as any;
    withNumericMarker.routines[0]!.steps[0]!.target!.numericMarker = "any_plus";
    expect(parseRoutineCatalogValue(withNumericMarker).routines[0]?.steps[0])
      .toMatchObject({ target: { numericMarker: "any_plus" } });

    const withRemoteRegex = structuredClone(catalog()) as any;
    withRemoteRegex.routines[0].steps[0].target.numericMarker = "regex";
    expect(() => parseRoutineCatalogValue(withRemoteRegex)).toThrow("数字标记类型无效");

    const withRegexField = structuredClone(catalog()) as any;
    withRegexField.routines[0].steps[0].target.pattern = "\\d+\\+";
    expect(() => parseRoutineCatalogValue(withRegexField)).toThrow("不允许的字段");
  });

  it("rejects duplicates, stale structures and oversized catalogs", () => {
    const duplicate = structuredClone(catalog());
    duplicate.routines.push(structuredClone(duplicate.routines[0]!));
    expect(() => parseRoutineCatalogValue(duplicate)).toThrow("流程 ID 重复");

    const duplicateStep = structuredClone(catalog());
    duplicateStep.routines[0]!.steps[1]!.id = "one";
    expect(() => parseRoutineCatalogValue(duplicateStep)).toThrow("步骤 ID 重复");

    const oversized = structuredClone(catalog());
    oversized.routines = Array.from(
      { length: 51 },
      (_, index) => ({ ...structuredClone(catalog().routines[0]!), id: `flow-${index}` }),
    );
    expect(() => parseRoutineCatalogValue(oversized)).toThrow("不能超过 50");
    expect(() => parseRoutineCatalog("<html>not json</html>"))
      .toThrow("网页内容");
  });

  it("requests uncached JSON once with a four-second timeout", async () => {
    const request = vi.fn((options: GmCompatRequestOptions) => {
      options.onload?.({
        responseText: JSON.stringify(catalog()),
        status: 200,
        statusText: "OK",
        finalUrl: options.url,
        responseHeaders: "",
      });
    }) as GmCompatRequest;
    await expect(requestRoutineCatalog(request, { now: () => 123 }))
      .resolves.toMatchObject({ catalogVersion: 53 });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://fczhushou.com/fcx/routines.json?_=123",
      timeout: 4_000,
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    }));
  });

  it("silently falls back for HTTP, timeout and malformed responses", async () => {
    const http = ((options: GmCompatRequestOptions) => options.onload?.({
      responseText: "not found",
      status: 404,
      statusText: "Not Found",
      finalUrl: options.url,
      responseHeaders: "",
    })) as GmCompatRequest;
    await expect(requestRoutineCatalog(http)).rejects.toThrow("HTTP 404");

    const timeout = ((options: GmCompatRequestOptions) =>
      options.ontimeout?.({ status: 0 })) as GmCompatRequest;
    await expect(requestRoutineCatalog(timeout)).rejects.toThrow("读取超时");

    const logger = { info: vi.fn(), warn: vi.fn() };
    const controller = new RoutineCatalogUpdateController(
      timeout,
      new RoutineStore(new MemoryStorage()),
      logger,
    );
    await expect(Promise.all([controller.loadOnce(), controller.loadOnce()]))
      .resolves.toEqual([false, false]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("overwrites stale builtin edits while preserving custom flows on catalog upgrades", async () => {
    const storage = new MemoryStorage();
    const store = new RoutineStore(storage);
    const edited = store.get("totw-x5")!;
    store.save({ ...edited, name: "我的覆盖" });
    const custom = store.create("我的自定义");
    custom.steps.push({ kind: "sbc", id: "custom-step", setId: 1017, runs: 1 });
    store.save(custom);
    const customBeforeUpgrade = store.get(custom.id);
    const taskClone = store.get("upgrade-80-x5")!;

    const parsed = parseRoutineCatalogValue(catalog());
    expect(store.replaceBuiltinCatalog(parsed.routines, parsed.catalogVersion)).toBe(true);
    expect(store.get("server-routine")?.name).toBe("服务器流程");
    expect(store.get("totw-x5")).toBeUndefined();
    expect(store.get(custom.id)).toEqual(customBeforeUpgrade);
    expect(taskClone.name).toBe("5×80+ → 后续升级");

    const reintroduced = structuredClone(catalog(54));
    reintroduced.routines.push({
      ...structuredClone(catalog().routines[0]!),
      id: "totw-x5",
      name: "远程周黑默认",
    });
    const current = parseRoutineCatalogValue(reintroduced);
    store.replaceBuiltinCatalog(current.routines, current.catalogVersion);
    expect(store.get("totw-x5")?.name).toBe("远程周黑默认");
    expect(store.resetBuiltin("totw-x5")).toBe(false);
    expect(store.replaceBuiltinCatalog(parsed.routines, 49)).toBe(false);
  });

  it("keeps edits made against the current catalog version", () => {
    const storage = new MemoryStorage();
    const store = new RoutineStore(storage);
    const edited = store.get("totw-x5")!;
    store.save({ ...edited, name: "当前版本修改" });
    const bundled = parseRoutineCatalogValue(catalogSource);

    expect(store.replaceBuiltinCatalog(bundled.routines, bundled.catalogVersion)).toBe(true);
    expect(store.get("totw-x5")?.name).toBe("当前版本修改");
    expect(store.replaceBuiltinCatalog(bundled.routines, bundled.catalogVersion - 1)).toBe(false);
    expect(store.get("totw-x5")?.name).toBe("当前版本修改");
  });
});
