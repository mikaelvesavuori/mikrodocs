import type { BrowserStorageStatus, ImageAssetSummary, MikroDocumentRecord } from "../index.js";
import {
  formatAssetSummary,
  formatDate,
  formatStorageStatus,
  formatStorageUsage,
} from "./formatters.js";
import { createReviewLine } from "./viewHelpers.js";

interface RenderBackupReviewOptions {
  filename: string;
  records: MikroDocumentRecord[];
  summary: HTMLElement;
}

interface RenderDataSafetyOptions {
  activeAssetSummary: ImageAssetSummary;
  allAssetSummary: ImageAssetSummary;
  lastBackupAt: string | null;
  records: MikroDocumentRecord[];
  storage: BrowserStorageStatus;
  summary: HTMLElement;
}

export function createEmptyAssetSummary(): ImageAssetSummary {
  return {
    embeddedImages: 0,
    embeddedBytes: 0,
    remoteImages: 0,
    localImages: 0,
    totalImages: 0,
  };
}

export function mergeAssetSummaries(
  summary: ImageAssetSummary,
  item: ImageAssetSummary,
): ImageAssetSummary {
  return {
    embeddedImages: summary.embeddedImages + item.embeddedImages,
    embeddedBytes: summary.embeddedBytes + item.embeddedBytes,
    remoteImages: summary.remoteImages + item.remoteImages,
    localImages: summary.localImages + item.localImages,
    totalImages: summary.totalImages + item.totalImages,
  };
}

export function renderBackupReview({ filename, records, summary }: RenderBackupReviewOptions) {
  const newest = records
    .map((record) => new Date(record.updatedAt))
    .filter((date) => !Number.isNaN(date.valueOf()))
    .sort((a, b) => b.valueOf() - a.valueOf())[0];
  const titles = records
    .slice(0, 4)
    .map((record) => record.title)
    .join(", ");
  const remaining = records.length > 4 ? ` and ${records.length - 4} more` : "";

  summary.replaceChildren(
    createReviewLine("File", filename),
    createReviewLine("Documents", String(records.length)),
    createReviewLine("Newest update", newest ? formatDate(newest.toISOString()) : "Unknown"),
    createReviewLine("Includes", `${titles}${remaining}`),
  );
}

export function renderDataSafetySummary({
  activeAssetSummary,
  allAssetSummary,
  lastBackupAt,
  records,
  storage,
  summary,
}: RenderDataSafetyOptions) {
  summary.replaceChildren(
    createReviewLine("Documents", String(records.length)),
    createReviewLine("Storage", formatStorageStatus(storage)),
    createReviewLine("Storage used", formatStorageUsage(storage.usage, storage.quota)),
    createReviewLine("Last backup", lastBackupAt ? formatDate(lastBackupAt) : "Never"),
    createReviewLine("Active document images", formatAssetSummary(activeAssetSummary)),
    createReviewLine("Library images", formatAssetSummary(allAssetSummary)),
  );
}
