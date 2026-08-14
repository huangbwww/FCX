import type {
  EaObservable,
  EaPlayer,
  EaSbcCatalog,
  EaSbcSet,
} from "../types/game";

type EaRecord = Record<string, unknown>;
type EaConstructor<T extends EaRecord = EaRecord> = {
  new (...args: unknown[]): T;
  prototype: T;
};

interface EaServicesBoundary {
  Club: EaRecord;
  Item: EaRecord;
  SBC: {
    requestSets(): EaObservable<EaSbcCatalog>;
    requestChallengesForSet(set: EaSbcSet): EaObservable<EaRecord>;
    repository: EaRecord;
    [key: string]: unknown;
  };
  Store: EaRecord;
  Notification: EaRecord;
  Localization: EaRecord;
  Chemistry: EaRecord;
  User: EaRecord;
  Configuration: EaRecord;
}

interface EaClickShieldBoundary {
  showShield(shield: unknown): void;
  hideShield(shield: unknown): void;
  shieldCounter?: Partial<Record<"LOADING", number>>;
}

interface EaClickShieldViewBoundary {
  Shield?: {
    LOADING?: unknown;
  };
}

declare global {
  const unsafeWindow: Window & typeof globalThis;
  const services: EaServicesBoundary;
  const repositories: EaRecord;
  const factories: EaRecord;
  const JSUtils: EaRecord;
  const DOMKit: EaRecord;
  const AssetLocationUtils: EaRecord;
  const NetworkErrorManager: EaRecord;
  const UINotificationType: EaRecord;
  const EventType: EaRecord;
  const SearchSortType: EaRecord;
  const SBCEligibilityKey: EaRecord;
  const SBCEligibilityScope: EaRecord;
  const GameCurrency: EaRecord;
  const ItemRatingTier: EaRecord;
  const ItemSubType: EaRecord;
  const ItemType: EaRecord;
  const SearchLevel: EaRecord;
  const ListItemPriority: EaRecord;
  const gClickShield: EaClickShieldBoundary;
  const EAClickShieldView: EaClickShieldViewBoundary;

  interface Window {
    gClickShield?: EaClickShieldBoundary;
    EAClickShieldView?: EaClickShieldViewBoundary;
  }

  const UTBucketedItemSearchViewModel: EaConstructor;
  const EAView: EaConstructor;
  const UTHomeHubView: EaConstructor;
  const UTHomeHubViewController: EaConstructor;
  const UTSBCSquadOverviewViewController: EaConstructor;
  const UTSBCSquadSplitViewController: EaConstructor;
  const UTItemEntity: EaConstructor<EaPlayer & EaRecord>;
  const UTStoreViewController: EaConstructor;
  const UTStorePackViewController: EaConstructor;
  const UTItemDetailsViewController: EaConstructor;
  const UTPackAnimationViewController: EaConstructor;
  const UTGameTabBarController: EaConstructor;
  const UTGameFlowNavigationController: EaConstructor;
  const UTTabBarItemView: EaConstructor;
  const UTDropDownControl: EaConstructor;
  const UTToggleCellView: EaConstructor;
  const UTNumberInputSpinnerControl: EaConstructor;
  const UTDoubleRangeControl: EaConstructor;

  function getAppMain(): EaRecord;
  function isPhone(): boolean;
}

export {};
