import type { PackPlayerDestination, PackTaskSummary } from "../types/packs";
import type { FcxTaskHistoryRecord, FcxTaskHistoryType } from "../types/task-history";

const TYPE_LABELS: Record<FcxTaskHistoryType, string> = {
  sbc: "单挑战SBC",
  set: "整组SBC",
  routine: "永动机",
  pack: "FCX开包",
};

const STATUS_LABELS: Record<FcxTaskHistoryRecord["status"], string> = {
  completed: "已完成",
  stopped: "已结束",
  failed: "失败",
};

const DESTINATION_LABELS: Record<PackPlayerDestination, string> = {
  club: "俱乐部",
  storage: "SBC仓库",
  transfer: "转会列表",
  sold: "已出售",
  remaining: "未分配",
  unknown: "待确认",
};

const LOCATION_LABELS = {
  club: "俱乐部",
  storage: "SBC仓库",
  duplicate: "重复球员",
} as const;

const SOLVE_FALLBACK_OUTCOME_LABELS = {
  started: "已触发",
  fallback_completed: "补偿已完成",
  fallback_unavailable: "补偿不可用",
  fallback_failed: "补偿失败",
  retry_succeeded: "原步骤重试成功",
  retry_no_solution: "原步骤重试仍无解",
  retry_failed: "原步骤重试失败",
} as const;

const numberOrZero = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const summaryFor = (record: FcxTaskHistoryRecord): PackTaskSummary => {
  const summary = record.summary ?? ({} as PackTaskSummary);
  return {
    packsOpened: numberOrZero(summary.packsOpened),
    picksCompleted: numberOrZero(summary.picksCompleted),
    players: Array.isArray(summary.players) ? summary.players : [],
    sbcSubmissions: Array.isArray(summary.sbcSubmissions) ? summary.sbcSubmissions : [],
    destinations: {
      club: numberOrZero(summary.destinations?.club),
      storage: numberOrZero(summary.destinations?.storage),
      transfer: numberOrZero(summary.destinations?.transfer),
      sold: numberOrZero(summary.destinations?.sold),
      remaining: numberOrZero(summary.destinations?.remaining),
    },
    ...(summary.stoppedReason ? { stoppedReason: String(summary.stoppedReason) } : {}),
  };
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value || "时间未知")
    : date.toLocaleString("zh-CN", { hour12: false });
};

const appendMetric = (
  documentRef: Document,
  parent: HTMLElement,
  label: string,
  value: string | number,
): void => {
  const metric = documentRef.createElement("div");
  metric.className = "fcx-pack-summary__metric";
  const caption = documentRef.createElement("span");
  caption.textContent = label;
  const amount = documentRef.createElement("strong");
  amount.textContent = String(value);
  metric.append(caption, amount);
  parent.appendChild(metric);
};

const appendSectionHeading = (
  documentRef: Document,
  parent: HTMLElement,
  title: string,
  description: string,
): void => {
  const header = documentRef.createElement("header");
  header.className = "fcx-task-history-detail__section-heading";
  const heading = documentRef.createElement("h3");
  heading.textContent = title;
  const copy = documentRef.createElement("p");
  copy.textContent = description;
  header.append(heading, copy);
  parent.appendChild(header);
};

const appendEmpty = (
  documentRef: Document,
  parent: HTMLElement,
  text: string,
): void => {
  const empty = documentRef.createElement("p");
  empty.className = "fcx-task-history-detail__empty";
  empty.textContent = text;
  parent.appendChild(empty);
};

export const taskHistoryTypeLabel = (type: FcxTaskHistoryType): string =>
  TYPE_LABELS[type] || String(type);

export const taskHistoryStatusLabel = (
  status: FcxTaskHistoryRecord["status"],
): string => STATUS_LABELS[status] || "已结束";

export const taskHistoryLocalDateKey = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildTaskHistoryDiagnosticText = (
  record: FcxTaskHistoryRecord,
): string => {
  const summary = summaryFor(record);
  return JSON.stringify({
    schema_version: 1,
    task: {
      type: record.type,
      title: record.title,
      endedAt: record.endedAt,
      status: record.status,
      ...(record.reason ? { reason: record.reason } : {}),
      ...(record.recoveryErrors?.length
        ? {
            recoveryErrors: record.recoveryErrors.map((event) => ({
              occurredAt: event.occurredAt,
              reloadAttempt: event.reloadAttempt,
              maxReloads: event.maxReloads,
              stopKind: event.stopKind,
              reason: event.reason,
              technicalMessage: event.technicalMessage,
              cycle: event.cycle,
              stepIndex: event.stepIndex,
              ...(event.stepId ? { stepId: event.stepId } : {}),
              ...(event.stepName ? { stepName: event.stepName } : {}),
              ...(event.setId ? { setId: event.setId } : {}),
              ...(event.operation ? { operation: event.operation } : {}),
              ...(event.status ? { status: event.status } : {}),
              ...(event.phase ? { phase: event.phase } : {}),
            })),
          }
        : {}),
      ...(record.solveFailureFallbackEvents?.length
        ? {
            solveFailureFallbackEvents: record.solveFailureFallbackEvents.map(
              (event) => ({ ...event }),
            ),
          }
        : {}),
      summary: {
        packsOpened: summary.packsOpened,
        picksCompleted: summary.picksCompleted,
        destinations: { ...summary.destinations },
        ...(summary.stoppedReason ? { stoppedReason: summary.stoppedReason } : {}),
        players: summary.players.map((player) => ({
          summaryKey: player.summaryKey,
          instanceId: player.instanceId,
          definitionId: player.definitionId,
          name: player.name,
          rating: player.rating,
          rarity: player.rarity,
          special: player.special,
          evolution: player.evolution,
          tradeable: player.tradeable,
          duplicate: player.duplicate,
          source: player.source,
          destination: player.destination,
          ...(typeof player.price === "number" ? { price: player.price } : {}),
        })),
        sbcSubmissions: summary.sbcSubmissions.map((submission) => ({
          sequence: submission.sequence,
          setId: submission.setId,
          challengeId: submission.challengeId,
          setName: submission.setName,
          challengeName: submission.challengeName,
          submittedAt: submission.submittedAt,
          players: (submission.players || []).map((player) => ({
            slot: player.slot,
            instanceId: player.instanceId,
            definitionId: player.definitionId,
            name: player.name,
            rating: player.rating,
            rarity: player.rarity,
            tradeable: player.tradeable,
            duplicate: player.duplicate,
            storage: player.storage,
            location: player.location,
          })),
        })),
      },
    },
  }, null, 2);
};

export function renderTaskHistoryDetail(
  documentRef: Document,
  record: FcxTaskHistoryRecord,
): HTMLElement {
  const summary = summaryFor(record);
  const submissions = summary.sbcSubmissions;
  const consumedCount = submissions.reduce(
    (total, submission) => total + (submission.players?.length || 0),
    0,
  );
  const content = documentRef.createElement("div");
  content.className = "fcx-task-history-detail";

  const result = documentRef.createElement("section");
  result.className = "fcx-task-history-detail__result";
  const resultTop = documentRef.createElement("div");
  resultTop.className = "fcx-task-history-detail__result-top";
  const badge = documentRef.createElement("span");
  badge.className = `fcx-task-history__status fcx-task-history__status--${record.status}`;
  badge.textContent = taskHistoryStatusLabel(record.status);
  const time = documentRef.createElement("time");
  time.dateTime = record.endedAt;
  time.textContent = formatDateTime(record.endedAt);
  resultTop.append(badge, time);
  result.appendChild(resultTop);
  if (record.reason || summary.stoppedReason) {
    const reason = documentRef.createElement("p");
    reason.className = "fcx-task-history-detail__reason";
    reason.textContent = String(record.reason || summary.stoppedReason);
    result.appendChild(reason);
  }
  content.appendChild(result);

  const metrics = documentRef.createElement("div");
  metrics.className = "fcx-pack-summary__metrics fcx-task-history-detail__metrics";
  appendMetric(documentRef, metrics, "SBC提交", submissions.length);
  appendMetric(documentRef, metrics, "消耗球员", consumedCount);
  appendMetric(documentRef, metrics, "开包", summary.packsOpened);
  appendMetric(documentRef, metrics, "球员挑选", summary.picksCompleted);
  appendMetric(documentRef, metrics, "获得球员", summary.players.length);
  content.appendChild(metrics);

  if (record.recoveryErrors?.length) {
    const recovery = documentRef.createElement("section");
    recovery.className = "fcx-task-history-detail__section";
    appendSectionHeading(
      documentRef,
      recovery,
      "异常恢复记录",
      `本次任务自动刷新恢复 ${record.recoveryErrors.length} 次`,
    );
    for (const event of record.recoveryErrors) {
      const item = documentRef.createElement("article");
      item.className = "fcx-task-history-detail__recovery";
      const heading = documentRef.createElement("strong");
      heading.textContent = `第 ${event.reloadAttempt} / ${event.maxReloads} 次 · ${event.operation || "流程异常"}`;
      const meta = documentRef.createElement("small");
      const step = event.stepName || (event.setId ? `SBC #${event.setId}` : `第 ${event.stepIndex + 1} 步`);
      meta.textContent = `${formatDateTime(event.occurredAt)} · 第 ${event.cycle + 1} 轮 · ${step}${event.status ? ` · 状态 ${event.status}` : ""}`;
      const reason = documentRef.createElement("p");
      reason.textContent = event.reason;
      item.append(heading, meta, reason);
      if (event.technicalMessage && event.technicalMessage !== event.reason) {
        const technical = documentRef.createElement("small");
        technical.textContent = `技术信息：${event.technicalMessage}`;
        item.appendChild(technical);
      }
      recovery.appendChild(item);
    }
    content.appendChild(recovery);
  }

  if (record.solveFailureFallbackEvents?.length) {
    const fallback = documentRef.createElement("section");
    fallback.className = "fcx-task-history-detail__section";
    appendSectionHeading(
      documentRef,
      fallback,
      "求解失败补偿记录",
      `本次任务触发 ${record.solveFailureFallbackEvents.length} 次求解失败补偿`,
    );
    record.solveFailureFallbackEvents.forEach((event, index) => {
      const item = documentRef.createElement("article");
      item.className = "fcx-task-history-detail__recovery";
      const heading = documentRef.createElement("strong");
      const outcome = SOLVE_FALLBACK_OUTCOME_LABELS[event.outcome]
        || String(event.outcome || "已结束");
      heading.textContent = `第 ${index + 1} 次 · ${outcome}`;
      const meta = documentRef.createElement("small");
      const failureLabel = event.failureSource === "totw_fallback"
        ? `主步骤“${event.mainStepName}”的周黑补给“${event.failedSetName}”`
        : `步骤“${event.failedSetName}”`;
      const fallbackLabel = event.fallbackSetName
        || `补偿 SBC #${event.fallbackSetId}`;
      meta.textContent = `${formatDateTime(event.occurredAt)} · ${failureLabel} → ${fallbackLabel} · 完成 ${event.completedRuns} 次`;
      const reason = documentRef.createElement("p");
      reason.textContent = event.reason || event.failureReason;
      item.append(heading, meta, reason);
      if (event.retryReason && event.retryReason !== event.reason) {
        const retry = documentRef.createElement("small");
        retry.textContent = `原步骤重试：${event.retryReason}`;
        item.appendChild(retry);
      }
      fallback.appendChild(item);
    });
    content.appendChild(fallback);
  }

  const destinations = documentRef.createElement("section");
  destinations.className = "fcx-task-history-detail__section";
  appendSectionHeading(documentRef, destinations, "奖励去向", "本次任务获得球员的最终安置结果");
  const destinationGrid = documentRef.createElement("div");
  destinationGrid.className = "fcx-task-history-detail__destinations";
  const destinationValues = [
    ["俱乐部", summary.destinations.club],
    ["SBC仓库", summary.destinations.storage],
    ["转会列表", summary.destinations.transfer],
    ["出售", summary.destinations.sold],
    ["未分配", summary.destinations.remaining],
  ] as const;
  for (const [label, value] of destinationValues) {
    appendMetric(documentRef, destinationGrid, label, value);
  }
  destinations.appendChild(destinationGrid);
  content.appendChild(destinations);

  const rewards = documentRef.createElement("section");
  rewards.className = "fcx-task-history-detail__section";
  appendSectionHeading(documentRef, rewards, "获得球员", `共记录 ${summary.players.length} 名球员`);
  if (!summary.players.length) {
    appendEmpty(documentRef, rewards, "本次任务没有记录到获得的球员。");
  } else {
    const table = documentRef.createElement("div");
    table.className = "fcx-pack-summary__table";
    const header = documentRef.createElement("div");
    header.className = "fcx-pack-summary__row fcx-pack-summary__row--header";
    for (const label of ["总评", "球员", "稀有度", "来源", "状态", "价格", "去向"]) {
      const cell = documentRef.createElement("span");
      cell.textContent = label;
      header.appendChild(cell);
    }
    table.appendChild(header);
    const players = [...summary.players].sort(
      (left, right) => numberOrZero(right.rating) - numberOrZero(left.rating)
        || String(left.name).localeCompare(String(right.name)),
    );
    for (const player of players) {
      const row = documentRef.createElement("div");
      row.className = "fcx-pack-summary__row";
      const cells = [
        String(player.rating || "—"),
        String(player.name || "未知球员"),
        String(player.rarity || "未知"),
        String(player.source || "未知"),
        `${player.tradeable ? "可交易" : "不可交易"}${player.duplicate ? " · 重复" : ""}`,
        typeof player.price === "number" && player.price > 0
          ? player.price.toLocaleString()
          : "—",
        DESTINATION_LABELS[player.destination] || "待确认",
      ];
      cells.forEach((value, index) => {
        const cell = index === 0 ? documentRef.createElement("strong") : documentRef.createElement("span");
        cell.dataset.label = ["总评", "球员", "稀有度", "来源", "状态", "价格", "去向"][index];
        cell.textContent = value;
        row.appendChild(cell);
      });
      table.appendChild(row);
    }
    rewards.appendChild(table);
  }
  content.appendChild(rewards);

  const consumed = documentRef.createElement("section");
  consumed.className = "fcx-task-history-detail__section";
  appendSectionHeading(documentRef, consumed, "SBC消耗", `按实际成功提交顺序展示，共 ${submissions.length} 次`);
  if (!submissions.length) {
    appendEmpty(documentRef, consumed, "本次任务没有成功提交SBC。");
  } else {
    for (const submission of submissions) {
      const group = documentRef.createElement("section");
      group.className = "fcx-consumption-group";
      const groupHeader = documentRef.createElement("header");
      const heading = documentRef.createElement("strong");
      heading.textContent = `第 ${submission.sequence} 次提交 · ${submission.setName}`;
      const meta = documentRef.createElement("small");
      meta.textContent = `${submission.challengeName} · ${formatDateTime(submission.submittedAt)}`;
      groupHeader.append(heading, meta);
      group.appendChild(groupHeader);
      if (!submission.players?.length) {
        appendEmpty(documentRef, group, "本次提交没有保存球员明细。");
      } else {
        const table = documentRef.createElement("div");
        table.className = "fcx-consumption-table";
        const header = documentRef.createElement("div");
        header.className = "fcx-consumption-row fcx-consumption-row--header";
        for (const label of ["总评", "球员", "稀有度", "状态", "提交前位置"]) {
          const cell = documentRef.createElement("span");
          cell.textContent = label;
          header.appendChild(cell);
        }
        table.appendChild(header);
        const players = [...submission.players].sort(
          (left, right) => numberOrZero(right.rating) - numberOrZero(left.rating)
            || numberOrZero(left.slot) - numberOrZero(right.slot),
        );
        for (const player of players) {
          const row = documentRef.createElement("div");
          row.className = "fcx-consumption-row";
          const values = [
            String(player.rating || "—"),
            String(player.name || "未知球员"),
            String(player.rarity || "未知"),
            `${player.tradeable ? "可交易" : "不可交易"}${player.duplicate ? " · 重复" : ""}`,
            LOCATION_LABELS[player.location] || "未知",
          ];
          values.forEach((value, index) => {
            const cell = index === 0 ? documentRef.createElement("strong") : documentRef.createElement("span");
            cell.dataset.label = ["总评", "球员", "稀有度", "状态", "提交前位置"][index];
            cell.textContent = value;
            row.appendChild(cell);
          });
          table.appendChild(row);
        }
        group.appendChild(table);
      }
      consumed.appendChild(group);
    }
  }
  content.appendChild(consumed);
  return content;
}
