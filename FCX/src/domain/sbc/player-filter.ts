export interface CandidateFlags {
  loanCount: number;
  sbcPrice: number;
  marketPrice: number | null;
  rating: number;
  ratingRange: readonly [number, number];
  definitionId: number;
  leagueId: number | string;
  nationId: number | string;
  teamId: number | string;
  rarityLabel: string;
  isSbcPlayer: boolean;
  timeLimited: boolean;
  rewardFromSbc: boolean;
  rewardFromObjective: boolean;
  rareflag: number;
  tradeable: boolean;
  extinct: boolean;
  storage: boolean;
  substitute: boolean;
}

export interface CandidateExclusions {
  leagues: ReadonlyArray<number | string>;
  nations: ReadonlyArray<number | string>;
  teams: ReadonlyArray<number | string>;
  rarities: readonly string[];
  excludeSbcSquads: boolean;
  excludeSbc: boolean;
  excludeObjective: boolean;
  priceRange: readonly [number | null, number | null];
  commonOnly: boolean;
  skipPriceRange: boolean;
  excludeTradable: boolean;
  excludeExtinct: boolean;
  onlyStorage: boolean;
}

export function isBackendCandidate(
  player: CandidateFlags,
  exclusions: CandidateExclusions,
): boolean {
  return (
    player.loanCount < 0 &&
      player.sbcPrice < 100_000 &&
      player.rating <= player.ratingRange[1] &&
      player.rating >= player.ratingRange[0] &&
      !exclusions.leagues.includes(player.leagueId) &&
      !exclusions.nations.includes(player.nationId) &&
      !exclusions.rarities.includes(player.rarityLabel) &&
      (!player.isSbcPlayer || !exclusions.excludeSbcSquads) &&
      !exclusions.teams.includes(player.teamId) &&
      !player.timeLimited &&
      !(player.rewardFromSbc && exclusions.excludeSbc) &&
      !(player.rewardFromObjective && exclusions.excludeObjective) &&
      (!exclusions.commonOnly || player.rareflag === 0) &&
      (exclusions.skipPriceRange ||
        ((exclusions.priceRange[0] === null ||
          (player.marketPrice !== null && player.marketPrice >= exclusions.priceRange[0])) &&
         (exclusions.priceRange[1] === null ||
          (player.marketPrice !== null && player.marketPrice <= exclusions.priceRange[1])))) &&
      !(player.tradeable && exclusions.excludeTradable) &&
      !(player.extinct && exclusions.excludeExtinct) &&
      (player.storage || !exclusions.onlyStorage) &&
      !player.substitute
  );
}
