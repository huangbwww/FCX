import {
  FCX_ROUTINE_CATALOG_TIMEOUT_MS,
  FCX_ROUTINE_CATALOG_URL,
  parseRoutineCatalog,
  type RoutineCatalog,
} from "../domain/routines/catalog";
import type { RoutineStore } from "../state/routine-store";
import type {
  GmCompatError,
  GmCompatRequest,
  GmCompatResponse,
} from "../types/userscript";

function networkErrorMessage(error: GmCompatError | GmCompatResponse): string {
  const status = Number("status" in error ? error.status : 0) || 0;
  return status > 0
    ? `流程目录读取失败：HTTP ${status}`
    : "流程目录读取失败，请检查网络连接";
}

export function requestRoutineCatalog(
  request: GmCompatRequest,
  options: {
    url?: string;
    now?: () => number;
    timeoutMs?: number;
  } = {},
): Promise<RoutineCatalog> {
  const catalogUrl = options.url ?? FCX_ROUTINE_CATALOG_URL;
  const separator = catalogUrl.includes("?") ? "&" : "?";
  const url = `${catalogUrl}${separator}_=${(options.now ?? Date.now)()}`;
  return new Promise((resolve, reject) => {
    request({
      method: "GET",
      url,
      timeout: options.timeoutMs ?? FCX_ROUTINE_CATALOG_TIMEOUT_MS,
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      onload: (response) => {
        if (response.status < 200 || response.status >= 300) {
          reject(new Error(`流程目录读取失败：HTTP ${response.status}`));
          return;
        }
        try {
          resolve(parseRoutineCatalog(response.responseText));
        } catch (error) {
          reject(error);
        }
      },
      onerror: (error) => reject(new Error(networkErrorMessage(error))),
      ontimeout: () => reject(new Error("流程目录读取超时")),
    });
  });
}

export class RoutineCatalogUpdateController {
  private requestPromise: Promise<boolean> | undefined;
  private failureLogged = false;

  constructor(
    private readonly request: GmCompatRequest,
    private readonly store: RoutineStore,
    private readonly logger: Pick<Console, "info" | "warn"> = console,
  ) {}

  loadOnce(): Promise<boolean> {
    if (!this.requestPromise) {
      this.requestPromise = requestRoutineCatalog(this.request)
        .then((catalog) => {
          const applied = this.store.replaceBuiltinCatalog(
            catalog.routines,
            catalog.catalogVersion,
          );
          if (applied) {
            this.logger.info("[FCX][Routine] 在线流程目录已载入", {
              catalogVersion: catalog.catalogVersion,
              routineCount: catalog.routines.length,
            });
          } else {
            this.logger.info("[FCX][Routine] 在线流程目录版本较旧，继续使用当前目录", {
              catalogVersion: catalog.catalogVersion,
              currentVersion: this.store.getBuiltinCatalogVersion(),
            });
          }
          return applied;
        })
        .catch((error: unknown) => {
          if (!this.failureLogged) {
            this.failureLogged = true;
            this.logger.warn(
              "[FCX][Routine] 在线流程目录不可用，继续使用脚本内置流程",
              error,
            );
          }
          return false;
        });
    }
    return this.requestPromise;
  }
}
