import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("player protection runtime wiring", () => {
  const inventory = source("../src/domain/inventory/runtime.ts");
  const sbc = source("../src/domain/sbc/runtime.ts");
  const settings = source("../src/ui/settings-runtime.ts");
  const itemHooks = source("../src/hooks/items-runtime.ts");

  it("fails closed when the active squad cannot be read", () => {
    expect(inventory).toContain("resolveActiveSquadEntity(response)");
    expect(inventory).toContain("resolveActiveSquadIdCandidates(");
    expect(inventory).toContain("readActiveSquadItemIdsFromCandidates(");
    expect(inventory).toContain("personaSquads?.get?.(legacySquadKey)");
    expect(inventory).toContain("activeSquadCandidates.length");
    expect(inventory).toContain("readResult.ids.length");
    expect(inventory).toContain("required: true");
    expect(inventory).toContain("当前激活阵容读取失败，任务将停止");
    expect(inventory).not.toContain("无法读取当前激活阵容，已安全跳过");
  });

  it("checks protected players before applying, saving and submitting", () => {
    for (const stage of [
      "应用阵容前",
      "提交阵容前",
      "保存阵容前",
      "整组应用阵容前",
      "整组提交阵容前",
    ]) {
      expect(sbc).toContain(stage);
    }
    expect(sbc).toContain(
      "const protectionSnapshot = await capturePlayerProtectionSnapshot()",
    );
    expect(sbc).not.toContain("sbcExecution.protectionSnapshot");
    expect(sbc).not.toContain("execution.protectionSnapshot");
    expect(inventory).not.toContain("ActiveSquadProtectionCache");
    expect(inventory).not.toContain("forceActiveSquad");
    expect(inventory).not.toContain("activeSquadProtectionCache");
    expect(settings).toContain("await getActiveSquadProtectedIds()");
    expect(settings).toContain("保护数据读取失败时任务会停止");

    expect(sbc.indexOf('"应用阵容前"')).toBeLessThan(
      sbc.indexOf("_squad.setPlayers(_solutionSquad, true)"),
    );
    expect(sbc.indexOf('"提交阵容前"')).toBeLessThan(
      sbc.indexOf("await sbcSubmit(_challenge, sbcSet)"),
    );
    expect(sbc.indexOf('"保存阵容前"')).toBeLessThan(
      sbc.indexOf("services.SBC.saveChallenge(_challenge)"),
    );
    expect(sbc.indexOf('"整组应用阵容前"')).toBeLessThan(
      sbc.indexOf("controller._squad.setPlayers(planned.payload.solutionSquad, true)"),
    );
    expect(sbc.indexOf('"整组提交阵容前"')).toBeLessThan(
      sbc.indexOf("await sbcSubmit(controller._challenge, live.set)"),
    );
  });

  it("refreshes the open locked-player list without changing the original lock flow", () => {
    expect(inventory).toContain("registerOpenLockedPlayersPanelRefresh");
    expect(inventory).toContain("refreshOpenLockedPlayersPanel");
    expect(inventory).not.toContain("PLAYER_PROTECTION_CHANGED_EVENT");
    expect(inventory).not.toContain("notifyPlayerProtectionChanged");

    expect(settings).toContain("renderResults(players)");
    expect(settings).toContain("renderLocked()");
    expect(settings).toContain("lockedPlayersPanelDispose");
    expect(settings).not.toContain("handleProtectionChanged");
    expect(settings).not.toContain("disconnectObserver");

    expect(itemHooks).toContain("refreshOpenLockedPlayersPanel()");
    expect(itemHooks).not.toContain("fcxCurrentLockItem");
    expect(itemHooks).not.toContain("syncPlayerLockButton");
  });
});
