import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { uiText } from "../src/config/ui-text";

const root = resolve(import.meta.dirname, "..");
const settingsSource = readFileSync(
  resolve(root, "src/ui/settings-runtime.ts"),
  "utf8",
);
const packsSource = readFileSync(
  resolve(root, "src/domain/packs/runtime.ts"),
  "utf8",
);
const bootstrapSource = readFileSync(
  resolve(root, "src/platform/bootstrap-runtime.ts"),
  "utf8",
);
const marketSource = readFileSync(
  resolve(root, "src/domain/market/runtime.ts"),
  "utf8",
);
const sbcSource = readFileSync(
  resolve(root, "src/domain/sbc/runtime.ts"),
  "utf8",
);
const baseUiSource = readFileSync(
  resolve(root, "src/ui/base-runtime.ts"),
  "utf8",
);
const protectionStoreSource = readFileSync(
  resolve(root, "src/state/player-protection-store.ts"),
  "utf8",
);
const inventorySource = readFileSync(
  resolve(root, "src/domain/inventory/runtime.ts"),
  "utf8",
);
const protectedDialogSource = readFileSync(
  resolve(root, "src/ui/protected-players-dialog.ts"),
  "utf8",
);
const viteSource = readFileSync(resolve(root, "vite.config.ts"), "utf8");
const supportSource = readFileSync(resolve(root, "src/ui/support.ts"), "utf8");

describe("localized FCX navigation and Auto SBC page", () => {
  it("uses one FCX picker for each supported SBC exclusion", () => {
    const panelStart = settingsSource.indexOf("const createSBCCustomRulesPanel");
    const panelEnd = settingsSource.indexOf("const getShellUri", panelStart);
    const panelSource = settingsSource.slice(panelStart, panelEnd);
    expect(panelSource.match(/createExclusionPicker\(\{/g)).toHaveLength(4);
    expect(panelSource).toContain('settingKey: "excludeLeagues"');
    expect(panelSource).toContain('settingKey: "excludeNations"');
    expect(panelSource).toContain('settingKey: "excludeTeams"');
    expect(panelSource).toContain('settingKey: "excludeRarity"');
    expect(panelSource).not.toContain("excludePlayers");
    expect(panelSource).not.toContain("createChoice");
    expect(baseUiSource).toContain(".fcx-exclusion-field");
    expect(baseUiSource).toContain(".fcx-picker__option.is-selected");
    expect(viteSource).not.toContain("choices.js");
    expect(baseUiSource).not.toContain("choices__");
  });

  it("places local backend and remote account cards as the first equal-width pair", () => {
    const backendIndex = settingsSource.indexOf('"本地后端", "backend"');
    const remoteIndex = settingsSource.indexOf('"账号与远程控制"');
    const protectionIndex = settingsSource.indexOf('"球员保护", "protection"');
    expect(backendIndex).toBeGreaterThan(-1);
    expect(remoteIndex).toBeGreaterThan(backendIndex);
    expect(remoteIndex).toBeLessThan(protectionIndex);
    expect(baseUiSource).not.toContain(".fcx-settings-card#remoteControl { grid-column: 1 / -1; }");
    expect(baseUiSource).toContain(".fcx-remote-actions--auth");
  });

  it("defines the agreed Chinese navigation and primary settings copy", () => {
    expect(uiText.navigation.solver).toBe("FCX设置");
    expect(uiText.navigation.previousSolver).toBe("SBC求解器");
    expect(uiText.navigation.autoSbc).toBe("自动SBC");
    expect(uiText.navigation.evolution).toBe("球员进化");
    expect(uiText.settings.pageTitle).toBe("FCX设置");
    expect(uiText.settings.always).toBe("始终");
    expect(uiText.settings.optimal).toBe("仅最优方案");
    expect(uiText.settings.never).toBe("从不");
  });

  it("uses the FCX card stack with protection, locks and draft actions", () => {
    expect(settingsSource).not.toContain('createSettingsTile(cards, "SBC求解"');
    expect(settingsSource).toContain('createSettingsTile(cards, "球员保护"');
    expect(settingsSource).toContain('createSettingsTile(cards, "锁定球员"');
    expect(settingsSource).toContain('createSettingsTile(cards, "显示与价格"');
    expect(settingsSource).toContain('createSettingsTile(cards, "卡包处理"');
    expect(settingsSource).toContain('"提交统计提醒"');
    expect(settingsSource).toContain('"高级SBC规则"');
    expect(settingsSource).not.toContain('createSettingsTile(cards, "调试与支持"');
    expect(settingsSource).toContain("规则应用范围");
    expect(settingsSource).toContain("new SettingsEditSession");
    expect(settingsSource).toContain("保存设置");
    expect(settingsSource).toContain("取消更改");
    expect(settingsSource).not.toContain("uiText.settings.repeatCount");
  });

  it("shows only the requested display controls and hides retained advanced tools", () => {
    expect(settingsSource).toContain("uiText.settings.walkoutRating");
    expect(settingsSource).toContain("uiText.settings.showPrices");
    expect(settingsSource).toContain("uiText.settings.showAutoSbcEntry");
    expect(settingsSource).toContain("hideSettingsControl(priceCachePanel)");
    expect(settingsSource).toContain("hideSettingsControl(panel)");
    expect(settingsSource).toContain("uiText.settings.showClubStorageStats");
    expect(settingsSource).toContain('"collectConcepts"');
    expect(settingsSource).toContain('"conceptPremium"');
    expect(baseUiSource).toContain(".fcx-settings-control--hidden");
    expect(baseUiSource).toContain("display: none !important;");
  });

  it("keeps the SBC and challenge scope selectors visible and functional", () => {
    expect(settingsSource).toContain("uiText.settings.chooseSbc");
    expect(settingsSource).toContain("uiText.settings.chooseChallenge");
    expect(settingsSource).toContain('"sbcId"');
    expect(settingsSource).toContain('"sbcChallengeId"');
    expect(settingsSource).not.toContain('#sbcId, #sbcChallengeId');
  });

  it("keeps the current settings session alive when an older EA view is destroyed", () => {
    expect(settingsSource).toContain(
      "if (activeSettingsSession === session) activeSettingsSession = null",
    );
    expect(settingsSource).toContain("session.settings.commit()");
    expect(settingsSource).toContain("session.settings.discard()");
    expect(settingsSource).not.toContain(
      "if (!activeSettingsDraft || !activeProtectionDraft) return",
    );
  });

  it("lays out submission reminders as equal desktop columns", () => {
    expect(settingsSource).toContain(
      'submissionReminderGrid.className = "fcx-submission-reminder-grid"',
    );
    expect(settingsSource).toContain('"提交统计提醒"');
    const desktopStart = baseUiSource.indexOf(".fcx-submission-reminder-grid {");
    const desktopEnd = baseUiSource.indexOf(".fcx-exclusion-field {", desktopStart);
    const desktopRules = baseUiSource.slice(desktopStart, desktopEnd);
    expect(desktopRules).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(desktopRules).toContain("width: 100%;");
    expect(baseUiSource).toContain(
      ".fcx-submission-reminder-grid { grid-template-columns: 1fr; }",
    );
  });

  it("uses a full-width protection card and a read-only protected-player overview", () => {
    expect(baseUiSource).toContain(".fcx-settings-card#protection,");
    expect(baseUiSource).toContain(".fcx-protected-summary__metrics");
    expect(settingsSource).toContain("查看所有保护球员");
    expect(settingsSource).toContain("openProtectedPlayersDialog");
    expect(settingsSource).not.toContain("导入旧版锁定");
    expect(protectionStoreSource).not.toContain("legacyMigrated");
    expect(protectionStoreSource).not.toContain("migrateLegacy");
    expect(inventorySource).not.toContain("migrateLegacy");
  });

  it("reads the active squad from the EA request with repository fallback", () => {
    expect(inventorySource).toContain("services.Squad?.activeSquad");
    expect(inventorySource).toContain("services.Squad?.getActiveSquadId?.()");
    expect(inventorySource).toContain("legacySquadKeys");
    expect(inventorySource).toContain("personaSquads?.get?.(legacySquadKey)");
    expect(inventorySource).toContain('source: "repository.legacyRawKey"');
    expect(inventorySource).toContain("resolveActiveSquadIdCandidates(");
    expect(inventorySource).not.toContain(
      "services.Squad?.getActiveSquadId?.() ?? services.Squad?.activeSquad",
    );
    expect(inventorySource).toContain("services.Squad?.requestSquadById?.(activeSquadId)");
    expect(inventorySource).toContain("resolveActiveSquadEntity(response)");
    expect(inventorySource).toContain("readActiveSquadItemIdsFromCandidates(");
    expect(inventorySource).toContain("repositories.Squad?.squads?.get?.(personaCandidate)");
    expect(inventorySource).toContain("personaSquads?.get?.(activeSquadId)");
    expect(inventorySource).not.toContain("ActiveSquadProtectionCache");
    expect(inventorySource).not.toContain("activeSquadProtectionCache");
    expect(sbcSource).not.toContain("sbcExecution.protectionSnapshot");
    expect(sbcSource).not.toContain("execution.protectionSnapshot");
    expect(settingsSource).toContain("didActiveSquadProtectionReadFail");
    expect(protectedDialogSource).not.toContain("cardImageUrl");
    expect(protectedDialogSource).not.toContain('document.createElement("img")');
  });

  it("places Auto SBC immediately after the solver and keeps both idempotent", () => {
    expect(settingsSource).toContain("tabs.splice(sbcSolverIndex + 1, 0, autoSbcNavBar)");
    expect(settingsSource).toContain("uiText.navigation.legacySolver");
    expect(settingsSource).toContain("uiText.navigation.previousSolver");
    expect(settingsSource).toContain("uiText.navigation.legacyAutoSbc");
    expect(settingsSource).toContain("syncAutoSbcTabVisibility");
    expect(settingsSource.match(/icon-fcx-brand/g)?.length)
      .toBeGreaterThanOrEqual(2);
  });

  it("brands the console and exposes safe social links", () => {
    expect(uiText.autoSbc.eyebrow).toBe("FCX 自动化控制台");
    expect(uiText.autoSbc.author).toBe("一阵失心风");
    expect(settingsSource).toContain("FCX_DOUYIN_URL");
    expect(settingsSource).toContain("FCX_BILIBILI_URL");
    expect(settingsSource).toContain("DOUYIN_ICON_SVG");
    expect(settingsSource).toContain("BILIBILI_ICON_SVG");
    expect(settingsSource).toContain("renderFcxAuthorSocialLinks");
    expect(settingsSource.match(/renderFcxAuthorSocialLinks\(\)/g)).toHaveLength(3);
    expect(settingsSource).toContain("fcx-settings-brandline");
    expect(settingsSource).toContain("FCX · SQUAD CONTROL · <span>");
    expect(settingsSource.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(baseUiSource).toContain(".auto-sbc-author-social");
    expect(baseUiSource).toContain(".fcx-settings-brandline");
    expect(baseUiSource).toContain("width: 24px;");
    expect(baseUiSource).not.toContain(".auto-sbc-social-button");
    expect(baseUiSource).toContain(".ut-tab-bar-item.icon-fcx-brand::before");
    expect(baseUiSource).toContain("FCX_BRAND_ICON_DATA_URL");
    expect(supportSource).toContain("https://www.douyin.com/search/97129992611");
    expect(supportSource).toContain("https://space.bilibili.com/698078048");
    expect(baseUiSource).toContain(".fcx-header-support-button span { display: none; }");
  });

  it("keeps the disclaimer entry in FCX settings", () => {
    expect(settingsSource).toContain('createSettingsTile(cards, "免责声明", "disclaimer")');
    expect(settingsSource).toContain("查看完整免责声明");
    expect(settingsSource).toContain("openFcxDisclaimerDialog()");
    expect(baseUiSource).toContain(".fcx-settings-card#disclaimer,");
  });

  it("renders the remaining Auto SBC feature areas only inside the mounted page", () => {
    expect(packsSource).toContain('nav.classList.add("auto-sbc-toolbar")');
    expect(packsSource).not.toContain("uiText.autoSbc.autoGrind");
    expect(packsSource).not.toContain("btnAutoGrind");
    expect(baseUiSource).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr));",
    );
    expect(packsSource).toContain("createPackList(packGroups)");
    expect(packsSource).toContain("await createCategoryPicker(sbcData)");
    expect(packsSource).toContain("await createSBCButtons(sbcData)");
    expect(packsSource).not.toContain('document.querySelectorAll(".ut-tab-bar-view")');
  });

  it("uses click dialogs for packs, categories and SBC details without hover previews", () => {
    expect(uiText.autoSbc.selectSbcCategory).toBe("选择SBC分类");
    expect(packsSource).toContain('id: "fcx-pack-modal"');
    expect(packsSource).toContain('id: "fcx-category-modal"');
    expect(packsSource).toContain('id: "fcx-sbc-details-modal"');
    expect(packsSource).toContain("uiText.autoSbc.startChallenge");
    expect(packsSource).toContain("uiText.autoSbc.startSet");
    expect(packsSource).not.toContain('addEventListener("mouseenter"');
    expect(packsSource).not.toContain("createHoverNav");
    expect(packsSource).not.toContain("createSBCHover");
  });

  it("caches SBC data, supports refresh and adapts single-challenge actions", () => {
    expect(packsSource).toContain("force ? await refreshSbcCache() : await sbcSets()");
    expect(packsSource).not.toContain("services.SBC.repository.reset();\n    const nav");
    expect(settingsSource).toContain("auto-sbc-refresh-button");
    expect(packsSource).toContain(
      "challenges.length > 1 && !set.isSingleChallenge",
    );
    expect(packsSource).toContain("uiText.autoSbc.ignoreValue");
    expect(packsSource).toContain("ignoreValue: ignoreValueInput.checked");
    expect(packsSource).toContain("剩余可重复次数");
    expect(packsSource).toContain("requestedRuns:");
  });

  it("defers pack summaries during SBC rounds and shows one final result", () => {
    expect(packsSource).toContain("showPackTaskSummary");
    expect(packsSource).toContain("taskOptions.showSummary !== false");
    expect(sbcSource).toContain("mergePackTaskSummary");
    expect(sbcSource).toContain("sbcExecution.summaryShown");
  });

  it("closes pack settings before the run and reports progress on the task overlay", () => {
    const start = packsSource.indexOf('openButton.addEventListener("click"');
    const handler = packsSource.slice(start, start + 1800);
    expect(handler.indexOf("modal.close()")).toBeGreaterThan(-1);
    expect(handler.indexOf("modal.close()")).toBeLessThan(
      handler.indexOf("await runPackSelections"),
    );
    expect(packsSource).toContain("showLoader(true)");
    expect(packsSource).toContain('reportOperationStatus("Pack"');
  });

  it("retains the showSbcTab setting as the new entry visibility switch", () => {
    expect(settingsSource).toContain('getSettings(0, 0, "showSbcTab") !== false');
    expect(settingsSource).toContain('saveSettings(0, 0, "showSbcTab"');
    expect(packsSource).toContain('getSettings(0, 0, "showSbcTab")');
  });

  it("shows the success badge only after all hooks are installed", () => {
    const homeOverrideIndex = bootstrapSource.indexOf("futHomeOverride();");
    const badgeIndex = bootstrapSource.indexOf("showFcxLoadedBadge();");

    expect(homeOverrideIndex).toBeGreaterThan(-1);
    expect(badgeIndex).toBeGreaterThan(homeOverrideIndex);
  });

  it("starts FCX background work only after disclaimer consent", () => {
    const runtimeStart = bootstrapSource.indexOf("const startFcxRuntime");
    const navigationPreparation = bootstrapSource.indexOf("prepareFcxNavigation();");
    const consentGate = bootstrapSource.indexOf("void ensureFcxDisclaimerAccepted");
    const startBody = bootstrapSource.slice(runtimeStart, consentGate);
    expect(runtimeStart).toBeGreaterThan(-1);
    expect(navigationPreparation).toBeGreaterThan(runtimeStart);
    expect(navigationPreparation).toBeLessThan(consentGate);
    expect(consentGate).toBeGreaterThan(runtimeStart);
    expect(startBody).toContain("registerFcxDebugShortcuts()");
    expect(startBody).toContain("harvestMoment");
    expect(startBody).toContain("scriptRuntimeLogs.start()");
    expect(startBody).toContain("mountFcxHeaderSupport(document, {");
    expect(startBody).toContain("FcxVersionUpdateController");
    expect(startBody).toContain("checkAutomatically()");
    expect(startBody).toContain("init()");
    expect(bootstrapSource.slice(consentGate)).toContain('classList.remove("fcx-consent-pending")');
    expect(bootstrapSource.slice(consentGate)).toContain("startFcxRuntime()");
    expect(settingsSource).toContain("isSideBarNavOverrideInstalled");
    expect(baseUiSource).toContain("html.fcx-consent-pending");
    expect(viteSource).not.toContain("void harvestMoment.initialize().then");
  });

  it("retains cache diagnostics behind the hidden settings control", () => {
    expect(uiText.settings.inspectPrices).toBe("检查价格缓存");
    expect(settingsSource).toContain('"inspectPrices"');
    expect(settingsSource).toContain("panel.append(inspectPricesBtn, clearPricesBtn)");
    expect(settingsSource).toContain("hideSettingsControl(panel)");
    expect(settingsSource).toContain("openPriceCacheDiagnosticsDialog");
  });

  it("uses the active SBC task context before any price workflow", () => {
    const contextCheck = marketSource.indexOf("runtimeState.activeSbcExecution");
    const coordinatorStart = marketSource.indexOf("new PriceLookupCoordinator");
    expect(contextCheck).toBeGreaterThan(-1);
    expect(contextCheck).toBeLessThan(coordinatorStart);
    expect(marketSource).not.toContain("正在读取本地价格缓存");
    expect(sbcSource).toContain("createSbcExecutionContext(runOptions)");
    expect(sbcSource).toContain("runtimeState.activeSbcExecution = undefined");
  });
});
