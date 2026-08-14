export interface ChallengeLoadRetryOptions {
  startAttempt?: number;
  maxRetries?: number;
  waitBeforeRetry: () => Promise<void>;
  onRetry?: (nextAttempt: number, error: unknown) => void;
}

export async function loadChallengeWithRetry<T>(
  loadOnce: () => Promise<T>,
  options: ChallengeLoadRetryOptions,
): Promise<T> {
  const startAttempt = options.startAttempt ?? 0;
  const maxRetries = options.maxRetries ?? 5;
  let lastError: unknown;
  for (let attempt = startAttempt; attempt <= maxRetries; attempt += 1) {
    try {
      return await loadOnce();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      options.onRetry?.(attempt + 1, error);
      await options.waitBeforeRetry();
    }
  }
  throw lastError;
}
