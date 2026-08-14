import type { PriceRecordMap } from "../../types/prices";

export function updateRatingReferencePrices(
  records: PriceRecordMap,
  now: Date = new Date(),
): PriceRecordMap {
  const minimumByRating = new Map<number, number>();
  for (const [key, record] of Object.entries(records)) {
    if (key.endsWith("_CBR")) continue;
    if (typeof record.rating !== "number") continue;
    if (!record.price || record.isExtinct) continue;
    const current = minimumByRating.get(record.rating) ?? Number.POSITIVE_INFINITY;
    if (record.price < current) minimumByRating.set(record.rating, record.price);
  }
  for (const [rating, price] of minimumByRating) {
    const key = `${rating}_CBR`;
    records[key] = {
      ...records[key],
      eaId: key,
      rating,
      price,
      timeStamp: now,
      isExtinct: false,
    };
  }
  return records;
}

export function isCachedPriceOld(
  record: { timeStamp?: string | Date } | undefined,
  cacheMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!record) return true;
  const timestamp = record.timeStamp;
  if (!timestamp) return true;
  const expiresAt = new Date(timestamp).getTime() + cacheMinutes * 60_000;
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt < now.getTime();
}

export interface PriceCandidate {
  definitionId?: number | string;
  isPlayer?(): boolean;
}

export function getStalePriceIds(
  players: readonly PriceCandidate[],
  records: PriceRecordMap,
  cacheMinutes: number,
  now = new Date(),
): Array<number | string> {
  const ids = new Set<number | string>();
  for (const player of players) {
    const id = player.definitionId;
    if (id === undefined || id === null || player.isPlayer?.() === false) continue;
    if (isCachedPriceOld(records[String(id)], cacheMinutes, now)) ids.add(id);
  }
  return [...ids];
}
