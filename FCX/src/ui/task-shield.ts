export interface EaTaskShieldWindow {
  gClickShield?: {
    showShield(shield: unknown): void;
    hideShield(shield: unknown): void;
  };
  EAClickShieldView?: {
    Shield?: {
      LOADING?: unknown;
    };
  };
}

/**
 * Owns exactly one EA loading-shield reference for the outer FCX task.
 * Nested SBC and pack operations must not acquire or release this lease.
 */
export class EaTaskShieldController {
  private owned = false;
  private controller:
    | EaTaskShieldWindow["gClickShield"]
    | undefined;
  private loadingShield: unknown;

  constructor(private readonly windowRef: EaTaskShieldWindow) {}

  get isOwned(): boolean {
    return this.owned;
  }

  acquire(): boolean {
    if (this.owned) return true;

    const controller = this.windowRef.gClickShield;
    const loadingShield = this.windowRef.EAClickShieldView?.Shield?.LOADING;
    if (
      !controller ||
      typeof controller.showShield !== "function" ||
      typeof controller.hideShield !== "function" ||
      loadingShield === undefined
    ) {
      return false;
    }

    try {
      controller.showShield(loadingShield);
      this.controller = controller;
      this.loadingShield = loadingShield;
      this.owned = true;
      return true;
    } catch (error) {
      console.warn("[FCX][Overlay] 无法持有 EA 原生加载遮罩，使用 FCX 降级遮罩", error);
      return false;
    }
  }

  release(): void {
    if (!this.owned) return;

    const controller = this.controller;
    const loadingShield = this.loadingShield;
    this.owned = false;
    this.controller = undefined;
    this.loadingShield = undefined;

    try {
      controller?.hideShield(loadingShield);
    } catch (error) {
      console.warn("[FCX][Overlay] 释放 EA 原生加载遮罩失败", error);
    }
  }
}
