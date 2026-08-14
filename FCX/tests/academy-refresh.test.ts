import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshAcademyClubList } from "../src/domain/evolutions/academy-refresh";

interface Player {
  id: number;
  name: string;
}

function observable() {
  let callback: (() => void) | null = null;
  return {
    observe: vi.fn((_context: object, next: () => void) => { callback = next; }),
    unobserve: vi.fn(),
    notify: () => callback?.(),
  };
}

describe("Academy club-list refresh", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the open club list and selects the newest matching player", async () => {
    const changes = observable();
    const stale = { id: 10, name: "stale" };
    const fresh = { id: 20, name: "fresh" };
    const viewModel = {
      _collection: [stale] as Player[],
      resetCollection: vi.fn((items: Player[]) => { viewModel._collection = items; }),
      setIndex: vi.fn(),
      getPageItems: vi.fn(() => viewModel._collection),
    };
    const controller = {
      clubViewModel: viewModel,
      searchCriteria: { offset: 200 },
      onDataChange: changes,
      _requestItems: vi.fn(() => {
        viewModel._collection = [fresh];
        changes.notify();
      }),
      updateItemList: vi.fn(),
    };
    const removeStaleItem = vi.fn();

    const result = await refreshAcademyClubList({
      controller,
      candidateIds: [20, 10],
      getItemId: (player) => player.id,
      removeStaleItem,
      timeoutMs: 100,
    });

    expect(result).toEqual({
      player: fresh,
      attempted: true,
      timedOut: false,
      source: "club-list",
    });
    expect(removeStaleItem).toHaveBeenCalledWith(stale);
    expect(controller.searchCriteria.offset).toBe(0);
    expect(viewModel.resetCollection).toHaveBeenCalledWith([]);
    expect(controller._requestItems).toHaveBeenCalledWith(false);
    expect(viewModel.setIndex).toHaveBeenCalledWith(0);
    expect(controller.updateItemList).toHaveBeenCalledWith([fresh], true);
    expect(changes.unobserve).toHaveBeenCalledOnce();
  });

  it("returns unavailable without mutating a missing controller", async () => {
    await expect(refreshAcademyClubList<Player>({
      controller: null,
      candidateIds: [10],
      getItemId: (player) => player.id,
    })).resolves.toEqual({
      player: null,
      attempted: false,
      timedOut: false,
      source: "unavailable",
    });
  });

  it("stops waiting after eight-second style timeout and unobserves", async () => {
    vi.useFakeTimers();
    const changes = observable();
    const controller = {
      clubViewModel: {
        _collection: [] as Player[],
        resetCollection: vi.fn(),
      },
      searchCriteria: { offset: 0 },
      onDataChange: changes,
      _requestItems: vi.fn(),
    };
    const pending = refreshAcademyClubList({
      controller,
      candidateIds: [10],
      getItemId: (player: Player) => player.id,
      timeoutMs: 8000,
    });
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toEqual({
      player: null,
      attempted: true,
      timedOut: true,
      source: "timeout",
    });
    expect(changes.unobserve).toHaveBeenCalledOnce();
  });

  it("reports a synchronous request failure without leaving the observer", async () => {
    const changes = observable();
    const controller = {
      clubViewModel: {
        _collection: [] as Player[],
        resetCollection: vi.fn(),
      },
      searchCriteria: { offset: 0 },
      onDataChange: changes,
      _requestItems: vi.fn(() => { throw new Error("request failed"); }),
    };
    await expect(refreshAcademyClubList({
      controller,
      candidateIds: [10],
      getItemId: (player: Player) => player.id,
      timeoutMs: 100,
    })).resolves.toEqual({
      player: null,
      attempted: true,
      timedOut: false,
      source: "request-error",
    });
    expect(changes.unobserve).toHaveBeenCalledOnce();
  });
});
