export interface EaObserver {
  unobserve(context: unknown): void;
}

export interface EaResponse<T> {
  success: boolean;
  status: number;
  data: T;
  response: T;
  error?: { code: string | number };
}

export interface EaObservable<T> {
  observe(
    context: unknown,
    callback: (observer: EaObserver, response: EaResponse<T>) => void,
  ): void;
}

export interface EaStaticPlayerData {
  name: string;
  firstName: string;
  lastName: string;
  commonName?: string;
  rating?: number;
}

export interface EaAuction {
  buyNowPrice: number;
  tradeState: string;
}

export interface EaChemProfile {
  maxChem: number;
  rules: [unknown, unknown, unknown];
}

export interface EaPlayer {
  id: number;
  definitionId: number;
  rating: number;
  teamId: number | string;
  leagueId: number | string;
  nationId: number | string;
  rareflag: number;
  preferredPosition: number;
  possiblePositions: number[];
  groups: number[];
  loans: number;
  duplicateId: number;
  concept: boolean;
  untradeable?: boolean;
  isStorage?: boolean;
  isSbcPlayer?: boolean;
  normalizeClubId?: number | string;
  profile?: EaChemProfile;
  _staticData: EaStaticPlayerData;
  _metaData?: { id?: number };
  _itemPriceLimits?: { minimum?: number; maximum?: number };
  _auction?: EaAuction;
  isPlayer(): boolean;
  isTradeable(): boolean;
  isSpecial(): boolean;
  isTimeLimited(): boolean;
  isMovable(): boolean;
  isStorable(): boolean;
  isPlayerPickItem(): boolean;
  isFreeCoins(): boolean;
  isValid(): boolean;
  isLimitedUse(): boolean;
  getTier(): number;
  canRemoveEvolution?(): boolean;
  isActiveInTimedEvolution?(): boolean;
}

export interface EaSbcSquadPlayerSlot {
  _item: EaPlayer;
}

export interface EaSbcSquad {
  _formation: { generalPositions: number[] };
  _players: EaSbcSquadPlayerSlot[];
  simpleBrickIndices: number[];
  removeAllItems(): void;
  setPlayers(players: unknown[], refresh: boolean): void;
}

export interface EaChallenge {
  id: number;
  setId: number;
  name: string;
  status: string;
  priority: number;
  squad: EaSbcSquad | null;
  awards: Array<{ type: string; value: number }>;
  eligibilityRequirements: unknown[];
}

export interface EaSbcSet {
  id: number;
  name: string;
  timesCompleted: number;
  awards: unknown[];
  isSingleChallenge: boolean;
  repeatabilityMode?: string;
  getRepeatsRemaining?(): number | null;
  isComplete(): boolean;
  getChallenges(): EaChallenge[];
}

export interface EaSbcCatalog {
  sets: EaSbcSet[];
  categories: Array<{
    name: string;
    setIds: number[];
    isFavourite?: boolean;
  }>;
}
