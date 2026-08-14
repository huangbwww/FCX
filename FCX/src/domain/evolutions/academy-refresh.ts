export interface AcademyClubListRefreshResult<T> {
  player: T | null;
  attempted: boolean;
  timedOut: boolean;
  source: "club-list" | "unavailable" | "timeout" | "not-found" | "request-error";
}

interface ObservableLike {
  observe(context: object, callback: () => void): void;
  unobserve?(context: object): void;
}

interface ClubListViewModelLike<T> {
  _collection?: T[];
  resetCollection?(items: T[]): void;
  setIndex?(index: number): void;
  getPageItems?(): T[];
}

interface ClubListControllerLike<T> {
  clubViewModel?: ClubListViewModelLike<T>;
  searchCriteria?: { offset?: number };
  onDataChange?: ObservableLike;
  _requestItems?(append: boolean): void;
  updateItemList?(items: T[], animated: boolean): void;
}

export async function refreshAcademyClubList<T>(options: {
  controller: ClubListControllerLike<T> | null | undefined;
  candidateIds: readonly number[];
  getItemId: (item: T) => number;
  removeStaleItem?: (item: T) => void;
  timeoutMs?: number;
}): Promise<AcademyClubListRefreshResult<T>> {
  const controller = options.controller;
  const viewModel = controller?.clubViewModel;
  const dataChange = controller?.onDataChange;
  if (
    !controller ||
    !viewModel ||
    !Array.isArray(viewModel._collection) ||
    typeof controller._requestItems !== "function" ||
    typeof dataChange?.observe !== "function"
  ) {
    return {
      player: null,
      attempted: false,
      timedOut: false,
      source: "unavailable",
    };
  }

  const candidateIds = [...new Set(options.candidateIds.map(Number).filter((id) => id > 0))];
  const requestItems = controller._requestItems.bind(controller);
  const staleItems = viewModel._collection.filter((item) =>
    candidateIds.includes(Number(options.getItemId(item))),
  );
  for (const item of staleItems) {
    try { options.removeStaleItem?.(item); } catch { /* best effort */ }
  }
  if (controller.searchCriteria) controller.searchCriteria.offset = 0;
  try {
    if (typeof viewModel.resetCollection === "function") viewModel.resetCollection([]);
    else viewModel._collection = [];
  } catch {
    viewModel._collection = [];
  }

  return new Promise((resolve) => {
    const observerContext = {};
    let settled = false;
    const finish = (result: AcademyClubListRefreshResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { dataChange.unobserve?.(observerContext); } catch { /* best effort */ }
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ player: null, attempted: true, timedOut: true, source: "timeout" });
    }, options.timeoutMs ?? 8000);

    dataChange.observe(observerContext, () => {
      const collection = Array.isArray(viewModel._collection) ? viewModel._collection : [];
      let player: T | null = null;
      for (const candidateId of candidateIds) {
        player = collection.find((item) => Number(options.getItemId(item)) === candidateId) || null;
        if (player) break;
      }
      if (player) {
        const index = collection.indexOf(player);
        if (index >= 0) viewModel.setIndex?.(index);
      }
      if (typeof controller.updateItemList === "function" && typeof viewModel.getPageItems === "function") {
        controller.updateItemList(viewModel.getPageItems(), true);
      }
      finish({
        player,
        attempted: true,
        timedOut: false,
        source: player ? "club-list" : "not-found",
      });
    });

    try {
      requestItems(false);
    } catch {
      finish({ player: null, attempted: true, timedOut: false, source: "request-error" });
    }
  });
}
