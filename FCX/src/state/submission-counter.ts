import type { SubmissionCounterSnapshot } from "../types/routines";
import type { StorageAdapter } from "./settings-store";

interface SubmissionCounterDocument {
  version: 1;
  submits: number[];
}

function personaKey(personaId: string | number): string {
  const safe = String(personaId).replace(/[^a-zA-Z0-9_-]/g, "_") || "default";
  return `fcx:2026:${safe}:sbc-submissions`;
}

export class SubmissionCounter {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly personaId: string | number,
  ) {}

  snapshot(
    hourLimit = 90,
    dayLimit = 300,
    now = Date.now(),
  ): SubmissionCounterSnapshot {
    const valid = this.read().filter((timestamp) => now - timestamp < 86_400_000);
    const hour = valid.filter((timestamp) => now - timestamp < 3_600_000);
    const dayRemaining = Math.max(0, dayLimit - valid.length);
    const hourRemaining = Math.max(0, hourLimit - hour.length);
    const candidates: number[] = [];
    if (hour.length >= hourLimit) candidates.push(Math.min(...hour) + 3_600_000);
    if (valid.length >= dayLimit) candidates.push(Math.min(...valid) + 86_400_000);
    return {
      hour: hour.length,
      day: valid.length,
      hourLimit,
      dayLimit,
      remaining: Math.min(hourRemaining, dayRemaining),
      ...(candidates.length ? { nextAvailableAt: Math.max(...candidates) } : {}),
    };
  }

  canSubmit(count = 1, hourLimit = 90, dayLimit = 300, now = Date.now()): boolean {
    void count;
    this.snapshot(hourLimit, dayLimit, now);
    return true;
  }

  record(now = Date.now()): void {
    const submits = this.read().filter((timestamp) => now - timestamp < 86_400_000);
    submits.push(now);
    const document: SubmissionCounterDocument = { version: 1, submits };
    this.storage.setItem(personaKey(this.personaId), JSON.stringify(document));
  }

  private read(): number[] {
    try {
      const parsed = JSON.parse(
        this.storage.getItem(personaKey(this.personaId)) || "null",
      ) as Partial<SubmissionCounterDocument> | null;
      return Array.isArray(parsed?.submits)
        ? parsed.submits.map(Number).filter(Number.isFinite)
        : [];
    } catch {
      return [];
    }
  }
}
