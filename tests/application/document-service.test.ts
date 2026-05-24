import { describe, expect, it } from "vitest";

import { type DocumentRepository, DocumentService } from "../../src/application/index.js";
import type { MikroDocumentRecord } from "../../src/interfaces/index.js";

class MemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, MikroDocumentRecord>();

  async list() {
    return [...this.documents.values()];
  }

  async load(id: string) {
    return this.documents.get(id) ?? null;
  }

  async save(document: MikroDocumentRecord) {
    this.documents.set(document.id, document);
  }

  async delete(id: string) {
    this.documents.delete(id);
  }
}

describe("DocumentService", () => {
  it("creates, updates, snapshots, and searches documents", async () => {
    const service = new DocumentService(new MemoryDocumentRepository());
    const created = await service.create({ markdown: "# First\n\nA #draft note." });
    const updated = await service.update(created.id, {
      markdown: "# Second\n\nUpdated body",
      saveSnapshot: true,
    });

    expect(updated.title).toBe("Second");
    expect(updated.snapshots).toHaveLength(1);
    expect(updated.tags).toEqual([]);

    const results = service.search(await service.list(), "updated");
    expect(results.map((documentRecord) => documentRecord.id)).toEqual([created.id]);
  });

  it("duplicates documents and restores snapshots", async () => {
    const service = new DocumentService(new MemoryDocumentRepository());
    const created = await service.create({ markdown: "# Original\n\nStart" });
    const saved = await service.update(created.id, {
      markdown: "# Original\n\nSnapshot body",
      saveSnapshot: true,
    });
    await service.update(created.id, { markdown: "# Original\n\nNew body" });

    const duplicated = await service.duplicate(created.id);
    const restored = await service.restoreSnapshot(created.id, saved.snapshots[0].id);

    expect(duplicated.title).toBe("Original copy");
    expect(restored.markdown).toBe("# Original\n\nSnapshot body");
  });

  it("caps snapshots and keeps the newest autosave/manual reasons", async () => {
    const service = new DocumentService(new MemoryDocumentRepository());
    const created = await service.create({ markdown: "# Snapshot cap" });

    let updated = created;
    for (let index = 0; index < 30; index += 1) {
      updated = await service.update(created.id, {
        markdown: `# Snapshot cap\n\nVersion ${index}`,
        saveSnapshot: true,
        snapshotReason: index % 2 === 0 ? "autosave" : "manual",
      });
    }

    expect(updated.snapshots).toHaveLength(25);
    expect(updated.snapshots[0].markdown).toContain("Version 29");
    expect(updated.snapshots.at(-1)?.markdown).toContain("Version 5");
    expect(new Set(updated.snapshots.map((snapshot) => snapshot.reason))).toEqual(
      new Set(["autosave", "manual"]),
    );
  });

  it("keeps explicit titles while updating markdown-derived tags", async () => {
    const service = new DocumentService(new MemoryDocumentRepository());
    const created = await service.create({ title: "Pinned title", markdown: "# Source title" });
    const updated = await service.update(created.id, {
      title: "Pinned title",
      markdown: "# New source\n\nA #release note",
    });

    expect(updated.title).toBe("Pinned title");
    expect(updated.tags).toEqual(["release"]);
  });

  it("throws when loading missing documents or snapshots", async () => {
    const service = new DocumentService(new MemoryDocumentRepository());
    const created = await service.create({ markdown: "# Original" });

    await expect(service.update("missing", { markdown: "Nope" })).rejects.toThrow(
      "Document not found: missing",
    );
    await expect(service.duplicate("missing")).rejects.toThrow("Document not found: missing");
    await expect(service.restoreSnapshot(created.id, "missing-snapshot")).rejects.toThrow(
      "Snapshot not found: missing-snapshot",
    );
  });

  it("imports backups and can clear local documents", async () => {
    const service = new DocumentService(new MemoryDocumentRepository());
    const created = await service.create({ markdown: "# Backup" });
    await service.create({ markdown: "# Temporary" });

    await service.importBackup([created], true);
    expect(await service.list()).toHaveLength(1);

    await service.clear();
    expect(await service.list()).toEqual([]);
  });

  it("appends imported backups when replace is false", async () => {
    const service = new DocumentService(new MemoryDocumentRepository());
    const existing = await service.create({ markdown: "# Existing" });
    const imported = await service.create({ markdown: "# Imported" });

    await service.clear();
    await service.importBackup([existing], false);
    await service.importBackup([imported], false);

    expect((await service.list()).map((documentRecord) => documentRecord.title).sort()).toEqual([
      "Existing",
      "Imported",
    ]);
  });

  it("imports and searches a large backup set", async () => {
    const source = new DocumentService(new MemoryDocumentRepository());
    const records: MikroDocumentRecord[] = [];
    for (let index = 0; index < 150; index += 1) {
      records.push(
        await source.create({
          markdown: `# Imported ${index + 1}\n\nRelease torture backup body ${index + 1}`,
        }),
      );
    }

    const target = new DocumentService(new MemoryDocumentRepository());
    await target.importBackup(records, true);
    const documents = await target.list();
    const results = target.search(documents, "torture backup body 149");

    expect(documents).toHaveLength(150);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Imported 149");
  });
});
