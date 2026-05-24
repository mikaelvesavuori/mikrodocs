import { MikroDocument } from "../../domain/index.js";
import type {
  CreateDocumentInput,
  MikroDocumentId,
  MikroDocumentRecord,
  UpdateDocumentInput,
} from "../../interfaces/Document.js";
import type { DocumentRepository } from "../ports/DocumentRepository.js";

/**
 * @description Application service coordinating document lifecycle, autosave snapshots, and library queries.
 */
export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  async create(input: CreateDocumentInput = {}) {
    const document = MikroDocument.create(input);
    await this.repository.save(document.toRecord());
    return document.toRecord();
  }

  async list() {
    const documents = await this.repository.list();
    return documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: MikroDocumentId) {
    return this.repository.load(id);
  }

  async update(id: MikroDocumentId, input: UpdateDocumentInput) {
    const existing = await this.repository.load(id);
    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }

    const document = MikroDocument.fromRecord(existing).update(input);
    await this.repository.save(document.toRecord());
    return document.toRecord();
  }

  async duplicate(id: MikroDocumentId) {
    const existing = await this.repository.load(id);
    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }

    return this.create({
      title: `${existing.title} copy`,
      markdown: existing.markdown,
    });
  }

  async restoreSnapshot(id: MikroDocumentId, snapshotId: string) {
    const existing = await this.repository.load(id);
    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }

    const snapshot = existing.snapshots.find((item) => item.id === snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    return this.update(id, {
      markdown: snapshot.markdown,
      saveSnapshot: true,
      snapshotReason: "manual",
    });
  }

  async delete(id: MikroDocumentId) {
    await this.repository.delete(id);
  }

  async clear() {
    const documents = await this.repository.list();
    await Promise.all(documents.map((document) => this.repository.delete(document.id)));
  }

  async importBackup(records: MikroDocumentRecord[], replace = false) {
    if (replace) {
      await this.clear();
    }

    const imported = records.map((record) => MikroDocument.fromRecord(record).toRecord());
    await Promise.all(imported.map((record) => this.repository.save(record)));
    return this.list();
  }

  search(documents: MikroDocumentRecord[], query: string) {
    const term = query.trim().toLowerCase();
    if (!term) {
      return documents;
    }

    return documents.filter((document) =>
      [document.title, document.markdown, ...document.tags].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }
}
