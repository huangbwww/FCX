export interface AutoSbcSessionSnapshot<TCatalog, TPackGroup> {
  renderVersion: number;
  catalog: TCatalog;
  packGroups: readonly TPackGroup[];
}

export class AutoSbcSessionSnapshotStore<TCatalog, TPackGroup> {
  private snapshot: AutoSbcSessionSnapshot<TCatalog, TPackGroup> | undefined;

  set(
    renderVersion: number,
    catalog: TCatalog,
    packGroups: readonly TPackGroup[],
  ): AutoSbcSessionSnapshot<TCatalog, TPackGroup> {
    this.snapshot = {
      renderVersion,
      catalog,
      packGroups: [...packGroups],
    };
    return this.snapshot;
  }

  get(renderVersion: number): AutoSbcSessionSnapshot<TCatalog, TPackGroup> | undefined {
    return this.snapshot?.renderVersion === renderVersion
      ? this.snapshot
      : undefined;
  }

  invalidate(): void {
    this.snapshot = undefined;
  }
}

export async function resolveAutoSbcSessionData<TCatalog, TPackGroup>({
  snapshot,
  loadCatalog,
  loadPackGroups,
}: {
  snapshot?: AutoSbcSessionSnapshot<TCatalog, TPackGroup>;
  loadCatalog: () => Promise<TCatalog>;
  loadPackGroups: () => Promise<readonly TPackGroup[]>;
}): Promise<{ catalog: TCatalog; packGroups: readonly TPackGroup[] }> {
  if (snapshot) {
    return {
      catalog: snapshot.catalog,
      packGroups: snapshot.packGroups,
    };
  }
  const catalog = await loadCatalog();
  const packGroups = await loadPackGroups();
  return { catalog, packGroups };
}
