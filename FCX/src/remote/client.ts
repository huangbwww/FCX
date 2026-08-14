import type {
  RemoteCommand,
  RemoteConnectionStatus,
  RemoteRuntimeHooks,
  ScriptCatalogSnapshot,
  ScriptHarvestRecord,
  ScriptRuntimeLogRecord,
  ScriptRoutineStartPayload,
  ScriptRuntimeSnapshot,
  ScriptSbcStartPayload,
} from "../types/remote-control";
import type { GmCompatRequest } from "../types/userscript";
import { RemoteApiClient, REMOTE_WS_URL } from "./api-client";
import {
  createGmValueAdapter,
  DEFAULT_SCRIPT_DEVICE_NAME,
  RemoteAuthStore,
} from "./auth-store";
import { openFcxModal } from "../ui/modal";


const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_RECONNECT_MS = 30_000;
const PAGE_RELOAD_DELAY_MS = 300;
const SCRIPT_CAPABILITIES = [
  "script.sbc.start",
  "script.routine.start",
  "script.task.stop",
  "script.catalog.refresh",
  "script.page.reload",
] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseSbcPayload(value: unknown): ScriptSbcStartPayload {
  if (!isRecord(value)) throw new Error("SBC 命令参数无效");
  const mode = value.mode === "challenge" ? "challenge" : value.mode === "set" ? "set" : null;
  const setId = Number(value.set_id);
  const challengeId = value.challenge_id === undefined ? undefined : Number(value.challenge_id);
  const runs = Number(value.runs);
  const strategy = value.submit_strategy;
  if (
    !mode
    || !Number.isInteger(setId)
    || setId <= 0
    || !Number.isInteger(runs)
    || runs === 0
    || runs < -1
    || runs > 999
    || !["never", "feasible", "optimal"].includes(String(strategy))
    || (mode === "challenge" && (!Number.isInteger(challengeId) || Number(challengeId) <= 0))
  ) {
    throw new Error("SBC 命令参数无效");
  }
  return {
    set_id: setId,
    ...(challengeId !== undefined ? { challenge_id: challengeId } : {}),
    mode,
    runs,
    ignore_value: value.ignore_value === true,
    submit_strategy: strategy as ScriptSbcStartPayload["submit_strategy"],
    auto_open_packs: value.auto_open_packs === true,
  };
}

function parseRoutinePayload(value: unknown): ScriptRoutineStartPayload {
  if (!isRecord(value) || typeof value.routine_id !== "string" || !value.routine_id.trim()) {
    throw new Error("永动机流程参数无效");
  }
  return { routine_id: value.routine_id };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface ActiveRemoteTask {
  id: string;
  kind: "sbc" | "routine";
  name: string;
  promise: Promise<unknown>;
}

export class RemoteControlClient {
  private readonly store = new RemoteAuthStore(createGmValueAdapter());
  private readonly api: RemoteApiClient;
  private status: RemoteConnectionStatus = "signed_out";
  private socket: WebSocket | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private stopped = true;
  private catalogHash = "";
  private activeTask: ActiveRemoteTask | undefined;
  private lastError = "";
  private lastNotice = "";
  private loginUsername = "";
  private lastErrorIsConnection = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly hooks: RemoteRuntimeHooks,
    request: GmCompatRequest,
  ) {
    this.api = new RemoteApiClient(this.store, request);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): RemoteConnectionStatus {
    return this.status;
  }

  async getAccountView(): Promise<{
    username: string;
    deviceName: string;
  }> {
    const [session, deviceName] = await Promise.all([
      this.store.getSession(),
      this.store.getDeviceName(),
    ]);
    return { username: session?.username || "", deviceName };
  }

  async start(): Promise<void> {
    const session = await this.store.getSession();
    if (!session) {
      this.setStatus("signed_out");
      return;
    }
    const pending = await this.store.getPendingTask();
    if (pending) {
      this.lastError = `页面重载，远程任务 ${pending.taskId || ""} 已结束。`;
      this.lastErrorIsConnection = false;
      await this.store.clearPendingTask();
    }
    this.stopped = false;
    this.catalogHash = await this.store.getCatalogHash();
    this.openSocket();
    await this.sendHeartbeat();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  async login(username: string, password: string, deviceName: string): Promise<void> {
    this.setStatus("connecting");
    try {
      await this.api.login(username.trim(), password, deviceName.trim());
      this.lastError = "";
      this.lastErrorIsConnection = false;
      await this.start();
    } catch (error) {
      this.lastError = errorMessage(error);
      this.lastErrorIsConnection = true;
      this.setStatus("error");
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.stopTransport();
    await this.api.logout();
    this.setStatus("signed_out");
  }

  uploadHarvest(record: ScriptHarvestRecord): Promise<{ created: boolean }> {
    return this.api.uploadHarvest(record);
  }

  async register(username: string, password: string, email?: string): Promise<void> {
    await this.api.register(username.trim(), password, email?.trim() || undefined);
    this.loginUsername = username.trim();
    this.lastError = "";
    this.lastNotice = "注册成功，请使用新账号登录。";
  }

  uploadLogs(records: ScriptRuntimeLogRecord[]): Promise<{ inserted: number }> {
    return this.api.uploadLogs(records);
  }

  async refreshCatalog(): Promise<void> {
    await this.hooks.refreshCatalog();
    await this.uploadCatalog(true);
  }

  async mountSettings(container: HTMLElement): Promise<void> {
    const render = async () => {
      const view = await this.getAccountView();
      const signedIn = Boolean(view.username);
      const backendPort = this.hooks.getBackendPort();
      container.innerHTML = `
        <p class="fcx-settings-card-copy">登录后可由小程序选择本脚本，远程启动 SBC 或已有永动机流程。密码只在本次提交的内存中存在。</p>
        <div class="fcx-remote-status"><span>连接状态</span><strong>${this.statusLabel()}</strong></div>
        ${signedIn ? `
          <div class="fcx-remote-status"><span>账号</span><strong>${this.escape(view.username)}</strong></div>
          <label class="fcx-remote-field"><span>设备名称</span><input class="fcx-remote-device" value="${this.escape(view.deviceName)}" maxlength="100"></label>
          <div class="fcx-remote-status"><span>求解后端</span><strong>本地 127.0.0.1:${backendPort}</strong></div>
          <p class="fcx-settings-card-copy">修改端口后，请在 FCX 后端 EXE 中同步设置。</p>
          <div class="fcx-remote-actions"><button class="fcx-button fcx-remote-save">保存</button><button class="fcx-button fcx-button--danger fcx-remote-logout">退出登录</button></div>
        ` : `
          <label class="fcx-remote-field"><span>账号</span><input class="fcx-remote-username" autocomplete="username" maxlength="50" value="${this.escape(this.loginUsername)}"></label>
          <label class="fcx-remote-field"><span>密码</span><input class="fcx-remote-password" type="password" autocomplete="current-password"></label>
          <label class="fcx-remote-field"><span>设备名称</span><input class="fcx-remote-device" value="${this.escape(view.deviceName)}" maxlength="100"></label>
          <div class="fcx-remote-actions fcx-remote-actions--auth">
            <button class="fcx-button fcx-button--primary fcx-remote-login">登录</button>
            <button class="fcx-button fcx-remote-register">注册</button>
          </div>
        `}
        ${this.lastError ? `<p class="fcx-remote-error">${this.escape(this.lastError)}</p>` : ""}
        ${this.lastNotice ? `<p class="fcx-remote-notice">${this.escape(this.lastNotice)}</p>` : ""}
      `;
      container.querySelector<HTMLButtonElement>(".fcx-remote-login")?.addEventListener("click", async (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const username = container.querySelector<HTMLInputElement>(".fcx-remote-username")?.value || "";
        const passwordInput = container.querySelector<HTMLInputElement>(".fcx-remote-password");
        const password = passwordInput?.value || "";
        const deviceName =
          container.querySelector<HTMLInputElement>(".fcx-remote-device")
            ?.value || DEFAULT_SCRIPT_DEVICE_NAME;
        button.disabled = true;
        container.querySelector<HTMLButtonElement>(".fcx-remote-register")!.disabled = true;
        this.loginUsername = username.trim();
        this.lastNotice = "";
        try {
          await this.login(username, password, deviceName);
        } catch {
          // The error is rendered inside this card without retaining the password.
        } finally {
          if (passwordInput) passwordInput.value = "";
          await render();
        }
      });
      container.querySelector<HTMLButtonElement>(".fcx-remote-register")?.addEventListener("click", () => {
        this.openRegisterDialog(render);
      });
      container.querySelector<HTMLButtonElement>(".fcx-remote-save")?.addEventListener("click", async () => {
        const deviceName =
          container.querySelector<HTMLInputElement>(".fcx-remote-device")
            ?.value || DEFAULT_SCRIPT_DEVICE_NAME;
        await this.store.setDeviceName(deviceName);
        await render();
      });
      container.querySelector<HTMLButtonElement>(".fcx-remote-logout")?.addEventListener("click", async () => {
        await this.logout().catch((error: unknown) => {
          this.lastError = errorMessage(error);
          this.lastErrorIsConnection = true;
        });
        await render();
      });
    };
    const unsubscribe = this.subscribe(() => void render());
    container.addEventListener("DOMNodeRemoved", () => unsubscribe(), { once: true });
    await render();
  }

  private openRegisterDialog(onRegistered: () => Promise<void>): void {
    const content = document.createElement("form");
    content.className = "fcx-register-form";
    content.innerHTML = `
      <label class="fcx-register-field"><span>用户名</span><input class="fcx-register-username" autocomplete="username" maxlength="50" required></label>
      <label class="fcx-register-field"><span>密码</span><input class="fcx-register-password" type="password" autocomplete="new-password" required></label>
      <label class="fcx-register-field"><span>确认密码</span><input class="fcx-register-confirm" type="password" autocomplete="new-password" required></label>
      <label class="fcx-register-field"><span>邮箱（可选）</span><input class="fcx-register-email" type="email" autocomplete="email" maxlength="100"></label>
      <p class="fcx-register-hint">密码至少 6 位，并且至少包含一个字母和一个数字。</p>
      <p class="fcx-modal-status" aria-live="polite"></p>
    `;
    const modal = openFcxModal({
      id: "fcx-register-modal",
      title: "注册 FCX 账号",
      description: "注册后可在小程序中选择并控制当前脚本设备。",
      content,
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "fcx-button";
    cancel.textContent = "取消";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "fcx-button fcx-button--primary";
    submit.textContent = "注册";
    modal.footer.append(cancel, submit);
    cancel.addEventListener("click", modal.close);
    content.querySelector<HTMLInputElement>(".fcx-register-username")?.focus();

    let submitting = false;
    content.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting) return;
      const username = content.querySelector<HTMLInputElement>(".fcx-register-username")?.value.trim() || "";
      const passwordInput = content.querySelector<HTMLInputElement>(".fcx-register-password");
      const confirmInput = content.querySelector<HTMLInputElement>(".fcx-register-confirm");
      const email = content.querySelector<HTMLInputElement>(".fcx-register-email")?.value.trim() || "";
      const status = content.querySelector<HTMLElement>(".fcx-modal-status");
      const password = passwordInput?.value || "";
      const confirmation = confirmInput?.value || "";
      if (password !== confirmation) {
        if (status) status.textContent = "两次输入的密码不一致。";
        return;
      }
      submitting = true;
      submit.disabled = true;
      cancel.disabled = true;
      if (status) status.textContent = "正在注册…";
      try {
        await this.register(username, password, email);
        if (passwordInput) passwordInput.value = "";
        if (confirmInput) confirmInput.value = "";
        modal.close();
        await onRegistered();
      } catch (error) {
        if (status) status.textContent = errorMessage(error);
      } finally {
        if (passwordInput) passwordInput.value = "";
        if (confirmInput) confirmInput.value = "";
        submitting = false;
        submit.disabled = false;
        cancel.disabled = false;
      }
    });
    submit.addEventListener("click", () => content.requestSubmit());
  }

  private async sendHeartbeat(): Promise<void> {
    const session = await this.store.getSession();
    if (!session) return;
    const state = this.hooks.getRuntimeState();
    const runtime: ScriptRuntimeSnapshot = {
      script_device_id: session.deviceId,
      script_version: __FCX_SCRIPT_VERSION__,
      observed_at: new Date().toISOString(),
      ea_ready: state.eaReady,
      script_capabilities: [...SCRIPT_CAPABILITIES],
      task_status: this.activeTask
        ? this.hooks.isCancellationRequested() ? "stopping" : "running"
        : state.busy ? "running" : this.lastError ? "failed" : "idle",
      ...(this.activeTask ? {
        task_id: this.activeTask.id,
        task_kind: this.activeTask.kind,
        task_name: this.activeTask.name,
      } : state.taskKind ? {
        task_kind: state.taskKind,
        ...(state.taskName ? { task_name: state.taskName } : {}),
      } : {}),
      ...(state.stage ? { stage: state.stage } : {}),
      round: state.round || 0,
      progress: state.progress || 0,
      ...(this.lastError ? { last_error_summary: this.lastError.slice(0, 1000) } : {}),
    };
    try {
      const response = await this.api.heartbeat(runtime, this.catalogHash);
      if (this.lastErrorIsConnection) {
        this.lastError = "";
        this.lastErrorIsConnection = false;
      }
      this.setStatus("online");
      if (response.catalog_upload_required) await this.uploadCatalog(false);
    } catch (error) {
      this.lastError = errorMessage(error);
      this.lastErrorIsConnection = true;
      this.setStatus("offline");
    }
  }

  private async uploadCatalog(force: boolean): Promise<void> {
    const base = await this.hooks.buildCatalog();
    const serialized = JSON.stringify(base);
    const contentHash = await sha256(serialized);
    if (!force && contentHash === this.catalogHash) return;
    const catalog: ScriptCatalogSnapshot = { ...base, content_hash: contentHash };
    await this.api.uploadCatalog(catalog);
    this.catalogHash = contentHash;
    await this.store.setCatalogHash(contentHash);
  }

  private openSocket(): void {
    if (this.stopped || this.socket) return;
    this.setStatus("connecting");
    const socket = new WebSocket(REMOTE_WS_URL);
    this.socket = socket;
    socket.addEventListener("open", async () => {
      const token = await this.api.getAccessToken();
      if (!token || this.socket !== socket) return socket.close();
      socket.send(JSON.stringify({ type: "authenticate", token }));
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as unknown;
        if (!isRecord(message)) return;
        if (message.type === "connection") {
          this.reconnectAttempt = 0;
          this.setStatus("online");
        } else if (message.type === "remote_command") {
          void this.handleCommand(message.command);
        }
      } catch (error) {
        console.warn("[FCX][Remote] ignored malformed message", error);
      }
    });
    const reconnect = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.setStatus("offline");
      if (this.stopped || this.reconnectTimer) return;
      const delay = Math.min(MAX_RECONNECT_MS, 1000 * 2 ** this.reconnectAttempt++);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        this.openSocket();
      }, delay);
    };
    socket.addEventListener("close", reconnect);
    socket.addEventListener("error", reconnect);
  }

  private async handleCommand(value: unknown): Promise<void> {
    if (!isRecord(value) || typeof value.command_id !== "string" || typeof value.command_type !== "string") return;
    const command = value as unknown as RemoteCommand;
    if (!(await this.store.rememberCommand(command.command_id))) return;
    try {
      await this.api.updateCommandStatus(command.command_id, "accepted");
      await this.api.updateCommandStatus(command.command_id, "running");
      if (command.command_type === "script.task.stop") {
        this.hooks.stopTask();
        await this.api.updateCommandStatus(command.command_id, "succeeded", { message: "已请求安全结束当前任务" });
        await this.sendHeartbeat();
        return;
      }
      if (command.command_type === "script.catalog.refresh") {
        await this.refreshCatalog();
        await this.api.updateCommandStatus(command.command_id, "succeeded", { message: "SBC 目录已刷新" });
        return;
      }
      if (command.command_type === "script.page.reload") {
        await this.api.updateCommandStatus(command.command_id, "succeeded", {
          message: "刷新指令已确认，EA Web App 即将刷新",
        });
        setTimeout(() => this.hooks.reloadPage(), PAGE_RELOAD_DELAY_MS);
        return;
      }
      if (this.activeTask || this.hooks.getRuntimeState().busy) {
        throw new Error("当前 FCX 任务尚未结束");
      }
      let taskId: string;
      if (command.command_type === "script.sbc.start") {
        const payload = parseSbcPayload(command.payload);
        taskId = this.launchTask(command.command_id, "sbc", `SBC ${payload.set_id}`, () => this.hooks.startSbc(payload));
      } else if (command.command_type === "script.routine.start") {
        const payload = parseRoutinePayload(command.payload);
        taskId = this.launchTask(command.command_id, "routine", payload.routine_id, () => this.hooks.startRoutine(payload));
      } else {
        throw new Error("不支持的远程命令");
      }
      await this.api.updateCommandStatus(command.command_id, "succeeded", {
        task_id: taskId,
        message: "任务已在脚本端启动",
      });
      await this.sendHeartbeat();
    } catch (error) {
      this.lastError = errorMessage(error);
      this.lastErrorIsConnection = false;
      await this.api.updateCommandStatus(command.command_id, "failed", {
        message: this.lastError,
      }).catch(() => undefined);
      await this.sendHeartbeat();
    }
  }

  private launchTask(
    commandId: string,
    kind: "sbc" | "routine",
    name: string,
    factory: () => Promise<unknown>,
  ): string {
    const id = `remote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const promise = Promise.resolve().then(factory);
    this.activeTask = { id, kind, name, promise };
    this.lastError = "";
    void this.store.setPendingTask({ commandId, taskId: id, kind });
    void promise
      .catch((error: unknown) => {
        this.lastError = errorMessage(error);
        this.lastErrorIsConnection = false;
        console.error("[FCX][Remote] task failed", error);
      })
      .finally(async () => {
        if (this.activeTask?.id === id) this.activeTask = undefined;
        await this.store.clearPendingTask();
        await this.sendHeartbeat();
      });
    return id;
  }

  private stopTransport(): void {
    this.stopped = true;
    this.socket?.close();
    this.socket = undefined;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = undefined;
    this.reconnectTimer = undefined;
  }

  private setStatus(status: RemoteConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private statusLabel(): string {
    return ({
      signed_out: "未登录",
      connecting: "正在连接",
      online: "在线",
      offline: "离线重连中",
      error: "连接失败",
    } as const)[this.status];
  }

  private escape(value: string): string {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
  }
}
