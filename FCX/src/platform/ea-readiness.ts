interface EaWebAppServiceBag {
  Item?: unknown;
  Localization?: unknown;
  SBC?: unknown;
}


export function areEaWebAppServicesReady(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const services = value as EaWebAppServiceBag;
  return Boolean(services.Localization && services.SBC && services.Item);
}
