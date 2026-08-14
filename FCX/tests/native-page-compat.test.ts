import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "../src/hooks/items-runtime.ts"),
  "utf8",
);
const solverSource = readFileSync(
  resolve(import.meta.dirname, "../src/ui/solver-runtime.ts"),
  "utf8",
);
const packSource = readFileSync(
  resolve(import.meta.dirname, "../src/domain/packs/runtime.ts"),
  "utf8",
);
const nativePackActionSource = readFileSync(
  resolve(import.meta.dirname, "../src/domain/packs/native-pack-action.ts"),
  "utf8",
);
const bootstrapSource = readFileSync(
  resolve(import.meta.dirname, "../src/platform/bootstrap-runtime.ts"),
  "utf8",
);
const viteSource = readFileSync(
  resolve(import.meta.dirname, "../vite.config.ts"),
  "utf8",
);

describe("EA native page compatibility", () => {
  it("does not replace native rating, item init, list insertion or pick rendering", () => {
    expect(source).not.toContain("UTSquadEntity.prototype._calculateRating");
    expect(source).not.toContain("UTItemEntity.prototype.init =");
    expect(source).not.toContain("UTSectionedItemListView.prototype.addItems =");
    expect(source).not.toContain("UTPlayerPicksView.prototype.setCarouselItems =");
  });

  it("limits automatic reward navigation to an owned FCX task", () => {
    expect(source).toContain("hasBlockingFcxTask()");
    expect(source).toContain("this.queue[0] instanceof UTGameRewardsViewController");
  });

  it("opens an FCX solve dialog with ignore value enabled and never submits", () => {
    expect(source).toContain('createButton("idSolveSbc", "FCX求解"');
    expect(source).toContain('label: "忽略球员价值"');
    expect(source).toContain("checked: true");
    expect(source).toMatch(/false,\s*null,\s*false,\s*false,/);
    expect(source).toContain("createCandidateRulesEditor");
    expect(source).toContain("candidateRulesEditor.changedKeys()");
    expect(source).toContain("fcxSettingsStore.saveValue(_challenge.setId, _challenge.id");
  });

  it("removes manual price refresh while preserving concept quick buy", () => {
    expect(source).not.toContain("mountRefreshPriceButton");
    expect(source).not.toContain('setText("刷新价格")');
    expect(source).not.toContain('setText("刷新中…")');
    expect(source).not.toContain("refreshPriceItem");
    expect(source).not.toContain("refreshPriceRunning");
    expect(source).toContain("const listing = await fetchLivePlayerPrice(item)");
    expect(source).toContain('quickButton.setText("Quick Buy")');
  });

  it("mounts a current-item-safe DIY evolution action in both player panels", () => {
    expect(source).toContain("const syncDiyEvolutionButton");
    expect(source).toContain("context.diyEvolutionItem = item");
    expect(source).toContain('button.setText("DIY进化")');
    expect(source.match(/syncDiyEvolutionButton\(/g)?.length).toBe(4);
    expect(source).toContain("await openAcademyPlayerEditorForItem(currentItem)");
    expect(source).toContain("this.lockUnlockButton?.__root || this._btnBio.__root");
    expect(source).toContain("this.lockUnlockButton?.__root || this._bioButton.__root");
  });

  it("does not manipulate EA's global click shield directly", () => {
    expect(solverSource).not.toContain("ut-click-shield");
  });

  it("keeps EA's native pack action and adds a separate owned-pack action", () => {
    expect(packSource).not.toContain("UTStoreViewController.prototype.eOpenPack");
    expect(packSource).toContain('typeof unsafeWindow !== "undefined"');
    expect(packSource).toContain("resolveNativePackPageWindow(window, pageWindow)");
    expect(packSource).toContain("originalSetPacks.call(this, packs, ...args)");
    expect(packSource).toContain('button.textContent = "FCX开包"');
    expect(packSource).toContain("if (!pack?.isMyPack) continue");
    expect(packSource).toContain("await openPack(latest || descriptor, 1, false)");
    expect(packSource).toContain("FCX_PACK_OPEN_BUTTON_CLASS");
    expect(packSource).toContain("FCX_PACK_MOUNT_RETRY_DELAYS_MS");
    expect(packSource).toContain("installNativePackPageObserver");
    expect(packSource).toContain("footer.querySelector(`.${FCX_PACK_OPEN_BUTTON_CLASS}`)");
    expect(packSource).toContain("findNativePackFooter(match)");
    expect(packSource).toContain("FCX_PACK_ACTION_HOOK_VERSION = 3");
    expect(packSource).toContain("FCX_PACK_OPEN_STYLE_ID");
    expect(packSource).toContain("findNativePackStoreView(nativePackControllerRoots())");
    expect(packSource).toContain("scheduleNativePackButtonSync");
    expect(packSource).toContain('repositories?.Store?.getPacks?.("mypacks")');
    expect(viteSource).toContain('"unsafeWindow"');
    expect(nativePackActionSource).toContain("packView._rootElement");
    expect(nativePackActionSource).toContain("packView.root");
    expect(bootstrapSource.match(/packOverRide\(\)/g)).toHaveLength(1);
    expect(bootstrapSource.indexOf("packOverRide();")).toBeGreaterThan(
      bootstrapSource.indexOf("const startFcxRuntime"),
    );
    expect(bootstrapSource.indexOf("packOverRide();")).toBeLessThan(
      bootstrapSource.indexOf("  init();", bootstrapSource.indexOf("const startFcxRuntime")),
    );
  });
});
