export class SbcSessionCache<TCatalog, TChallenges> {
  private catalog: TCatalog | undefined;
  private catalogPromise: Promise<TCatalog> | undefined;
  private catalogGeneration = 0;
  private readonly challenges = new Map<number, TChallenges>();
  private readonly challengeUpdatedAt = new Map<number, number>();
  private readonly challengePromises = new Map<number, Promise<TChallenges>>();
  private readonly challengeGenerations = new Map<number, number>();

  async getCatalog(
    loader: () => Promise<TCatalog>,
    force = false,
  ): Promise<TCatalog> {
    if (force) this.invalidateCatalog();
    if (this.catalog !== undefined) return this.catalog;
    if (!this.catalogPromise) {
      const generation = this.catalogGeneration;
      const pending = loader()
        .then((catalog) => {
          if (this.catalogGeneration === generation) this.catalog = catalog;
          return catalog;
        })
        .finally(() => {
          if (this.catalogPromise === pending) this.catalogPromise = undefined;
        });
      this.catalogPromise = pending;
    }
    return this.catalogPromise;
  }

  peekCatalog(): TCatalog | undefined {
    return this.catalog;
  }

  replaceCatalog(catalog: TCatalog): void {
    this.catalogGeneration += 1;
    this.catalog = catalog;
    this.catalogPromise = undefined;
  }

  constructor(private readonly challengeTtlMs = 30_000) {}

  async getChallenges(
    setId: number,
    loader: () => Promise<TChallenges>,
    force = false,
  ): Promise<TChallenges> {
    if (force) this.invalidateChallenges(setId);
    const cached = this.challenges.get(setId);
    const cachedAt = this.challengeUpdatedAt.get(setId) ?? 0;
    if (cached !== undefined && Date.now() - cachedAt < this.challengeTtlMs) return cached;
    if (cached !== undefined) this.invalidateChallenges(setId);
    const existing = this.challengePromises.get(setId);
    if (existing) return existing;

    const generation = this.challengeGenerations.get(setId) ?? 0;
    const pending = loader()
      .then((challenges) => {
        if ((this.challengeGenerations.get(setId) ?? 0) === generation) {
          this.challenges.set(setId, challenges);
          this.challengeUpdatedAt.set(setId, Date.now());
        }
        return challenges;
      })
      .finally(() => {
        if (this.challengePromises.get(setId) === pending) {
          this.challengePromises.delete(setId);
        }
      });
    this.challengePromises.set(setId, pending);
    return pending;
  }

  invalidateCatalog(): void {
    this.catalogGeneration += 1;
    this.catalog = undefined;
    this.catalogPromise = undefined;
  }

  invalidateChallenges(setId?: number): void {
    if (setId === undefined) {
      for (const key of new Set([
        ...this.challenges.keys(),
        ...this.challengePromises.keys(),
      ])) {
        this.challengeGenerations.set(
          key,
          (this.challengeGenerations.get(key) ?? 0) + 1,
        );
      }
      this.challenges.clear();
      this.challengePromises.clear();
      this.challengeUpdatedAt.clear();
      return;
    }
    this.challengeGenerations.set(
      setId,
      (this.challengeGenerations.get(setId) ?? 0) + 1,
    );
    this.challenges.delete(setId);
    this.challengePromises.delete(setId);
    this.challengeUpdatedAt.delete(setId);
  }

  replaceChallenges(setId: number, challenges: TChallenges): void {
    this.invalidateChallenges(setId);
    this.challenges.set(setId, challenges);
    this.challengeUpdatedAt.set(setId, Date.now());
  }

  invalidate(setId?: number, options: { catalog?: boolean } = {}): void {
    if (setId === undefined || options.catalog === true) this.invalidateCatalog();
    this.invalidateChallenges(setId);
  }
}
