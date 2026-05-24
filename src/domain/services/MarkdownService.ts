import type {
  DocumentSearchResult,
  DocumentStats,
  HeadingInfo,
  LinkInfo,
  ParsedDocument,
} from "../../interfaces/Document.js";

const markdownEscapePattern = /[&<>"']/g;
const markdownEscapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

type ImageReference = {
  source: string;
  caption: string;
};

type LinkReference = {
  target: string;
  title: string;
};

type FootnoteDefinition = {
  id: string;
  text: string;
};

type ListMarker = {
  content: string;
  contentIndent: number;
  indent: number;
  ordered: boolean;
  value: number | null;
};

type ListItemBlock = {
  lines: string[];
  value: number | null;
};

/**
 * @description Parses and renders the supported Markdown subset while keeping raw Markdown as the source of truth.
 */
export class MarkdownService {
  static deriveTitle(markdown: string) {
    const lines = markdown.split("\n");
    const heading = lines
      .map((line, index) => {
        const atx = MarkdownService.parseAtxHeading(line);
        if (atx) {
          return atx.text;
        }

        const setext = MarkdownService.parseSetextHeading(line, lines[index + 1] ?? "");
        return setext?.text;
      })
      .find(Boolean);

    if (heading) {
      return heading;
    }

    const firstText = markdown
      .split("\n")
      .map((line) => line.replaceAll(/[#*_`>\-[\]()]/g, "").trim())
      .find(Boolean);

    return firstText?.slice(0, 80) || "Untitled";
  }

  static extractTags(markdown: string) {
    const tags = new Set<string>();
    for (const match of markdown.matchAll(/(^|\s)#([A-Za-z0-9_-]{2,40})\b/g)) {
      tags.add(match[2].toLowerCase());
    }

    return [...tags].sort();
  }

  static getStats(markdown: string): DocumentStats {
    const plainText = MarkdownService.stripMarkdown(markdown);
    const words = plainText.match(/\b[\p{L}\p{N}'-]+\b/gu)?.length ?? 0;
    const characters = plainText.replaceAll(/\s/g, "").length;

    return {
      words,
      characters,
      readingMinutes: Math.max(1, Math.ceil(words / 225)),
    };
  }

  static getOutline(markdown: string): HeadingInfo[] {
    const lines = markdown.split("\n");
    const outline: HeadingInfo[] = [];
    const frontmatterRange = MarkdownService.getFrontmatterRange(lines);
    const slug = MarkdownService.createSlugger();
    lines.forEach((line, index) => {
      if (frontmatterRange && index >= frontmatterRange.start && index <= frontmatterRange.end) {
        return;
      }

      const heading =
        MarkdownService.parseAtxHeading(line) ??
        MarkdownService.parseSetextHeading(line, lines[index + 1] ?? "");
      if (!heading) {
        return;
      }

      outline.push({
        id: slug(heading.text),
        level: heading.level,
        text: heading.text,
        line: index + 1,
      });
    });

    return outline;
  }

  static getLinks(markdown: string): LinkInfo[] {
    const links: LinkInfo[] = [];
    const references = MarkdownService.getLinkReferences(markdown);
    const lines = markdown.split("\n");
    const frontmatterRange = MarkdownService.getFrontmatterRange(lines);
    lines.forEach((line, index) => {
      if (
        (frontmatterRange && index >= frontmatterRange.start && index <= frontmatterRange.end) ||
        MarkdownService.parseReferenceDefinition(line) ||
        MarkdownService.parseFootnoteDefinition(line)
      ) {
        return;
      }

      for (const match of line.matchAll(/(?<!!)\[([^\]]+)]\(([^)]+)\)/g)) {
        const { target } = MarkdownService.parseInlineLinkTarget(match[2]);
        links.push({
          label: match[1].trim(),
          target,
          kind: MarkdownService.getLinkKind(target),
          line: index + 1,
        });
      }

      for (const match of line.matchAll(/(?<!!)\[([^\]]+)]\s*\[([^\]]*)]/g)) {
        const label = match[1].trim();
        const target = references.get((match[2] || label).toLowerCase())?.target;
        if (!target) {
          continue;
        }

        links.push({
          label,
          target,
          kind: MarkdownService.getLinkKind(target),
          line: index + 1,
        });
      }

      for (const match of line.matchAll(/<((?:https?|ftp):\/\/[^>\s]+)>/g)) {
        links.push({
          label: match[1].trim(),
          target: match[1].trim(),
          kind: "external",
          line: index + 1,
        });
      }

      for (const match of line.matchAll(/<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>/g)) {
        links.push({
          label: match[1].trim(),
          target: `mailto:${match[1].trim()}`,
          kind: "external",
          line: index + 1,
        });
      }

      for (const match of line.matchAll(/\[\[([^\]]+)]]/g)) {
        links.push({
          label: match[1].trim(),
          target: match[1].trim(),
          kind: "document",
          line: index + 1,
        });
      }
    });

    return links;
  }

  static searchLines(markdown: string, query: string): DocumentSearchResult[] {
    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }

    return markdown
      .split("\n")
      .map((line, index) => {
        const plainLine = MarkdownService.stripMarkdown(line);
        const matchStart = plainLine.toLowerCase().indexOf(term);
        if (matchStart < 0) {
          return null;
        }

        return {
          line: index + 1,
          text: plainLine || line,
          matchStart,
          matchEnd: matchStart + term.length,
        };
      })
      .filter((result): result is DocumentSearchResult => result !== null);
  }

  static parse(markdown: string): ParsedDocument {
    return {
      html: MarkdownService.renderHtml(markdown),
      outline: MarkdownService.getOutline(markdown),
      links: MarkdownService.getLinks(markdown),
      stats: MarkdownService.getStats(markdown),
    };
  }

  static withTitle(markdown: string, title: string) {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return markdown;
    }

    const [firstLine = "", secondLine = ""] = markdown.trimStart().split("\n");
    const setextTitle = MarkdownService.parseSetextHeading(firstLine, secondLine);
    const existingTitle =
      MarkdownService.parseAtxHeading(firstLine)?.text ??
      (setextTitle?.level === 1 ? setextTitle.text : undefined);
    if (existingTitle?.trim().toLowerCase() === cleanTitle.toLowerCase()) {
      return markdown;
    }

    return [`# ${cleanTitle}`, markdown.trimStart()].filter(Boolean).join("\n\n");
  }

  static renderPrettyLineHtml(
    line: string,
    isActive = false,
    linkReferences = new Map<string, LinkReference>(),
  ) {
    if (isActive) {
      return `<span class="pretty-line-source">${MarkdownService.escapeHtml(line) || " "}</span>`;
    }

    if (!line.trim()) {
      return " ";
    }

    const atxHeading = MarkdownService.parseAtxHeading(line);
    const heading = line.match(/^(#{1,6})(\s+)(.+)$/);
    if (atxHeading && heading) {
      return `<span class="pretty-syntax">${MarkdownService.escapeHtml(`${heading[1]}${heading[2]}`)}</span><span class="pretty-heading pretty-heading-${atxHeading.level}">${MarkdownService.renderInline(atxHeading.text, linkReferences)}</span>`;
    }

    if (heading) {
      return `<span class="pretty-syntax">${MarkdownService.escapeHtml(`${heading[1]}${heading[2]}`)}</span><span class="pretty-heading pretty-heading-${heading[1].length}">${MarkdownService.renderInline(heading[3], linkReferences)}</span>`;
    }

    const unorderedList = line.match(/^(\s*)([-*+])(\s+)(.+)$/);
    if (unorderedList) {
      const checklist = unorderedList[4].match(/^\[([ xX])]\s+(.+)$/);
      if (checklist) {
        return `${MarkdownService.escapeHtml(unorderedList[1])}<span class="pretty-list-marker">${checklist[1].toLowerCase() === "x" ? "☑" : "☐"}</span><span class="pretty-syntax">${MarkdownService.escapeHtml(`${unorderedList[2]}${unorderedList[3]}`)}</span>${MarkdownService.renderInline(checklist[2], linkReferences)}`;
      }

      return `${MarkdownService.escapeHtml(unorderedList[1])}<span class="pretty-list-marker">•</span><span class="pretty-syntax">${MarkdownService.escapeHtml(`${unorderedList[2]}${unorderedList[3]}`)}</span>${MarkdownService.renderInline(unorderedList[4], linkReferences)}`;
    }

    const orderedList = line.match(/^(\s*)(\d+\.)(\s+)(.+)$/);
    if (orderedList) {
      return `${MarkdownService.escapeHtml(orderedList[1])}<span class="pretty-list-marker">${MarkdownService.escapeHtml(orderedList[2])}</span><span class="pretty-syntax">${MarkdownService.escapeHtml(orderedList[3])}</span>${MarkdownService.renderInline(orderedList[4], linkReferences)}`;
    }

    const quote = line.match(/^(>\s?)(.+)$/);
    if (quote) {
      return `<span class="pretty-syntax">${MarkdownService.escapeHtml(quote[1])}</span><span class="pretty-quote">${MarkdownService.renderInline(quote[2], linkReferences)}</span>`;
    }

    if (/^\s*---+\s*$/.test(line)) {
      return '<span class="pretty-divider"></span>';
    }

    const image = line.match(
      /^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)(?:\{(small|wide|contained)})?$/,
    );
    if (image) {
      return MarkdownService.renderImageLineHtml(line);
    }

    if (line.includes("|")) {
      return MarkdownService.renderPrettyTableLine(line);
    }

    return MarkdownService.renderInline(line, linkReferences);
  }

  static getImageReferences(markdown: string) {
    const references = new Map<string, ImageReference>();
    for (const line of markdown.split("\n")) {
      const reference = MarkdownService.parseImageReferenceDefinition(line);
      if (reference) {
        references.set(reference.id.toLowerCase(), {
          source: reference.source,
          caption: reference.caption,
        });
      }
    }

    return references;
  }

  static getLinkReferences(markdown: string) {
    const references = new Map<string, LinkReference>();
    for (const line of markdown.split("\n")) {
      const reference = MarkdownService.parseReferenceDefinition(line);
      if (reference) {
        references.set(reference.id.toLowerCase(), {
          target: reference.target,
          title: reference.title,
        });
      }
    }

    return references;
  }

  static getFootnoteDefinitions(markdown: string) {
    const definitions = new Map<string, FootnoteDefinition>();
    const lines = markdown.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const definition = MarkdownService.parseFootnoteDefinition(lines[index]);
      if (!definition) {
        continue;
      }

      const continuation: string[] = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length && /^( {2,}|\t)/.test(lines[nextIndex])) {
        continuation.push(lines[nextIndex].replace(/^( {2,}|\t)/, ""));
        nextIndex += 1;
      }

      definitions.set(definition.id.toLowerCase(), {
        id: definition.id,
        text: [definition.text, ...continuation].join("\n").trim(),
      });
      index = nextIndex - 1;
    }

    return definitions;
  }

  static isImageLine(line: string) {
    return (
      /^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)(?:\{(small|wide|contained)})?$/.test(line) ||
      /^!\[([^\]]*)]\s*\[([^\]]*)](?:\{(small|wide|contained)})?$/.test(line)
    );
  }

  static isImageReferenceDefinition(line: string) {
    return MarkdownService.parseImageReferenceDefinition(line) !== null;
  }

  static renderImageLineHtml(line: string, references = new Map<string, ImageReference>()) {
    const image = MarkdownService.parseImageLine(line, references);
    if (!image) {
      return MarkdownService.renderInline(line);
    }

    return MarkdownService.renderImageFigure(image.alt, image.source, image.caption, image.layout);
  }

  static renderHtml(
    markdown: string,
    inheritedLinkReferences?: Map<string, LinkReference>,
    inheritedImageReferences?: Map<string, ImageReference>,
  ) {
    const lines = markdown.split("\n");
    const imageReferences =
      inheritedImageReferences ?? MarkdownService.getImageReferences(markdown);
    const linkReferences = inheritedLinkReferences ?? MarkdownService.getLinkReferences(markdown);
    const footnoteDefinitions = MarkdownService.getFootnoteDefinitions(markdown);
    const footnoteReferences = new Set<string>();
    const frontmatterRange = MarkdownService.getFrontmatterRange(lines);
    const outline = MarkdownService.getOutline(markdown);
    const slug = MarkdownService.createSlugger();
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let table: string[] = [];
    let code: string[] = [];
    let codeLanguage = "";
    let inCode = false;

    const flushParagraph = () => {
      if (paragraph.length) {
        blocks.push(MarkdownService.renderParagraph(paragraph, linkReferences, footnoteReferences));
        paragraph = [];
      }
    };
    const flushTable = () => {
      if (table.length) {
        blocks.push(MarkdownService.renderTable(table, linkReferences));
        table = [];
      }
    };
    const flushAll = () => {
      flushParagraph();
      flushTable();
    };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (
        frontmatterRange &&
        lineIndex >= frontmatterRange.start &&
        lineIndex <= frontmatterRange.end
      ) {
        continue;
      }

      const fence = line.trim().match(/^```([^`]*)$/);
      if (fence) {
        if (inCode) {
          blocks.push(MarkdownService.renderCodeBlockHtml(code.join("\n"), codeLanguage));
          code = [];
          codeLanguage = "";
          inCode = false;
        } else {
          flushAll();
          codeLanguage = fence[1].trim();
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        code.push(line);
        continue;
      }

      if (line.trim() === "$$") {
        flushAll();
        const mathLines: string[] = [];
        lineIndex += 1;
        while (lineIndex < lines.length && lines[lineIndex].trim() !== "$$") {
          mathLines.push(lines[lineIndex]);
          lineIndex += 1;
        }
        blocks.push(MarkdownService.renderMathBlockHtml(mathLines.join("\n")));
        continue;
      }

      if (!line.trim()) {
        flushAll();
        continue;
      }

      if (MarkdownService.isImageReferenceDefinition(line)) {
        flushAll();
        continue;
      }

      if (MarkdownService.parseFootnoteDefinition(line)) {
        flushAll();
        while (lineIndex + 1 < lines.length && /^( {2,}|\t)/.test(lines[lineIndex + 1])) {
          lineIndex += 1;
        }
        continue;
      }

      if (/^\[\[toc]]$/i.test(line.trim())) {
        flushAll();
        blocks.push(MarkdownService.renderTableOfContents(outline));
        continue;
      }

      const setextHeading = MarkdownService.parseSetextHeading(line, lines[lineIndex + 1] ?? "");
      if (setextHeading) {
        flushAll();
        blocks.push(
          `<h${setextHeading.level} id="${slug(setextHeading.text)}">${MarkdownService.renderInline(setextHeading.text, linkReferences, footnoteReferences)}</h${setextHeading.level}>`,
        );
        lineIndex += 1;
        continue;
      }

      const heading = MarkdownService.parseAtxHeading(line);
      if (heading) {
        flushAll();
        blocks.push(
          `<h${heading.level} id="${slug(heading.text)}">${MarkdownService.renderInline(heading.text, linkReferences, footnoteReferences)}</h${heading.level}>`,
        );
        continue;
      }

      if (MarkdownService.isIndentedCodeLine(line)) {
        flushAll();
        const codeLines: string[] = [];
        while (
          lineIndex < lines.length &&
          (MarkdownService.isIndentedCodeLine(lines[lineIndex]) || !lines[lineIndex].trim())
        ) {
          codeLines.push(MarkdownService.stripCodeIndent(lines[lineIndex]));
          lineIndex += 1;
        }
        lineIndex -= 1;
        blocks.push(MarkdownService.renderCodeBlockHtml(codeLines.join("\n").replace(/\n+$/, "")));
        continue;
      }

      const image = MarkdownService.parseImageLine(line, imageReferences);
      if (image) {
        flushAll();
        blocks.push(
          MarkdownService.renderImageFigure(image.alt, image.source, image.caption, image.layout),
        );
        continue;
      }

      const listMarker = MarkdownService.parseListMarker(line);
      if (listMarker) {
        flushAll();
        const listBlock = MarkdownService.collectListBlock(lines, lineIndex);
        blocks.push(
          MarkdownService.renderListBlockHtml(
            listBlock.lines,
            listBlock.ordered,
            linkReferences,
            imageReferences,
            footnoteReferences,
          ),
        );
        lineIndex = listBlock.nextIndex - 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        flushAll();
        const quoteBlock = MarkdownService.collectQuoteBlock(lines, lineIndex);
        blocks.push(MarkdownService.renderQuoteBlockHtml(quoteBlock.lines, linkReferences));
        lineIndex = quoteBlock.nextIndex - 1;
        continue;
      }

      if (/^\s*---+\s*$/.test(line)) {
        flushAll();
        blocks.push("<hr />");
        continue;
      }

      if (line.includes("|")) {
        flushParagraph();
        table.push(line);
        continue;
      }

      paragraph.push(line.trimStart());
    }

    if (inCode) {
      blocks.push(MarkdownService.renderCodeBlockHtml(code.join("\n"), codeLanguage));
    }

    flushAll();

    const footnotes = MarkdownService.renderFootnotes(
      footnoteReferences,
      footnoteDefinitions,
      linkReferences,
    );
    if (footnotes) {
      blocks.push(footnotes);
    }

    return blocks.join("\n");
  }

  static stripMarkdown(markdown: string) {
    return markdown
      .replaceAll(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/g, " ")
      .replaceAll(/```[\s\S]*?```/g, "")
      .replaceAll(/\$\$[\s\S]*?\$\$/g, " ")
      .replaceAll(/!\[([^\]]*)]\([^)]+\)/g, "$1")
      .replaceAll(/!\[([^\]]*)]\s*\[[^\]]*]/g, "$1")
      .replaceAll(/^\[[^\]]+]:\s+\S+(?:\s+["'(].+["')])?\s*$/gm, " ")
      .replaceAll(/^\[\^[^\]]+]:\s+.*$/gm, " ")
      .replaceAll(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replaceAll(/\[([^\]]+)]\s*\[[^\]]*]/g, "$1")
      .replaceAll(/\[\[([^\]]+)]]/g, "$1")
      .replaceAll(/\[\^[^\]]+]/g, " ")
      .replaceAll(/\[\[toc]]/gi, " ")
      .replaceAll(/~~([^~]+)~~/g, "$1")
      .replaceAll(/\$([^$\n]+)\$/g, "$1")
      .replaceAll(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, " ")
      .replaceAll(/[#>*_`|~-]/g, " ")
      .replaceAll(/\\([\\`*{}[\]()#+\-.!_>])/g, "$1")
      .replaceAll(/<((?:https?|ftp):\/\/[^>\s]+)>/g, "$1")
      .replaceAll(/<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>/g, "$1")
      .replaceAll(/\s+/g, " ")
      .trim();
  }

  static isIndentedCodeLine(line: string) {
    return /^( {4}|\t)/.test(line);
  }

  static stripCodeIndent(line: string) {
    return line.replace(/^( {4}|\t)/, "");
  }

  static isCodeFenceLine(line: string) {
    return /^```[^`]*$/.test(line.trim());
  }

  static isQuoteLine(line: string) {
    return /^>\s?/.test(line) || line.trim() === ">";
  }

  static renderQuoteBlockHtml(lines: string[], linkReferences = new Map<string, LinkReference>()) {
    const quoteLines = lines
      .map((line) => line.replace(/^>\s?/, ""))
      .join("\n")
      .trimEnd()
      .split("\n");
    const callout = quoteLines[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*(.*)$/i);
    const markdown = (callout ? [callout[2], ...quoteLines.slice(1)] : quoteLines)
      .filter((line, index) => index > 0 || line.trim())
      .join("\n")
      .trimEnd();
    const html = MarkdownService.renderHtml(markdown, linkReferences);

    if (!callout) {
      return `<blockquote>${html}</blockquote>`;
    }

    const kind = callout[1].toLowerCase();
    const title = `${callout[1][0].toUpperCase()}${callout[1].slice(1).toLowerCase()}`;
    return `<aside class="md-callout md-callout-${kind}"><strong>${title}</strong>${html}</aside>`;
  }

  static renderCodeBlockHtml(code: string, language = "") {
    const cleanLanguage = language.trim();
    if (cleanLanguage.toLowerCase() === "mermaid") {
      return `<figure class="md-diagram md-diagram-mermaid">
      <figcaption>Mermaid</figcaption>
      <pre>${MarkdownService.escapeHtml(code)}</pre>
    </figure>`;
    }

    const languageClass = cleanLanguage
      ? ` class="language-${MarkdownService.escapeAttribute(cleanLanguage)}"`
      : "";
    return `<figure class="md-code-block">
      ${cleanLanguage ? `<figcaption>${MarkdownService.escapeHtml(cleanLanguage)}</figcaption>` : ""}
      <pre><code${languageClass}>${MarkdownService.escapeHtml(code)}</code></pre>
    </figure>`;
  }

  private static renderParagraph(
    lines: string[],
    linkReferences: Map<string, LinkReference>,
    footnoteReferences?: Set<string>,
  ) {
    const content = lines
      .map((line, index) => {
        const hardBreak = / {2,}$/.test(line);
        const rendered = MarkdownService.renderInline(
          line.trimEnd(),
          linkReferences,
          footnoteReferences,
        );
        if (hardBreak) {
          return `${rendered}<br />`;
        }

        return index < lines.length - 1 ? `${rendered} ` : rendered;
      })
      .join("");

    return `<p>${content}</p>`;
  }

  private static collectQuoteBlock(lines: string[], startIndex: number) {
    const quoteLines: string[] = [];
    let index = startIndex;
    let sawBlank = false;

    while (index < lines.length) {
      const line = lines[index];
      if (MarkdownService.isQuoteLine(line)) {
        quoteLines.push(line);
        sawBlank = !line.replace(/^>\s?/, "").trim();
        index += 1;
        continue;
      }

      if (!line.trim()) {
        quoteLines.push(line);
        sawBlank = true;
        index += 1;
        continue;
      }

      if (!sawBlank && !MarkdownService.isQuoteBoundary(line)) {
        quoteLines.push(line);
        index += 1;
        continue;
      }

      break;
    }

    return { lines: quoteLines, nextIndex: index };
  }

  private static collectListBlock(lines: string[], startIndex: number) {
    const firstMarker = MarkdownService.parseListMarker(lines[startIndex]);
    const baseIndent = firstMarker?.indent ?? 0;
    const listLines: string[] = [];
    let index = startIndex;
    let sawBlank = false;

    while (index < lines.length) {
      const line = lines[index];
      const marker = MarkdownService.parseListMarker(line);
      if (marker) {
        if (marker.indent <= baseIndent && marker.ordered !== firstMarker?.ordered) {
          break;
        }

        listLines.push(line);
        sawBlank = false;
        index += 1;
        continue;
      }

      if (!line.trim()) {
        listLines.push(line);
        sawBlank = true;
        index += 1;
        continue;
      }

      if (sawBlank && !MarkdownService.isIndentedListContinuation(line)) {
        break;
      }

      if (
        MarkdownService.isIndentedListContinuation(line) ||
        !MarkdownService.isListBoundary(line)
      ) {
        listLines.push(line);
        sawBlank = false;
        index += 1;
        continue;
      }

      break;
    }

    return { lines: listLines, nextIndex: index, ordered: firstMarker?.ordered ?? false };
  }

  private static renderListBlockHtml(
    lines: string[],
    ordered: boolean,
    linkReferences: Map<string, LinkReference>,
    imageReferences: Map<string, ImageReference>,
    footnoteReferences?: Set<string>,
  ) {
    const firstMarker = MarkdownService.parseListMarker(lines[0]);
    const baseIndent = firstMarker?.indent ?? 0;
    const contentIndent = firstMarker?.contentIndent ?? baseIndent + 2;
    const items: ListItemBlock[] = [];
    let currentItem: ListItemBlock | null = null;

    for (const line of lines) {
      const marker = MarkdownService.parseListMarker(line);
      if (marker && marker.indent <= baseIndent && marker.ordered === ordered) {
        if (currentItem) {
          items.push(currentItem);
        }
        currentItem = { lines: [marker.content], value: marker.value };
        continue;
      }

      currentItem?.lines.push(MarkdownService.stripListContinuationIndent(line, contentIndent));
    }

    if (currentItem) {
      items.push(currentItem);
    }

    const tag = ordered ? "ol" : "ul";
    const html = items
      .map((item) =>
        MarkdownService.renderStructuredListItem(
          item,
          ordered,
          linkReferences,
          imageReferences,
          footnoteReferences,
        ),
      )
      .join("");

    return `<${tag}>${html}</${tag}>`;
  }

  private static renderStructuredListItem(
    item: ListItemBlock,
    ordered: boolean,
    linkReferences: Map<string, LinkReference>,
    imageReferences: Map<string, ImageReference>,
    footnoteReferences?: Set<string>,
  ) {
    const lines = [...item.lines];
    const valueAttribute = ordered && item.value !== null ? ` value="${item.value}"` : "";
    const checklist = lines[0]?.match(/^\[([ xX])]\s+(.+)$/);
    if (checklist) {
      lines[0] = checklist[2];
    }

    const markdown = lines.join("\n").replace(/\n+$/, "");
    if (footnoteReferences) {
      for (const match of markdown.matchAll(/\[\^([^\]]+)]/g)) {
        footnoteReferences.add(match[1].toLowerCase());
      }
    }
    const rendered = MarkdownService.unwrapSingleParagraph(
      MarkdownService.renderHtml(markdown, linkReferences, imageReferences),
    );

    if (!checklist) {
      return `<li${valueAttribute}>${rendered}</li>`;
    }

    const checked = checklist[1].toLowerCase() === "x" ? " checked" : "";
    return `<li${valueAttribute} class="task-list-item"><input type="checkbox" disabled${checked} /> ${rendered}</li>`;
  }

  private static parseListMarker(line: string): ListMarker | null {
    const marker = line.match(/^([ \t]*)([-*+]|\d+\.)([ \t]+)(.*)$/);
    if (!marker) {
      return null;
    }

    const indent = marker[1].replaceAll("\t", "    ").length;
    const markerGap = marker[3].replaceAll("\t", "    ").length;

    return {
      content: marker[4],
      contentIndent: indent + marker[2].length + markerGap,
      indent,
      ordered: /\d+\./.test(marker[2]),
      value: /^\d+\.$/.test(marker[2]) ? Number.parseInt(marker[2], 10) : null,
    };
  }

  private static stripListContinuationIndent(line: string, contentIndent: number) {
    if (!line.trim()) {
      return "";
    }

    const removableIndent = Math.max(0, contentIndent);
    return line.replace(new RegExp(`^ {0,${removableIndent}}`), "");
  }

  private static isIndentedListContinuation(line: string) {
    return /^( {2,}|\t)/.test(line);
  }

  private static isQuoteBoundary(line: string) {
    return (
      MarkdownService.isCodeFenceLine(line) ||
      MarkdownService.parseAtxHeading(line) !== null ||
      MarkdownService.parseListMarker(line) !== null ||
      MarkdownService.isImageLine(line) ||
      MarkdownService.isImageReferenceDefinition(line) ||
      /^\s*---+\s*$/.test(line) ||
      line.includes("|")
    );
  }

  private static isListBoundary(line: string) {
    return (
      MarkdownService.isCodeFenceLine(line) ||
      MarkdownService.parseAtxHeading(line) !== null ||
      MarkdownService.isQuoteLine(line) ||
      MarkdownService.isImageLine(line) ||
      MarkdownService.isImageReferenceDefinition(line) ||
      /^\s*---+\s*$/.test(line) ||
      line.includes("|")
    );
  }

  private static unwrapSingleParagraph(html: string) {
    const paragraph = html.match(/^<p>([\s\S]*)<\/p>$/);
    if (!paragraph || paragraph[1].includes("<p>") || paragraph[1].includes("</p>")) {
      return html;
    }

    return paragraph[1];
  }

  private static isAllowedRawHtml(tag: string) {
    const tagParts = tag.match(/^<\/?\s*([A-Za-z][A-Za-z0-9-]*)([^<>]*?)\/?>$/);
    const name = tagParts?.[1]?.toLowerCase();
    if (!name) {
      return false;
    }

    const allowedTags = new Set([
      "a",
      "abbr",
      "b",
      "br",
      "cite",
      "code",
      "del",
      "div",
      "em",
      "i",
      "kbd",
      "li",
      "mark",
      "ol",
      "p",
      "pre",
      "small",
      "span",
      "strong",
      "sub",
      "sup",
      "u",
      "ul",
    ]);

    if (!allowedTags.has(name)) {
      return false;
    }

    if (/(\son[a-z]+\s*=|javascript:|data:text\/html|<\s*script)/i.test(tag)) {
      return false;
    }

    const attributes = tagParts?.[2]?.replace(/\/\s*$/, "").trim() ?? "";
    if (!attributes) {
      return true;
    }

    return /^([A-Za-z_:][-A-Za-z0-9_:.]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>=]+)\s*)+$/.test(
      attributes,
    );
  }

  private static renderInline(
    value: string,
    linkReferences = new Map<string, LinkReference>(),
    footnoteReferences?: Set<string>,
  ) {
    const protectedCode: string[] = [];
    const protectedEscapes: string[] = [];
    const protectedHtml: string[] = [];
    const protectedAutoLinks: string[] = [];
    const protectedMath: string[] = [];
    const protectedValue = value
      .replaceAll(/`([^`]+)`/g, (_match, code: string) => {
        const token = `MDTOKENCODE${protectedCode.length}TOKENMD`;
        protectedCode.push(`<code>${MarkdownService.escapeHtml(code)}</code>`);
        return token;
      })
      .replaceAll(/\$([^$\n]+)\$/g, (_match, math: string) => {
        const token = `MDTOKENMATH${protectedMath.length}TOKENMD`;
        protectedMath.push(`<span class="md-math">${MarkdownService.escapeHtml(math)}</span>`);
        return token;
      })
      .replaceAll(/\\([\\`*{}[\]()#+\-.!_>])/g, (_match, character: string) => {
        const token = `MDTOKENESC${protectedEscapes.length}TOKENMD`;
        protectedEscapes.push(character);
        return token;
      })
      .replaceAll(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*)?\/?>/g, (match) => {
        if (!MarkdownService.isAllowedRawHtml(match)) {
          return match;
        }

        const token = `MDTOKENHTML${protectedHtml.length}TOKENMD`;
        protectedHtml.push(match);
        return token;
      })
      .replaceAll(/<((?:https?|ftp):\/\/[^>\s]+)>/g, (_match, target: string) => {
        const token = `MDTOKENAUTO${protectedAutoLinks.length}TOKENMD`;
        protectedAutoLinks.push(
          `<a href="${MarkdownService.escapeAttribute(target)}" data-link-kind="external">${MarkdownService.escapeHtml(target)}</a>`,
        );
        return token;
      })
      .replaceAll(
        /<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>/g,
        (_match, email: string) => {
          const token = `MDTOKENAUTO${protectedAutoLinks.length}TOKENMD`;
          protectedAutoLinks.push(
            `<a href="mailto:${MarkdownService.escapeAttribute(email)}" data-link-kind="external">${MarkdownService.escapeHtml(email)}</a>`,
          );
          return token;
        },
      );

    return MarkdownService.escapeHtml(protectedValue)
      .replaceAll(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replaceAll(/(?<!\w)__([^_\n]+)__(?!\w)/g, "<strong>$1</strong>")
      .replaceAll(/~~([^~]+)~~/g, "<del>$1</del>")
      .replaceAll(/\*([^*]+)\*/g, "<em>$1</em>")
      .replaceAll(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<em>$1</em>")
      .replaceAll(/\[\[([^\]]+)]]/g, '<a href="#document:$1" data-link-kind="document">$1</a>')
      .replaceAll(/\[\^([^\]]+)]/g, (_match, id: string) => {
        const normalizedId = id.toLowerCase();
        footnoteReferences?.add(normalizedId);
        const safeId = MarkdownService.slugify(normalizedId) || "note";
        return `<sup id="fnref-${safeId}"><a href="#fn-${safeId}" data-link-kind="internal">${MarkdownService.escapeHtml(id)}</a></sup>`;
      })
      .replaceAll(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, rawTarget: string) => {
        const { target, title } = MarkdownService.parseInlineLinkTarget(rawTarget);
        const titleAttribute = title ? ` title="${MarkdownService.escapeAttribute(title)}"` : "";
        return `<a href="${MarkdownService.escapeAttribute(target)}" data-link-kind="${MarkdownService.getLinkKind(target)}"${titleAttribute}>${label}</a>`;
      })
      .replaceAll(/\[([^\]]+)]\s*\[([^\]]*)]/g, (match, label: string, id: string) => {
        const reference = linkReferences.get((id || label).toLowerCase());
        if (!reference) {
          return match;
        }

        const titleAttribute = reference.title
          ? ` title="${MarkdownService.escapeAttribute(reference.title)}"`
          : "";
        return `<a href="${MarkdownService.escapeAttribute(reference.target)}" data-link-kind="${MarkdownService.getLinkKind(reference.target)}"${titleAttribute}>${label}</a>`;
      })
      .replaceAll(
        /MDTOKENAUTO(\d+)TOKENMD/g,
        (_match, index: string) => protectedAutoLinks[Number(index)] ?? "",
      )
      .replaceAll(
        /MDTOKENHTML(\d+)TOKENMD/g,
        (_match, index: string) => protectedHtml[Number(index)] ?? "",
      )
      .replaceAll(
        /MDTOKENMATH(\d+)TOKENMD/g,
        (_match, index: string) => protectedMath[Number(index)] ?? "",
      )
      .replaceAll(
        /MDTOKENCODE(\d+)TOKENMD/g,
        (_match, index: string) => protectedCode[Number(index)] ?? "",
      )
      .replaceAll(/MDTOKENESC(\d+)TOKENMD/g, (_match, index: string) =>
        MarkdownService.escapeHtml(protectedEscapes[Number(index)] ?? ""),
      );
  }

  private static parseInlineLinkTarget(rawTarget: string) {
    const match = rawTarget
      .trim()
      .match(/^(\S+)(?:\s+(?:"([^"]+)"|'([^']+)'|\(([^)]+)\)|&quot;(.+)&quot;))?$/);
    return {
      target: match?.[1] ?? rawTarget.trim(),
      title: match?.[2] ?? match?.[3] ?? match?.[4] ?? match?.[5] ?? "",
    };
  }

  private static parseImageLine(line: string, references: Map<string, ImageReference>) {
    const direct = line.match(
      /^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)(?:\{(small|wide|contained)})?$/,
    );
    if (direct) {
      return {
        alt: direct[1],
        source: direct[2],
        caption: direct[3] ?? "",
        layout: direct[4] ?? "contained",
      };
    }

    const reference = line.match(/^!\[([^\]]*)]\s*\[([^\]]*)](?:\{(small|wide|contained)})?$/);
    if (!reference) {
      return null;
    }

    const resolved = references.get((reference[2] || reference[1]).toLowerCase());
    if (!resolved) {
      return null;
    }

    return {
      alt: reference[1],
      source: resolved.source,
      caption: resolved.caption,
      layout: reference[3] ?? "contained",
    };
  }

  private static parseAtxHeading(line: string) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!heading) {
      return null;
    }

    return {
      level: heading[1].length,
      text: heading[2].replace(/\s+#+\s*$/, "").trim(),
    };
  }

  private static parseSetextHeading(line: string, nextLine: string) {
    if (
      !line.trim() ||
      /^( {4}|\t)/.test(line) ||
      /^\s*(?:[-*+]|\d+\.)\s+/.test(line) ||
      /^>\s?/.test(line) ||
      line.includes("|")
    ) {
      return null;
    }

    if (/^\s*=+\s*$/.test(nextLine)) {
      return { level: 1, text: line.trim() };
    }

    if (/^\s*-+\s*$/.test(nextLine)) {
      return { level: 2, text: line.trim() };
    }

    return null;
  }

  private static parseImageReferenceDefinition(line: string) {
    const reference = MarkdownService.parseReferenceDefinition(line);
    if (!reference) {
      return null;
    }

    return {
      id: reference.id,
      source: reference.target,
      caption: reference.title,
    };
  }

  private static parseReferenceDefinition(line: string) {
    const reference = line.match(
      /^\[([^\]]+)]:\s*(?:<([^>]+)>|(\S+))(?:\s+(?:"([^"]+)"|'([^']+)'|\(([^)]+)\)))?\s*$/,
    );
    if (!reference) {
      return null;
    }

    return {
      id: reference[1],
      target: reference[2] ?? reference[3],
      title: reference[4] ?? reference[5] ?? reference[6] ?? "",
    };
  }

  private static parseFootnoteDefinition(line: string) {
    const definition = line.match(/^\[\^([^\]]+)]:\s*(.*)$/);
    if (!definition) {
      return null;
    }

    return {
      id: definition[1],
      text: definition[2],
    };
  }

  private static renderImageFigure(
    alt: string,
    source: string,
    caption = "",
    layout = "contained",
  ) {
    return `<figure class="md-figure md-figure-${layout}">
      <img src="${MarkdownService.escapeAttribute(source)}" alt="${MarkdownService.escapeAttribute(alt)}" />
      ${caption ? `<figcaption>${MarkdownService.renderInline(caption)}</figcaption>` : ""}
    </figure>`;
  }

  private static renderTable(lines: string[], linkReferences = new Map<string, LinkReference>()) {
    const separator = lines.find((line) =>
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line),
    );
    const alignments = separator ? MarkdownService.parseTableAlignments(separator) : [];
    const rows = lines
      .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
      .map((line) =>
        line
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim()),
      );

    if (!rows.length) {
      return "";
    }

    const [head, ...body] = rows;
    const header = `<thead><tr>${head.map((cell, index) => `<th${MarkdownService.renderTableAlignmentClass(alignments[index])}>${MarkdownService.renderInline(cell, linkReferences)}</th>`).join("")}</tr></thead>`;
    const tableBody = `<tbody>${body
      .map(
        (row) =>
          `<tr>${row.map((cell, index) => `<td${MarkdownService.renderTableAlignmentClass(alignments[index])}>${MarkdownService.renderInline(cell, linkReferences)}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody>`;

    return `<div class="md-table-wrap"><table>${header}${tableBody}</table></div>`;
  }

  private static parseTableAlignments(separator: string) {
    return separator
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => {
        const trimmed = cell.trim();
        if (trimmed.startsWith(":") && trimmed.endsWith(":")) {
          return "center";
        }

        if (trimmed.endsWith(":")) {
          return "right";
        }

        return "left";
      });
  }

  private static renderTableAlignmentClass(alignment = "left") {
    return alignment === "left" ? "" : ` class="md-align-${alignment}"`;
  }

  private static renderPrettyTableLine(line: string) {
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      return `<span class="pretty-syntax">${MarkdownService.escapeHtml(line)}</span>`;
    }

    return `<span class="pretty-table-line">${cells
      .map((cell) => `<span class="pretty-table-cell">${MarkdownService.renderInline(cell)}</span>`)
      .join('<span class="pretty-syntax"> | </span>')}</span>`;
  }

  private static renderMathBlockHtml(math: string) {
    return `<figure class="md-math-block"><pre>${MarkdownService.escapeHtml(math.trim())}</pre></figure>`;
  }

  private static renderTableOfContents(outline: HeadingInfo[]) {
    const items = outline
      .filter((heading) => heading.level > 1)
      .map(
        (heading) =>
          `<li class="md-toc-level-${heading.level}"><a href="#${MarkdownService.escapeAttribute(heading.id)}" data-link-kind="internal">${MarkdownService.escapeHtml(heading.text)}</a></li>`,
      )
      .join("");

    return `<nav class="md-toc" aria-label="Table of contents"><ol>${items}</ol></nav>`;
  }

  private static renderFootnotes(
    references: Set<string>,
    definitions: Map<string, FootnoteDefinition>,
    linkReferences: Map<string, LinkReference>,
  ) {
    const items = [...references]
      .map((id) => definitions.get(id))
      .filter((definition): definition is FootnoteDefinition => definition !== undefined)
      .map((definition) => {
        const safeId = MarkdownService.slugify(definition.id.toLowerCase()) || "note";
        const html = MarkdownService.renderInline(definition.text, linkReferences);
        return `<li id="fn-${safeId}">${html} <a href="#fnref-${safeId}" data-link-kind="internal">&#8617;</a></li>`;
      })
      .join("");

    return items ? `<section class="md-footnotes"><ol>${items}</ol></section>` : "";
  }

  private static getLinkKind(target: string): LinkInfo["kind"] {
    if (target.startsWith("#")) {
      return "internal";
    }

    if (/^https?:\/\//.test(target) || target.startsWith("mailto:")) {
      return "external";
    }

    return "document";
  }

  private static slugify(value: string) {
    return value
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replaceAll(/\s+/g, "-")
      .slice(0, 80);
  }

  private static createSlugger() {
    const seen = new Map<string, number>();
    return (value: string) => {
      const base = MarkdownService.slugify(value) || "section";
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count ? `${base}-${count + 1}` : base;
    };
  }

  private static getFrontmatterRange(lines: string[]) {
    if (lines[0]?.trim() !== "---") {
      return null;
    }

    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    return end > 0 ? { start: 0, end } : null;
  }

  private static escapeHtml(value: string) {
    return value.replace(markdownEscapePattern, (character) => markdownEscapeMap[character]);
  }

  private static escapeAttribute(value: string) {
    return MarkdownService.escapeHtml(value).replaceAll("`", "&#096;");
  }
}
