import { HttpRequestError, requestTextCompat } from "../api/http";
import type {
  RemoteLoginResponse,
  RemoteRegisterResponse,
  RemoteRefreshResponse,
  RemoteSession,
  ScriptCatalogSnapshot,
  ScriptHarvestRecord,
  ScriptRuntimeLogRecord,
  ScriptRuntimeSnapshot,
} from "../types/remote-control";
import type { GmCompatRequest } from "../types/userscript";
import type { RemoteAuthStore } from "./auth-store";


export const REMOTE_API_URL = "https://fc.fczhushou.com";
export const REMOTE_WS_URL = "wss://fc.fczhushou.com/ws";

export class RemoteApiClient {
  private refreshPromise: Promise<RemoteSession> | undefined;

  constructor(
    private readonly store: RemoteAuthStore,
    private readonly request: GmCompatRequest,
  ) {}

  async login(username: string, password: string, deviceName: string): Promise<RemoteSession> {
    const machineId = await this.store.getMachineId();
    const response = await this.requestJson<RemoteLoginResponse>(
      "/api/auth/login",
      {
        method: "POST",
        body: {
          username,
          password,
          device_name: deviceName,
          machine_id: machineId,
          remember_me: true,
          device_type: "userscript",
          client_version: __FCX_SCRIPT_VERSION__,
        },
      },
      false,
    );
    const session = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      deviceId: response.device_id,
      username: response.user.username,
    };
    await this.store.saveSession(session);
    await this.store.setDeviceName(deviceName);
    return session;
  }

  async logout(): Promise<void> {
    try {
      await this.requestJson("/api/auth/logout", { method: "POST" });
    } finally {
      await this.store.clearSession();
    }
  }

  heartbeat(runtime: ScriptRuntimeSnapshot, catalogHash?: string): Promise<{
    catalog_upload_required: boolean;
  }> {
    return this.requestJson("/api/script/heartbeat", {
      method: "POST",
      body: { runtime, catalog_hash: catalogHash || null },
    });
  }

  uploadCatalog(catalog: ScriptCatalogSnapshot): Promise<void> {
    return this.requestJson("/api/script/catalog", {
      method: "PUT",
      body: catalog,
    });
  }

  updateCommandStatus(
    commandId: string,
    status: "accepted" | "running" | "succeeded" | "failed" | "expired",
    result: Record<string, unknown> = {},
  ): Promise<void> {
    return this.requestJson(
      `/api/client/commands/${encodeURIComponent(commandId)}/status`,
      { method: "POST", body: { status, result } },
    );
  }

  uploadHarvest(record: ScriptHarvestRecord): Promise<{ created: boolean }> {
    return this.requestJson("/api/client/harvest-records", {
      method: "POST",
      body: record,
    });
  }

  register(
    username: string,
    password: string,
    email?: string,
  ): Promise<RemoteRegisterResponse> {
    return this.requestJson<RemoteRegisterResponse>(
      "/api/auth/register",
      {
        method: "POST",
        body: {
          username,
          password,
          email: email || null,
          activation_code: null,
        },
      },
      false,
    );
  }

  uploadLogs(items: ScriptRuntimeLogRecord[]): Promise<{ inserted: number }> {
    return this.requestJson("/api/script/logs", {
      method: "POST",
      body: { items },
    });
  }

  async getAccessToken(): Promise<string> {
    return (await this.store.getSession())?.accessToken || "";
  }

  private async refresh(): Promise<RemoteSession> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const session = await this.store.getSession();
      if (!session) throw new Error("远程账号未登录");
      const response = await this.requestJson<RemoteRefreshResponse>(
        "/api/auth/refresh",
        { method: "POST", body: { refresh_token: session.refreshToken } },
        false,
      );
      const refreshed = {
        ...session,
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      };
      await this.store.saveSession(refreshed);
      return refreshed;
    })();
    try {
      return await this.refreshPromise;
    } catch (error) {
      await this.store.clearSession();
      throw error;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async requestJson<T = void>(
    path: string,
    init: { method?: string; body?: unknown } = {},
    retryAuth = true,
  ): Promise<T> {
    const session = await this.store.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
    try {
      const text = await requestTextCompat(
        `${REMOTE_API_URL}${path}`,
        this.request,
        {
          method: init.method || "GET",
          headers,
          ...(init.body !== undefined ? { data: JSON.stringify(init.body) } : {}),
        },
      );
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      if (retryAuth && error instanceof HttpRequestError && error.status === 401) {
        await this.refresh();
        return this.requestJson<T>(path, init, false);
      }
      throw error;
    }
  }
}
