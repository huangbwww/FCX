import { describe, expect, it } from "vitest";
import {
  planUnassignedRoutes,
  type PackRoutingFacts,
} from "../src/domain/packs/routing";

interface TestItem extends PackRoutingFacts {
  id: string;
}

const item = (id: string, facts: Partial<PackRoutingFacts>): TestItem => ({
  id,
  playerPick: false,
  misc: false,
  movable: false,
  player: true,
  duplicate: true,
  untradeable: true,
  rating: 80,
  ...facts,
});

const options = {
  quickSellDuplicates: false,
  quickSellUnder: 75,
};

describe("unassigned item routing", () => {
  it("routes normal items, duplicate players, misc and player picks in order", () => {
    const items = [
      item("club", { movable: true, duplicate: false }),
      item("storage", { untradeable: true }),
      item("transfer", { untradeable: false }),
      item("misc-dupe", { player: false }),
      item("coins", { misc: true, player: false }),
      item("pick", { playerPick: true, player: false }),
    ];

    const plan = planUnassignedRoutes(items, (value) => value, options, {
      storage: 2,
      transferList: 2,
    });

    expect(plan.club.map(({ id }) => id)).toEqual(["club"]);
    expect(plan.storage.map(({ id }) => id)).toEqual(["storage"]);
    expect(plan.transferList.map(({ id }) => id)).toEqual(["transfer"]);
    expect(plan.discard.map(({ id }) => id)).toEqual(["misc-dupe"]);
    expect(plan.redeem.map(({ id }) => id)).toEqual(["coins"]);
    expect(plan.playerPicks.map(({ id }) => id)).toEqual(["pick"]);
    expect(plan.blocked).toEqual([]);
  });

  it("only quick-sells duplicate players after explicit opt-in and below threshold", () => {
    const low = item("low", { rating: 74 });
    const equal = item("equal", { rating: 75 });

    const disabled = planUnassignedRoutes([low], (value) => value, options, {
      storage: 1,
      transferList: 0,
    });
    expect(disabled.storage).toEqual([low]);
    expect(disabled.discard).toEqual([]);

    const enabled = planUnassignedRoutes(
      [low, equal],
      (value) => value,
      { quickSellDuplicates: true, quickSellUnder: 75 },
      { storage: 2, transferList: 0 },
    );
    expect(enabled.discard).toEqual([low]);
    expect(enabled.storage).toEqual([equal]);
  });

  it("blocks player duplicates instead of discarding when destinations are full", () => {
    const storage = item("storage-full", { untradeable: true });
    const transfer = item("transfer-full", { untradeable: false });
    const plan = planUnassignedRoutes(
      [storage, transfer],
      (value) => value,
      options,
      { storage: 0, transferList: 0 },
    );

    expect(plan.blocked).toEqual([storage, transfer]);
    expect(plan.blockedStorage).toEqual([storage]);
    expect(plan.blockedTransfer).toEqual([transfer]);
    expect(plan.blockedOther).toEqual([]);
    expect(plan.discard).toEqual([]);
  });
});
