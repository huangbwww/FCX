import type {
  SbcConsumedPlayerLocation,
  SbcSubmissionSummary,
} from "../types/packs";
import { openFcxModal } from "./modal";

const LOCATION_LABELS: Record<SbcConsumedPlayerLocation, string> = {
  club: "俱乐部",
  storage: "SBC仓库",
  duplicate: "重复球员",
};

export function openSbcConsumptionSummaryDialog(
  submissions: readonly SbcSubmissionSummary[],
): void {
  const records = submissions.map((submission) => structuredClone(submission));
  const players = records.flatMap((submission) => submission.players);
  const ratings = players.map((player) => player.rating).filter((rating) => rating > 0);
  const content = document.createElement("div");
  content.className = "fcx-consumption-summary";

  const metrics = document.createElement("div");
  metrics.className = "fcx-pack-summary__metrics";
  const values = [
    ["提交次数", records.length],
    ["消耗球员", players.length],
    ["最高总评", ratings.length ? Math.max(...ratings) : "—"],
    ["最低总评", ratings.length ? Math.min(...ratings) : "—"],
  ] as const;
  for (const [label, value] of values) {
    const metric = document.createElement("div");
    metric.className = "fcx-pack-summary__metric";
    const caption = document.createElement("span");
    caption.textContent = String(label);
    const amount = document.createElement("strong");
    amount.textContent = String(value);
    metric.append(caption, amount);
    metrics.appendChild(metric);
  }
  content.appendChild(metrics);

  for (const submission of records) {
    const section = document.createElement("section");
    section.className = "fcx-consumption-group";
    const header = document.createElement("header");
    const heading = document.createElement("strong");
    heading.textContent = `第 ${submission.sequence} 次提交 · ${submission.setName}`;
    const meta = document.createElement("small");
    const submittedAt = new Date(submission.submittedAt);
    const time = Number.isNaN(submittedAt.getTime())
      ? submission.submittedAt
      : submittedAt.toLocaleString("zh-CN", { hour12: false });
    meta.textContent = `${submission.challengeName} · ${time}`;
    header.append(heading, meta);
    section.appendChild(header);

    const table = document.createElement("div");
    table.className = "fcx-consumption-table";
    const tableHeader = document.createElement("div");
    tableHeader.className = "fcx-consumption-row fcx-consumption-row--header";
    for (const label of ["总评", "球员", "稀有度", "状态", "提交前位置"]) {
      const cell = document.createElement("span");
      cell.textContent = label;
      tableHeader.appendChild(cell);
    }
    table.appendChild(tableHeader);
    const sorted = [...submission.players].sort(
      (left, right) => right.rating - left.rating || left.slot - right.slot,
    );
    for (const player of sorted) {
      const row = document.createElement("div");
      row.className = "fcx-consumption-row";
      const cells = [
        String(player.rating || "—"),
        player.name,
        player.rarity,
        `${player.tradeable ? "可交易" : "不可交易"}${player.duplicate ? " · 重复" : ""}`,
        LOCATION_LABELS[player.location],
      ];
      cells.forEach((value, index) => {
        const cell = index === 0 ? document.createElement("strong") : document.createElement("span");
        cell.textContent = value;
        cell.dataset.label = ["总评", "球员", "稀有度", "状态", "提交前位置"][index];
        row.appendChild(cell);
      });
      table.appendChild(row);
    }
    section.appendChild(table);
    content.appendChild(section);
  }

  const modal = openFcxModal({
    id: "fcx-consumption-summary-modal",
    title: `本次消耗 ${players.length} 名球员`,
    description: "仅记录 FCX 自动提交成功的 SBC 阵容，并按实际提交顺序展示。",
    content,
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "fcx-button fcx-button--primary";
  close.textContent = "返回开包总结";
  close.addEventListener("click", modal.close);
  modal.footer.appendChild(close);
}
