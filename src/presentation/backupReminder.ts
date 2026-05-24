import type { MikroDocumentRecord } from "../index.js";

const backupReminderIntervalMs = 1000 * 60 * 60 * 24 * 7;
const starterMarkdown = "# Untitled\n\nStart writing...";

export function shouldShowBackupReminder(
  documents: MikroDocumentRecord[],
  lastBackupAt: string | null,
) {
  return hasMeaningfulDocuments(documents) && isBackupDue(lastBackupAt);
}

function hasMeaningfulDocuments(documents: MikroDocumentRecord[]) {
  return documents.some(
    (documentRecord) =>
      documentRecord.title !== "Untitled" || documentRecord.markdown !== starterMarkdown,
  );
}

function isBackupDue(lastBackupAt: string | null) {
  if (!lastBackupAt) {
    return true;
  }

  const lastBackup = new Date(lastBackupAt).valueOf();
  if (!Number.isFinite(lastBackup)) {
    return true;
  }

  return Date.now() - lastBackup > backupReminderIntervalMs;
}
