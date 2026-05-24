import { describe, expect, it } from "vitest";

import { DocumentArchiveService, MikroDocument, ZipService } from "../../src/domain/index.js";

describe("DocumentArchiveService", () => {
  it("exports local documents as a readable Markdown ZIP", async () => {
    const first = MikroDocument.create({
      title: "Roadmap",
      markdown: "## Next\n\nShip it.",
    }).toRecord();
    const second = MikroDocument.create({
      title: "Roadmap",
      markdown: "Different body.",
    }).toRecord();

    const bytes = DocumentArchiveService.createMarkdownZip([first, second]);
    const files = await ZipService.read(bytes);

    expect(files.has("index.md")).toBe(true);
    expect(files.has("roadmap.md")).toBe(true);
    expect(files.has("roadmap-2.md")).toBe(true);
    expect(new TextDecoder().decode(files.get("roadmap.md"))).toContain("# Roadmap");
    expect(new TextDecoder().decode(files.get("index.md"))).toContain("[Roadmap](roadmap-2.md)");
  });

  it("summarizes embedded, remote, and local image references", () => {
    const summary = DocumentArchiveService.summarizeImages(`![Inline](data:image/png;base64,AAAA)
![Remote](https://example.com/image.png)
![Local](assets/local.png)`);

    expect(summary.totalImages).toBe(3);
    expect(summary.embeddedImages).toBe(1);
    expect(summary.remoteImages).toBe(1);
    expect(summary.localImages).toBe(1);
    expect(summary.embeddedBytes).toBeGreaterThan(0);
  });
});
