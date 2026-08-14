import { describe, expect, it, vi } from "vitest";
import {
  HttpRequestError,
  postJsonCompat,
  requestTextCompat,
  requestTextWithRetry,
} from "../src/api/http";

describe("HTTP compatibility adapters", () => {
  it("reads responseText through the GM-compatible callback shape", async () => {
    const request = vi.fn((options) => {
      options.onload?.({
        responseText: '{"logs":[]}',
        status: 200,
        statusText: "OK",
        finalUrl: options.url,
        responseHeaders: new Headers(),
      });
    });
    await expect(requestTextCompat("http://example.test", request)).resolves.toBe(
      '{"logs":[]}',
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", url: "http://example.test" }),
    );
  });

  it("rejects 403 responses and does not retry hard failures", async () => {
    const request = vi.fn((options) =>
      options.onload?.({
        responseText: "forbidden",
        status: 403,
        statusText: "Forbidden",
        finalUrl: options.url,
        responseHeaders: "",
      }),
    );

    await expect(
      requestTextWithRetry("https://www.fut.gg/api", request, {
        delay: vi.fn(async () => undefined),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("shows the server's Chinese business error instead of a bare HTTP status", async () => {
    const request = vi.fn((options) =>
      options.onload?.({
        responseText: JSON.stringify({
          error: "DEVICE_LIMIT_ERROR",
          message: "设备数量已达上限(5/5)，请在设备管理中删除旧设备后重试",
          detail: null,
        }),
        status: 403,
        statusText: "Forbidden",
        finalUrl: options.url,
        responseHeaders: "",
      }),
    );

    await expect(requestTextCompat("https://fc.fczhushou.com/api/auth/login", request))
      .rejects.toThrow("设备数量已达上限(5/5)，请在设备管理中删除旧设备后重试");
  });

  it("adds retry guidance to registration rate-limit responses", async () => {
    const request = vi.fn((options) =>
      options.onload?.({
        responseText: JSON.stringify({
          error: "RATE_LIMIT_ERROR",
          message: "注册请求过于频繁",
          retry_after: 37,
        }),
        status: 429,
        statusText: "Too Many Requests",
        finalUrl: options.url,
        responseHeaders: "",
      }),
    );

    await expect(requestTextCompat("https://fc.fczhushou.com/api/auth/register", request))
      .rejects.toThrow("注册请求过于频繁，请 37 秒后再试");
  });

  it("also reads business errors from GM onerror callbacks", async () => {
    const request = vi.fn((options) =>
      options.onerror?.({
        responseText: JSON.stringify({ message: "账号已被禁用" }),
        status: 403,
        statusText: "Forbidden",
      }),
    );

    await expect(requestTextCompat("https://fc.fczhushou.com/api/auth/login", request))
      .rejects.toThrow("账号已被禁用");
  });

  it("retries 429 and 5xx responses with exponential delays", async () => {
    const statuses = [429, 503, 200];
    const request = vi.fn((options) => {
      const status = statuses.shift() ?? 200;
      options.onload?.({
        responseText: status === 200 ? "ok" : "error",
        status,
        statusText: "",
        finalUrl: options.url,
        responseHeaders: "",
      });
    });
    const delay = vi.fn(async () => undefined);

    await expect(
      requestTextWithRetry("https://www.fut.gg/api", request, {
        baseDelayMs: 100,
        delay,
      }),
    ).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 100);
    expect(delay).toHaveBeenNthCalledWith(2, 200);
  });

  it("posts the JSON string without adding headers", async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"status":"ok","status_code":4}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await postJsonCompat(
      "http://127.0.0.1:8000/solve",
      '{"clubPlayers":[]}',
      { onError: vi.fn() },
      fetchMock,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/solve",
      { method: "POST", body: '{"clubPlayers":[]}' },
    );
  });

  it("rejects after reporting a backend network failure", async () => {
    const onError = vi.fn();
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    await expect(
      postJsonCompat(
        "http://127.0.0.1:8000/solve",
        "{}",
        { onError },
        fetchMock,
      ),
    ).rejects.toThrow("offline");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("aborts and rejects after the configured frontend timeout", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const fetchMock = vi.fn((_url, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("timed out");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    const request = postJsonCompat(
      "http://127.0.0.1:8000/solve",
      "{}",
      { onError, timeoutMs: 1_000 },
      fetchMock,
    );
    const assertion = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(onError).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
