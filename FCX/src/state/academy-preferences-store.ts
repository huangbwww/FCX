export interface AcademyPreferences {
  schemaVersion: 1;
  hideMaxed: boolean;
  presets: Record<string, string[]>;
}

export interface AcademyPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "fcxPlayStyleAcademyPreferences";
const DEFAULTS: AcademyPreferences = {
  schemaVersion: 1,
  hideMaxed: false,
  presets: {},
};

export class AcademyPreferencesStore {
  constructor(private readonly storage: AcademyPreferencesStorage) {}

  get(): AcademyPreferences {
    try {
      const parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) || "null") as
        | Partial<AcademyPreferences>
        | null;
      const presets = Object.fromEntries(
        Object.entries(parsed?.presets || {}).flatMap(([key, value]) =>
          Array.isArray(value) && value.every((item) => typeof item === "string")
            ? [[key, [...value]]]
            : [],
        ),
      );
      return {
        schemaVersion: 1,
        hideMaxed: parsed?.hideMaxed === true,
        presets,
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  setHideMaxed(value: boolean): AcademyPreferences {
    return this.save({ ...this.get(), hideMaxed: Boolean(value) });
  }

  getPreset(group: string, role: string): string[] | undefined {
    const value = this.get().presets[this.key(group, role)];
    return value ? [...value] : undefined;
  }

  savePreset(group: string, role: string, keys: string[]): AcademyPreferences {
    const current = this.get();
    current.presets[this.key(group, role)] = [...keys];
    return this.save(current);
  }

  deletePreset(group: string, role: string): AcademyPreferences {
    const current = this.get();
    delete current.presets[this.key(group, role)];
    return this.save(current);
  }

  private key(group: string, role: string): string {
    return `${group}|${role}`;
  }

  private save(value: AcademyPreferences): AcademyPreferences {
    const normalized = structuredClone(value);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }
}
