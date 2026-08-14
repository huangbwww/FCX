import { getSbcRepeatability } from "./repeatability";
import type { EaSbcSet } from "../../types/game";

export interface SbcCatalogStatus {
  completed: number;
  remaining?: number;
  kind: "finite" | "unlimited" | "unknown";
  label: string;
}

export function getSbcCatalogStatus(set: EaSbcSet): SbcCatalogStatus {
  const completed = Math.max(0, Math.trunc(Number(set.timesCompleted) || 0));
  const repeatability = getSbcRepeatability(set);
  if (repeatability.kind === "unlimited") {
    return { completed, kind: "unlimited", label: `已完成 ${completed} 次 · 无限重复` };
  }
  if (repeatability.kind === "finite") {
    return {
      completed,
      remaining: Math.max(0, Math.trunc(Number(repeatability.remaining) || 0)),
      kind: "finite",
      label: `已完成 ${completed} 次 · 剩余 ${Math.max(0, Math.trunc(Number(repeatability.remaining) || 0))} 次`,
    };
  }
  return { completed, kind: "unknown", label: `已完成 ${completed} 次 · 次数未知` };
}
