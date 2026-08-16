export interface PlayerProtectionSettings {
  protectEvolutions: boolean;
  protectActiveSquad: boolean;
  protectLockedStorageCopies: boolean;
}

export interface PlayerProtectionSnapshot extends PlayerProtectionSettings {
  personaId: string;
  lockedDefinitionIds: ReadonlySet<number>;
  activeSquadItemIds: ReadonlySet<number>;
  storageItemIds: ReadonlySet<number>;
}

export type PlayerProtectionViolationReason =
  | "manualLock"
  | "activeSquad"
  | "evolution";

export interface PlayerProtectionViolation {
  player: import("./game").EaPlayer;
  reasons: PlayerProtectionViolationReason[];
}

export interface LockedPlayerRecord {
  definitionId: number;
  name: string;
  rating: number;
  rarity: string;
  evolution: boolean;
  updatedAt: string;
}

export type ProtectedPlayerReason =
  | "manualLock"
  | "activeSquad"
  | "evolution";

export interface ProtectedPlayerViewRecord {
  definitionId: number;
  instanceId?: number;
  name: string;
  rating: number;
  rarity: string;
  inClub: boolean;
  reasons: ProtectedPlayerReason[];
}

export interface PlayerProtectionDocument {
  version: 1;
  settings: PlayerProtectionSettings;
  lockedPlayers: Record<string, LockedPlayerRecord>;
}
