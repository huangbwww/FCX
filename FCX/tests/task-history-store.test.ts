import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { taskHistoryStatusFor } from "../src/state/task-history-store";

describe("local task history", () => {
  it("classifies completed, stopped and failed records", () => {
    expect(taskHistoryStatusFor("")).toBe("completed");
    expect(taskHistoryStatusFor("用户停止")).toBe("stopped");
    expect(taskHistoryStatusFor("任务失败")).toBe("failed");
  });

  it("uses persona-scoped IndexedDB with 100-record and 30-day pruning", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/state/task-history-store.ts"),
      "utf8",
    );
    expect(source).toContain('DATABASE_NAME = "fcx-task-history"');
    expect(source).toContain("MAX_RECORDS = 100");
    expect(source).toContain("30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("record.personaId === String(personaId)");
    expect(source).toContain("index >= MAX_RECORDS");
  });

  it("uses a readable history detail instead of rendering the raw record", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/ui/task-history-runtime.ts"),
      "utf8",
    );
    expect(source).toContain("renderTaskHistoryDetail(document, record)");
    expect(source).toContain("复制诊断信息");
    expect(source).not.toContain("JSON.stringify(record, null, 2)");
    expect(source).not.toContain('document.createElement("pre")');
  });
});
