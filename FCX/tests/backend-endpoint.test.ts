import { describe, expect, it } from "vitest";

import {
  DEFAULT_BACKEND_PORT,
  localBackendUrl,
  normalizeBackendPort,
  parseBackendPort,
  portFromLegacyApiUrl,
} from "../src/config/backend-endpoint";


describe("local backend endpoint", () => {
  it("keeps the backend on loopback while allowing a validated port", () => {
    expect(localBackendUrl(18000, "/solve")).toBe("http://127.0.0.1:18000/solve");
    expect(parseBackendPort(1024)).toBe(1024);
    expect(parseBackendPort(65535)).toBe(65535);
    expect(parseBackendPort(80)).toBeNull();
    expect(parseBackendPort("invalid")).toBeNull();
    expect(normalizeBackendPort(80)).toBe(DEFAULT_BACKEND_PORT);
  });

  it("migrates only legacy loopback API URLs", () => {
    expect(portFromLegacyApiUrl("http://127.0.0.1:9123")).toBe(9123);
    expect(portFromLegacyApiUrl("https://example.com:9123")).toBeNull();
    expect(portFromLegacyApiUrl("http://localhost:9123")).toBeNull();
  });
});
