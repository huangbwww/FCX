import { beforeEach, describe, expect, it } from "vitest";
import { openFcxModal } from "../src/ui/modal";

describe("FCX modal", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("creates an accessible dialog and restores focus when closed", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();
    const content = document.createElement("p");
    content.textContent = "details";

    const modal = openFcxModal({
      id: "test-modal",
      title: "详情",
      content,
      documentRef: document,
    });

    expect(modal.panel.getAttribute("role")).toBe("dialog");
    expect(modal.panel.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("关闭弹窗");
    modal.close();
    expect(document.getElementById("test-modal")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape and a backdrop click but not a panel click", () => {
    const first = openFcxModal({
      id: "escape-modal",
      title: "详情",
      content: document.createElement("div"),
      documentRef: document,
    });
    first.root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(first.root.isConnected).toBe(false);

    const second = openFcxModal({
      id: "backdrop-modal",
      title: "详情",
      content: document.createElement("div"),
      documentRef: document,
    });
    second.panel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(second.root.isConnected).toBe(true);
    second.root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(second.root.isConnected).toBe(false);
  });

  it("keeps a non-dismissible dialog open until its owner closes it", () => {
    const modal = openFcxModal({
      id: "required-modal",
      title: "必须确认",
      content: document.createElement("div"),
      documentRef: document,
      dismissible: false,
    });

    expect(modal.root.querySelector(".fcx-modal-close")).toBeNull();
    modal.root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    modal.root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(modal.root.isConnected).toBe(true);
    modal.close();
    expect(modal.root.isConnected).toBe(false);
  });
});
