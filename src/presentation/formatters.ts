import type { BrowserStorageStatus, MikroDocumentRecord } from "../index.js";
import { MarkdownService } from "../index.js";

export function formatError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function escapeText(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const escapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return escapes[character] ?? character;
  });
}

export function highlightSearchResult(text: string, matchStart: number, matchEnd: number) {
  return `${escapeText(text.slice(0, matchStart))}<mark>${escapeText(text.slice(matchStart, matchEnd))}</mark>${escapeText(text.slice(matchEnd))}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getLibrarySnippet(documentRecord: MikroDocumentRecord, query: string) {
  const term = query.trim();
  if (!term) {
    return "";
  }

  const [result] = MarkdownService.searchLines(documentRecord.markdown, term);
  if (!result) {
    return "";
  }

  return `<em>Line ${result.line}: ${highlightSearchResult(result.text, result.matchStart, result.matchEnd)}</em>`;
}

export function formatSignedNumber(value: number, unit: string) {
  const suffix = Math.abs(value) === 1 ? unit : `${unit}s`;
  return `${value > 0 ? "+" : ""}${value} ${suffix}`;
}

export function formatStorageStatus(status: BrowserStorageStatus) {
  if (!status.available) {
    return "Unavailable";
  }

  if (status.persisted === null) {
    return "Available";
  }

  return status.persisted ? "Persistent" : "Best effort";
}

export function formatStorageUsage(usage: number | null, quota: number | null) {
  if (usage === null && quota === null) {
    return "Unknown";
  }

  if (usage !== null && quota !== null) {
    return `${formatBytes(usage)} of ${formatBytes(quota)}`;
  }

  return usage !== null ? formatBytes(usage) : `Quota ${formatBytes(quota ?? 0)}`;
}

export function formatAssetSummary(summary: {
  embeddedImages: number;
  embeddedBytes: number;
  remoteImages: number;
  localImages: number;
  totalImages: number;
}) {
  if (!summary.totalImages) {
    return "No images";
  }

  return `${summary.totalImages} total, ${summary.embeddedImages} embedded (${formatBytes(summary.embeddedBytes)}), ${summary.remoteImages} remote, ${summary.localImages} local`;
}

export function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function slugFileName(value: string) {
  return (
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .slice(0, 80) || "document"
  );
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
