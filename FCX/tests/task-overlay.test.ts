// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureTaskOverlayRoot,
  mountTaskEndButton,
  removeTaskEndButton,
  removeTaskOverlayRoot,
  setTaskOverlayFallbackActive,
} from "../src/ui/task-overlay";

describe("SBC task overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="ut-click-shield"></div>
      <div id="sbc-log-toggle"></div>
      <div id="sbc-info"></div>
      <div id="sbc-stop-overlay"></div>
    `;
  });

  it("removes all legacy bottom controls and mounts one end button", () => {
    const onEnd = vi.fn();
    const first = mountTaskEndButton(onEnd);
    const second = mountTaskEndButton(onEnd);

    expect(document.querySelector("#sbc-log-toggle")).toBeNull();
    expect(document.querySelector("#sbc-info")).toBeNull();
    expect(document.querySelector("#sbc-stop-overlay")).toBeNull();
    expect(first).toBe(second);
    expect(document.querySelectorAll("#fcx-task-end-overlay")).toHaveLength(1);
    expect(first?.parentElement?.id).toBe("fcx-task-overlay-root");
    expect(first?.textContent).toBe("结束任务");

    first?.click();
    first?.click();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(first?.disabled).toBe(true);
    expect(first?.textContent).toBe("正在结束");
  });

  it("removes the task action when the loader finishes", () => {
    mountTaskEndButton(vi.fn());
    removeTaskEndButton();
    expect(document.querySelector("#fcx-task-end-overlay")).toBeNull();
  });

  it("keeps task UI mounted when EA replaces its click shield", () => {
    const button = mountTaskEndButton(vi.fn());
    const oldShield = document.querySelector(".ut-click-shield");
    oldShield?.replaceWith(document.createElement("div"));

    expect(button?.isConnected).toBe(true);
    expect(document.getElementById("fcx-task-overlay-root")).not.toBeNull();
    expect(button?.parentElement).toBe(document.body.lastElementChild);
  });

  it("provides a full-screen fallback mode without an EA shield", () => {
    document.querySelector(".ut-click-shield")?.remove();
    const root = setTaskOverlayFallbackActive(true);

    expect(root.classList.contains("is-fallback")).toBe(true);
    expect(root.dataset.shieldMode).toBe("fallback");
    expect(root.querySelector(".fcx-task-overlay__fallback-spinner")).not.toBeNull();

    setTaskOverlayFallbackActive(false);
    expect(root.classList.contains("is-fallback")).toBe(false);
  });

  it("removes the complete task root after the outer task finishes", () => {
    ensureTaskOverlayRoot();
    removeTaskOverlayRoot();
    expect(document.getElementById("fcx-task-overlay-root")).toBeNull();
  });
});
