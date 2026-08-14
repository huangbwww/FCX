import { describe, expect, it, vi } from "vitest";

import { ScriptRuntimeLogBuffer } from "../src/remote/script-logs";
import type { ScriptRuntimeLogRecord } from "../src/types/remote-control";


describe("script runtime log buffer", () => {
  it("uploads sanitized operation logs in a bounded batch", async () => {
    const buffer = new ScriptRuntimeLogBuffer();
    const uploader = vi.fn(async (_records: ScriptRuntimeLogRecord[]) => ({ inserted: 1 }));
    buffer.capture({
      scope: "Pack",
      level: "error",
      message: "x".repeat(1200),
      occurredAt: "2026-08-03T12:00:00.000Z",
    });

    buffer.setUploader(uploader);
    await vi.waitFor(() => expect(uploader).toHaveBeenCalledOnce());

    const records = uploader.mock.calls[0]![0];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "ERROR",
      source: "pack",
      occurred_at: "2026-08-03T12:00:00.000Z",
    });
    expect(records[0]!.message).toHaveLength(1000);
  });

  it("keeps failed uploads in memory for the next retry", async () => {
    const buffer = new ScriptRuntimeLogBuffer();
    buffer.capture({
      scope: "SBC",
      level: "info",
      message: "started",
      occurredAt: "2026-08-03T12:00:00.000Z",
    });
    const failed = vi.fn(async (_records: ScriptRuntimeLogRecord[]) => { throw new Error("offline"); });
    buffer.setUploader(failed);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    const recovered = vi.fn(async (_records: ScriptRuntimeLogRecord[]) => ({ inserted: 1 }));

    buffer.setUploader(recovered);
    await vi.waitFor(() => expect(recovered).toHaveBeenCalledOnce());
    expect(recovered.mock.calls[0]![0][0]!.message).toBe("started");
  });
});
