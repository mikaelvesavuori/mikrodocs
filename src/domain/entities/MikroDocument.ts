import type {
  CreateDocumentInput,
  MikroDocumentRecord,
  MikroDocumentSnapshot,
  UpdateDocumentInput,
} from "../../interfaces/Document.js";
import { createId } from "../../shared/id.js";
import { nowIso } from "../../shared/time.js";
import { MarkdownService } from "../services/MarkdownService.js";

const maxSnapshots = 25;

/**
 * @description Domain entity for a local-first writing document using Markdown as canonical source.
 */
export class MikroDocument {
  private readonly record: MikroDocumentRecord;

  private constructor(record: MikroDocumentRecord) {
    this.record = structuredClone(record);
  }

  static create(input: CreateDocumentInput = {}) {
    const now = nowIso();
    const markdown = input.markdown?.trimEnd() || "# Untitled\n\nStart writing...";
    const title = input.title?.trim() || MarkdownService.deriveTitle(markdown);

    return new MikroDocument({
      id: createId("doc"),
      title,
      markdown,
      tags: MarkdownService.extractTags(markdown),
      createdAt: now,
      updatedAt: now,
      lastSavedAt: null,
      version: 1,
      snapshots: [],
    });
  }

  static fromRecord(record: MikroDocumentRecord) {
    return new MikroDocument(record);
  }

  toRecord(): MikroDocumentRecord {
    return structuredClone(this.record);
  }

  update(input: UpdateDocumentInput = {}) {
    const now = nowIso();
    const nextRecord = this.toRecord();

    if (typeof input.markdown === "string") {
      nextRecord.markdown = input.markdown.trimEnd();
      nextRecord.tags = MarkdownService.extractTags(input.markdown);
      if (!input.title) {
        nextRecord.title = MarkdownService.deriveTitle(input.markdown);
      }
    }

    if (typeof input.title === "string" && input.title.trim()) {
      nextRecord.title = input.title.trim();
    }

    nextRecord.updatedAt = now;
    nextRecord.version += 1;

    if (input.saveSnapshot) {
      nextRecord.lastSavedAt = now;
      nextRecord.snapshots = MikroDocument.appendSnapshot(
        nextRecord.snapshots,
        nextRecord.id,
        nextRecord.markdown,
        input.snapshotReason ?? "manual",
        now,
      );
    }

    return new MikroDocument(nextRecord);
  }

  private static appendSnapshot(
    snapshots: MikroDocumentSnapshot[],
    documentId: string,
    markdown: string,
    reason: MikroDocumentSnapshot["reason"],
    createdAt: string,
  ) {
    return [
      {
        id: createId("snap"),
        documentId,
        markdown,
        createdAt,
        reason,
      },
      ...snapshots,
    ].slice(0, maxSnapshots);
  }
}
