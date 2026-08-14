import { describe, expect, it } from "vitest";
import { snapshotConsumedPlayers } from "../src/domain/sbc/consumption-summary";

describe("SBC consumed player snapshots", () => {
  it("captures real item instances and ignores bricks or duplicate slots", () => {
    const player = {
      id: 101,
      definitionId: 5001,
      _rating: 88,
      _rareflag: 3,
      duplicateId: 9,
      isStorage: false,
      _staticData: { name: "Consumed One" },
      isTradeable: () => false,
    };
    const result = snapshotConsumedPlayers([
      { id: 0, definitionId: 0 },
      player,
      player,
      {
        id: 102,
        definitionId: 5002,
        rating: 84,
        rareflag: 1,
        isStorage: true,
        name: "Storage Player",
        isTradeable: () => true,
      },
    ], { rarityLabel: (rareflag) => `Rarity ${rareflag}` });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      slot: 1,
      instanceId: 101,
      definitionId: 5001,
      name: "Consumed One",
      rating: 88,
      rarity: "Rarity 3",
      duplicate: true,
      storage: false,
      location: "duplicate",
    });
    expect(result[1]).toMatchObject({
      instanceId: 102,
      tradeable: true,
      storage: true,
      location: "storage",
    });
  });
});
