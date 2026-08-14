import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const runtime = readFileSync(resolve(root, "src/domain/evolutions/runtime.ts"), "utf8");
const settings = readFileSync(resolve(root, "src/ui/settings-runtime.ts"), "utf8");
const styles = readFileSync(resolve(root, "src/ui/base-runtime.ts"), "utf8");
const build = readFileSync(resolve(root, "vite.config.ts"), "utf8");

describe("PlayStyle Academy runtime integration", () => {
  it("mounts evolution as a standalone DOM page outside EA controllers", () => {
    expect(settings).toContain('const FCX_EVOLUTION_TAB_ID = "fcx-player-evolution-tab"');
    expect(settings).toContain('document.createElement("button")');
    expect(settings).toContain("tabBar.appendChild(tab)");
    expect(settings).toContain("openPlayerEvolutionScreen()");
    expect(settings).toContain("closePlayerEvolutionScreen(false)");
    expect(settings).toContain("new MutationObserver");
    expect(settings.indexOf("new MutationObserver")).toBeLessThan(
      settings.indexOf('document.querySelector(".ut-tab-bar")'),
    );
    expect(settings).not.toContain("playerEvolutionController");
    expect(settings).not.toContain("generatePlayerEvolutionTab");
    expect(settings).not.toContain("setTag(62)");
    expect(settings).not.toContain("evolutionNavBar");
    expect(settings).not.toContain("const syncFcxEvolutionTabPlacement");
    expect(settings).not.toContain("autoSbcTab.insertAdjacentElement");
    expect(settings).not.toContain("scheduleFcxEvolutionTabPlacement");
    expect(settings).not.toContain("startFcxEvolutionTabPlacementObserver");
    expect(settings).toContain('mountPlayStyleAcademyPage(workspace)');
    expect(settings).toContain('unmountPlayStyleAcademyPage(state.workspace)');
    expect(settings).not.toContain("UTEvolutionsViewController.prototype");
    expect(styles).toContain(
      ".ut-tab-bar > .ut-tab-bar-item.icon-sbcSettings.icon-fcx-brand",
    );
    expect(styles).toContain(
      ".ut-tab-bar > .ut-tab-bar-item.icon-autoSbc.icon-fcx-brand",
    );
    expect(styles).toContain(
      ".ut-tab-bar > .ut-tab-bar-item.icon-fcx-evolution",
    );
    expect(styles).toContain("order: 1 !important");
    expect(styles).toContain("order: 2 !important");
    expect(styles).toContain("order: 3 !important");
    expect(styles).toContain(
      ".ut-tab-bar > .ut-tab-bar-item.icon-squad",
    );
    expect(styles).toContain(
      ".ut-tab-bar > .ut-tab-bar-item.icon-settings",
    );
    expect(styles).toContain("order: 11 !important");
    expect(styles).toContain('content: "EVO"');
  });

  it("does not reorder EA's live controller array after initialization", () => {
    expect(settings).toContain("if (this.initialized)");
    expect(settings).toContain("navViewInit.call(this, tabs)");
    expect(settings).toContain("tabs = Array.isArray(tabs) ? tabs.slice() : []");
    expect(settings).not.toContain("preserveEaNativeStartupPage");
    expect(settings).not.toContain("homeTab.click()");
    expect(settings).not.toContain("fcxNavigationExplicitlyOpened");
  });

  it("uses the requested DIY copy without renaming the page or sidebar", () => {
    expect(settings).toContain('<h1 class="auto-sbc-title">球员进化</h1>');
    expect(settings).toContain('<p class="auto-sbc-description">一键DIY球员PlayStyle。</p>');
    expect(runtime).toContain('title: "DIY特技"');
    expect(runtime).not.toContain('title: "PlayStyle 学院"');
  });

  it("preloads Academy slots and applies Base before Plus with safe timing", () => {
    expect(runtime).toContain("requestAcademyHub(1)");
    expect(runtime).toContain("academy.getCategories?.()");
    expect(runtime).toContain("getSlotById?.(slotId)");
    expect(runtime).toContain("requestSlotsByCategory({ categoryId, offset: 0, count: 100, sort: 0 })");
    expect(runtime).toContain("addItemToSlot(item.slot.slotId, currentPlayerId, undefined)");
    expect(runtime).toContain("sort((left, right) => left.target - right.target)");
    expect(runtime).toContain("setTimeout(resolve, 300)");
    expect(runtime).toContain("timeoutMs = 15000");
    expect(runtime).toContain('dismissible: false');
  });

  it("keeps the feature local and does not hook native player controllers", () => {
    expect(runtime).not.toMatch(/external academy branding/i);
    expect(runtime).not.toContain("UTPlayerItemView.prototype");
    expect(runtime).not.toContain("UTPlayerPicksViewController.prototype");
    expect(runtime).not.toContain("fetch(");
    expect(build).toContain('"src/domain/evolutions/runtime.ts"');
    expect(build).toContain("new AcademyPreferencesStore(window.localStorage)");
  });

  it("renders the matching EA trait glyph for every PlayStyle state", () => {
    expect(runtime).toContain('`icon_icontrait${Number(definition?.traitId)}`');
    expect(runtime).toContain('`icon_basetrait${Number(definition?.traitId)}`');
    expect(runtime).toContain('Number(definition?.traitId) === 16');
    expect(runtime).toContain('class="${glyph} fcx-academy-style__icon');
    expect(runtime).toContain('fcx-academy-style__icon-fallback');
    expect(runtime).toContain("verifyAcademyPlayStyleIcons");
    expect(runtime).toContain('window.getComputedStyle(icon, "::before")');
    expect(runtime).toContain('academyPlayStyleIconMarkup(definition, target)');
    expect(styles).toContain('.fcx-academy-style__icon.is-base');
    expect(styles).toContain('.fcx-academy-style__icon.is-plus');
    expect(styles).toContain('color: #cbd3de');
    expect(styles).toContain('color: #f3c85b');
    expect(styles).not.toContain('color: #72ebc5');
    expect(styles).not.toContain('color: #f0dcff');
    expect(styles).toContain('.fcx-academy-style__icon.has-glyph .fcx-academy-style__icon-fallback');
  });

  it("opens the existing editor from a revalidated club player", () => {
    expect(runtime).toContain("const canOpenAcademyPlayerEditorForItem");
    expect(runtime).toContain("const openAcademyPlayerEditorForItem = async (item)");
    expect(runtime).toContain("academyClubPlayerById(itemId)");
    expect(runtime).toContain("球员已不在俱乐部");
    expect(runtime).toContain("openAcademyPlayerEditor(academyPlayerFacts(latest, new Set()))");
  });

  it("uses a targeted club-list refresh with repository fallback", () => {
    const start = runtime.indexOf("const refreshAcademyRepositories");
    const end = runtime.indexOf("const showAcademyExecutionResult", start);
    const refresh = runtime.slice(start, end);
    expect(refresh).toContain("academyMarkRepositoriesDirty()");
    expect(refresh).toContain("refreshAcademyClubList({");
    expect(refresh).toContain('academyFindController("UTClubSearchResultsViewController")');
    expect(refresh).toContain("timeoutMs: 8000");
    expect(refresh).toContain("candidateIds.map(academyClubPlayerById).find(Boolean)");
    expect(refresh).toContain("academyReplacePlayerReferences(referencePlayer, itemIds)");
    expect(refresh).toContain('source: refreshed ? source : "not-found"');
    expect(refresh).not.toContain("fetchPlayers()");
    expect(refresh).not.toContain("requestItemsByPile");
    expect(runtime).toContain("repositories?.Item?.getClub?.()");
    expect(runtime).toContain("services?.Squad?.updateItemInSquads?.(player)");
    expect(runtime).toContain("repositories.Academy.requiresHubCall = true");
  });

  it("always releases the overlay even when status cleanup fails", () => {
    expect(runtime).not.toContain('clearOperationStatus("EVO")');
    expect(runtime).toContain("clearOperationStatus();");
    const finallyStart = runtime.indexOf("runtimeState.academyRunActive = false;");
    const finallyEnd = runtime.indexOf("const openAcademyPlayerEditor", finallyStart);
    const cleanup = runtime.slice(finallyStart, finallyEnd);
    expect(cleanup).toContain("finally {");
    expect(cleanup).toContain("releaseTaskOverlay();");
    expect(cleanup).toContain("进化任务遮罩已释放");
    expect(cleanup).toContain("hideLoader(true)");
  });

  it("shows a non-blocking warning when player references cannot refresh", () => {
    expect(runtime).toContain("进化已完成，页面数据未自动刷新，请切换页面或刷新 Web App。");
    expect(runtime).toContain("fcx-academy-result__warning");
    expect(styles).toContain(".fcx-academy-result__warning");
  });
});
