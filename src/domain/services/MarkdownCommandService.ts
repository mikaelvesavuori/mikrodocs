import type { ImageLayout } from "../../interfaces/Document.js";

export interface InsertImageOptions {
  source?: string;
  alt?: string;
  caption?: string;
  layout?: ImageLayout;
}

export interface InsertLinkOptions {
  label?: string;
  target?: string;
  kind?: "external" | "internal" | "document";
}

/**
 * @description Applies common writing commands to selected Markdown text without depending on the DOM.
 */
export class MarkdownCommandService {
  static toggleWrap(source: string, selectionStart: number, selectionEnd: number, marker = "**") {
    const selected = source.slice(selectionStart, selectionEnd);
    const before = source.slice(0, selectionStart);
    const after = source.slice(selectionEnd);
    const hasWrap = selected.startsWith(marker) && selected.endsWith(marker);
    const replacement =
      hasWrap && selected.length >= marker.length * 2
        ? selected.slice(marker.length, selected.length - marker.length)
        : `${marker}${selected || "text"}${marker}`;

    return {
      markdown: `${before}${replacement}${after}`,
      selectionStart: selectionStart + (hasWrap ? 0 : marker.length),
      selectionEnd: selectionStart + replacement.length - (hasWrap ? 0 : marker.length),
    };
  }

  static prefixLines(source: string, selectionStart: number, selectionEnd: number, prefix: string) {
    const before = source.slice(0, selectionStart);
    const selected = source.slice(selectionStart, selectionEnd) || "New line";
    const after = source.slice(selectionEnd);
    const replacement = selected
      .split("\n")
      .map(
        (line) =>
          `${prefix}${line.replace(/^#{1,6}\s+|^[-*]\s+\[[ xX]\]\s+|^[-*]\s+|^\d+\.\s+|^>\s?/, "")}`,
      )
      .join("\n");

    return {
      markdown: `${before}${replacement}${after}`,
      selectionStart,
      selectionEnd: selectionStart + replacement.length,
    };
  }

  static insertLink(
    source: string,
    selectionStart: number,
    selectionEnd: number,
    target = "https://",
  ) {
    const selected = source.slice(selectionStart, selectionEnd) || "link";
    const replacement = `[${selected}](${target})`;

    return {
      markdown: `${source.slice(0, selectionStart)}${replacement}${source.slice(selectionEnd)}`,
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1 + selected.length,
    };
  }

  static insertSmartLink(
    source: string,
    selectionStart: number,
    selectionEnd: number,
    options: InsertLinkOptions = {},
  ) {
    const selected = source.slice(selectionStart, selectionEnd);
    const label = options.label?.trim() || selected || "link";
    const rawTarget = options.target?.trim() || "";
    const kind = options.kind ?? "external";
    const target =
      kind === "internal"
        ? MarkdownCommandService.normalizeInternalTarget(rawTarget || label)
        : rawTarget || (kind === "external" ? "https://" : label);
    const replacement =
      kind === "document" && label === target ? `[[${target}]]` : `[${label}](${target})`;

    return {
      markdown: `${source.slice(0, selectionStart)}${replacement}${source.slice(selectionEnd)}`,
      selectionStart: selectionStart + (replacement.startsWith("[[") ? 2 : 1),
      selectionEnd: selectionStart + (replacement.startsWith("[[") ? 2 : 1) + label.length,
    };
  }

  static insertTable(source: string, insertionPoint: number, columns = 3, rows = 2) {
    const safeColumns = Math.max(1, Math.min(8, Math.floor(columns)));
    const safeRows = Math.max(0, Math.min(20, Math.floor(rows)));
    const header = Array.from({ length: safeColumns }, (_, index) => `Column ${index + 1}`);
    const body = Array.from({ length: safeRows }, () =>
      Array.from({ length: safeColumns }, () => ""),
    );
    const table = `\n${MarkdownCommandService.createTable(header, body)}\n`;

    return {
      markdown: `${source.slice(0, insertionPoint)}${table}${source.slice(insertionPoint)}`,
      selectionStart: insertionPoint + 3,
      selectionEnd: insertionPoint + 3 + header[0].length,
    };
  }

  static insertImage(source: string, insertionPoint: number, options: InsertImageOptions = {}) {
    const alt = options.alt?.trim() || "Image description";
    const imageSource = options.source?.trim() || "image-url";
    const caption = options.caption?.trim() || "Caption";
    const layout = options.layout ?? "contained";
    const image = `\n![${alt}](${imageSource} "${caption}"){${layout}}\n`;

    return {
      markdown: `${source.slice(0, insertionPoint)}${image}${source.slice(insertionPoint)}`,
      selectionStart: insertionPoint + 3,
      selectionEnd: insertionPoint + 3 + alt.length,
    };
  }

  static insertCodeBlock(source: string, selectionStart: number, selectionEnd: number) {
    const selected = source.slice(selectionStart, selectionEnd) || "code";
    const replacement = `\n\`\`\`\n${selected}\n\`\`\`\n`;

    return {
      markdown: `${source.slice(0, selectionStart)}${replacement}${source.slice(selectionEnd)}`,
      selectionStart: selectionStart + 5,
      selectionEnd: selectionStart + 5 + selected.length,
    };
  }

  static insertDivider(source: string, insertionPoint: number) {
    const divider = "\n---\n";

    return {
      markdown: `${source.slice(0, insertionPoint)}${divider}${source.slice(insertionPoint)}`,
      selectionStart: insertionPoint + divider.length,
      selectionEnd: insertionPoint + divider.length,
    };
  }

  static addTableRow(source: string, cursorPosition: number) {
    const table = MarkdownCommandService.findTableAtCursor(source, cursorPosition);
    if (!table) {
      return null;
    }

    const columnCount = MarkdownCommandService.parseTableRow(table.lines[0]).length;
    const nextRow = MarkdownCommandService.formatTableRow(
      Array.from({ length: columnCount }, () => ""),
    );
    const currentLine = Math.max(table.relativeCursorLine, 1);
    const insertAtLine = Math.min(table.lines.length, Math.max(2, currentLine + 1));
    const nextLines = table.lines.toSpliced(insertAtLine, 0, nextRow);
    return MarkdownCommandService.replaceTableLines(source, table, nextLines, insertAtLine);
  }

  static addTableColumn(source: string, cursorPosition: number) {
    const table = MarkdownCommandService.findTableAtCursor(source, cursorPosition);
    if (!table) {
      return null;
    }

    const nextLines = table.lines.map((line, index) => {
      const cells = MarkdownCommandService.parseTableRow(line);
      if (index === 0) {
        cells.push(`Column ${cells.length + 1}`);
      } else if (MarkdownCommandService.isTableSeparator(line)) {
        cells.push("---");
      } else {
        cells.push("");
      }

      return MarkdownCommandService.formatTableRow(cells);
    });

    return MarkdownCommandService.replaceTableLines(
      source,
      table,
      nextLines,
      table.relativeCursorLine,
    );
  }

  static createTable(header: string[], rows: string[][]) {
    const columnCount = Math.max(1, header.length, ...rows.map((row) => row.length));
    const normalizedHeader = MarkdownCommandService.normalizeRow(header, columnCount, "Column");
    const separator = Array.from({ length: columnCount }, () => "---");
    const normalizedRows = rows.map((row) => MarkdownCommandService.normalizeRow(row, columnCount));

    return [
      MarkdownCommandService.formatTableRow(normalizedHeader),
      MarkdownCommandService.formatTableRow(separator),
      ...normalizedRows.map((row) => MarkdownCommandService.formatTableRow(row)),
    ].join("\n");
  }

  static tableFromDelimitedText(text: string) {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    if (lines.length < 2 || !lines.some((line) => line.includes("\t"))) {
      return null;
    }

    const rows = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
    const [header, ...body] = rows;
    return MarkdownCommandService.createTable(header, body);
  }

  static continueListOnEnter(source: string, selectionStart: number, selectionEnd: number) {
    if (selectionStart !== selectionEnd) {
      return null;
    }

    const line = MarkdownCommandService.getLineAt(source, selectionStart);
    const beforeCursor = source.slice(line.start, selectionStart);
    const afterCursor = source.slice(selectionStart, line.end);
    const match = beforeCursor.match(/^(\s*)((?:[-*+]|\d+[.)]))\s+(\[[ xX]\]\s+)?(.*)$/);
    if (!match) {
      return null;
    }

    const [, indent, marker, taskMarker = "", textBeforeCursor] = match;
    if (!textBeforeCursor.trim() && !afterCursor.trim()) {
      const markdown = `${source.slice(0, line.start)}${source.slice(line.end)}`;
      return {
        markdown,
        selectionStart: line.start,
        selectionEnd: line.start,
      };
    }

    const nextMarker = /^\d+[.)]$/.test(marker)
      ? marker.replace(/\d+/, (value) => String(Number(value) + 1))
      : marker;
    const inserted = `\n${indent}${nextMarker} ${taskMarker ? "[ ] " : ""}`;
    const cursor = selectionStart + inserted.length;

    return {
      markdown: `${source.slice(0, selectionStart)}${inserted}${source.slice(selectionStart)}`,
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  static indentListLines(
    source: string,
    selectionStart: number,
    selectionEnd: number,
    direction: "indent" | "outdent",
  ) {
    const range = MarkdownCommandService.getLineRange(source, selectionStart, selectionEnd);
    const lines = range.text.split("\n");
    const changedLines = lines.map((line) => {
      if (!/^(\s*)(?:[-*+]|\d+[.)])\s+/.test(line)) {
        return line;
      }

      return direction === "indent" ? `  ${line}` : line.replace(/^ {1,2}/, "");
    });

    if (changedLines.every((line, index) => line === lines[index])) {
      return null;
    }

    const replacement = changedLines.join("\n");
    const delta = replacement.length - range.text.length;
    return {
      markdown: `${source.slice(0, range.start)}${replacement}${source.slice(range.end)}`,
      selectionStart: Math.max(range.start, selectionStart + (direction === "indent" ? 2 : -2)),
      selectionEnd: Math.max(range.start, selectionEnd + delta),
    };
  }

  private static normalizeRow(row: string[], columnCount: number, fallback = "") {
    return Array.from(
      { length: columnCount },
      (_, index) => row[index]?.trim() || (fallback ? `${fallback} ${index + 1}` : ""),
    );
  }

  private static formatTableRow(row: string[]) {
    return `| ${row.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`;
  }

  private static normalizeInternalTarget(value: string) {
    const trimmed = value.trim();
    if (trimmed.startsWith("#")) {
      return trimmed;
    }

    const slug =
      trimmed
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replaceAll(/\s+/g, "-")
        .slice(0, 80) || "section";

    return `#${slug}`;
  }

  private static findTableAtCursor(source: string, cursorPosition: number) {
    const lines = source.split("\n");
    const cursorLine = source.slice(0, cursorPosition).split("\n").length - 1;
    if (!MarkdownCommandService.looksLikeTableLine(lines[cursorLine] ?? "")) {
      return null;
    }

    let startLine = cursorLine;
    let endLine = cursorLine;
    while (startLine > 0 && MarkdownCommandService.looksLikeTableLine(lines[startLine - 1])) {
      startLine -= 1;
    }
    while (
      endLine < lines.length - 1 &&
      MarkdownCommandService.looksLikeTableLine(lines[endLine + 1])
    ) {
      endLine += 1;
    }

    const tableLines = lines.slice(startLine, endLine + 1);
    if (tableLines.length < 2 || !tableLines.some(MarkdownCommandService.isTableSeparator)) {
      return null;
    }

    return {
      lines: tableLines,
      startLine,
      endLine,
      relativeCursorLine: cursorLine - startLine,
    };
  }

  private static replaceTableLines(
    source: string,
    table: { startLine: number; endLine: number },
    nextLines: string[],
    selectionLine: number,
  ) {
    const lines = source.split("\n");
    const nextDocumentLines = [
      ...lines.slice(0, table.startLine),
      ...nextLines,
      ...lines.slice(table.endLine + 1),
    ];
    const selectionStart =
      nextDocumentLines.slice(0, table.startLine + selectionLine).join("\n").length +
      (table.startLine + selectionLine > 0 ? 1 : 0);

    return {
      markdown: nextDocumentLines.join("\n"),
      selectionStart,
      selectionEnd: selectionStart,
    };
  }

  private static looksLikeTableLine(line: string) {
    return line.includes("|");
  }

  private static isTableSeparator(line: string) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  private static parseTableRow(line: string) {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  private static getLineAt(source: string, position: number) {
    const start = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
    const nextBreak = source.indexOf("\n", position);
    const end = nextBreak >= 0 ? nextBreak : source.length;
    return { start, end, text: source.slice(start, end) };
  }

  private static getLineRange(source: string, selectionStart: number, selectionEnd: number) {
    const start = source.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
    const endBreak =
      selectionEnd > selectionStart && source[selectionEnd - 1] === "\n"
        ? selectionEnd - 1
        : source.indexOf("\n", selectionEnd);
    const end = endBreak >= 0 ? endBreak : source.length;
    return { start, end, text: source.slice(start, end) };
  }
}
