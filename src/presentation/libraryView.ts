import type { MikroDocumentRecord } from "../index.js";
import { escapeText, formatDate, getLibrarySnippet } from "./formatters.js";

interface RenderDocumentListOptions {
  activeDocumentId?: string;
  documents: MikroDocumentRecord[];
  documentList: HTMLElement;
  searchQuery: string;
  setHtml: (element: Element, html: string) => void;
  onOpen: (documentRecord: MikroDocumentRecord) => void;
  onDuplicate: (documentRecord: MikroDocumentRecord) => void;
  onDelete: (documentRecord: MikroDocumentRecord) => void;
}

interface RenderTagFilterOptions {
  activeTagFilter: string | null;
  documents: MikroDocumentRecord[];
  tagFilterList: HTMLElement;
  onSelectTag: (tag: string | null) => void;
}

export function filterLibraryDocuments(
  documents: MikroDocumentRecord[],
  activeTagFilter: string | null,
) {
  return activeTagFilter
    ? documents.filter((documentRecord) => documentRecord.tags.includes(activeTagFilter))
    : documents;
}

export function renderDocumentList({
  activeDocumentId,
  documents,
  documentList,
  searchQuery,
  setHtml,
  onOpen,
  onDuplicate,
  onDelete,
}: RenderDocumentListOptions) {
  documentList.replaceChildren(
    ...documents.map((documentRecord) => {
      const row = document.createElement("div");
      row.className = "document-row";
      row.dataset.active = String(documentRecord.id === activeDocumentId);
      setHtml(
        row,
        `<button class="document-open" type="button"><span>${escapeText(documentRecord.title)}</span><small>${formatDate(documentRecord.updatedAt)}</small>${getLibrarySnippet(documentRecord, searchQuery)}</button>
        <div class="document-actions">
          <button class="button icon-button" type="button" data-library-action="duplicate" aria-label="Duplicate document" title="Duplicate"><svg class="icon" aria-hidden="true"><use href="#icon-copy"></use></svg></button>
          <button class="button icon-button danger-button" type="button" data-library-action="delete" aria-label="Delete document" title="Delete"><svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg></button>
        </div>`,
      );
      row
        .querySelector<HTMLButtonElement>(".document-open")
        ?.addEventListener("click", () => onOpen(documentRecord));
      row
        .querySelector<HTMLButtonElement>('[data-library-action="duplicate"]')
        ?.addEventListener("click", () => onDuplicate(documentRecord));
      row
        .querySelector<HTMLButtonElement>('[data-library-action="delete"]')
        ?.addEventListener("click", () => onDelete(documentRecord));
      return row;
    }),
  );
}

export function renderTagFilters({
  activeTagFilter,
  documents,
  tagFilterList,
  onSelectTag,
}: RenderTagFilterOptions) {
  const tags = [...new Set(documents.flatMap((documentRecord) => documentRecord.tags))].sort();
  tagFilterList.replaceChildren(
    ...(tags.length
      ? [
          createTagFilterButton("All", null, activeTagFilter, onSelectTag),
          ...tags.map((tag) => createTagFilterButton(`#${tag}`, tag, activeTagFilter, onSelectTag)),
        ]
      : []),
  );
}

function createTagFilterButton(
  label: string,
  tag: string | null,
  activeTagFilter: string | null,
  onSelectTag: (tag: string | null) => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tag-filter";
  button.dataset.active = String(activeTagFilter === tag);
  button.textContent = label;
  button.addEventListener("click", () => onSelectTag(tag));
  return button;
}
