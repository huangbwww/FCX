import type { RemoteSession } from "../types/remote-control";


const KEYS = {
  access: "fcx:remote:access-token",
  refresh: "fcx:remote:refresh-token",
  deviceId: "fcx:remote:device-id",
  username: "fcx:remote:username",
  machineId: "fcx:remote:machine-id",
  deviceName: "fcx:remote:device-name",
  commandIds: "fcx:remote:command-ids",
  pendingTask: "fcx:remote:pending-task",
  catalogHash: "fcx:remote:catalog-hash",
} as const;

export const DEFAULT_SCRIPT_DEVICE_NAME = "一阵失心风FCX";

export interface GmValueAdapter {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createGmValueAdapter(): GmValueAdapter {
  return {
    get: async <T>(key: string, fallback: T) =>
      Promise.resolve(GM_getValue<T>(key, fallback)),
    set: async <T>(key: string, value: T) => {
      await Promise.resolve(GM_setValue(key, value));
    },
    delete: async (key: string) => {
      await Promise.resolve(GM_deleteValue(key));
    },
  };
}

export class RemoteAuthStore {
  constructor(private readonly storage: GmValueAdapter) {}

  async getSession(): Promise<RemoteSession | null> {
    const [accessToken, refreshToken, deviceId, username] = await Promise.all([
      this.storage.get(KEYS.access, ""),
      this.storage.get(KEYS.refresh, ""),
      this.storage.get(KEYS.deviceId, ""),
      this.storage.get(KEYS.username, ""),
    ]);
    return accessToken && refreshToken && deviceId
      ? { accessToken, refreshToken, deviceId, username }
      : null;
  }

  async saveSession(session: RemoteSession): Promise<void> {
    await Promise.all([
      this.storage.set(KEYS.access, session.accessToken),
      this.storage.set(KEYS.refresh, session.refreshToken),
      this.storage.set(KEYS.deviceId, session.deviceId),
      this.storage.set(KEYS.username, session.username),
    ]);
  }

  async clearSession(): Promise<void> {
    await Promise.all([
      this.storage.delete(KEYS.access),
      this.storage.delete(KEYS.refresh),
      this.storage.delete(KEYS.deviceId),
      this.storage.delete(KEYS.username),
      this.storage.delete(KEYS.pendingTask),
      this.storage.delete(KEYS.catalogHash),
    ]);
  }

  async getMachineId(): Promise<string> {
    const existing = await this.storage.get(KEYS.machineId, "");
    if (existing) return existing;
    const machineId = globalThis.crypto?.randomUUID?.()
      ?? `fcx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await this.storage.set(KEYS.machineId, machineId);
    return machineId;
  }

  getDeviceName(): Promise<string> {
    return this.storage.get(KEYS.deviceName, DEFAULT_SCRIPT_DEVICE_NAME);
  }

  setDeviceName(value: string): Promise<void> {
    return this.storage.set(
      KEYS.deviceName,
      value.trim() || DEFAULT_SCRIPT_DEVICE_NAME,
    );
  }

  async rememberCommand(id: string): Promise<boolean> {
    const ids = await this.storage.get<string[]>(KEYS.commandIds, []);
    if (ids.includes(id)) return false;
    await this.storage.set(KEYS.commandIds, [...ids, id].slice(-100));
    return true;
  }

  setPendingTask(value: Record<string, string>): Promise<void> {
    return this.storage.set(KEYS.pendingTask, value);
  }

  getPendingTask(): Promise<Record<string, string> | null> {
    return this.storage.get<Record<string, string> | null>(KEYS.pendingTask, null);
  }

  clearPendingTask(): Promise<void> {
    return this.storage.delete(KEYS.pendingTask);
  }

  getCatalogHash(): Promise<string> {
    return this.storage.get(KEYS.catalogHash, "");
  }

  setCatalogHash(value: string): Promise<void> {
    return this.storage.set(KEYS.catalogHash, value);
  }
}
