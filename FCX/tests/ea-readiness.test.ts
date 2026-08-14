import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { areEaWebAppServicesReady } from "../src/platform/ea-readiness";


describe("EA Web App readiness", () => {
  it("requires the services used by remote SBC and pack tasks", () => {
    expect(areEaWebAppServicesReady(undefined)).toBe(false);
    expect(areEaWebAppServicesReady({ Localization: {} })).toBe(false);
    expect(areEaWebAppServicesReady({ Localization: {}, SBC: {} })).toBe(false);
    expect(areEaWebAppServicesReady({
      Localization: {},
      SBC: {},
      Item: {},
    })).toBe(true);
  });

  it("reads the page-scope services binding instead of globalThis.services", () => {
    const viteConfig = readFileSync(resolve(import.meta.dirname, "../vite.config.ts"), "utf8");
    expect(viteConfig).toContain('typeof services !== "undefined"');
    expect(viteConfig).toContain("areEaWebAppServicesReady(services)");
    expect(viteConfig).not.toContain("Boolean(globalThis.services?.Localization)");
  });
});
