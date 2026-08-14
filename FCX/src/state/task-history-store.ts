import type { PackTaskSummary } from "../types/packs";
import type { FcxTaskHistoryRecord, FcxTaskHistoryType } from "../types/task-history";

const DATABASE_NAME = "fcx-task-history";
const STORE_NAME = "records";
const DATABASE_VERSION = 1;
const MAX_RECORDS = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const taskHistoryStatusFor = (reason: string): FcxTaskHistoryRecord["status"] =>
  reason ? (/失败|错误/.test(reason) ? "failed" : "stopped") : "completed";

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("IndexedDB 请求失败"));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error("IndexedDB 事务失败"));
  transaction.onabort = () => reject(transaction.error || new Error("IndexedDB 事务已取消"));
});

export class TaskHistoryStore {
  private database?: Promise<IDBDatabase>;

  constructor(private readonly indexedDb: IDBFactory = indexedDB) {}

  async add(input: {
    personaId: string | number;
    type: FcxTaskHistoryType;
    title: string;
    summary: PackTaskSummary;
    endedAt?: string;
  }): Promise<FcxTaskHistoryRecord> {
    const endedAt = input.endedAt || new Date().toISOString();
    const reason = String(input.summary.stoppedReason || "").trim();
    const record: FcxTaskHistoryRecord = {
      id: `fcx-history-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      personaId: String(input.personaId),
      type: input.type,
      title: String(input.title || "FCX任务"),
      endedAt,
      status: taskHistoryStatusFor(reason),
      ...(reason ? { reason } : {}),
      summary: structuredClone(input.summary),
    };
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
    await this.prune(record.personaId, Date.parse(endedAt));
    return record;
  }

  async list(personaId: string | number): Promise<FcxTaskHistoryRecord[]> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as FcxTaskHistoryRecord[];
    await transactionDone(transaction);
    const cutoff = Date.now() - MAX_AGE_MS;
    return records
      .filter((record) => record.personaId === String(personaId) && Date.parse(record.endedAt) >= cutoff)
      .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
      .slice(0, MAX_RECORDS);
  }

  async clear(personaId: string | number): Promise<void> {
    const records = await this.listAll();
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    records.filter((record) => record.personaId === String(personaId)).forEach((record) => store.delete(record.id));
    await transactionDone(transaction);
  }

  private async prune(personaId: string, now: number): Promise<void> {
    const records = (await this.listAll())
      .filter((record) => record.personaId === personaId)
      .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt));
    const remove = records.filter((record, index) => index >= MAX_RECORDS || Date.parse(record.endedAt) < now - MAX_AGE_MS);
    if (!remove.length) return;
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    remove.forEach((record) => store.delete(record.id));
    await transactionDone(transaction);
  }

  private async listAll(): Promise<FcxTaskHistoryRecord[]> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as FcxTaskHistoryRecord[];
    await transactionDone(transaction);
    return records;
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("personaId", "personaId", { unique: false });
          store.createIndex("endedAt", "endedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地任务历史"));
    });
    return this.database;
  }
}
