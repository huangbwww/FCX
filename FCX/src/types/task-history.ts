import type { PackTaskSummary } from "./packs";

export type FcxTaskHistoryType = "sbc" | "set" | "routine" | "pack";

export interface FcxTaskHistoryRecord {
  id: string;
  personaId: string;
  type: FcxTaskHistoryType;
  title: string;
  endedAt: string;
  status: "completed" | "stopped" | "failed";
  reason?: string;
  summary: PackTaskSummary;
}
