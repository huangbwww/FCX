import type {
  BackendPlayer,
  SbcConstraint,
} from "../../types/backend";

export interface CandidateCanonicalizationOptions {
  preferDuplicates: boolean;
}

export interface CandidateCanonicalizationResult {
  players: BackendPlayer[];
  removedCount: number;
  collapsedDefinitionIds: number[];
  uniqueDefinitionCount: number;
  uniqueNameCount: number;
}

export interface CandidateConstraintDiagnostic {
  requirementKey: string;
  scope: SbcConstraint["scope"];
  configuredCount: number;
  effectiveRequired: number;
  eligibilityValues: Array<number | string>;
  matchingCandidates: number | null;
}

export interface CandidatePipelineDiagnostics {
  beforeProtection: number;
  afterProtection: number;
  afterRules: number;
  afterCanonicalization: number;
  removedExactCopies: number;
  uniqueDefinitionCount: number;
  uniqueNameCount: number;
  collapsedDefinitionIds: number[];
  requiredPlayers: number;
  constraints: CandidateConstraintDiagnostic[];
}

function finitePrice(player: BackendPlayer): number {
  return Number.isFinite(player.price)
    ? player.price
    : Number.POSITIVE_INFINITY;
}

function compareRepresentatives(
  left: BackendPlayer,
  right: BackendPlayer,
  options: CandidateCanonicalizationOptions,
): number {
  if (left.isFixed !== right.isFixed) return left.isFixed ? -1 : 1;

  if (options.preferDuplicates) {
    const leftPreferred = left.isDuplicate || left.isStorage;
    const rightPreferred = right.isDuplicate || right.isStorage;
    if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
  }

  const priceDifference = finitePrice(left) - finitePrice(right);
  if (priceDifference !== 0) return priceDifference;
  return left.id - right.id;
}

/**
 * EA cannot place two instances of the same card definition in one challenge.
 * Keeping one deterministic representative also prevents identical copies from
 * occupying the backend's cheapest-per-group candidate window.
 */
export function canonicalizeBackendCandidates(
  players: readonly BackendPlayer[],
  options: CandidateCanonicalizationOptions,
): CandidateCanonicalizationResult {
  const representatives = new Map<number, BackendPlayer>();
  const collapsedDefinitionIds = new Set<number>();

  for (const player of players) {
    const current = representatives.get(player.definitionId);
    if (!current) {
      representatives.set(player.definitionId, player);
      continue;
    }

    collapsedDefinitionIds.add(player.definitionId);
    if (compareRepresentatives(player, current, options) < 0) {
      representatives.set(player.definitionId, player);
    }
  }

  const canonicalPlayers = [...representatives.values()];
  return {
    players: canonicalPlayers,
    removedCount: players.length - canonicalPlayers.length,
    collapsedDefinitionIds: [...collapsedDefinitionIds].sort(
      (left, right) => left - right,
    ),
    uniqueDefinitionCount: representatives.size,
    uniqueNameCount: new Set(canonicalPlayers.map((player) => player.name)).size,
  };
}

function numericValues(constraint: SbcConstraint): number[] {
  return constraint.eligibilityValues
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function compareNumeric(
  value: number,
  threshold: number,
  scope: SbcConstraint["scope"],
): boolean {
  if (scope === "LOWER") return value <= threshold;
  if (scope === "EXACT") return value === threshold;
  return value >= threshold;
}

function candidateMatchesConstraint(
  player: BackendPlayer,
  constraint: SbcConstraint,
): boolean | null {
  const values = numericValues(constraint);
  const threshold = values[0];

  switch (constraint.requirementKey) {
    case "PLAYER_RARITY_GROUP":
      return player.groups.some((group) => values.includes(Number(group)));
    case "PLAYER_QUALITY":
    case "PLAYER_LEVEL":
      return threshold === undefined
        ? null
        : compareNumeric(player.ratingTier, threshold, constraint.scope);
    case "PLAYER_MIN_OVR":
      return threshold === undefined ? null : player.rating >= threshold;
    case "PLAYER_MAX_OVR":
      return threshold === undefined ? null : player.rating <= threshold;
    case "PLAYER_EXACT_OVR":
      return values.includes(player.rating);
    case "CLUB_ID":
      return values.includes(Number(player.teamId));
    case "LEAGUE_ID":
      return values.includes(Number(player.leagueId));
    case "NATION_ID":
      return values.includes(Number(player.nationId));
    case "PLAYER_RARITY":
      return values.includes(player.rarityId);
    default:
      return null;
  }
}

export function buildCandidatePipelineDiagnostics(input: {
  beforeProtection: number;
  afterProtection: number;
  afterRules: number;
  canonicalization: CandidateCanonicalizationResult;
  constraints: readonly SbcConstraint[];
  requiredPlayers: number;
}): CandidatePipelineDiagnostics {
  return {
    beforeProtection: input.beforeProtection,
    afterProtection: input.afterProtection,
    afterRules: input.afterRules,
    afterCanonicalization: input.canonicalization.players.length,
    removedExactCopies: input.canonicalization.removedCount,
    uniqueDefinitionCount: input.canonicalization.uniqueDefinitionCount,
    uniqueNameCount: input.canonicalization.uniqueNameCount,
    collapsedDefinitionIds: input.canonicalization.collapsedDefinitionIds.slice(
      0,
      20,
    ),
    requiredPlayers: input.requiredPlayers,
    constraints: input.constraints.map((constraint) => {
      const matches = input.canonicalization.players.map((player) =>
        candidateMatchesConstraint(player, constraint),
      );
      const supported = matches.some((match) => match !== null);
      return {
        requirementKey: constraint.requirementKey,
        scope: constraint.scope,
        configuredCount: constraint.count,
        effectiveRequired:
          constraint.count < 0 ? input.requiredPlayers : constraint.count,
        eligibilityValues: [...constraint.eligibilityValues],
        matchingCandidates: supported
          ? matches.filter((match) => match === true).length
          : null,
      };
    }),
  };
}
