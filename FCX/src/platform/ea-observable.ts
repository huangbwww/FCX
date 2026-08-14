export interface EaOperationResponse<T = unknown> {
  success?: boolean;
  status?: number;
  response?: T;
}

export interface EaOperationObserver {
  unobserve?(context: unknown): void;
}

export interface EaOperation<T = unknown> {
  observe(
    context: unknown,
    callback: (
      observer: EaOperationObserver,
      response: EaOperationResponse<T>,
    ) => void,
  ): void;
}

function isEaOperation<T>(value: unknown): value is EaOperation<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "observe" in value &&
    typeof value.observe === "function"
  );
}

export function observeEaOperation<T = unknown>(
  operation: EaOperation<T> | unknown,
  label: string,
  context: unknown = {},
): Promise<EaOperationResponse<T> | unknown> {
  if (!isEaOperation<T>(operation)) return Promise.resolve(operation);
  return new Promise((resolve, reject) => {
    operation.observe(context, (observer, response) => {
      observer.unobserve?.(context);
      if (response.success === false) {
        reject(new Error(`${label}失败（状态 ${response.status ?? "未知"}）`));
        return;
      }
      resolve(response);
    });
  });
}
