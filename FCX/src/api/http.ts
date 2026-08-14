import type {
  GmCompatRequest,
  GmCompatRequestOptions,
  GmCompatResponse,
} from "../types/userscript";

export class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly response?: unknown,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

function responseErrorMessage(response: {
  responseText?: string | undefined;
  status: number;
}): string | undefined {
  const text = response.responseText?.trim();
  if (!text) return undefined;
  try {
    const payload = JSON.parse(text) as unknown;
    if (!payload || typeof payload !== "object") return undefined;
    const body = payload as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    const retryAfter = Number(body.retry_after);
    const reason = message || detail;
    if (!reason) return undefined;
    if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
      return `${reason}，请 ${Math.ceil(retryAfter)} 秒后再试`;
    }
    return reason;
  } catch {
    return undefined;
  }
}

export function requestTextCompat(
  url: string,
  request: GmCompatRequest,
  init: Pick<GmCompatRequestOptions, "method" | "headers" | "data"> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    request({
      method: init.method ?? "GET",
      url,
      ...(init.headers ? { headers: init.headers } : {}),
      ...(init.data !== undefined ? { data: init.data } : {}),
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) {
          resolve(response.responseText);
        } else {
          reject(
            new HttpRequestError(
              responseErrorMessage(response)
                || (response.status === 429
                  ? "请求过于频繁，请稍后再试"
                  : `HTTP ${response.status} ${response.statusText}`.trim()),
              response.status,
              response,
            ),
          );
        }
      },
      onerror: (error) => {
        const status = Number("status" in error ? error.status : 0) || 0;
        reject(
          new HttpRequestError(
            responseErrorMessage({
              status,
              responseText: "responseText" in error ? error.responseText : undefined,
            })
              || (status > 0 ? `HTTP ${status}` : "网络请求失败，请检查网络连接"),
            status,
            error,
          ),
        );
      },
      ontimeout: (error) =>
        reject(new HttpRequestError("网络请求超时，请稍后重试", 0, error)),
    });
  });
}

export interface RetryRequestOptions {
  retries?: number;
  baseDelayMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
  requestInit?: Pick<GmCompatRequestOptions, "method" | "headers" | "data">;
}

export async function requestTextWithRetry(
  url: string,
  request: GmCompatRequest,
  options: RetryRequestOptions = {},
): Promise<string> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 750;
  const delay =
    options.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestTextCompat(url, request, options.requestInit);
    } catch (error) {
      const status = error instanceof HttpRequestError ? error.status : 0;
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt >= retries) throw error;
      await delay(baseDelayMs * 2 ** attempt);
    }
  }
}

export interface LegacyPostErrorHooks {
  onError: (error: unknown) => void;
  timeoutMs?: number;
}

/**
 * Keeps the legacy request body/headers while allowing callers to unwind on
 * network failures and a bounded client timeout.
 */
export function postJsonCompat<T>(
  url: string,
  data: BodyInit,
  hooks: LegacyPostErrorHooks,
  fetchImplementation: typeof fetch = fetch,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller =
      hooks.timeoutMs && hooks.timeoutMs > 0 ? new AbortController() : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), hooks.timeoutMs)
      : undefined;
    fetchImplementation(url, {
      method: "POST",
      body: data,
      ...(controller ? { signal: controller.signal } : {}),
    })
      .then((response) => {
        if (response.ok) {
          return response.json() as Promise<T>;
        }
        return Promise.reject(response);
      })
      .then(resolve)
      .catch((error: unknown) => {
        hooks.onError(error);
        reject(error);
      })
      .finally(() => {
        if (timeout !== undefined) clearTimeout(timeout);
      });
  });
}

export function gmFetchShim(
  options: Parameters<GmCompatRequest>[0],
  fetchImplementation: typeof fetch = fetch,
): void {
  const {
    method = "GET",
    url,
    headers = {},
    data,
    onload,
    onerror,
  } = options;
  const fetchOptions: RequestInit = { method, headers };
  if (method.toUpperCase() !== "GET" && data !== undefined) {
    fetchOptions.body = data;
  }
  fetchImplementation(url, fetchOptions)
    .then(async (response) => {
      const text = await response.text();
      const result: GmCompatResponse = {
        responseText: text,
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        responseHeaders: response.headers,
      };
      if (response.ok) {
        onload?.(result);
      } else {
        onerror?.(result);
      }
    })
    .catch((error: unknown) => onerror?.({ error }));
}
