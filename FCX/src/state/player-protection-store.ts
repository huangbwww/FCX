import type { StorageAdapter } from "./settings-store";
import type {
  LockedPlayerRecord,
  PlayerProtectionDocument,
  PlayerProtectionSettings,
} from "../types/protection";

const DEFAULT_SETTINGS: Readonly<PlayerProtectionSettings> = {
  protectEvolutions: true,
  protectActiveSquad: true,
};

function normalizePersonaId(personaId: string | number): string {
  const normalized = String(personaId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized || "default";
}

function createDocument(): PlayerProtectionDocument {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    lockedPlayers: {},
  };
}

export class PlayerProtectionStore {
  readonly storageKey: string;
  private document: PlayerProtectionDocument | undefined;

  constructor(
    private readonly storage: StorageAdapter,
    personaId: string | number,
  ) {
    this.storageKey = `fcx:2026:${normalizePersonaId(personaId)}:player-protection`;
  }

  getSettings(): PlayerProtectionSettings {
    return { ...this.getDocument().settings };
  }

  setSettings(settings: PlayerProtectionSettings): void {
    this.getDocument().settings = {
      protectEvolutions: settings.protectEvolutions !== false,
      protectActiveSquad: settings.protectActiveSquad !== false,
    };
    this.persist();
  }

  list(): LockedPlayerRecord[] {
    return Object.values(this.getDocument().lockedPlayers).sort(
      (left, right) => right.rating - left.rating || left.name.localeCompare(right.name),
    );
  }

  ids(): number[] {
    return this.list().map((record) => record.definitionId);
  }

  has(definitionId: number | string): boolean {
    return String(definitionId) in this.getDocument().lockedPlayers;
  }

  lock(record: Omit<LockedPlayerRecord, "updatedAt">): void {
    this.getDocument().lockedPlayers[String(record.definitionId)] = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  unlock(definitionId: number | string): void {
    if (!this.has(definitionId)) return;
    delete this.getDocument().lockedPlayers[String(definitionId)];
    this.persist();
  }

  private getDocument(): PlayerProtectionDocument {
    if (this.document) return this.document;
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      this.document = createDocument();
      return this.document;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<PlayerProtectionDocument>;
      this.document = {
        version: 1,
        settings: {
          protectEvolutions: parsed.settings?.protectEvolutions !== false,
          protectActiveSquad: parsed.settings?.protectActiveSquad !== false,
        },
        lockedPlayers:
          parsed.lockedPlayers && typeof parsed.lockedPlayers === "object"
            ? parsed.lockedPlayers
            : {},
      };
    } catch {
      this.document = createDocument();
    }
    return this.document;
  }

  private persist(): void {
    this.storage.setItem(this.storageKey, JSON.stringify(this.getDocument()));
  }
}
