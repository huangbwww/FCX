import type { EaPlayer } from "../types/game";
import type {
  PriceDiagnosticEvent,
  PriceFetchResult,
  PricePersistenceResult,
  PriceRecordMap,
} from "../types/prices";
import type { SbcExecutionContext } from "../types/sbc-run";
import type { RoutineExecutionContext } from "../types/routines";

export interface ProgressBarState {
  id: string;
  element: HTMLElement;
  position: number;
}

export class RuntimeState {
  readonly activeProgressBars: ProgressBarState[] = [];
  conceptPlayersCollected = false;
  conceptPlayerFetchInProgress = false;
  conceptPlayers: EaPlayer[] = [];
  cancelRequested = false;
  taskOverlayHolds = 0;
  taskShieldOwned = false;
  taskShieldUsesFallback = false;
  concepts = false;
  apiUrl = "http://127.0.0.1:8000";
  cachedFixedItems: number[] | undefined;
  cachedLockedItems: number[] | undefined;
  cachedPriceItems: PriceRecordMap | null | undefined;
  priceItemsHydrated = false;
  priceItemsLoadPromise: Promise<PriceRecordMap> | undefined;
  priceFetchPromise: Promise<PriceFetchResult> | undefined;
  priceRequestBlockedUntil = 0;
  priceRequestLastError: string | undefined;
  futggBlockedForSession = false;
  readonly priceDiagnosticEvents: PriceDiagnosticEvent[] = [];
  lastPriceFetchResult: PriceFetchResult | undefined;
  lastPricePersistenceResult: PricePersistenceResult | undefined;
  activeSbcExecution: SbcExecutionContext | undefined;
  activeRoutineExecution: RoutineExecutionContext | undefined;
  packRunActive = false;
  academyRunActive = false;
  eaHomeReadyAt = 0;
  eaHomeRoot: HTMLElement | undefined;
  countDownInterval: ReturnType<typeof setInterval> | undefined;
  failedChallenges: unknown;
  ppView: unknown;
  ppController: unknown;
  priceCacheMinutes = 60;
  idToPlayerItem: Record<number, EaPlayer> = {};
}
