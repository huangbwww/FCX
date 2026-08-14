import type {
  RoutineDefinition,
  RoutineExecutionMode,
  RoutinePackStep,
  RoutineRewardKind,
  RoutineSbcStep,
  RoutineSbcTarget,
  RoutineStep,
} from "../../types/routines";

export const FCX_ROUTINE_CATALOG_SCHEMA_VERSION = 1;
export const FCX_ROUTINE_CATALOG_URL =
  "https://fczhushou.com/fcx/routines.json";
export const FCX_ROUTINE_CATALOG_TIMEOUT_MS = 4_000;

const MAX_ROUTINES = 50;
const MAX_STEPS_PER_ROUTINE = 50;
const MAX_TOKEN_GROUPS = 10;
const MAX_TOKENS_PER_GROUP = 8;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const URL_OR_CODE_PATTERN = /(?:https?:\/\/|javascript:|data:text\/html|<\/?[a-z!])/i;
const REWARD_KINDS = new Set<RoutineRewardKind>([
  "pack",
  "player_pick",
  "other",
]);

export interface RoutineCatalog {
  schemaVersion: 1;
  catalogVersion: number;
  publishedAt: string;
  routines: readonly RoutineDefinition[];
}

function fail(path: string, reason: string): never {
  throw new Error(`流程目录校验失败（${path}）：${reason}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "必须是对象");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) fail(`${path}.${unknown}`, "不允许的字段");
  const missing = required.find((key) => !(key in value));
  if (missing) fail(`${path}.${missing}`, "缺少字段");
}

function safeText(
  value: unknown,
  path: string,
  maximumLength: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") fail(path, "必须是字符串");
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximumLength) {
    fail(path, `长度必须为${allowEmpty ? "0–" : "1–"}${maximumLength}`);
  }
  if (/\p{Cc}/u.test(normalized) || URL_OR_CODE_PATTERN.test(normalized)) {
    fail(path, "不能包含 URL、HTML、脚本或控制字符");
  }
  return normalized;
}

function identifier(value: unknown, path: string): string {
  const normalized = safeText(value, path, 64);
  if (!ID_PATTERN.test(normalized)) {
    fail(path, "只能包含小写字母、数字、短横线和下划线");
  }
  return normalized;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    fail(path, "必须是正整数");
  }
  return Number(value);
}

function eaEntityId(value: unknown, path: string, allowZero = false): number {
  const parsed = allowZero
    ? nonNegativeInteger(value, path)
    : positiveInteger(value, path);
  if (parsed > 2_147_483_647) fail(path, "超出允许范围");
  return parsed;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(path, "必须是非负整数");
  }
  return Number(value);
}

function runCount(value: unknown, path: string): number {
  if (value === -1) return -1;
  const parsed = positiveInteger(value, path);
  if (parsed > 100) fail(path, "只能为 1–100 或 -1");
  return parsed;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "必须是布尔值");
  return value;
}

function isoTimestamp(value: unknown, path: string): string {
  const normalized = safeText(value, path, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(normalized)) {
    fail(path, "必须是 UTC ISO 时间");
  }
  if (!Number.isFinite(Date.parse(normalized))) fail(path, "时间无效");
  return normalized;
}

function optionalPositiveInteger(
  value: unknown,
  path: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = positiveInteger(value, path);
  if (parsed > 100) fail(path, "不能超过 100");
  return parsed;
}

function parseTarget(value: unknown, path: string): RoutineSbcTarget {
  const input = record(value, path);
  exactKeys(
    input,
    [
      "preferredSetId",
      "nameTokenGroups",
      "numericMarker",
      "expectedRewardKind",
      "minChallenges",
      "maxChallenges",
      "repeatability",
      "expiresAt",
    ],
    ["preferredSetId", "nameTokenGroups", "expectedRewardKind"],
    path,
  );
  if (!Array.isArray(input.nameTokenGroups)) {
    fail(`${path}.nameTokenGroups`, "必须是数组");
  }
  if (
    input.nameTokenGroups.length < 1
    || input.nameTokenGroups.length > MAX_TOKEN_GROUPS
  ) {
    fail(`${path}.nameTokenGroups`, `只能包含 1–${MAX_TOKEN_GROUPS} 组识别词`);
  }
  const nameTokenGroups = input.nameTokenGroups.map((candidate, groupIndex) => {
    const groupPath = `${path}.nameTokenGroups[${groupIndex}]`;
    if (!Array.isArray(candidate)) fail(groupPath, "必须是数组");
    if (candidate.length < 1 || candidate.length > MAX_TOKENS_PER_GROUP) {
      fail(groupPath, `只能包含 1–${MAX_TOKENS_PER_GROUP} 个识别词`);
    }
    return candidate.map((token, tokenIndex) =>
      safeText(token, `${groupPath}[${tokenIndex}]`, 40));
  });
  if (
    typeof input.expectedRewardKind !== "string"
    || !REWARD_KINDS.has(input.expectedRewardKind as RoutineRewardKind)
  ) {
    fail(`${path}.expectedRewardKind`, "奖励类型无效");
  }
  if (
    input.numericMarker !== undefined
    && input.numericMarker !== "any_plus"
  ) {
    fail(`${path}.numericMarker`, "数字标记类型无效");
  }
  const minChallenges = optionalPositiveInteger(
    input.minChallenges,
    `${path}.minChallenges`,
  );
  const maxChallenges = optionalPositiveInteger(
    input.maxChallenges,
    `${path}.maxChallenges`,
  );
  if (
    minChallenges !== undefined
    && maxChallenges !== undefined
    && minChallenges > maxChallenges
  ) {
    fail(path, "挑战数量范围无效");
  }
  const repeatability = input.repeatability;
  if (
    repeatability !== undefined
    && repeatability !== "finite"
    && repeatability !== "unlimited"
    && repeatability !== "any"
  ) {
    fail(`${path}.repeatability`, "重复模式无效");
  }
  return {
    preferredSetId: eaEntityId(input.preferredSetId, `${path}.preferredSetId`),
    nameTokenGroups,
    ...(input.numericMarker === "any_plus"
      ? { numericMarker: "any_plus" as const }
      : {}),
    expectedRewardKind: input.expectedRewardKind as RoutineRewardKind,
    ...(minChallenges !== undefined ? { minChallenges } : {}),
    ...(maxChallenges !== undefined ? { maxChallenges } : {}),
    ...(repeatability !== undefined ? { repeatability } : {}),
    ...(input.expiresAt !== undefined
      ? { expiresAt: isoTimestamp(input.expiresAt, `${path}.expiresAt`) }
      : {}),
  };
}

function parseStep(value: unknown, path: string): RoutineStep {
  const input = record(value, path);
  if (input.kind === "sbc") {
    exactKeys(input, ["kind", "id", "runs", "setId", "target"], ["kind", "id", "runs", "setId", "target"], path);
    const step: RoutineSbcStep = {
      kind: "sbc",
      id: identifier(input.id, `${path}.id`),
      runs: runCount(input.runs, `${path}.runs`),
      setId: eaEntityId(input.setId, `${path}.setId`),
      target: parseTarget(input.target, `${path}.target`),
    };
    if (step.target?.preferredSetId !== step.setId) {
      fail(path, "setId 与目标 preferredSetId 不一致");
    }
    return step;
  }
  if (input.kind === "pack") {
    exactKeys(input, ["kind", "id", "runs", "packId", "tradable", "packName"], ["kind", "id", "runs", "packId", "tradable", "packName"], path);
    return {
      kind: "pack",
      id: identifier(input.id, `${path}.id`),
      runs: runCount(input.runs, `${path}.runs`),
      packId: eaEntityId(input.packId, `${path}.packId`),
      tradable: booleanValue(input.tradable, `${path}.tradable`),
      packName: safeText(input.packName, `${path}.packName`, 100),
    } satisfies RoutinePackStep;
  }
  fail(`${path}.kind`, "步骤类型无效");
}

function parseFallback(
  value: unknown,
  path: string,
  allowDisabledZeroSetId: boolean,
): { enabled: boolean; setId: number; runs: number } {
  const input = record(value, path);
  exactKeys(input, ["enabled", "setId", "runs"], ["enabled", "setId", "runs"], path);
  const enabled = booleanValue(input.enabled, `${path}.enabled`);
  const setId = eaEntityId(
    input.setId,
    `${path}.setId`,
    allowDisabledZeroSetId && !enabled,
  );
  return { enabled, setId, runs: runCount(input.runs, `${path}.runs`) };
}

function parseRoutine(
  value: unknown,
  path: string,
  catalogVersion: number,
): RoutineDefinition {
  const input = record(value, path);
  exactKeys(
    input,
    [
      "id",
      "name",
      "description",
      "mode",
      "totalCycles",
      "ignoreValue",
      "steps",
      "totwFallback",
      "storageFallback",
    ],
    [
      "id",
      "name",
      "description",
      "mode",
      "totalCycles",
      "ignoreValue",
      "steps",
      "totwFallback",
      "storageFallback",
    ],
    path,
  );
  if (input.mode !== "round_robin" && input.mode !== "exhaust_step") {
    fail(`${path}.mode`, "流程模式无效");
  }
  if (!Array.isArray(input.steps)) fail(`${path}.steps`, "必须是数组");
  if (input.steps.length < 1 || input.steps.length > MAX_STEPS_PER_ROUTINE) {
    fail(`${path}.steps`, `只能包含 1–${MAX_STEPS_PER_ROUTINE} 个步骤`);
  }
  const steps = input.steps.map((step, index) =>
    parseStep(step, `${path}.steps[${index}]`));
  const stepIds = new Set<string>();
  for (const step of steps) {
    if (stepIds.has(step.id)) fail(`${path}.steps`, `步骤 ID 重复：${step.id}`);
    stepIds.add(step.id);
  }
  return {
    id: identifier(input.id, `${path}.id`),
    origin: "builtin",
    name: safeText(input.name, `${path}.name`, 100),
    description: safeText(input.description, `${path}.description`, 500, true),
    mode: input.mode as RoutineExecutionMode,
    totalCycles: runCount(input.totalCycles, `${path}.totalCycles`),
    ignoreValue: booleanValue(input.ignoreValue, `${path}.ignoreValue`),
    steps,
    totwFallback: parseFallback(input.totwFallback, `${path}.totwFallback`, false),
    storageFallback: parseFallback(input.storageFallback, `${path}.storageFallback`, true),
    builtinSnapshotVersion: catalogVersion,
  };
}

export function parseRoutineCatalogValue(source: unknown): RoutineCatalog {
  const input = record(source, "root");
  exactKeys(
    input,
    ["schema_version", "catalog_version", "published_at", "routines"],
    ["schema_version", "catalog_version", "published_at", "routines"],
    "root",
  );
  if (input.schema_version !== FCX_ROUTINE_CATALOG_SCHEMA_VERSION) {
    fail("root.schema_version", "不支持的 schema_version");
  }
  const catalogVersion = positiveInteger(
    input.catalog_version,
    "root.catalog_version",
  );
  if (!Array.isArray(input.routines)) fail("root.routines", "必须是数组");
  if (input.routines.length > MAX_ROUTINES) {
    fail("root.routines", `流程数量不能超过 ${MAX_ROUTINES}`);
  }
  const routines = input.routines.map((routine, index) =>
    parseRoutine(routine, `root.routines[${index}]`, catalogVersion));
  const routineIds = new Set<string>();
  for (const routine of routines) {
    if (routineIds.has(routine.id)) {
      fail("root.routines", `流程 ID 重复：${routine.id}`);
    }
    routineIds.add(routine.id);
  }
  return {
    schemaVersion: 1,
    catalogVersion,
    publishedAt: isoTimestamp(input.published_at, "root.published_at"),
    routines,
  };
}

export function parseRoutineCatalog(source: string): RoutineCatalog {
  const text = source.trim();
  if (!text) throw new Error("流程目录为空");
  if (text.startsWith("<")) {
    throw new Error("流程目录地址返回了网页内容，而不是 JSON");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("流程目录不是有效的 JSON");
  }
  return parseRoutineCatalogValue(parsed);
}
