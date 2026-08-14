import type {
  SettingKey,
  SettingsDocument,
  SolverSettings,
} from "../types/settings";

export class SettingsDraft {
  private document: SettingsDocument;
  private dirty = false;

  constructor(source: SettingsDocument) {
    this.document = structuredClone(source);
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  getDocument(): SettingsDocument {
    return structuredClone(this.document);
  }

  getValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
  ): SolverSettings[K] | undefined {
    const scoped = this.document.sbcSettings;
    const value =
      scoped?.[String(sbc)]?.[String(challenge)]?.[key] ??
      scoped?.[String(sbc)]?.["0"]?.[key] ??
      scoped?.["0"]?.["0"]?.[key];
    return value as SolverSettings[K] | undefined;
  }

  getOwnValue<K extends SettingKey>(sbc: number | string, challenge: number | string, key: K): SolverSettings[K] | undefined {
    return this.document.sbcSettings?.[String(sbc)]?.[String(challenge)]?.[key] as SolverSettings[K] | undefined;
  }

  saveValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
    value: SolverSettings[K],
  ): void {
    this.writeValue(sbc, challenge, key, value);
    this.dirty = true;
  }

  syncValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
    value: SolverSettings[K],
  ): void {
    this.writeValue(sbc, challenge, key, value);
  }

  deleteScope(sbc: number | string, challenge: number | string): void {
    const scoped = this.document.sbcSettings;
    const sbcKey = String(sbc);
    const challengeKey = String(challenge);
    if (!scoped?.[sbcKey]?.[challengeKey]) return;
    delete scoped[sbcKey][challengeKey];
    if (!Object.keys(scoped[sbcKey]).length) delete scoped[sbcKey];
    this.dirty = true;
  }

  deleteValue(sbc: number | string, challenge: number | string, key: SettingKey): void {
    const scope = this.document.sbcSettings?.[String(sbc)]?.[String(challenge)];
    if (!scope || !(key in scope)) return;
    delete scope[key];
    this.dirty = true;
  }

  private writeValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
    value: SolverSettings[K],
  ): void {
    this.document.sbcSettings ??= {};
    const sbcKey = String(sbc);
    const challengeKey = String(challenge);
    this.document.sbcSettings[sbcKey] ??= {};
    this.document.sbcSettings[sbcKey][challengeKey] ??= {};
    this.document.sbcSettings[sbcKey][challengeKey][key] = value;
  }
}
