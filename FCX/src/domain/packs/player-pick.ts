export type PlayerPickStrategy = "ovr" | "price";

export const PLAYER_PICK_MAX_ATTEMPTS = 60;
export const PLAYER_PICK_UNASSIGNED_TIMEOUT_MS = 10_000;
export const PLAYER_PICK_REPOSITORY_WAIT_MS = 300;
export const PLAYER_PICK_CONFIRM_WAIT_MS = 900;
export const PLAYER_PICK_REWARD_ATTEMPTS = 16;
export const PLAYER_PICK_REWARD_WAIT_MS = 500;
export const PLAYER_PICK_ROUTING_PASSES = 3;
export const PLAYER_PICK_ROUTING_WAIT_MS = 400;

export interface PlayerPickPayload<T> {
  items: T[];
  availablePicks: number;
  ownership?: boolean[];
}

export interface PlayerPickCandidateFacts {
  rating: number;
  definitionId: number;
  duplicate: boolean;
}

export interface ConfirmedPlayerPickSelection<T> {
  item: T;
  duplicate: boolean;
}

export interface PlayerPickAttemptResult<T> {
  candidates: T[];
  availablePicks: number;
  ownership?: boolean[];
  confirmationSucceeded: boolean;
  selected: T[];
  stopReason?: string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function normalizedCount(value: unknown, itemCount: number): number {
  const count = Math.trunc(Number(value));
  return Math.max(1, Math.min(itemCount, Number.isFinite(count) ? count : 1));
}

/** Normalize both response shapes used by the current EA player-pick APIs. */
export function normalizePlayerPickPayload<T>(value: unknown): PlayerPickPayload<T> | null {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const response = asRecord(root.response);
  const responseData = asRecord(response.data);
  const dataSource = Array.isArray(data.playerPicks) ? data : responseData;
  const dataItems = Array.isArray(dataSource.playerPicks)
    ? dataSource.playerPicks as T[]
    : [];
  if (dataItems.length > 0) {
    return {
      items: [...dataItems],
      availablePicks: normalizedCount(dataSource.availablePicks, dataItems.length),
      ...(Array.isArray(dataSource.ownership)
        ? { ownership: dataSource.ownership.map(Boolean) }
        : {}),
    };
  }

  const responseItems = Array.isArray(response.items) ? response.items as T[] : [];
  if (responseItems.length > 0) {
    return {
      items: [...responseItems],
      availablePicks: normalizedCount(response.availablePicks, responseItems.length),
      ...(Array.isArray(response.ownership)
        ? { ownership: response.ownership.map(Boolean) }
        : {}),
    };
  }
  return null;
}

export function choosePlayerPickCandidates<T>(
  payload: PlayerPickPayload<T>,
  strategy: PlayerPickStrategy,
  inspect: (item: T, index: number) => PlayerPickCandidateFacts,
  prices: ReadonlyMap<number, number> = new Map<number, number>(),
): T[] {
  const entries = payload.items.map((item, index) => ({
    item,
    index,
    facts: inspect(item, index),
  }));
  const byOverall = (
    left: typeof entries[number],
    right: typeof entries[number],
  ) => right.facts.rating - left.facts.rating
    || Number(left.facts.duplicate) - Number(right.facts.duplicate)
    || left.index - right.index;

  let ranked: typeof entries;
  if (strategy === "price") {
    const priced = entries.filter(({ facts }) => {
      const price = Number(prices.get(facts.definitionId));
      return Number.isFinite(price) && price > 0;
    });
    const unpriced = entries.filter(({ facts }) => {
      const price = Number(prices.get(facts.definitionId));
      return !Number.isFinite(price) || price <= 0;
    });
    ranked = priced.length > 0
      ? priced.sort((left, right) =>
          Number(prices.get(right.facts.definitionId) || 0)
          - Number(prices.get(left.facts.definitionId) || 0)
          || byOverall(left, right)
        ).concat(unpriced.sort(byOverall))
      : entries.sort(byOverall);
  } else {
    ranked = entries.sort(byOverall);
  }
  return ranked.slice(0, payload.availablePicks).map(({ item }) => item);
}

export function confirmedPlayerPickSelections<T>(
  payload: PlayerPickPayload<T>,
  chosen: readonly T[],
  fallbackDuplicate: (item: T) => boolean = () => false,
): ConfirmedPlayerPickSelection<T>[] {
  return chosen.map((item) => {
    const index = payload.items.indexOf(item);
    const owned = index >= 0 && Array.isArray(payload.ownership)
      ? payload.ownership[index]
      : undefined;
    return {
      item,
      duplicate: owned == null ? fallbackDuplicate(item) : Boolean(owned),
    };
  });
}

export function playerPickFailureMessage(
  action: "open" | "confirm" | "unassigned",
  status: unknown,
): string {
  if (Number(status) === 401) {
    return "EA登录状态已失效，请刷新或重新登录后重试。";
  }
  if (status === "timeout") {
    return action === "unassigned"
      ? "读取未分配物品超时，球员挑选已停止。"
      : "EA长时间没有返回结果，球员挑选已停止。";
  }
  const label = action === "open"
    ? "打开球员挑选"
    : action === "confirm"
      ? "确认球员挑选"
      : "读取未分配物品";
  return `${label}失败（状态 ${String(status ?? "未知")}）。`;
}
