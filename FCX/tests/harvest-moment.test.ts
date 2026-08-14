import { describe, expect, it, vi } from "vitest";

import {
  HarvestMomentController,
  normalizeNtfyTopic,
  selectHarvestCandidates,
} from "../src/domain/harvest/runtime";
import type { GmValueAdapter } from "../src/remote/auth-store";
import type { GmCompatRequest } from "../src/types/userscript";


function memoryAdapter(): GmValueAdapter {
  const values = new Map<string, unknown>();
  return {
    get: async <T>(key: string, fallback: T) =>
      (values.has(key) ? values.get(key) : fallback) as T,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  };
}

function successfulRequest(): GmCompatRequest {
  return (options) => options.onload?.({
    responseText: "ok",
    status: 200,
    statusText: "OK",
    finalUrl: options.url,
    responseHeaders: "",
  });
}

const player = (id: number, rating: number, duplicateId = 0) => ({
  id,
  rating,
  duplicateId,
  _staticData: { name: `Player ${id}` },
  isPlayer: () => true,
});

describe("harvest moment", () => {
  it("accepts only official ntfy topics", () => {
    expect(normalizeNtfyTopic("my_topic-1")).toBe("https://ntfy.sh/my_topic-1");
    expect(normalizeNtfyTopic("https://ntfy.sh/topic")).toBe("https://ntfy.sh/topic");
    expect(() => normalizeNtfyTopic("https://example.com/topic")).toThrow(/ntfy\.sh/);
    expect(() => normalizeNtfyTopic("https://ntfy.sh/topic/child")).toThrow(/ntfy\.sh/);
    expect(() => normalizeNtfyTopic("bad/topic")).toThrow(/主题/);
  });

  it("filters disabled, low-rated, duplicate and non-player items", () => {
    const items = [
      player(1, 88),
      player(2, 87),
      player(3, 95, 10),
      { id: 4, rating: 99, duplicateId: 0, isPlayer: () => false },
    ];
    expect(selectHarvestCandidates(items, {
      enabled: true,
      minRating: 88,
      ntfyTopic: "",
    }, new Set())).toEqual([items[0]]);
    expect(selectHarvestCandidates(items, {
      enabled: false,
      minRating: 0,
      ntfyTopic: "",
    }, new Set())).toEqual([]);
  });

  it("captures each instance once and uploads the compatible record", async () => {
    const controller = new HarvestMomentController(
      memoryAdapter(),
      successfulRequest(),
      {
        now: () => new Date("2026-08-03T12:00:00Z"),
        randomId: () => "harvest-1",
      },
    );
    await controller.initialize();
    await controller.saveConfig({ enabled: true, minRating: 88, ntfyTopic: "" });
    const upload = vi.fn(async () => ({ created: true }));
    controller.setUploader(upload);

    expect(controller.captureItems([player(10, 88)], "奖励包")).toHaveLength(1);
    expect(controller.captureItems([player(10, 88)], "奖励包")).toHaveLength(0);
    await controller.flushPending();

    expect(upload).toHaveBeenCalledWith({
      client_harvest_id: "harvest-1",
      player_name: "Player 10",
      rating: 88,
      status: "captured",
      source_task: "奖励包",
      harvested_at: "2026-08-03T12:00:00.000Z",
    });
    expect(controller.getRecords()).toHaveLength(1);
  });

  it("persists settings but starts every page session with an empty list", async () => {
    const storage = memoryAdapter();
    const first = new HarvestMomentController(storage, successfulRequest());
    await first.initialize();
    await first.saveConfig({ enabled: true, minRating: 91, ntfyTopic: "topic" });
    first.captureItems([player(5, 95)], "卡包");

    const reloaded = new HarvestMomentController(storage, successfulRequest());
    await reloaded.initialize();
    expect(reloaded.getConfig()).toEqual({ enabled: true, minRating: 91, ntfyTopic: "topic" });
    expect(reloaded.getRecords()).toEqual([]);
  });

  it("records and notifies every matching player without blocking pack handling", async () => {
    const finishRequests: Array<() => void> = [];
    const request: GmCompatRequest = (options) => {
      finishRequests.push(() => options.onload?.({
        responseText: "ok",
        status: 200,
        statusText: "OK",
        finalUrl: options.url,
        responseHeaders: "",
      }));
    };
    let nextId = 0;
    const controller = new HarvestMomentController(memoryAdapter(), request, {
      randomId: () => `harvest-${++nextId}`,
    });
    await controller.initialize();
    await controller.saveConfig({ enabled: true, minRating: 88, ntfyTopic: "my-topic" });

    const captured = controller.captureItems(
      [player(21, 88), player(22, 93)],
      "永动机奖励包",
    );

    expect(captured).toHaveLength(2);
    expect(captured.every((item) => item.ntfy_status === "pending")).toBe(true);
    finishRequests.forEach((finish) => finish());
    await vi.waitFor(() => {
      expect(controller.getRecords().every((item) => item.ntfy_status === "sent")).toBe(true);
    });
  });
});
