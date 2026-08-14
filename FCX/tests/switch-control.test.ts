// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createFcxSwitchControl } from "../src/ui/switch-control";

describe("FCX switch control", () => {
  it("toggles the checkbox when the visible track is clicked", () => {
    const control = createFcxSwitchControl(document, {
      label: "启用缺周黑自动补给",
    });
    document.body.appendChild(control.element);

    control.track.click();

    expect(control.input.checked).toBe(true);
    expect(control.input.getAttribute("aria-label")).toBe("启用缺周黑自动补给");
  });

  it("keeps the native checkbox focusable for keyboard users", () => {
    const control = createFcxSwitchControl(document, {
      label: "启用缺周黑自动补给",
      checked: true,
    });
    document.body.appendChild(control.element);

    control.input.focus();

    expect(document.activeElement).toBe(control.input);
    expect(control.input.checked).toBe(true);
  });
});
