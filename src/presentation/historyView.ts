import { MarkdownService, type MikroDocumentSnapshot } from "../index.js";
import { formatDate, formatSignedNumber } from "./formatters.js";
import { createEmptyState, createReviewLine } from "./viewHelpers.js";

interface RenderHistoryOptions {
  historyList: HTMLElement;
  snapshots: MikroDocumentSnapshot[];
  setHtml: (element: Element, html: string) => void;
  onPreview: (snapshot: MikroDocumentSnapshot) => void;
  onRestore: (snapshotId: string) => void;
}

interface RenderSnapshotPreviewOptions {
  currentMarkdown: string;
  previewContent: HTMLElement;
  previewSummary: HTMLElement;
  snapshot: MikroDocumentSnapshot;
}

export function renderHistoryList({
  historyList,
  snapshots,
  setHtml,
  onPreview,
  onRestore,
}: RenderHistoryOptions) {
  historyList.replaceChildren(
    ...(snapshots.length
      ? snapshots.map((snapshot) => {
          const row = document.createElement("div");
          row.className = "history-row";
          setHtml(
            row,
            `<div><span>${formatDate(snapshot.createdAt)}</span><small>${snapshot.reason} · ${MarkdownService.getStats(snapshot.markdown).words} words</small></div><div class="document-actions"><button class="button" type="button" data-history-action="preview">Preview</button><button class="button" type="button" data-history-action="restore">Restore</button></div>`,
          );
          row
            .querySelector<HTMLButtonElement>('[data-history-action="preview"]')
            ?.addEventListener("click", () => onPreview(snapshot));
          row
            .querySelector<HTMLButtonElement>('[data-history-action="restore"]')
            ?.addEventListener("click", () => onRestore(snapshot.id));
          return row;
        })
      : [createEmptyState("No saved versions yet")]),
  );
}

export function renderSnapshotPreview({
  currentMarkdown,
  previewContent,
  previewSummary,
  snapshot,
}: RenderSnapshotPreviewOptions) {
  const currentStats = MarkdownService.getStats(currentMarkdown);
  const snapshotStats = MarkdownService.getStats(snapshot.markdown);
  previewSummary.replaceChildren(
    createReviewLine("Saved", formatDate(snapshot.createdAt)),
    createReviewLine("Reason", snapshot.reason),
    createReviewLine(
      "Word change",
      formatSignedNumber(snapshotStats.words - currentStats.words, "word"),
    ),
    createReviewLine(
      "Character change",
      formatSignedNumber(snapshotStats.characters - currentStats.characters, "character"),
    ),
  );
  previewContent.textContent = snapshot.markdown;
}
