import type { MikroDocumentRecord } from "../../interfaces/Document.js";
import { MarkdownService } from "./MarkdownService.js";
import { ZipService } from "./ZipService.js";

export interface ImageAssetSummary {
  embeddedImages: number;
  embeddedBytes: number;
  remoteImages: number;
  localImages: number;
  totalImages: number;
}

/**
 * @description Builds portable document archives and lightweight asset summaries.
 */
export class DocumentArchiveService {
  static createMarkdownZip(documents: MikroDocumentRecord[]) {
    const usedNames = new Map<string, number>();
    const documentEntries = documents.map((documentRecord) => {
      const baseName = slugFileName(
        documentRecord.title || MarkdownService.deriveTitle(documentRecord.markdown),
      );
      const count = usedNames.get(baseName) ?? 0;
      usedNames.set(baseName, count + 1);
      const filename = count ? `${baseName}-${count + 1}.md` : `${baseName}.md`;

      return {
        path: filename,
        text: MarkdownService.withTitle(documentRecord.markdown, documentRecord.title),
        title: documentRecord.title,
      };
    });

    const entries = [
      {
        path: "index.md",
        text: [
          "# MikroDocs Export",
          "",
          ...documentEntries.map((entry) => `- [${entry.title}](${entry.path})`),
        ].join("\n"),
      },
      ...documentEntries,
    ];

    return ZipService.createTextPackage(entries);
  }

  static summarizeImages(markdown: string): ImageAssetSummary {
    const summary: ImageAssetSummary = {
      embeddedImages: 0,
      embeddedBytes: 0,
      remoteImages: 0,
      localImages: 0,
      totalImages: 0,
    };

    for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]+")?\)/g)) {
      const source = match[1];
      summary.totalImages += 1;
      if (source.startsWith("data:image/")) {
        summary.embeddedImages += 1;
        summary.embeddedBytes += estimateDataUrlBytes(source);
      } else if (/^https?:\/\//i.test(source)) {
        summary.remoteImages += 1;
      } else {
        summary.localImages += 1;
      }
    }

    return summary;
  }
}

function estimateDataUrlBytes(source: string) {
  const data = source.split(",", 2)[1] ?? "";
  return Math.floor((data.length * 3) / 4);
}

function slugFileName(value: string) {
  return (
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")
      .slice(0, 80) || "document"
  );
}
