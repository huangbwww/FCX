// @ts-nocheck

const saveTaskHistory = async ({ type, title, summary }) => {
  if (!summary) return;
  const hasActivity = Number(summary.packsOpened || 0) > 0
    || Number(summary.picksCompleted || 0) > 0
    || (summary.players || []).length > 0
    || (summary.sbcSubmissions || []).length > 0
    || Boolean(summary.stoppedReason);
  if (!hasActivity) return;
  try {
    await fcxTaskHistoryStore.add({
      personaId: getCurrentPersonaId(),
      type,
      title,
      summary,
    });
  } catch (error) {
    console.warn("[FCX][History] 本地任务历史保存失败", error);
  }
};

const copyTaskHistoryDiagnostics = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器未允许复制");
};

const appendTaskHistoryCardLine = (card, tagName, className, text) => {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  card.appendChild(element);
};

const openTaskHistory = async () => {
  const content = document.createElement("div");
  content.className = "fcx-task-history";
  const filters = document.createElement("div");
  filters.className = "fcx-task-history__filters";
  const type = document.createElement("select");
  type.innerHTML = `<option value="">全部任务</option><option value="sbc">单挑战SBC</option><option value="set">整组SBC</option><option value="routine">永动机</option><option value="pack">FCX开包</option>`;
  const date = document.createElement("input");
  date.type = "date";
  filters.append(type, date);
  const list = document.createElement("div");
  list.className = "fcx-task-history__list";
  content.append(filters, list);
  const modal = openFcxModal({
    id: "fcx-task-history-modal",
    title: "任务历史",
    description: "只保存在当前浏览器，按EA账号隔离；保留最近100条且最长30天。",
    content,
  });
  modal.panel.classList.add("fcx-modal-panel--routine");
  const clear = createModalButton("清空历史", "fcx-button--danger");
  const close = createModalButton("关闭");
  modal.footer.append(clear, close);
  close.addEventListener("click", modal.close);
  let records = [];
  const render = () => {
    list.replaceChildren();
    const selectedDate = date.value;
    const visible = records.filter((record) =>
      (!type.value || record.type === type.value)
      && (!selectedDate || taskHistoryLocalDateKey(record.endedAt) === selectedDate)
    );
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "auto-sbc-empty";
      empty.textContent = "当前筛选条件下没有任务记录。";
      list.appendChild(empty);
      return;
    }
    for (const record of visible) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "fcx-task-history__card";
      const submissions = record.summary?.sbcSubmissions?.length || 0;
      const players = record.summary?.players?.length || 0;
      const heading = document.createElement("div");
      heading.className = "fcx-task-history__card-heading";
      const title = document.createElement("strong");
      title.textContent = record.title;
      const status = document.createElement("span");
      status.className = `fcx-task-history__status fcx-task-history__status--${record.status}`;
      status.textContent = taskHistoryStatusLabel(record.status);
      heading.append(title, status);
      card.appendChild(heading);
      appendTaskHistoryCardLine(
        card,
        "span",
        "",
        `${taskHistoryTypeLabel(record.type)} · ${new Date(record.endedAt).toLocaleString("zh-CN", { hour12: false })}`
      );
      appendTaskHistoryCardLine(
        card,
        "small",
        "",
        `提交 ${submissions} 次 · 开包 ${record.summary?.packsOpened || 0} 个 · 挑选 ${record.summary?.picksCompleted || 0} 次 · 获得 ${players} 名球员`
      );
      card.addEventListener("click", () => {
        const detail = renderTaskHistoryDetail(document, record);
        const detailModal = openFcxModal({
          id: "fcx-task-history-detail-modal",
          title: record.title,
          description: `${taskHistoryTypeLabel(record.type)} · ${new Date(record.endedAt).toLocaleString()}`,
          content: detail,
        });
        detailModal.panel.classList.add("fcx-modal-panel--routine");
        const copy = createModalButton("复制诊断信息");
        copy.addEventListener("click", async () => {
          copy.disabled = true;
          try {
            await copyTaskHistoryDiagnostics(buildTaskHistoryDiagnosticText(record));
            queueFcxNotification(["诊断信息已复制。", UINotificationType.POSITIVE]);
          } catch (error) {
            queueFcxNotification([
              `复制诊断信息失败：${error?.message || error}`,
              UINotificationType.NEGATIVE,
            ]);
          } finally {
            copy.disabled = false;
          }
        });
        const done = createModalButton("返回", "fcx-button--primary");
        done.addEventListener("click", detailModal.close);
        detailModal.footer.append(copy, done);
      });
      list.appendChild(card);
    }
  };
  try {
    records = await fcxTaskHistoryStore.list(getCurrentPersonaId());
    render();
  } catch (error) {
    list.textContent = `任务历史读取失败：${error?.message || error}`;
  }
  type.addEventListener("change", render);
  date.addEventListener("change", render);
  clear.addEventListener("click", async () => {
    if (!window.confirm("确定清空当前EA账号的全部本地任务历史吗？")) return;
    await fcxTaskHistoryStore.clear(getCurrentPersonaId());
    records = [];
    render();
  });
};
