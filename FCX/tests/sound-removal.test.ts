import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const source = [
  "src/config/default-settings.ts",
  "src/config/ui-text.ts",
  "src/types/settings.ts",
  "src/domain/packs/runtime.ts",
  "src/domain/market/runtime.ts",
  "src/domain/sbc/runtime.ts",
  "src/hooks/items-runtime.ts",
  "src/ui/settings-runtime.ts",
]
  .map((file) => readFileSync(resolve(root, file), "utf8"))
  .join("\n");

describe("retired sound feature", () => {
  it("removes the setting, audio objects, remote files and playback calls", () => {
    const retiredSetting = ["play", "Sounds"].join("");
    expect(source).not.toContain(retiredSetting);
    expect(source).not.toContain("new Audio");
    expect(source).not.toMatch(/\.play\s*\(/);
    expect(source).not.toContain("raw.githubusercontent.com/Yousuke777/sound");
    expect(source).not.toContain("myinstants.com/media/sounds");
  });
});
