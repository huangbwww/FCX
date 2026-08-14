import { beforeEach, describe, expect, it } from "vitest";
import type { FcxTaskHistoryRecord } from "../src/types/task-history";
import {
  buildTaskHistoryDiagnosticText,
  renderTaskHistoryDetail,
  taskHistoryLocalDateKey,
} from "../src/ui/task-history-view";

const record = (): FcxTaskHistoryRecord => ({
  id: "fcx-history-secret",
  personaId: "persona-secret",
  type: "routine",
  title: "每日滚卡",
  endedAt: "2026-08-13T01:02:03.000Z",
  status: "stopped",
  reason: "当前没有可执行的下一轮挑战，本步骤已结束。",
  summary: {
    packsOpened: 2,
    picksCompleted: 1,
    destinations: {
      club: 1,
      storage: 0,
      transfer: 0,
      sold: 0,
      remaining: 0,
    },
    players: [{
      instanceId: 10,
      definitionId: 20,
      name: "测试球员",
      rating: 91,
      rarity: "特殊",
      special: true,
      evolution: false,
      tradeable: false,
      duplicate: false,
      source: "奖励包",
      destination: "club",
    }],
    sbcSubmissions: [{
      sequence: 1,
      setId: 100,
      challengeId: 101,
      setName: "升级SBC",
      challengeName: "阵容1",
      submittedAt: "2026-08-13T01:01:00.000Z",
      players: [{
        slot: 0,
        instanceId: 30,
        definitionId: 40,
        name: "消耗球员",
        rating: 84,
        rarity: "稀有金",
        tradeable: false,
        duplicate: true,
        storage: false,
        location: "duplicate",
      }],
    }],
  },
});

describe("task history view", () => {
  beforeEach(() => document.body.replaceChildren());

  it("renders a readable Chinese task summary instead of raw JSON", () => {
    const view = renderTaskHistoryDetail(document, record());
    document.body.appendChild(view);
    expect(view.textContent).toContain("已结束");
    expect(view.textContent).toContain("奖励去向");
    expect(view.textContent).toContain("测试球员");
    expect(view.textContent).toContain("SBC消耗");
    expect(view.textContent).toContain("消耗球员");
    expect(view.querySelector("pre")).toBeNull();
    expect(view.textContent).not.toContain('"personaId"');
  });

  it("copies diagnostic JSON without local identity fields", () => {
    const source = record() as FcxTaskHistoryRecord & {
      token?: string;
      cookie?: string;
    };
    source.token = "token-secret";
    source.cookie = "cookie-secret";
    (source.summary.players[0] as typeof source.summary.players[0] & { token?: string }).token = "nested-secret";
    const diagnostics = buildTaskHistoryDiagnosticText(source);
    expect(() => JSON.parse(diagnostics)).not.toThrow();
    expect(diagnostics).toContain("每日滚卡");
    expect(diagnostics).not.toContain("persona-secret");
    expect(diagnostics).not.toContain("fcx-history-secret");
    expect(diagnostics).not.toContain('"personaId"');
    expect(diagnostics).not.toContain("token-secret");
    expect(diagnostics).not.toContain("cookie-secret");
    expect(diagnostics).not.toContain("nested-secret");
  });

  it("filters history using the local calendar date", () => {
    const value = "2026-08-13T01:02:03.000Z";
    const local = new Date(value);
    const expected = [
      local.getFullYear(),
      String(local.getMonth() + 1).padStart(2, "0"),
      String(local.getDate()).padStart(2, "0"),
    ].join("-");
    expect(taskHistoryLocalDateKey(value)).toBe(expected);
  });
});
