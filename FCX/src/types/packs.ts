export type PackPickStrategy = "ovr" | "price";
export type PackPlayerDestination =
  | "club"
  | "storage"
  | "transfer"
  | "sold"
  | "remaining"
  | "unknown";

export interface PackSelection {
  id: number;
  tradable: boolean;
  quantity: number;
}

export interface PackRunOptions {
  autoPick: boolean;
  pickStrategy: PackPickStrategy;
  quickSellDuplicates: boolean;
  quickSellUnder: number;
  skipAnimation: boolean;
}

export interface PackPlayerSummary {
  summaryKey?: string;
  instanceId: number;
  definitionId: number;
  name: string;
  rating: number;
  rarity: string;
  special: boolean;
  evolution: boolean;
  tradeable: boolean;
  duplicate: boolean;
  source: string;
  destination: PackPlayerDestination;
  price?: number;
}

export type UnassignedStopCode =
  | "storage_full"
  | "transfer_full"
  | "blocked"
  | "routing_failed";

export type SbcConsumedPlayerLocation = "club" | "storage" | "duplicate";

export interface SbcConsumedPlayerSummary {
  slot: number;
  instanceId: number;
  definitionId: number;
  name: string;
  rating: number;
  rarity: string;
  tradeable: boolean;
  duplicate: boolean;
  storage: boolean;
  location: SbcConsumedPlayerLocation;
}

export interface SbcSubmissionSummary {
  sequence: number;
  setId: number;
  challengeId: number;
  setName: string;
  challengeName: string;
  submittedAt: string;
  players: SbcConsumedPlayerSummary[];
}

export interface PackTaskSummary {
  packsOpened: number;
  picksCompleted: number;
  players: PackPlayerSummary[];
  sbcSubmissions: SbcSubmissionSummary[];
  destinations: Record<Exclude<PackPlayerDestination, "unknown">, number>;
  stoppedReason?: string;
}

export interface UnassignedRoutingResult {
  movedToClub: number;
  movedToStorage: number;
  movedToTransferList: number;
  discarded: number;
  redeemed: number;
  playerPicks: number;
  remaining: number;
  blockedStorage: number;
  blockedTransfer: number;
  blockedOther: number;
  stopped: boolean;
  stopCode?: UnassignedStopCode;
  reason?: string;
}

export interface PackRunResult {
  opened: number;
  selected: number;
  cancelled: boolean;
  stopped: boolean;
  reason?: string;
  routing: UnassignedRoutingResult;
  summary: PackTaskSummary;
}
