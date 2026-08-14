// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { openProtectedPlayersDialog } from "../src/ui/protected-players-dialog";

afterEach(() => {
  document.body.replaceChildren();
});

describe("protected players dialog", () => {
  it("renders totals, player metadata, reasons and missing-club state", () => {
    openProtectedPlayersDialog({
      warning: "结果可能不完整",
      players: [
        {
          definitionId: 1,
          name: "完整球员",
          rating: 92,
          rarity: "特殊",
          inClub: true,
          reasons: ["manualLock", "activeSquad", "evolution"],
        },
        {
          definitionId: 2,
          name: "离队球员",
          rating: 86,
          rarity: "稀有金",
          inClub: false,
          reasons: ["manualLock"],
        },
      ],
    });

    const modal = document.getElementById("fcx-protected-players-modal");
    expect(modal?.textContent).toContain("所有保护球员 · 2 名");
    expect(modal?.textContent).toContain("结果可能不完整");
    expect(modal?.textContent).toContain("完整球员");
    expect(modal?.textContent).toContain("当前不在俱乐部");
    expect(modal?.textContent).toContain("手动锁定");
    expect(modal?.textContent).toContain("当前激活阵容");
    expect(modal?.textContent).toContain("进化球员");
    expect(modal?.querySelector("img")).toBeNull();
    expect(modal?.querySelectorAll(".fcx-protected-player__rating")[1]?.textContent).toBe(
      "86",
    );

    modal
      ?.querySelector<HTMLButtonElement>(".fcx-modal-footer button")
      ?.click();
    expect(document.getElementById("fcx-protected-players-modal")).toBeNull();
  });

  it("shows a clear empty state", () => {
    openProtectedPlayersDialog({ players: [] });
    expect(document.body.textContent).toContain("当前没有受到全局保护的球员");
  });
});
