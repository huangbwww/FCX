import { PRICE_LOOKUP_BATCH_SIZE } from "../../config/constants";
import type {
  PricePlatform,
  PriceProviderResult,
  PriceRecord,
  PriceRecordMap,
  PriceRequestSpec,
  PriceSource,
} from "../../types/prices";

export type PriceRequestExecutor = (spec: PriceRequestSpec) => Promise<string>;

export interface PriceBatchResolution {
  records: PriceRecordMap;
  missing: Array<number | string>;
  results: PriceProviderResult[];
  blockFutgg: boolean;
}

export interface ResolvePriceBatchOptions {
  request: PriceRequestExecutor;
  platform: PricePlatform;
  skipFutgg?: boolean;
  now?: Date;
}

function errorDetails(error: unknown): { status?: number; message: string } {
  if (typeof error === "object" && error !== null) {
    const statusValue = "status" in error ? Number(error.status) : undefined;
    const messageValue = "message" in error ? String(error.message) : String(error);
    return {
      ...(typeof statusValue === "number" && Number.isFinite(statusValue)
        ? { status: statusValue }
        : {}),
      message: messageValue,
    };
  }
  return { message: String(error) };
}

function normalizeIds(ids: readonly (number | string)[]): Array<number | string> {
  return [...new Map(ids.map((id) => [String(id), id])).values()];
}

function recordMissing(
  ids: readonly (number | string)[],
  records: PriceRecordMap,
): Array<number | string> {
  return ids.filter((id) => !(String(id) in records));
}

function validPositivePrice(value: unknown): number | undefined {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function completeResult(
  source: PriceProviderResult["source"],
  requested: Array<number | string>,
  records: PriceRecordMap,
): PriceProviderResult {
  const missing = recordMissing(requested, records);
  return {
    source,
    requested,
    records,
    missing,
    status: missing.length === 0 ? "complete" : Object.keys(records).length ? "partial" : "failed",
  };
}

function failedResult(
  source: PriceProviderResult["source"],
  requested: Array<number | string>,
  error: unknown,
): PriceProviderResult {
  const details = errorDetails(error);
  return {
    source,
    requested,
    records: {},
    missing: [...requested],
    status: "failed",
    ...(details.status !== undefined ? { httpStatus: details.status } : {}),
    error: details.message,
  };
}

export function chunkPriceIds(
  ids: readonly (number | string)[],
  batchSize = PRICE_LOOKUP_BATCH_SIZE,
): Array<Array<number | string>> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("Price batch size must be a positive integer");
  }
  const normalized = normalizeIds(ids);
  const chunks: Array<Array<number | string>> = [];
  for (let index = 0; index < normalized.length; index += batchSize) {
    chunks.push(normalized.slice(index, index + batchSize));
  }
  return chunks;
}

export async function lookupFutggPrices(
  ids: readonly (number | string)[],
  request: PriceRequestExecutor,
  now = new Date(),
): Promise<PriceProviderResult> {
  const requested = normalizeIds(ids);
  if (!requested.length) return completeResult("futgg", requested, {});
  try {
    const text = await request({
      source: "futgg",
      method: "GET",
      url: `https://www.fut.gg/api/fut/player-prices/25/?ids=${requested.join(",")}`,
      retries: 2,
    });
    const parsed: unknown = JSON.parse(text);
    const data =
      typeof parsed === "object" && parsed !== null && "data" in parsed
        ? parsed.data
        : undefined;
    const records: PriceRecordMap = {};
    if (typeof data === "object" && data !== null) {
      for (const value of Object.values(data)) {
        if (typeof value !== "object" || value === null || !("eaId" in value)) continue;
        const raw = value as Record<string, unknown>;
        const id = raw.eaId;
        if (typeof id !== "number" && typeof id !== "string") continue;
        const price = Number(raw.price);
        const preserveZero = Boolean(raw.isExtinct || raw.isSbc || raw.isObjective);
        if ((!Number.isFinite(price) || price <= 0) && !preserveZero) continue;
        records[String(id)] = {
          eaId: id,
          price: Number.isFinite(price) && price > 0 ? price : 0,
          timeStamp: now.toISOString(),
          source: "futgg",
          isExtinct: Boolean(raw.isExtinct),
          isSbc: Boolean(raw.isSbc),
          isObjective: Boolean(raw.isObjective),
        };
      }
    }
    return completeResult("futgg", requested, records);
  } catch (error) {
    return failedResult("futgg", requested, error);
  }
}

export async function lookupFutnextPrices(
  ids: readonly (number | string)[],
  request: PriceRequestExecutor,
  platform: PricePlatform,
  now = new Date(),
): Promise<PriceProviderResult> {
  const requested = normalizeIds(ids);
  if (!requested.length) return completeResult("futnext", requested, {});
  try {
    const text = await request({
      source: "futnext",
      method: "GET",
      url: `https://enhancer-api.futnext.com/players/prices?ids=${requested.join("_")}&platform=${platform === "pc" ? "pc" : "ps"}`,
      retries: 1,
    });
    const parsed: unknown = JSON.parse(text);
    const records: PriceRecordMap = {};
    if (Array.isArray(parsed)) {
      for (const value of parsed) {
        if (typeof value !== "object" || value === null) continue;
        const raw = value as Record<string, unknown>;
        const id = raw.definitionId;
        if (typeof id !== "number" && typeof id !== "string") continue;
        const prices = Array.isArray(raw.prices) ? raw.prices : [];
        const price = validPositivePrice(prices[0]);
        if (!price) continue;
        const updatedAt = Number(raw.updatedAt);
        const timestamp = Number.isFinite(updatedAt) ? new Date(updatedAt) : now;
        records[String(id)] = {
          eaId: id,
          price,
          timeStamp: Number.isFinite(timestamp.getTime())
            ? timestamp.toISOString()
            : now.toISOString(),
          source: "futnext",
        };
      }
    }
    return completeResult("futnext", requested, records);
  } catch (error) {
    return failedResult("futnext", requested, error);
  }
}

function mergeProviderRecords(target: PriceRecordMap, source: PriceRecordMap): void {
  Object.assign(target, source);
}

export async function resolvePriceBatch(
  ids: readonly (number | string)[],
  options: ResolvePriceBatchOptions,
): Promise<PriceBatchResolution> {
  let missing = normalizeIds(ids);
  const records: PriceRecordMap = {};
  const results: PriceProviderResult[] = [];
  let blockFutgg = false;
  const now = options.now ?? new Date();

  if (!options.skipFutgg) {
    const futgg = await lookupFutggPrices(missing, options.request, now);
    results.push(futgg);
    mergeProviderRecords(records, futgg.records);
    missing = futgg.missing;
    blockFutgg = futgg.httpStatus === 403;
  } else {
    results.push({
      source: "futgg",
      requested: [],
      records: {},
      missing: [...missing],
      status: "skipped",
    });
  }

  if (missing.length) {
    const futnext = await lookupFutnextPrices(
      missing,
      options.request,
      options.platform,
      now,
    );
    results.push(futnext);
    mergeProviderRecords(records, futnext.records);
    missing = futnext.missing;
  }

  return { records, missing, results, blockFutgg };
}

export function countRecordsBySource(records: PriceRecordMap): Record<PriceSource, number> {
  const counts: Record<PriceSource, number> = {
    futgg: 0,
    futnext: 0,
    liveSearch: 0,
    unknown: 0,
  };
  for (const record of Object.values(records)) {
    const source = record.source && record.source in counts ? record.source : "unknown";
    counts[source] += 1;
  }
  return counts;
}
