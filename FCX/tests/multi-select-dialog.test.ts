// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFcxMultiSelectControl } from "../src/ui/multi-select-dialog";

const options = [
  { value: 13, label: "英超" },
  { value: 53, label: "西甲" },
  { value: 19, label: "德甲" },
];

describe("FCX multi-select control", () => {
  beforeEach(() => document.body.replaceChildren());

  it("keeps modal edits temporary until 保存选择", async () => {
    const onSave = vi.fn();
    const control = createFcxMultiSelectControl({
      id: "exclude-leagues",
      label: "排除联赛",
      help: "选择不允许用于求解的联赛",
      modalTitle: "选择排除联赛",
      options,
      selected: [13],
      onSave,
      documentRef: document,
    });
    document.body.appendChild(control.root);
    expect(control.root.textContent).toContain("1 项");

    control.open();
    const rows = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    rows.find((row) => row.textContent?.includes("西甲"))?.click();
    document
      .querySelector<HTMLButtonElement>(".fcx-modal-footer .fcx-button:not(.fcx-button--primary)")
      ?.click();
    expect(onSave).not.toHaveBeenCalled();
    expect(control.getSelected()).toEqual([13]);

    control.open();
    const secondRows = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    secondRows.find((row) => row.textContent?.includes("西甲"))?.click();
    document
      .querySelector<HTMLButtonElement>(".fcx-modal-footer .fcx-button--primary")
      ?.click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith([13, 53]));
    expect(document.getElementById("fcx-picker-exclude-leagues")).toBeNull();
    expect(control.getSelected()).toEqual([13, 53]);
    expect(control.root.textContent).toContain("2 项");
  });

  it("filters options and keeps the dialog open when persistence fails", async () => {
    const control = createFcxMultiSelectControl({
      id: "exclude-nations",
      label: "排除国家/地区",
      help: "选择不允许用于求解的国家或地区",
      modalTitle: "选择排除国家/地区",
      options,
      selected: [],
      onSave: () => {
        throw new Error("本地存储不可用");
      },
      documentRef: document,
    });
    document.body.appendChild(control.root);
    control.open();
    const search = document.querySelector<HTMLInputElement>(".fcx-picker__search")!;
    search.value = "西甲";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('[role="option"]')?.click();
    document
      .querySelector<HTMLButtonElement>(".fcx-modal-footer .fcx-button--primary")
      ?.click();

    await vi.waitFor(() =>
      expect(document.querySelector(".fcx-modal-status")?.textContent).toContain(
        "本地存储不可用",
      ),
    );
    expect(document.getElementById("fcx-picker-exclude-nations")).not.toBeNull();
    expect(control.getSelected()).toEqual([]);
  });
});
