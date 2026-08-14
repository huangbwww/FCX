import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteControlClient } from "../src/remote/client";
import type { RemoteRuntimeHooks } from "../src/types/remote-control";
import type { GmCompatRequest } from "../src/types/userscript";


describe("remote EA Web App reload", () => {
  const values = new Map<string, unknown>();

  beforeEach(() => {
    vi.useFakeTimers();
    values.clear();
    values.set("fcx:remote:access-token", "access-token");
    values.set("fcx:remote:refresh-token", "refresh-token");
    values.set("fcx:remote:device-id", "script-1");
    values.set("fcx:remote:username", "member");
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

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("acknowledges the command before reloading exactly once even while busy", async () => {
    const reloadPage = vi.fn();
    const hooks: RemoteRuntimeHooks = {
      getRuntimeState: () => ({ eaReady: true, busy: true }),
      getBackendPort: () => 8000,
      startSbc: async () => undefined,
      startRoutine: async () => undefined,
      stopTask: () => undefined,
      refreshCatalog: async () => undefined,
      reloadPage,
      buildCatalog: async () => ({
        schema_version: 1,
        generated_at: new Date(0).toISOString(),
        sbcs: [],
        routines: [],
      }),
      isCancellationRequested: () => false,
    };
    const statuses: string[] = [];
    const request = vi.fn((options: Parameters<GmCompatRequest>[0]) => {
      if (options.url.includes("/status")) {
        statuses.push(JSON.parse(String(options.data)).status);
      }
      options.onload?.({
        responseText: "{}",
        status: 200,
        statusText: "OK",
        finalUrl: options.url,
        responseHeaders: "",
      });
    });
    const client = new RemoteControlClient(hooks, request);
    const invoke = (commandId: string) => (
      client as unknown as {
        handleCommand(command: Record<string, unknown>): Promise<void>;
      }
    ).handleCommand({
      command_id: commandId,
      command_type: "script.page.reload",
      target_device_id: "script-1",
      target_device_type: "userscript",
      payload: {},
      status: "pending",
    });

    await invoke("reload-1");

    expect(statuses).toEqual(["accepted", "running", "succeeded"]);
    expect(reloadPage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(reloadPage).toHaveBeenCalledTimes(1);

    await invoke("reload-1");
    await vi.advanceTimersByTimeAsync(300);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["accepted", "running", "succeeded"]);
  });
});
