import type {
  EaOperation,
  EaOperationResponse,
} from "./ea-observable";

export const DEFAULT_EA_REQUEST_MAX_ATTEMPTS = 3;
export const DEFAULT_EA_REQUEST_RETRY_DELAY_SECONDS = 3;
export const EA_THROTTLE_STATUSES = [426, 429, 459, 461, 512, 521] as const;
export const DEFAULT_EA_SBC_THROTTLE_BACKOFF_MS = [3_000, 8_000, 20_000] as const;
export const DEFAULT_EA_SBC_REQUEST_INTERVAL_MS = 900;

export interface EaRequestRetryConfig {
  maxAttempts: number;
  retryDelayMs: number;
  timeoutMs: number;
}

export type EaWriteVerification<T = unknown> =
  | { state: "applied"; value?: T }
  | { state: "not_applied" }
  | { state: "unknown"; reason?: string };

export interface EaRequestRetryEvent {
  label: string;
  attempt: number;
  nextAttempt: number;
  maxAttempts: number;
  retryDelayMs: number;
  status: number | undefined;
  kind: "transient" | "throttle";
  error: EaRequestError;
}

export interface ExecuteEaRequestOptions<T = unknown> {
  label: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  retryDelayScheduleMs?: readonly number[];
  timeoutMs?: number;
  isCancelled?: () => boolean;
  onRetry?: (event: EaRequestRetryEvent) => void;
  verifyAfterFailure?: (
    error: EaRequestError,
    attempt: number,
  ) => Promise<EaWriteVerification<T>>;
  requestGate?: EaRequestGate;
  retryThrottle?: boolean;
  retryUnauthorized?: boolean;
  resetThrottleOnSuccess?: boolean;
}

export class EaRequestError extends Error {
  readonly status: number | undefined;
  readonly response?: unknown;
  readonly retryable: boolean;
  readonly phase:
    | "response"
    | "network"
    | "timeout"
    | "cancelled"
    | "ambiguous"
    | "throttled";

  constructor(
    message: string,
    options: {
      status?: number | undefined;
      response?: unknown;
      retryable?: boolean;
      phase?: EaRequestError["phase"];
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "EaRequestError";
    this.status = options.status;
    this.response = options.response;
    this.retryable = options.retryable ?? isRetryableEaStatus(options.status);
    this.phase = options.phase ?? "response";
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.trunc(parsed);
  return integer >= minimum && integer <= maximum ? integer : fallback;
}

export function normalizeEaRequestRetryConfig(input: {
  maxAttempts?: unknown;
  retryDelaySeconds?: unknown;
  timeoutMs?: unknown;
} = {}): EaRequestRetryConfig {
  return {
    maxAttempts: boundedInteger(
      input.maxAttempts,
      1,
      10,
      DEFAULT_EA_REQUEST_MAX_ATTEMPTS,
    ),
    retryDelayMs:
      boundedInteger(
        input.retryDelaySeconds,
        1,
        30,
        DEFAULT_EA_REQUEST_RETRY_DELAY_SECONDS,
      ) * 1_000,
    timeoutMs: boundedInteger(input.timeoutMs, 1, 120_000, 15_000),
  };
}

export function isEaThrottleStatus(status: unknown): boolean {
  const numeric = Number(status);
  return Number.isFinite(numeric) && EA_THROTTLE_STATUSES.includes(
    numeric as (typeof EA_THROTTLE_STATUSES)[number],
  );
}

export function isRetryableEaStatus(status: unknown): boolean {
  if (status === undefined || status === null || Number(status) === 0) return true;
  const numeric = Number(status);
  return numeric === 408 || numeric === 425 || isEaThrottleStatus(numeric) || numeric >= 500;
}

function isObservable<T>(value: unknown): value is EaOperation<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "observe" in value &&
      typeof value.observe === "function",
  );
}

function finiteStatus(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function responseStatus(value: unknown, visited: WeakSet<object>): number | undefined {
  if (typeof value === "number") return finiteStatus(value);
  if (!value || typeof value !== "object") return undefined;
  if (visited.has(value)) return undefined;
  visited.add(value);
  const candidate = value as Record<string, unknown>;
  const direct = finiteStatus(candidate.status ?? candidate.statusCode ?? candidate.code);
  if (direct !== undefined) return direct;
  for (const nestedKey of ["error", "response", "data", "cause"] as const) {
    const nested = candidate[nestedKey];
    if (nested && nested !== value) {
      const status = responseStatus(nested, visited);
      if (status !== undefined) return status;
    }
  }
  return undefined;
}

export function eaResponseStatus(value: unknown): number | undefined {
  return responseStatus(value, new WeakSet<object>());
}

function responseFailed(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const response = value as { success?: unknown };
  const status = eaResponseStatus(value);
  return response.success === false || Boolean(status && status >= 400);
}

export function toEaRequestError(error: unknown, label: string): EaRequestError {
  if (error instanceof EaRequestError) return error;
  const status = eaResponseStatus(error);
  const message = error instanceof Error ? error.message : String(error ?? "未知错误");
  return new EaRequestError(`${label}失败：${message}`, {
    status,
    response: error,
    retryable: isRetryableEaStatus(status),
    phase: "network",
    cause: error,
  });
}

export function settleEaRequest<T = unknown>(
  operation: EaOperation<T> | Promise<T> | T,
  options: { label: string; timeoutMs?: number },
): Promise<EaOperationResponse<T> | T> {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 15_000);
  return new Promise((resolve, reject) => {
    let settled = false;
    let context: Record<string, never> | undefined;
    let observer: { unobserve?(context: unknown): void } | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (context) observer?.unobserve?.(context);
      } catch {
        // EA observers are inconsistent across Web App builds.
      }
      callback();
    };
    const accept = (value: EaOperationResponse<T> | T) => {
      if (responseFailed(value)) {
        const status = eaResponseStatus(value);
        finish(() => reject(new EaRequestError(
          `${options.label}失败（状态 ${status ?? "未知"}）`,
          {
            status,
            response: value,
            retryable: isRetryableEaStatus(status),
            phase: "response",
          },
        )));
        return;
      }
      finish(() => resolve(value));
    };
    const fail = (error: unknown) => finish(() => reject(toEaRequestError(error, options.label)));
    const timer = setTimeout(() => {
      finish(() => reject(new EaRequestError(`${options.label}请求超时`, {
        retryable: true,
        phase: "timeout",
      })));
    }, timeoutMs);

    try {
      if (isObservable<T>(operation)) {
        context = {};
        operation.observe(context, (nextObserver, response) => {
          observer = nextObserver;
          accept(response);
        });
      } else if (operation && typeof (operation as Promise<T>).then === "function") {
        Promise.resolve(operation as Promise<T>).then(accept, fail);
      } else {
        accept(operation as T);
      }
    } catch (error) {
      fail(error);
    }
  });
}

function cancelledError(label: string): EaRequestError {
  return new EaRequestError(`${label}已取消`, {
    retryable: false,
    phase: "cancelled",
  });
}

async function waitForRetry(
  delayMs: number,
  label: string,
  isCancelled?: () => boolean,
): Promise<void> {
  const deadline = Date.now() + Math.max(0, delayMs);
  while (Date.now() < deadline) {
    if (isCancelled?.()) throw cancelledError(label);
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())));
  }
}

export class EaRequestGate {
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;
  private blockedUntil = 0;
  private throttleLevel = 0;

  constructor(
    private readonly minimumIntervalMs = DEFAULT_EA_SBC_REQUEST_INTERVAL_MS,
    private readonly throttleBackoffMs: readonly number[] = DEFAULT_EA_SBC_THROTTLE_BACKOFF_MS,
  ) {}

  async beforeRequest(label: string, isCancelled?: () => boolean): Promise<void> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (isCancelled?.()) throw cancelledError(label);
      const now = Date.now();
      const pacingDelay = this.lastStartedAt > 0
        ? Math.max(0, this.minimumIntervalMs - (now - this.lastStartedAt))
        : 0;
      const throttleDelay = Math.max(0, this.blockedUntil - now);
      await waitForRetry(Math.max(pacingDelay, throttleDelay), label, isCancelled);
      this.lastStartedAt = Date.now();
    } finally {
      release();
    }
  }

  recordThrottle(): { terminal: boolean; delayMs: number; level: number } {
    if (this.throttleLevel >= this.throttleBackoffMs.length) {
      return { terminal: true, delayMs: 0, level: this.throttleLevel + 1 };
    }
    const delayMs = Math.max(0, Number(this.throttleBackoffMs[this.throttleLevel]) || 0);
    this.throttleLevel += 1;
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + delayMs);
    return { terminal: false, delayMs, level: this.throttleLevel };
  }

  recordSuccess(): void {
    this.throttleLevel = 0;
    this.blockedUntil = 0;
  }
}

async function verifyWriteFailure<T>(
  options: ExecuteEaRequestOptions<T>,
  error: EaRequestError,
  attempt: number,
): Promise<{ applied: boolean; value?: T }> {
  if (!options.verifyAfterFailure) return { applied: false };
  let verification: EaWriteVerification<T>;
  try {
    verification = await options.verifyAfterFailure(error, attempt);
  } catch (verificationError) {
    throw new EaRequestError(
      `${options.label}返回异常且结果无法确认，为避免重复消耗未自动重试`,
      {
        status: error.status,
        response: error.response,
        retryable: false,
        phase: "ambiguous",
        cause: verificationError,
      },
    );
  }
  if (verification.state === "applied") {
    return {
      applied: true,
      value: (verification.value ?? ({ success: true, status: 200 } as T)) as T,
    };
  }
  if (verification.state === "unknown") {
    throw new EaRequestError(
      verification.reason || `${options.label}返回异常且结果无法确认，为避免重复消耗未自动重试`,
      {
        status: error.status,
        response: error.response,
        retryable: false,
        phase: "ambiguous",
      },
    );
  }
  return { applied: false };
}

export async function executeEaRequest<T = unknown>(
  factory: () => EaOperation<T> | Promise<T> | T,
  options: ExecuteEaRequestOptions<T>,
): Promise<EaOperationResponse<T> | T> {
  const config = normalizeEaRequestRetryConfig({
    maxAttempts: options.maxAttempts,
    retryDelaySeconds: Number(options.retryDelayMs) / 1_000,
    timeoutMs: options.timeoutMs,
  });
  let attempt = 0;

  while (true) {
    attempt += 1;
    if (options.isCancelled?.()) throw cancelledError(options.label);
    await options.requestGate?.beforeRequest(options.label, options.isCancelled);
    try {
      const result = await settleEaRequest(factory(), {
        label: options.label,
        timeoutMs: config.timeoutMs,
      });
      if (options.resetThrottleOnSuccess !== false) {
        options.requestGate?.recordSuccess();
      }
      return result;
    } catch (caught) {
      const error = toEaRequestError(caught, options.label);
      const retryable = error.retryable || (options.retryUnauthorized && error.status === 401);
      if (!retryable) throw error;
      const verified = await verifyWriteFailure(options, error, attempt);
      if (verified.applied) return verified.value as T;

      if (isEaThrottleStatus(error.status)) {
        if (options.retryThrottle === false) throw error;
        if (options.requestGate) {
          const decision = options.requestGate.recordThrottle();
          if (decision.terminal) {
            throw new EaRequestError(
              `${options.label}触发EA限流保护，请稍后再试`,
              {
                status: error.status,
                response: error.response,
                retryable: false,
                phase: "throttled",
                cause: error,
              },
            );
          }
          options.onRetry?.({
            label: options.label,
            attempt,
            nextAttempt: attempt + 1,
            maxAttempts: options.requestGate ? 4 : config.maxAttempts,
            retryDelayMs: decision.delayMs,
            status: error.status,
            kind: "throttle",
            error,
          });
          continue;
        }
      }

      if (!retryable || attempt >= config.maxAttempts) throw error;
      const schedule = options.retryDelayScheduleMs;
      const retryDelayMs = schedule?.length
        ? Number(schedule[Math.min(attempt - 1, schedule.length - 1)])
        : config.retryDelayMs;
      options.onRetry?.({
        label: options.label,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: config.maxAttempts,
        retryDelayMs,
        status: error.status,
        kind: "transient",
        error,
      });
      await waitForRetry(retryDelayMs, options.label, options.isCancelled);
    }
  }
}
