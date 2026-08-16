import type { EaPlayer } from "../../types/game";
import type {
  LockedPlayerRecord,
  ProtectedPlayerReason,
  ProtectedPlayerViewRecord,
} from "../../types/protection";
import { isEvolutionPlayer } from "./player-protection";
import { readPlayerDefinitionId } from "./player-identity";

export interface ProtectedPlayerAggregationOptions {
  clubPlayers: readonly EaPlayer[];
  lockedPlayers: readonly LockedPlayerRecord[];
  activeSquadItemIds: ReadonlySet<number>;
  protectActiveSquad: boolean;
  protectEvolutions: boolean;
  getName(player: EaPlayer): string;
  getRarity(player: EaPlayer): string;
}

const REASON_ORDER: readonly ProtectedPlayerReason[] = [
  "manualLock",
  "activeSquad",
  "evolution",
];

interface MutableProtectedPlayer extends Omit<ProtectedPlayerViewRecord, "reasons"> {
  reasons: Set<ProtectedPlayerReason>;
}

export function aggregateProtectedPlayers(
  options: ProtectedPlayerAggregationOptions,
): ProtectedPlayerViewRecord[] {
  const records = new Map<number, MutableProtectedPlayer>();
  const lockedByDefinition = new Map(
    options.lockedPlayers.map((record) => [Number(record.definitionId), record]),
  );

  for (const player of options.clubPlayers) {
    const definitionId = readPlayerDefinitionId(player);
    if (!Number.isFinite(definitionId) || definitionId <= 0) continue;
    const manualLock = lockedByDefinition.has(definitionId);
    const activeSquad =
      options.protectActiveSquad &&
      options.activeSquadItemIds.has(Number(player.id));
    const evolution = options.protectEvolutions && isEvolutionPlayer(player);
    if (!manualLock && !activeSquad && !evolution) continue;

    const rating = Number(player.rating || player._staticData?.rating || 0);
    const existing = records.get(definitionId);
    const shouldReplace = !existing || rating > existing.rating;
    const reasons = existing?.reasons ?? new Set<ProtectedPlayerReason>();
    if (manualLock) reasons.add("manualLock");
    if (activeSquad) reasons.add("activeSquad");
    if (evolution) reasons.add("evolution");
    if (!shouldReplace && existing) continue;

    const instanceId = Number(player.id);
    records.set(definitionId, {
      definitionId,
      ...(Number.isFinite(instanceId) && instanceId > 0 ? { instanceId } : {}),
      name: options.getName(player),
      rating,
      rarity: options.getRarity(player),
      inClub: true,
      reasons,
    });
  }

  for (const locked of options.lockedPlayers) {
    const definitionId = Number(locked.definitionId);
    if (!Number.isFinite(definitionId) || definitionId <= 0) continue;
    const existing = records.get(definitionId);
    if (existing) {
      existing.reasons.add("manualLock");
      continue;
    }
    records.set(definitionId, {
      definitionId,
      name: locked.name,
      rating: Number(locked.rating || 0),
      rarity: locked.rarity || "未知",
      inClub: false,
      reasons: new Set(["manualLock"]),
    });
  }

  return [...records.values()]
    .map(({ reasons, ...record }) => ({
      ...record,
      reasons: REASON_ORDER.filter((reason) => reasons.has(reason)),
    }))
    .sort(
      (left, right) =>
        right.rating - left.rating || left.name.localeCompare(right.name, "zh-CN"),
    );
}
