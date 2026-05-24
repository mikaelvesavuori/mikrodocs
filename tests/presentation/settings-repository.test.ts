import { beforeEach, describe, expect, it } from "vitest";

import { BrowserSettingsRepository } from "../../src/infrastructure/index.js";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("BrowserSettingsRepository", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it("loads defaults and persists changed editor settings", () => {
    const repository = new BrowserSettingsRepository();
    const defaults = repository.load();

    repository.save({ ...defaults, theme: "dark", fontScale: 1.15, lastDocumentId: "doc-2" });

    expect(repository.load()).toMatchObject({
      theme: "dark",
      fontScale: 1.15,
      lastDocumentId: "doc-2",
    });
  });
});
