import { requestTextCompat } from "../../api/http";
import type { GmValueAdapter } from "../../remote/auth-store";
import type { ScriptHarvestRecord } from "../../types/remote-control";
import type { GmCompatRequest } from "../../types/userscript";
import { openFcxModal } from "../../ui/modal";

export interface HarvestMomentConfig {
  enabled: boolean;
  minRating: number;
  ntfyTopic: string;
}

export type HarvestNtfyStatus = "disabled" | "pending" | "sent" | "failed";

export interface LocalHarvestRecord extends ScriptHarvestRecord {
  instance_id: number;
  ntfy_status: HarvestNtfyStatus;
  ntfy_error?: string;
}

interface HarvestItemLike {
  id?: unknown;
  definitionId?: unknown;
  rating?: unknown;
  duplicateId?: unknown;
  name?: unknown;
  _staticData?: { name?: unknown; rating?: unknown };
  isPlayer?: () => boolean;
}

interface HarvestMomentDependencies {
  now?: () => Date;
  randomId?: () => string;
}

const CONFIG_KEY = "fcx:harvest:config";
const DEFAULT_CONFIG: HarvestMomentConfig = {
  enabled: false,
  minRating: 88,
  ntfyTopic: "",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

function safePlayerName(item: HarvestItemLike): string {
  const value = item._staticData?.name ?? item.name;
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 255)
    : `球员 ${String(item.definitionId || "未知")}`;
}

function safeRating(item: HarvestItemLike): number {
  const value = Number(item.rating ?? item._staticData?.rating ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(99, Math.trunc(value))) : 0;
}

function isPlayer(item: HarvestItemLike): boolean {
  try {
    return item.isPlayer?.() === true;
  } catch {
    return false;
  }
}

export function normalizeNtfyTopic(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!trimmed.includes("://")) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(trimmed)) {
      throw new Error("ntfy 主题只能包含字母、数字、下划线和短横线");
    }
    return `https://ntfy.sh/${trimmed}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("ntfy 地址格式无效");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "ntfy.sh"
    || parsed.port
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !/^\/[A-Za-z0-9_-]{1,128}$/.test(parsed.pathname)
  ) {
    throw new Error("仅支持官方 https://ntfy.sh/<topic> 地址");
  }
  return `https://ntfy.sh${parsed.pathname}`;
}

export function selectHarvestCandidates(
  items: readonly HarvestItemLike[],
  config: HarvestMomentConfig,
  seenInstanceIds: ReadonlySet<number>,
): HarvestItemLike[] {
  if (!config.enabled) return [];
  return items.filter((item) => {
    const instanceId = Number(item.id || 0);
    return isPlayer(item)
      && safeRating(item) >= config.minRating
      && Number(item.duplicateId || 0) <= 0
      && (instanceId <= 0 || !seenInstanceIds.has(instanceId));
  });
}

export class HarvestMomentController {
  private config: HarvestMomentConfig = { ...DEFAULT_CONFIG };
  private readonly records: LocalHarvestRecord[] = [];
  private readonly seenInstanceIds = new Set<number>();
  private readonly pendingUploads = new Map<string, ScriptHarvestRecord>();
  private uploader?: (record: ScriptHarvestRecord) => Promise<unknown>;
  private retryTimer: ReturnType<typeof setInterval> | undefined;
  private activeList?: HTMLElement;
  private activeSummary?: HTMLElement;
  private readonly now: () => Date;
  private readonly randomId: () => string;

  constructor(
    private readonly storage: GmValueAdapter,
    private readonly request: GmCompatRequest,
    dependencies: HarvestMomentDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date());
    this.randomId = dependencies.randomId ?? (() =>
      globalThis.crypto?.randomUUID?.()
      ?? `harvest-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  }

  async initialize(): Promise<void> {
    const stored = await this.storage.get<Partial<HarvestMomentConfig>>(
      CONFIG_KEY,
      DEFAULT_CONFIG,
    );
    this.config = {
      enabled: stored.enabled === true,
      minRating: Math.max(0, Math.min(99, Number(stored.minRating ?? 88))),
      ntfyTopic: typeof stored.ntfyTopic === "string" ? stored.ntfyTopic.trim() : "",
    };
  }

  startRetryLoop(intervalMs = 20_000): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => void this.flushPending(), intervalMs);
  }

  stopRetryLoop(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = undefined;
  }

  setUploader(uploader: (record: ScriptHarvestRecord) => Promise<unknown>): void {
    this.uploader = uploader;
    void this.flushPending();
  }

  getConfig(): HarvestMomentConfig {
    return { ...this.config };
  }

  getRecords(): LocalHarvestRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  getActionSummary(): string {
    return this.config.enabled
      ? `已开启 · 评分 ≥ ${this.config.minRating}`
      : "设置评分与 ntfy 通知";
  }

  async saveConfig(config: HarvestMomentConfig): Promise<void> {
    const minRating = Number(config.minRating);
    if (!Number.isInteger(minRating) || minRating < 0 || minRating > 99) {
      throw new Error("最低评分必须是 0 至 99 的整数");
    }
    if (config.ntfyTopic.trim()) normalizeNtfyTopic(config.ntfyTopic);
    this.config = {
      enabled: config.enabled === true,
      minRating,
      ntfyTopic: config.ntfyTopic.trim(),
    };
    await this.storage.set(CONFIG_KEY, this.config);
  }

  captureItems(items: readonly HarvestItemLike[] | undefined, source: string): LocalHarvestRecord[] {
    if (!items?.length) return [];
    const candidates = selectHarvestCandidates(items, this.config, this.seenInstanceIds);
    const captured = candidates.map((item) => {
      const instanceId = Number(item.id || 0);
      if (instanceId > 0) this.seenInstanceIds.add(instanceId);
      const record: LocalHarvestRecord = {
        client_harvest_id: this.randomId(),
        instance_id: instanceId,
        player_name: safePlayerName(item),
        rating: safeRating(item),
        status: "captured",
        source_task: source.slice(0, 255),
        harvested_at: this.now().toISOString(),
        ntfy_status: this.config.ntfyTopic ? "pending" : "disabled",
      };
      this.records.unshift(record);
      const upload: ScriptHarvestRecord = {
        client_harvest_id: record.client_harvest_id,
        player_name: record.player_name,
        rating: record.rating,
        status: "captured",
        ...(record.source_task ? { source_task: record.source_task } : {}),
        harvested_at: record.harvested_at,
      };
      this.pendingUploads.set(upload.client_harvest_id, upload);
      if (this.config.ntfyTopic) void this.sendRecordNotification(record);
      return record;
    });
    if (captured.length) {
      this.renderOpenDialog();
      void this.flushPending();
    }
    return captured;
  }

  clearSessionRecords(): void {
    this.records.splice(0, this.records.length);
    this.renderOpenDialog();
  }

  async flushPending(): Promise<void> {
    if (!this.uploader || !this.pendingUploads.size) return;
    for (const record of [...this.pendingUploads.values()]) {
      try {
        await this.uploader(record);
        this.pendingUploads.delete(record.client_harvest_id);
      } catch {
        return;
      }
    }
  }

  async sendTestNotification(topic = this.config.ntfyTopic): Promise<void> {
    const url = normalizeNtfyTopic(topic);
    if (!url) throw new Error("请先填写 ntfy 主题");
    await this.postNtfy(url, "FCX 收菜时刻测试通知");
  }

  openDialog(documentRef: Document = document): void {
    const content = documentRef.createElement("div");
    content.className = "fcx-harvest-dialog";

    const settings = documentRef.createElement("section");
    settings.className = "fcx-harvest-settings";
    const enabledRow = this.createSettingRow(documentRef, "启动收菜时刻");
    const enabled = documentRef.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = this.config.enabled;
    enabledRow.appendChild(enabled);

    const ratingRow = this.createSettingRow(documentRef, "最低评分");
    const rating = documentRef.createElement("input");
    rating.type = "number";
    rating.min = "0";
    rating.max = "99";
    rating.value = String(this.config.minRating);
    ratingRow.appendChild(rating);

    const topicRow = this.createSettingRow(documentRef, "Ntfy 主题");
    const topic = documentRef.createElement("input");
    topic.type = "text";
    topic.maxLength = 128;
    topic.placeholder = "例如 fcx-harvest";
    topic.value = this.config.ntfyTopic;
    topicRow.appendChild(topic);

    const testButton = documentRef.createElement("button");
    testButton.type = "button";
    testButton.className = "fcx-button";
    testButton.textContent = "测试通知";
    const status = documentRef.createElement("p");
    status.className = "fcx-modal-status";
    settings.append(enabledRow, ratingRow, topicRow, testButton, status);

    const recordsHeader = documentRef.createElement("div");
    recordsHeader.className = "fcx-harvest-records__header";
    const recordsTitle = documentRef.createElement("strong");
    recordsTitle.textContent = "本次会话收菜记录";
    const clearButton = documentRef.createElement("button");
    clearButton.type = "button";
    clearButton.className = "fcx-button fcx-button--danger";
    clearButton.textContent = "清空列表";
    recordsHeader.append(recordsTitle, clearButton);
    const summary = documentRef.createElement("span");
    summary.className = "fcx-harvest-records__summary";
    const list = documentRef.createElement("div");
    list.className = "fcx-harvest-records";
    content.append(settings, recordsHeader, summary, list);

    const modal = openFcxModal({
      id: "fcx-harvest-modal",
      title: "收菜时刻",
      description: "开包后只记录达到评分要求且未重复的球员。",
      content,
      documentRef,
    });
    this.activeList = list;
    this.activeSummary = summary;
    this.renderOpenDialog();

    testButton.addEventListener("click", async () => {
      testButton.disabled = true;
      status.textContent = "正在发送测试通知…";
      try {
        await this.sendTestNotification(topic.value);
        status.textContent = "测试通知已发送";
      } catch (error) {
        status.textContent = errorMessage(error);
      } finally {
        testButton.disabled = false;
      }
    });
    clearButton.addEventListener("click", () => this.clearSessionRecords());

    const closeButton = documentRef.createElement("button");
    closeButton.type = "button";
    closeButton.className = "fcx-button";
    closeButton.textContent = "关闭";
    closeButton.addEventListener("click", () => modal.close());
    const saveButton = documentRef.createElement("button");
    saveButton.type = "button";
    saveButton.className = "fcx-button fcx-button--primary";
    saveButton.textContent = "保存设置";
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        await this.saveConfig({
          enabled: enabled.checked,
          minRating: Number(rating.value),
          ntfyTopic: topic.value,
        });
        status.textContent = "设置已保存";
      } catch (error) {
        status.textContent = errorMessage(error);
      } finally {
        saveButton.disabled = false;
      }
    });
    modal.footer.append(closeButton, saveButton);
  }

  private createSettingRow(documentRef: Document, label: string): HTMLLabelElement {
    const row = documentRef.createElement("label");
    row.className = "fcx-option-card";
    const text = documentRef.createElement("span");
    text.textContent = label;
    row.appendChild(text);
    return row;
  }

  private async sendRecordNotification(record: LocalHarvestRecord): Promise<void> {
    try {
      const url = normalizeNtfyTopic(this.config.ntfyTopic);
      await this.postNtfy(url, `逮住球员：${record.player_name}（评分 ${record.rating}）`);
      record.ntfy_status = "sent";
      delete record.ntfy_error;
    } catch (error) {
      record.ntfy_status = "failed";
      record.ntfy_error = errorMessage(error).slice(0, 300);
    }
    this.renderOpenDialog();
  }

  private postNtfy(url: string, message: string): Promise<void> {
    return requestTextCompat(url, this.request, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Title: "FCX Harvest",
      },
      data: message,
    }).then(() => undefined);
  }

  private renderOpenDialog(): void {
    if (!this.activeList?.isConnected || !this.activeSummary?.isConnected) return;
    const documentRef = this.activeList.ownerDocument;
    this.activeList.replaceChildren();
    this.activeSummary.textContent = this.records.length
      ? `共 ${this.records.length} 名 · 最高评分 ${Math.max(...this.records.map((item) => item.rating))}`
      : "本次会话尚无记录";
    if (!this.records.length) {
      const empty = documentRef.createElement("p");
      empty.className = "fcx-harvest-records__empty";
      empty.textContent = "开启后，满足条件的球员会显示在这里。";
      this.activeList.appendChild(empty);
      return;
    }
    for (const record of this.records) {
      const row = documentRef.createElement("div");
      row.className = "fcx-harvest-record";
      const rating = documentRef.createElement("strong");
      rating.className = "fcx-harvest-record__rating";
      rating.textContent = String(record.rating);
      const copy = documentRef.createElement("div");
      const name = documentRef.createElement("strong");
      name.textContent = record.player_name;
      const meta = documentRef.createElement("span");
      const time = new Date(record.harvested_at).toLocaleTimeString("zh-CN", { hour12: false });
      const ntfy = {
        disabled: "未配置 ntfy",
        pending: "ntfy 发送中",
        sent: "ntfy 已发送",
        failed: "ntfy 发送失败",
      }[record.ntfy_status];
      meta.textContent = `${time} · ${record.source_task || "卡包"} · ${ntfy}`;
      copy.append(name, meta);
      row.append(rating, copy);
      this.activeList.appendChild(row);
    }
  }
}
