import { describe, expect, it, vi } from "vitest";

import {
  createFcxViewSafely,
  initializeFcxStandaloneView,
} from "../src/ui/standalone-view";

describe("FCX standalone EA views", () => {
  it("initializes its own generated root once without calling Home Hub init", () => {
    const nativeHomeHubInit = vi.fn(() => {
      const home = {} as { _academyTile?: { init(): void } };
      home._academyTile!.init();
    });
    const view = {
      _generated: false,
      _generate: vi.fn(function (this: { _generated: boolean }) {
        this._generated = true;
      }),
    };

    initializeFcxStandaloneView(view);
    initializeFcxStandaloneView(view);

    expect(view._generate).toHaveBeenCalledTimes(1);
    expect(nativeHomeHubInit).not.toHaveBeenCalled();
  });

  it("returns a failure view when page construction throws", () => {
    const error = new Error("render failed");
    const report = vi.fn();
    const failure = { kind: "failure" };

    const result = createFcxViewSafely(
      () => {
        throw error;
      },
      (received) => {
        expect(received).toBe(error);
        return failure;
      },
      report,
    );

    expect(result).toBe(failure);
    expect(report).toHaveBeenCalledWith(error);
  });
});
