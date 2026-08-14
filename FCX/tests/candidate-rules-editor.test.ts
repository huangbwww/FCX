// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  candidateRuleStandaloneSaveChallengeId,
  createCandidateRulesEditor,
} from "../src/ui/candidate-rules-editor";

describe("candidate rules editor", () => {
  beforeEach(() => document.body.replaceChildren());

  it("hides internal rule sources and explains missing prices in the label", () => {
    const editor = createCandidateRulesEditor({
      value: {
        ratingRange: [0, 82],
        priceRange: [null, 3000],
        commonOnly: true,
        allowExtraRequiredRarityGroupPlayers: false,
        sources: {
          ratingRange: "recommended",
          priceRange: "recommended",
          commonOnly: "recommended",
          allowExtraRequiredRarityGroupPlayers: "global",
        },
      },
    });
    document.body.appendChild(editor.element);
    expect(editor.element.textContent).toContain("球员价格范围（读不到价格时不要设置）");
    expect(editor.element.textContent).not.toContain("来源：");
    expect(editor.element.querySelector(".fcx-candidate-rules__source")).toBeNull();
    expect(
      [...editor.element.querySelectorAll<HTMLInputElement>('input[type="number"]')]
        .every((input) => input.inputMode === "numeric"),
    ).toBe(true);
  });

  it("captures numeric edits on input before a save button is clicked", () => {
    const editor = createCandidateRulesEditor({
      value: {
        ratingRange: [65, 93],
        priceRange: [null, null],
        commonOnly: false,
        allowExtraRequiredRarityGroupPlayers: false,
        sources: {
          ratingRange: "global",
          priceRange: "global",
          commonOnly: "global",
          allowExtraRequiredRarityGroupPlayers: "global",
        },
      },
    });
    document.body.appendChild(editor.element);
    const inputs = editor.element.querySelectorAll<HTMLInputElement>(
      '.fcx-candidate-rules__range input',
    );
    const ratingMinimum = inputs.item(0);
    const priceMaximum = inputs.item(3);
    expect(ratingMinimum).toBeTruthy();
    expect(priceMaximum).toBeTruthy();
    ratingMinimum.value = "72";
    ratingMinimum.dispatchEvent(new Event("input", { bubbles: true }));
    expect(editor.getValue().ratingRange).toEqual([72, 93]);
    expect(editor.changedKeys()).toContain("ratingRange");

    priceMaximum.value = "5000";
    priceMaximum.dispatchEvent(new Event("input", { bubbles: true }));
    expect(editor.getValue().priceRange).toEqual([null, 5000]);
    expect(editor.changedKeys()).toContain("priceRange");
  });

  it("reads the live numeric field value even when the browser has not emitted change", () => {
    const editor = createCandidateRulesEditor({
      value: {
        ratingRange: [65, 93],
        priceRange: [null, null],
        commonOnly: false,
        allowExtraRequiredRarityGroupPlayers: false,
        sources: {
          ratingRange: "global",
          priceRange: "global",
          commonOnly: "global",
          allowExtraRequiredRarityGroupPlayers: "global",
        },
      },
    });
    document.body.appendChild(editor.element);
    const ratingMaximum = editor.element.querySelectorAll<HTMLInputElement>(
      '.fcx-candidate-rules__range input',
    ).item(1);
    ratingMaximum.value = "88";
    expect(editor.getValue().ratingRange).toEqual([65, 88]);
    expect(editor.changedKeys()).toContain("ratingRange");
  });

  it("saves a single-challenge SBC to its challenge scope and a set to group scope", () => {
    expect(candidateRuleStandaloneSaveChallengeId(false, 3771)).toBe(3771);
    expect(candidateRuleStandaloneSaveChallengeId(true, 3771)).toBe(0);
  });
});
