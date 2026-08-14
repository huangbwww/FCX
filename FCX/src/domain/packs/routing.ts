import type { PackRunOptions } from "../../types/packs";

export interface PackRoutingFacts {
  playerPick: boolean;
  misc: boolean;
  movable: boolean;
  player: boolean;
  duplicate: boolean;
  untradeable: boolean;
  rating: number;
}

export interface PackRoutingCapacity {
  storage: number;
  transferList: number;
}

export interface PackRoutingPlan<T> {
  club: T[];
  storage: T[];
  transferList: T[];
  discard: T[];
  redeem: T[];
  playerPicks: T[];
  blockedStorage: T[];
  blockedTransfer: T[];
  blockedOther: T[];
  blocked: T[];
}

export function planUnassignedRoutes<T>(
  items: readonly T[],
  inspect: (item: T) => PackRoutingFacts,
  options: Pick<PackRunOptions, "quickSellDuplicates" | "quickSellUnder">,
  capacity: PackRoutingCapacity,
): PackRoutingPlan<T> {
  const plan: PackRoutingPlan<T> = {
    club: [],
    storage: [],
    transferList: [],
    discard: [],
    redeem: [],
    playerPicks: [],
    blockedStorage: [],
    blockedTransfer: [],
    blockedOther: [],
    blocked: [],
  };

  let storageSlots = Math.max(0, capacity.storage);
  let transferSlots = Math.max(0, capacity.transferList);

  for (const item of items) {
    const facts = inspect(item);
    if (facts.playerPick) {
      plan.playerPicks.push(item);
    } else if (facts.misc) {
      plan.redeem.push(item);
    } else if (facts.movable && !facts.duplicate) {
      plan.club.push(item);
    } else if (!facts.player && facts.duplicate) {
      plan.discard.push(item);
    } else if (
      facts.player &&
      facts.duplicate &&
      options.quickSellDuplicates &&
      facts.rating < options.quickSellUnder
    ) {
      plan.discard.push(item);
    } else if (facts.player && facts.duplicate && facts.untradeable) {
      if (storageSlots > 0) {
        plan.storage.push(item);
        storageSlots -= 1;
      } else {
        plan.blockedStorage.push(item);
        plan.blocked.push(item);
      }
    } else if (facts.player && facts.duplicate && !facts.untradeable) {
      if (transferSlots > 0) {
        plan.transferList.push(item);
        transferSlots -= 1;
      } else {
        plan.blockedTransfer.push(item);
        plan.blocked.push(item);
      }
    } else if (facts.movable) {
      plan.club.push(item);
    } else {
      plan.blockedOther.push(item);
      plan.blocked.push(item);
    }
  }

  return plan;
}
