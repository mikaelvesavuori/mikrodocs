import { MarkdownService } from "../index.js";

/**
 * @description Renders the inactive editor layer from raw Markdown while preserving raw source on the active line.
 */
export function renderPrettyMarkdown(markdown: string, activeLineIndex: number) {
  const lines = markdown.split("\n");
  const imageReferences = MarkdownService.getImageReferences(markdown);
  const linkReferences = MarkdownService.getLinkReferences(markdown);
  const frontmatterRange = getFrontmatterRange(lines);
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (frontmatterRange && index === frontmatterRange.start) {
      if (!isLineRangeActive(frontmatterRange.start, frontmatterRange.end, activeLineIndex)) {
        index = frontmatterRange.end + 1;
        continue;
      }

      blocks.push(
        ...renderSourceLines(
          lines,
          frontmatterRange.start,
          frontmatterRange.end,
          activeLineIndex,
          linkReferences,
        ),
      );
      index = frontmatterRange.end + 1;
      continue;
    }

    if (MarkdownService.isCodeFenceLine(lines[index])) {
      const start = index;
      const openingFence = lines[index];
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !MarkdownService.isCodeFenceLine(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      const hasClosingFence = index < lines.length;
      const end = hasClosingFence ? index : index - 1;
      if (hasClosingFence) {
        index += 1;
      }

      if (!isLineRangeActive(start, end, activeLineIndex)) {
        blocks.push(
          `<div class="pretty-code-block prose" data-source-start="${start}" data-source-end="${end}">${MarkdownService.renderCodeBlockHtml(codeLines.join("\n"), getCodeFenceLanguage(openingFence))}</div>`,
        );
        continue;
      }

      const sourceLines = [openingFence, ...codeLines, ...(hasClosingFence ? [lines[end]] : [])];
      blocks.push(
        ...sourceLines.map((line, offset) =>
          renderSourceLine(line, start + offset, activeLineIndex, linkReferences),
        ),
      );
      continue;
    }

    if (lines[index].trim() === "$$") {
      const start = index;
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") {
        index += 1;
      }
      const end = index < lines.length ? index : index - 1;
      if (index < lines.length) {
        index += 1;
      }

      if (!isLineRangeActive(start, end, activeLineIndex)) {
        blocks.push(
          `<div class="pretty-code-block prose" data-source-start="${start}" data-source-end="${end}">${MarkdownService.renderHtml(lines.slice(start, end + 1).join("\n"))}</div>`,
        );
        continue;
      }

      blocks.push(...renderSourceLines(lines, start, end, activeLineIndex, linkReferences));
      continue;
    }

    if (
      MarkdownService.isImageLine(lines[index]) &&
      !isLineRangeActive(index, index, activeLineIndex)
    ) {
      blocks.push(
        `<div class="pretty-image-block prose" data-source-start="${index}" data-source-end="${index}">${MarkdownService.renderImageLineHtml(lines[index], imageReferences)}</div>`,
      );
      index += 1;
      continue;
    }

    if (
      MarkdownService.isImageReferenceDefinition(lines[index]) &&
      !isLineRangeActive(index, index, activeLineIndex)
    ) {
      index += 1;
      continue;
    }

    if (/^\[\^[^\]]+]:/.test(lines[index])) {
      const start = index;
      index += 1;
      while (index < lines.length && /^( {2,}|\t)/.test(lines[index])) {
        index += 1;
      }
      const end = index - 1;
      if (!isLineRangeActive(start, end, activeLineIndex)) {
        continue;
      }

      blocks.push(...renderSourceLines(lines, start, end, activeLineIndex, linkReferences));
      continue;
    }

    if (isMarkdownListLine(lines[index])) {
      const start = index;
      const listLines: string[] = [];
      const firstMarker = parseMarkdownListMarker(lines[index]);
      let sawBlank = false;

      while (index < lines.length) {
        const marker = parseMarkdownListMarker(lines[index]);
        if (marker) {
          if (
            marker.indent <= (firstMarker?.indent ?? 0) &&
            marker.ordered !== firstMarker?.ordered
          ) {
            break;
          }

          listLines.push(lines[index]);
          sawBlank = false;
          index += 1;
          continue;
        }

        if (!lines[index].trim()) {
          listLines.push(lines[index]);
          sawBlank = true;
          index += 1;
          continue;
        }

        if (sawBlank && !isMarkdownListContinuationLine(lines[index])) {
          break;
        }

        if (isMarkdownListContinuationLine(lines[index]) || !isPrettyBlockBoundary(lines[index])) {
          listLines.push(lines[index]);
          sawBlank = false;
          index += 1;
          continue;
        }

        break;
      }

      if (!isLineRangeActive(start, index - 1, activeLineIndex)) {
        blocks.push(
          `<div class="pretty-list-block prose" data-source-start="${start}" data-source-end="${index - 1}">${MarkdownService.renderHtml(listLines.join("\n"))}</div>`,
        );
        continue;
      }

      blocks.push(
        ...listLines.map((line, offset) =>
          renderSourceLine(line, start + offset, activeLineIndex, linkReferences),
        ),
      );
      continue;
    }

    if (MarkdownService.isQuoteLine(lines[index])) {
      const start = index;
      const quoteLines: string[] = [];
      let sawBlank = false;

      while (index < lines.length) {
        if (MarkdownService.isQuoteLine(lines[index])) {
          quoteLines.push(lines[index]);
          sawBlank = !lines[index].replace(/^>\s?/, "").trim();
          index += 1;
          continue;
        }

        if (!lines[index].trim()) {
          quoteLines.push(lines[index]);
          sawBlank = true;
          index += 1;
          continue;
        }

        if (!sawBlank && !isPrettyQuoteBoundary(lines[index])) {
          quoteLines.push(lines[index]);
          index += 1;
          continue;
        }

        break;
      }

      if (!isLineRangeActive(start, index - 1, activeLineIndex)) {
        blocks.push(
          `<div class="pretty-quote-block prose" data-source-start="${start}" data-source-end="${index - 1}">${MarkdownService.renderQuoteBlockHtml(quoteLines)}</div>`,
        );
        continue;
      }

      blocks.push(
        ...quoteLines.map((line, offset) =>
          renderSourceLine(line, start + offset, activeLineIndex, linkReferences),
        ),
      );
      continue;
    }

    if (MarkdownService.isIndentedCodeLine(lines[index])) {
      const start = index;
      const codeLines: string[] = [];

      while (
        index < lines.length &&
        (MarkdownService.isIndentedCodeLine(lines[index]) || !lines[index].trim())
      ) {
        codeLines.push(MarkdownService.stripCodeIndent(lines[index]));
        index += 1;
      }

      if (!isLineRangeActive(start, index - 1, activeLineIndex)) {
        blocks.push(
          `<div class="pretty-code-block prose" data-source-start="${start}" data-source-end="${index - 1}">${MarkdownService.renderCodeBlockHtml(codeLines.join("\n").replace(/\n+$/, ""))}</div>`,
        );
        continue;
      }

      blocks.push(
        ...codeLines.map((_line, offset) =>
          renderSourceLine(lines[start + offset], start + offset, activeLineIndex, linkReferences),
        ),
      );
      continue;
    }

    if (isMarkdownTableLine(lines[index])) {
      const start = index;
      const tableLines: string[] = [];
      while (index < lines.length && isMarkdownTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }

      if (
        isMarkdownTableBlock(tableLines) &&
        !isLineRangeActive(start, index - 1, activeLineIndex)
      ) {
        blocks.push(
          `<div class="pretty-table-block prose" data-source-start="${start}" data-source-end="${index - 1}">${MarkdownService.renderHtml(tableLines.join("\n"))}</div>`,
        );
        continue;
      }

      blocks.push(
        ...tableLines.map((line, offset) =>
          renderSourceLine(line, start + offset, activeLineIndex, linkReferences),
        ),
      );
      continue;
    }

    if (!lines[index].trim() && index !== activeLineIndex) {
      blocks.push(
        `<div class="pretty-blank-line" data-source-start="${index}" data-source-end="${index}" aria-hidden="true"></div>`,
      );
      index += 1;
      continue;
    }

    const isActive = index === activeLineIndex;
    const prettyLineHtml = MarkdownService.renderPrettyLineHtml(
      lines[index],
      isActive,
      linkReferences,
    );
    const headingLevel = !isActive ? getPrettyHeadingLevel(prettyLineHtml) : null;
    const previousNonBlankBlock =
      [...blocks].reverse().find((block) => !block.includes("pretty-blank-line")) ?? "";
    const followsHeading =
      headingLevel !== null && previousNonBlankBlock.includes("pretty-heading-line");
    const lineClass =
      headingLevel !== null
        ? `pretty-line pretty-heading-line pretty-heading-line-${headingLevel}${followsHeading ? " pretty-heading-line-after-heading" : ""}`
        : "pretty-line";
    blocks.push(
      `<div class="${lineClass}" data-source-start="${index}" data-source-end="${index}" data-active="${String(isActive)}">${prettyLineHtml}</div>`,
    );
    index += 1;
  }

  return blocks.join("");
}

function isMarkdownTableLine(line: string) {
  return line.includes("|");
}

function isMarkdownTableBlock(lines: string[]) {
  return (
    lines.length > 1 &&
    lines.some((line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
  );
}

function isMarkdownListLine(line: string) {
  return parseMarkdownListMarker(line) !== null;
}

function parseMarkdownListMarker(line: string) {
  const marker = line.match(/^([ \t]*)([-*+]|\d+\.)([ \t]+)(.*)$/);
  if (!marker) {
    return null;
  }

  return {
    indent: marker[1].replaceAll("\t", "    ").length,
    ordered: /\d+\./.test(marker[2]),
  };
}

function isMarkdownListContinuationLine(line: string) {
  return /^( {2,}|\t)/.test(line);
}

function isPrettyBlockBoundary(line: string) {
  return (
    MarkdownService.isCodeFenceLine(line) ||
    MarkdownService.isQuoteLine(line) ||
    MarkdownService.isImageLine(line) ||
    MarkdownService.isImageReferenceDefinition(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*---+\s*$/.test(line) ||
    isMarkdownTableLine(line)
  );
}

function isPrettyQuoteBoundary(line: string) {
  return (
    MarkdownService.isCodeFenceLine(line) ||
    isMarkdownListLine(line) ||
    MarkdownService.isImageLine(line) ||
    MarkdownService.isImageReferenceDefinition(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*---+\s*$/.test(line) ||
    isMarkdownTableLine(line)
  );
}

function isLineRangeActive(start: number, end: number, activeLineIndex: number) {
  return activeLineIndex >= start && activeLineIndex <= end;
}

function getCodeFenceLanguage(fenceLine: string) {
  return fenceLine.trim().replace(/^```/, "").trim();
}

function renderSourceLines(
  lines: string[],
  start: number,
  end: number,
  activeLineIndex: number,
  linkReferences: Map<string, { target: string; title: string }>,
) {
  return lines
    .slice(start, end + 1)
    .map((line, offset) => renderSourceLine(line, start + offset, activeLineIndex, linkReferences));
}

function renderSourceLine(
  line: string,
  lineIndex: number,
  activeLineIndex: number,
  linkReferences: Map<string, { target: string; title: string }>,
) {
  return `<div class="pretty-line" data-source-start="${lineIndex}" data-source-end="${lineIndex}" data-active="${String(lineIndex === activeLineIndex)}">${MarkdownService.renderPrettyLineHtml(line, lineIndex === activeLineIndex, linkReferences)}</div>`;
}

function getFrontmatterRange(lines: string[]) {
  if (lines[0]?.trim() !== "---") {
    return null;
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return end > 0 ? { start: 0, end } : null;
}

function getPrettyHeadingLevel(html: string) {
  const match = html.match(/pretty-heading-(\d)/);
  return match ? Number(match[1]) : null;
}
