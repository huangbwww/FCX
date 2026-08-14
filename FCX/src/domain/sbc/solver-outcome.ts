import type {
  RatingOptimizationDiagnostics,
  SolverPlayerResult,
} from "../../types/backend";

export type SuccessfulSolverStatusCode = 2 | 4;
export type FailedSolverStatusCode = 0 | 1 | 3;

export type SolveOutcome =
  | {
      kind: "success";
      status: string;
      statusCode: SuccessfulSolverStatusCode;
      players: SolverPlayerResult[];
      ratingOptimization: RatingOptimizationDiagnostics | null;
      failureCode: string | null;
    }
  | {
      kind: "failure";
      status: string;
      statusCode: FailedSolverStatusCode;
      ratingOptimization: RatingOptimizationDiagnostics | null;
      failureCode: string | null;
    }
  | {
      kind: "invalid";
      reason: string;
      statusCode?: number;
    };

type SolverPlacement = Pick<
  SolverPlayerResult,
  "id" | "possiblePositions" | "Is_Pos"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSolverPlayerResult(value: unknown): value is SolverPlayerResult {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    isFiniteNumber(value.possiblePositions) &&
    isFiniteNumber(value.Is_Pos)
  );
}

function parseRatingOptimization(
  value: unknown,
): RatingOptimizationDiagnostics | null {
  if (!isRecord(value)) return null;
  const requiredNumbers = ["target", "window_min", "window_max"] as const;
  if (!requiredNumbers.every((key) => isFiniteNumber(value[key]))) return null;
  if (
    value.minimum_rating !== null &&
    !isFiniteNumber(value.minimum_rating)
  ) {
    return null;
  }
  if (
    typeof value.rating_optimal !== "boolean" ||
    typeof value.cost_optimal !== "boolean"
  ) {
    return null;
  }
  return value as unknown as RatingOptimizationDiagnostics;
}

export function parseSolveOutcome(response: unknown): SolveOutcome {
  if (!isRecord(response)) {
    return { kind: "invalid", reason: "后端返回的求解响应不是对象" };
  }

  const statusCode = response.status_code;
  if (!isFiniteNumber(statusCode)) {
    return { kind: "invalid", reason: "求解响应缺少有效的状态代码" };
  }

  const status = typeof response.status === "string" ? response.status : "";
  const ratingOptimization = parseRatingOptimization(
    response.rating_optimization,
  );
  const failureCode =
    typeof response.failure_code === "string"
      ? response.failure_code
      : ratingOptimization?.failure_code ?? null;
  if (statusCode === 0 || statusCode === 1 || statusCode === 3) {
    return {
      kind: "failure",
      status,
      statusCode,
      ratingOptimization,
      failureCode,
    };
  }
  if (statusCode !== 2 && statusCode !== 4) {
    return {
      kind: "invalid",
      reason: `无法识别的求解状态代码：${statusCode}`,
      statusCode,
    };
  }
  if (typeof response.results !== "string") {
    return {
      kind: "invalid",
      reason: "求解成功，但响应中没有阵容结果",
      statusCode,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.results) as unknown;
  } catch {
    return {
      kind: "invalid",
      reason: "求解成功，但阵容结果无法解析",
      statusCode,
    };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      kind: "invalid",
      reason: "求解成功，但阵容结果为空",
      statusCode,
    };
  }
  if (!parsed.every(isSolverPlayerResult)) {
    return {
      kind: "invalid",
      reason: "求解结果中的球员数据不完整",
      statusCode,
    };
  }

  return {
    kind: "success",
    status,
    statusCode,
    players: parsed,
    ratingOptimization,
    failureCode,
  };
}

export interface SolutionPlacementOptions<TPlayer, TBrick> {
  formation: readonly number[];
  brickIndices: readonly number[];
  results: readonly SolverPlacement[];
  findPlayer: (id: number) => TPlayer | undefined;
  createBrick: () => TBrick;
}

export function placeSolverResults<TPlayer, TBrick>(
  options: SolutionPlacementOptions<TPlayer, TBrick>,
): Array<TPlayer | TBrick> {
  const slots: Array<TPlayer | TBrick | undefined> = Array.from({
    length: options.formation.length,
  });
  for (const brickIndex of options.brickIndices) {
    if (
      !Number.isInteger(brickIndex) ||
      brickIndex < 0 ||
      brickIndex >= slots.length
    ) {
      throw new Error(`求解结果包含无效的砖块位置：${brickIndex}`);
    }
    slots[brickIndex] = options.createBrick();
  }

  const sortedResults = [...options.results].sort(
    (left, right) => right.Is_Pos - left.Is_Pos,
  );
  for (const result of sortedResults) {
    const player = options.findPlayer(result.id);
    if (player === undefined) {
      throw new Error(`求解结果中的球员 ${result.id} 不在候选列表中`);
    }
    const targetIndex = slots.findIndex(
      (slot, index) =>
        slot === undefined &&
        (result.Is_Pos === 0 ||
          options.formation[index] === result.possiblePositions),
    );
    if (targetIndex < 0) {
      throw new Error(`球员 ${result.id} 无法映射到有效阵容位置`);
    }
    slots[targetIndex] = player;
  }

  const missingIndex = slots.findIndex((slot) => slot === undefined);
  if (missingIndex >= 0) {
    throw new Error(`求解结果未填满阵容位置 ${missingIndex + 1}`);
  }
  return slots as Array<TPlayer | TBrick>;
}
