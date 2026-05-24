import type { MikroDocumentRecord } from "../index.js";

export function parseBackupRecords(text: string) {
  const records: unknown = JSON.parse(text);
  if (!Array.isArray(records)) {
    throw new Error("Backup file must contain an array of documents");
  }

  if (!records.length) {
    throw new Error("Backup file does not contain any documents");
  }

  const invalidIndex = records.findIndex((record) => !isMikroDocumentRecord(record));
  if (invalidIndex >= 0) {
    throw new Error(`Backup document ${invalidIndex + 1} is missing required fields`);
  }

  return records as MikroDocumentRecord[];
}

function isMikroDocumentRecord(record: unknown): record is MikroDocumentRecord {
  if (!record || typeof record !== "object") {
    return false;
  }

  const value = record as Partial<MikroDocumentRecord>;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.markdown === "string" &&
    Array.isArray(value.tags) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (typeof value.lastSavedAt === "string" || value.lastSavedAt === null) &&
    typeof value.version === "number" &&
    Array.isArray(value.snapshots)
  );
}
