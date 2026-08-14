import { describe, expect, it } from "vitest";
import {
  isBackendCandidate,
  type CandidateExclusions,
  type CandidateFlags,
} from "../src/domain/sbc/player-filter";

const candidate: CandidateFlags = {
  loanCount: -1,
  sbcPrice: 1_000,
  marketPrice: 1_000,
  rating: 82,
  ratingRange: [40, 99],
  definitionId: 1,
  leagueId: 2,
  nationId: 3,
  teamId: 4,
  rarityLabel: "Gold Rare",
  isSbcPlayer: false,
  timeLimited: false,
  rewardFromSbc: false,
  rewardFromObjective: false,
  rareflag: 0,
  tradeable: false,
  extinct: false,
  storage: false,
  substitute: false,
};

const exclusions: CandidateExclusions = {
  leagues: [],
  nations: [],
  teams: [],
  rarities: [],
  excludeSbcSquads: false,
  excludeSbc: false,
  excludeObjective: false,
  priceRange: [null, null],
  commonOnly: false,
  skipPriceRange: false,
  excludeTradable: false,
  excludeExtinct: false,
  onlyStorage: false,
};

describe("backend player filtering", () => {
  it("accepts a normal eligible player", () => {
    expect(isBackendCandidate(candidate, exclusions)).toBe(true);
  });

  it("applies exclusions on the normal branch", () => {
    expect(
      isBackendCandidate(candidate, { ...exclusions, leagues: [2] }),
    ).toBe(false);
  });

  it("does not let duplicate or storage priority bypass rules", () => {
    expect(
      isBackendCandidate(
        {
          ...candidate,
          rating: 99,
          ratingRange: [40, 80],
        },
        { ...exclusions, leagues: [2] },
      ),
    ).toBe(false);
  });

  it("applies inclusive market price boundaries", () => {
    expect(isBackendCandidate(candidate, { ...exclusions, priceRange: [1_000, 1_000] })).toBe(true);
    expect(isBackendCandidate(candidate, { ...exclusions, priceRange: [1_001, null] })).toBe(false);
  });

  it("allows only rareflag zero when common-only is enabled", () => {
    expect(isBackendCandidate(candidate, { ...exclusions, commonOnly: true })).toBe(true);
    expect(isBackendCandidate({ ...candidate, rareflag: 1 }, { ...exclusions, commonOnly: true })).toBe(false);
    expect(isBackendCandidate({ ...candidate, rareflag: 2 }, { ...exclusions, commonOnly: true })).toBe(false);
  });

  it("applies the default 65-93 rating boundaries inclusively", () => {
    expect(isBackendCandidate({ ...candidate, rating: 64, ratingRange: [65, 93] }, exclusions)).toBe(false);
    expect(isBackendCandidate({ ...candidate, rating: 65, ratingRange: [65, 93] }, exclusions)).toBe(true);
    expect(isBackendCandidate({ ...candidate, rating: 93, ratingRange: [65, 93] }, exclusions)).toBe(true);
    expect(isBackendCandidate({ ...candidate, rating: 94, ratingRange: [65, 93] }, exclusions)).toBe(false);
  });
});
