export interface PlayerDefinitionIdentityLike {
  definitionId?: unknown;
  _definitionId?: unknown;
  _staticData?: { id?: unknown };
}

export function readPlayerDefinitionId(
  player: PlayerDefinitionIdentityLike | null | undefined,
): number {
  const candidates = [
    player?.definitionId,
    player?._definitionId,
    player?._staticData?.id,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}
