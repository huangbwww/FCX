import { describe, expect, it, vi } from "vitest";
import { observeEaOperation } from "../src/platform/ea-observable";

describe("EA observable bridge", () => {
  it("waits for success and removes its observer", async () => {
    const context = {};
    const unobserve = vi.fn();
    let callback: ((observer: { unobserve: typeof unobserve }, response: {
      success: boolean;
      status: number;
      response: { id: number };
    }) => void) | undefined;
    const operation = {
      observe(_context: unknown, next: typeof callback) {
        callback = next;
      },
    };

    const pending = observeEaOperation(operation, "移动物品", context);
    expect(unobserve).not.toHaveBeenCalled();
    callback?.({ unobserve }, { success: true, status: 200, response: { id: 7 } });

    await expect(pending).resolves.toMatchObject({ response: { id: 7 } });
    expect(unobserve).toHaveBeenCalledWith(context);
  });

  it("rejects failed EA responses before the workflow continues", async () => {
    const operation = {
      observe(
        _context: unknown,
        callback: (observer: { unobserve(): void }, response: {
          success: boolean;
          status: number;
        }) => void,
      ) {
        callback({ unobserve() {} }, { success: false, status: 409 });
      },
    };

    await expect(observeEaOperation(operation, "移动物品")).rejects.toThrow(
      "移动物品失败（状态 409）",
    );
  });
});
