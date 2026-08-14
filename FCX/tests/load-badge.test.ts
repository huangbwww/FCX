import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uiText } from "../src/config/ui-text";
import {
  FCX_LOADED_BADGE_ID,
  showFcxLoadedBadge,
} from "../src/ui/load-badge";

describe("FCX loaded badge", () => {
  beforeEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the Chinese success message at the top center", () => {
    const badge = showFcxLoadedBadge(document);
    const styles = document.getElementById("fcx-loaded-badge-style")?.textContent;

    expect(badge.textContent).toBe(uiText.loading.success);
    expect(badge.getAttribute("role")).toBe("status");
    expect(badge.style.opacity).toBe("1");
    expect(styles).toContain("top: 20px");
    expect(styles).toContain("left: 50%");
    expect(styles).toContain("transform: translateX(-50%)");
    expect(styles).not.toContain("bottom: 16px");
  });

  it("fades after 2.5 seconds and removes itself after the transition", () => {
    const badge = showFcxLoadedBadge(document);

    vi.advanceTimersByTime(2_500);
    expect(badge.style.opacity).toBe("0");
    expect(document.getElementById(FCX_LOADED_BADGE_ID)).toBe(badge);

    vi.advanceTimersByTime(400);
    expect(document.getElementById(FCX_LOADED_BADGE_ID)).toBeNull();
  });

  it("replaces an existing badge instead of duplicating it", () => {
    const first = showFcxLoadedBadge(document);
    const second = showFcxLoadedBadge(document);

    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    expect(document.querySelectorAll(`#${FCX_LOADED_BADGE_ID}`)).toHaveLength(1);
  });
});
