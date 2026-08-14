// @ts-nocheck
// FCX compatibility runtime for the EA Web App.

const getPriceDiv = async (item) => {
  if (runtimeState.activeSbcExecution?.options?.ignoreValue === true) {
    return null;
  }
  if (getSettings(0, 0, "showPrices") && item.definitionId > 0) {
    let PriceItems = getPriceItems();
    if (!PriceItems[item.definitionId]) {
      return null;
    }
    let price = getPrice(item) * (isItemFixed(item) ? 0 : 1);
    if (
      !(item.definitionId in PriceItems) ||
      !("isSbc" in PriceItems[item.definitionId])
    ) {
    }

    let symbol = PriceItems[item.definitionId]?.isSbc
      ? "currency-sbc"
      : PriceItems[item.definitionId]?.isObjective
      ? "currency-objective"
      : "currency-coins";
    const priceElement = document.createElement("div");
    priceElement.className = `${symbol} item-price`;

    if (isLowCostMarketCard(item)) {
      priceElement.style.border = "1px solid red"; // Highlight low-cost market cards.
      priceElement.style.color = "#ff0000"; // Change text color to red as well
    }
    priceElement.textContent = PriceItems[item.definitionId]?.isExtinct
      ? "EXTINCT"
      : PriceItems[item.definitionId]?.isObjective
      ? ""
      : price.toLocaleString();

    return priceElement;
  }
  return null;
};
let PRICE_ITEMS_KEY = "futggPrices";
let isPriceOld = function (item) {
  let PriceItems = getPriceItems();
  if (!(item?.definitionId in PriceItems)) {
    return true;
  }
  const configuredCacheMinutes = Number(
    getSettings(0, 0, "priceCacheMinutes")
  );
  const cacheMinutes =
    Number.isFinite(configuredCacheMinutes) && configuredCacheMinutes > 0
      ? configuredCacheMinutes
      : 1440;
  return isCachedPriceOld(
    PriceItems[item.definitionId],
    cacheMinutes,
    new Date()
  );
};
let getPrice = function (item) {
  if (runtimeState.activeSbcExecution?.options?.ignoreValue === true) {
    return null;
  }
  let PriceItems = getPriceItems();

  if (!(item.definitionId in PriceItems)) {
    return null;
  }

  return PriceItems[item.definitionId]?.price;

  //console.log(PriceItems[item.definitionId])
  let cacheMin = item.concept ? 1440 : getSettings(0, 0, "priceCacheMinutes");
  let timeStamp = new Date(PriceItems[item.definitionId]?.timeStamp);

  let now = new Date(Date.now());

  if (
    PriceItems[item.definitionId] &&
    PriceItems[item.definitionId]?.timeStamp &&
    cacheDate < now
  ) {
    //console.log('Cache is old',PriceItems[item.definitionId],item)
    return null;
  }
  let fbPrice = PriceItems[item.definitionId]?.price;
  return fbPrice;
};

// Function to update minimum prices for CBR (Common Base Rating)
const updateCBRMinPrice = () => {
  const PriceItems = getPriceItems();
  if (!PriceItems) return {};
  updateRatingReferencePrices(PriceItems);
  runtimeState.cachedPriceItems = PriceItems;
  return runtimeState.cachedPriceItems;
};
let PriceItem = function (items) {
  //  console.log(item, price, lastUpdated)

  runtimeState.cachedPriceItems = getPriceItems();
  let timeStamp = new Date(Date.now());
  const normalizedItems = {};
  for (let key in items) {
    items[key]["timeStamp"] = items[key]["timeStamp"] || timeStamp;
    normalizedItems[items[key]["eaId"]] = items[key];
  }
  runtimeState.cachedPriceItems = mergePriceRecordMaps(
    runtimeState.cachedPriceItems,
    normalizedItems
  );
  updateCBRMinPrice();
};

const ensurePriceItemsLoaded = async () => {
  if (runtimeState.priceItemsHydrated) {
    return runtimeState.cachedPriceItems || {};
  }
  if (!runtimeState.priceItemsLoadPromise) {
    const immediateItems = runtimeState.cachedPriceItems ||
      readFallbackPriceRecords(localStorage);
    runtimeState.cachedPriceItems = immediateItems;
    runtimeState.priceItemsLoadPromise = loadPriceRecords(
      window.indexedDB,
      localStorage
    )
      .then((persistedItems) => {
        runtimeState.cachedPriceItems = mergePriceRecordMaps(
          persistedItems,
          runtimeState.cachedPriceItems || {}
        );
        runtimeState.priceItemsHydrated = true;
        appendPriceDiagnosticEvent(runtimeState.priceDiagnosticEvents, {
          stage: "cache",
          status: "success",
          message: `已静默合并 ${Object.keys(runtimeState.cachedPriceItems).length} 条本地缓存`,
        });
        return runtimeState.cachedPriceItems;
      })
      .catch((error) => {
        console.error("Error loading persisted prices:", error);
        runtimeState.priceItemsHydrated = true;
        return runtimeState.cachedPriceItems || {};
      });
  }
  return runtimeState.priceItemsLoadPromise;
};

let getPriceItems = function () {
  if (!runtimeState.cachedPriceItems) {
    runtimeState.cachedPriceItems = readFallbackPriceRecords(localStorage);
  }
  if (!runtimeState.priceItemsHydrated && !runtimeState.priceItemsLoadPromise) {
    void ensurePriceItemsLoaded();
  }
  return runtimeState.cachedPriceItems;
};

let isLowCostMarketCard = function (item) {
  if (runtimeState.activeSbcExecution?.options?.ignoreValue === true) {
    return false;
  }
  let PriceItems = getPriceItems();
  if (
    PriceItems[item.definitionId]?.isExtinct ||
    PriceItems[item.definitionId]?.isObjective
  ) {
    return false;
  }
  let price = getPrice(item);
  let ratingPriceThreshold = Math.max(
    getPrice({ definitionId: item.rating + "_CBR" }),
    item?._itemPriceLimits?.minimum || 0
  );
  // console.table(item.rating, price, ratingPriceThreshold)
  if (price <= ratingPriceThreshold * 1.1) {
    return true;
  }
  return false;
};

let savePriceItems = async function () {
  try {
    await ensurePriceItemsLoaded();
    const persistence = await savePriceRecords(
      runtimeState.cachedPriceItems || {},
      window.indexedDB,
      localStorage
    );
    runtimeState.lastPricePersistenceResult = persistence;
    appendPriceDiagnosticEvent(runtimeState.priceDiagnosticEvents, {
      stage: "persistence",
      status: persistence.success ? "success" : "error",
      message: persistence.success
        ? `缓存已保存并回读校验，共 ${persistence.expectedCount} 条`
        : "IndexedDB 与 localStorage 均未通过回读校验",
    });
    console.log("[FCX][Price] Price persistence result", persistence);
    return persistence;
  } catch (error) {
    const message = `价格缓存保存失败，继续使用内存缓存：${error?.message || error}`;
    appendPriceDiagnosticEvent(runtimeState.priceDiagnosticEvents, {
      stage: "persistence",
      status: "error",
      message,
    });
    return null;
  }
};

const getPricePlatform = () => {
  try {
    const persona = services.User.getUser().getSelectedPersona();
    if (persona?.isPC === true) return "pc";
    if (
      persona?.isPC === false ||
      persona?.isXbox ||
      persona?.isPlaystation ||
      persona?.isStadia
    ) {
      return "console";
    }
    const raw = String(persona?.platform ?? persona?._platform ?? "").toLowerCase();
    if (raw.includes("pc")) return "pc";
  } catch (error) {
    console.warn("[FCX][Price] Could not detect platform, using console", error);
  }
  return "console";
};

const executePriceRequest = (spec) => {
  if (typeof GM_xmlhttpRequest !== "function") {
    return Promise.reject(
      new HttpRequestError("Tampermonkey GM_xmlhttpRequest 不可用", 0)
    );
  }
  return requestTextWithRetry(spec.url, GM_xmlhttpRequest, {
    retries: spec.retries,
    baseDelayMs: 750,
    requestInit: {
      method: spec.method,
      ...(spec.headers ? { headers: spec.headers } : {}),
      ...(spec.body !== undefined ? { data: spec.body } : {}),
    },
  });
};

function makePostRequest(url, data, timeoutMs = undefined) {
  return postJsonCompat(url, data, {
    timeoutMs,
    onError: (error) => {
      console.log(error);
      if (isTaskCancellationRequested()) {
        clearInterval(runtimeState.countDownInterval);
        hideLoader();
        return;
      }
      showNotification(
        error?.name === "AbortError"
          ? "SBC求解超过安全等待时间，任务已停止。"
          : "无法连接SBC后端，请确认本地服务正在运行。",
        UINotificationType.NEGATIVE
      );
      clearInterval(runtimeState.countDownInterval);
      hideLoader();
    },
  });
}
const convertAbbreviatedNumber = (number) => {
  return convertNumber(number);
};

let fetchLivePlayerPrice = async (player) => {
  if (!player) return null;
  await ensurePriceItemsLoaded();

  const DEFAULT_TIERS = [
    { min: 0, inc: 50 },
    { min: 1000, inc: 100 },
    { min: 10000, inc: 250 },
    { min: 50000, inc: 500 },
    { min: 100000, inc: 1000 },
    { min: 200000, inc: 2000 },
    { min: 500000, inc: 5000 },
    { min: 1000000, inc: 10000 },
  ];

  const tiers =
    Array.isArray(UTCurrencyInputControl?.PRICE_TIERS) &&
    UTCurrencyInputControl.PRICE_TIERS.length
      ? [...UTCurrencyInputControl.PRICE_TIERS].sort((a, b) => a.min - b.min)
      : DEFAULT_TIERS;

  const MAX_RESULTS = 21;
  const MAX_CAP_LIMIT = 15000000;
  const playerName =
    player?._staticData?.name ||
    player?._staticData?.lastName ||
    player?.name ||
    player?.definitionId;

  const log = (message, extra = {}) => {
    console.log("[fetchLivePlayerPrice]", message, {
      playerId: player?.definitionId,
      name: playerName,
      ...extra,
    });
  };

  let bestListing = null;
  let bestPrice = Number.POSITIVE_INFINITY;

  const registerCandidate = (price, item) => {
    if (!Number.isFinite(price) || !item) {
      return;
    }
    if (price < bestPrice || !bestListing) {
      bestPrice = price;
      bestListing = item;
    }
  };

  const persistLivePrice = async (listing, isExtinct = false) => {
    const defId = player?.definitionId;
    if (!defId) return;

    const rating = Number.isFinite(player?.rating)
      ? player.rating
      : Number(player?._staticData?.rating ?? 0);

    let normalizedPrice = null;
    if (!isExtinct) {
      const listingPrice = Number(listing?._auction?.buyNowPrice);
      if (Number.isFinite(listingPrice)) {
        normalizedPrice = Math.max(0, Math.floor(listingPrice));
      } else if (Number.isFinite(bestPrice)) {
        normalizedPrice = Math.max(0, Math.floor(bestPrice));
      }
    }

    if (!isExtinct && !Number.isFinite(normalizedPrice)) {
      return;
    }

    const itemPayload = {
      [defId]: {
        eaId: defId,
        rating,
        price: isExtinct ? 0 : normalizedPrice,
        isExtinct: Boolean(isExtinct),
        name: playerName,
        source: "liveSearch",
      },
    };

    PriceItem(itemPayload);
    updateCBRMinPrice();
    await savePriceItems();
  };

  const finishSuccess = async (reason) => {
    const price = Number.isFinite(bestPrice)
      ? bestPrice
      : Number(bestListing?._auction?.buyNowPrice);
    const priceLabel = Number.isFinite(price) ? price.toLocaleString() : "N/A";
    log("price found", { price, reason, listing: bestListing });
    if (typeof showNotification === "function") {
      try {
        showNotification(
          `${playerName}: ${priceLabel}`,
          UINotificationType.POSITIVE
        );
      } catch (e) {
        log("failed to show success notification", { error: e });
      }
    }
    await persistLivePrice(bestListing, false);
    return bestListing;
  };

  const finishExtinct = async () => {
    log("no price found - marking extinct", {});
    if (typeof showNotification === "function") {
      try {
        showNotification(
          `${playerName} appears to be extinct`,
          UINotificationType.NEGATIVE
        );
      } catch (e) {
        log("failed to show extinct notification", { error: e });
      }
    }
    await persistLivePrice(null, true);
    return null;
  };

  const getIncrement = (price) => {
    let inc = tiers[0]?.inc || 50;
    for (const tier of tiers) {
      if (price >= tier.min) {
        inc = tier.inc;
      } else {
        break;
      }
    }
    return inc || 50;
  };

  const alignDown = (price) => {
    if (!Number.isFinite(price) || price <= 0) return 0;
    const inc = getIncrement(price);
    return Math.max(0, Math.floor(price / inc) * inc);
  };

  const alignUp = (price) => {
    if (!Number.isFinite(price) || price <= 0) return 0;
    const inc = getIncrement(price);
    return Math.max(0, Math.ceil(price / inc) * inc);
  };

  const limits = player._itemPriceLimits || {};
  const MIN_CAP = alignDown(Math.max(0, limits.minimum || 0));
  const MAX_CAP = Math.min(
    MAX_CAP_LIMIT,
    alignUp(Math.max(limits.maximum || MAX_CAP_LIMIT, MIN_CAP || 0))
  );
  const ensurePlayerFilter = (criteria) => {
    const defId = player.definitionId;
    criteria.defId = [defId];
    console.log("[fetchLivePlayerPrice] using defId filter", {
      defId,
      criteria,
    });
    return criteria;
  };

  const searchViewModel = new UTBucketedItemSearchViewModel();

  const getBaseCriteria = () => {
    const base = searchViewModel.searchCriteria || {};
    searchViewModel.searchCriteria = ensurePlayerFilter(base);
    return searchViewModel.searchCriteria;
  };

  const buildCriteria = (maxBuy) => {
    const criteria = getBaseCriteria();
    if (typeof maxBuy === "number" && Number.isFinite(maxBuy) && maxBuy > 0) {
      criteria.maxBuy = Math.floor(maxBuy);
    } else {
      delete criteria.maxBuy;
    }
    return criteria;
  };

  const stepDown = (price) => {
    if (!Number.isFinite(price) || price <= 0) return 0;
    let current = alignDown(price);
    let guard = 0;
    while (current > MIN_CAP && guard < 5) {
      const inc = getIncrement(current);
      const next = alignDown(Math.max(MIN_CAP, current - inc));
      if (next !== current) return Math.max(next, MIN_CAP);
      current = Math.max(MIN_CAP, current - inc);
      guard += 1;
    }
    return MIN_CAP;
  };

  const stepUp = (price) => {
    const base = Math.max(0, Number(price) || 0);
    let current = alignUp(base);
    let guard = 0;
    while (guard < 5) {
      const inc = getIncrement(current || base || 0);
      const next = alignUp(current + inc);
      if (next > current) return Math.min(next, MAX_CAP);
      current = Math.min(current + inc, MAX_CAP);
      guard += 1;
    }
    return Math.min(current, MAX_CAP);
  };

  const doSearch = async (maxBuy) => {
    services.Item.clearTransferMarketCache();
    const criteria = buildCriteria(maxBuy);
    const response = await executeFcxEaRequest(
      () => services.Item.searchTransferMarket(criteria, 1),
      `搜索 ${playerName || "球员"} 的转会市场价格`,
      { scope: "Price" }
    );
    const responseItems = response?.data?.items || response?.response?.items || [];
    const items = Array.isArray(responseItems)
      ? responseItems.filter(
          (item) => item._auction && item._auction.tradeState === "active"
        )
      : [];
    console.log(
      "[fetchLivePlayerPrice]",
      responseItems.map((item) => ({
        playerId: player?.definitionId,
        name: playerName,
        item: item.definitionId,
        buyNowPrice: item._auction?.buyNowPrice,
      }))
    );
    return items;
  };

  const extractBuy = (item) =>
    item && item._auction && typeof item._auction.buyNowPrice === "number"
      ? item._auction.buyNowPrice
      : Number.POSITIVE_INFINITY;

  const evaluate = async (cap) => {
    let bounded = cap;
    if (bounded !== undefined && bounded !== null) {
      bounded = Math.min(MAX_CAP, Math.max(MIN_CAP, bounded));
    }

    const rawEntries = await doSearch(bounded);
    const entries = Array.isArray(rawEntries) ? rawEntries : [];
    const priceList = [];
    let minItem = null;
    let minPrice = Number.POSITIVE_INFINITY;
    for (const entry of entries) {
      const price = extractBuy(entry);
      if (!Number.isFinite(price)) {
        continue;
      }
      priceList.push(price);
      if (price < minPrice) {
        minPrice = price;
        minItem = entry;
      }
    }
    registerCandidate(minPrice, minItem);
    log("search result", {
      maxBuy: bounded ?? "unbounded",
      pricesReturned: priceList.length,
      priceList,
    });
    return {
      count: priceList.length,
      min: priceList.length ? minPrice : Number.POSITIVE_INFINITY,
      item: minItem,
    };
  };

  const refineBetween = async (emptyCap, filledCap) => {
    let low = Math.max(MIN_CAP, emptyCap || MIN_CAP);
    let high = Math.max(low + getIncrement(filledCap || low), filledCap);
    high = Math.min(high, MAX_CAP);
    let guard = 0;

    while (low + getIncrement(high) < high && guard < 40) {
      const rawMid = Math.floor((low + high) / 2);
      let mid = alignUp(rawMid);
      if (mid <= low) mid = alignUp(low + getIncrement(low || high));
      if (mid >= high) mid = alignDown(high - getIncrement(high));
      if (mid <= low || mid >= high) break;

      const midEval = await evaluate(mid);
      guard += 1;

      if (midEval.count === 0) {
        low = mid;
      } else {
        if (midEval.count < MAX_RESULTS) {
          return Number.isFinite(bestPrice)
            ? bestPrice
            : Number.isFinite(midEval.min)
            ? midEval.min
            : Number.POSITIVE_INFINITY;
        }
        high = mid;
      }
    }

    return Number.isFinite(bestPrice) ? bestPrice : Number.POSITIVE_INFINITY;
  };

  const ensureResults = async (cap) => {
    let upper = cap !== null ? alignUp(Math.max(cap, MIN_CAP)) : null;
    let evalResult = await evaluate(upper);

    if (evalResult.count === 0) {
      let low = upper ?? MIN_CAP;
      let high = upper ?? Math.max(MIN_CAP, stepUp(MIN_CAP));
      let guard = 0;

      while (evalResult.count === 0 && guard < 50 && high <= MAX_CAP) {
        low = high;
        high = stepUp(high);
        evalResult = await evaluate(high);
        guard += 1;
      }

      if (evalResult.count === 0) {
        const fallback = await evaluate(undefined);
        if (!fallback.count) return { cap: null, eval: fallback };
        if (fallback.count < MAX_RESULTS) return { cap: null, eval: fallback };

        upper = alignUp(fallback.min);
        evalResult = await evaluate(upper);
        if (!evalResult.count) {
          const stepped = stepUp(upper);
          evalResult = await evaluate(stepped);
          return { cap: stepped, eval: evalResult };
        }
        return { cap: upper, eval: evalResult };
      }

      return { cap: high, lowerBound: low, eval: evalResult };
    }

    return { cap: upper, eval: evalResult };
  };

  const stored = getPrice(player);
  const startCap =
    Number.isFinite(stored) && stored > 0
      ? Math.min(MAX_CAP, Math.max(MIN_CAP, stored))
      : null;

  log("search start", {
    storedPrice: stored,
    startCap,
    minCap: MIN_CAP,
    maxCap: MAX_CAP,
  });
  let {
    cap: upperCap,
    lowerBound,
    eval: upperEval,
  } = await ensureResults(startCap);

  if (upperEval.count === 0) {
    return finishExtinct();
  }

  if (upperEval.count < MAX_RESULTS) {
    return finishSuccess("upper-cap");
  }

  if (!upperCap || !Number.isFinite(upperCap)) {
    upperCap = alignUp(upperEval.min);
    upperEval = await evaluate(upperCap);
    if (upperEval.count === 0) {
      const stepped = stepUp(upperCap);
      upperCap = stepped;
      upperEval = await evaluate(upperCap);
      if (upperEval.count === 0) return finishExtinct();
      if (upperEval.count < MAX_RESULTS) return finishSuccess("stepped-upper");
    }
    if (upperEval.count < MAX_RESULTS) return finishSuccess("aligned-upper");
  }

  let best = upperEval.min;
  let lowerCapValue = lowerBound ?? stepDown(upperCap);
  let lowerEval = await evaluate(lowerCapValue);
  let guardDown = 0;

  while (lowerCapValue > MIN_CAP && lowerEval.count > 0 && guardDown < 50) {
    best = Math.min(best, lowerEval.min);
    if (lowerEval.count < MAX_RESULTS) {
      return finishSuccess("downward-window");
    }
    upperCap = lowerCapValue;
    upperEval = lowerEval;
    lowerCapValue = stepDown(lowerCapValue);
    lowerEval = await evaluate(lowerCapValue);
    guardDown += 1;
  }

  if (lowerEval.count === 0) {
    const refined = await refineBetween(lowerCapValue, upperCap);
    if (Number.isFinite(refined)) {
      return finishSuccess("refined-window");
    }
    if (Number.isFinite(best)) {
      return finishSuccess("refined-fallback");
    }
    return finishExtinct();
  }

  const finalBest = Math.min(best, lowerEval.min);
  if (Number.isFinite(finalBest)) {
    return finishSuccess("final");
  }
  return finishExtinct();
};

// expose as global to avoid "declared but its value is never read" warnings
window.fetchLivePlayerPrice = fetchLivePlayerPrice;

const pricePlayerMetadata = new Map();
let priceLookupCoordinator = null;

const recordProviderDiagnostics = (provider) => {
  const returned = Object.keys(provider.records).length;
  appendPriceDiagnosticEvent(runtimeState.priceDiagnosticEvents, {
    stage: "provider",
    status:
      provider.status === "complete"
        ? "success"
        : provider.status === "partial"
          ? "warning"
          : provider.status === "skipped"
            ? "info"
            : "error",
    source: provider.source,
    requested: provider.requested.length,
    returned,
    ...(provider.httpStatus !== undefined
      ? { httpStatus: provider.httpStatus }
      : {}),
    message:
      provider.status === "skipped"
        ? "本次会话已跳过受限价格源"
        : provider.error || `请求 ${provider.requested.length} 条，返回 ${returned} 条`,
  });
  if (provider.status === "failed") {
    console.debug("[FCX][Price] provider unavailable", provider);
  }
};

const getPriceLookupCoordinator = () => {
  if (priceLookupCoordinator) return priceLookupCoordinator;
  priceLookupCoordinator = new PriceLookupCoordinator({
    batchSize: PRICE_LOOKUP_BATCH_SIZE,
    debounceMs: 350,
    minimumBatchIntervalMs: 1500,
    missingCooldownMs: 15 * 60 * 1000,
    resolveBatch: async (playerIds) => {
      const resolution = await resolvePriceBatch(playerIds, {
        request: executePriceRequest,
        platform: getPricePlatform(),
        skipFutgg: runtimeState.futggBlockedForSession,
      });
      if (resolution.blockFutgg) runtimeState.futggBlockedForSession = true;
      resolution.results.forEach(recordProviderDiagnostics);
      for (const [key, record] of Object.entries(resolution.records)) {
        const metadata = pricePlayerMetadata.get(String(record.eaId ?? key));
        if (!metadata) continue;
        record.rating = metadata.rating;
        record.name = record.name || metadata.name;
      }
      return {
        records: resolution.records,
        missing: resolution.missing,
        providers: resolution.results,
      };
    },
    persist: async (records) => {
      PriceItem(records);
      updateCBRMinPrice();
      return savePriceItems();
    },
    onResult: (result) => {
      runtimeState.lastPriceFetchResult = result;
    },
  });
  return priceLookupCoordinator;
};

const clearPriceLookupCoordinator = () => {
  priceLookupCoordinator?.clear();
  priceLookupCoordinator = null;
  pricePlayerMetadata.clear();
};

let fetchPlayerPrices = async (players, options = {}) => {
  const ignoreValue =
    options.ignoreValue === true ||
    runtimeState.activeSbcExecution?.options?.ignoreValue === true;
  if (ignoreValue) {
    const skipped = {
      status: "skipped",
      requested: 0,
      fetched: 0,
      missing: [],
    };
    runtimeState.lastPriceFetchResult = skipped;
    return skipped;
  }

  document.getElementById("prices-progress-container")?.remove();
  await ensurePriceItemsLoaded();
  const cacheMinutes = Math.max(
    1,
    Number(getSettings(0, 0, "priceCacheMinutes")) || 1440
  );
  const sourcePlayers = (players || []).filter((player) => player?.definitionId);
  const ids = options.force
    ? [...new Set(sourcePlayers.map((player) => player.definitionId))]
    : getStalePriceIds(
        sourcePlayers,
        getPriceItems(),
        cacheMinutes,
        new Date()
      );

  for (const player of sourcePlayers) {
    pricePlayerMetadata.set(String(player.definitionId), {
      rating: Number(player.rating || player?._staticData?.rating || 0),
      name: player?._staticData?.name || player?.name || "",
    });
  }

  if (!ids.length) {
    const complete = {
      status: "complete",
      requested: 0,
      fetched: 0,
      missing: [],
    };
    runtimeState.lastPriceFetchResult = complete;
    return complete;
  }

  const showTaskStatus =
    options.showStatus === true || Boolean(runtimeState.activeSbcExecution);
  if (showTaskStatus) {
    reportOperationStatus("Price", `正在更新 ${ids.length} 名球员的价格`);
  }
  const request = getPriceLookupCoordinator().request(ids, {
    force: options.force === true,
  });
  runtimeState.priceFetchPromise = request;
  const result = await request;
  if (runtimeState.priceFetchPromise === request) {
    runtimeState.priceFetchPromise = undefined;
  }

  if (showTaskStatus && result.fetched > 0) {
    reportOperationStatus(
      "Price",
      result.missing.length
        ? `已更新 ${result.fetched} 名球员价格，其余继续使用缓存`
        : `已更新并保存 ${result.fetched} 名球员价格`,
      "success"
    );
  }
  if (options.userInitiated === true) {
    const message = result.fetched
      ? `价格刷新完成：更新 ${result.fetched} 条，缺失 ${result.missing.length} 条。`
      : "在线价格暂时不可用，已保留本地缓存。";
    showNotification(
      message,
      result.fetched ? UINotificationType.POSITIVE : UINotificationType.NEUTRAL
    );
  }
  return result;
};

