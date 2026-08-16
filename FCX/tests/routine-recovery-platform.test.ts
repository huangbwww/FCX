import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateRoutineRecoveryReadiness,
  waitForRoutineRecoveryCountdown,
} from "../src/platform/routine-recovery";

const readyServices = {
  Localization: {},
  SBC: {},
  Item: {},
  User: { getUser: () => ({}) },
};

const readyInput = () => ({
  documentReadyState: "complete",
  services: readyServices,
  repositories: { Store: {} },
  personaId: "persona-1",
  expectedPersonaId: "persona-1",
  homeReady: true,
  initialLoaderVisible: false,
});

describe("routine recovery runtime primitives", () => {
  it("waits the exact requested milliseconds without random second conversion", async () => {
    const slices: number[] = [];
    const completed = await waitForRoutineRecoveryCountdown(
      5_000,
      () => false,
      async (delay) => { slices.push(delay); },
    );
    expect(completed).toBe(true);
    expect(slices.reduce((total, value) => total + value, 0)).toBe(5_000);
    expect(Math.max(...slices)).toBeLessThanOrEqual(100);
  });

  it("stops the countdown when the task is cancelled", async () => {
    let elapsed = 0;
    const completed = await waitForRoutineRecoveryCountdown(
      5_000,
      () => elapsed >= 300,
      async (delay) => { elapsed += delay; },
    );
    expect(completed).toBe(false);
    expect(elapsed).toBe(300);
  });

  it("requires services, persona, Store and the fully rendered EA home", () => {
    expect(evaluateRoutineRecoveryReadiness(readyInput())).toEqual({
      ready: true,
      terminal: false,
      reason: "ready",
    });
    expect(evaluateRoutineRecoveryReadiness({ ...readyInput(), homeReady: false }).reason)
      .toBe("home");
    expect(evaluateRoutineRecoveryReadiness({ ...readyInput(), initialLoaderVisible: true }).reason)
      .toBe("loading");
    expect(evaluateRoutineRecoveryReadiness({ ...readyInput(), repositories: {} }).reason)
      .toBe("store");
    expect(evaluateRoutineRecoveryReadiness({
      ...readyInput(),
      personaId: "persona-2",
    })).toEqual({
      ready: false,
      terminal: true,
      reason: "persona_mismatch",
    });
  });

  it("wires the recovery flow to deterministic timing and page readiness", () => {
    const runtime = readFileSync(
      resolve(import.meta.dirname, "../src/domain/routines/runtime.ts"),
      "utf8",
    );
    const homeRuntime = readFileSync(
      resolve(import.meta.dirname, "../src/ui/solver-runtime.ts"),
      "utf8",
    );
    expect(runtime).toContain("waitForRoutineRecoveryCountdown(");
    expect(runtime).toContain("waitForRoutineRecoveryReadiness");
    expect(runtime).toContain("requestRoutinePageReload");
    expect(runtime).toContain('typeof unsafeWindow !== "undefined"');
    expect(runtime).not.toContain("await wait(delayMs)");
    expect(runtime).not.toContain("await wait(800)");
    expect(homeRuntime).toContain("markEaHomeReady(this)");
  });
});
