import { SettingsDraft } from "./settings-draft";
import type { SettingKey, SettingsDocument, SolverSettings } from "../types/settings";

export interface SettingsEditStore {
  getDocument(): SettingsDocument;
  saveValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
    value: SolverSettings[K],
  ): void;
  replaceDocument(document: SettingsDocument): void;
}

export class SettingsEditSession {
  private draft: SettingsDraft;
  private disposed = false;

  constructor(private readonly store: SettingsEditStore) {
    this.draft = new SettingsDraft(store.getDocument());
  }

  get isDirty(): boolean {
    return this.draft.isDirty;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  getDocument(): SettingsDocument {
    return this.draft.getDocument();
  }

  getValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
  ): SolverSettings[K] | undefined {
    return this.draft.getValue(sbc, challenge, key);
  }

  getOwnValue<K extends SettingKey>(sbc: number | string, challenge: number | string, key: K): SolverSettings[K] | undefined {
    return this.draft.getOwnValue(sbc, challenge, key);
  }

  saveValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
    value: SolverSettings[K],
  ): void {
    this.assertActive();
    this.draft.saveValue(sbc, challenge, key, value);
  }

  deleteScope(sbc: number | string, challenge: number | string): void {
    this.assertActive();
    this.draft.deleteScope(sbc, challenge);
  }

  deleteValue(sbc: number | string, challenge: number | string, key: SettingKey): void {
    this.assertActive();
    this.draft.deleteValue(sbc, challenge, key);
  }

  persistValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
    value: SolverSettings[K],
  ): void {
    this.assertActive();
    this.store.saveValue(sbc, challenge, key, value);
    this.draft.syncValue(sbc, challenge, key, value);
  }

  commit(): void {
    this.assertActive();
    this.store.replaceDocument(this.draft.getDocument());
    this.draft = new SettingsDraft(this.store.getDocument());
  }

  discard(): void {
    this.assertActive();
    this.draft = new SettingsDraft(this.store.getDocument());
  }

  dispose(): void {
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("设置页面已经关闭，请重新打开 FCX 设置");
  }
}
