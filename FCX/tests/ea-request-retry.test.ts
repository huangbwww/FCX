import { describe, expect, it, vi } from "vitest";
import {
  EaRequestGate,
  EaRequestError,
  eaResponseStatus,
  executeEaRequest,
  isEaThrottleStatus,
  isRetryableEaStatus,
  normalizeEaRequestRetryConfig,
} from "../src/platform/ea-request-retry";

function responseOperation(response: unknown) {
  return {
    observe(context: unknown, callback: (observer: unknown, value: unknown) => void) {
      callback({ unobserve: vi.fn() }, response);
    },
  };
}

describe("EA request retry", () => {
  it("normalizes user settings", () => {
    expect(normalizeEaRequestRetryConfig()).toMatchObject({
      maxAttempts: 3,
      retryDelayMs: 3000,
    });
    expect(normalizeEaRequestRetryConfig({ maxAttempts: 99, retryDelaySeconds: 0 })).toMatchObject({
      maxAttempts: 3,
      retryDelayMs: 3000,
    });
  });

  it("classifies retryable statuses", () => {
    for (const status of [0, 408, 425, 426, 429, 459, 461, 500, 503, 512, 521]) {
      expect(isRetryableEaStatus(status)).toBe(true);
    }
    for (const status of [400, 401, 403, 404]) {
      expect(isRetryableEaStatus(status)).toBe(false);
    }
    for (const status of [426, 429, 459, 461, 512, 521]) {
      expect(isEaThrottleStatus(status)).toBe(true);
    }
    expect(isEaThrottleStatus(500)).toBe(false);
  });

  it("extracts EA status codes from nested error payloads", () => {
    expect(eaResponseStatus({ error: { code: 446 } })).toBe(446);
    expect(eaResponseStatus({ response: { error: { status: 471 } } })).toBe(471);
    const cyclic: { response?: unknown } = {};
    cyclic.response = cyclic;
    expect(eaResponseStatus(cyclic)).toBeUndefined();
  });

  it("does not wait or recreate a successful request", async () => {
    const factory = vi.fn(() => responseOperation({ success: true, status: 200 }));
    await expect(executeEaRequest(factory, {
      label: "读取卡包列表",
      maxAttempts: 3,
      retryDelayMs: 3000,
    })).resolves.toMatchObject({ success: true });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("recreates retryable requests and respects the total-attempt limit", async () => {
    vi.useFakeTimers();
    const factory = vi.fn()
      .mockImplementationOnce(() => responseOperation({ success: false, status: 500 }))
      .mockImplementationOnce(() => responseOperation({ success: false, status: 429 }))
      .mockImplementationOnce(() => responseOperation({ success: true, status: 200 }));
    const onRetry = vi.fn();
    const pending = executeEaRequest(factory, {
      label: "读取卡包列表",
      maxAttempts: 3,
      retryDelayMs: 3000,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(6000);
    await expect(pending).resolves.toMatchObject({ success: true });
    expect(factory).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry explicit business failures", async () => {
    const factory = vi.fn(() => responseOperation({ success: false, status: 401 }));
    await expect(executeEaRequest(factory, {
      label: "读取账号",
      maxAttempts: 3,
      retryDelayMs: 1,
    })).rejects.toMatchObject({ status: 401, retryable: false });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("treats a verified write as successful without replaying it", async () => {
    const factory = vi.fn(() => responseOperation({ success: false, status: 500 }));
    const result = await executeEaRequest(factory as never, {
      label: "提交SBC",
      maxAttempts: 3,
      retryDelayMs: 1,
      verifyAfterFailure: async () => ({
        state: "applied",
        value: { success: true, status: 200, response: { recovered: true } },
      }),
    });
    expect(result).toMatchObject({ success: true, response: { recovered: true } });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("stops an ambiguous write instead of replaying it", async () => {
    const factory = vi.fn(() => responseOperation({ success: false, status: 500 }));
    await expect(executeEaRequest(factory, {
      label: "打开卡包",
      maxAttempts: 3,
      retryDelayMs: 1,
      verifyAfterFailure: async () => ({ state: "unknown" }),
    })).rejects.toMatchObject({ phase: "ambiguous", retryable: false });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("cancels retry waiting before another request is sent", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const factory = vi.fn(() => responseOperation({ success: false, status: 500 }));
    const pending: Promise<{ value?: unknown; error?: unknown }> = executeEaRequest(factory, {
      label: "读取卡包列表",
      maxAttempts: 3,
      retryDelayMs: 3000,
      isCancelled: () => cancelled,
    }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(100);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(100);
    expect((await pending).error).toBeInstanceOf(EaRequestError);
    expect(factory).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not run write verification for non-retryable targeted errors", async () => {
    const verifyAfterFailure = vi.fn(async () => ({ state: "not_applied" as const }));
    await expect(executeEaRequest(
      () => responseOperation({ success: false, status: 471 }),
      {
        label: "打开卡包",
        verifyAfterFailure,
      },
    )).rejects.toMatchObject({ status: 471, retryable: false });
    expect(verifyAfterFailure).not.toHaveBeenCalled();
  });

  it("stops throttle statuses immediately outside the SBC gate", async () => {
    const factory = vi.fn(() => responseOperation({ success: false, status: 512 }));
    await expect(executeEaRequest(factory, {
      label: "打开卡包",
      maxAttempts: 3,
      retryThrottle: false,
    })).rejects.toMatchObject({ status: 512 });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("shares progressive throttle cooldowns across SBC requests", async () => {
    vi.useFakeTimers();
    const gate = new EaRequestGate(0, [30, 80, 200]);
    const factory = vi.fn()
      .mockImplementationOnce(() => responseOperation({ success: false, status: 426 }))
      .mockImplementationOnce(() => responseOperation({ success: false, status: 459 }))
      .mockImplementationOnce(() => responseOperation({ success: false, status: 521 }))
      .mockImplementationOnce(() => responseOperation({ success: true, status: 200 }));
    const onRetry = vi.fn();
    const pending = executeEaRequest(factory, {
      label: "读取SBC目录",
      requestGate: gate,
      onRetry,
    });
    await vi.advanceTimersByTimeAsync(310);
    await expect(pending).resolves.toMatchObject({ success: true });
    expect(factory).toHaveBeenCalledTimes(4);
    expect(onRetry.mock.calls.map(([event]) => event.retryDelayMs)).toEqual([30, 80, 200]);
    expect(onRetry.mock.calls.every(([event]) => event.kind === "throttle")).toBe(true);
    vi.useRealTimers();
  });

  it("does not reset shared throttle state after a verification probe succeeds", async () => {
    const gate = new EaRequestGate(0, [30, 80, 200]);
    expect(gate.recordThrottle()).toMatchObject({ delayMs: 30, level: 1 });
    await expect(executeEaRequest(
      () => responseOperation({ success: true, status: 200 }),
      {
        label: "核验SBC提交状态",
        requestGate: gate,
        resetThrottleOnSuccess: false,
      },
    )).resolves.toMatchObject({ success: true });
    expect(gate.recordThrottle()).toMatchObject({ delayMs: 80, level: 2 });
  });

  it("paces concurrent SBC requests through a shared queue", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T00:00:00Z"));
    const gate = new EaRequestGate(900, [3000]);
    await gate.beforeRequest("第一个请求");
    let secondStarted = false;
    const second = gate.beforeRequest("第二个请求").then(() => {
      secondStarted = true;
    });
    await vi.advanceTimersByTimeAsync(899);
    expect(secondStarted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(secondStarted).toBe(true);
    vi.useRealTimers();
  });

  it("stops after the shared throttle protection is exhausted", async () => {
    vi.useFakeTimers();
    const gate = new EaRequestGate(0, [30, 80, 200]);
    const factory = vi.fn(() => responseOperation({ success: false, status: 429 }));
    const pending: Promise<{ value?: unknown; error?: unknown }> = executeEaRequest(factory, {
      label: "读取SBC目录",
      requestGate: gate,
    }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(310);
    const result = await pending;
    expect(result.error).toMatchObject({ phase: "throttled", retryable: false, status: 429 });
    expect(factory).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
