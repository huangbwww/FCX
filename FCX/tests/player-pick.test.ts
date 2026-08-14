import { describe, expect, it } from "vitest";
import {
  PLAYER_PICK_CONFIRM_WAIT_MS,
  PLAYER_PICK_MAX_ATTEMPTS,
  PLAYER_PICK_REPOSITORY_WAIT_MS,
  PLAYER_PICK_REWARD_ATTEMPTS,
  PLAYER_PICK_REWARD_WAIT_MS,
  PLAYER_PICK_ROUTING_PASSES,
  PLAYER_PICK_ROUTING_WAIT_MS,
  PLAYER_PICK_UNASSIGNED_TIMEOUT_MS,
  choosePlayerPickCandidates,
  confirmedPlayerPickSelections,
  normalizePlayerPickPayload,
  playerPickFailureMessage,
} from "../src/domain/packs/player-pick";

interface Candidate {
  id: number;
  definitionId: number;
  rating: number;
  duplicate?: boolean;
}

const inspect = (item: Candidate) => ({
  rating: item.rating,
  definitionId: item.definitionId,
  duplicate: item.duplicate === true,
});

describe("automatic player-pick helpers", () => {
  it("normalizes both supported EA response shapes", () => {
    expect(normalizePlayerPickPayload({
      data: { playerPicks: [{ id: 1 }], availablePicks: 1, ownership: [false] },
    })).toEqual({ items: [{ id: 1 }], availablePicks: 1, ownership: [false] });
    expect(normalizePlayerPickPayload({
      response: { items: [{ id: 2 }], availablePicks: 1, ownership: [true] },
    })).toEqual({ items: [{ id: 2 }], availablePicks: 1, ownership: [true] });
    expect(normalizePlayerPickPayload({
      response: {
        data: { playerPicks: [{ id: 3 }], availablePicks: 1, ownership: [false] },
      },
    })).toEqual({ items: [{ id: 3 }], availablePicks: 1, ownership: [false] });
  });

  it("sorts by overall and prefers a non-duplicate on equal ratings", () => {
    const items: Candidate[] = [
      { id: 1, definitionId: 101, rating: 91, duplicate: true },
      { id: 2, definitionId: 102, rating: 91 },
      { id: 3, definitionId: 103, rating: 90 },
    ];
    expect(choosePlayerPickCandidates(
      { items, availablePicks: 1 },
      "ovr",
      inspect,
    )).toEqual([items[1]]);
  });

  it("sorts priced candidates first and falls back to overall for missing prices", () => {
    const items: Candidate[] = [
      { id: 1, definitionId: 101, rating: 94 },
      { id: 2, definitionId: 102, rating: 88 },
      { id: 3, definitionId: 103, rating: 92 },
    ];
    const prices = new Map([[102, 30_000], [103, 20_000]]);
    expect(choosePlayerPickCandidates(
      { items, availablePicks: 3 },
      "price",
      inspect,
      prices,
    )).toEqual([items[1], items[2], items[0]]);
    expect(choosePlayerPickCandidates(
      { items, availablePicks: 1 },
      "price",
      inspect,
    )).toEqual([items[0]]);
  });

  it("uses ownership for confirmed duplicate state", () => {
    const items: Candidate[] = [
      { id: 1, definitionId: 101, rating: 90 },
      { id: 2, definitionId: 102, rating: 89 },
    ];
    expect(confirmedPlayerPickSelections(
      { items, availablePicks: 2, ownership: [true, false] },
      items,
    )).toEqual([
      { item: items[0], duplicate: true },
      { item: items[1], duplicate: false },
    ]);
  });

  it("exposes the exact timing and safety limits", () => {
    expect(PLAYER_PICK_MAX_ATTEMPTS).toBe(60);
    expect(PLAYER_PICK_UNASSIGNED_TIMEOUT_MS).toBe(10_000);
    expect(PLAYER_PICK_REPOSITORY_WAIT_MS).toBe(300);
    expect(PLAYER_PICK_CONFIRM_WAIT_MS).toBe(900);
    expect([PLAYER_PICK_REWARD_ATTEMPTS, PLAYER_PICK_REWARD_WAIT_MS]).toEqual([16, 500]);
    expect([PLAYER_PICK_ROUTING_PASSES, PLAYER_PICK_ROUTING_WAIT_MS]).toEqual([3, 400]);
  });

  it("localizes session expiry and timeout failures", () => {
    expect(playerPickFailureMessage("open", 401)).toContain("EA登录状态已失效");
    expect(playerPickFailureMessage("unassigned", "timeout")).toContain("读取未分配物品超时");
  });
});
