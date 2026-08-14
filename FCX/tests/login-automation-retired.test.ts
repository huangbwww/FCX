import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("retired login automation", () => {
  it("does not preload or execute SBC tasks on home initialization", () => {
    const solver = read("src/ui/solver-runtime.ts");
    expect(solver).not.toContain("buildLoginAutomationTasks");
    expect(solver).not.toContain("runLoginAutomation");
    expect(solver).not.toContain("登录任务挑战名称读取失败");
    expect(solver).not.toContain("登录自动运行初始化失败");
  });

  it("keeps submission reminders independent from login tasks", () => {
    const settings = read("src/ui/settings-runtime.ts");
    expect(settings).toContain('"提交统计提醒"');
    expect(settings).toContain('"submitHourLimit"');
    expect(settings).toContain('"submitDayLimit"');
    expect(settings).not.toContain("createLoginAutomationPanel");
  });
});
