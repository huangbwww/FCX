import { describe, expect, it } from "vitest";

import { RemoteAuthStore, type GmValueAdapter } from "../src/remote/auth-store";


function memoryAdapter(): GmValueAdapter & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    get: async <T>(key: string, fallback: T) =>
      (values.has(key) ? values.get(key) : fallback) as T,
    set: async (key, value) => { values.set(key, value); },
    delete: async (key) => { values.delete(key); },
  };
}

describe("remote auth GM storage", () => {
  it("stores tokens outside EA localStorage and never exposes a password field", async () => {
    const adapter = memoryAdapter();
    const store = new RemoteAuthStore(adapter);
    await store.saveSession({
      accessToken: "access",
      refreshToken: "refresh",
      deviceId: "script-1",
      username: "user",
    });

    expect(await store.getSession()).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      deviceId: "script-1",
      username: "user",
    });
    expect([...adapter.values.keys()].some((key) => /password/i.test(key))).toBe(false);
  });

  it("uses the branded default script device name", async () => {
    const store = new RemoteAuthStore(memoryAdapter());

    expect(await store.getDeviceName()).toBe("一阵失心风FCX");
  });

  it("keeps only the latest one hundred processed command ids", async () => {
    const adapter = memoryAdapter();
    const store = new RemoteAuthStore(adapter);
    for (let index = 0; index < 105; index += 1) {
      expect(await store.rememberCommand(`command-${index}`)).toBe(true);
    }
    expect(await store.rememberCommand("command-104")).toBe(false);
    expect(await store.rememberCommand("command-0")).toBe(true);
  });
});
