import { describe, expect, it } from "vitest";
import { SettingsDraft } from "../src/state/settings-draft";

describe("settings draft", () => {
  it("preserves inheritance and does not mutate the source document", () => {
    const source = {
      sbcSettings: {
        "0": { "0": { maxSolveTime: 60 } },
        "10": { "0": { maxSolveTime: 40 } },
      },
    };
    const draft = new SettingsDraft(source);
    expect(draft.getValue(10, 99, "maxSolveTime")).toBe(40);
    draft.saveValue(10, 99, "maxSolveTime", 20);
    expect(draft.getValue(10, 99, "maxSolveTime")).toBe(20);
    expect("99" in source.sbcSettings["10"]).toBe(false);
    expect(draft.isDirty).toBe(true);
    draft.deleteScope(10, 99);
    expect(draft.getValue(10, 99, "maxSolveTime")).toBe(40);
  });
});
