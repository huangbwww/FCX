import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOperationStatus,
  reportOperationStatus,
} from "../src/ui/operation-status";
import { ensureTaskOverlayRoot } from "../src/ui/task-overlay";

describe("operation status", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="ut-click-shield"></div>';
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("only renders in the task root and keeps the latest three lines", () => {
    expect(reportOperationStatus("Price", "hidden", "info", document)).toBeNull();
    const root = ensureTaskOverlayRoot(document);
    for (const message of ["one", "two", "three", "four"]) {
      reportOperationStatus("SBC", message, "info", document);
    }

    const entries = document.querySelectorAll(".fcx-operation-status__entry");
    expect(entries).toHaveLength(3);
    expect([...entries].map((entry) => entry.textContent)).toEqual([
      "two",
      "three",
      "four",
    ]);
    expect(document.getElementById("fcx-operation-status")?.parentElement).toBe(root);
  });

  it("survives EA shield replacement and clears without touching the task root", () => {
    ensureTaskOverlayRoot(document);
    reportOperationStatus("SBC", "working", "info", document);
    document.querySelector(".ut-click-shield")?.replaceWith(
      document.createElement("div"),
    );
    expect(document.getElementById("fcx-operation-status")).not.toBeNull();

    clearOperationStatus(document);
    expect(document.getElementById("fcx-operation-status")).toBeNull();
    expect(document.getElementById("fcx-task-overlay-root")).not.toBeNull();
  });
});
