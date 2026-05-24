import { readFileAsArrayBuffer, readFileAsDataUrl, readFileAsText } from "../config/browser.js";
import { createDocumentFileGateway } from "../config/fileGateway.js";
import {
  BrowserSettingsRepository,
  BrowserStorageService,
  DocumentArchiveService,
  DocumentService,
  DocxService,
  type ImageLayout,
  type MikroDocumentSnapshot,
  IndexedDbDocumentRepository,
  MarkdownCommandService,
  MarkdownService,
  MikroDocument,
  type MikroDocumentRecord,
} from "../index.js";
import { parseBackupRecords } from "./backupRecords.js";
import { shouldShowBackupReminder } from "./backupReminder.js";
import {
  createEmptyAssetSummary,
  mergeAssetSummaries,
  renderBackupReview,
  renderDataSafetySummary,
} from "./backupView.js";
import {
  clampCommandIndex,
  filterCommands,
  getCommandIndexAfterKey,
  renderCommandList,
} from "./commandPalette.js";
import { buildCommands, type Command } from "./commands.js";
import { createDialogController, isTypingInField } from "./dialogs.js";
import { isLikelyUrl, repairDocumentLinkTargets } from "./documentLinks.js";
import {
  focusEditorAt,
  getActiveLineIndex,
  getApproximateLinePosition,
  getLineStartPosition,
  getPrettySourceLineFromPoint,
  isEditing,
  resizeEditor,
  scrollPrettySourceLineIntoView,
  scrollRawLineTowardClick,
  setEditingMode,
  syncPrettyEditorScroll,
} from "./editorSurface.js";
import { getPresentationElements } from "./elements.js";
import {
  findNextSourceMatch,
  replaceAllSourceMatches,
  replaceSourceRange,
} from "./findController.js";
import { renderFindResultsView } from "./findView.js";
import { formatError, slugFileName } from "./formatters.js";
import { getInlineFormattingResult } from "./formattingCommands.js";
import { renderHistoryList, renderSnapshotPreview } from "./historyView.js";
import { filterLibraryDocuments, renderDocumentList, renderTagFilters } from "./libraryView.js";
import { findBacklinks, renderOutlineView } from "./outlineView.js";
import { renderPrettyMarkdown } from "./prettyMarkdown.js";
import { registerServiceWorker } from "./serviceWorkerRegistration.js";
import {
  applyEditorSettings,
  readSettingsFromControls,
  toggleSourceModePreference,
  toggleThemePreference,
} from "./settingsController.js";
import { createStandaloneHtml } from "./standaloneHtml.js";
import { setSafeHtml } from "./viewHelpers.js";

type TrustedTypesPolicyFactory = {
  createPolicy: (
    name: string,
    rules: {
      createHTML: (value: string) => string;
    },
  ) => {
    createHTML: (value: string) => unknown;
  };
};

const elements = getPresentationElements();

const documentService = new DocumentService(new IndexedDbDocumentRepository());
const settingsRepository = new BrowserSettingsRepository();
const storageService = new BrowserStorageService();
const fileGateway = createDocumentFileGateway();
const dialogController = createDialogController([
  elements.libraryDialog,
  elements.outlineDialog,
  elements.settingsDialog,
  elements.historyDialog,
  elements.historyPreviewDialog,
  elements.dataSafetyDialog,
  elements.backupReviewDialog,
  elements.findDialog,
  elements.linkDialog,
  elements.tableDialog,
  elements.imageDialog,
  elements.shortcutsDialog,
  elements.commandDialog,
]);
const trustedTypesPolicy = (
  globalThis as typeof globalThis & { trustedTypes?: TrustedTypesPolicyFactory }
).trustedTypes?.createPolicy("mikrodocs", {
  createHTML: (value) => value,
});
let settings = settingsRepository.load();
let activeDocument: MikroDocumentRecord | null = null;
let libraryDocuments: MikroDocumentRecord[] = [];
let isDirty = false;
let storageAvailable = true;
let autosaveTimer: number | null = null;
let commandIndex = 0;
let commands: Command[] = [];
let pendingBackupRecords: MikroDocumentRecord[] = [];
let activeTagFilter: string | null = null;
let lastSavedTitle = "";
let previewedSnapshot: MikroDocumentSnapshot | null = null;

async function boot() {
  applySettings();
  bindEvents();
  registerServiceWorker();
  try {
    libraryDocuments = await documentService.list();
    activeDocument = getStartupDocument(libraryDocuments) ?? (await documentService.create());
  } catch (error) {
    storageAvailable = false;
    activeDocument = MikroDocument.create({
      title: "Unsaved document",
      markdown:
        "# Unsaved document\n\nBrowser storage is unavailable. Export or copy this text before closing.",
    }).toRecord();
    showToast(formatError(error, "Browser storage is unavailable"));
  }
  renderDocument(activeDocument);
  await renderLibrary();
  notifyBackupReminder();
}

function bindEvents() {
  elements.prettyEditor.addEventListener("click", handlePrettyEditorClick);
  elements.editor.addEventListener("input", handleEditorInput);
  elements.editor.addEventListener("keydown", handleEditorKeydown);
  elements.editor.addEventListener("paste", handleEditorPaste);
  elements.editor.addEventListener("pointerdown", handleEditorPointerDown, { capture: true });
  elements.editor.addEventListener("click", handleEditorSelectionChange);
  elements.editor.addEventListener("focus", handleEditorFocus);
  elements.editor.addEventListener("blur", handleEditorBlur);
  elements.editor.addEventListener("keyup", handleEditorSelectionChange);
  elements.editor.addEventListener("select", handleEditorSelectionChange);
  elements.editor.addEventListener("scroll", () => syncPrettyEditorScroll(elements));
  elements.titleInput.addEventListener("input", handleTitleInput);
  elements.titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      elements.titleInput.blur();
    }
  });
  window.addEventListener("resize", () => resizeEditor(elements));
  elements.newDocumentButton.addEventListener("click", createDocument);
  elements.libraryButton.addEventListener("click", () => openDialog(elements.libraryDialog));
  elements.outlineButton.addEventListener("click", () => openDialog(elements.outlineDialog));
  elements.themeButton.addEventListener("click", toggleTheme);
  elements.librarySearch.addEventListener("input", renderLibrary);
  elements.importMarkdownButton.addEventListener("click", () => elements.fileInput.click());
  elements.importBackupButton.addEventListener("click", () => elements.backupInput.click());
  elements.fileInput.addEventListener("change", importMarkdownFile);
  elements.backupInput.addEventListener("change", importBackupFile);
  elements.backupButton.addEventListener("click", exportBackup);
  elements.dataBackupButton.addEventListener("click", exportBackup);
  elements.exportAllMarkdownButton.addEventListener("click", exportMarkdownArchive);
  elements.persistStorageButton.addEventListener("click", requestPersistentStorage);
  elements.restorePreviewButton.addEventListener("click", restorePreviewedSnapshot);
  elements.backupAppendButton.addEventListener("click", () => importPendingBackup(false));
  elements.backupReplaceButton.addEventListener("click", () => importPendingBackup(true));
  elements.commandInput.addEventListener("input", renderCommands);
  elements.commandInput.addEventListener("keydown", handleCommandKeydown);
  elements.findInput.addEventListener("input", renderFindResults);
  elements.replaceNextButton.addEventListener("click", replaceNextMatch);
  elements.replaceAllButton.addEventListener("click", replaceAllMatches);
  elements.linkKindSelect.addEventListener("change", refreshLinkTargetOptions);
  elements.insertLinkButton.addEventListener("click", insertLinkFromDialog);
  elements.insertTableButton.addEventListener("click", insertTableFromDialog);
  elements.insertImageButton.addEventListener("click", insertImageFromDialog);
  elements.fontSelect.addEventListener("change", updateSettingsFromControls);
  elements.fontScale.addEventListener("input", updateSettingsFromControls);
  elements.autosaveToggle.addEventListener("change", updateSettingsFromControls);
  elements.sourceModeToggle.addEventListener("change", updateSettingsFromControls);
  dialogController.bindReturnFocus();

  document.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const closeDialogId = target?.dataset.closeDialog;
    if (closeDialogId) {
      dialogController.closeById(closeDialogId);
      return;
    }

    const tool = target?.closest<HTMLElement>("[data-command]");
    if (tool?.dataset.command) {
      runFormattingCommand(tool.dataset.command);
    }
  });

  document.addEventListener("keydown", handleKeyboard);
  window.addEventListener("beforeunload", (event) => {
    if (!isDirty) {
      return;
    }

    event.preventDefault();
    Reflect.set(event, "returnValue", "");
  });
}

function handlePrettyEditorClick(event: MouseEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const link = target?.closest<HTMLAnchorElement>("a");
  if (!link) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const kind = link.dataset.linkKind ?? "external";
  const href = link.getAttribute("href") ?? "";
  const targetValue =
    kind === "document" && href.startsWith("#document:")
      ? decodeURIComponent(href.replace(/^#document:/, ""))
      : href;
  void followDocumentLink(targetValue, kind);
}

function handleEditorInput() {
  if (!activeDocument) {
    return;
  }

  isDirty = true;
  activeDocument = {
    ...activeDocument,
    markdown: elements.editor.value,
    title: elements.titleInput.value || MarkdownService.deriveTitle(elements.editor.value),
  };
  renderPreview();
  renderPrettyEditor();
  scheduleAutosave();
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const result = MarkdownCommandService.continueListOnEnter(
      elements.editor.value,
      elements.editor.selectionStart,
      elements.editor.selectionEnd,
    );
    if (result) {
      event.preventDefault();
      applyEditorCommand(result);
    }
    return;
  }

  if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const result = MarkdownCommandService.indentListLines(
      elements.editor.value,
      elements.editor.selectionStart,
      elements.editor.selectionEnd,
      event.shiftKey ? "outdent" : "indent",
    );
    if (result) {
      event.preventDefault();
      applyEditorCommand(result);
    }
  }
}

async function handleEditorPaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    return;
  }

  const imageFile = [...clipboard.files].find((file) => file.type.startsWith("image/"));
  if (imageFile) {
    event.preventDefault();
    const dataUrl = await readFileAsDataUrl(imageFile);
    applyEditorCommand(
      MarkdownCommandService.insertImage(elements.editor.value, elements.editor.selectionStart, {
        source: dataUrl,
        alt: imageFile.name.replace(/\.[^.]+$/, "") || "Pasted image",
        caption: "Pasted image",
        layout: "contained",
      }),
    );
    showToast("Pasted image");
    return;
  }

  const text = clipboard.getData("text/plain");
  if (!text) {
    return;
  }

  const table = MarkdownCommandService.tableFromDelimitedText(text);
  if (table) {
    event.preventDefault();
    insertMarkdownAtSelection(`\n${table}\n`);
    showToast("Pasted table");
    return;
  }

  if (hasSelectedText() && isLikelyUrl(text.trim())) {
    event.preventDefault();
    applyEditorCommand(
      MarkdownCommandService.insertLink(
        elements.editor.value,
        elements.editor.selectionStart,
        elements.editor.selectionEnd,
        text.trim(),
      ),
    );
    showToast("Linked selection");
  }
}

function handleTitleInput() {
  if (!activeDocument) {
    return;
  }

  activeDocument = { ...activeDocument, title: elements.titleInput.value || "Untitled" };
  isDirty = true;
  scheduleAutosave();
}

async function saveActiveDocument(reason: "manual" | "autosave" = "manual") {
  if (!activeDocument) {
    return;
  }

  if (!storageAvailable) {
    showToast("Browser storage is unavailable. Export a copy before closing.");
    return;
  }

  try {
    const previousTitle = lastSavedTitle;
    const nextTitle =
      elements.titleInput.value.trim() || MarkdownService.deriveTitle(elements.editor.value);
    const saved = await documentService.update(activeDocument.id, {
      title: nextTitle,
      markdown: elements.editor.value,
      saveSnapshot: true,
      snapshotReason: reason,
    });
    activeDocument = saved;
    lastSavedTitle = saved.title;
    isDirty = false;
    const repairedCount = await repairBacklinksAfterRename(previousTitle, saved.title, saved.id);
    await renderLibrary();
    if (repairedCount && reason === "manual") {
      showToast(`Saved and repaired ${repairedCount} backlink${repairedCount === 1 ? "" : "s"}`);
    } else if (reason === "manual") {
      showToast("Saved");
    }
  } catch (error) {
    isDirty = true;
    storageAvailable = false;
    showToast(formatError(error, "Could not save document"));
  }
}

function scheduleAutosave() {
  if (!settings.autosave) {
    return;
  }

  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
  }

  autosaveTimer = window.setTimeout(() => {
    void saveActiveDocument("autosave");
  }, 2000);
}

async function createDocument() {
  if (!(await confirmDirtyChange())) {
    return;
  }

  try {
    activeDocument = storageAvailable
      ? await documentService.create()
      : MikroDocument.create().toRecord();
    isDirty = !storageAvailable;
    renderDocument(activeDocument);
    await renderLibrary();
    elements.editor.focus();
  } catch (error) {
    storageAvailable = false;
    showToast(formatError(error, "Could not create document"));
  }
}

async function duplicateActiveDocument() {
  if (!activeDocument) {
    return;
  }

  try {
    activeDocument = await documentService.duplicate(activeDocument.id);
    isDirty = false;
    renderDocument(activeDocument);
    await renderLibrary();
    showToast("Duplicated document");
  } catch (error) {
    showToast(formatError(error, "Could not duplicate document"));
  }
}

async function deleteActiveDocument() {
  if (!activeDocument || !window.confirm(`Delete "${activeDocument.title}"?`)) {
    return;
  }

  try {
    const deletedId = activeDocument.id;
    await documentService.delete(deletedId);
    libraryDocuments = await documentService.list();
    activeDocument = libraryDocuments[0] ?? (await documentService.create());
    isDirty = false;
    renderDocument(activeDocument);
    await renderLibrary();
    showToast("Deleted document");
  } catch (error) {
    showToast(formatError(error, "Could not delete document"));
  }
}

async function openDocument(id: string) {
  if (!(await confirmDirtyChange())) {
    return;
  }

  try {
    const documentRecord = await documentService.load(id);
    if (!documentRecord) {
      showToast("Document not found");
      return;
    }

    activeDocument = documentRecord;
    isDirty = false;
    renderDocument(activeDocument);
    elements.libraryDialog.close();
  } catch (error) {
    showToast(formatError(error, "Could not open document"));
  }
}

async function confirmDirtyChange() {
  if (!isDirty) {
    return true;
  }

  return window.confirm("The current document has unsaved changes. Continue?");
}

function renderDocument(documentRecord: MikroDocumentRecord) {
  elements.titleInput.value = documentRecord.title;
  elements.editor.value = documentRecord.markdown;
  lastSavedTitle = documentRecord.title;
  rememberActiveDocument(documentRecord.id);
  setEditingMode(elements, false);
  renderPreview();
  renderPrettyEditor();
  renderHistory();
}

function getStartupDocument(documents: MikroDocumentRecord[]) {
  if (!settings.lastDocumentId) {
    return documents[0] ?? null;
  }

  return documents.find((documentRecord) => documentRecord.id === settings.lastDocumentId) ?? null;
}

function rememberActiveDocument(id: string) {
  if (settings.lastDocumentId === id) {
    return;
  }

  settings = { ...settings, lastDocumentId: id };
  try {
    settingsRepository.save(settings);
  } catch {
    showToast("Could not remember the active document");
  }
}

function renderPreview() {
  const parsed = MarkdownService.parse(elements.editor.value);
  setHtml(elements.printPreview, MarkdownService.renderHtml(getExportMarkdown()));
  elements.wordCount.textContent = `${parsed.stats.words} words`;
  elements.readingTime.textContent = `${parsed.stats.readingMinutes} min`;
  renderOutline(parsed);
}

function renderPrettyEditor() {
  const activeLineIndex =
    document.activeElement === elements.editor
      ? getActiveLineIndex(elements.editor.value, elements.editor.selectionStart)
      : -1;
  setHtml(elements.prettyEditor, renderPrettyMarkdown(elements.editor.value, activeLineIndex));
  resizeEditor(elements);
  syncPrettyEditorScroll(elements);
}

function handleEditorPointerDown(event: PointerEvent) {
  if (!isEditing(elements)) {
    event.preventDefault();
    const line = getPrettySourceLineFromPoint(elements.prettyEditor, event.clientX, event.clientY);
    const position = getApproximateLinePosition(elements.editor, line, event.clientX);
    focusEditorAt(elements, position, line, event.clientY);
    return;
  }

  setEditingMode(elements, true);
}

function handleEditorBlur() {
  setEditingMode(elements, false);
  renderPrettyEditor();
}

function handleEditorFocus() {
  setEditingMode(elements, true);
  resizeEditor(elements);
}

function handleEditorSelectionChange() {
  if (isEditing(elements)) {
    return;
  }

  renderPrettyEditor();
}

function renderOutline(parsed = MarkdownService.parse(elements.editor.value)) {
  renderOutlineView({
    outlineList: elements.outlineList,
    linkList: elements.linkList,
    backlinkList: elements.backlinkList,
    parsed,
    backlinks: findBacklinks(activeDocument, libraryDocuments),
    onHeadingClick: (line) => {
      elements.outlineDialog.close();
      jumpToLine(line);
    },
    onLinkClick: (target, kind) => {
      void followDocumentLink(target, kind);
    },
    onBacklinkClick: (documentRecord) => {
      void openDocument(documentRecord.id);
    },
  });
}

async function followDocumentLink(target: string, kind: string) {
  if (kind === "internal") {
    const heading = MarkdownService.getOutline(elements.editor.value).find(
      (item) => `#${item.id}` === target,
    );
    if (heading) {
      elements.outlineDialog.close();
      jumpToLine(heading.line);
    }
    return;
  }

  if (kind === "external") {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }

  const normalizedTarget = target.toLowerCase();
  const documentRecord = libraryDocuments.find(
    (item) => item.id === target || item.title.toLowerCase() === normalizedTarget,
  );
  if (!documentRecord) {
    showToast("Linked document not found");
    return;
  }

  await openDocument(documentRecord.id);
  elements.outlineDialog.close();
}

async function renderLibrary() {
  try {
    libraryDocuments = storageAvailable ? await documentService.list() : libraryDocuments;
  } catch (error) {
    storageAvailable = false;
    showToast(formatError(error, "Could not read local library"));
  }
  renderTagFilters({
    activeTagFilter,
    documents: libraryDocuments,
    tagFilterList: elements.tagFilterList,
    onSelectTag: (tag) => {
      activeTagFilter = tag;
      void renderLibrary();
    },
  });
  const searchedDocuments = documentService.search(libraryDocuments, elements.librarySearch.value);
  renderDocumentList({
    activeDocumentId: activeDocument?.id,
    documents: filterLibraryDocuments(searchedDocuments, activeTagFilter),
    documentList: elements.documentList,
    searchQuery: elements.librarySearch.value,
    setHtml,
    onOpen: (documentRecord) => void openDocument(documentRecord.id),
    onDuplicate: (documentRecord) => void duplicateLibraryDocument(documentRecord),
    onDelete: (documentRecord) => void deleteLibraryDocument(documentRecord),
  });
}

async function duplicateLibraryDocument(documentRecord: MikroDocumentRecord) {
  try {
    activeDocument = await documentService.duplicate(documentRecord.id);
    isDirty = false;
    renderDocument(activeDocument);
    await renderLibrary();
    showToast("Duplicated document");
  } catch (error) {
    showToast(formatError(error, "Could not duplicate document"));
  }
}

async function deleteLibraryDocument(documentRecord: MikroDocumentRecord) {
  if (!window.confirm(`Delete "${documentRecord.title}"?`)) {
    return;
  }

  try {
    await documentService.delete(documentRecord.id);
    libraryDocuments = await documentService.list();
    if (activeDocument?.id === documentRecord.id) {
      activeDocument = libraryDocuments[0] ?? (await documentService.create());
      isDirty = false;
      renderDocument(activeDocument);
    }
    await renderLibrary();
    showToast("Deleted document");
  } catch (error) {
    showToast(formatError(error, "Could not delete document"));
  }
}

function renderHistory() {
  if (!activeDocument) {
    elements.historyList.replaceChildren();
    return;
  }

  renderHistoryList({
    historyList: elements.historyList,
    snapshots: activeDocument.snapshots,
    setHtml,
    onPreview: previewSnapshot,
    onRestore: (snapshotId) => void restoreSnapshot(snapshotId),
  });
}

function previewSnapshot(snapshot: MikroDocumentSnapshot) {
  previewedSnapshot = snapshot;
  renderSnapshotPreview({
    currentMarkdown: elements.editor.value,
    previewContent: elements.historyPreviewContent,
    previewSummary: elements.historyPreviewSummary,
    snapshot,
  });
  openDialog(elements.historyPreviewDialog);
}

async function restorePreviewedSnapshot() {
  if (!previewedSnapshot) {
    return;
  }

  await restoreSnapshot(previewedSnapshot.id);
  elements.historyPreviewDialog.close();
}

async function restoreSnapshot(snapshotId: string) {
  if (!(await confirmDirtyChange())) {
    return;
  }

  if (!activeDocument) {
    return;
  }

  activeDocument = await documentService.restoreSnapshot(activeDocument.id, snapshotId);
  isDirty = false;
  renderDocument(activeDocument);
  await renderLibrary();
  elements.historyDialog.close();
  showToast("Restored version");
}

function runFormattingCommand(command: string) {
  if (command === "table") {
    openDialog(elements.tableDialog);
    window.setTimeout(() => elements.tableColumnsInput.focus(), 0);
    return;
  }

  if (command === "image") {
    openDialog(elements.imageDialog);
    window.setTimeout(() => elements.imageSourceInput.focus(), 0);
    return;
  }

  if (command === "link") {
    openLinkDialog();
    return;
  }

  const source = elements.editor.value;
  const selectionStart = elements.editor.selectionStart;
  const selectionEnd = elements.editor.selectionEnd;
  const result = getInlineFormattingResult(command, source, selectionStart, selectionEnd);
  if (!result) {
    return;
  }

  applyEditorCommand(result);
}

function applyEditorCommand(result: {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
}) {
  elements.editor.value = result.markdown;
  elements.editor.setSelectionRange(result.selectionStart, result.selectionEnd);
  elements.editor.focus();
  handleEditorInput();
}

function openLinkDialog() {
  const selected = elements.editor.value.slice(
    elements.editor.selectionStart,
    elements.editor.selectionEnd,
  );
  elements.linkLabelInput.value = selected;
  elements.linkKindSelect.value = isLikelyUrl(selected) ? "external" : "document";
  elements.linkTargetInput.value = isLikelyUrl(selected) ? selected : "";
  refreshLinkTargetOptions();
  openDialog(elements.linkDialog);
  window.setTimeout(
    () =>
      (elements.linkLabelInput.value ? elements.linkTargetInput : elements.linkLabelInput).focus(),
    0,
  );
}

function refreshLinkTargetOptions() {
  elements.linkTargetOptions.replaceChildren();
  const kind = elements.linkKindSelect.value;
  const values =
    kind === "internal"
      ? MarkdownService.getOutline(elements.editor.value).map((heading) => `#${heading.id}`)
      : kind === "document"
        ? libraryDocuments.map((documentRecord) => documentRecord.title)
        : [];

  elements.linkTargetOptions.replaceChildren(
    ...values.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      return option;
    }),
  );
}

function insertLinkFromDialog() {
  const linkKind = elements.linkKindSelect.value as "external" | "internal" | "document";
  const documentTarget =
    linkKind === "document"
      ? libraryDocuments.find(
          (documentRecord) =>
            documentRecord.title.toLowerCase() === elements.linkTargetInput.value.toLowerCase(),
        )
      : null;
  const result = MarkdownCommandService.insertSmartLink(
    elements.editor.value,
    elements.editor.selectionStart,
    elements.editor.selectionEnd,
    {
      label: elements.linkLabelInput.value || documentTarget?.title,
      kind: linkKind,
      target: documentTarget?.id ?? elements.linkTargetInput.value,
    },
  );
  applyEditorCommand(result);
  elements.linkDialog.close();
}

function addTableRowAtCursor() {
  const result = MarkdownCommandService.addTableRow(
    elements.editor.value,
    elements.editor.selectionStart,
  );
  if (!result) {
    showToast("Place the cursor inside a table");
    return;
  }

  applyEditorCommand(result);
  showToast("Added table row");
}

function addTableColumnAtCursor() {
  const result = MarkdownCommandService.addTableColumn(
    elements.editor.value,
    elements.editor.selectionStart,
  );
  if (!result) {
    showToast("Place the cursor inside a table");
    return;
  }

  applyEditorCommand(result);
  showToast("Added table column");
}

function insertTableFromDialog() {
  const result = MarkdownCommandService.insertTable(
    elements.editor.value,
    elements.editor.selectionStart,
    Number(elements.tableColumnsInput.value),
    Number(elements.tableRowsInput.value),
  );
  applyEditorCommand(result);
  elements.tableDialog.close();
}

function insertImageFromDialog() {
  const result = MarkdownCommandService.insertImage(
    elements.editor.value,
    elements.editor.selectionStart,
    {
      source: elements.imageSourceInput.value,
      alt: elements.imageAltInput.value,
      caption: elements.imageCaptionInput.value,
      layout: elements.imageLayoutSelect.value as ImageLayout,
    },
  );
  applyEditorCommand(result);
  elements.imageDialog.close();
}

function insertMarkdownAtSelection(markdown: string) {
  const selectionStart = elements.editor.selectionStart;
  const selectionEnd = elements.editor.selectionEnd;
  const result = replaceSourceRange(elements.editor.value, selectionStart, selectionEnd, markdown);
  elements.editor.value = result.markdown;
  elements.editor.setSelectionRange(result.cursor, result.cursor);
  elements.editor.focus();
  handleEditorInput();
}

function hasSelectedText() {
  return elements.editor.selectionEnd > elements.editor.selectionStart;
}

function jumpToLine(lineNumber: number) {
  const lines = elements.editor.value.split("\n");
  const lineIndex = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
  const position = getLineStartPosition(elements.editor.value, lineIndex);

  if (isEditing(elements)) {
    elements.editor.setSelectionRange(position, position);
    elements.editor.focus({ preventScroll: true });
    resizeEditor(elements);
    scrollRawLineTowardClick(elements.editor, lineIndex, window.innerHeight * 0.35);
    return;
  }

  elements.editor.scrollTop = 0;
  renderPrettyEditor();
  window.requestAnimationFrame(() =>
    scrollPrettySourceLineIntoView(elements.prettyEditor, lineIndex),
  );
}

function openCommandPalette() {
  commands = buildCommands({
    addTableColumn: addTableColumnAtCursor,
    addTableRow: addTableRowAtCursor,
    createDocument,
    deleteActiveDocument,
    duplicateActiveDocument,
    exportBackup,
    exportDocx,
    exportHtml,
    exportMarkdown,
    exportMarkdownArchive,
    exportPdf: () => window.print(),
    importBackup: () => elements.backupInput.click(),
    importFile: () => elements.fileInput.click(),
    insertChecklist: () => runFormattingCommand("checklist"),
    insertCodeBlock: () => runFormattingCommand("code"),
    insertDivider: () => runFormattingCommand("divider"),
    openDataSafety: openDataSafetyDialog,
    openFind: openFindDialog,
    openHistory: () => {
      renderHistory();
      openDialog(elements.historyDialog);
    },
    openImageDialog: () => openDialog(elements.imageDialog),
    openLibrary: () => openDialog(elements.libraryDialog),
    openLinkDialog,
    openOutline: () => openDialog(elements.outlineDialog),
    openSettings: () => openDialog(elements.settingsDialog),
    openShortcuts: () => openDialog(elements.shortcutsDialog),
    openTableDialog: () => openDialog(elements.tableDialog),
    repairLinks: repairBacklinksFromCommand,
    resetLocalData,
    save: () => saveActiveDocument("manual"),
    toggleSourceMode,
    toggleTheme,
  });
  commandIndex = 0;
  elements.commandInput.value = "";
  openDialog(elements.commandDialog);
  renderCommands();
  window.setTimeout(() => elements.commandInput.focus(), 0);
}

function openFindDialog() {
  renderFindResults();
  openDialog(elements.findDialog);
  window.setTimeout(() => elements.findInput.focus(), 0);
}

function renderFindResults() {
  const results = MarkdownService.searchLines(elements.editor.value, elements.findInput.value);
  renderFindResultsView({
    findList: elements.findList,
    query: elements.findInput.value,
    results,
    setHtml,
    onJumpToLine: (line) => {
      elements.findDialog.close();
      jumpToLine(line);
    },
  });
}

function replaceNextMatch() {
  const query = elements.findInput.value;
  if (!query) {
    return;
  }

  const match = findNextSourceMatch(elements.editor.value, query, elements.editor.selectionEnd);
  if (!match) {
    showToast("No match");
    return;
  }

  replaceEditorSourceRange(match.start, match.end, elements.replaceInput.value);
  renderFindResults();
  showToast("Replaced match");
}

function replaceAllMatches() {
  const query = elements.findInput.value;
  if (!query) {
    return;
  }

  const result = replaceAllSourceMatches(elements.editor.value, query, elements.replaceInput.value);
  if (!result.count) {
    showToast("No matches");
    return;
  }

  elements.editor.value = result.markdown;
  elements.editor.focus();
  handleEditorInput();
  renderFindResults();
  showToast(`Replaced ${result.count} matches`);
}

function replaceEditorSourceRange(start: number, end: number, replacement: string) {
  const result = replaceSourceRange(elements.editor.value, start, end, replacement);
  elements.editor.value = result.markdown;
  elements.editor.focus();
  elements.editor.setSelectionRange(result.cursor, result.cursor);
  handleEditorInput();
}

function renderCommands() {
  const filtered = filterCommands(commands, elements.commandInput.value);
  commandIndex = clampCommandIndex(commandIndex, filtered.length);
  renderCommandList(elements.commandList, filtered, commandIndex, runCommand, setHtml);
}

function handleCommandKeydown(event: KeyboardEvent) {
  const items = [...elements.commandList.querySelectorAll<HTMLButtonElement>(".command-item")];
  if (event.key === "ArrowDown") {
    event.preventDefault();
    commandIndex = getCommandIndexAfterKey(commandIndex, event.key, items.length);
    renderCommands();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    commandIndex = getCommandIndexAfterKey(commandIndex, event.key, items.length);
    renderCommands();
  } else if (event.key === "Enter") {
    event.preventDefault();
    items[commandIndex]?.click();
  } else if (event.key === "Escape") {
    elements.commandDialog.close();
  }
}

function runCommand(command: Command) {
  elements.commandDialog.close();
  void command.run();
}

function handleKeyboard(event: KeyboardEvent) {
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openCommandPalette();
  } else if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveActiveDocument("manual");
  } else if (modifier && event.key.toLowerCase() === "b") {
    event.preventDefault();
    runFormattingCommand("bold");
  } else if (modifier && event.key.toLowerCase() === "i") {
    event.preventDefault();
    runFormattingCommand("italic");
  } else if (modifier && event.key.toLowerCase() === "n") {
    event.preventDefault();
    void createDocument();
  } else if (modifier && event.key.toLowerCase() === "o") {
    event.preventDefault();
    openDialog(elements.libraryDialog);
  } else if (modifier && event.key.toLowerCase() === "f") {
    event.preventDefault();
    openFindDialog();
  } else if (modifier && event.key.toLowerCase() === "p") {
    event.preventDefault();
    window.print();
  } else if (!modifier && event.key === "?" && !isTypingInField(event.target)) {
    event.preventDefault();
    openDialog(elements.shortcutsDialog);
  }
}

async function importMarkdownFile() {
  const file = elements.fileInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    if (!(await confirmDirtyChange())) {
      return;
    }

    const isDocx =
      file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const markdown = isDocx
      ? await DocxService.importMarkdown(await readFileAsArrayBuffer(file))
      : await readFileAsText(file);
    activeDocument = storageAvailable
      ? await documentService.create({
          title: file.name.replace(/\.(md|markdown|txt|docx)$/i, ""),
          markdown,
        })
      : MikroDocument.create({
          title: file.name.replace(/\.(md|markdown|txt|docx)$/i, ""),
          markdown,
        }).toRecord();
    isDirty = !storageAvailable;
    renderDocument(activeDocument);
    await renderLibrary();
    showToast(isDocx ? "Imported DOCX" : "Imported Markdown");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not import file");
  } finally {
    elements.fileInput.value = "";
  }
}

async function importBackupFile() {
  const file = elements.backupInput.files?.[0];
  if (!file) {
    return;
  }

  try {
    pendingBackupRecords = parseBackupRecords(await readFileAsText(file));
    renderBackupReview({
      filename: file.name,
      records: pendingBackupRecords,
      summary: elements.backupReviewSummary,
    });
    openDialog(elements.backupReviewDialog);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not import backup");
  } finally {
    elements.backupInput.value = "";
  }
}

async function importPendingBackup(replace: boolean) {
  if (!pendingBackupRecords.length) {
    elements.backupReviewDialog.close();
    return;
  }

  if (replace && !window.confirm("Replace every local document with this backup?")) {
    return;
  }

  try {
    libraryDocuments = await documentService.importBackup(pendingBackupRecords, replace);
    activeDocument = libraryDocuments[0] ?? (await documentService.create());
    isDirty = false;
    storageAvailable = true;
    renderDocument(activeDocument);
    await renderLibrary();
    elements.backupReviewDialog.close();
    showToast(replace ? "Replaced library from backup" : "Appended backup");
  } catch (error) {
    showToast(formatError(error, "Could not import backup"));
  }
}

async function exportMarkdown() {
  if (!activeDocument) {
    return;
  }

  try {
    await fileGateway.saveText(
      `${slugFileName(elements.titleInput.value || activeDocument.title)}.md`,
      getExportMarkdown(),
      "text/markdown",
    );
    showToast("Exported Markdown");
  } catch (error) {
    showToast(formatError(error, "Could not export Markdown"));
  }
}

async function exportHtml() {
  if (!activeDocument) {
    return;
  }

  const title = elements.titleInput.value || activeDocument.title;
  const html = createStandaloneHtml(title, getExportMarkdown());

  try {
    await fileGateway.saveText(`${slugFileName(title)}.html`, html, "text/html");
    showToast("Exported HTML");
  } catch (error) {
    showToast(formatError(error, "Could not export HTML"));
  }
}

async function exportDocx() {
  if (!activeDocument) {
    return;
  }

  try {
    const title = elements.titleInput.value || activeDocument.title;
    const bytes = DocxService.exportMarkdown(getExportMarkdown(), title);
    await fileGateway.saveBytes(
      `${slugFileName(title)}.docx`,
      bytes,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    showToast("Exported DOCX with simplified styling");
  } catch (error) {
    showToast(formatError(error, "Could not export DOCX"));
  }
}

function getExportMarkdown() {
  return MarkdownService.withTitle(
    elements.editor.value,
    elements.titleInput.value || activeDocument?.title || "",
  );
}

async function exportBackup() {
  try {
    const records = storageAvailable ? await documentService.list() : libraryDocuments;
    await fileGateway.saveText(
      `mikrodocs-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(records, null, 2),
      "application/json",
    );
    settings = { ...settings, lastBackupAt: new Date().toISOString() };
    saveSettings();
    await renderDataSafety();
    showToast(`Backed up ${records.length} document${records.length === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(formatError(error, "Could not export backup"));
  }
}

async function exportMarkdownArchive() {
  try {
    const records = storageAvailable ? await documentService.list() : libraryDocuments;
    const bytes = DocumentArchiveService.createMarkdownZip(records);
    await fileGateway.saveBytes(
      `mikrodocs-markdown-${new Date().toISOString().slice(0, 10)}.zip`,
      bytes,
      "application/zip",
    );
    settings = { ...settings, lastBackupAt: new Date().toISOString() };
    saveSettings();
    await renderDataSafety();
    showToast(`Exported ${records.length} Markdown document${records.length === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(formatError(error, "Could not export Markdown ZIP"));
  }
}

async function openDataSafetyDialog() {
  await renderDataSafety();
  openDialog(elements.dataSafetyDialog);
}

async function renderDataSafety() {
  const records = storageAvailable ? await documentService.list() : libraryDocuments;
  const storage = await storageService.getStatus();
  const activeAssetSummary = DocumentArchiveService.summarizeImages(elements.editor.value);
  const allAssetSummary = records
    .map((documentRecord) => DocumentArchiveService.summarizeImages(documentRecord.markdown))
    .reduce(mergeAssetSummaries, createEmptyAssetSummary());

  renderDataSafetySummary({
    activeAssetSummary,
    allAssetSummary,
    lastBackupAt: settings.lastBackupAt,
    records,
    storage,
    summary: elements.dataSafetySummary,
  });
}

async function requestPersistentStorage() {
  try {
    const persisted = await storageService.requestPersistence();
    await renderDataSafety();
    showToast(
      persisted ? "Offline storage is protected" : "Browser did not grant persistent storage",
    );
  } catch (error) {
    showToast(formatError(error, "Could not request persistent storage"));
  }
}

async function resetLocalData() {
  if (!window.confirm("Delete all local MikroDocs documents?")) {
    return;
  }

  try {
    await documentService.clear();
    activeDocument = await documentService.create();
    isDirty = false;
    renderDocument(activeDocument);
    await renderLibrary();
    showToast("Reset local data");
  } catch (error) {
    showToast(formatError(error, "Could not reset local data"));
  }
}

function toggleTheme() {
  settings = toggleThemePreference(settings);
  saveSettings();
}

function toggleSourceMode() {
  settings = toggleSourceModePreference(settings);
  saveSettings();
}

function updateSettingsFromControls() {
  settings = readSettingsFromControls(settings, elements);
  saveSettings();
}

function saveSettings() {
  try {
    settingsRepository.save(settings);
    applySettings();
  } catch {
    showToast("Could not save settings");
  }
}

function applySettings() {
  applyEditorSettings(settings, elements);
  renderPrettyEditor();
}

function openDialog(dialog: HTMLDialogElement) {
  dialogController.open(dialog);
}

function setHtml(element: Element, html: string) {
  setSafeHtml(element, html, trustedTypesPolicy);
}

function showToast(message: string) {
  elements.toast.textContent = message;
  elements.toast.dataset.visible = "true";
  window.setTimeout(() => {
    elements.toast.dataset.visible = "false";
  }, 1800);
}

async function repairBacklinksFromCommand() {
  if (!activeDocument) {
    return;
  }

  const previousTitle = window.prompt("Previous document title", lastSavedTitle);
  if (!previousTitle?.trim()) {
    return;
  }

  const repairedCount = await repairBacklinksAfterRename(
    previousTitle.trim(),
    elements.titleInput.value.trim() || activeDocument.title,
    activeDocument.id,
  );
  await renderLibrary();
  showToast(`Repaired ${repairedCount} document${repairedCount === 1 ? "" : "s"}`);
}

async function repairBacklinksAfterRename(
  previousTitle: string,
  nextTitle: string,
  documentId: string,
) {
  if (
    !storageAvailable ||
    !previousTitle ||
    !nextTitle ||
    previousTitle.toLowerCase() === nextTitle.toLowerCase()
  ) {
    return 0;
  }

  const documents = await documentService.list();
  let repairedCount = 0;
  for (const documentRecord of documents) {
    if (documentRecord.id === documentId) {
      continue;
    }

    const nextMarkdown = repairDocumentLinkTargets(
      documentRecord.markdown,
      previousTitle,
      nextTitle,
    );
    if (nextMarkdown === documentRecord.markdown) {
      continue;
    }

    await documentService.update(documentRecord.id, {
      markdown: nextMarkdown,
      title: documentRecord.title,
      saveSnapshot: true,
      snapshotReason: "manual",
    });
    repairedCount += 1;
  }

  return repairedCount;
}

function notifyBackupReminder() {
  if (!shouldShowBackupReminder(libraryDocuments, settings.lastBackupAt)) {
    return;
  }

  window.setTimeout(() => showToast("Backup recommended"), 500);
}

void boot();
