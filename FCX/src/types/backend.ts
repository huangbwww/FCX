export type SolverStatusCode = 0 | 1 | 2 | 3 | 4;

export type SbcRequirementScope = "GREATER" | "LOWER" | "EXACT";

export interface SbcConstraint {
  scope: SbcRequirementScope;
  count: number;
  requirementKey: string;
  eligibilityValues: Array<number | string>;
}

export interface SbcData {
  constraints: SbcConstraint[];
  formation: number[];
  challengeId: number;
  setId: number;
  brickIndices: number[];
  finalSBC: boolean;
  currentSolution: Array<number | null | undefined>;
  subs: number[];
  awards: number[];
  setAward: unknown[];
  sbcName: string;
  challengeName: string;
}

export interface BackendPlayer {
  id: number;
  name: string;
  cardType: string;
  assetId: number | undefined;
  definitionId: number;
  rating: number;
  teamId: number | string;
  leagueId: number | string;
  nationId: number | string;
  rarityId: number;
  ratingTier: number;
  isUntradeable: boolean;
  isDuplicate: boolean;
  isStorage: boolean;
  preferredPosition: number;
  possiblePositions: number[];
  groups: number[];
  isFixed: boolean;
  concept: boolean;
  price: number;
  futggPrice: number | null;
  maxChem: number;
  teamChem: unknown;
  leagueChem: unknown;
  nationChem: unknown;
  normalizeClubId: number | string;
}

export interface SolveRequest {
  clubPlayers: BackendPlayer[];
  sbcData: SbcData;
  maxSolveTime: number;
  ratingOvershoot?: number;
}

export interface RatingOptimizationDiagnostics {
  target: number;
  window_min: number;
  window_max: number;
  minimum_rating: number | null;
  rating_optimal: boolean;
  cost_optimal: boolean;
  rating_stage_status?: SolverStatusCode;
  cost_stage_status?: SolverStatusCode | null;
  failure_code?: string | null;
}

export interface SolverPlayerResult
  extends Omit<BackendPlayer, "possiblePositions" | "groups"> {
  possiblePositions: number;
  groups: number | number[];
  Is_Pos: number;
  Chemistry: number;
}

export interface SolveResponse {
  status: string;
  status_code: SolverStatusCode;
  results?: string;
  rating_optimization?: RatingOptimizationDiagnostics;
  failure_code?: string;
}
