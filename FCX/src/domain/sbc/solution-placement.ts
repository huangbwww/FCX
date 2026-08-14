import type { SolverPlayerResult } from "../../types/backend";

export function placeSolutionPlayers<T extends SolverPlayerResult>(
  results: T[],
  formation: number[],
  brickIndices: number[],
): Array<T | null> {
  const squad: Array<T | null> = Array.from({ length: 11 }, () => null);
  for (const index of brickIndices) {
    squad[index] = null;
  }
  for (const player of [...results].sort((a, b) => b.Is_Pos - a.Is_Pos)) {
    const slot = formation.findIndex(
      (position, index) =>
        ((position === player.possiblePositions && player.Is_Pos === 1) ||
          player.Is_Pos === 0) &&
        squad[index] === null &&
        !brickIndices.includes(index),
    );
    if (slot >= 0) {
      squad[slot] = player;
    }
  }
  return squad;
}
