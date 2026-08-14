import { beforeEach, describe, expect, it, vi } from "vitest";
import { openPackTaskSummaryDialog } from "../src/ui/pack-task-summary";
import {
  addPackPlayers,
  createPackTaskSummary,
  mergePackTaskSummary,
  setPlayerDestination,
} from "../src/domain/packs/task-summary";

describe("pack task summary", () => {
  beforeEach(() => document.body.replaceChildren());

  it("renders all players and updates prices asynchronously", async () => {
    const summary = createPackTaskSummary();
    summary.packsOpened = 2;
    summary.players.push({
      instanceId: 1,
      definitionId: 101,
      name: "Player One",
      rating: 91,
      rarity: "Special",
      special: true,
      evolution: false,
      tradeable: false,
      duplicate: true,
      source: "Reward Pack",
      destination: "storage",
    });
    summary.destinations.storage = 1;
    const prices = new Map<number, number>();
    const requestPrices = vi.fn(async () => void prices.set(101, 12_500));

    openPackTaskSummaryDialog(summary, {
      getPrice: (id) => prices.get(id),
      requestPrices,
    });
    expect(document.querySelector(".fcx-pack-summary")?.textContent).toContain(
      "Player One",
    );
    expect(document.querySelector('[data-price-id="101"]')?.textContent).toBe("—");
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('[data-price-id="101"]')?.textContent).toBe(
      "12,500",
    );
    expect(requestPrices).toHaveBeenCalledWith([101]);
  });

  it("keeps every player-pick result when EA reuses temporary item ids", () => {
    const summary = createPackTaskSummary();
    const base = {
      instanceId: 2,
      definitionId: 101,
      name: "Repeated Slot",
      rating: 88,
      rarity: "Gold Rare",
      special: false,
      evolution: false,
      tradeable: false,
      duplicate: false,
      source: "5选1球员挑选",
      destination: "unknown" as const,
    };
    addPackPlayers(summary, [
      { ...base, summaryKey: "pick:1:0:101" },
      { ...base, definitionId: 102, summaryKey: "pick:2:0:102" },
    ]);
    expect(summary.players).toHaveLength(2);
    setPlayerDestination(summary, 9002, "storage", 102);
    setPlayerDestination(summary, 9001, "club", 101);
    expect(summary.players.map((player) => player.destination)).toEqual([
      "club",
      "storage",
    ]);
  });

  it("keeps repeated player-pick slot ids while merging task summaries", () => {
    const combined = createPackTaskSummary();
    const first = createPackTaskSummary();
    const second = createPackTaskSummary();
    const base = {
      instanceId: 3,
      definitionId: 201,
      name: "Reused Choice Slot",
      rating: 89,
      rarity: "Gold Rare",
      special: false,
      evolution: false,
      tradeable: false,
      duplicate: false,
      source: "5选1球员挑选",
      destination: "club" as const,
    };
    addPackPlayers(first, [{ ...base, summaryKey: "pick:1:0:201" }]);
    addPackPlayers(second, [{
      ...base,
      definitionId: 202,
      summaryKey: "pick:2:0:202",
      destination: "storage" as const,
    }]);

    mergePackTaskSummary(combined, first);
    mergePackTaskSummary(combined, second);

    expect(combined.players).toHaveLength(2);
    expect(combined.players.map((player) => player.definitionId)).toEqual([201, 202]);
    expect(combined.players.map((player) => player.destination)).toEqual([
      "club",
      "storage",
    ]);
  });

  it("merges fallback and target packs in their actual opening order", () => {
    const combined = createPackTaskSummary();
    const fallback = createPackTaskSummary();
    const target = createPackTaskSummary();
    fallback.packsOpened = 1;
    fallback.picksCompleted = 1;
    fallback.players.push({
      instanceId: 11,
      definitionId: 101,
      name: "TOTW",
      rating: 86,
      rarity: "TOTW",
      special: true,
      evolution: false,
      tradeable: false,
      duplicate: false,
      source: "84+ TOTW",
      destination: "club",
    });
    fallback.destinations.club = 1;
    target.packsOpened = 1;
    target.players.push({
      instanceId: 12,
      definitionId: 102,
      name: "Main Reward",
      rating: 89,
      rarity: "Special",
      special: true,
      evolution: false,
      tradeable: false,
      duplicate: false,
      source: "7 x 87+",
      destination: "club",
    });
    target.destinations.club = 1;
    fallback.sbcSubmissions.push({
      sequence: 1,
      setId: 1017,
      challengeId: 1,
      setName: "TOTW Supply",
      challengeName: "TOTW",
      submittedAt: "2026-08-06T00:00:00.000Z",
      players: [],
    });
    target.sbcSubmissions.push({
      sequence: 1,
      setId: 2000,
      challengeId: 2,
      setName: "Main SBC",
      challengeName: "Main",
      submittedAt: "2026-08-06T00:01:00.000Z",
      players: [],
    });

    mergePackTaskSummary(combined, fallback);
    mergePackTaskSummary(combined, target);

    expect(combined.packsOpened).toBe(2);
    expect(combined.picksCompleted).toBe(1);
    expect(combined.players.map((player) => player.name)).toEqual([
      "TOTW",
      "Main Reward",
    ]);
    expect(combined.destinations.club).toBe(2);
    expect(combined.sbcSubmissions.map((submission) => [submission.sequence, submission.setName])).toEqual([
      [1, "TOTW Supply"],
      [2, "Main SBC"],
    ]);
  });

  it("opens consumed players grouped by successful SBC submission", () => {
    const summary = createPackTaskSummary();
    summary.sbcSubmissions.push({
      sequence: 1,
      setId: 10,
      challengeId: 20,
      setName: "Upgrade SBC",
      challengeName: "Squad 1",
      submittedAt: "2026-08-06T01:02:03.000Z",
      players: [{
        slot: 0,
        instanceId: 99,
        definitionId: 199,
        name: "Used Player",
        rating: 87,
        rarity: "Gold Rare",
        tradeable: false,
        duplicate: true,
        storage: false,
        location: "duplicate",
      }],
    });
    openPackTaskSummaryDialog(summary, {
      getPrice: () => undefined,
      requestPrices: async () => undefined,
      pricesEnabled: false,
    });
    const button = [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent === "查看消耗球员（1）");
    expect(button).toBeTruthy();
    button?.click();
    const dialog = document.querySelector("#fcx-consumption-summary-modal");
    expect(dialog?.textContent).toContain("Upgrade SBC");
    expect(dialog?.textContent).toContain("Squad 1");
    expect(dialog?.textContent).toContain("Used Player");
    expect(dialog?.textContent).toContain("重复球员");
    [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent === "返回开包总结")
      ?.click();
    expect(document.querySelector("#fcx-consumption-summary-modal")).toBeNull();
    expect(document.querySelector("#fcx-pack-summary-modal")).not.toBeNull();
  });

  it("shows a summary for a pure player-pick reward", () => {
    const summary = createPackTaskSummary();
    summary.picksCompleted = 1;
    summary.players.push({
      instanceId: 21,
      definitionId: 202,
      name: "Pick Winner",
      rating: 92,
      rarity: "Special",
      special: true,
      evolution: false,
      tradeable: false,
      duplicate: false,
      source: "87+ 球员挑选",
      destination: "club",
    });

    openPackTaskSummaryDialog(summary, {
      getPrice: () => undefined,
      requestPrices: async () => undefined,
    });
    const text = document.querySelector(".fcx-pack-summary")?.textContent;
    expect(text).toContain("球员挑选");
    expect(text).toContain("Pick Winner");
    expect(text).toContain("87+ 球员挑选");
  });
});
