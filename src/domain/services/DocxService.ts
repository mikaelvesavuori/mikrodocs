import { ZipService } from "./ZipService.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * @description Converts between MikroDocs Markdown and a lean DOCX package without third-party runtime dependencies.
 */
export class DocxService {
  static exportMarkdown(markdown: string, title = "Untitled") {
    const documentXml = DocxService.createDocumentXml(markdown);
    return ZipService.create([
      {
        path: "[Content_Types].xml",
        bytes: encodeXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`),
      },
      {
        path: "_rels/.rels",
        bytes: encodeXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`),
      },
      {
        path: "docProps/core.xml",
        bytes: encodeXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>MikroDocs</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`),
      },
      {
        path: "word/styles.xml",
        bytes: encodeXml(createStylesXml()),
      },
      {
        path: "word/document.xml",
        bytes: encodeXml(documentXml),
      },
    ]);
  }

  static async importMarkdown(buffer: ArrayBuffer) {
    const files = await ZipService.read(new Uint8Array(buffer));
    const documentXml = files.get("word/document.xml");
    if (!documentXml) {
      throw new Error("DOCX file is missing word/document.xml");
    }

    return DocxService.documentXmlToMarkdown(textDecoder.decode(documentXml));
  }

  private static createDocumentXml(markdown: string) {
    const blocks = markdownToDocxBlocks(markdown);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${blocks.join("\n    ")}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
  }

  private static documentXmlToMarkdown(xml: string) {
    const body = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? xml;
    const blocks = body.match(/<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/g) ?? [];
    const markdown = blocks
      .map((block) => {
        if (block.startsWith("<w:tbl")) {
          return tableXmlToMarkdown(block);
        }

        return paragraphXmlToMarkdown(block);
      })
      .filter(Boolean)
      .join("\n\n");

    return markdown.trim();
  }
}

function markdownToDocxBlocks(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let table: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(createParagraph(paragraph.join(" ")));
      paragraph = [];
    }
  };
  const flushTable = () => {
    if (table.length) {
      blocks.push(createTable(table));
      table = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushTable();
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push(createParagraph(code.join("\n"), "Code"));
        code = [];
        inCode = false;
      } else {
        flushAll();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      blocks.push(createParagraph(heading[2], `Heading${heading[1].length}`));
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushAll();
      blocks.push(createParagraph("-----"));
      continue;
    }

    if (line.includes("|")) {
      flushParagraph();
      table.push(line);
      continue;
    }

    const list = line.match(/^\s*(?:[-*]|\d+\.)\s+(?:\[([ xX])]\s+)?(.+)$/);
    if (list) {
      flushAll();
      const marker = list[1] ? (list[1].toLowerCase() === "x" ? "[x] " : "[ ] ") : "";
      blocks.push(createParagraph(`${marker}${list[2]}`, "ListParagraph"));
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushAll();
      blocks.push(createParagraph(quote[1], "Quote"));
      continue;
    }

    const image = line.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)(?:\{[^}]+})?$/);
    if (image) {
      flushAll();
      blocks.push(
        createParagraph([image[1] || "Image", image[3], image[2]].filter(Boolean).join(" - ")),
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode && code.length) {
    blocks.push(createParagraph(code.join("\n"), "Code"));
  }
  flushAll();

  return blocks.length ? blocks : [createParagraph("")];
}

function createParagraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}${createInlineRuns(text)}</w:p>`;
}

function createTable(lines: string[]) {
  const rows = lines
    .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map(parseMarkdownTableRow);
  const rowXml = rows
    .map(
      (row) =>
        `<w:tr>${row.map((cell) => `<w:tc>${createParagraph(cell)}</w:tc>`).join("")}</w:tr>`,
    )
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rowXml}</w:tbl>`;
}

function paragraphXmlToMarkdown(block: string) {
  const text = extractText(block);
  if (!text) {
    return "";
  }

  const style = block.match(/<w:pStyle[^>]+w:val="([^"]+)"/)?.[1] ?? "";
  const heading = style.match(/^Heading([1-6])$/)?.[1];
  if (heading) {
    return `${"#".repeat(Number(heading))} ${text}`;
  }

  if (style === "Quote") {
    return `> ${text}`;
  }

  return text;
}

function tableXmlToMarkdown(block: string) {
  const rows =
    block.match(/<w:tr\b[\s\S]*?<\/w:tr>/g)?.map((row) => {
      const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
      return cells.map(extractText);
    }) ?? [];

  if (!rows.length) {
    return "";
  }

  const [head, ...body] = rows;
  const separator = head.map(() => "---");
  return [head, separator, ...body].map(formatMarkdownTableRow).join("\n");
}

function createInlineRuns(value: string) {
  const tokens =
    /!\[([^\]]*)]\(([^)\s]+)(?:\s+"([^"]+)")?\)(?:\{[^}]+})?|\*\*([^*]+)\*\*|__([^_\n]+)__|`([^`]+)`|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]+)]\([^)]+\)|\[\[([^\]]+)]]/g;
  const runs: string[] = [];
  let index = 0;

  for (const match of value.matchAll(tokens)) {
    if (match.index > index) {
      runs.push(createTextRun(value.slice(index, match.index)));
    }

    if (match[1] !== undefined) {
      runs.push(
        createTextRun([match[1] || "Image", match[3], match[2]].filter(Boolean).join(" - ")),
      );
    } else if (match[4] !== undefined || match[5] !== undefined) {
      runs.push(createTextRun(match[4] ?? match[5], { bold: true }));
    } else if (match[6] !== undefined) {
      runs.push(createTextRun(match[6], { code: true }));
    } else if (match[7] !== undefined || match[8] !== undefined) {
      runs.push(createTextRun(match[7] ?? match[8], { italic: true }));
    } else if (match[9] !== undefined || match[10] !== undefined) {
      runs.push(createTextRun(match[9] ?? match[10]));
    }

    index = match.index + match[0].length;
  }

  if (index < value.length) {
    runs.push(createTextRun(value.slice(index)));
  }

  return runs.length ? runs.join("") : createTextRun("");
}

function createTextRun(
  text: string,
  options: { bold?: boolean; italic?: boolean; code?: boolean } = {},
) {
  const properties = [
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
    options.code ? '<w:rStyle w:val="CodeChar"/>' : "",
  ].join("");
  const propertiesXml = properties ? `<w:rPr>${properties}</w:rPr>` : "";
  return `<w:r>${propertiesXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function parseMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function formatMarkdownTableRow(row: string[]) {
  return `| ${row.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`;
}

function extractText(xml: string) {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => unescapeXml(match[1]))
    .join("");
}

function encodeXml(value: string) {
  return textEncoder.encode(value.trim());
}

function createStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  ${Array.from(
    { length: 6 },
    (_, index) =>
      `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>`,
  ).join("")}
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Character"/><w:basedOn w:val="DefaultParagraphFont"/></w:style>
</w:styles>`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unescapeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}
