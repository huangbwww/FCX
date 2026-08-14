import type { StorageAdapter } from "./settings-store";
import type { RoutineTotwFallback } from "../types/routines";

export const SPECIAL_FALLBACK_STORAGE_KEY = "fcx:2026:special-fallback";
export const DEFAULT_SPECIAL_FALLBACK: Readonly<RoutineTotwFallback> = Object.freeze({
  enabled: false,
  setId: 1017,
  runs: 1,
});

function normalize(value: unknown): RoutineTotwFallback {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const setId = Number(record.setId);
  const runs = Math.trunc(Number(record.runs));
  return {
    enabled: record.enabled === true,
    setId: Number.isFinite(setId) && setId > 0
      ? setId
      : DEFAULT_SPECIAL_FALLBACK.setId,
    runs: Number.isFinite(runs) && runs > 0
      ? runs
      : DEFAULT_SPECIAL_FALLBACK.runs,
  };
}

export class SpecialFallbackStore {
  constructor(private readonly storage: StorageAdapter) {}

  get(): RoutineTotwFallback {
    const raw = this.storage.getItem(SPECIAL_FALLBACK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SPECIAL_FALLBACK };
    try {
      return normalize(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_SPECIAL_FALLBACK };
    }
  }

  save(value: RoutineTotwFallback): RoutineTotwFallback {
    const normalized = normalize(value);
    this.storage.setItem(SPECIAL_FALLBACK_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
}
