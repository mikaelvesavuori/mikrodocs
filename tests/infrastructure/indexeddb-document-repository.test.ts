import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import { MikroDocument } from "../../src/domain/index.js";
import { IndexedDbDocumentRepository } from "../../src/infrastructure/index.js";

describe("IndexedDbDocumentRepository", () => {
  it("saves, loads, lists, and deletes documents", async () => {
    const repository = new IndexedDbDocumentRepository(`mikrodocs-test-${Date.now()}`);
    const documentRecord = MikroDocument.create({ markdown: "# Stored" }).toRecord();

    await repository.save(documentRecord);

    expect(await repository.load(documentRecord.id)).toMatchObject({ title: "Stored" });
    expect(await repository.list()).toHaveLength(1);

    await repository.delete(documentRecord.id);

    expect(await repository.load(documentRecord.id)).toBeNull();
  });

  it("records storage schema metadata for migrations", async () => {
    const repository = new IndexedDbDocumentRepository(`mikrodocs-meta-test-${Date.now()}`);

    await repository.list();

    expect(await repository.getMetadata()).toMatchObject({ schemaVersion: 2 });
  });
});
