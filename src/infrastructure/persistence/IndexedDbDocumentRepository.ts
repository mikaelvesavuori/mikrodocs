import type { DocumentRepository } from "../../application/index.js";
import type {
  MikroDocumentId,
  MikroDocumentRecord,
  StorageMetadata,
} from "../../interfaces/Document.js";

const defaultDatabaseName = "mikrodocs-local";
const defaultStoreName = "documents";
const metadataStoreName = "metadata";
const databaseVersion = 2;
const metadataKey = "schema";
const storageUnavailableMessage =
  "Browser storage is unavailable. Documents cannot be saved in this browser session.";

function isIndexedDbAvailable() {
  return typeof globalThis !== "undefined" && typeof globalThis.indexedDB !== "undefined";
}

function createRequestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * @description IndexedDB adapter for browser-local document persistence with a small migration point.
 */
export class IndexedDbDocumentRepository implements DocumentRepository {
  private databasePromise: Promise<IDBDatabase | null> | null = null;

  constructor(
    private readonly databaseName = defaultDatabaseName,
    private readonly storeName = defaultStoreName,
  ) {}

  async list() {
    return this.withStore("readonly", async (store) => {
      if ("getAll" in store) {
        return createRequestPromise<MikroDocumentRecord[]>(store.getAll());
      }

      return [];
    });
  }

  async load(id: MikroDocumentId) {
    return this.withStore("readonly", async (store) => {
      const value = await createRequestPromise<MikroDocumentRecord | undefined>(store.get(id));
      return value ?? null;
    });
  }

  async save(document: MikroDocumentRecord) {
    await this.withStore("readwrite", async (store) => {
      await createRequestPromise(store.put(document));
    });
  }

  async delete(id: MikroDocumentId) {
    await this.withStore("readwrite", async (store) => {
      await createRequestPromise(store.delete(id));
    });
  }

  async getMetadata() {
    return this.withNamedStore<StorageMetadata | null>(
      metadataStoreName,
      "readonly",
      async (store) => {
        const value = await createRequestPromise<StorageMetadata | undefined>(
          store.get(metadataKey),
        );
        return value ?? null;
      },
      null,
    );
  }

  private openDatabase() {
    if (!isIndexedDbAvailable()) {
      return Promise.resolve(null);
    }

    if (this.databasePromise) {
      return this.databasePromise;
    }

    this.databasePromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.databaseName, databaseVersion);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: "id" });
        }

        if (!database.objectStoreNames.contains(metadataStoreName)) {
          database.createObjectStore(metadataStoreName);
        }

        request.transaction?.objectStore(metadataStoreName).put(
          {
            schemaVersion: databaseVersion,
            migratedAt: new Date().toISOString(),
          },
          metadataKey,
        );
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Could not open IndexedDB database"));
    });

    return this.databasePromise;
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    handler: (store: IDBObjectStore) => Promise<T>,
  ) {
    const database = await this.openDatabase();
    if (!database) {
      throw new Error(storageUnavailableMessage);
    }

    const transaction = database.transaction(this.storeName, mode);
    const store = transaction.objectStore(this.storeName);
    return handler(store);
  }

  private async withNamedStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    handler: (store: IDBObjectStore) => Promise<T>,
    fallback: T,
  ) {
    const database = await this.openDatabase();
    if (!database) {
      return fallback;
    }

    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return handler(store);
  }
}
