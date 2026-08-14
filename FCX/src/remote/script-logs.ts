import type { ScriptRuntimeLogRecord } from "../types/remote-control";
import {
  subscribeOperationStatus,
  type OperationStatusEvent,
} from "../ui/operation-status";


export class ScriptRuntimeLogBuffer {
  private readonly pending = new Map<string, ScriptRuntimeLogRecord>();
  private uploader?: (records: ScriptRuntimeLogRecord[]) => Promise<unknown>;
  private retryTimer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => void) | undefined;

  start(intervalMs = 20_000): void {
    this.unsubscribe?.();
    this.unsubscribe = subscribeOperationStatus((event) => this.capture(event));
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => void this.flush(), intervalMs);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = undefined;
  }

  setUploader(
    uploader: (records: ScriptRuntimeLogRecord[]) => Promise<unknown>,
  ): void {
    this.uploader = uploader;
    void this.flush();
  }

  capture(event: OperationStatusEvent): ScriptRuntimeLogRecord {
    const id = globalThis.crypto?.randomUUID?.()
      ?? `script-log-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record: ScriptRuntimeLogRecord = {
      client_log_id: id,
      level: event.level === "error" ? "ERROR" : "INFO",
      source: event.scope.toLowerCase(),
      message: event.message.slice(0, 1000),
      occurred_at: event.occurredAt,
    };
    this.pending.set(id, record);
    while (this.pending.size > 200) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (!oldest) break;
      this.pending.delete(oldest);
    }
    void this.flush();
    return record;
  }

  async flush(): Promise<void> {
    if (!this.uploader || !this.pending.size) return;
    const batch = [...this.pending.values()].slice(0, 50);
    try {
      await this.uploader(batch);
      for (const item of batch) this.pending.delete(item.client_log_id);
    } catch {
      // Keep the bounded in-memory queue for the next heartbeat interval.
    }
  }
}
