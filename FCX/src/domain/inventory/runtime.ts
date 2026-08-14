// @ts-nocheck
// FCX compatibility runtime for the EA Web App.

const readClubRepositoryPlayers = () => {
  const candidates = [];
  try {
    candidates.push(services.Item?.itemDao?.itemRepo?.club?.items);
  } catch (error) {
    console.debug("[FCX][Inventory] service club repository unavailable", error);
  }
  try {
    candidates.push(repositories.Item?.getClub?.()?.items);
  } catch (error) {
    console.debug("[FCX][Inventory] public club repository unavailable", error);
  }
  for (const collection of candidates) {
    let items = [];
    try {
      items = Array.isArray(collection)
        ? collection
        : Array.isArray(collection?._collection)
          ? collection._collection
          : collection?._collection instanceof Map
            ? [...collection._collection.values()]
            : typeof collection?.toArray === "function"
              ? collection.toArray()
              : Array.isArray(collection?.items)
                ? collection.items
                : [];
    } catch (error) {
      console.debug("[FCX][Inventory] club repository conversion failed", error);
    }
    const players = items.filter((item) => item?.id && item?.isPlayer?.());
    if (players.length) return appendUniqueInventoryItems([], players);
  }
  return [];
};

const readClubPlayerCount = async () => {
  try {
    services.Club.clubDao.resetStatsCache();
    const response = await executeFcxEaRequest(
      () => services.Club.getStats(),
      "读取俱乐部统计",
      { scope: "SBC", useSbcRequestGate: false }
    );
    const stats = response?.response?.stats
      || response?.data?.stats
      || response?.stats
      || (Array.isArray(response?.response) ? response.response : undefined);
    const playerStat = Array.isArray(stats)
      ? stats.find((entry) => String(entry?.type || "").toLowerCase() === "players")
      : undefined;
    const count = Number(playerStat?.count);
    return Number.isFinite(count) && count >= 0 ? count : -1;
  } catch (error) {
    console.info("[FCX][Inventory] club player count unavailable", {
      status: eaResponseStatus(error),
    });
    return -1;
  }
};

const scanAllClubPlayers = async ({ count = Infinity, level, rarities, sort } = {}) => {
  let offset = 0;
  const batchSize = DEFAULT_SEARCH_BATCH_SIZE;
  let result = [];
  while (true) {
    const response = await executeFcxEaRequest(
      () => searchClub({ count: batchSize, level, rarities, offset, sort }),
      `读取俱乐部球员（第 ${Math.floor(offset / batchSize) + 1} 页）`,
      {
        scope: "SBC",
        maxAttempts: 4,
        retryDelayScheduleMs: [800, 1440, 2592],
        timeoutMs: 15000,
        useSbcRequestGate: false,
      }
    );
    const page = response?.response || response?.data || {};
    const pageItems = Array.isArray(page.items) ? page.items : [];
    result = appendUniqueInventoryItems(result, pageItems);
    if (
      page.retrievedAll
      || !pageItems.length
      || result.length >= count
      || offset + batchSize >= 8000
    ) break;
    offset += batchSize;
  }
  return Number.isFinite(count) ? result.slice(0, count) : result;
};

let fetchPlayers = async ({ count = Infinity, level, rarities, sort, force = false } = {}) => {
  const personaId = getCurrentPersonaId();
  const hasScopedSearch = Boolean(level || rarities || sort || Number.isFinite(count));
  if (hasScopedSearch) {
    return scanAllClubPlayers({ count, level, rarities, sort });
  }
  const repositoryPlayers = readClubRepositoryPlayers();
  const cachedPlayers = !force && fcxInventoryCache.peek(personaId, "club", {
    liveCount: repositoryPlayers.length || undefined,
  });
  if (cachedPlayers) return cachedPlayers;
  return fcxInventoryCache.read({
    personaId,
    bucket: "club",
    force,
    liveCount: repositoryPlayers.length,
    load: async () => {
      const liveCount = await readClubPlayerCount();
      const repositoryComplete = repositoryPlayers.length > 0 && (
        liveCount <= 0 || repositoryPlayers.length >= Math.floor(liveCount * 0.9)
      );
      if (repositoryComplete) {
        console.info("[FCX][Inventory] club snapshot from EA memory", {
          personaId,
          players: repositoryPlayers.length,
          liveCount,
        });
        return { items: repositoryPlayers, liveCount: Math.max(liveCount, repositoryPlayers.length) };
      }
      console.info("[FCX][Inventory] loading complete club snapshot", {
        personaId,
        repositoryPlayers: repositoryPlayers.length,
        liveCount,
      });
      const players = await scanAllClubPlayers();
      return { items: players, liveCount: Math.max(liveCount, players.length) };
    },
  });
};

const searchClub = ({ count, level, rarities, offset, sort }) => {
  const searchCriteria = new UTBucketedItemSearchViewModel().searchCriteria;
  if (count) {
    searchCriteria.count = count;
  }
  if (level) {
    searchCriteria.level = level;
  }
  if (sort) {
    searchCriteria._sort = sort;
  }
  if (rarities) {
    searchCriteria.rarities = rarities;
  }
  if (offset) {
    searchCriteria.offset = offset;
  }
  return services.Club.search(searchCriteria);
};
// Progress bar utility functions
// Global state to track active progress bars and their positions
const createProgressBar = (id, containerId, labelText = "") => {
  // Remove existing progress bar if it exists
  let existingContainer = document.getElementById(containerId);
  if (existingContainer) {
    existingContainer.parentNode.removeChild(existingContainer);
    // Remove from active bars list
    const index = runtimeState.activeProgressBars.findIndex(
      (item) => item.id === containerId
    );
    if (index !== -1) {
      runtimeState.activeProgressBars.splice(index, 1);
    }
  }

  const progressBarContainer = document.createElement("div");
  progressBarContainer.id = containerId;
  progressBarContainer.style.position = "fixed";
  progressBarContainer.style.bottom = "10px";
  progressBarContainer.style.right = "130px";
  progressBarContainer.style.width = "300px";
  progressBarContainer.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
  progressBarContainer.style.borderRadius = "2px";
  progressBarContainer.style.zIndex = "9999";
  progressBarContainer.style.transition = "bottom 0.3s ease-in-out";

  // Create label element if label text is provided
  if (labelText) {
    const label = document.createElement("div");
    label.id = `${id}-label`;
    label.textContent = labelText;
    label.style.position = "absolute";
    label.style.top = "-20px";
    label.style.left = "0";
    label.style.width = "100%";
    label.style.color = "#ffffff";
    label.style.textAlign = "center";
    label.style.fontSize = "12px";
    progressBarContainer.appendChild(label);
  }

  // Add a container for the progress bar itself
  const progressBarWrapper = document.createElement("div");
  progressBarWrapper.style.height = "15px";
  progressBarWrapper.style.width = "100%";
  progressBarWrapper.style.position = "relative";
  progressBarWrapper.style.overflow = "hidden";
  progressBarContainer.appendChild(progressBarWrapper);

  const progressBar = document.createElement("div");
  progressBar.id = id;
  progressBar.style.height = "100%";
  progressBar.style.width = "0%";
  progressBar.style.backgroundColor = "#07f468";
  progressBar.style.borderRadius = "2px";
  progressBar.style.transition = "width 0.3s ease-in-out";

  progressBarWrapper.appendChild(progressBar);
  document.body.appendChild(progressBarContainer);

  // Calculate position based on existing progress bars
  const offset = 35; // Height of bar + margin
  const bottomPosition = 10 + runtimeState.activeProgressBars.length * offset;
  progressBarContainer.style.bottom = `${bottomPosition}px`;

  // Add to active progress bars list
  runtimeState.activeProgressBars.push({
    id: containerId,
    element: progressBarContainer,
    position: runtimeState.activeProgressBars.length,
  });

  return progressBarContainer;
};

const removeProgressBar = (containerId, delay = 2000) => {
  setTimeout(() => {
    const progressBarContainer = document.getElementById(containerId);
    if (progressBarContainer) {
      progressBarContainer.style.opacity = "0";
      progressBarContainer.style.transition = "opacity 0.5s ease-in-out";

      setTimeout(() => {
        if (progressBarContainer && progressBarContainer.parentNode) {
          // Remove from active bars list
          const index = runtimeState.activeProgressBars.findIndex(
            (item) => item.id === containerId
          );
          if (index !== -1) {
            runtimeState.activeProgressBars.splice(index, 1);
          }

          progressBarContainer.parentNode.removeChild(progressBarContainer);

          // Reposition remaining progress bars
          runtimeState.activeProgressBars.forEach((item, idx) => {
            const bottomPosition = 10 + idx * 25;
            item.element.style.bottom = `${bottomPosition}px`;
            item.position = idx;
          });
        }
      }, 500);
    }
  }, delay);
};

const updateProgressBar = (progressBarId, progress) => {
  const progressBar = document.getElementById(progressBarId);
  if (progressBar) {
    progressBar.style.width = `${Math.min(100, progress)}%`;
  }
};

// Add a flag to track if concept players are currently being fetched
let getConceptPlayers = async function (playerCount = 999999) {
  // If already fetching concepts, return the current conceptPlayers array
  if (runtimeState.conceptPlayerFetchInProgress || runtimeState.conceptPlayersCollected) {
    console.log("Already fetching concept players or already collected.");

    return runtimeState.conceptPlayers;
  }

  return new Promise((resolve, reject) => {
    runtimeState.conceptPlayerFetchInProgress = true;
    console.log("Getting Concept Players");
    const gatheredPlayers = [];
    const searchCriteria = new UTBucketedItemSearchViewModel().searchCriteria;
    searchCriteria.offset = 0;
    searchCriteria.sortBy = SearchSortType.RECENCY;
    searchCriteria.count = DEFAULT_SEARCH_BATCH_SIZE;

    // Create progress bar using the extracted utility function
    const containerId = "concept-progress-container";
    const progressBarId = "concept-progress-bar";
    createProgressBar(progressBarId, containerId, "Fetching Concepts");

    // Start with 0% progress
    updateProgressBar(progressBarId, 0);

    // Estimate total players to be around 20000 for progress calculation
    // Try to get saved total from localStorage first
    const savedEstimatedTotal = localStorage.getItem("conceptPlayerTotal");
    const estimatedTotal = savedEstimatedTotal
      ? parseInt(savedEstimatedTotal)
      : 20000;

    // Update the total once we have more data
    const updateTotal = (newTotal) => {
      if (newTotal > 1000) {
        // Only save if it seems like a reasonable count
        localStorage.setItem("conceptPlayerTotal", newTotal);
        console.log(`Updated concept player count to ${newTotal}`);
      }
    };

    const getAllConceptPlayers = async () => {
      try {
        const response = await executeFcxEaRequest(
          () => searchConceptPlayers(searchCriteria),
          `读取概念球员（偏移 ${searchCriteria.offset}）`,
          { scope: "SBC", useSbcRequestGate: false }
        );
          gatheredPlayers.push(...response.response.items);

          // Update progress based on current offset
          const progress = (searchCriteria.offset / estimatedTotal) * 100;
          updateProgressBar(progressBarId, progress);

          if (
            response.status !== 400 &&
            !response.response.endOfList &&
            searchCriteria.offset <= playerCount
          ) {
            searchCriteria.offset += searchCriteria.count;

            await getAllConceptPlayers();
          } else {
            if (playerCount > 1) {
              runtimeState.conceptPlayersCollected = true;
              showNotification(
                "Collected All Concept Players",
                UINotificationType.POSITIVE
              );
            }
            // Set progress to 100% when complete
            updateProgressBar(progressBarId, 100);
            // Remove progress bar after a delay
            removeProgressBar(containerId);
            // Reset the flag when done
            runtimeState.conceptPlayerFetchInProgress = false;
            console.table(gatheredPlayers.slice(0, 10));
            resolve(gatheredPlayers);
          }
      } catch (error) {
        if (Number(error?.status) === 400) {
          runtimeState.conceptPlayersCollected = playerCount > 1;
          updateProgressBar(progressBarId, 100);
          removeProgressBar(containerId);
          runtimeState.conceptPlayerFetchInProgress = false;
          resolve(gatheredPlayers);
          return;
        }
        runtimeState.conceptPlayerFetchInProgress = false;
        removeProgressBar(containerId, 0);
        reject(error);
      }
    };
    void getAllConceptPlayers();
  });
};
const searchConceptPlayers = (searchCriteria) => {
  return services.Item.searchConceptItems(searchCriteria);
};
let getStoragePlayers = async function ({ force = false } = {}) {
  const personaId = getCurrentPersonaId();
  const cachedPlayers = !force && fcxInventoryCache.peek(personaId, "storage");
  if (cachedPlayers) return cachedPlayers;
  return fcxInventoryCache.read({
    personaId,
    bucket: "storage",
    force,
    load: async () => {
  const gatheredPlayers = [];
  const searchCriteria = new UTBucketedItemSearchViewModel().searchCriteria;
  searchCriteria.offset = 0;
  searchCriteria.count = DEFAULT_SEARCH_BATCH_SIZE;
  while (true) {
    let response;
    try {
      response = await executeFcxEaRequest(
        () => searchStoragePlayers(searchCriteria),
        `读取SBC仓库球员（偏移 ${searchCriteria.offset}）`,
        { scope: "SBC", useSbcRequestGate: false }
      );
    } catch (error) {
      if (Number(error?.status) === 400) break;
      throw error;
    }
    const page = response?.response || response?.data || {};
    gatheredPlayers.push(...(page.items || []));
    if (page.endOfList || !page.items?.length) break;
    searchCriteria.offset += searchCriteria.count;
  }
      return { items: appendUniqueInventoryItems([], gatheredPlayers), liveCount: gatheredPlayers.length };
    },
  });
};
const searchStoragePlayers = (searchCriteria) => {
  return services.Item.searchStorageItems(searchCriteria);
};

const getRepositoryItems = (pileName) => {
  const repository = repositories.Item;
  if (pileName === "storage") {
    return repository.getStorageItems?.() || repository.storage?.items || [];
  }
  return (
    repository.getTransferItems?.() ||
    repository.transfer?.items ||
    repository.transferList?.items ||
    []
  );
};

const resolveInventoryBucket = (item) => {
  const pile = Number(item?.pile);
  if (pile === Number(ItemPile.STORAGE ?? ItemPile.SBC_STORAGE ?? 10)) return "storage";
  if (pile === Number(ItemPile.CLUB ?? 7)) return "club";
  return undefined;
};

let inventoryRepositoryHooksInstalled = false;
const installInventorySnapshotHooks = () => {
  if (inventoryRepositoryHooksInstalled) return;
  const repository = repositories.Item;
  if (!repository) return;
  const wrap = (methodName, handler) => {
    const original = repository[methodName];
    if (typeof original !== "function" || original.__fcxInventorySnapshotHook) return;
    const wrapped = function (item, ...args) {
      const result = original.call(this, item, ...args);
      try {
        handler(item);
      } catch (error) {
        console.debug("[FCX][Inventory] repository snapshot update failed", {
          methodName,
          error,
        });
      }
      return result;
    };
    wrapped.__fcxInventorySnapshotHook = true;
    repository[methodName] = wrapped;
  };
  wrap("addItem", (item) => {
    const bucket = resolveInventoryBucket(item);
    if (bucket) fcxInventoryCache.upsert(getCurrentPersonaId(), bucket, item);
  });
  wrap("removeItem", (item) => {
    if (item?.id) fcxInventoryCache.remove(getCurrentPersonaId(), [Number(item.id)]);
  });
  wrap("updateItem", (item) => {
    const bucket = resolveInventoryBucket(item);
    if (bucket) fcxInventoryCache.upsert(getCurrentPersonaId(), bucket, item);
    else fcxInventoryCache.updateExisting(getCurrentPersonaId(), item);
  });
  inventoryRepositoryHooksInstalled = true;
};

const invalidateInventorySnapshot = (bucket = undefined) => {
  fcxInventoryCache.invalidate(getCurrentPersonaId(), bucket);
};

const removeSubmittedPlayersFromInventorySnapshot = (players) => {
  fcxInventoryCache.remove(
    getCurrentPersonaId(),
    (players || []).map((player) => Number(player?.id)).filter((id) => id > 0)
  );
};

const syncMovedItemsToInventorySnapshot = (items, pile) => {
  const target = Number(pile);
  const bucket = target === Number(ItemPile.STORAGE ?? ItemPile.SBC_STORAGE ?? 10)
    ? "storage"
    : target === Number(ItemPile.CLUB ?? 7)
      ? "club"
      : undefined;
  if (!bucket) return;
  const personaId = getCurrentPersonaId();
  for (const item of items || []) fcxInventoryCache.upsert(personaId, bucket, item);
};

const getAvailablePileSlots = (pileName) => {
  const pile =
    pileName === "storage"
      ? ItemPile.STORAGE ?? ItemPile.SBC_STORAGE ?? 10
      : ItemPile.TRANSFER ?? ItemPile.TRANSFER_LIST ?? 8;
  const fallbackCapacity = pileName === "storage" ? 100 : 100;
  const capacity = repositories.Item.getPileSize?.(pile) ?? fallbackCapacity;
  return Math.max(0, capacity - getRepositoryItems(pileName).length);
};

const moveItemsAndWait = async (items, pile, label) => {
  if (!items.length) return;
  const itemIds = items.map((item) => Number(item?.id)).filter(Number.isFinite);
  await executeFcxEaRequest(
    () => services.Item.move(items, pile),
    label,
    {
      scope: "Pack",
      verifyAfterFailure: () => verifyItemsLeftUnassigned(itemIds),
    }
  );
  syncMovedItemsToInventorySnapshot(items, pile);
};

const discardItemsAndWait = async (items) => {
  if (!items.length) return;
  const itemIds = items.map((item) => Number(item?.id)).filter(Number.isFinite);
  await executeFcxEaRequest(
    () => services.Item.discard(items),
    "快速出售未分配物品",
    {
      scope: "Pack",
      verifyAfterFailure: () => verifyItemsLeftUnassigned(itemIds),
    }
  );
  removeSubmittedPlayersFromInventorySnapshot(items);
};

const redeemItemsAndWait = async (items) => {
  for (const item of items) {
    const itemIds = [Number(item?.id)].filter(Number.isFinite);
    await executeFcxEaRequest(
      () => services.Item.redeem(item),
      "领取未分配奖励",
      {
        scope: "Pack",
        verifyAfterFailure: () => verifyItemsLeftUnassigned(itemIds),
      }
    );
  }
};

const verifyItemsLeftUnassigned = async (itemIds) => {
  if (!itemIds.length) return { state: "unknown", reason: "无法识别待处理物品实例" };
  try {
    const response = await executeFcxEaRequest(
      () => services.Item.requestUnassignedItems(),
      "核验未分配物品状态",
      { scope: "Pack", ignoreCancellation: true }
    );
    const currentIds = new Set(
      (response?.response?.items || []).map((item) => Number(item?.id))
    );
    const remaining = itemIds.filter((id) => currentIds.has(id)).length;
    if (remaining === 0) return { state: "applied", value: { success: true, status: 200 } };
    if (remaining === itemIds.length) return { state: "not_applied" };
    return { state: "unknown", reason: "部分物品状态已变化，为避免重复操作未自动重试" };
  } catch (error) {
    return { state: "unknown", reason: `物品状态核验失败：${error?.message || error}` };
  }
};

const routeUnassignedItems = async (options, taskSummary = undefined) => {
  const emptyResult = {
    movedToClub: 0,
    movedToStorage: 0,
    movedToTransferList: 0,
    discarded: 0,
    redeemed: 0,
    playerPicks: 0,
    remaining: 0,
    remainingItems: [],
    blockedStorage: 0,
    blockedTransfer: 0,
    blockedOther: 0,
    stopped: false,
  };
  try {
    const unassigned = await fetchUnassigned(options);
    if (!unassigned.length) return emptyResult;

    const plan = planUnassignedRoutes(
      unassigned,
      (item) => ({
        playerPick: Boolean(item.isPlayerPickItem?.()),
        misc: Boolean(item.isFreeCoins?.()),
        movable: Boolean(item.isMovable?.()),
        player: Boolean(item.isPlayer?.()),
        duplicate:
          Number(item.duplicateId || 0) > 0 ||
          (Boolean(item.isPlayer?.()) &&
            !Boolean(item.isMovable?.()) &&
            Boolean(item.isStorable?.())),
        untradeable: Boolean(item.untradeable || !item.isTradeable?.()),
        rating: Number(item.rating || 0),
      }),
      options,
      {
        storage: getAvailablePileSlots("storage"),
        transferList: getAvailablePileSlots("transfer"),
      }
    );

    if (taskSummary) {
      for (const item of plan.club) {
        setPlayerDestination(taskSummary, Number(item.id), "club", Number(item.definitionId));
      }
      for (const item of plan.storage) {
        setPlayerDestination(taskSummary, Number(item.id), "storage", Number(item.definitionId));
      }
      for (const item of plan.transferList) {
        setPlayerDestination(taskSummary, Number(item.id), "transfer", Number(item.definitionId));
      }
      for (const item of plan.discard) {
        setPlayerDestination(taskSummary, Number(item.id), "sold", Number(item.definitionId));
      }
      for (const item of plan.blocked) {
        setPlayerDestination(taskSummary, Number(item.id), "remaining", Number(item.definitionId));
      }
    }

    await redeemItemsAndWait(plan.redeem);
    await moveItemsAndWait(
      plan.club,
      ItemPile.CLUB ?? 7,
      "将物品移动到俱乐部"
    );
    await moveItemsAndWait(
      plan.storage,
      ItemPile.STORAGE ?? ItemPile.SBC_STORAGE ?? 10,
      "将重复球员移动到SBC仓库"
    );
    await moveItemsAndWait(
      plan.transferList,
      ItemPile.TRANSFER ?? ItemPile.TRANSFER_LIST ?? 8,
      "将可交易重复球员移动到转会列表"
    );
    await discardItemsAndWait(plan.discard);

    const remainingItems = await fetchUnassigned(options);
    const stopped = plan.blocked.length > 0;
    const stopCode = plan.blockedTransfer.length
      ? "transfer_full"
      : plan.blockedOther.length
        ? "blocked"
        : plan.blockedStorage.length
          ? "storage_full"
          : undefined;
    const reason =
      stopCode === "storage_full"
        ? "SBC仓库已满，不可交易重复球员暂时保留在未分配。"
        : stopCode === "transfer_full"
          ? "转会列表已满，可交易重复球员暂时保留在未分配。"
          : stopCode === "blocked"
            ? "存在无法自动分配的物品，已保留在未分配。"
            : undefined;
    await ratingCountUI();
    return {
      movedToClub: plan.club.length,
      movedToStorage: plan.storage.length,
      movedToTransferList: plan.transferList.length,
      discarded: plan.discard.length,
      redeemed: plan.redeem.length,
      playerPicks: plan.playerPicks.length,
      remaining: remainingItems.length,
      remainingItems,
      blockedStorage: plan.blockedStorage.length,
      blockedTransfer: plan.blockedTransfer.length,
      blockedOther: plan.blockedOther.length,
      stopped,
      stopCode,
      reason,
    };
  } catch (error) {
    console.error("Error routing unassigned items:", error);
    let remainingItems = [];
    try {
      remainingItems = await fetchUnassigned(options);
    } catch (_fetchError) {
      // Preserve the original routing failure as the primary error.
    }
    return {
      ...emptyResult,
      remaining: remainingItems.length,
      remainingItems,
      stopCode: "routing_failed",
      stopped: true,
      reason: `未分配物品处理失败：${error?.message || error}`,
    };
  }
};

let dealWithUnassigned = async (options = readPackRunOptions()) => {
  const result = await routeUnassignedItems(options);
  if (result.stopped && result.reason) {
    queueFcxNotification([result.reason, UINotificationType.NEGATIVE]);
  }
  return result.remainingItems;
};
let fetchUnassigned = async (priceOptions = {}) => {
  repositories.Item.unassigned.clear();
  repositories.Item.unassigned.reset();
  const response = await executeFcxEaRequest(
    () => services.Item.requestUnassignedItems(),
    "读取未分配物品",
    { scope: "Pack", timeoutMs: PLAYER_PICK_UNASSIGNED_TIMEOUT_MS }
  );
  return [...(response?.response?.items || [])];
};
let fetchDuplicateIds = () => {
  repositories.Store.setDirty();
  return executeFcxEaRequest(
    () => services.Item.requestUnassignedItems(),
    "读取重复球员",
    { scope: "Pack" }
  ).then((response) =>
    (response?.response?.items || [])
      .filter((item) => item.duplicateId > 0)
      .map((duplicate) => duplicate.duplicateId)
  );
};
let playerProtectionStore = null;
let playerProtectionPersonaId = null;
let submissionCounter = null;
let submissionCounterPersonaId = null;

const getCurrentPersonaId = ({ required = false } = {}) => {
  try {
    const user = services.User.getUser();
    const persona = user?.getSelectedPersona?.();
    const personaId = persona?.id ?? persona?.personaId ?? persona?._id;
    if (personaId !== undefined && personaId !== null && String(personaId).trim()) {
      return String(personaId);
    }
  } catch (error) {
    if (required) {
      throw new Error(`无法确认当前 EA 账号身份：${error?.message || error}`);
    }
  }
  if (required) {
    throw new Error("无法确认当前 EA 账号身份，本次未应用或提交阵容。");
  }
  return "default";
};

const getPlayerProtectionStore = () => {
  const personaId = getCurrentPersonaId();
  if (!playerProtectionStore || playerProtectionPersonaId !== personaId) {
    playerProtectionStore = new PlayerProtectionStore(localStorage, personaId);
    playerProtectionPersonaId = personaId;
  }
  return playerProtectionStore;
};

const getSubmissionCounter = () => {
  const personaId = getCurrentPersonaId();
  if (!submissionCounter || submissionCounterPersonaId !== personaId) {
    submissionCounter = new SubmissionCounter(localStorage, personaId);
    submissionCounterPersonaId = personaId;
  }
  return submissionCounter;
};

const getSubmissionLimits = () => ({
  hour: Math.max(1, Number(getSettings(0, 0, "submitHourLimit")) || 90),
  day: Math.max(1, Number(getSettings(0, 0, "submitDayLimit")) || 300),
});

const getSubmissionSnapshot = () => {
  const limits = getSubmissionLimits();
  return getSubmissionCounter().snapshot(limits.hour, limits.day);
};

const observeSubmissionCount = (count = 1) => {
  const snapshot = getSubmissionSnapshot();
  const requested = Math.max(1, Math.trunc(Number(count) || 1));
  if (
    snapshot.hour + requested > snapshot.hourLimit
    || snapshot.day + requested > snapshot.dayLimit
  ) {
    console.warn("[FCX][Submission] 提交次数已达到统计提醒值，本次继续执行", {
      requested,
      hour: snapshot.hour,
      hourReference: snapshot.hourLimit,
      day: snapshot.day,
      dayReference: snapshot.dayLimit,
      blocking: false,
    });
  }
  return snapshot;
};

const recordSuccessfulSubmission = () => {
  getSubmissionCounter().record();
  document.dispatchEvent(new CustomEvent("fcx:submission-count-changed"));
};

const getPlayerName = (item) =>
  item?._staticData?.commonName ||
  item?._staticData?.name ||
  item?._staticData?.lastName ||
  item?.name ||
  `球员 ${item?.definitionId || ""}`;

const createLockedPlayerRecord = (item) => ({
  definitionId: Number(item.definitionId),
  name: getPlayerName(item),
  rating: Number(item.rating || item?._staticData?.rating || 0),
  rarity: services.Localization?.localize?.("item.raretype" + item.rareflag) ||
    String(item.rareflag || "未知"),
  evolution: isEvolutionPlayer(item),
});

const initializePlayerProtection = () => getPlayerProtectionStore();

let isItemLocked = function (item) {
  return getPlayerProtectionStore().has(item?.definitionId);
};
let lockItem = function (item) {
  if (!item?.definitionId) return;
  getPlayerProtectionStore().lock(createLockedPlayerRecord(item));
};
let unlockItem = function (item) {
  getPlayerProtectionStore().unlock(item?.definitionId);
};
let getLockedItems = function () {
  return getPlayerProtectionStore().ids();
};
let lockedItemsCleanup = function () {
  // Intentionally retain locks for players that temporarily leave the club.
};
let saveLockedItems = function () {
  // PlayerProtectionStore persists each mutation immediately.
};

const getPlayerProtectionSettings = () =>
  getPlayerProtectionStore().getSettings();

const savePlayerProtectionSettings = (settings) => {
  getPlayerProtectionStore().setSettings(settings);
};

let activeSquadProtectionReadFailed = false;

const activeSquadReadError = (message) => {
  activeSquadProtectionReadFailed = true;
  return new Error(`${message}，本次未应用或提交阵容。`);
};

const loadActiveSquadItemIds = async () => {
  try {
    const user = services.User?.getUser?.();
    let selectedPersonaFromGetter;
    try {
      selectedPersonaFromGetter = user?.getSelectedPersona?.();
    } catch (error) {
      console.info("[FCX][Protection] getSelectedPersona 读取失败，将尝试兼容字段", {
        errorType: error?.constructor?.name || typeof error,
      });
    }
    const personaCandidates = [...new Set([
      user?.selectedPersona,
      selectedPersonaFromGetter,
    ].filter((value) => value !== undefined && value !== null))];

    const activeSquadValue = services.Squad?.activeSquad;
    let activeSquadIdFromGetter;
    let getterError;
    try {
      activeSquadIdFromGetter = services.Squad?.getActiveSquadId?.();
    } catch (error) {
      getterError = error;
    }

    // Preserve the exact repository lookup that earlier FCX builds and the
    // original script used. EA may expose an opaque string/object key here,
    // so do not coerce it before asking the repository.
    const legacySquadKeys = [...new Set([
      activeSquadValue,
      activeSquadIdFromGetter,
    ].filter((value) =>
      value !== undefined &&
      value !== null &&
      !(typeof value === "string" && !value.trim())
    ))];
    for (const legacySquadKey of legacySquadKeys) {
      for (const personaCandidate of personaCandidates) {
        const personaSquads = repositories.Squad?.squads?.get?.(personaCandidate);
        const repositorySquad = personaSquads?.get?.(legacySquadKey);
        const repositoryIds = extractActiveSquadEntityItemIds(repositorySquad);
        if (!repositoryIds.length) continue;
        activeSquadProtectionReadFailed = false;
        console.info("[FCX][Protection] 当前激活阵容读取完成", {
          source: "repository.legacyRawKey",
          keyType: typeof legacySquadKey,
          personaId: getCurrentPersonaId({ required: true }),
          count: repositoryIds.length,
        });
        return repositoryIds;
      }
    }

    const activeSquadCandidates = resolveActiveSquadIdCandidates(
      activeSquadValue,
      activeSquadIdFromGetter
    );
    console.info("[FCX][Protection] 当前激活阵容 ID 兼容解析", {
      activeSquad: {
        valueType: activeSquadValue === null ? "null" : typeof activeSquadValue,
        valid: activeSquadCandidates.some((candidate) => candidate.source === "activeSquad"),
      },
      getActiveSquadId: {
        valueType: activeSquadIdFromGetter === null ? "null" : typeof activeSquadIdFromGetter,
        valid: activeSquadCandidates.some((candidate) => candidate.source === "getActiveSquadId"),
        threw: Boolean(getterError),
      },
      candidates: activeSquadCandidates.map((candidate) => ({
        id: candidate.id,
        source: candidate.source,
      })),
    });
    if (!activeSquadCandidates.length) {
      throw activeSquadReadError("未读取到当前激活阵容 ID");
    }

    const readResult = await readActiveSquadItemIdsFromCandidates(
      activeSquadCandidates,
      {
        repository: (activeSquadId) => {
          for (const personaCandidate of personaCandidates) {
            const personaSquads = repositories.Squad?.squads?.get?.(personaCandidate);
            const repositorySquad = personaSquads?.get?.(activeSquadId);
            if (repositorySquad) return repositorySquad;
          }
          return undefined;
        },
        request: async (activeSquadId) => {
          const response = await executeFcxEaRequest(
            () => services.Squad?.requestSquadById?.(activeSquadId),
            "读取当前激活阵容",
            { scope: "SBC", useSbcRequestGate: false }
          );
          return resolveActiveSquadEntity(response);
        },
      }
    );
    console.info("[FCX][Protection] 当前激活阵容读取路径", {
      attempts: readResult.attempts,
    });
    if (readResult.ids.length) {
      activeSquadProtectionReadFailed = false;
      console.info("[FCX][Protection] 当前激活阵容读取完成", {
        source: readResult.dataSource,
        idSource: readResult.idSource,
        personaId: getCurrentPersonaId({ required: true }),
        activeSquadId: readResult.activeSquadId,
        count: readResult.ids.length,
      });
      return readResult.ids;
    }

    throw activeSquadReadError("当前激活阵容没有读取到有效球员");
  } catch (error) {
    activeSquadProtectionReadFailed = true;
    console.warn("[FCX][Protection] 当前激活阵容读取失败，任务将停止", error);
    throw error instanceof Error
      ? error
      : activeSquadReadError("当前激活阵容读取失败");
  }
};

const getActiveSquadProtectedIds = async ({ required = false } = {}) => {
  try {
    const ids = await loadActiveSquadItemIds();
    if (activeSquadProtectionReadFailed || !ids.length) {
      throw activeSquadReadError("当前激活阵容读取失败");
    }
    return new Set(ids);
  } catch (error) {
    if (required) throw error;
    return new Set();
  }
};

const capturePlayerProtectionSnapshot = async () => {
  const personaId = getCurrentPersonaId({ required: true });
  const store = getPlayerProtectionStore();
  const settings = store.getSettings();
  const activeSquadItemIds = settings.protectActiveSquad
    ? await getActiveSquadProtectedIds({ required: true })
    : new Set();
  const snapshot = {
    personaId,
    lockedDefinitionIds: new Set(store.ids().map(Number)),
    activeSquadItemIds,
    protectEvolutions: settings.protectEvolutions !== false,
    protectActiveSquad: settings.protectActiveSquad !== false,
  };
  console.info("[FCX][Protection] 保护快照已建立", {
    personaId,
    lockedDefinitions: snapshot.lockedDefinitionIds.size,
    activeSquadItems: snapshot.activeSquadItemIds.size,
    protectEvolutions: snapshot.protectEvolutions,
    protectActiveSquad: snapshot.protectActiveSquad,
  });
  return snapshot;
};

const assertPlayerProtection = async (players, stage) => {
  const activeSnapshot = await capturePlayerProtectionSnapshot();
  const violations = findProtectedPlayerViolations(
    players.filter(Boolean),
    activeSnapshot
  );
  if (!violations.length) return activeSnapshot;
  const reasonLabels = {
    manualLock: "手动锁定",
    activeSquad: "当前激活阵容",
    evolution: "进化球员",
  };
  const details = violations.slice(0, 5).map(({ player, reasons }) =>
    `${getPlayerName(player)}（${reasons.map((reason) => reasonLabels[reason]).join("、")}）`
  );
  console.error("[FCX][Protection] 已拦截受保护球员", {
    stage,
    personaId: activeSnapshot.personaId,
    count: violations.length,
    players: violations.map(({ player, reasons }) => ({
      id: Number(player.id),
      definitionId: Number(player.definitionId),
      reasons,
    })),
  });
  throw new Error(
    `球员保护校验失败（${stage}）：${details.join("；")}。本次未应用或提交阵容。`
  );
};

const didActiveSquadProtectionReadFail = () =>
  activeSquadProtectionReadFailed;

let FIXED_ITEMS_KEY = "fixeditems";
let isItemFixed = function (item) {
  let fixedItems = getFixedItems();
  return fixedItems.includes(item.id);
};
let fixItem = function (item) {
  let fixedItems = getFixedItems();
  fixedItems.push(item.id);
  saveFixedItems();
};
let unfixItem = function (item) {
  let fixedItems = getFixedItems();

  if (fixedItems.includes(item.id)) {
    const index = fixedItems.indexOf(item.id);
    if (index > -1) {
      fixedItems.splice(index, 1);
    }
  }
  saveFixedItems();
};
let getFixedItems = function () {
  if (runtimeState.cachedFixedItems) {
    return runtimeState.cachedFixedItems;
  }
  runtimeState.cachedFixedItems = [];
  let fixedItems = localStorage.getItem(FIXED_ITEMS_KEY);
  if (fixedItems) {
    runtimeState.cachedFixedItems = JSON.parse(fixedItems);
  }
  return runtimeState.cachedFixedItems;
};
let fixedItemsCleanup = function (clubPlayerIds) {
  let fixedItems = getFixedItems();
  for (let _i = 0, _a = Array.from(fixedItems); _i < _a.length; _i++) {
    let fixedItem = _a[_i];
    if (!clubPlayerIds[fixedItem]) {
      const index = fixedItems.indexOf(fixedItem);
      if (index > -1) {
        fixedItems.splice(index, 1);
      }
    }
  }
  saveFixedItems();
};
let saveFixedItems = function () {
  localStorage.setItem(FIXED_ITEMS_KEY, JSON.stringify(runtimeState.cachedFixedItems));
};


