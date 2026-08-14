import { describe, expect, it, vi } from "vitest";
import { EaTaskShieldController } from "../src/ui/task-shield";

describe("EA task shield ownership", () => {
  it("acquires and releases exactly one native loading-shield reference", () => {
    const showShield = vi.fn();
    const hideShield = vi.fn();
    const controller = new EaTaskShieldController({
      gClickShield: { showShield, hideShield },
      EAClickShieldView: { Shield: { LOADING: "loading" } },
    });

    expect(controller.acquire()).toBe(true);
    expect(controller.acquire()).toBe(true);
    expect(controller.isOwned).toBe(true);
    expect(showShield).toHaveBeenCalledTimes(1);
    expect(showShield).toHaveBeenCalledWith("loading");

    controller.release();
    controller.release();
    expect(controller.isOwned).toBe(false);
    expect(hideShield).toHaveBeenCalledTimes(1);
    expect(hideShield).toHaveBeenCalledWith("loading");
  });

  it("uses fallback mode when the EA shield API is unavailable", () => {
    const controller = new EaTaskShieldController({});
    expect(controller.acquire()).toBe(false);
    expect(controller.isOwned).toBe(false);
    expect(() => controller.release()).not.toThrow();
  });

  it("does not claim ownership when EA showShield throws", () => {
    const hideShield = vi.fn();
    const controller = new EaTaskShieldController({
      gClickShield: {
        showShield: () => {
          throw new Error("EA shield unavailable");
        },
        hideShield,
      },
      EAClickShieldView: { Shield: { LOADING: 0 } },
    });

    expect(controller.acquire()).toBe(false);
    controller.release();
    expect(hideShield).not.toHaveBeenCalled();
  });
});
