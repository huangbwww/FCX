import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  extractActiveSquadEntityItemIds,
  extractActiveSquadItemIds,
  findProtectedPlayerViolations,
  filterProtectedPlayers,
  isEvolutionPlayer,
  readActiveSquadItemIdsFromCandidates,
  resolveActiveSquadEntity,
  resolveActiveSquadIdCandidates,
} from "../src/domain/inventory/player-protection";
import { PlayerProtectionStore } from "../src/state/player-protection-store";
import type { EaPlayer } from "../src/types/game";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function player(id: number, definitionId: number, evolution = false): EaPlayer {
  return {
    id,
    definitionId,
    canRemoveEvolution: () => evolution,
    isActiveInTimedEvolution: () => false,
  } as EaPlayer;
}

describe("player protection", () => {
  it("isolates locks per persona and preserves saved records", () => {
    const storage = memoryStorage();
    const first = new PlayerProtectionStore(storage, 101);
    const second = new PlayerProtectionStore(storage, 202);
    expect(second.ids()).toEqual([]);

    first.lock({
      definitionId: 99,
      name: "Protected",
      rating: 91,
      rarity: "Special",
      evolution: true,
    });
    expect(first.has(99)).toBe(true);
    expect(second.has(99)).toBe(false);

    const reloaded = new PlayerProtectionStore(storage, 101);
    expect(reloaded.list()).toMatchObject([
      {
        definitionId: 99,
        name: "Protected",
      },
    ]);
  });

  it("filters locked, active squad and evolution players independently", () => {
    const players = [player(1, 101), player(2, 102), player(3, 103, true), player(4, 104)];
    expect(isEvolutionPlayer(players[2]!)).toBe(true);
    const filtered = filterProtectedPlayers(players, {
      lockedDefinitionIds: new Set([101]),
      activeSquadItemIds: new Set([2]),
      protectEvolutions: true,
      protectActiveSquad: true,
      protectLockedStorageCopies: true,
    });
    expect(filtered.map((item) => item.definitionId)).toEqual([104]);
  });

  it("protects storage copies that expose only the private definition id", () => {
    const clubCopy = player(54, 880055);
    const storageCopy = {
      id: 55,
      _definitionId: 880055,
      assetId: 123,
      isStorage: true,
      canRemoveEvolution: () => false,
      isActiveInTimedEvolution: () => false,
    } as unknown as EaPlayer;
    const filtered = filterProtectedPlayers([storageCopy], {
      lockedDefinitionIds: new Set([880055]),
      activeSquadItemIds: new Set(),
      protectEvolutions: false,
      protectActiveSquad: false,
      protectLockedStorageCopies: true,
    });
    expect(filtered).toEqual([]);
    expect(filterProtectedPlayers([clubCopy, storageCopy], {
      lockedDefinitionIds: new Set([880055]),
      activeSquadItemIds: new Set(),
      protectEvolutions: false,
      protectActiveSquad: false,
      protectLockedStorageCopies: false,
    })).toEqual([storageCopy]);
    const reboundStorageCopy = { ...storageCopy, isStorage: false } as EaPlayer;
    expect(filterProtectedPlayers([reboundStorageCopy], {
      lockedDefinitionIds: new Set([880055]),
      activeSquadItemIds: new Set(),
      protectEvolutions: false,
      protectActiveSquad: false,
      protectLockedStorageCopies: false,
      storageItemIds: new Set([55]),
    })).toEqual([reboundStorageCopy]);
  });

  it("defaults storage-copy protection on and persists the user switch", () => {
    const storage = memoryStorage();
    const store = new PlayerProtectionStore(storage, 101);
    expect(store.getSettings().protectLockedStorageCopies).toBe(true);
    store.setSettings({
      ...store.getSettings(),
      protectLockedStorageCopies: false,
    });
    expect(new PlayerProtectionStore(storage, 101).getSettings().protectLockedStorageCopies).toBe(false);
  });

  it("extracts active squad ids from EA repository player slots", () => {
    expect(
      extractActiveSquadItemIds([
        { item: { id: 101 } },
        { _item: { id: 102 } },
        { id: 103 },
        { item: { id: 101 } },
        { item: { id: 0 } },
      ]),
    ).toEqual([101, 102, 103]);
  });

  it("reads the FCX-verified response.data.squad slot shape", () => {
    const squad = {
      getSlots: () => [
        { getItem: () => ({ id: 201 }) },
        { getItem: () => ({ id: 202 }) },
        { getItem: () => null },
      ],
    };
    expect(resolveActiveSquadEntity({ data: { squad } })).toBe(squad);
    expect(extractActiveSquadEntityItemIds(squad)).toEqual([201, 202]);
  });

  it("keeps zero as a valid EA squad key without overriding activeSquad", () => {
    expect(resolveActiveSquadIdCandidates(123, 0)).toEqual([
      { id: 123, source: "activeSquad" },
      { id: 0, source: "getActiveSquadId" },
    ]);
    expect(resolveActiveSquadIdCandidates(0, undefined)).toEqual([
      { id: 0, source: "activeSquad" },
    ]);
  });

  it("normalizes object ids, falls back to the getter and removes duplicates", () => {
    expect(resolveActiveSquadIdCandidates({ id: 123 }, 123)).toEqual([
      { id: 123, source: "activeSquad" },
    ]);
    expect(resolveActiveSquadIdCandidates(undefined, 456)).toEqual([
      { id: 456, source: "getActiveSquadId" },
    ]);
  });

  it("preserves the opaque string squad keys used by the legacy repository", () => {
    expect(
      resolveActiveSquadIdCandidates("squad-26-active", undefined),
    ).toEqual([{ id: "squad-26-active", source: "activeSquad" }]);
    expect(
      resolveActiveSquadIdCandidates(
        { squadId: "9223372036854775807123" },
        "9223372036854775807123",
      ),
    ).toEqual([
      { id: "9223372036854775807123", source: "activeSquad" },
    ]);
    expect(resolveActiveSquadIdCandidates("  ", "0")).toEqual([
      { id: "0", source: "getActiveSquadId" },
    ]);
  });

  it("uses zero with the exact legacy repository lookup", async () => {
    const repository = vi.fn((id) =>
      id === 0
        ? { getPlayers: () => [{ item: { id: 900 } }] }
        : undefined,
    );
    const result = await readActiveSquadItemIdsFromCandidates(
      resolveActiveSquadIdCandidates(0, undefined),
      { repository, request: () => undefined },
    );
    expect(result).toMatchObject({
      ids: [900],
      activeSquadId: 0,
      idSource: "activeSquad",
      dataSource: "repository",
    });
    expect(repository).toHaveBeenCalledWith(0);
  });

  it("uses an opaque legacy squad key for the repository lookup", async () => {
    const repository = vi.fn((id) =>
      id === "active-squad-key"
        ? { getPlayers: () => [{ item: { id: 901 } }] }
        : undefined,
    );
    const result = await readActiveSquadItemIdsFromCandidates(
      resolveActiveSquadIdCandidates("active-squad-key", undefined),
      { repository, request: () => undefined },
    );
    expect(result).toMatchObject({
      ids: [901],
      activeSquadId: "active-squad-key",
      idSource: "activeSquad",
      dataSource: "repository",
    });
    expect(repository).toHaveBeenCalledWith("active-squad-key");
  });

  it("tries the second active squad id when the first id is stale", async () => {
    const repository = vi.fn((id) =>
      id === 222 ? { getSlots: () => [{ getItem: () => ({ id: 902 }) }] } : undefined,
    );
    const request = vi.fn(() => undefined);
    const result = await readActiveSquadItemIdsFromCandidates(
      resolveActiveSquadIdCandidates(111, 222),
      { repository, request },
    );
    expect(result).toMatchObject({
      ids: [902],
      activeSquadId: 222,
      idSource: "getActiveSquadId",
      dataSource: "repository",
    });
    expect(repository).toHaveBeenCalledWith(111);
    expect(request).toHaveBeenCalledWith(111);
    expect(repository).toHaveBeenCalledWith(222);
  });

  it("falls back from the repository to the official request entity", async () => {
    const squad = {
      getSlots: () => [{ getItem: () => ({ id: 903 }) }],
    };
    const result = await readActiveSquadItemIdsFromCandidates(
      resolveActiveSquadIdCandidates(333, undefined),
      {
        repository: () => undefined,
        request: () => resolveActiveSquadEntity({ data: { squad } }),
      },
    );
    expect(result).toMatchObject({
      ids: [903],
      activeSquadId: 333,
      dataSource: "request",
    });
  });

  it("reports every failed path without inventing an active squad", async () => {
    const result = await readActiveSquadItemIdsFromCandidates(
      resolveActiveSquadIdCandidates(444, 555),
      {
        repository: () => undefined,
        request: async (id) => {
          if (id === 444) throw new Error("stale");
          return undefined;
        },
      },
    );
    expect(result.ids).toEqual([]);
    expect(result.attempts).toEqual([
      { id: 444, source: "activeSquad", dataSource: "repository", outcome: "empty" },
      { id: 444, source: "activeSquad", dataSource: "request", outcome: "error" },
      { id: 555, source: "getActiveSquadId", dataSource: "repository", outcome: "empty" },
      { id: 555, source: "getActiveSquadId", dataSource: "request", outcome: "empty" },
    ]);
  });

  it("reports every protection reason before applying or submitting a squad", () => {
    const protectedPlayer = player(9, 109, true);
    const violations = findProtectedPlayerViolations([protectedPlayer], {
      personaId: "persona-1",
      lockedDefinitionIds: new Set([109]),
      activeSquadItemIds: new Set([9]),
      storageItemIds: new Set(),
      protectEvolutions: true,
      protectActiveSquad: true,
      protectLockedStorageCopies: true,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reasons).toEqual([
      "manualLock",
      "activeSquad",
      "evolution",
    ]);
  });

  it("keeps definition locks at every runtime protection gate", () => {
    const runtime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/sbc/runtime.ts"),
      "utf8",
    );
    expect(runtime).toContain("players = filterProtectedPlayers(players");
    expect(runtime).toContain("lockedDefinitionIds: protectionSnapshot.lockedDefinitionIds");
    expect(runtime).toContain('"应用阵容前"');
    expect(runtime).toContain('"保存阵容前"');
    expect(runtime).toContain('"提交阵容前"');
    expect(runtime).toContain('"整组应用阵容前"');
    expect(runtime).toContain('"整组提交阵容前"');
  });

  it("reads the active squad again for every protection operation", async () => {
    let currentItemId = 8;
    const repository = vi.fn(() => ({
      getPlayers: () => [{ item: { id: currentItemId } }],
    }));
    const candidates = resolveActiveSquadIdCandidates(0, undefined);
    const first = await readActiveSquadItemIdsFromCandidates(candidates, {
      repository,
      request: () => undefined,
    });
    currentItemId = 9;
    const second = await readActiveSquadItemIdsFromCandidates(candidates, {
      repository,
      request: () => undefined,
    });
    expect(first.ids).toEqual([8]);
    expect(second.ids).toEqual([9]);
    expect(repository).toHaveBeenCalledTimes(2);
  });
});
