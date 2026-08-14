import type { SbcConsumedPlayerSummary } from "../../types/packs";

export interface ConsumedPlayerLike {
  id?: unknown;
  definitionId?: unknown;
  rating?: unknown;
  _rating?: unknown;
  rareflag?: unknown;
  _rareflag?: unknown;
  duplicateId?: unknown;
  isDuplicate?: unknown;
  isStorage?: unknown;
  _staticData?: {
    name?: unknown;
    commonName?: unknown;
    lastName?: unknown;
  };
  name?: unknown;
  isTradeable?: () => boolean;
}

export interface ConsumptionSnapshotOptions {
  rarityLabel(rareflag: number): string;
}

export function snapshotConsumedPlayers(
  items: readonly ConsumedPlayerLike[],
  options: ConsumptionSnapshotOptions,
): SbcConsumedPlayerSummary[] {
  const output: SbcConsumedPlayerSummary[] = [];
  const knownIds = new Set<number>();
  items.forEach((item, slot) => {
    const instanceId = Number(item?.id);
    const definitionId = Number(item?.definitionId);
    if (!Number.isFinite(instanceId) || instanceId <= 0 || knownIds.has(instanceId)) return;
    if (!Number.isFinite(definitionId) || definitionId <= 0) return;
    knownIds.add(instanceId);
    const rating = Number(item._rating ?? item.rating);
    const rareflag = Number(item._rareflag ?? item.rareflag);
    const storage = item.isStorage === true;
    const duplicate = Number(item.duplicateId || 0) > 0 || item.isDuplicate === true;
    output.push({
      slot,
      instanceId,
      definitionId,
      name: String(
        item._staticData?.name ||
        item._staticData?.commonName ||
        item._staticData?.lastName ||
        item.name ||
        definitionId,
      ),
      rating: Number.isFinite(rating) ? rating : 0,
      rarity: Number.isFinite(rareflag) ? options.rarityLabel(rareflag) : "未知",
      tradeable: item.isTradeable?.() === true,
      duplicate,
      storage,
      location: storage ? "storage" : duplicate ? "duplicate" : "club",
    });
  });
  return output;
}
