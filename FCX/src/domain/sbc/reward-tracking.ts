import type { PackSelection } from "../../types/packs";
import type { SbcRewardPlan } from "../../types/sbc-run";

export type SbcRewardKind = "pack" | "player_pick" | "unsupported";

export interface SbcRewardDescriptor {
  kind: SbcRewardKind;
  id: number;
  count: number;
  label: string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function positiveId(...values: unknown[]): number {
  for (const value of values) {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return 0;
}

export function isPlayerPickItemLike(value: unknown): boolean {
  const item = asRecord(value);
  try {
    if (typeof item.isPlayerPickItem === "function" && item.isPlayerPickItem()) {
      return true;
    }
  } catch {
    // Fall through to stable metadata used by EA player-pick reward items.
  }
  const staticData = asRecord(item._staticData);
  return Number(item.subtype) === 237
    || /^PlayerPickItemName/i.test(String(staticData.name || ""));
}

export function classifySbcRewards(awards: readonly unknown[]): SbcRewardDescriptor[] {
  const rewards: SbcRewardDescriptor[] = [];
  for (const rawAward of awards || []) {
    const award = asRecord(rawAward);
    const item = asRecord(award.item);
    const id = positiveId(award.value, award.id, award.itemId, item.definitionId, item.id);
    if (!id) continue;
    const count = Math.max(1, Math.trunc(Number(award.count) || 1));
    const staticData = asRecord(item._staticData);
    const label = String(
      staticData.description
      || award.displayName
      || staticData.name
      || `奖励 ${id}`,
    );
    const type = String(award.type || "").toLowerCase();
    if (award.isPack === true || type === "pack") {
      rewards.push({ kind: "pack", id, count, label });
    } else if (award.isItem === true && isPlayerPickItemLike(item)) {
      rewards.push({ kind: "player_pick", id, count, label });
    } else {
      rewards.push({ kind: "unsupported", id, count, label });
    }
  }
  return rewards;
}

export function packRewardKey(id: number, tradeable: boolean): string {
  return `${Number(id)}:${Boolean(tradeable)}`;
}

export function countPackInventory(
  packs: ReadonlyArray<{ id?: unknown; tradeable?: unknown }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pack of packs || []) {
    const id = positiveId(pack?.id);
    if (!id) continue;
    const key = packRewardKey(id, Boolean(pack.tradeable));
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function playerPickDefinitionId(item: unknown): number {
  const record = asRecord(item);
  return positiveId(record.definitionId, record.id);
}

export function playerPickInstanceKey(item: unknown): string {
  const record = asRecord(item);
  const itemData = asRecord(record.itemData);
  const id = positiveId(record.id, record.itemId, itemData.id);
  return id > 0 ? String(id) : "";
}

export function countPlayerPickInventory(items: readonly unknown[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const item of items || []) {
    if (!isPlayerPickItemLike(item)) continue;
    const id = playerPickDefinitionId(item);
    if (!id) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

export function recordExpectedRewards(
  plan: SbcRewardPlan,
  rewards: readonly SbcRewardDescriptor[],
): void {
  for (const reward of rewards) {
    if (reward.kind === "pack") {
      for (let index = 0; index < reward.count; index += 1) plan.packIds.push(reward.id);
      plan.expectedById[reward.id] = (plan.expectedById[reward.id] || 0) + reward.count;
    } else if (reward.kind === "player_pick") {
      for (let index = 0; index < reward.count; index += 1) {
        plan.playerPickIds.push(reward.id);
      }
      plan.playerPickExpectedById[reward.id] =
        (plan.playerPickExpectedById[reward.id] || 0) + reward.count;
      plan.playerPickLabelsById[reward.id] = reward.label;
    } else if (!plan.unsupportedRewards.includes(reward.label)) {
      plan.unsupportedRewards.push(reward.label);
    }
  }
}

export function selectNewRewardPacks(
  plan: SbcRewardPlan,
  packs: ReadonlyArray<{ id?: unknown; tradeable?: unknown }>,
): PackSelection[] {
  const current = countPackInventory(packs);
  const selections: PackSelection[] = [];
  for (const [rawId, expected] of Object.entries(plan.expectedById)) {
    const id = Number(rawId);
    let remaining = Math.max(
      0,
      Number(expected) - Object.entries(plan.processedPackByKey)
        .filter(([key]) => Number(key.split(":", 1)[0]) === id)
        .reduce((sum, [, count]) => sum + Number(count || 0), 0),
    );
    for (const tradeable of [false, true]) {
      if (remaining <= 0) break;
      const key = packRewardKey(id, tradeable);
      const baseline = Number(plan.packBaselineByKey[key] || 0);
      const available = Math.max(0, Number(current[key] || 0) - baseline);
      const quantity = Math.min(available, remaining);
      if (quantity > 0) {
        selections.push({ id, tradable: tradeable, quantity });
        remaining -= quantity;
      }
    }
  }
  return selections;
}

export function markRewardPacksProcessed(
  plan: SbcRewardPlan,
  selections: readonly PackSelection[],
): void {
  for (const selection of selections) {
    const key = packRewardKey(selection.id, selection.tradable);
    plan.processedPackByKey[key] =
      (plan.processedPackByKey[key] || 0) + Math.max(0, selection.quantity);
  }
}

export function selectNewPlayerPickItems<T>(
  plan: SbcRewardPlan,
  items: readonly T[],
): Array<{ item: T; definitionId: number; label: string }> {
  const grouped = new Map<number, T[]>();
  for (const item of items || []) {
    if (!isPlayerPickItemLike(item)) continue;
    const id = playerPickDefinitionId(item);
    if (!id || !(id in plan.playerPickExpectedById)) continue;
    const values = grouped.get(id) || [];
    values.push(item);
    grouped.set(id, values);
  }
  const selected: Array<{ item: T; definitionId: number; label: string }> = [];
  for (const [rawId, expected] of Object.entries(plan.playerPickExpectedById)) {
    const id = Number(rawId);
    const processed = Number(plan.processedPlayerPickById[id] || 0);
    const remaining = Math.max(0, Number(expected) - processed);
    const baseline = Number(plan.playerPickBaselineById[id] || 0);
    const candidates = grouped.get(id) || [];
    const baselineKeys = new Set(plan.playerPickBaselineKeysById[id] || []);
    const identifiableNew = baselineKeys.size > 0
      ? candidates.filter((item) => {
          const key = playerPickInstanceKey(item);
          return key !== "" && !baselineKeys.has(key);
        })
      : [];
    const newCandidates = identifiableNew.length > 0
      ? identifiableNew
      : candidates.slice(baseline);
    const quantity = Math.min(remaining, newCandidates.length);
    for (let index = 0; index < quantity; index += 1) {
      const item = newCandidates[index];
      if (item === undefined) continue;
      selected.push({
        item,
        definitionId: id,
        label: plan.playerPickLabelsById[id] || "球员挑选",
      });
    }
  }
  return selected;
}

export function markPlayerPickProcessed(plan: SbcRewardPlan, definitionId: number): void {
  plan.processedPlayerPickById[definitionId] =
    (plan.processedPlayerPickById[definitionId] || 0) + 1;
}

/** Consume one pre-task pick without counting it as a newly earned SBC reward. */
export function consumeHistoricalPlayerPickBaseline(
  plan: SbcRewardPlan,
  item: unknown,
): boolean {
  const definitionId = playerPickDefinitionId(item);
  const remaining = Number(plan.playerPickBaselineById[definitionId] || 0);
  if (!definitionId || remaining <= 0) return false;
  plan.playerPickBaselineById[definitionId] = remaining - 1;
  const instanceKey = playerPickInstanceKey(item);
  if (instanceKey) {
    const keys = plan.playerPickBaselineKeysById[definitionId] || [];
    const index = keys.indexOf(instanceKey);
    if (index >= 0) keys.splice(index, 1);
  }
  return true;
}

export function hasPendingTrackedRewards(plan: SbcRewardPlan): boolean {
  const processedPacksById: Record<number, number> = {};
  for (const [key, count] of Object.entries(plan.processedPackByKey)) {
    const id = Number(key.split(":", 1)[0]);
    processedPacksById[id] = (processedPacksById[id] || 0) + Number(count || 0);
  }
  return Object.entries(plan.expectedById).some(
    ([id, count]) => Number(processedPacksById[Number(id)] || 0) < Number(count),
  ) || Object.entries(plan.playerPickExpectedById).some(
    ([id, count]) => Number(plan.processedPlayerPickById[Number(id)] || 0) < Number(count),
  );
}
