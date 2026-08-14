import { describe, expect, it } from "vitest";
import {
  localizeFcxNotification,
  localizeSolverStatus,
} from "../src/ui/notifications";

describe("FCX notification localization", () => {
  it("maps every backend solver status to Chinese", () => {
    for (const code of [0, 1, 2, 3, 4]) {
      expect(localizeSolverStatus(code)).not.toMatch(/[A-Za-z]{3,}/);
    }
    expect(localizeSolverStatus(4)).toBe("已找到最优方案");
  });

  it("translates static and templated FCX messages", () => {
    expect(localizeFcxNotification("SBC Submitted")).toBe("SBC提交成功");
    expect(localizeFcxNotification("2 / 3 Completed")).toBe("已完成 2 / 3");
    expect(localizeFcxNotification("Opening Pack: Gold Pack")).toBe(
      "正在打开卡包：Gold Pack",
    );
    expect(localizeFcxNotification("Item locked")).toBe("球员已锁定");
  });
});
