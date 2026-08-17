import { STORAGE_KEYS } from "../config/constants";
import type {
  SettingKey,
  SettingsDocument,
  SolverSettings,
} from "../types/settings";
import {
  DEFAULT_BACKEND_PORT,
  parseBackendPort,
  portFromLegacyApiUrl,
} from "../config/backend-endpoint";
import { DEFAULT_RATING_RANGE } from "../config/default-settings";

const RETIRED_SOUND_SETTING = ["play", "Sounds"].join("");

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SettingsStore {
  private cache: SettingsDocument | undefined;

  constructor(private readonly storage: StorageAdapter) {}

  getDocument(): SettingsDocument {
    if (this.cache) {
      return this.cache;
    }
    const serialized = this.storage.getItem(STORAGE_KEYS.solverSettings);
    this.cache = serialized
      ? (JSON.parse(serialized) as SettingsDocument)
      : {};
    return this.cache;
  }

  setSection(section: string, value: unknown): void {
    const document = this.getDocument();
    document[section] = value;
    this.cache = document;
    this.persist();
  }

  getValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
  ): SolverSettings[K] | undefined {
    const scoped = this.getDocument().sbcSettings;
    const value =
      scoped?.[String(sbc)]?.[String(challenge)]?.[key] ??
      scoped?.[String(sbc)]?.["0"]?.[key] ??
      scoped?.["0"]?.["0"]?.[key];
    return value as SolverSettings[K] | undefined;
  }

  getOwnValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
  ): SolverSettings[K] | undefined {
    return this.getDocument().sbcSettings?.[String(sbc)]?.[String(challenge)]?.[key] as
      | SolverSettings[K]
      | undefined;
  }

  saveValue<K extends SettingKey>(
    sbc: number | string,
    challenge: number | string,
    key: K,
    value: SolverSettings[K],
  ): void {
    const previous = this.getDocument();
    const document = structuredClone(previous);
    document.sbcSettings ??= {};
    const sbcKey = String(sbc);
    const challengeKey = String(challenge);
    document.sbcSettings[sbcKey] ??= {};
    document.sbcSettings[sbcKey][challengeKey] ??= {};
    document.sbcSettings[sbcKey][challengeKey][key] = value;
    this.cache = document;
    try {
      this.persist();
    } catch (error) {
      this.cache = previous;
      throw error;
    }
  }

  deleteValue(
    sbc: number | string,
    challenge: number | string,
    key: SettingKey,
  ): void {
    const previous = this.getDocument();
    const document = structuredClone(previous);
    const scope = document.sbcSettings?.[String(sbc)]?.[String(challenge)];
    if (!scope || !(key in scope)) return;
    delete scope[key];
    if (!Object.keys(scope).length) delete document.sbcSettings?.[String(sbc)]?.[String(challenge)];
    this.cache = document;
    try { this.persist(); } catch (error) { this.cache = previous; throw error; }
  }

  migrateFcxCandidateRules(): boolean {
    const document = this.getDocument();
    if (Number(document.fcxCandidateRulesMigrationVersion || 0) >= 1) return false;
    const next = structuredClone(document);
    for (const challenges of Object.values(next.sbcSettings || {})) {
      for (const config of Object.values(challenges)) {
        const values = config as Record<string, unknown>;
        if (values.allowExtraRequiredRarityGroupPlayers === undefined) {
          const legacyKey = Object.keys(values).find(
            (key) => key.startsWith("allowRarityGroup") && typeof values[key] === "boolean",
          );
          if (legacyKey) {
            values.allowExtraRequiredRarityGroupPlayers = values[legacyKey];
          }
        }
        for (const key of Object.keys(values)) {
          if (
            key.startsWith("allowRarityGroup") &&
            key !== "allowExtraRequiredRarityGroupPlayers"
          ) {
            delete values[key];
          }
        }
        delete values.excludeSpecial;
        delete values.saveTotw;
      }
    }
    next.fcxCandidateRulesMigrationVersion = 1;
    for (const key of Object.keys(next)) {
      if (
        key.endsWith("RulesMigrationVersion") &&
        key !== "fcxCandidateRulesMigrationVersion"
      ) {
        delete (next as Record<string, unknown>)[key];
      }
    }
    this.replaceDocument(next);
    return true;
  }

  migrateDefaultRatingRange(): boolean {
    const document = this.getDocument();
    if (Number(document.ratingRangeDefaultsMigrationVersion || 0) >= 1) {
      return false;
    }
    const next = structuredClone(document);
    const globalSettings = next.sbcSettings?.["0"]?.["0"];
    const range = globalSettings?.ratingRange;
    if (
      globalSettings &&
      Array.isArray(range) &&
      range.length === 2 &&
      Number(range[0]) === 0 &&
      Number(range[1]) === 99
    ) {
      globalSettings.ratingRange = [...DEFAULT_RATING_RANGE];
    }
    next.ratingRangeDefaultsMigrationVersion = 1;
    this.replaceDocument(next);
    return true;
  }

  migrateMaxRating(): boolean {
    const document = this.getDocument();
    const scoped = document.sbcSettings;
    if (!scoped) {
      return false;
    }
    let changed = false;
    for (const challenges of Object.values(scoped)) {
      for (const config of Object.values(challenges)) {
        if (!("maxRating" in config)) {
          continue;
        }
        const maxRating = Number(config.maxRating);
        if (Number.isFinite(maxRating)) {
          const range: [number, number] = Array.isArray(config.ratingRange)
            ? [config.ratingRange[0] ?? 0, config.ratingRange[1] ?? 99]
            : [0, 99];
          range[1] = maxRating;
          config.ratingRange = range;
        }
        delete config.maxRating;
        changed = true;
      }
    }
    if (changed) {
      this.setSection("sbcSettings", scoped);
    }
    return changed;
  }

  removeLegacyRepeatCount(): boolean {
    const document = this.getDocument();
    const scoped = document.sbcSettings;
    if (!scoped) return false;
    let changed = false;
    for (const challenges of Object.values(scoped)) {
      for (const config of Object.values(challenges)) {
        if (!("repeatCount" in config)) continue;
        delete config.repeatCount;
        changed = true;
      }
    }
    if (changed) this.setSection("sbcSettings", scoped);
    return changed;
  }

  removeLegacyUiSettings(): boolean {
    const document = this.getDocument();
    const scoped = document.sbcSettings;
    if (!scoped) return false;
    let changed = false;
    for (const [sbcId, challenges] of Object.entries(scoped)) {
      for (const [challengeId, config] of Object.entries(challenges)) {
        if ("showLogOverlay" in config) {
          delete config.showLogOverlay;
          changed = true;
        }
        if (RETIRED_SOUND_SETTING in config) {
          delete (config as Record<string, unknown>)[RETIRED_SOUND_SETTING];
          changed = true;
        }
        if ((sbcId !== "0" || challengeId !== "0") && "conceptPremium" in config) {
          delete config.conceptPremium;
          changed = true;
        }
      }
    }
    if (changed) this.setSection("sbcSettings", scoped);
    return changed;
  }

  removeRetiredStartupSbcSettings(): boolean {
    const document = this.getDocument();
    if (Number(document.startupSbcRetirementVersion || 0) >= 1) {
      return false;
    }
    const next = structuredClone(document);
    const retiredSetting = ["sbc", "OnLogin"].join("");
    const scoped = next.sbcSettings;
    if (scoped) {
      for (const [sbcId, challenges] of Object.entries(scoped)) {
        for (const [challengeId, config] of Object.entries(challenges)) {
          delete (config as Record<string, unknown>)[retiredSetting];
          if (!Object.keys(config).length) delete challenges[challengeId];
        }
        if (!Object.keys(challenges).length) delete scoped[sbcId];
      }
      if (!Object.keys(scoped).length) delete next.sbcSettings;
    }
    next.startupSbcRetirementVersion = 1;
    this.replaceDocument(next);
    return true;
  }

  migrateDefaultSquadRatingOvershoot(): boolean {
    const document = this.getDocument();
    if (Number(document.squadRatingOvershootDefaultsMigrationVersion || 0) >= 1) {
      return false;
    }
    const next = structuredClone(document);
    const globalSettings = next.sbcSettings?.["0"]?.["0"];
    if (
      globalSettings
      && Number(globalSettings.squadRatingOvershoot) === 0.8
    ) {
      globalSettings.squadRatingOvershoot = 1.8;
    }
    next.squadRatingOvershootDefaultsMigrationVersion = 1;
    this.replaceDocument(next);
    return true;
  }

  migrateBackendPort(): boolean {
    const current = this.getValue(0, 0, "backendPort");
    const normalized = parseBackendPort(current);
    if (normalized !== null) {
      if (normalized === current) return false;
      this.saveValue(0, 0, "backendPort", normalized);
      return true;
    }
    const legacy = portFromLegacyApiUrl(this.getValue(0, 0, "apiUrl"));
    this.saveValue(0, 0, "backendPort", legacy ?? DEFAULT_BACKEND_PORT);
    return true;
  }

  replaceDocument(document: SettingsDocument): void {
    const previous = this.cache;
    this.cache = structuredClone(document);
    try {
      this.persist();
    } catch (error) {
      this.cache = previous;
      throw error;
    }
  }

  clearCache(): void {
    this.cache = undefined;
  }

  private persist(): void {
    this.storage.setItem(
      STORAGE_KEYS.solverSettings,
      JSON.stringify(this.cache ?? {}),
    );
  }
}
