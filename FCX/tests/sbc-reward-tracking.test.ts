import { describe, expect, it } from "vitest";
import {
  classifySbcRewards,
  consumeHistoricalPlayerPickBaseline,
  hasPendingTrackedRewards,
  markPlayerPickProcessed,
  markRewardPacksProcessed,
  packRewardKey,
  recordExpectedRewards,
  selectNewPlayerPickItems,
  selectNewRewardPacks,
} from "../src/domain/sbc/reward-tracking";
import { createSbcExecutionContext } from "../src/types/sbc-run";

describe("SBC reward tracking", () => {
  it("classifies packs, player picks and unsupported item rewards separately", () => {
    expect(classifySbcRewards([
      { type: "pack", isPack: true, value: 101, count: 2, displayName: "奖励包" },
      {
        type: "item",
        isItem: true,
        value: 202,
        item: {
          definitionId: 202,
          subtype: 237,
          _staticData: { name: "PlayerPickItemName_202", description: "87+ 球员挑选" },
        },
      },
      { type: "item", isItem: true, value: 303, displayName: "其他物品" },
    ])).toEqual([
      { kind: "pack", id: 101, count: 2, label: "奖励包" },
      { kind: "player_pick", id: 202, count: 1, label: "87+ 球员挑选" },
      {
        kind: "unsupported",
        id: 303,
        count: 1,
        label: "其他物品",
        diagnostic: {
          type: "item",
          isPack: false,
          isPlayerPick: false,
          itemDefinitionId: 0,
          awardValue: 303,
          itemSubtype: 0,
        },
      },
    ]);
  });

  it("recognizes player-pick rewards with private EA fields and no isItem flag", () => {
    expect(classifySbcRewards([{
      type: "item",
      value: 0,
      item: {
        _definitionId: 404,
        subtype: 237,
        _staticData: { id: 404, description: "任意评分球员挑选" },
      },
    }])).toEqual([{
      kind: "player_pick",
      id: 404,
      count: 1,
      label: "任意评分球员挑选",
    }]);
  });

  it("recognizes an explicit player-pick award type without an item payload", () => {
    expect(classifySbcRewards([{
      type: "player_pick",
      value: 505,
      displayName: "显式挑选奖励",
    }])).toEqual([{
      kind: "player_pick",
      id: 505,
      count: 1,
      label: "显式挑选奖励",
    }]);
  });

  it("prioritizes confirmed player-pick metadata over a pack-like award wrapper", () => {
    expect(classifySbcRewards([{
      type: "pack",
      isPack: true,
      value: 999,
      item: {
        _definitionId: 606,
        _subtype: 237,
        _staticData: {
          id: 606,
          name: "PlayerPickItemName_606",
          description: "清仓球员挑选",
        },
      },
    }])).toEqual([{
      kind: "player_pick",
      id: 606,
      count: 1,
      label: "清仓球员挑选",
    }]);
  });

  it("recognizes normalized player-pick types and outer reward metadata", () => {
    expect(classifySbcRewards([{
      type: "player-pick",
      subtype: 237,
      itemId: 808,
      displayName: "外层球员挑选",
    }])).toEqual([{
      kind: "player_pick",
      id: 808,
      count: 1,
      label: "外层球员挑选",
    }]);
  });

  it("uses the player-pick item definition before an unrelated award value", () => {
    expect(classifySbcRewards([{
      type: "item",
      value: 777,
      item: {
        definitionId: 707,
        subtype: 237,
        _staticData: { description: "延迟到账挑选" },
      },
    }])).toEqual([{
      kind: "player_pick",
      id: 707,
      count: 1,
      label: "延迟到账挑选",
    }]);
  });

  it("keeps safe diagnostics for rewards without a usable identifier", () => {
    expect(classifySbcRewards([{
      type: "item",
      displayName: "未知奖励",
    }])).toEqual([{
      kind: "unsupported",
      id: 0,
      count: 1,
      label: "未知奖励",
      diagnostic: {
        type: "item",
        isPack: false,
        isPlayerPick: false,
        itemDefinitionId: 0,
        awardValue: 0,
        itemSubtype: 0,
      },
    }]);
  });

  it("opens only the quantity added after the pack baseline", () => {
    const plan = createSbcExecutionContext(undefined).rewardPlan;
    plan.packBaselineByKey[packRewardKey(101, false)] = 10;
    recordExpectedRewards(plan, [{ kind: "pack", id: 101, count: 1, label: "A包" }]);

    expect(selectNewRewardPacks(plan, Array.from({ length: 10 }, () => ({
      id: 101,
      tradeable: false,
    })))).toEqual([]);

    const selections = selectNewRewardPacks(plan, Array.from({ length: 11 }, () => ({
      id: 101,
      tradeable: false,
    })));
    expect(selections).toEqual([{ id: 101, tradable: false, quantity: 1 }]);
    markRewardPacksProcessed(plan, selections);
    expect(hasPendingTrackedRewards(plan)).toBe(false);
  });

  it("tracks tradeable and untradeable additions without exceeding expected rewards", () => {
    const plan = createSbcExecutionContext(undefined).rewardPlan;
    plan.packBaselineByKey[packRewardKey(101, false)] = 3;
    plan.packBaselineByKey[packRewardKey(101, true)] = 2;
    recordExpectedRewards(plan, [{ kind: "pack", id: 101, count: 2, label: "混合包" }]);
    const inventory = [
      ...Array.from({ length: 4 }, () => ({ id: 101, tradeable: false })),
      ...Array.from({ length: 3 }, () => ({ id: 101, tradeable: true })),
    ];
    expect(selectNewRewardPacks(plan, inventory)).toEqual([
      { id: 101, tradable: false, quantity: 1 },
      { id: 101, tradable: true, quantity: 1 },
    ]);
  });

  it("selects the new player-pick item and leaves the historical one alone", () => {
    const plan = createSbcExecutionContext(undefined).rewardPlan;
    plan.playerPickBaselineById[202] = 1;
    plan.playerPickBaselineKeysById[202] = ["9001"];
    recordExpectedRewards(plan, [{
      kind: "player_pick",
      id: 202,
      count: 1,
      label: "87+ 球员挑选",
    }]);
    const historical = { id: 9001, definitionId: 202, subtype: 237 };
    const current = { id: 9002, definitionId: 202, subtype: 237 };

    expect(selectNewPlayerPickItems(plan, [historical])).toEqual([]);
    const selected = selectNewPlayerPickItems(plan, [historical, current]);
    expect(selected).toEqual([{
      item: current,
      definitionId: 202,
      label: "87+ 球员挑选",
    }]);
    markPlayerPickProcessed(plan, 202);
    expect(hasPendingTrackedRewards(plan)).toBe(false);
  });

  it("matches unassigned player picks that expose only private definition fields", () => {
    const plan = createSbcExecutionContext(undefined).rewardPlan;
    recordExpectedRewards(plan, [{
      kind: "player_pick",
      id: 404,
      count: 1,
      label: "私有字段挑选",
    }]);
    const current = {
      id: 9901,
      _definitionId: 404,
      subtype: 237,
      _staticData: { id: 404 },
    };
    expect(selectNewPlayerPickItems(plan, [current])).toEqual([{
      item: current,
      definitionId: 404,
      label: "私有字段挑选",
    }]);
  });

  it("consumes historical picks without marking the current reward processed", () => {
    const plan = createSbcExecutionContext(undefined).rewardPlan;
    plan.playerPickBaselineById[202] = 2;
    plan.playerPickBaselineKeysById[202] = ["9001", "9002"];
    recordExpectedRewards(plan, [{ kind: "player_pick", id: 202, count: 1, label: "奖励挑选" }]);

    expect(consumeHistoricalPlayerPickBaseline(
      plan,
      { id: 9001, definitionId: 202, subtype: 237 },
    )).toBe(true);
    expect(plan.playerPickBaselineById[202]).toBe(1);
    expect(plan.playerPickBaselineKeysById[202]).toEqual(["9002"]);
    expect(plan.processedPlayerPickById[202] || 0).toBe(0);
    expect(hasPendingTrackedRewards(plan)).toBe(true);
  });
});
