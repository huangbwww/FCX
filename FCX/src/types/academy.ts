export type PlayStyleLevel = 0 | 1 | 2;

export interface AcademySlotReference {
  slotId: number;
  rewardId: number;
}

export interface PlayStyleAcademyDefinition {
  key: string;
  name: string;
  traitId: number;
  category: string;
  goalkeeperOnly: boolean;
  base: AcademySlotReference | null;
  plus: AcademySlotReference | null;
}

export interface AcademyRoleRecommendation {
  role: string;
  playStyles: string[];
}

export interface PlayStyleAcademyConfig {
  schemaVersion: number;
  capturedAt: string;
  limits: { basic: number; plus: number };
  eligibleRarities: number[];
  definitions: PlayStyleAcademyDefinition[];
  recommendations: Record<string, AcademyRoleRecommendation[]>;
}

export interface AcademyApplyPlanItem {
  key: string;
  name: string;
  traitId: number;
  target: Exclude<PlayStyleLevel, 0>;
  slot: AcademySlotReference;
}

export interface AcademyPlayerLike {
  id?: number;
  definitionId?: number;
  rareflag?: number;
  _rareflag?: number;
  loans?: number;
  preferredPosition?: number | string;
  possiblePositions?: unknown;
  getBaseRarity?(): number;
  getBasePossiblePositions?(): unknown;
  getNumBasicPlayStyles?(): number;
  getNumPlusPlayStyles?(): number;
  hasBasePlayStyle?(traitId: number): boolean;
  hasPlusPlayStyle?(traitId: number): boolean;
  isGK?(): boolean;
  isPlayer?(): boolean;
  isLimitedUse?(): boolean;
}
