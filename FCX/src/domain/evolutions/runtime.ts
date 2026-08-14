// @ts-nocheck
// PlayStyle Academy runtime. Kept isolated from EA's native Evolution controllers.

const academyPageRuntime = {
  root: null,
  generation: 0,
  players: [],
};

const academyHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const academyNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
};

const academyPlayerId = (player) => academyNumber(player?.id, player?._id, player?.itemId);
const academyDefinitionId = (player) =>
  academyNumber(player?.definitionId, player?._definitionId, player?._staticData?.id);
const academyAssetId = (player) =>
  academyNumber(
    player?.assetId,
    player?._assetId,
    player?._staticData?.assetId,
    academyDefinitionId(player)
  );
const academyRating = (player) =>
  Math.max(0, Number(player?._rating ?? player?.rating ?? player?._staticData?.rating) || 0);

const academyRarityName = (player) => {
  const rarity = academyPlayerRarities(player)[0] || 0;
  try {
    return (
      services.Localization?.localize?.(`item.raretype${rarity}`) ||
      services.Localization?.localize?.(`item.raretype.${rarity}`) ||
      `稀有度 ${rarity}`
    );
  } catch {
    return `稀有度 ${rarity}`;
  }
};

const academyIsGoalkeeper = (player) => {
  try {
    if (player?.isGK?.()) return true;
  } catch (_error) {
    // Fall through to position inspection.
  }
  return academyPlayerPositions(player).some((position) => position.group === "GK");
};

const academySnapshotSignature = (player) => {
  const levels = snapshotPlayStyleLevels(player, PLAYSTYLE_ACADEMY_CONFIG);
  return PLAYSTYLE_ACADEMY_CONFIG.definitions
    .map((definition) => `${definition.traitId}:${levels.get(definition.traitId) || 0}`)
    .join("|");
};

const academyPlayerFacts = (player, evolvedAssetIds = new Set()) => {
  const counts = readPlayStyleCounts(player, PLAYSTYLE_ACADEMY_CONFIG);
  const evolution = isEvolutionPlayer(player);
  const evolvedSibling = !evolution && evolvedAssetIds.has(academyAssetId(player));
  return {
    item: player,
    id: academyPlayerId(player),
    definitionId: academyDefinitionId(player),
    assetId: academyAssetId(player),
    name: getPlayerName(player),
    rating: academyRating(player),
    rarity: academyRarityName(player),
    basic: counts.basic,
    plus: counts.plus,
    maxed:
      counts.basic >= PLAYSTYLE_ACADEMY_CONFIG.limits.basic &&
      counts.plus >= PLAYSTYLE_ACADEMY_CONFIG.limits.plus,
    evolution,
    evolvedSibling,
    signature: academySnapshotSignature(player),
  };
};

const loadAcademyPlayerFacts = async () => {
  const players = (await fetchPlayers()).filter((player) =>
    isAcademyEligiblePlayer(player, PLAYSTYLE_ACADEMY_CONFIG)
  );
  const evolvedAssetIds = new Set(
    players.filter((player) => isEvolutionPlayer(player)).map(academyAssetId).filter(Boolean)
  );
  return players
    .map((player) => academyPlayerFacts(player, evolvedAssetIds))
    .filter((facts) => facts.id > 0)
    .sort((left, right) => right.rating - left.rating || left.name.localeCompare(right.name));
};

const academyRoleLabel = (role) => ACADEMY_ROLE_LABELS[role] || role.replaceAll("-", " ");

const academyPlayStyleIconMarkup = (definition, level = 0, extraClass = "") => {
  const normalizedLevel = Number(level) === 2 ? 2 : Number(level) === 1 ? 1 : 0;
  const glyph = normalizedLevel === 2 || Number(definition?.traitId) === 16
    ? `icon_icontrait${Number(definition?.traitId)}`
    : `icon_basetrait${Number(definition?.traitId)}`;
  const state = normalizedLevel === 2 ? "is-plus" : normalizedLevel === 1 ? "is-base" : "is-preview";
  return `<span class="${glyph} fcx-academy-style__icon ${state} ${extraClass}" role="img" aria-label="${academyHtml(definition?.name || "PlayStyle")} ${normalizedLevel === 2 ? "Plus" : normalizedLevel === 1 ? "基础" : "预览"}"><span class="fcx-academy-style__icon-fallback" aria-hidden="true">FCX</span></span>`;
};

const verifyAcademyPlayStyleIcons = (root) => {
  const inspect = () => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(".fcx-academy-style__icon").forEach((icon) => {
      let content = "";
      try {
        content = String(window.getComputedStyle(icon, "::before")?.content || "")
          .replaceAll('"', "")
          .replaceAll("'", "")
          .trim();
      } catch (_error) {
        content = "";
      }
      icon.classList.toggle("has-glyph", Boolean(content && content !== "none" && content !== "normal"));
    });
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(inspect);
  else setTimeout(inspect, 0);
};

const academySelectOptions = (select, values, selected, getLabel = (value) => value) => {
  select.replaceChildren();
  for (const value of values) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = getLabel(value);
    option.selected = String(value) === String(selected);
    select.appendChild(option);
  }
};

const renderAcademyList = async (root, generation) => {
  const loading = root.querySelector(".fcx-academy-loading");
  try {
    const players = await loadAcademyPlayerFacts();
    if (academyPageRuntime.root !== root || academyPageRuntime.generation !== generation) return;
    academyPageRuntime.players = players;
    const preferences = fcxAcademyPreferences.get();
    const search = root.querySelector(".fcx-academy-search");
    const list = root.querySelector(".fcx-academy-grid");
    const stats = root.querySelector(".fcx-academy-stats");
    const empty = root.querySelector(".fcx-academy-empty");
    const repaint = () => {
      const query = String(search?.value || "").trim().toLocaleLowerCase();
      const hideMaxed = fcxAcademyPreferences.get().hideMaxed;
      const visible = players.filter((facts) => {
        if (hideMaxed && facts.maxed) return false;
        if (!query) return true;
        return `${facts.name} ${facts.rating} ${facts.rarity}`.toLocaleLowerCase().includes(query);
      });
      stats.textContent = `${visible.length} / ${players.length} 名可用球员`;
      empty.hidden = visible.length > 0;
      list.replaceChildren();
      for (const facts of visible) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "fcx-academy-player";
        if (facts.maxed) card.classList.add("is-maxed");
        if (facts.evolvedSibling) card.classList.add("has-evolved-sibling");
        card.innerHTML = `
          <span class="fcx-academy-player__rating">${facts.rating || "—"}</span>
          <span class="fcx-academy-player__identity">
            <strong>${academyHtml(facts.name)}</strong>
            <small>${academyHtml(facts.rarity)}</small>
          </span>
          <span class="fcx-academy-player__levels">
            <span class="is-base"><b>${facts.basic}</b> 基础</span>
            <span class="is-plus"><b>${facts.plus}</b> Plus</span>
          </span>
          <span class="fcx-academy-player__state">${
            facts.maxed ? "已满" : facts.evolvedSibling ? "已有进化版本" : "配置"
          }</span>`;
        card.addEventListener("click", () => openAcademyPlayerEditor(facts));
        list.appendChild(card);
      }
    };
    search.addEventListener("input", repaint);
    const hideMaxed = root.querySelector(".fcx-academy-hide-maxed");
    hideMaxed.checked = preferences.hideMaxed;
    hideMaxed.addEventListener("change", () => {
      fcxAcademyPreferences.setHideMaxed(hideMaxed.checked);
      repaint();
    });
    repaint();
    loading.hidden = true;
  } catch (error) {
    if (academyPageRuntime.root !== root || academyPageRuntime.generation !== generation) return;
    loading.classList.add("is-error");
    loading.textContent = `球员读取失败：${error?.message || error}`;
    console.error("[FCX][EVO] 学院球员读取失败", error);
  }
};

const mountPlayStyleAcademyPage = (root) => {
  if (!root) return;
  academyPageRuntime.root = root;
  academyPageRuntime.generation += 1;
  const generation = academyPageRuntime.generation;
  root.innerHTML = `
    <section class="fcx-academy-toolbar">
      <label class="fcx-academy-search-wrap">
        <span>搜索球员</span>
        <input class="fcx-academy-search" type="search" placeholder="输入球员名称、总评或稀有度" autocomplete="off">
      </label>
      <label class="fcx-academy-switch">
        <input class="fcx-academy-hide-maxed" type="checkbox">
        <span>隐藏已满球员</span>
      </label>
      <span class="fcx-academy-stats">正在读取球员…</span>
      <button type="button" class="fcx-button fcx-button--secondary fcx-academy-refresh">刷新</button>
    </section>
    <div class="fcx-academy-loading">正在读取俱乐部与 PlayStyle 状态…</div>
    <div class="fcx-academy-grid" aria-live="polite"></div>
    <div class="fcx-academy-empty" hidden>当前筛选条件下没有可用球员。</div>`;
  root.querySelector(".fcx-academy-refresh")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    mountPlayStyleAcademyPage(root);
  });
  void renderAcademyList(root, generation);
};

const unmountPlayStyleAcademyPage = (root) => {
  if (academyPageRuntime.root !== root) return;
  academyPageRuntime.root = null;
  academyPageRuntime.generation += 1;
};

const renderAcademyStyleTiles = (container, state, repaint) => {
  container.replaceChildren();
  const categories = [...new Set(PLAYSTYLE_ACADEMY_CONFIG.definitions.map((item) => item.category))];
  for (const category of categories) {
    const section = document.createElement("section");
    section.className = "fcx-academy-style-group";
    const title = document.createElement("h4");
    title.textContent = category;
    const grid = document.createElement("div");
    grid.className = "fcx-academy-style-grid";
    for (const definition of PLAYSTYLE_ACADEMY_CONFIG.definitions.filter(
      (item) => item.category === category
    )) {
      if (definition.goalkeeperOnly && !state.goalkeeper) continue;
      const original = state.original.get(definition.traitId) || 0;
      const target = state.target.get(definition.traitId) || original;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `fcx-academy-style is-level-${target}`;
      if (original > 0) button.classList.add("is-owned");
      button.innerHTML = `
        ${academyPlayStyleIconMarkup(definition, target)}
        <span class="fcx-academy-style__copy">
          <strong>${academyHtml(definition.name)}</strong>
          <small>${target === 2 ? "Plus" : target === 1 ? "基础" : "无"}${original > 0 ? " · 已有" : ""}</small>
        </span>`;
      button.title = original > 0 ? "已有能力不能删除，可继续升级" : "点击切换无、基础和 Plus";
      button.addEventListener("click", () => {
        const next = nextPlayStyleTarget({
          traitId: definition.traitId,
          original: state.original,
          target: state.target,
          counts: state.counts,
          config: PLAYSTYLE_ACADEMY_CONFIG,
          goalkeeper: state.goalkeeper,
        });
        if (next === null) {
          queueFcxNotification(["该 PlayStyle 已达到数量上限或不适用于当前球员", UINotificationType.NEGATIVE]);
          return;
        }
        state.target.set(definition.traitId, next);
        repaint();
      });
      grid.appendChild(button);
    }
    section.append(title, grid);
    container.appendChild(section);
  }
  verifyAcademyPlayStyleIcons(container);
};

const openAcademyPresetEditor = (group, role, defaultKeys, onSaved) => {
  const content = document.createElement("div");
  content.className = "fcx-academy-preset";
  let keys = fcxAcademyPreferences.getPreset(group, role) || [...defaultKeys];
  const list = document.createElement("div");
  const repaint = () => {
    list.replaceChildren();
    keys.forEach((key, index) => {
      const definition = PLAYSTYLE_ACADEMY_CONFIG.definitions.find((item) => item.key === key);
      const row = document.createElement("div");
      row.className = "fcx-academy-preset__row";
      row.innerHTML = `<span><b>${index + 1}</b>${academyPlayStyleIconMarkup(definition, 1, "is-compact")}<em>${academyHtml(definition?.name || key)}</em></span>`;
      const actions = document.createElement("span");
      for (const [label, delta] of [["↑", -1], ["↓", 1]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = index + delta < 0 || index + delta >= keys.length;
        button.addEventListener("click", () => {
          const next = [...keys];
          [next[index], next[index + delta]] = [next[index + delta], next[index]];
          keys = next;
          repaint();
        });
        actions.appendChild(button);
      }
      row.appendChild(actions);
      list.appendChild(row);
    });
  };
  repaint();
  content.appendChild(list);
  const modal = openFcxModal({
    id: "fcx-academy-preset-modal",
    title: "自定义推荐顺序",
    description: `${group} · ${academyRoleLabel(role)}，靠前的能力会优先推荐。`,
    content,
  });
  verifyAcademyPlayStyleIcons(content);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "fcx-button fcx-button--secondary";
  reset.textContent = "恢复默认推荐";
  reset.addEventListener("click", () => {
    fcxAcademyPreferences.deletePreset(group, role);
    keys = [...defaultKeys];
    repaint();
    onSaved?.();
  });
  const save = document.createElement("button");
  save.type = "button";
  save.className = "fcx-button fcx-button--primary";
  save.textContent = "保存顺序";
  save.addEventListener("click", () => {
    fcxAcademyPreferences.savePreset(group, role, keys);
    onSaved?.();
    modal.close();
  });
  modal.footer.append(reset, save);
};

const confirmAcademyPlan = (facts, plan, slotsById) =>
  new Promise((resolve) => {
    const content = document.createElement("div");
    content.className = "fcx-academy-confirm";
    const list = document.createElement("div");
    list.className = "fcx-academy-confirm__list";
    for (const item of plan) {
      const slot = slotsById.get(item.slot.slotId);
      const cost = academyReadSlotCost(slot);
      const row = document.createElement("div");
      const definition = PLAYSTYLE_ACADEMY_CONFIG.definitions.find((candidate) => candidate.traitId === item.traitId);
      row.innerHTML = `<span class="fcx-academy-confirm__trait">${academyPlayStyleIconMarkup(definition, item.target, "is-compact")}<span><b>${academyHtml(item.name)}</b><small>${item.target === 2 ? "Plus" : "基础"}</small></span></span><strong>${
        cost ? cost.toLocaleString() : "费用以 EA 实际规则为准"
      }</strong>`;
      list.appendChild(row);
    }
    content.innerHTML = `<div class="fcx-academy-confirm__player"><b>${facts.rating}</b><span><strong>${academyHtml(facts.name)}</strong><small>${academyHtml(facts.rarity)}</small></span></div>`;
    content.appendChild(list);
    const modal = openFcxModal({
      id: "fcx-academy-confirm-modal",
      title: "确认一键应用",
      description: "该操作会立即调用 EA 学院进化，成功后无法通过 FCX 撤销。",
      content,
      dismissible: false,
    });
    verifyAcademyPlayStyleIcons(content);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "fcx-button fcx-button--secondary";
    cancel.textContent = "取消";
    cancel.addEventListener("click", () => { modal.close(); resolve(false); });
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "fcx-button fcx-button--primary";
    confirm.textContent = `确认应用 ${plan.length} 项`;
    confirm.addEventListener("click", () => { modal.close(); resolve(true); });
    modal.footer.append(cancel, confirm);
  });

const academyObserve = (factory, label, timeoutMs = 15000, options = {}) =>
  executeFcxEaRequest(
    typeof factory === "function" ? factory : () => factory,
    label,
    {
      scope: "SBC",
      useSbcRequestGate: false,
      timeoutMs,
      verifyAfterFailure: options.verifyAfterFailure,
    }
  );

const academyResponseRoot = (value) => value?.response?.data || value?.response || value?.data || value || {};

const academyCollectArrays = (value, keys) => {
  const root = academyResponseRoot(value);
  const values = [];
  const seen = new WeakSet();
  const append = (candidate) => {
    if (Array.isArray(candidate)) values.push(...candidate);
    else if (candidate?.toArray) {
      try { values.push(...candidate.toArray()); } catch (_error) { /* ignore */ }
    } else if (Array.isArray(candidate?._collection)) values.push(...candidate._collection);
  };
  const visit = (candidate, depth) => {
    if (!candidate || typeof candidate !== "object" || depth > 4 || seen.has(candidate)) return;
    seen.add(candidate);
    for (const [key, nested] of Object.entries(candidate)) {
      if (keys.includes(key)) append(nested);
      if (["response", "data", "hub", "academy", "repository", "result"].includes(key)) {
        visit(nested, depth + 1);
      }
    }
  };
  visit(root, 0);
  return values;
};

const academyCategoryId = (category) =>
  academyNumber(category?.categoryId, category?.id, category?._id, category?.value);
const academySlotId = (slot) =>
  academyNumber(slot?.slotId, slot?.id, slot?._id, slot?.definitionId, slot?.slot?.id);

const academyGetSlotById = (slotId) => {
  try {
    return repositories?.Academy?.getSlotById?.(slotId) || null;
  } catch (_error) {
    return null;
  }
};

const academyRepositorySlots = () => {
  const repository = repositories?.Academy;
  const values = [];
  for (const candidate of [
    repository?.getSlots?.(),
    repository?.getAllSlots?.(),
    repository?.slots,
    repository?.items,
    repository?._collection,
  ]) {
    if (Array.isArray(candidate)) values.push(...candidate);
    else if (candidate?.toArray) {
      try { values.push(...candidate.toArray()); } catch (_error) { /* ignore */ }
    } else if (Array.isArray(candidate?._collection)) values.push(...candidate._collection);
  }
  return values;
};

const preloadAcademySlots = async (plan) => {
  const academy = services?.Academy;
  if (!academy?.requestAcademyHub || !academy?.requestSlotsByCategory || !academy?.addItemToSlot) {
    throw new Error("EA Academy 服务尚未加载，请刷新 EA Web App 后重试");
  }
  const requiredIds = [...new Set(plan.map((item) => item.slot.slotId))];
  const slotsById = new Map();
  for (const slotId of requiredIds) {
    const slot = academyGetSlotById(slotId);
    if (slot) slotsById.set(slotId, slot);
  }
  if (slotsById.size === requiredIds.length) return slotsById;
  reportOperationStatus("EVO", "正在加载 PlayStyle 学院槽位");
  const hub = await academyObserve(() => academy.requestAcademyHub(1), "读取学院中心");
  const categories = academyCollectArrays(hub, ["categories", "academyCategories", "items"])
    .map(academyCategoryId)
    .filter(Boolean);
  const repositoryCategories = academyCollectArrays(repositories?.Academy, ["categories"])
    .map(academyCategoryId)
    .filter(Boolean);
  try {
    const values = academy.getCategories?.() || [];
    repositoryCategories.push(...values.map(academyCategoryId).filter(Boolean));
  } catch (_error) {
    // Continue with hub and repository category lists.
  }
  try {
    const values = repositories?.Academy?.getCategories?.();
    const list = Array.isArray(values) ? values : values?.toArray?.() || values?._collection || [];
    repositoryCategories.push(...list.map(academyCategoryId).filter(Boolean));
  } catch (_error) {
    // Hub response categories remain the source of truth.
  }
  const categoryIds = [...new Set([...categories, ...repositoryCategories])];
  if (!categoryIds.length) {
    throw new Error("无法读取 PlayStyle 学院分类，请更新 FCX 或稍后重试");
  }
  const discovered = [...academyRepositorySlots()];
  for (const categoryId of categoryIds) {
    const response = await academyObserve(
      () => academy.requestSlotsByCategory({ categoryId, offset: 0, count: 100, sort: 0 }),
      `读取学院分类 ${categoryId}`
    );
    discovered.push(...academyCollectArrays(response, ["slots", "items", "academySlots"]));
  }
  discovered.push(...academyRepositorySlots());
  for (const slot of discovered) {
    const id = academySlotId(slot);
    if (id) slotsById.set(id, slot);
  }
  for (const slotId of requiredIds) {
    const slot = academyGetSlotById(slotId);
    if (slot) slotsById.set(slotId, slot);
  }
  const missing = requiredIds.filter((id) => !slotsById.has(id));
  if (missing.length) {
    throw new Error(`PlayStyle 学院槽位已更新（缺少 ${missing.join("、")}），请更新 FCX 后再试`);
  }
  return slotsById;
};

const academyReadSlotCost = (slot) => {
  const candidates = [
    slot?.price,
    slot?.cost,
    slot?.coins,
    slot?.currencyAmount,
    slot?.requirements?.coins,
    slot?.entryCost?.amount,
  ];
  for (const value of candidates) {
    const numeric = Number(typeof value === "object" ? value?.amount : value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
};

const academyExtractPlayer = (response) => {
  const root = academyResponseRoot(response);
  return root?.item || root?.player || root?.evolvedItem || root?.items?.[0] || null;
};

const academyMarkRepositoriesDirty = () => {
  const itemRepository = repositories?.Item;
  const piles = [
    ItemPile?.CLUB ?? 7,
    ItemPile?.ACTIVE_SQUAD,
    ItemPile?.DEVELOPMENT,
    ItemPile?.RESERVES,
    ItemPile?.SBC_STORAGE ?? ItemPile?.STORAGE,
  ].filter((pile) => pile !== undefined && pile !== null);
  for (const pile of new Set(piles)) {
    try { itemRepository?.setDirty?.(pile); } catch (error) {
      console.warn("[FCX][EVO] repository 标脏失败", { pile, error });
    }
  }
  try {
    if (repositories?.Academy) repositories.Academy.requiresHubCall = true;
  } catch (error) {
    console.warn("[FCX][EVO] Academy repository 标脏失败", error);
  }
  try { services?.Club?.clubDao?.resetStatsCache?.(); } catch (_error) { /* best effort */ }
};

const academyClubPlayerById = (itemId) => {
  if (!Number(itemId)) return null;
  try {
    const club = repositories?.Item?.getClub?.();
    const item = club?.getItem?.(ItemType?.PLAYER, ItemSubType?.PLAYER, Number(itemId));
    if (item) return item;
    const collection = club?._collection || club?.items;
    if (Array.isArray(collection)) {
      return collection.find((candidate) => academyPlayerId(candidate) === Number(itemId)) || null;
    }
  } catch (error) {
    console.warn("[FCX][EVO] 俱乐部 repository 球员读取失败", { itemId, error });
  }
  return null;
};

const academyRemoveStaleClubPlayer = (player) => {
  const itemRepository = repositories?.Item;
  try { itemRepository?.removeItem?.(player); } catch (error) {
    console.warn("[FCX][EVO] 旧球员实体 removeItem 失败", error);
  }
  try { itemRepository?.remove?.(player); } catch (error) {
    console.warn("[FCX][EVO] 旧球员实体 remove 失败", error);
  }
};

const canOpenAcademyPlayerEditorForItem = (item) => {
  try {
    if (!item?.isPlayer?.() || !academyPlayerId(item)) return false;
    if (item?.isTimeLimited?.()) return false;
    if (!isAcademyEligiblePlayer(item, PLAYSTYLE_ACADEMY_CONFIG)) return false;
    return Boolean(academyClubPlayerById(academyPlayerId(item)));
  } catch (_error) {
    return false;
  }
};

const academyFindController = (constructorName) => {
  if (typeof getAppMain !== "function") return null;
  let root;
  try { root = getAppMain().getRootViewController(); } catch (_error) { return null; }
  const seen = new Set();
  const queue = [root];
  for (let scanned = 0; scanned < 800 && queue.length; scanned += 1) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (current.constructor?.name === constructorName) return current;
    let keys = [];
    try { keys = Object.keys(current); } catch (_error) { continue; }
    for (const key of keys) {
      let value;
      try { value = current[key]; } catch (_error) { continue; }
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      if (Array.isArray(current) || Array.isArray(value) || /controller|view/i.test(key)) {
        queue.push(value);
      }
    }
  }
  return null;
};

const academySquadSlotsForItems = (itemIds) => {
  const matches = [];
  try {
    const user = services?.User?.getUser?.();
    const persona = user?.selectedPersona || user?.getSelectedPersona?.();
    const squads = repositories?.Squad?.getSquads?.(persona) || [];
    for (const squad of squads) {
      const slots = squad?.getSlots?.() || [];
      slots.forEach((slot, index) => {
        const item = slot?.item || slot?.getItem?.();
        if (item && itemIds.has(academyPlayerId(item))) {
          matches.push({ squad, slot, item, index });
        }
      });
    }
  } catch (error) {
    console.warn("[FCX][EVO] 阵容引用读取失败", error);
  }
  return matches;
};

const academyRefreshDetailsReference = (player, itemIds) => {
  try {
    const controller = academyFindController("UTItemDetailsViewController");
    const viewmodel = controller?.viewmodel;
    if (!controller || !viewmodel) return;
    if (Array.isArray(viewmodel._collection)) {
      const index = viewmodel._collection.findIndex((item) => itemIds.has(academyPlayerId(item)));
      if (index >= 0) viewmodel._collection[index] = player;
    }
    if (viewmodel.pinnedItem && itemIds.has(academyPlayerId(viewmodel.pinnedItem))) {
      viewmodel.pinnedItem = player;
    }
    controller.refreshView?.();
    controller.refreshPanel?.();
  } catch (error) {
    console.warn("[FCX][EVO] 球员详情引用刷新失败", error);
  }
};

const academyReplacePlayerReferences = (player, itemIds) => {
  if (!player) return;
  const squadSlots = academySquadSlotsForItems(itemIds);
  for (const { slot, item } of squadSlots) {
    if (item === player) continue;
    try {
      if (typeof slot?.setItem === "function") slot.setItem(player);
      else slot.item = player;
    } catch (error) {
      console.warn("[FCX][EVO] 阵容球员实体替换失败", error);
    }
  }
  try { services?.Squad?.updateItemInSquads?.(player); } catch (error) {
    console.warn("[FCX][EVO] 阵容服务引用刷新失败", error);
  }
  try { repositories?.Item?.update?.(player); } catch (error) {
    console.warn("[FCX][EVO] 球员 repository 更新失败", error);
  }
  try { player?.onDataUpdated?.notify?.(player); } catch (_error) { /* best effort */ }
  academyRefreshDetailsReference(player, itemIds);
};

const refreshAcademyRepositories = async (lastPlayer, itemIds) => {
  reportOperationStatus("EVO", "正在刷新球员、俱乐部与阵容引用");
  academyMarkRepositoriesDirty();
  const candidateIds = [
    academyPlayerId(lastPlayer),
    ...[...itemIds].reverse(),
  ].filter((itemId, index, values) => itemId > 0 && values.indexOf(itemId) === index);
  let clubRefresh = {
    player: null,
    attempted: false,
    timedOut: false,
    source: "unavailable",
  };
  try {
    clubRefresh = await executeFcxEaRequest(
      async () => {
        const result = await refreshAcademyClubList({
          controller: academyFindController("UTClubSearchResultsViewController"),
          candidateIds,
          getItemId: academyPlayerId,
          removeStaleItem: academyRemoveStaleClubPlayer,
          timeoutMs: 8000,
        });
        if (result.timedOut) {
          throw Object.assign(new Error("刷新进化后的俱乐部球员超时"), { status: 408 });
        }
        return result;
      },
      "刷新进化后的俱乐部球员",
      { scope: "SBC", timeoutMs: 10000, useSbcRequestGate: false }
    );
  } catch (error) {
    console.warn("[FCX][EVO] 俱乐部列表定向刷新失败", error);
    clubRefresh = {
      player: null,
      attempted: true,
      timedOut: false,
      source: "request-error",
    };
  }

  let fresh = clubRefresh.player;
  let source = clubRefresh.source;
  if (!fresh) {
    fresh = candidateIds.map(academyClubPlayerById).find(Boolean) || null;
    if (fresh) source = "repository";
  }
  const referencePlayer = fresh || lastPlayer || null;
  academyReplacePlayerReferences(referencePlayer, itemIds);
  const refreshed = Boolean(fresh);
  const warning = refreshed
    ? ""
    : "进化已完成，页面数据未自动刷新，请切换页面或刷新 Web App。";
  console.info("[FCX][EVO] 进化后引用刷新完成", {
    source: refreshed ? source : "not-found",
    playerId: academyPlayerId(referencePlayer),
    knownItemIds: [...itemIds],
    attempted: clubRefresh.attempted,
    timedOut: clubRefresh.timedOut,
  });
  return {
    player: referencePlayer,
    refreshed,
    source: refreshed ? source : "not-found",
    warning,
  };
};

const showAcademyExecutionResult = (facts, results, refreshResult = null) => {
  const content = document.createElement("div");
  content.className = "fcx-academy-result";
  const success = results.filter((item) => item.success);
  const failed = results.filter((item) => !item.success);
  content.innerHTML = `
    <div class="fcx-academy-result__stats"><span><b>${success.length}</b>成功</span><span><b>${failed.length}</b>失败</span></div>
    ${refreshResult?.warning ? `<div class="fcx-academy-result__warning">${academyHtml(refreshResult.warning)}</div>` : ""}
    <div class="fcx-academy-result__list">${results.map((result) => `
      <div class="${result.success ? "is-success" : "is-failed"}">
        <span class="fcx-academy-confirm__trait">${academyPlayStyleIconMarkup(
          PLAYSTYLE_ACADEMY_CONFIG.definitions.find((candidate) => candidate.traitId === result.item.traitId),
          result.item.target,
          "is-compact"
        )}<span><b>${academyHtml(result.item.name)}</b><small>${result.item.target === 2 ? "Plus" : "基础"}</small></span></span>
        <strong>${academyHtml(result.success ? "已应用" : result.reason)}</strong>
      </div>`).join("")}</div>`;
  const modal = openFcxModal({
    id: "fcx-academy-result-modal",
    title: `${facts.name} · 进化结果`,
    description: failed.length ? "部分项目未能完成，其他成功项目已保留。" : "全部 PlayStyle 已应用完成。",
    content,
  });
  verifyAcademyPlayStyleIcons(content);
  const done = document.createElement("button");
  done.type = "button";
  done.className = "fcx-button fcx-button--primary";
  done.textContent = "完成";
  done.addEventListener("click", () => modal.close());
  modal.footer.appendChild(done);
};

const executeAcademyPlan = async (facts, plan, expectedSignature) => {
  if (hasBlockingFcxTask()) throw new Error("当前 FCX 任务尚未结束，请先结束后再进化球员");
  resetTaskCancellation();
  runtimeState.academyRunActive = true;
  holdTaskOverlay();
  const results = [];
  let lastPlayer = facts.item;
  let receivedEvolutionPlayer = false;
  const evolutionItemIds = new Set([facts.id]);
  try {
    reportOperationStatus("EVO", "正在校验球员与 PlayStyle 状态");
    const latestPlayers = await fetchPlayers();
    const latest = latestPlayers.find((player) => academyPlayerId(player) === facts.id);
    if (!latest) throw new Error("球员已不在俱乐部，请刷新列表后重试");
    if (academySnapshotSignature(latest) !== expectedSignature) {
      throw new Error("球员 PlayStyle 状态已经变化，请重新打开后再应用");
    }
    const currentCounts = readPlayStyleCounts(latest, PLAYSTYLE_ACADEMY_CONFIG);
    const original = snapshotPlayStyleLevels(latest, PLAYSTYLE_ACADEMY_CONFIG);
    const target = new Map(original);
    for (const item of plan) target.set(item.traitId, item.target);
    const totals = countTargetPlayStyles(original, target, currentCounts);
    if (totals.basic > Math.max(PLAYSTYLE_ACADEMY_CONFIG.limits.basic, currentCounts.basic) ||
        totals.plus > Math.max(PLAYSTYLE_ACADEMY_CONFIG.limits.plus, currentCounts.plus)) {
      throw new Error("球员当前 PlayStyle 数量已超过学院上限，请刷新后重新配置");
    }
    const slotsById = await preloadAcademySlots(plan);
    let currentPlayerId = academyPlayerId(latest);
    const ordered = [...plan].sort((left, right) => left.target - right.target);
    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index];
      if (isTaskCancellationRequested()) {
        results.push(...ordered.slice(index).map((pending) => ({ item: pending, success: false, reason: "用户已结束任务" })));
        break;
      }
      reportOperationStatus(
        "EVO",
        `正在应用 ${index + 1}/${ordered.length} · ${item.name} ${item.target === 2 ? "Plus" : "基础"}`
      );
      try {
        if (!slotsById.has(item.slot.slotId)) throw new Error("学院槽位已失效");
        invalidateInventorySnapshot("club");
        const response = await academyObserve(
          () => services.Academy.addItemToSlot(item.slot.slotId, currentPlayerId, undefined),
          `应用 ${item.name}`,
          15000,
          {
            verifyAfterFailure: async () => {
              try {
                const refreshed = (await fetchPlayers()).find((player) => {
                  const id = academyPlayerId(player);
                  return id === currentPlayerId || id === facts.id;
                });
                if (!refreshed) {
                  return { state: "unknown", reason: "进化请求结果无法确认，为避免重复扣费未自动重试" };
                }
                const levels = snapshotPlayStyleLevels(refreshed, PLAYSTYLE_ACADEMY_CONFIG);
                if (Number(levels.get(item.traitId) || 0) >= item.target) {
                  return {
                    state: "applied",
                    value: { success: true, status: 200, response: refreshed },
                  };
                }
                return { state: "not_applied" };
              } catch (error) {
                return { state: "unknown", reason: `进化状态核验失败：${error?.message || error}` };
              }
            },
          }
        );
        const evolved = academyExtractPlayer(response);
        if (evolved) {
          fcxInventoryCache.upsert(getCurrentPersonaId(), "club", evolved);
          lastPlayer = evolved;
          receivedEvolutionPlayer = true;
          currentPlayerId = academyPlayerId(evolved) || currentPlayerId;
          if (currentPlayerId) evolutionItemIds.add(currentPlayerId);
        }
        results.push({ item, success: true, reason: "" });
      } catch (error) {
        const reason = localizeAcademyError(error);
        console.error("[FCX][EVO] 单项进化失败", { item, error });
        results.push({ item, success: false, reason });
      }
      if (index < ordered.length - 1) await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const successfulApplications = results.filter((result) => result.success).length;
    const refreshResult = successfulApplications
      ? await refreshAcademyRepositories(
          receivedEvolutionPlayer ? lastPlayer : null,
          evolutionItemIds
        )
      : null;
    showAcademyExecutionResult(facts, results, refreshResult);
    if (academyPageRuntime.root) mountPlayStyleAcademyPage(academyPageRuntime.root);
  } finally {
    runtimeState.academyRunActive = false;
    try {
      clearOperationStatus();
    } catch (error) {
      console.warn("[FCX][EVO] 进化状态清理失败", error);
    } finally {
      try {
        releaseTaskOverlay();
        console.info("[FCX][EVO] 进化任务遮罩已释放");
      } catch (error) {
        console.error("[FCX][EVO] 进化任务遮罩释放失败", error);
        runtimeState.taskOverlayHolds = 0;
        runtimeState.taskShieldOwned = false;
        runtimeState.taskShieldUsesFallback = false;
        try { hideLoader(true); } catch (_hideError) { /* best effort */ }
      }
    }
  }
};

const openAcademyPlayerEditor = (facts) => {
  if (hasBlockingFcxTask()) {
    queueFcxNotification(["当前 FCX 任务尚未结束，请先结束任务", UINotificationType.NEGATIVE]);
    return;
  }
  const original = snapshotPlayStyleLevels(facts.item, PLAYSTYLE_ACADEMY_CONFIG);
  const state = {
    original,
    target: new Map(original),
    counts: readPlayStyleCounts(facts.item, PLAYSTYLE_ACADEMY_CONFIG),
    goalkeeper: academyIsGoalkeeper(facts.item),
  };
  const content = document.createElement("div");
  content.className = "fcx-academy-editor";
  content.innerHTML = `
    <div class="fcx-academy-editor__player">
      <b>${facts.rating}</b><span><strong>${academyHtml(facts.name)}</strong><small>${academyHtml(facts.rarity)}</small></span>
      <span class="fcx-academy-editor__counts"></span>
    </div>
    <div class="fcx-academy-editor__recommendation">
      <label><span>球员位置</span><select class="fcx-academy-position"></select></label>
      <label><span>场上角色</span><select class="fcx-academy-role"></select></label>
      <button type="button" class="fcx-button fcx-button--primary fcx-academy-recommend">智能推荐</button>
      <button type="button" class="fcx-button fcx-button--secondary fcx-academy-customize">推荐顺序</button>
    </div>
    <div class="fcx-academy-styles"></div>`;
  const positions = academyPlayerPositions(facts.item);
  const positionSelect = content.querySelector(".fcx-academy-position");
  const roleSelect = content.querySelector(".fcx-academy-role");
  academySelectOptions(
    positionSelect,
    positions.map((position) => `${position.code}|${position.group}`),
    `${positions[0]?.code || ""}|${positions[0]?.group || ""}`,
    (value) => value.split("|")[0]
  );
  const currentGroup = () => String(positionSelect.value || "").split("|")[1] || positions[0]?.group;
  const updateRoles = () => {
    const roles = PLAYSTYLE_ACADEMY_CONFIG.recommendations[currentGroup()] || [];
    academySelectOptions(roleSelect, roles.map((role) => role.role), roles[0]?.role, academyRoleLabel);
  };
  updateRoles();
  positionSelect.addEventListener("change", updateRoles);
  const styles = content.querySelector(".fcx-academy-styles");
  const counts = content.querySelector(".fcx-academy-editor__counts");
  const modal = openFcxModal({
    id: "fcx-academy-player-modal",
    title: "DIY特技",
    description: "基础与 Plus 使用不同颜色标识；已有能力无法删除。",
    content,
  });
  const repaint = () => {
    const totals = countTargetPlayStyles(state.original, state.target, state.counts);
    counts.innerHTML = `<span class="is-base">基础 <b>${totals.basic}/${Math.max(PLAYSTYLE_ACADEMY_CONFIG.limits.basic, state.counts.basic)}</b></span><span class="is-plus">Plus <b>${totals.plus}/${Math.max(PLAYSTYLE_ACADEMY_CONFIG.limits.plus, state.counts.plus)}</b></span>`;
    renderAcademyStyleTiles(styles, state, repaint);
    const plan = buildAcademyApplyPlan(state.original, state.target, PLAYSTYLE_ACADEMY_CONFIG);
    apply.disabled = plan.length === 0;
    apply.textContent = plan.length ? `一键应用（${plan.length}）` : "一键应用";
  };
  content.querySelector(".fcx-academy-recommend").addEventListener("click", () => {
    const group = currentGroup();
    const role = roleSelect.value;
    const defaults = (PLAYSTYLE_ACADEMY_CONFIG.recommendations[group] || [])
      .find((item) => item.role === role)?.playStyles || [];
    const keys = fcxAcademyPreferences.getPreset(group, role) || defaults;
    const recommendation = recommendPlayStyles({
      keys,
      player: facts.item,
      config: PLAYSTYLE_ACADEMY_CONFIG,
      original: state.original,
      counts: state.counts,
    });
    state.target = recommendation.target;
    repaint();
    queueFcxNotification([
      recommendation.selected
        ? `已推荐 ${recommendation.selected} 项 PlayStyle`
        : "当前球员没有可新增的推荐 PlayStyle",
      recommendation.selected ? UINotificationType.POSITIVE : UINotificationType.NEGATIVE,
    ]);
  });
  content.querySelector(".fcx-academy-customize").addEventListener("click", () => {
    const group = currentGroup();
    const role = roleSelect.value;
    const defaults = (PLAYSTYLE_ACADEMY_CONFIG.recommendations[group] || [])
      .find((item) => item.role === role)?.playStyles || [];
    openAcademyPresetEditor(group, role, defaults);
  });
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "fcx-button fcx-button--secondary";
  clear.textContent = "清空本次修改";
  clear.addEventListener("click", () => {
    state.target = new Map(state.original);
    repaint();
  });
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "fcx-button fcx-button--primary";
  apply.textContent = "一键应用";
  apply.addEventListener("click", async () => {
    const plan = buildAcademyApplyPlan(state.original, state.target, PLAYSTYLE_ACADEMY_CONFIG);
    if (!plan.length) return;
    apply.disabled = true;
    try {
      const slotsById = new Map();
      for (const item of plan) {
        const slot = academyGetSlotById(item.slot.slotId);
        if (slot) slotsById.set(item.slot.slotId, slot);
      }
      if (!(await confirmAcademyPlan(facts, plan, slotsById))) return;
      modal.close();
      await executeAcademyPlan(facts, plan, facts.signature);
    } catch (error) {
      console.error("[FCX][EVO] 应用前检查失败", error);
      queueFcxNotification([error?.message || String(error), UINotificationType.NEGATIVE]);
    } finally {
      if (document.contains(apply)) apply.disabled = false;
    }
  });
  modal.footer.append(clear, apply);
  repaint();
};

const openAcademyPlayerEditorForItem = async (item) => {
  if (hasBlockingFcxTask()) {
    throw new Error("当前 FCX 任务尚未结束，请先结束任务后再进行DIY进化。");
  }
  const itemId = academyPlayerId(item);
  if (!itemId || !isAcademyEligiblePlayer(item, PLAYSTYLE_ACADEMY_CONFIG)) {
    throw new Error("当前球员不符合PlayStyle学院进化条件。");
  }
  if (item?.isTimeLimited?.()) {
    throw new Error("限时球员不能进行DIY进化。");
  }
  let latest = academyClubPlayerById(itemId);
  if (!latest) {
    const players = await Promise.race([
      fetchPlayers(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("读取俱乐部球员超时，请刷新后重试。")), 10000)
      ),
    ]);
    latest = players.find((player) => academyPlayerId(player) === itemId) || null;
  }
  if (!latest) {
    throw new Error("球员已不在俱乐部，请刷新球员页面后重试。");
  }
  if (!isAcademyEligiblePlayer(latest, PLAYSTYLE_ACADEMY_CONFIG) || latest?.isTimeLimited?.()) {
    throw new Error("球员状态已经变化，当前不能进行DIY进化。");
  }
  openAcademyPlayerEditor(academyPlayerFacts(latest, new Set()));
  return true;
};
