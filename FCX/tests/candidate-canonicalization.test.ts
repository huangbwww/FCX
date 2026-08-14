import { describe, expect, it } from "vitest";
import {
  buildCandidatePipelineDiagnostics,
  canonicalizeBackendCandidates,
} from "../src/domain/sbc/candidate-canonicalization";
import type { BackendPlayer, SbcConstraint } from "../src/types/backend";

function candidate(
  overrides: Partial<BackendPlayer> & Pick<BackendPlayer, "id" | "name" | "definitionId">,
): BackendPlayer {
  const base: BackendPlayer = {
    id: overrides.id,
    name: overrides.name,
    definitionId: overrides.definitionId,
    cardType: "Gold Rare",
    assetId: overrides.definitionId,
    rating: 84,
    teamId: 1,
    leagueId: 1,
    nationId: 1,
    rarityId: 1,
    ratingTier: 3,
    isUntradeable: true,
    isDuplicate: false,
    isStorage: false,
    preferredPosition: 0,
    possiblePositions: [0],
    groups: [4],
    isFixed: false,
    concept: false,
    price: 100,
    futggPrice: null,
    maxChem: 0,
    teamChem: null,
    leagueChem: null,
    nationChem: null,
    normalizeClubId: 1,
  };
  return { ...base, ...overrides };
}

describe("backend candidate canonicalization", () => {
  it("prevents exact card copies from occupying the backend candidate window", () => {
    const repeated = [
      candidate({ id: 1, name: "Baltimore", definitionId: 10, price: 1 }),
      candidate({ id: 2, name: "Baltimore", definitionId: 10, price: 2 }),
      candidate({ id: 3, name: "Baltimore", definitionId: 10, price: 3 }),
      candidate({ id: 4, name: "Schuller", definitionId: 20, price: 4 }),
      candidate({ id: 5, name: "Schuller", definitionId: 20, price: 5 }),
      ...Array.from({ length: 9 }, (_, index) =>
        candidate({
          id: 100 + index,
          name: `Unique ${index}`,
          definitionId: 100 + index,
          price: 10 + index,
        }),
      ),
    ];

    const result = canonicalizeBackendCandidates(repeated, {
      preferDuplicates: true,
    });

    expect(new Set(repeated.slice(0, 11).map((player) => player.name)).size).toBe(8);
    expect(result.players).toHaveLength(11);
    expect(new Set(result.players.map((player) => player.name)).size).toBe(11);
    expect(result.removedCount).toBe(3);
    expect(result.collapsedDefinitionIds).toEqual([10, 20]);
  });

  it("selects fixed, duplicate/storage, cheaper and stable representatives in order", () => {
    const fixedResult = canonicalizeBackendCandidates(
      [
        candidate({ id: 1, name: "A", definitionId: 10, price: 1 }),
        candidate({ id: 9, name: "A", definitionId: 10, price: 500, isFixed: true }),
      ],
      { preferDuplicates: true },
    );
    expect(fixedResult.players[0]?.id).toBe(9);

    const duplicateResult = canonicalizeBackendCandidates(
      [
        candidate({ id: 1, name: "B", definitionId: 20, price: 1 }),
        candidate({ id: 2, name: "B", definitionId: 20, price: 50, isStorage: true }),
      ],
      { preferDuplicates: true },
    );
    expect(duplicateResult.players[0]?.id).toBe(2);

    const priceResult = canonicalizeBackendCandidates(
      [
        candidate({ id: 8, name: "C", definitionId: 30, price: 20 }),
        candidate({ id: 4, name: "C", definitionId: 30, price: 10 }),
      ],
      { preferDuplicates: false },
    );
    expect(priceResult.players[0]?.id).toBe(4);
  });

  it("keeps different card versions of the same footballer", () => {
    const result = canonicalizeBackendCandidates(
      [
        candidate({ id: 1, name: "Same Name", definitionId: 10 }),
        candidate({ id: 2, name: "Same Name", definitionId: 11, rating: 90 }),
      ],
      { preferDuplicates: true },
    );

    expect(result.players.map((player) => player.definitionId)).toEqual([10, 11]);
    expect(result.uniqueNameCount).toBe(1);
  });

  it("reports effective all-player requirements without changing count -1", () => {
    const players = Array.from({ length: 11 }, (_, index) =>
      candidate({
        id: index + 1,
        name: `Player ${index}`,
        definitionId: index + 1,
      }),
    );
    const canonicalization = canonicalizeBackendCandidates(players, {
      preferDuplicates: false,
    });
    const constraints: SbcConstraint[] = [
      {
        scope: "EXACT",
        count: 10,
        requirementKey: "PLAYER_RARITY_GROUP",
        eligibilityValues: [4],
      },
      {
        scope: "EXACT",
        count: -1,
        requirementKey: "PLAYER_QUALITY",
        eligibilityValues: [3],
      },
    ];

    const diagnostics = buildCandidatePipelineDiagnostics({
      beforeProtection: 20,
      afterProtection: 18,
      afterRules: 14,
      canonicalization,
      constraints,
      requiredPlayers: 10,
    });

    expect(diagnostics.constraints[0]?.matchingCandidates).toBe(11);
    expect(diagnostics.constraints[1]).toMatchObject({
      configuredCount: -1,
      effectiveRequired: 10,
      matchingCandidates: 11,
    });
  });
});
