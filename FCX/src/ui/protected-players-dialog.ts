import type {
  ProtectedPlayerReason,
  ProtectedPlayerViewRecord,
} from "../types/protection";
import { openFcxModal } from "./modal";

const REASON_LABELS: Record<ProtectedPlayerReason, string> = {
  manualLock: "手动锁定",
  activeSquad: "当前激活阵容",
  evolution: "进化球员",
};

export interface ProtectedPlayersDialogOptions {
  players: readonly ProtectedPlayerViewRecord[];
  warning?: string;
}

export function openProtectedPlayersDialog(
  options: ProtectedPlayersDialogOptions,
): void {
  const content = document.createElement("div");
  content.className = "fcx-protected-summary";

  const metrics = document.createElement("div");
  metrics.className = "fcx-protected-summary__metrics";
  const counts: Array<[string, number]> = [
    ["全部保护", options.players.length],
    ["手动锁定", countReason(options.players, "manualLock")],
    ["当前阵容", countReason(options.players, "activeSquad")],
    ["进化球员", countReason(options.players, "evolution")],
  ];
  for (const [label, value] of counts) {
    const metric = document.createElement("div");
    metric.className = "fcx-protected-summary__metric";
    const metricLabel = document.createElement("span");
    metricLabel.textContent = label;
    const metricValue = document.createElement("strong");
    metricValue.textContent = String(value);
    metric.append(metricLabel, metricValue);
    metrics.appendChild(metric);
  }
  content.appendChild(metrics);

  if (options.warning) {
    const warning = document.createElement("p");
    warning.className = "fcx-protected-summary__warning";
    warning.textContent = options.warning;
    content.appendChild(warning);
  }

  if (!options.players.length) {
    const empty = document.createElement("div");
    empty.className = "fcx-protected-summary__empty";
    empty.textContent = "当前没有受到全局保护的球员。";
    content.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "fcx-protected-summary__list";
    for (const player of options.players) {
      list.appendChild(createPlayerRow(player));
    }
    content.appendChild(list);
  }

  const modal = openFcxModal({
    id: "fcx-protected-players-modal",
    title: `所有保护球员 · ${options.players.length} 名`,
    description:
      "这里只汇总手动锁定、当前激活阵容和进化保护；SBC 局部排除规则不在此列表中。",
    content,
  });
  modal.panel.classList.add("fcx-modal-panel--protected");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "fcx-button fcx-button--primary";
  close.textContent = "完成";
  close.addEventListener("click", modal.close);
  modal.footer.appendChild(close);
}

function createPlayerRow(player: ProtectedPlayerViewRecord): HTMLElement {
  const row = document.createElement("article");
  row.className = "fcx-protected-player";

  const rating = document.createElement("strong");
  rating.className = "fcx-protected-player__rating";
  rating.textContent = player.rating > 0 ? String(player.rating) : "—";

  const copy = document.createElement("div");
  copy.className = "fcx-protected-player__copy";
  const name = document.createElement("strong");
  name.textContent = player.name;
  const meta = document.createElement("span");
  meta.textContent = `${player.rarity}${player.inClub ? "" : " · 当前不在俱乐部"}`;
  copy.append(name, meta);

  const reasons = document.createElement("div");
  reasons.className = "fcx-protected-player__reasons";
  for (const reason of player.reasons) {
    const chip = document.createElement("span");
    chip.className = `fcx-protected-reason is-${reason}`;
    chip.textContent = REASON_LABELS[reason];
    reasons.appendChild(chip);
  }
  row.append(rating, copy, reasons);
  return row;
}

function countReason(
  players: readonly ProtectedPlayerViewRecord[],
  reason: ProtectedPlayerReason,
): number {
  return players.filter((player) => player.reasons.includes(reason)).length;
}
