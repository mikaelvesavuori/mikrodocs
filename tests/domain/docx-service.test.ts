import { describe, expect, it } from "vitest";

import { DocxService } from "../../src/domain/index.js";

describe("DocxService", () => {
  it("exports and imports a Word-compatible DOCX package", async () => {
    const bytes = DocxService.exportMarkdown(
      `# MikroDocs

Intro paragraph.

| Name | Role |
| --- | --- |
| Ada | Writer |
`,
      "MikroDocs",
    );

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const markdown = await DocxService.importMarkdown(bytes.buffer as ArrayBuffer);

    expect(markdown).toContain("# MikroDocs");
    expect(markdown).toContain("Intro paragraph.");
    expect(markdown).toContain("| Name | Role |");
    expect(markdown).toContain("| Ada | Writer |");
  });

  it("preserves title metadata and important Markdown block text in DOCX bytes", async () => {
    const bytes = DocxService.exportMarkdown(
      `# Exported Title

> Quoted text

- [x] Task item

\`\`\`
const value = "<safe>";
\`\`\`

![Desk](desk.png "Caption")`,
      "Exported Title",
    );
    const packageText = new TextDecoder().decode(bytes);

    expect(packageText).toContain("Exported Title");
    expect(packageText).toContain("Quoted text");
    expect(packageText).toContain("[x] Task item");
    expect(packageText).toContain("const value = &quot;&lt;safe&gt;&quot;;");
    expect(packageText).toContain("Desk - Caption - desk.png");
  });

  it("emits basic inline formatting runs for DOCX export", () => {
    const bytes = DocxService.exportMarkdown("This is **bold**, *italic*, and `code`.", "Inline");
    const packageText = new TextDecoder().decode(bytes);

    expect(packageText).toContain("<w:b/>");
    expect(packageText).toContain("<w:i/>");
    expect(packageText).toContain('<w:rStyle w:val="CodeChar"/>');
    expect(packageText).toContain("bold");
    expect(packageText).toContain("italic");
    expect(packageText).toContain("code");
  });

  it("exports and re-imports a large structured DOCX package", async () => {
    const markdown = Array.from(
      { length: 120 },
      (_, index) => `## Section ${index + 1}

Paragraph ${index + 1} with **bold** and *italic* text.

| Name | Value |
| --- | --- |
| Row ${index + 1} | ${index + 1} |`,
    ).join("\n\n");

    const bytes = DocxService.exportMarkdown(`# Large DOCX\n\n${markdown}`, "Large DOCX");
    const imported = await DocxService.importMarkdown(bytes.buffer as ArrayBuffer);

    expect(bytes.length).toBeGreaterThan(50_000);
    expect(imported).toContain("# Large DOCX");
    expect(imported).toContain("## Section 120");
    expect(imported).toContain("| Row 120 | 120 |");
  });

  it("throws a clear error for invalid DOCX packages", async () => {
    await expect(DocxService.importMarkdown(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow();
  });
});
