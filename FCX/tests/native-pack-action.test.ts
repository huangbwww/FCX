import { beforeEach, describe, expect, it } from "vitest";
import {
  findNativePackFooter,
  findNativePackStoreView,
  inspectNativeOwnedPackView,
  resolveNativePackPageWindow,
  resolveNativePackRoot,
  type NativePackViewLike,
} from "../src/domain/packs/native-pack-action";

function packRoot(tradable = true): HTMLElement {
  const root = document.createElement("article");
  if (!tradable) root.classList.add("is-untradeable");
  return root;
}

describe("native pack action view matching", () => {
  beforeEach(() => document.body.replaceChildren());

  it("resolves the current EA _rootElement shape", () => {
    const root = packRoot();
    expect(resolveNativePackRoot({ _rootElement: root })).toBe(root);
  });

  it("prefers the real page window over the userscript sandbox", () => {
    const sandboxWindow = { name: "sandbox" };
    const pageWindow = { name: "page", UTStoreView: function UTStoreView() {} };

    expect(resolveNativePackPageWindow(sandboxWindow, pageWindow)).toBe(pageWindow);
    expect(resolveNativePackPageWindow(sandboxWindow, undefined)).toBe(sandboxWindow);
  });

  it("discovers a connected pack store view through the controller tree", () => {
    const root = packRoot();
    document.body.appendChild(root);
    const storeView = {
      storePacks: [{ getArticleId: () => 123, _rootElement: root }],
    };
    const controllerTree = {
      rootController: {
        navigationController: {
          currentView: storeView,
        },
      },
    };

    expect(findNativePackStoreView([controllerTree]).view).toBe(storeView);
  });

  it("does not trust a stale or disconnected store view", () => {
    const root = packRoot();
    const storeView = {
      storePacks: [{ getArticleId: () => 123, _rootElement: root }],
    };

    expect(findNativePackStoreView([storeView]).view).toBeNull();
  });

  it("uses the complete compatibility order and survives a throwing getter", () => {
    const fromMethod = packRoot();
    const fromPrivate = packRoot();
    const fromRoot = packRoot();

    expect(resolveNativePackRoot({
      getRootElement: () => fromMethod,
      __root: fromPrivate,
      _rootElement: fromRoot,
    })).toBe(fromMethod);
    expect(resolveNativePackRoot({
      getRootElement: () => { throw new Error("not ready"); },
      _rootElement: fromPrivate,
    })).toBe(fromPrivate);
    expect(resolveNativePackRoot({ root: fromRoot })).toBe(fromRoot);
  });

  it("matches same-id tradable and untradeable pack views independently", () => {
    const tradableRoot = packRoot(true);
    const untradeableRoot = packRoot(false);
    const storeView = {
      storePacks: [
        { getArticleId: () => 123, _rootElement: tradableRoot },
        { getArticleId: () => 123, _rootElement: untradeableRoot },
      ],
    };

    expect(inspectNativeOwnedPackView(storeView, { id: 123, tradeable: true }))
      .toEqual({ view: storeView.storePacks[0], root: tradableRoot, reason: "matched" });
    expect(inspectNativeOwnedPackView(storeView, { id: 123, tradeable: false }))
      .toEqual({ view: storeView.storePacks[1], root: untradeableRoot, reason: "matched" });
  });

  it("reports the stage that prevented mounting", () => {
    const rootless: NativePackViewLike = { getArticleId: () => 123 };
    expect(inspectNativeOwnedPackView({ storePacks: [] }, { id: 123 }))
      .toEqual({ view: null, root: null, reason: "view_not_found" });
    expect(inspectNativeOwnedPackView({ storePacks: [rootless] }, { id: 123 }))
      .toEqual({ view: rootless, root: null, reason: "root_not_found" });
    expect(inspectNativeOwnedPackView({
      storePacks: [{ getArticleId: () => 123, _rootElement: packRoot(false) }],
    }, { id: 123, tradeable: true }))
      .toEqual({ view: null, root: null, reason: "tradability_mismatch" });
  });

  it("uses the EA view query interface before falling back to the root", () => {
    const viewFooter = document.createElement("footer");
    const rootFooter = document.createElement("footer");
    const root = packRoot();
    rootFooter.className = "ut-store-pack-details-view--footer";
    root.appendChild(rootFooter);

    expect(findNativePackFooter({
      view: { querySelector: () => viewFooter },
      root,
    })).toBe(viewFooter);
    expect(findNativePackFooter({
      view: { querySelector: () => null },
      root,
    })).toBe(rootFooter);
  });
});
