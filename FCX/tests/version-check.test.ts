import { describe, expect, it, vi } from "vitest";

import {
  compareFcxVersions,
  parseFcxVersionManifest,
  requestFcxVersionManifest,
} from "../src/update/version-check";
import type {
  GmCompatRequest,
  GmCompatRequestOptions,
} from "../src/types/userscript";

const manifest = JSON.stringify({
  schema_version: 1,
  latest_version: "26.0.10",
  release_date: "2026-08-04",
  update_notes: ["修复问题", "优化更新提醒"],
});

describe("FCX version manifest", () => {
  it("compares numeric version segments instead of lexicographic text", () => {
    expect(compareFcxVersions("26.0.9", "26.0.10")).toBe(-1);
    expect(compareFcxVersions("26.1.0", "26.0.10")).toBe(1);
    expect(compareFcxVersions("26.0.1", "26.0.1")).toBe(0);
  });

  it("parses the supported manifest and rejects HTML or invalid fields", () => {
    expect(parseFcxVersionManifest(manifest).latest_version).toBe("26.0.10");
    expect(() => parseFcxVersionManifest("<html>not found</html>"))
      .toThrow("网页内容");
    expect(() => parseFcxVersionManifest('{"schema_version":1}'))
      .toThrow("最新版本号格式错误");
    expect(() => compareFcxVersions("26.0", "26.0.1"))
      .toThrow("当前版本号无效");
  });

  it("requests uncached JSON with a bounded timeout", async () => {
    const request = vi.fn((options: GmCompatRequestOptions) => {
      options.onload?.({
        responseText: manifest,
        status: 200,
        statusText: "OK",
        finalUrl: options.url,
        responseHeaders: new Headers(),
      });
    }) as GmCompatRequest;
    await expect(requestFcxVersionManifest(request, { now: () => 123 }))
      .resolves.toMatchObject({ latest_version: "26.0.10" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://fczhushou.com/fcx/version.json?_=123",
      timeout: 6_000,
      headers: { Accept: "application/json" },
    }));
  });

  it("reports HTTP, network and timeout failures", async () => {
    const httpRequest = ((options: GmCompatRequestOptions) => {
      options.onload?.({
        responseText: "not found",
        status: 404,
        statusText: "Not Found",
        finalUrl: options.url,
        responseHeaders: "",
      });
    }) as GmCompatRequest;
    await expect(requestFcxVersionManifest(httpRequest)).rejects.toThrow("HTTP 404");

    const networkRequest = ((options: GmCompatRequestOptions) => {
      options.onerror?.({ status: 0 });
    }) as GmCompatRequest;
    await expect(requestFcxVersionManifest(networkRequest)).rejects.toThrow("网络连接");

    const timeoutRequest = ((options: GmCompatRequestOptions) => {
      options.ontimeout?.({ status: 0 });
    }) as GmCompatRequest;
    await expect(requestFcxVersionManifest(timeoutRequest)).rejects.toThrow("检查超时");
  });
});
