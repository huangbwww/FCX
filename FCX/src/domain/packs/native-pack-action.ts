export interface NativePackLike {
  id?: unknown;
  tradeable?: unknown;
}

export interface NativePackViewLike {
  getArticleId?: () => unknown;
  getRootElement?: () => unknown;
  querySelector?: (selectors: string) => Element | null;
  __root?: unknown;
  _rootElement?: unknown;
  _root?: unknown;
  root?: unknown;
}

export interface NativePackStoreViewLike {
  storePacks?: readonly NativePackViewLike[];
}

export interface NativePackStoreViewSearchResult {
  view: NativePackStoreViewLike | null;
  scanned: number;
}

export type NativePackViewMatchReason =
  | "matched"
  | "view_not_found"
  | "root_not_found"
  | "tradability_mismatch";

export interface NativePackViewMatch {
  view: NativePackViewLike | null;
  root: Element | null;
  reason: NativePackViewMatchReason;
}

function isPackRoot(value: unknown): value is Element {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Element>;
  return (
    typeof candidate.querySelector === "function" &&
    typeof candidate.classList?.contains === "function"
  );
}

export function resolveNativePackRoot(packView: NativePackViewLike): Element | null {
  let methodRoot: unknown;
  try {
    methodRoot = packView.getRootElement?.();
  } catch {
    methodRoot = undefined;
  }

  const candidates = [
    methodRoot,
    packView.__root,
    packView._rootElement,
    packView._root,
    packView.root,
  ];
  return candidates.find(isPackRoot) ?? null;
}

export function readNativePackArticleId(packView: NativePackViewLike): number | null {
  try {
    const value = Number(packView.getArticleId?.());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveNativePackPageWindow<T>(
  sandboxWindow: T,
  pageWindow: unknown,
): T {
  return pageWindow && (typeof pageWindow === "object" || typeof pageWindow === "function")
    ? pageWindow as T
    : sandboxWindow;
}

function isConnectedPackView(packView: NativePackViewLike): boolean {
  if (typeof packView.getArticleId !== "function") return false;
  const root = resolveNativePackRoot(packView);
  return Boolean(root?.isConnected);
}

export function findNativePackStoreView(
  roots: readonly unknown[],
  maxScanned = 800,
): NativePackStoreViewSearchResult {
  const queue = [...roots];
  const seen = new Set<object>();
  let scanned = 0;

  while (queue.length > 0 && scanned < maxScanned) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    scanned += 1;

    const candidate = current as NativePackStoreViewLike;
    if (
      Array.isArray(candidate.storePacks)
      && candidate.storePacks.some(isConnectedPackView)
    ) {
      return { view: candidate, scanned };
    }

    let keys: string[];
    try {
      keys = Object.keys(current);
    } catch {
      continue;
    }
    for (const key of keys) {
      let value: unknown;
      try {
        value = (current as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      if (
        Array.isArray(current)
        || Array.isArray(value)
        || /controller|view|root|navigation|presented|tab/i.test(key)
      ) {
        queue.push(value);
      }
    }
  }

  return { view: null, scanned };
}

export function inspectNativeOwnedPackView(
  storeView: NativePackStoreViewLike,
  pack: NativePackLike,
): NativePackViewMatch {
  const packId = Number(pack.id);
  if (!Number.isFinite(packId)) {
    return { view: null, root: null, reason: "view_not_found" };
  }

  const matchingViews = (storeView.storePacks ?? []).filter(
    (packView) => readNativePackArticleId(packView) === packId,
  );
  if (matchingViews.length === 0) {
    return { view: null, root: null, reason: "view_not_found" };
  }

  const rootedViews = matchingViews
    .map((view) => ({ view, root: resolveNativePackRoot(view) }))
    .filter(
      (candidate): candidate is { view: NativePackViewLike; root: Element } =>
        candidate.root !== null,
    );
  if (rootedViews.length === 0) {
    return { view: matchingViews[0] ?? null, root: null, reason: "root_not_found" };
  }

  const expectedTradable = Boolean(pack.tradeable);
  const match = rootedViews.find(
    ({ root }) =>
      !root.classList.contains("is-untradeable") === expectedTradable,
  );
  if (!match) {
    return { view: null, root: null, reason: "tradability_mismatch" };
  }
  return { view: match.view, root: match.root, reason: "matched" };
}

export function findNativePackFooter(
  match: Pick<NativePackViewMatch, "view" | "root">,
  selector = ".ut-store-pack-details-view--footer",
): Element | null {
  try {
    const viewFooter = match.view?.querySelector?.(selector);
    if (viewFooter) return viewFooter;
  } catch {
    // Some EA builds expose querySelector but throw while the view is rebuilding.
  }
  return match.root?.querySelector(selector) ?? null;
}
