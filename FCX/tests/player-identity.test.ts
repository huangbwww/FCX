import { describe, expect, it } from "vitest";
import { readPlayerDefinitionId } from "../src/domain/inventory/player-identity";

describe("player definition identity", () => {
  it("uses public, private and static-data ids in that order", () => {
    expect(readPlayerDefinitionId({ definitionId: 11, _definitionId: 22, _staticData: { id: 33 } })).toBe(11);
    expect(readPlayerDefinitionId({ _definitionId: 22, _staticData: { id: 33 } })).toBe(22);
    expect(readPlayerDefinitionId({ _staticData: { id: 33 } })).toBe(33);
  });

  it("never substitutes asset or metadata ids for a card definition id", () => {
    expect(readPlayerDefinitionId({ assetId: 44, _metaData: { id: 55 } } as never)).toBe(0);
    expect(readPlayerDefinitionId({ definitionId: 0, _definitionId: -1, _staticData: { id: "bad" } })).toBe(0);
  });
});
