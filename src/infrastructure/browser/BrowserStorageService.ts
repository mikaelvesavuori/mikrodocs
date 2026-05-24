export interface BrowserStorageStatus {
  available: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

/**
 * @description Wraps browser storage durability and quota APIs behind safe fallbacks.
 */
export class BrowserStorageService {
  async getStatus(): Promise<BrowserStorageStatus> {
    const storage = globalThis.navigator?.storage;
    if (!storage) {
      return { available: false, persisted: null, usage: null, quota: null };
    }

    const [estimate, persisted] = await Promise.all([
      storage.estimate?.().catch(() => null) ?? Promise.resolve(null),
      storage.persisted?.().catch(() => null) ?? Promise.resolve(null),
    ]);

    return {
      available: true,
      persisted,
      usage: typeof estimate?.usage === "number" ? estimate.usage : null,
      quota: typeof estimate?.quota === "number" ? estimate.quota : null,
    };
  }

  async requestPersistence() {
    const storage = globalThis.navigator?.storage;
    if (!storage?.persist) {
      return false;
    }

    return storage.persist();
  }
}
