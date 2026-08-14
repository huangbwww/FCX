export type RatingBin = "<65" | "<75" | "<83" | `${number}` | "total";
export type RatingCounts = Record<RatingBin, number>;

export function countPlayersByRating(
  players: ReadonlyArray<{ rating: number }>,
): RatingCounts {
  const counts = { "<65": 0, "<75": 0, "<83": 0 } as RatingCounts;
  for (let rating = 83; rating <= 99; rating += 1) {
    counts[String(rating) as RatingBin] = 0;
  }
  counts.total = 0;
  for (const player of players) {
    if (player.rating < 65) counts["<65"] += 1;
    else if (player.rating < 75) counts["<75"] += 1;
    else if (player.rating < 83) counts["<83"] += 1;
    else if (player.rating <= 99) {
      counts[String(player.rating) as RatingBin] += 1;
    }
    counts.total += 1;
  }
  return counts;
}
