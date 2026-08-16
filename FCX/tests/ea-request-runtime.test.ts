import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("EA request retry runtime integration", () => {
  it("exposes the configurable runtime wrapper", () => {
    const vite = read("vite.config.ts");
    expect(vite).toContain("const executeFcxEaRequest");
    expect(vite).toContain('getValue(0, 0, "eaRequestMaxAttempts")');
    expect(vite).toContain('getValue(0, 0, "eaRequestRetryDelaySeconds")');
    expect(vite).toContain('getValue(0, 0, "eaSbcRequestIntervalMs")');
    expect(vite).toContain("new EaRequestGate(900, [3000, 8000, 20000])");
    expect(vite).toContain("retryUnauthorized: options.retryUnauthorized ?? isSbcRequest");
    expect(vite).toContain("retryThrottle: options.retryThrottle ?? isSbcRequest");
    expect(vite).toContain("EA请求受到限流：");
    expect(vite).toContain("EA请求失败：");
  });

  it("renders both retry settings with the supported limits", () => {
    const settings = read("src/ui/settings-runtime.ts");
    expect(settings).toContain('createSettingsTile(cards, "EA请求重试"');
    expect(settings).toMatch(/"eaRequestMaxAttempts",\s*1,\s*10,/);
    expect(settings).toMatch(/"eaRequestRetryDelaySeconds",\s*1,\s*30,/);
    expect(settings).toMatch(/"eaSbcRequestIntervalMs",\s*0,\s*10000,/);
  });

  it("uses targeted recovery for stale chemistry and blocked pack opening", () => {
    const sbc = read("src/hooks/items-runtime.ts");
    const packs = read("src/domain/packs/runtime.ts");
    expect(sbc).toContain("eaResponseStatus(error) !== 446");
    expect(sbc).toContain("提交SBC（刷新化学后重试）");
    expect(packs).toContain("eaResponseStatus(error) !== 471");
    expect(packs).toContain("openPackWithUnassignedRecovery");
    expect(packs).toContain("processPackItems(options, taskSummary");
    expect(packs).toContain("allowPlayerPicks");
    expect(sbc).toContain("resetThrottleOnSuccess: false");
    expect(sbc).toContain("retryStatuses: [401, 403]");
    expect(sbc).toContain("retryDelayScheduleMs: [1000, 2000, 4000]");
  });

  it("does not replay or infer ambiguous pack writes", () => {
    const packs = read("src/domain/packs/runtime.ts");
    expect(packs).toContain("PACK_OPEN_SUCCESS_INTERVAL_MS = 800");
    expect(packs).toContain("maxAttempts: 1");
    expect(packs).toContain("retryThrottle: false");
    expect(packs).toContain("retryUnauthorized: false");
    expect(packs).toContain("为避免重复开包，本次未自动重试");
    expect(packs).not.toContain("PackOpenJournal");
    expect(packs).not.toContain("PACK_WRITE_PROBE_DELAYS_MS");
    expect(packs).not.toContain("verifyOpenedPack");
    expect(packs).not.toContain("consumeReconciledPackWorks");
    expect(packs).not.toContain("开包结果经过多次核验仍无法确认");
  });

  it("routes high-frequency EA reads through the shared executor", () => {
    const sources = [
      read("src/ui/solver-runtime.ts"),
      read("src/domain/inventory/runtime.ts"),
      read("src/domain/market/runtime.ts"),
      read("src/domain/packs/runtime.ts"),
      read("src/domain/evolutions/runtime.ts"),
      read("src/hooks/items-runtime.ts"),
    ].join("\n");
    for (const label of [
      "读取SBC列表",
      "读取卡包列表",
      "读取未分配物品",
      "读取当前激活阵容",
      "读取学院中心",
    ]) {
      expect(sources).toContain(label);
    }
    expect(sources).toContain("executeFcxEaRequest");
  });

  it("uses post-failure verification for destructive EA writes", () => {
    const sources = [
      read("src/hooks/items-runtime.ts"),
      read("src/domain/inventory/runtime.ts"),
      read("src/domain/packs/runtime.ts"),
      read("src/domain/sbc/runtime.ts"),
      read("src/domain/evolutions/runtime.ts"),
    ].join("\n");
    for (const operation of [
      "提交SBC",
      "保存SBC阵容",
      "确认球员挑选",
      "购买转会市场球员",
    ]) {
      expect(sources).toContain(operation);
    }
    expect(sources.match(/verifyAfterFailure/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
