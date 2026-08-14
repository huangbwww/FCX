import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteControlClient } from "../src/remote/client";
import type { RemoteRuntimeHooks } from "../src/types/remote-control";
import type { GmCompatRequest } from "../src/types/userscript";


const hooks: RemoteRuntimeHooks = {
  getRuntimeState: () => ({ eaReady: true, busy: false }),
  getBackendPort: () => 8000,
  startSbc: async () => undefined,
  startRoutine: async () => undefined,
  stopTask: () => undefined,
  refreshCatalog: async () => undefined,
  reloadPage: () => undefined,
  buildCatalog: async () => ({
    schema_version: 1,
    generated_at: new Date(0).toISOString(),
    sbcs: [],
    routines: [],
  }),
  isCancellationRequested: () => false,
};


describe("remote account settings", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    const values = new Map<string, unknown>();
    vi.stubGlobal("GM_getValue", (key: string, fallback: unknown) => (
      values.has(key) ? values.get(key) : fallback
    ));
    vi.stubGlobal("GM_setValue", (key: string, value: unknown) => {
      values.set(key, value);
    });
    vi.stubGlobal("GM_deleteValue", (key: string) => {
      values.delete(key);
    });
  });

  it("shows equal login and registration actions and prefills a successful account", async () => {
    const request = vi.fn((options: Parameters<GmCompatRequest>[0]) => {
      options.onload?.({
        responseText: JSON.stringify({
          message: "注册成功",
          user: { username: "new_member" },
        }),
        status: 200,
        statusText: "OK",
        finalUrl: options.url,
        responseHeaders: "",
      });
    });
    const client = new RemoteControlClient(hooks, request);
    const container = document.createElement("section");
    document.body.appendChild(container);

    await client.mountSettings(container);
    expect(container.querySelector(".fcx-remote-actions--auth")).not.toBeNull();
    expect(container.querySelector(".fcx-remote-login")?.textContent).toBe("登录");
    const openButton = container.querySelector<HTMLButtonElement>(".fcx-remote-register");
    openButton?.click();

    const username = document.querySelector<HTMLInputElement>(".fcx-register-username")!;
    const password = document.querySelector<HTMLInputElement>(".fcx-register-password")!;
    const confirmation = document.querySelector<HTMLInputElement>(".fcx-register-confirm")!;
    username.value = "new_member";
    password.value = "abc123";
    confirmation.value = "abc123";
    document.querySelector<HTMLButtonElement>("#fcx-register-modal .fcx-button--primary")?.click();

    await vi.waitFor(() => {
      expect(document.getElementById("fcx-register-modal")).toBeNull();
      expect(container.querySelector<HTMLInputElement>(".fcx-remote-username")?.value)
        .toBe("new_member");
    });
    expect(password.value).toBe("");
    expect(confirmation.value).toBe("");
    expect(container.textContent).toContain("注册成功，请使用新账号登录");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open and renders a Chinese server error", async () => {
    const request = vi.fn((options: Parameters<GmCompatRequest>[0]) => {
      options.onload?.({
        responseText: JSON.stringify({
          error: "CONFLICT_ERROR",
          message: "用户名或邮箱已被使用",
        }),
        status: 409,
        statusText: "Conflict",
        finalUrl: options.url,
        responseHeaders: "",
      });
    });
    const client = new RemoteControlClient(hooks, request);
    const container = document.createElement("section");
    document.body.appendChild(container);
    await client.mountSettings(container);
    container.querySelector<HTMLButtonElement>(".fcx-remote-register")?.click();

    document.querySelector<HTMLInputElement>(".fcx-register-username")!.value = "existing";
    document.querySelector<HTMLInputElement>(".fcx-register-password")!.value = "abc123";
    document.querySelector<HTMLInputElement>(".fcx-register-confirm")!.value = "abc123";
    document.querySelector<HTMLButtonElement>("#fcx-register-modal .fcx-button--primary")?.click();

    await vi.waitFor(() => {
      expect(document.querySelector(".fcx-modal-status")?.textContent)
        .toBe("用户名或邮箱已被使用");
    });
    expect(document.getElementById("fcx-register-modal")).not.toBeNull();
  });
});
