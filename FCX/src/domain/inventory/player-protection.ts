import type { EaPlayer } from "../../types/game";
import { readPlayerDefinitionId } from "./player-identity";
import type {
  PlayerProtectionSnapshot,
  PlayerProtectionViolation,
  PlayerProtectionViolationReason,
} from "../../types/protection";

export function isEvolutionPlayer(player: EaPlayer): boolean {
  try {
    return Boolean(
      player.canRemoveEvolution?.() || player.isActiveInTimedEvolution?.(),
    );
  } catch {
    return false;
  }
}

export function extractActiveSquadItemIds(slots: unknown): number[] {
  if (!Array.isArray(slots)) return [];
  const ids = slots.flatMap((slot): number[] => {
    if (!isRecord(slot)) return [];
    let item: Record<string, unknown> = slot;
    try {
      const getItem = slot.getItem;
      const fromGetter = typeof getItem === "function" ? getItem.call(slot) : undefined;
      if (isRecord(fromGetter)) {
        item = fromGetter;
      } else if (isRecord(slot.item)) {
        item = slot.item;
      } else if (isRecord(slot._item)) {
        item = slot._item;
      }
    } catch {
      return [];
    }
    const id = Number(item.id);
    return Number.isFinite(id) && id > 0 ? [id] : [];
  });
  return [...new Set(ids)];
}

function isSquadEntity(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.getSlots === "function" ||
    typeof value.getPlayers === "function" ||
    Array.isArray(value._players) ||
    Array.isArray(value.players)
  );
}

export function resolveActiveSquadEntity(response: unknown): unknown {
  if (!isRecord(response)) return undefined;
  const data = isRecord(response.data) ? response.data : undefined;
  const nestedResponse = isRecord(response.response) ? response.response : undefined;
  const nestedData = isRecord(nestedResponse?.data)
    ? nestedResponse.data
    : undefined;
  const candidates = [
    data?.squad,
    nestedData?.squad,
    nestedResponse?.squad,
    response.squad,
    data,
    nestedResponse,
    response,
  ];
  return candidates.find(isSquadEntity);
}

export function extractActiveSquadEntityItemIds(squad: unknown): number[] {
  if (!isRecord(squad)) return [];
  try {
    const slots =
      (typeof squad.getSlots === "function" ? squad.getSlots.call(squad) : undefined) ??
      (typeof squad.getPlayers === "function"
        ? squad.getPlayers.call(squad)
        : undefined) ??
      squad._players ??
      squad.players ??
      [];
    return extractActiveSquadItemIds(slots);
  } catch {
    return [];
  }
}

export type ActiveSquadIdSource = "activeSquad" | "getActiveSquadId";
export type ActiveSquadDataSource = "repository" | "request";
export type ActiveSquadLookupId = number | string;

export interface ActiveSquadIdCandidate {
  id: ActiveSquadLookupId;
  source: ActiveSquadIdSource;
}

export interface ActiveSquadReadAttempt extends ActiveSquadIdCandidate {
  dataSource: ActiveSquadDataSource;
  outcome: "success" | "empty" | "error";
}

export interface ActiveSquadReadResult {
  ids: number[];
  activeSquadId?: ActiveSquadLookupId;
  idSource?: ActiveSquadIdSource;
  dataSource?: ActiveSquadDataSource;
  attempts: ActiveSquadReadAttempt[];
}

function normalizeActiveSquadId(value: unknown): ActiveSquadLookupId | undefined {
  const rawId = isRecord(value)
    ? value.id ?? value.squadId ?? value._id
    : value;
  if (typeof rawId === "number") {
    return Number.isFinite(rawId) && rawId >= 0 ? rawId : undefined;
  }
  if (typeof rawId === "string") {
    const normalized = rawId.trim();
    return normalized || undefined;
  }
  return undefined;
}

export function resolveActiveSquadIdCandidates(
  activeSquad: unknown,
  getActiveSquadId: unknown,
): ActiveSquadIdCandidate[] {
  const candidates: ActiveSquadIdCandidate[] = [];
  const seen = new Set<ActiveSquadLookupId>();
  const add = (value: unknown, source: ActiveSquadIdSource) => {
    const id = normalizeActiveSquadId(value);
    if (id === undefined || seen.has(id)) return;
    seen.add(id);
    candidates.push({ id, source });
  };

  // Preserve the legacy FCX path first: this is the value used by the
  // repository in current EA builds. The official squad getter remains a fallback.
  add(activeSquad, "activeSquad");
  add(getActiveSquadId, "getActiveSquadId");
  return candidates;
}

export async function readActiveSquadItemIdsFromCandidates(
  candidates: readonly ActiveSquadIdCandidate[],
  readers: {
    repository: (id: ActiveSquadLookupId) => unknown | Promise<unknown>;
    request: (id: ActiveSquadLookupId) => unknown | Promise<unknown>;
  },
): Promise<ActiveSquadReadResult> {
  const attempts: ActiveSquadReadAttempt[] = [];
  const dataSources: ActiveSquadDataSource[] = ["repository", "request"];

  for (const candidate of candidates) {
    for (const dataSource of dataSources) {
      try {
        const squad = await readers[dataSource](candidate.id);
        const ids = extractActiveSquadEntityItemIds(squad);
        const outcome = ids.length ? "success" : "empty";
        attempts.push({ ...candidate, dataSource, outcome });
        if (ids.length) {
          return {
            ids,
            activeSquadId: candidate.id,
            idSource: candidate.source,
            dataSource,
            attempts,
          };
        }
      } catch {
        attempts.push({ ...candidate, dataSource, outcome: "error" });
      }
    }
  }

  return { ids: [], attempts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function filterProtectedPlayers(
  players: readonly EaPlayer[],
  options: {
    lockedDefinitionIds: ReadonlySet<number>;
    activeSquadItemIds: ReadonlySet<number>;
    protectEvolutions: boolean;
    protectActiveSquad: boolean;
    protectLockedStorageCopies: boolean;
    storageItemIds?: ReadonlySet<number>;
  },
): EaPlayer[] {
  return players.filter((player) => {
    const isStorageCopy = Boolean(player.isStorage)
      || options.storageItemIds?.has(Number(player.id));
    if (
      options.lockedDefinitionIds.has(readPlayerDefinitionId(player))
      && (!isStorageCopy || options.protectLockedStorageCopies)
    ) return false;
    if (
      options.protectActiveSquad &&
      options.activeSquadItemIds.has(Number(player.id))
    ) {
      return false;
    }
    return !(options.protectEvolutions && isEvolutionPlayer(player));
  });
}

export function protectedPlayerReasons(
  player: EaPlayer,
  snapshot: PlayerProtectionSnapshot,
): PlayerProtectionViolationReason[] {
  const reasons: PlayerProtectionViolationReason[] = [];
  const isStorageCopy = Boolean(player.isStorage)
    || snapshot.storageItemIds.has(Number(player.id));
  if (
    snapshot.lockedDefinitionIds.has(readPlayerDefinitionId(player))
    && (!isStorageCopy || snapshot.protectLockedStorageCopies)
  ) {
    reasons.push("manualLock");
  }
  if (
    snapshot.protectActiveSquad &&
    snapshot.activeSquadItemIds.has(Number(player.id))
  ) {
    reasons.push("activeSquad");
  }
  if (snapshot.protectEvolutions && isEvolutionPlayer(player)) {
    reasons.push("evolution");
  }
  return reasons;
}

export function findProtectedPlayerViolations(
  players: readonly EaPlayer[],
  snapshot: PlayerProtectionSnapshot,
): PlayerProtectionViolation[] {
  return players.flatMap((player) => {
    if (!player || Number(player.id) <= 0) return [];
    const reasons = protectedPlayerReasons(player, snapshot);
    return reasons.length ? [{ player, reasons }] : [];
  });
}
