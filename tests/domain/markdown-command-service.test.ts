import { describe, expect, it } from "vitest";

import { MarkdownCommandService } from "../../src/domain/index.js";

describe("MarkdownCommandService", () => {
  it("wraps selected text for bold and unwraps existing text", () => {
    const bold = MarkdownCommandService.toggleWrap("hello", 0, 5, "**");
    expect(bold.markdown).toBe("**hello**");
    expect(bold.selectionStart).toBe(2);
    expect(bold.selectionEnd).toBe(7);

    const plain = MarkdownCommandService.toggleWrap("**hello**", 0, 9, "**");
    expect(plain.markdown).toBe("hello");
    expect(plain.selectionStart).toBe(0);
    expect(plain.selectionEnd).toBe(5);
  });

  it("inserts placeholder wrapped text when selection is empty", () => {
    const result = MarkdownCommandService.toggleWrap("Hello ", 6, 6, "_");

    expect(result.markdown).toBe("Hello _text_");
    expect(result.selectionStart).toBe(7);
    expect(result.selectionEnd).toBe(11);
  });

  it("prefixes selected lines", () => {
    const result = MarkdownCommandService.prefixLines("One\nTwo", 0, 7, "- ");

    expect(result.markdown).toBe("- One\n- Two");
  });

  it("replaces existing list, heading, and quote prefixes when applying a new prefix", () => {
    const result = MarkdownCommandService.prefixLines("# One\n> Two\n1. Three", 0, 17, "+ ");

    expect(result.markdown).toBe("+ One\n+ Two\n+ Three");
  });

  it("inserts Markdown tables", () => {
    const result = MarkdownCommandService.insertTable("Before", 6, 2, 1);

    expect(result.markdown).toContain("| Column 1 | Column 2 |");
    expect(result.markdown).toContain("| --- | --- |");
  });

  it("clamps inserted table dimensions to safe limits", () => {
    const result = MarkdownCommandService.insertTable("", 0, 99, 99);

    expect(result.markdown.split("\n")[1].split("|").length - 2).toBe(8);
    expect(result.markdown.trim().split("\n")).toHaveLength(22);
  });

  it("converts tabular pasted text to a Markdown table", () => {
    const table = MarkdownCommandService.tableFromDelimitedText("Name\tRole\nAda\tWriter");

    expect(table).toBe("| Name | Role |\n| --- | --- |\n| Ada | Writer |");
  });

  it("does not treat plain multiline text as a pasted table", () => {
    expect(MarkdownCommandService.tableFromDelimitedText("Name Role\nAda Writer")).toBeNull();
  });

  it("inserts document, internal, and fenced code blocks", () => {
    const documentLink = MarkdownCommandService.insertSmartLink("See Notes", 4, 9, {
      kind: "document",
      target: "Notes",
    });
    expect(documentLink.markdown).toBe("See [[Notes]]");

    const internalLink = MarkdownCommandService.insertSmartLink("Jump", 0, 4, {
      kind: "internal",
      target: "My Section",
    });
    expect(internalLink.markdown).toBe("[Jump](#my-section)");

    const code = MarkdownCommandService.insertCodeBlock("const value = true;", 0, 19);
    expect(code.markdown).toContain("```\nconst value = true;\n```");
  });

  it("adds rows and columns to the table at the cursor", () => {
    const source = "| Name | Role |\n| --- | --- |\n| Ada | Writer |";
    const row = MarkdownCommandService.addTableRow(source, source.indexOf("Ada"));
    expect(row?.markdown).toBe("| Name | Role |\n| --- | --- |\n| Ada | Writer |\n|  |  |");

    const column = MarkdownCommandService.addTableColumn(source, source.indexOf("Role"));
    expect(column?.markdown).toBe(
      "| Name | Role | Column 3 |\n| --- | --- | --- |\n| Ada | Writer |  |",
    );
  });

  it("does not add rows or columns outside a valid table", () => {
    expect(MarkdownCommandService.addTableRow("No table here", 0)).toBeNull();
    expect(MarkdownCommandService.addTableColumn("| Looks | partial |", 3)).toBeNull();
  });

  it("continues and exits list items on enter", () => {
    const continued = MarkdownCommandService.continueListOnEnter("- First", 7, 7);
    expect(continued?.markdown).toBe("- First\n- ");
    expect(continued?.selectionStart).toBe(10);

    const numbered = MarkdownCommandService.continueListOnEnter("1. First", 8, 8);
    expect(numbered?.markdown).toBe("1. First\n2. ");

    const task = MarkdownCommandService.continueListOnEnter("- [x] Done", 10, 10);
    expect(task?.markdown).toBe("- [x] Done\n- [ ] ");

    const exited = MarkdownCommandService.continueListOnEnter("- ", 2, 2);
    expect(exited?.markdown).toBe("");
    expect(exited?.selectionStart).toBe(0);
  });

  it("indents and outdents selected list lines", () => {
    const source = "- One\n- Two\nPlain";
    const indented = MarkdownCommandService.indentListLines(source, 0, 11, "indent");
    expect(indented?.markdown).toBe("  - One\n  - Two\nPlain");

    const outdented = MarkdownCommandService.indentListLines(
      "  - One\n    - Two",
      0,
      16,
      "outdent",
    );
    expect(outdented?.markdown).toBe("- One\n  - Two");

    expect(MarkdownCommandService.indentListLines("Plain", 0, 5, "indent")).toBeNull();
  });

  it("inserts images with layout and captions", () => {
    const result = MarkdownCommandService.insertImage("Before", 6, {
      alt: "Desk",
      source: "desk.png",
      caption: "A writing desk",
      layout: "wide",
    });

    expect(result.markdown).toContain('![Desk](desk.png "A writing desk"){wide}');
  });
});
