import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

describe("special fallback UI wiring", () => {
  it("adds one globally persisted fallback section only to eligible SBC details", () => {
    const packs = source("../src/domain/packs/runtime.ts");
    const solver = source("../src/ui/solver-runtime.ts");

    expect(packs).toContain('title.textContent = "缺周黑自动补给"');
    expect(packs).toContain("fcxSpecialFallbackStore.get()");
    expect(packs).toContain("fcxSpecialFallbackStore.save({");
    expect(packs).toContain(
      "hasSupportedSpecialRequirement(readSbcChallengeRequirements(challenge))",
    );
    expect(packs).toContain("supportsSpecialFallback ? createFallbackSection() : null");
    expect(packs).toContain("fallbackUi?.read() || { ...savedFallback, enabled: false }");
    expect(solver).toContain("const readSbcChallengeRequirements");
    expect(packs.match(/runSbcWithTotwFallback\(\{/g)).toHaveLength(2);
    expect(packs).toContain('mode: "challenge"');
    expect(packs).toContain('mode: "set"');
    expect(packs).toContain("if (fallback.enabled)");
    expect(packs).toContain('runsLabel.innerHTML = "<span>每次补给次数</span>"');
    expect(packs).toContain("周黑补给 SBC 不能与当前目标 SBC 相同");
    expect(packs).toContain("选择的周黑补给 SBC 当前不可用");
  });

  it("adds a flow-wide ignore-value switch to routines and passes it to all steps", () => {
    const ui = source("../src/ui/routines-runtime.ts");
    const runtime = source("../src/domain/routines/runtime.ts");

    expect(ui).toContain('ignoreValueTitle.textContent = "忽略球员价值"');
    expect(ui).toContain("作用于整条流程、周黑补给及补给后的重试");
    expect(ui).toContain("draft.ignoreValue = ignoreValueInput.checked");
    expect(runtime).toContain("ignoreValue: routine.ignoreValue === true");
    expect(runtime).not.toContain("ignoreValue: false");
    expect(runtime).toContain("周黑补给 SBC 不能与当前目标 SBC 相同");
  });

  it("loops normal fallback without changing the routine fallback path", () => {
    const runtime = source("../src/domain/routines/runtime.ts");
    const packs = source("../src/domain/packs/runtime.ts");

    expect(runtime).toContain("runWithSpecialFallbackLoop({");
    expect(runtime).toContain("deferSummary: true");
    expect(runtime).toContain("deferRewards: true");
    expect(runtime).toContain('`主线 ${set.name}`');
    expect(packs).toContain("autoOpen: true");
    expect(runtime).toContain(
      "mergePackTaskSummary(context.packSummary, execution.packSummary)",
    );
    expect(runtime).toContain("outcome.stoppedForNoProgress");
    expect(runtime).toContain("主线进度 ${targetLabel} · 正在执行第 ${cycle} 轮周黑补给");
    expect(runtime).toContain("let fallbackAttempted = false");
    expect(runtime).toContain("if (fallbackAttempted || !routine.totwFallback?.enabled)");
    expect(runtime).toContain("且未启用“缺周黑自动补给”");
    expect(runtime).toContain("流程已结束，但有步骤被跳过");
    expect(runtime).toContain("[FCX][Routine] 缺少特殊卡，已跳过步骤");
  });

  it("keeps the new controls inside the existing FCX responsive design system", () => {
    const css = source("../src/ui/base-runtime.ts");

    for (const className of [
      ".fcx-sbc-fallback",
      ".fcx-sbc-fallback__header",
      ".fcx-sbc-fallback__controls",
      ".fcx-routine-option",
    ]) expect(css).toContain(className);
    expect(css).toMatch(
      /\.fcx-switch input \{[\s\S]*inset: 0;[\s\S]*width: 100%;[\s\S]*height: 100%;/,
    );
    expect(css).toMatch(/\.fcx-switch__track \{[\s\S]*pointer-events: none;/);
    expect(css).toMatch(
      /@media \(max-width: 680px\)[\s\S]*\.fcx-sbc-fallback__controls \{ grid-template-columns: 1fr; \}/,
    );
  });
});
