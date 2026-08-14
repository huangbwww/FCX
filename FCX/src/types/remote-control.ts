export type RemoteConnectionStatus =
  | "signed_out"
  | "connecting"
  | "online"
  | "offline"
  | "error";

export interface RemoteSession {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  username: string;
}

export interface RemoteLoginResponse {
  access_token: string;
  refresh_token: string;
  device_id: string;
  expires_in: number;
  user: { username: string };
}

export interface RemoteRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RemoteCommand {
  command_id: string;
  target_device_id: string;
  target_device_type: "userscript";
  command_type:
    | "script.sbc.start"
    | "script.routine.start"
    | "script.task.stop"
    | "script.catalog.refresh"
    | "script.page.reload";
  payload: Record<string, unknown>;
  status: string;
}

export interface ScriptSbcStartPayload {
  set_id: number;
  challenge_id?: number;
  mode: "challenge" | "set";
  runs: number;
  ignore_value: boolean;
  submit_strategy: "never" | "feasible" | "optimal";
  auto_open_packs: boolean;
}

export interface ScriptRoutineStartPayload {
  routine_id: string;
}

export interface ScriptRuntimeSnapshot {
  script_device_id: string;
  script_version: string;
  observed_at: string;
  ea_ready: boolean;
  script_capabilities: string[];
  task_status: "idle" | "running" | "stopping" | "completed" | "failed";
  task_id?: string;
  task_kind?: "sbc" | "routine" | "pack";
  task_name?: string;
  stage?: string;
  round: number;
  progress: number;
  last_error_summary?: string;
}

export interface ScriptCatalogSnapshot {
  schema_version: 1;
  content_hash: string;
  generated_at: string;
  sbcs: Array<{
    set_id: number;
    name: string;
    completed_count: number;
    repeats_remaining: number | null;
    challenges: Array<{
      challenge_id: number;
      name: string;
      requirements: string[];
      completed: boolean;
    }>;
  }>;
  routines: Array<{
    routine_id: string;
    name: string;
    mode: "round_robin" | "segmented";
    steps: string[];
  }>;
}

export interface RemoteRegisterResponse {
  message: string;
  user: { username: string };
}

export interface ScriptHarvestRecord {
  client_harvest_id: string;
  player_name: string;
  rating: number;
  status: "captured";
  source_task?: string;
  harvested_at: string;
}

export interface ScriptRuntimeLogRecord {
  client_log_id: string;
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR";
  source: string;
  message: string;
  occurred_at: string;
}

export interface RemoteRuntimeState {
  eaReady: boolean;
  busy: boolean;
  taskKind?: "sbc" | "routine" | "pack";
  taskName?: string;
  stage?: string;
  round?: number;
  progress?: number;
}

export interface RemoteRuntimeHooks {
  getRuntimeState(): RemoteRuntimeState;
  getBackendPort(): number;
  startSbc(payload: ScriptSbcStartPayload): Promise<unknown>;
  startRoutine(payload: ScriptRoutineStartPayload): Promise<unknown>;
  stopTask(): void;
  refreshCatalog(): Promise<void>;
  reloadPage(): void;
  buildCatalog(): Promise<Omit<ScriptCatalogSnapshot, "content_hash">>;
  isCancellationRequested(): boolean;
}
