import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GmValueAdapter } from "../src/remote/auth-store";
import type {
  GmCompatRequest,
  GmCompatRequestOptions,
} from "../src/types/userscript";
import { mountFcxHeaderSupport, type FcxHeaderSupportHandle } from "../src/ui/support";
import {
  FCX_UPDATE_HOMEPAGE_URL,
  FCX_UPDATE_PROMPT_STORAGE_KEY,
  FcxVersionUpdateController,
} from "../src/ui/version-update";

function createHeader(): FcxHeaderSupportHandle {
  const bar = document.createElement("div");
  bar.className = "ut-navigation-bar-view";
  const title = document.createElement("h1");
  title.className = "title";
  bar.appendChild(title);
  document.body.appendChild(bar);
  return mountFcxHeaderSupport(document, { currentVersion: "26.0.1" });
}

function response(latestVersion: string): string {
  return JSON.stringify({
    schema_version: 1,
    latest_version: latestVersion,
    release_date: "2026-08-04",
    update_notes: [`发布 ${latestVersion}`],
  });
}

function createRequest(latestVersion: () => string): GmCompatRequest {
  return vi.fn((options: GmCompatRequestOptions) => {
    options.onload?.({
      responseText: response(latestVersion()),
      status: 200,
      statusText: "OK",
      finalUrl: options.url,
      responseHeaders: new Headers(),
    });
  }) as GmCompatRequest;
}

function createStorage(): GmValueAdapter & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    get: async <T>(key: string, fallback: T) =>
      (values.has(key) ? values.get(key) : fallback) as T,
    set: async <T>(key: string, value: T) => { values.set(key, value); },
    delete: async (key: string) => { values.delete(key); },
  };
}

describe("FCX update reminder", () => {
  let header: FcxHeaderSupportHandle | undefined;

  beforeEach(() => document.body.replaceChildren());
  afterEach(() => {
    header?.stop();
    header = undefined;
    document.body.replaceChildren();
  });

  it("shows an update once per target version per day", async () => {
    header = createHeader();
    const storage = createStorage();
    let latestVersion = "26.0.2";
    let now = 1_000;
    const controller = new FcxVersionUpdateController({
      currentVersion: "26.0.1",
      request: createRequest(() => latestVersion),
      storage,
      header,
      documentRef: document,
      now: () => now,
    });

    await controller.checkAutomatically();
    expect(document.getElementById("fcx-version-update-modal")?.textContent)
      .toContain("发现新版本 26.0.2");
    expect(storage.values.get(FCX_UPDATE_PROMPT_STORAGE_KEY)).toEqual({
      targetVersion: "26.0.2",
      promptedAt: 1_000,
    });

    document.getElementById("fcx-version-update-modal")?.remove();
    now += 60_000;
    await controller.checkAutomatically();
    expect(document.getElementById("fcx-version-update-modal")).toBeNull();

    latestVersion = "26.0.3";
    await controller.checkAutomatically();
    expect(document.getElementById("fcx-version-update-modal")?.textContent)
      .toContain("发现新版本 26.0.3");
  });

  it("manual checks always report the current status and use the fixed homepage", async () => {
    header = createHeader();
    const controller = new FcxVersionUpdateController({
      currentVersion: "26.0.1",
      request: createRequest(() => "26.0.1"),
      storage: createStorage(),
      header,
      documentRef: document,
    });
    await controller.checkManually();
    expect(document.getElementById("fcx-version-update-modal")?.textContent)
      .toContain("已是最新版本");

    document.getElementById("fcx-version-update-modal")?.remove();
    const updateController = new FcxVersionUpdateController({
      currentVersion: "26.0.1",
      request: createRequest(() => "26.0.2"),
      storage: createStorage(),
      header,
      documentRef: document,
    });
    await updateController.checkManually();
    const homepage = document.querySelector<HTMLAnchorElement>(
      "#fcx-version-update-modal a",
    );
    expect(homepage?.href).toBe(FCX_UPDATE_HOMEPAGE_URL);
    expect(homepage?.target).toBe("_blank");
    expect(homepage?.rel).toBe("noopener noreferrer");
  });

  it("keeps automatic failures quiet but explains manual failures", async () => {
    header = createHeader();
    const request = ((options: GmCompatRequestOptions) => {
      options.onerror?.({ status: 0 });
    }) as GmCompatRequest;
    const controller = new FcxVersionUpdateController({
      currentVersion: "26.0.1",
      request,
      storage: createStorage(),
      header,
      documentRef: document,
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await controller.checkAutomatically();
    expect(document.getElementById("fcx-version-update-modal")).toBeNull();
    expect(warning).toHaveBeenCalled();

    await controller.checkManually();
    expect(document.getElementById("fcx-version-update-modal")?.textContent)
      .toContain("版本检查失败，请检查网络连接");
    expect(document.getElementById("fcx-version-update-modal")?.textContent)
      .toContain("重新检查");
  });
});
