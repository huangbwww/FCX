import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GmValueAdapter } from "../src/remote/auth-store";
import {
  ensureFcxDisclaimerAccepted,
  FCX_DISCLAIMER_STORAGE_KEY,
  FCX_DISCLAIMER_VERSION,
  FCX_GAMING_DISCLAIMER,
  FCX_SOFTWARE_DISCLAIMER,
  openFcxDisclaimerDialog,
} from "../src/ui/disclaimer";

function memoryAdapter(initial?: number): GmValueAdapter & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  if (initial !== undefined) values.set(FCX_DISCLAIMER_STORAGE_KEY, initial);
  return {
    values,
    get: async <T>(key: string, fallback: T) =>
      (values.has(key) ? values.get(key) : fallback) as T,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  };
}

describe("FCX disclaimer consent", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("contains the complete software and EA risk sections copied from the client", () => {
    expect(FCX_SOFTWARE_DISCLAIMER).toContain("6. 软件更新");
    expect(FCX_SOFTWARE_DISCLAIMER).toContain("本软件并不读取用户机器码相关以外的任何本地数据");
    expect(FCX_GAMING_DISCLAIMER).toContain("8. 服务中断");
    expect(FCX_GAMING_DISCLAIMER).toContain("可能导致游戏账号被限制、封禁或其他处罚");
  });

  it("does not prompt when the current disclaimer version is already accepted", async () => {
    const storage = memoryAdapter(FCX_DISCLAIMER_VERSION);
    await expect(ensureFcxDisclaimerAccepted(storage, document)).resolves.toBe(true);
    expect(document.getElementById("fcx-disclaimer-consent-modal")).toBeNull();
  });

  it("requires the first confirmation and persists its version", async () => {
    const storage = memoryAdapter();
    const consent = ensureFcxDisclaimerAccepted(storage, document);
    await Promise.resolve();
    const modal = document.getElementById("fcx-disclaimer-consent-modal");
    expect(modal).not.toBeNull();
    expect(modal?.querySelector(".fcx-modal-close")).toBeNull();
    modal?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    modal?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(modal?.isConnected).toBe(true);

    const accept = Array.from(modal?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent === "我已阅读并同意");
    accept?.click();
    await expect(consent).resolves.toBe(true);
    expect(storage.values.get(FCX_DISCLAIMER_STORAGE_KEY)).toBe(FCX_DISCLAIMER_VERSION);
    expect(modal?.isConnected).toBe(false);
  });

  it("allows the current session after a storage failure and explains the retry", async () => {
    const storage: GmValueAdapter = {
      get: async <T>(_key: string, fallback: T) => fallback,
      set: async () => { throw new Error("storage failed"); },
      delete: async () => undefined,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dialog = openFcxDisclaimerDialog({
      documentRef: document,
      storage,
      requireAcceptance: true,
      persistenceWarningMs: 0,
    });
    dialog.root.querySelector<HTMLButtonElement>(".fcx-button--primary")?.click();
    await expect(dialog.accepted).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(dialog.root.isConnected).toBe(false);
  });

  it("keeps the settings-page viewer dismissible", () => {
    const dialog = openFcxDisclaimerDialog({ documentRef: document });
    expect(dialog.root.querySelector(".fcx-modal-close")).not.toBeNull();
    expect(dialog.root.textContent).toContain("软件使用免责声明");
    expect(dialog.root.textContent).toContain("游戏相关免责声明");
  });
});
