import type { PackPlayerDestination, PackTaskSummary } from "../types/packs";
import { openFcxModal } from "./modal";
import { openSbcConsumptionSummaryDialog } from "./sbc-consumption-summary";

const DESTINATION_LABELS: Record<PackPlayerDestination, string> = {
  club: "俱乐部",
  storage: "SBC仓库",
  transfer: "转会列表",
  sold: "已快速出售",
  remaining: "仍未分配",
  unknown: "待确认",
};

export interface PackTaskSummaryDialogOptions {
  getPrice(definitionId: number): number | undefined;
  requestPrices(definitionIds: number[]): Promise<void>;
  pricesEnabled?: boolean;
}

export function openPackTaskSummaryDialog(
  summary: PackTaskSummary,
  options: PackTaskSummaryDialogOptions,
): void {
  const content = document.createElement("div");
  content.className = "fcx-pack-summary";

  const metrics = document.createElement("div");
  metrics.className = "fcx-pack-summary__metrics";
  const values = [
    ["卡包", summary.packsOpened],
    ["球员挑选", summary.picksCompleted],
    ["球员", summary.players.length],
    ["俱乐部", summary.destinations.club],
    ["仓库", summary.destinations.storage],
    ["转会", summary.destinations.transfer],
    ["出售", summary.destinations.sold],
    ["未分配", summary.destinations.remaining],
  ] as const;
  for (const [label, value] of values) {
    const metric = document.createElement("div");
    metric.className = "fcx-pack-summary__metric";
    metric.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    metrics.appendChild(metric);
  }
  content.appendChild(metrics);

  if (summary.stoppedReason) {
    const reason = document.createElement("p");
    reason.className = "fcx-pack-summary__reason";
    reason.textContent = summary.stoppedReason;
    content.appendChild(reason);
  }

  const players = [...summary.players].sort(
    (left, right) => right.rating - left.rating || left.name.localeCompare(right.name),
  );
  if (!players.length) {
    const empty = document.createElement("div");
    empty.className = "fcx-pack-summary__empty";
    empty.textContent = "本次任务没有获得球员物品。";
    content.appendChild(empty);
  } else {
    const table = document.createElement("div");
    table.className = "fcx-pack-summary__table";
    const header = document.createElement("div");
    header.className = "fcx-pack-summary__row fcx-pack-summary__row--header";
    header.innerHTML =
      "<span>总评</span><span>球员</span><span>稀有度</span><span>来源</span><span>状态</span><span>价格</span><span>去向</span>";
    table.appendChild(header);
    for (const player of players) {
      const row = document.createElement("div");
      row.className = "fcx-pack-summary__row";
      const price = options.getPrice(player.definitionId);
      row.innerHTML = `
        <strong data-label="总评">${player.rating || "—"}</strong>
        <span data-label="球员">${escapeHtml(player.name)}</span>
        <span data-label="稀有度">${escapeHtml(player.rarity)}</span>
        <span data-label="来源">${escapeHtml(player.source)}</span>
        <span data-label="状态">${player.tradeable ? "可交易" : "不可交易"}${player.duplicate ? " · 重复" : ""}</span>
        <span data-label="价格" data-price-id="${player.definitionId}">${formatPrice(price)}</span>
        <span data-label="去向">${DESTINATION_LABELS[player.destination]}</span>`;
      table.appendChild(row);
    }
    content.appendChild(table);
  }

  const modal = openFcxModal({
    id: "fcx-pack-summary-modal",
    title: `本次获得 ${players.length} 名球员`,
    description:
      options.pricesEnabled === false
        ? "本次奖励已经全部处理完成；本次任务已忽略球员价值。"
        : "本次奖励已经全部处理完成；价格会在后台补充，不影响物品分配。",
    content,
  });
  const close = document.createElement("button");
  close.type = "button";
  close.className = "fcx-button fcx-button--primary";
  close.textContent = "完成";
  close.addEventListener("click", modal.close);
  const consumedCount = summary.sbcSubmissions.reduce(
    (total, submission) => total + submission.players.length,
    0,
  );
  if (summary.sbcSubmissions.length > 0) {
    const consumed = document.createElement("button");
    consumed.type = "button";
    consumed.className = "fcx-button";
    consumed.textContent = `查看消耗球员（${consumedCount}）`;
    consumed.addEventListener("click", () =>
      openSbcConsumptionSummaryDialog(summary.sbcSubmissions)
    );
    modal.footer.appendChild(consumed);
  }
  modal.footer.appendChild(close);

  const definitionIds = [...new Set(players.map((player) => player.definitionId))];
  if (options.pricesEnabled === false) return;
  void options
    .requestPrices(definitionIds)
    .then(() => {
      for (const element of content.querySelectorAll<HTMLElement>("[data-price-id]")) {
        const definitionId = Number(element.dataset.priceId);
        element.textContent = formatPrice(options.getPrice(definitionId));
      }
    })
    .catch(() => undefined);
}

function formatPrice(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toLocaleString()
    : "—";
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}
