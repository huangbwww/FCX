import type { StorageOverflowFallback } from "../types/routines";
import type { StorageAdapter } from "./settings-store";

export const STORAGE_OVERFLOW_FALLBACK_KEY =
  "fcx:2026:storage-overflow-fallback";
export const MAX_STORAGE_OVERFLOW_FALLBACK_RUNS = 100;

export const DEFAULT_STORAGE_OVERFLOW_FALLBACK: Readonly<StorageOverflowFallback> =
  Object.freeze({ enabled: false, setId: 0, runs: 1 });

export function normalizeStorageOverflowFallback(
  value: unknown,
): StorageOverflowFallback {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const setId = Number(record.setId);
  const normalizedSetId = Number.isFinite(setId) && setId > 0 ? setId : 0;
  const rawRuns = Math.trunc(Number(record.runs));
  const runs = rawRuns === -1
    ? -1
    : Number.isFinite(rawRuns)
      ? Math.min(MAX_STORAGE_OVERFLOW_FALLBACK_RUNS, Math.max(1, rawRuns))
      : 1;
  return {
    enabled: record.enabled === true && normalizedSetId > 0,
    setId: normalizedSetId,
    runs,
  };
}

export class StorageOverflowFallbackStore {
  constructor(private readonly storage: StorageAdapter) {}

  get(): StorageOverflowFallback {
    const raw = this.storage.getItem(STORAGE_OVERFLOW_FALLBACK_KEY);
    if (!raw) return { ...DEFAULT_STORAGE_OVERFLOW_FALLBACK };
    try {
      return normalizeStorageOverflowFallback(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_STORAGE_OVERFLOW_FALLBACK };
    }
  }

  save(value: StorageOverflowFallback): StorageOverflowFallback {
    const normalized = normalizeStorageOverflowFallback(value);
    this.storage.setItem(
      STORAGE_OVERFLOW_FALLBACK_KEY,
      JSON.stringify(normalized),
    );
    return normalized;
  }
}
