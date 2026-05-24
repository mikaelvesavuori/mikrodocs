import { MarkdownService, type MikroDocumentRecord } from "../index.js";
import { createEmptyState } from "./viewHelpers.js";

interface ParsedOutline {
  outline: Array<{ id: string; level: number; line: number; text: string }>;
  links: Array<{ kind: string; label: string; target: string }>;
}

interface RenderOutlineOptions {
  outlineList: HTMLElement;
  linkList: HTMLElement;
  backlinkList: HTMLElement;
  parsed: ParsedOutline;
  backlinks: MikroDocumentRecord[];
  onHeadingClick: (line: number) => void;
  onLinkClick: (target: string, kind: string) => void;
  onBacklinkClick: (documentRecord: MikroDocumentRecord) => void;
}

export function findBacklinks(
  activeDocument: MikroDocumentRecord | null,
  libraryDocuments: MikroDocumentRecord[],
) {
  if (!activeDocument) {
    return [];
  }

  const activeTargets = new Set([
    activeDocument.id.toLowerCase(),
    activeDocument.title.toLowerCase(),
  ]);
  return libraryDocuments.filter((documentRecord) => {
    if (documentRecord.id === activeDocument.id) {
      return false;
    }

    return MarkdownService.getLinks(documentRecord.markdown).some(
      (link) => link.kind === "document" && activeTargets.has(link.target.toLowerCase()),
    );
  });
}

export function renderOutlineView({
  outlineList,
  linkList,
  backlinkList,
  parsed,
  backlinks,
  onHeadingClick,
  onLinkClick,
  onBacklinkClick,
}: RenderOutlineOptions) {
  outlineList.replaceChildren(
    ...parsed.outline.map((heading) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `outline-item outline-level-${heading.level}`;
      button.textContent = heading.text;
      button.addEventListener("click", () => onHeadingClick(heading.line));
      return button;
    }),
  );

  linkList.replaceChildren(
    ...(parsed.links.length
      ? parsed.links.map((link) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "link-item";
          item.textContent = `${link.kind}: ${link.label}`;
          item.title = link.target;
          item.addEventListener("click", () => onLinkClick(link.target, link.kind));
          return item;
        })
      : [createEmptyState("No links")]),
  );

  backlinkList.replaceChildren(
    ...(backlinks.length
      ? backlinks.map((documentRecord) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "link-item";
          button.textContent = documentRecord.title;
          button.addEventListener("click", () => onBacklinkClick(documentRecord));
          return button;
        })
      : [createEmptyState("No backlinks")]),
  );
}
