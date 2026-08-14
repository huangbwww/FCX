import { describe, expect, it } from "vitest";
import { aggregateProtectedPlayers } from "../src/domain/inventory/protected-players";
import type { EaPlayer } from "../src/types/game";
import type { LockedPlayerRecord } from "../src/types/protection";

function player(
  id: number,
  definitionId: number,
  name: string,
  rating: number,
  evolution = false,
): EaPlayer {
  return {
    id,
    definitionId,
    rating,
    rareflag: 12,
    _staticData: { name, firstName: "", lastName: "", rating },
    getTier: () => 3,
    canRemoveEvolution: () => evolution,
    isActiveInTimedEvolution: () => false,
  } as EaPlayer;
}

function lock(
  definitionId: number,
  name: string,
  rating: number,
): LockedPlayerRecord {
  return {
    definitionId,
    name,
    rating,
    rarity: "特殊",
    evolution: false,
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

const aggregate = (
  clubPlayers: EaPlayer[],
  lockedPlayers: LockedPlayerRecord[],
  activeSquadItemIds = new Set<number>(),
  protectActiveSquad = true,
  protectEvolutions = true,
) =>
  aggregateProtectedPlayers({
    clubPlayers,
    lockedPlayers,
    activeSquadItemIds,
    protectActiveSquad,
    protectEvolutions,
    getName: (item) => item._staticData.name,
    getRarity: () => "特殊",
  });

describe("protected player aggregation", () => {
  it("merges protection reasons by definition id and sorts by rating", () => {
    const result = aggregate(
      [
        player(10, 100, "Alpha", 90, true),
        player(11, 100, "Alpha", 88, false),
        player(20, 200, "Beta", 93),
      ],
      [lock(100, "Alpha", 90)],
      new Set([10, 20]),
    );

    expect(result.map((item) => item.definitionId)).toEqual([200, 100]);
    expect(result[1]?.reasons).toEqual([
      "manualLock",
      "activeSquad",
      "evolution",
    ]);
    expect(result[1]).toMatchObject({ inClub: true, instanceId: 10 });
  });

  it("always includes manual locks and honors protection toggles", () => {
    const result = aggregate(
      [player(10, 100, "Locked", 90), player(20, 200, "Evo", 91, true)],
      [lock(100, "Locked", 90)],
      new Set([20]),
      false,
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.reasons).toEqual(["manualLock"]);
  });

  it("keeps locked players that are no longer in the club", () => {
    const result = aggregate([], [lock(300, "Archived", 87)]);
    expect(result[0]).toMatchObject({
      definitionId: 300,
      name: "Archived",
      rating: 87,
      inClub: false,
      reasons: ["manualLock"],
    });
  });
});
