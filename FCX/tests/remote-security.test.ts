import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";


const root = resolve(import.meta.dirname, "..");

describe("remote-control security boundary", () => {
  it("uses GM storage grants and a fixed HTTPS/WSS origin", () => {
    const vite = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    const api = readFileSync(resolve(root, "src/remote/api-client.ts"), "utf8");
    expect(vite).toContain('"GM_getValue"');
    expect(vite).toContain('"GM_setValue"');
    expect(vite).toContain('"GM_deleteValue"');
    expect(vite).toContain('"fc.fczhushou.com"');
    expect(api).toContain('"https://fc.fczhushou.com"');
    expect(api).toContain('"wss://fc.fczhushou.com/ws"');
  });

  it("does not evaluate remote code or persist passwords", () => {
    const client = readFileSync(resolve(root, "src/remote/client.ts"), "utf8");
    const store = readFileSync(resolve(root, "src/remote/auth-store.ts"), "utf8");
    expect(client).not.toMatch(/\beval\s*\(/);
    expect(client).not.toMatch(/new\s+Function\s*\(/);
    expect(store).not.toMatch(/password/i);
    expect(store).not.toContain("localStorage");
    expect(client).toContain('autocomplete="current-password"');
    expect(client).toContain('autocomplete="new-password"');
    expect(client).toContain('passwordInput.value = ""');
    expect(client).toContain('confirmInput.value = ""');
  });

  it("registers only through the fixed public API without activation codes", () => {
    const api = readFileSync(resolve(root, "src/remote/api-client.ts"), "utf8");
    expect(api).toContain('"/api/auth/register"');
    expect(api).toContain("activation_code: null");
    expect(api).toContain("email: email || null");
  });

  it("uploads only catalog summaries, never player or EA session state", () => {
    const vite = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    const catalogStart = vite.indexOf("const buildRemoteCatalog");
    const catalogEnd = vite.indexOf("const fcxRemoteControl", catalogStart);
    const catalogBuilder = vite.slice(catalogStart, catalogEnd);
    expect(catalogBuilder).toContain("set_id");
    expect(catalogBuilder).toContain("challenge_id");
    expect(catalogBuilder).toContain("routine_id");
    expect(catalogBuilder).not.toContain("clubPlayers");
    expect(catalogBuilder).not.toContain("accessToken");
    expect(catalogBuilder).not.toContain("PriceItems");
  });
});
