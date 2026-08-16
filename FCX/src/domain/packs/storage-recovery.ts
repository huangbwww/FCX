import type { PackSelection } from "../../types/packs";

export interface PackWorkItem {
  id: number;
  tradable: boolean;
  owned?: boolean;
  rewardPlan?: unknown;
}

export interface StorageCapacitySnapshot {
  count: number;
  capacity: number;
  available: number;
}

export function expandPackSelections(
  selections: readonly (PackSelection & { rewardPlan?: unknown })[],
  rewardPlan?: unknown,
): PackWorkItem[] {
  return selections.flatMap((selection) =>
    Array.from(
      { length: Math.max(0, Math.trunc(Number(selection.quantity || 0))) },
      () => ({
        id: Number(selection.id),
        tradable: Boolean(selection.tradable),
        owned: selection.owned !== false,
        rewardPlan: selection.rewardPlan || rewardPlan,
      }),
    ),
  );
}

export function insertImmediatePackSelections(
  queue: PackWorkItem[],
  cursor: number,
  selections: readonly (PackSelection & { rewardPlan?: unknown })[],
  rewardPlan?: unknown,
): number {
  const inserted = expandPackSelections(selections, rewardPlan);
  queue.splice(cursor, 0, ...inserted);
  return inserted.length;
}

export function storageProgressMade(
  before: StorageCapacitySnapshot,
  after: StorageCapacitySnapshot,
): boolean {
  return after.count < before.count || after.available > before.available;
}

export function incrementStorageRecoveryCount(completed: number): number {
  return Math.max(0, Math.trunc(Number(completed) || 0)) + 1;
}
