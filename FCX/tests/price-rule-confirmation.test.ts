// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmIgnoringPriceRules } from "../src/ui/price-rule-confirmation";

describe("ignore-value price rule confirmation", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("continues only after the explicit skip action", async () => {
    const pending = confirmIgnoringPriceRules({ setName: "测试 SBC", timeoutMs: 1000 });
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((button) => button.textContent === "跳过价格限制并继续")?.click();
    await expect(pending).resolves.toBe(true);
  });

  it("cancels explicitly or after the timeout", async () => {
    const cancelled = confirmIgnoringPriceRules({ setName: "测试 SBC", timeoutMs: 1000 });
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "取消任务")?.click();
    await expect(cancelled).resolves.toBe(false);

    vi.useFakeTimers();
    const timedOut = confirmIgnoringPriceRules({ setName: "测试 SBC", timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(timedOut).resolves.toBe(false);
    vi.useRealTimers();
  });
});
