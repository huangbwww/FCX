import type {
  AcademyApplyPlanItem,
  AcademyPlayerLike,
  PlayStyleAcademyConfig,
  PlayStyleLevel,
} from "../../types/academy";

const POSITION_GROUPS: Record<number, [string, string]> = {
  0: ["GK", "GK"], 1: ["SW", "CB"], 2: ["RWB", "RB / LB"],
  3: ["RB", "RB / LB"], 4: ["RCB", "CB"], 5: ["CB", "CB"],
  6: ["LCB", "CB"], 7: ["LB", "RB / LB"], 8: ["LWB", "RB / LB"],
  9: ["RDM", "CDM"], 10: ["CDM", "CDM"], 11: ["LDM", "CDM"],
  12: ["RM", "RM / LM"], 13: ["RCM", "CM"], 14: ["CM", "CM"],
  15: ["LCM", "CM"], 16: ["LM", "RM / LM"], 17: ["RAM", "CAM"],
  18: ["CAM", "CAM"], 19: ["LAM", "CAM"], 20: ["RF", "RW / LW"],
  21: ["CF", "ST"], 22: ["LF", "RW / LW"], 23: ["RW", "RW / LW"],
  24: ["RS", "ST"], 25: ["ST", "ST"], 26: ["LS", "ST"],
  27: ["LW", "RW / LW"],
};

const STRING_POSITION_GROUPS: Record<string, string> = Object.fromEntries(
  Object.values(POSITION_GROUPS).map(([code, group]) => [code, group]),
);

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const candidate = value as { toArray?: () => unknown[] } | null;
  try {
    return candidate?.toArray?.() ?? [];
  } catch {
    return [];
  }
}

export function academyPlayerRarities(player: AcademyPlayerLike): number[] {
  const values: unknown[] = [player.rareflag, player._rareflag];
  try { values.push(player.getBaseRarity?.()); } catch { /* EA getter failed. */ }
  return [...new Set(values.map(Number).filter(Number.isFinite))];
}

export function isAcademyEligiblePlayer(
  player: AcademyPlayerLike,
  config: PlayStyleAcademyConfig,
): boolean {
  try {
    if (player.isPlayer?.() === false || player.isLimitedUse?.() === true) return false;
  } catch {
    return false;
  }
  if (Number(player.loans || 0) > 0) return false;
  return academyPlayerRarities(player).some((rarity) =>
    config.eligibleRarities.includes(rarity),
  );
}

export function readPlayStyleLevel(
  player: AcademyPlayerLike,
  traitId: number,
): PlayStyleLevel {
  try { if (player.hasPlusPlayStyle?.(traitId)) return 2; } catch { /* no-op */ }
  try { if (player.hasBasePlayStyle?.(traitId)) return 1; } catch { /* no-op */ }
  return 0;
}

export function snapshotPlayStyleLevels(
  player: AcademyPlayerLike,
  config: PlayStyleAcademyConfig,
): Map<number, PlayStyleLevel> {
  return new Map(
    config.definitions.map((definition) => [
      definition.traitId,
      readPlayStyleLevel(player, definition.traitId),
    ]),
  );
}

export function readPlayStyleCounts(
  player: AcademyPlayerLike,
  config?: PlayStyleAcademyConfig,
): {
  basic: number;
  plus: number;
} {
  let basic = 0;
  let plus = 0;
  try { basic = Math.max(0, Number(player.getNumBasicPlayStyles?.()) || 0); } catch { /* no-op */ }
  try { plus = Math.max(0, Number(player.getNumPlusPlayStyles?.()) || 0); } catch { /* no-op */ }
  if (config) {
    const levels = snapshotPlayStyleLevels(player, config);
    basic = Math.max(basic, [...levels.values()].filter((level) => level === 1).length);
    plus = Math.max(plus, [...levels.values()].filter((level) => level === 2).length);
  }
  return { basic, plus };
}

export function countTargetPlayStyles(
  original: ReadonlyMap<number, PlayStyleLevel>,
  target: ReadonlyMap<number, PlayStyleLevel>,
  initial: { basic: number; plus: number },
): { basic: number; plus: number } {
  let basic = initial.basic;
  let plus = initial.plus;
  for (const [traitId, next] of target) {
    const previous = original.get(traitId) ?? 0;
    if (previous === 0 && next === 1) basic += 1;
    if (previous < 2 && next === 2) plus += 1;
  }
  return { basic, plus };
}

export function canSetPlayStyleTarget(input: {
  traitId: number;
  level: PlayStyleLevel;
  original: ReadonlyMap<number, PlayStyleLevel>;
  target: ReadonlyMap<number, PlayStyleLevel>;
  counts: { basic: number; plus: number };
  config: PlayStyleAcademyConfig;
  goalkeeper: boolean;
}): boolean {
  const definition = input.config.definitions.find(
    (candidate) => candidate.traitId === input.traitId,
  );
  if (!definition) return false;
  const current = input.original.get(input.traitId) ?? 0;
  if (input.level < current || input.level < 0 || input.level > 2) return false;
  if (input.level > current) {
    if (definition.goalkeeperOnly && !input.goalkeeper) return false;
    if (input.level === 1 && !definition.base) return false;
    if (input.level === 2 && !definition.plus) return false;
  }
  const next = new Map(input.target);
  next.set(input.traitId, input.level);
  const totals = countTargetPlayStyles(input.original, next, input.counts);
  return (
    totals.basic <= Math.max(input.config.limits.basic, input.counts.basic) &&
    totals.plus <= Math.max(input.config.limits.plus, input.counts.plus)
  );
}

export function nextPlayStyleTarget(input: Omit<
  Parameters<typeof canSetPlayStyleTarget>[0],
  "level"
>): PlayStyleLevel | null {
  const current = input.target.get(input.traitId) ?? 0;
  if (current < 2) {
    const next = (current + 1) as PlayStyleLevel;
    if (canSetPlayStyleTarget({ ...input, level: next })) return next;
    if (current === 0 && canSetPlayStyleTarget({ ...input, level: 2 })) return 2;
  }
  const original = input.original.get(input.traitId) ?? 0;
  if (current !== original && canSetPlayStyleTarget({ ...input, level: original })) {
    return original;
  }
  return null;
}

export function recommendPlayStyles(input: {
  keys: string[];
  player: AcademyPlayerLike;
  config: PlayStyleAcademyConfig;
  original: ReadonlyMap<number, PlayStyleLevel>;
  counts: { basic: number; plus: number };
}): { target: Map<number, PlayStyleLevel>; selected: number; owned: number } {
  const target = new Map(input.original);
  let selected = 0;
  let owned = 0;
  const goalkeeper = Boolean(input.player.isGK?.());
  for (const key of input.keys) {
    const definition = input.config.definitions.find((item) => item.key === key);
    if (!definition) continue;
    const current = input.original.get(definition.traitId) ?? 0;
    if (current === 2) { owned += 1; continue; }
    if (canSetPlayStyleTarget({
      traitId: definition.traitId, level: 2, original: input.original,
      target, counts: input.counts, config: input.config, goalkeeper,
    })) {
      target.set(definition.traitId, 2); selected += 1; continue;
    }
    if (current >= 1) { owned += 1; continue; }
    if (canSetPlayStyleTarget({
      traitId: definition.traitId, level: 1, original: input.original,
      target, counts: input.counts, config: input.config, goalkeeper,
    })) {
      target.set(definition.traitId, 1); selected += 1;
    }
  }
  return { target, selected, owned };
}

export function buildAcademyApplyPlan(
  original: ReadonlyMap<number, PlayStyleLevel>,
  target: ReadonlyMap<number, PlayStyleLevel>,
  config: PlayStyleAcademyConfig,
): AcademyApplyPlanItem[] {
  return config.definitions
    .flatMap((definition): AcademyApplyPlanItem[] => {
      const previous = original.get(definition.traitId) ?? 0;
      const next = target.get(definition.traitId) ?? previous;
      if (next <= previous || next === 0) return [];
      const slot = next === 2 ? definition.plus : definition.base;
      return slot ? [{
        key: definition.key,
        name: definition.name,
        traitId: definition.traitId,
        target: next,
        slot,
      }] : [];
    })
    .sort((left, right) => left.target - right.target);
}

export function academyPlayerPositions(player: AcademyPlayerLike): Array<{
  code: string;
  group: string;
}> {
  const raw: unknown[] = [player.preferredPosition];
  raw.push(...toArray(player.possiblePositions));
  if (raw.length <= 1) {
    try { raw.push(...toArray(player.getBasePossiblePositions?.())); } catch { /* no-op */ }
  }
  const seen = new Set<string>();
  return raw.flatMap((value) => {
    const numeric = Number(value);
    const mapped = Number.isInteger(numeric)
      ? POSITION_GROUPS[numeric]
      : undefined;
    const code = mapped?.[0] ?? String(value ?? "").trim().toUpperCase();
    const group = mapped?.[1] ?? STRING_POSITION_GROUPS[code];
    if (!code || !group || seen.has(code)) return [];
    seen.add(code);
    return [{ code, group }];
  });
}

export function localizeAcademyError(value: unknown): string {
  const candidate = value as {
    status?: number | string;
    error?: { code?: number | string; message?: string };
    message?: string;
  } | null;
  const code = Number(candidate?.error?.code ?? candidate?.status);
  const known: Record<number, string> = {
    426: "EA 当前关闭了该进化功能",
    458: "EA 要求完成人机验证",
    460: "该球员不符合这项进化要求",
    461: "当前账号无权使用这项进化",
    470: "进化所需货币或资源不足",
  };
  return known[code]
    ? `${known[code]}（${code}）`
    : candidate?.error?.message || candidate?.message || "学院进化请求失败";
}
