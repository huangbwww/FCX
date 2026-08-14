import type {
  PackPlayerDestination,
  PackPlayerSummary,
  PackTaskSummary,
  SbcSubmissionSummary,
} from "../../types/packs";

export function createPackTaskSummary(): PackTaskSummary {
  return {
    packsOpened: 0,
    picksCompleted: 0,
    players: [],
    sbcSubmissions: [],
    destinations: {
      club: 0,
      storage: 0,
      transfer: 0,
      sold: 0,
      remaining: 0,
    },
  };
}

export function mergePackTaskSummary(
  target: PackTaskSummary,
  source: PackTaskSummary,
): PackTaskSummary {
  target.packsOpened += source.packsOpened;
  target.picksCompleted += source.picksCompleted;
  const playerKey = (player: PackPlayerSummary) =>
    player.summaryKey || `item:${player.instanceId}`;
  const knownIds = new Set(target.players.map(playerKey));
  for (const player of source.players) {
    const key = playerKey(player);
    if (!knownIds.has(key)) {
      target.players.push(player);
      knownIds.add(key);
    }
  }
  for (const submission of source.sbcSubmissions) {
    target.sbcSubmissions.push({
      ...structuredClone(submission),
      sequence: target.sbcSubmissions.length + 1,
    });
  }
  for (const key of Object.keys(target.destinations) as Array<
    keyof PackTaskSummary["destinations"]
  >) {
    target.destinations[key] += source.destinations[key];
  }
  if (source.stoppedReason) target.stoppedReason = source.stoppedReason;
  return target;
}

export function addSbcSubmission(
  summary: PackTaskSummary,
  submission: Omit<SbcSubmissionSummary, "sequence">,
): SbcSubmissionSummary {
  const record: SbcSubmissionSummary = {
    ...structuredClone(submission),
    sequence: summary.sbcSubmissions.length + 1,
  };
  summary.sbcSubmissions.push(record);
  return record;
}

export function setPlayerDestination(
  summary: PackTaskSummary,
  instanceId: number,
  destination: PackPlayerDestination,
  definitionId?: number,
): void {
  const player = [...summary.players].reverse().find(
    (candidate) =>
      candidate.instanceId === instanceId &&
      (candidate.destination === "unknown" || candidate.destination === "remaining"),
  ) ?? [...summary.players].reverse().find(
    (candidate) => candidate.instanceId === instanceId,
  ) ?? [...summary.players].reverse().find(
    (candidate) =>
      Number(definitionId) > 0 &&
      candidate.definitionId === Number(definitionId) &&
      candidate.summaryKey?.startsWith("pick:") === true &&
      (candidate.destination === "unknown" || candidate.destination === "remaining"),
  );
  if (!player) return;
  player.destination = destination;
}

export function addPackPlayers(
  summary: PackTaskSummary,
  players: readonly PackPlayerSummary[],
): void {
  const keyOf = (player: PackPlayerSummary) =>
    player.summaryKey || `item:${player.instanceId}`;
  const knownIds = new Set(summary.players.map(keyOf));
  for (const player of players) {
    const key = keyOf(player);
    if (knownIds.has(key)) continue;
    summary.players.push(player);
    knownIds.add(key);
  }
}

export function refreshPackDestinationCounts(summary: PackTaskSummary): void {
  summary.destinations = {
    club: 0,
    storage: 0,
    transfer: 0,
    sold: 0,
    remaining: 0,
  };
  for (const player of summary.players) {
    if (player.destination in summary.destinations) {
      const destination = player.destination as keyof PackTaskSummary["destinations"];
      summary.destinations[destination] += 1;
    }
  }
}
