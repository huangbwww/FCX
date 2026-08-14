import type { PriceCacheDiagnostics } from "../types/prices";
import { serializePriceDiagnostics } from "../state/price-diagnostics";
import { openFcxModal } from "./modal";

export interface PriceCacheDiagnosticsDialogOptions {
  load: () => Promise<PriceCacheDiagnostics>;
  onCopied?: () => void;
  onCopyError?: (error: unknown) => void;
  documentRef?: Document;
}

function statusText(ok: boolean): string {
  return ok ? "正常" : "需要处理";
}

function createMetric(
  documentRef: Document,
  label: string,
  value: string,
  state: "ok" | "warning" | "neutral" = "neutral",
): HTMLElement {
  const row = documentRef.createElement("div");
  row.className = `fcx-cache-metric fcx-cache-metric--${state}`;
  const name = documentRef.createElement("span");
  name.textContent = label;
  const data = documentRef.createElement("strong");
  data.textContent = value;
  row.append(name, data);
  return row;
}

function formatTime(value: string | undefined): string {
  if (!value) return "无";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : value;
}

function renderDiagnostics(
  documentRef: Document,
  root: HTMLElement,
  diagnostics: PriceCacheDiagnostics,
): void {
  root.replaceChildren();

  const summary = documentRef.createElement("section");
  summary.className = "fcx-cache-summary";
  summary.append(
    createMetric(documentRef, "内存记录", String(diagnostics.memoryCount)),
    createMetric(
      documentRef,
      "IndexedDB",
      `${diagnostics.indexedDb.recordCount} 条 · ${statusText(diagnostics.indexedDb.matchesMemory)}`,
      diagnostics.indexedDb.matchesMemory ? "ok" : "warning",
    ),
    createMetric(
      documentRef,
      "localStorage",
      `${diagnostics.localStorage.recordCount} 条 · ${statusText(diagnostics.localStorage.matchesMemory)}`,
      diagnostics.localStorage.matchesMemory ? "ok" : "warning",
    ),
  );

  const cache = documentRef.createElement("section");
  cache.className = "fcx-cache-section";
  cache.innerHTML = "<h3>缓存内容</h3>";
  const cacheGrid = documentRef.createElement("div");
  cacheGrid.className = "fcx-cache-grid";
  cacheGrid.append(
    createMetric(documentRef, "有效", String(diagnostics.freshCount), "ok"),
    createMetric(documentRef, "过期", String(diagnostics.staleCount), "warning"),
    createMetric(documentRef, "无效", String(diagnostics.invalidCount), diagnostics.invalidCount ? "warning" : "ok"),
    createMetric(documentRef, "本地数据大小", `${diagnostics.localStorage.bytes.toLocaleString()} 字节`),
    createMetric(documentRef, "最早价格", formatTime(diagnostics.oldestTimestamp)),
    createMetric(documentRef, "最新价格", formatTime(diagnostics.newestTimestamp)),
  );
  cache.appendChild(cacheGrid);

  const sources = documentRef.createElement("section");
  sources.className = "fcx-cache-section";
  sources.innerHTML = "<h3>价格来源</h3>";
  const sourceGrid = documentRef.createElement("div");
  sourceGrid.className = "fcx-cache-source-grid";
  const labels = {
    futgg: "FUT.GG",
    futnext: "Futnext",
    liveSearch: "EA实时市场",
    unknown: "旧缓存/未知",
  } as const;
  for (const [source, label] of Object.entries(labels)) {
    sourceGrid.appendChild(
      createMetric(
        documentRef,
        label,
        String(diagnostics.sourceCounts[source as keyof typeof labels]),
      ),
    );
  }
  sources.appendChild(sourceGrid);

  const request = documentRef.createElement("section");
  request.className = "fcx-cache-section";
  request.innerHTML = "<h3>最近一次价格任务</h3>";
  const requestText = documentRef.createElement("p");
  requestText.className = "fcx-cache-copy";
  requestText.textContent = diagnostics.lastFetch
    ? `状态：${diagnostics.lastFetch.status}；请求 ${diagnostics.lastFetch.requested}，保存 ${diagnostics.lastFetch.fetched}，缺失 ${diagnostics.lastFetch.missing.length}${diagnostics.lastFetch.error ? `；错误：${diagnostics.lastFetch.error}` : ""}`
    : "当前会话还没有执行价格任务。";
  request.appendChild(requestText);

  const persistence = documentRef.createElement("p");
  persistence.className = "fcx-cache-copy";
  persistence.textContent = diagnostics.lastPersistence
    ? `最近保存：${diagnostics.lastPersistence.success ? "成功" : "失败"}；IndexedDB ${statusText(diagnostics.lastPersistence.indexedDb.matches)}；localStorage ${statusText(diagnostics.lastPersistence.localStorage.matches)}`
    : "当前会话还没有保存结果；上方一致性检查代表当前实际存储状态。";
  request.appendChild(persistence);

  const events = documentRef.createElement("section");
  events.className = "fcx-cache-section";
  events.innerHTML = "<h3>调试事件</h3>";
  const eventList = documentRef.createElement("div");
  eventList.className = "fcx-cache-events";
  const recentEvents = diagnostics.events.slice(-50).reverse();
  if (!recentEvents.length) {
    const empty = documentRef.createElement("p");
    empty.className = "fcx-cache-copy";
    empty.textContent = "暂无调试事件。";
    eventList.appendChild(empty);
  } else {
    for (const event of recentEvents) {
      const line = documentRef.createElement("div");
      line.className = `fcx-cache-event fcx-cache-event--${event.status}`;
      line.textContent = `${formatTime(event.time)} · ${event.source ?? event.stage} · ${event.message}`;
      eventList.appendChild(line);
    }
  }
  events.appendChild(eventList);

  const checked = documentRef.createElement("p");
  checked.className = "fcx-cache-checked";
  checked.textContent = `检查时间：${formatTime(diagnostics.checkedAt)} · IndexedDB v${diagnostics.indexedDb.version ?? "未知"}`;
  root.append(summary, cache, sources, request, events, checked);
}

async function copyText(text: string, documentRef: Document): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  documentRef.body.appendChild(textarea);
  textarea.select();
  const copied = documentRef.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器未允许复制");
}

export async function openPriceCacheDiagnosticsDialog(
  options: PriceCacheDiagnosticsDialogOptions,
): Promise<void> {
  const documentRef = options.documentRef ?? document;
  const content = documentRef.createElement("div");
  content.className = "fcx-cache-diagnostics";
  content.textContent = "正在检查本地价格缓存…";
  const diagnostics = await options.load();
  renderDiagnostics(documentRef, content, diagnostics);

  const modal = openFcxModal({
    id: "fcx-price-cache-modal",
    title: "价格缓存诊断",
    description: "检查内存、IndexedDB 与 localStorage 是否成功保存并保持一致。",
    content,
    documentRef,
  });
  const close = documentRef.createElement("button");
  close.type = "button";
  close.className = "fcx-button";
  close.textContent = "关闭";
  const copy = documentRef.createElement("button");
  copy.type = "button";
  copy.className = "fcx-button";
  copy.textContent = "复制调试信息";
  const refresh = documentRef.createElement("button");
  refresh.type = "button";
  refresh.className = "fcx-button fcx-button--primary";
  refresh.textContent = "重新检查";
  modal.footer.append(close, copy, refresh);

  close.addEventListener("click", modal.close);
  refresh.addEventListener("click", async () => {
    refresh.disabled = true;
    refresh.textContent = "正在检查…";
    try {
      renderDiagnostics(documentRef, content, await options.load());
    } finally {
      refresh.disabled = false;
      refresh.textContent = "重新检查";
    }
  });
  copy.addEventListener("click", async () => {
    copy.disabled = true;
    try {
      await copyText(serializePriceDiagnostics(await options.load()), documentRef);
      copy.textContent = "已复制";
      options.onCopied?.();
    } catch (error) {
      copy.textContent = "复制失败";
      options.onCopyError?.(error);
    } finally {
      window.setTimeout(() => {
        copy.disabled = false;
        copy.textContent = "复制调试信息";
      }, 1500);
    }
  });
}
