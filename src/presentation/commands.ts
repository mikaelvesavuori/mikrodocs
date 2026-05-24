export type Command = {
  id: string;
  title: string;
  detail: string;
  shortcut?: string;
  run: () => void | Promise<void>;
};

export interface CommandActions {
  addTableColumn: () => void;
  addTableRow: () => void;
  createDocument: () => void | Promise<void>;
  deleteActiveDocument: () => void | Promise<void>;
  duplicateActiveDocument: () => void | Promise<void>;
  exportBackup: () => void | Promise<void>;
  exportDocx: () => void | Promise<void>;
  exportHtml: () => void | Promise<void>;
  exportMarkdown: () => void | Promise<void>;
  exportMarkdownArchive: () => void | Promise<void>;
  exportPdf: () => void;
  importBackup: () => void;
  importFile: () => void;
  insertChecklist: () => void;
  insertCodeBlock: () => void;
  insertDivider: () => void;
  openDataSafety: () => void | Promise<void>;
  openFind: () => void;
  openHistory: () => void;
  openImageDialog: () => void;
  openLibrary: () => void;
  openLinkDialog: () => void;
  openOutline: () => void;
  openSettings: () => void;
  openShortcuts: () => void;
  openTableDialog: () => void;
  repairLinks: () => void | Promise<void>;
  resetLocalData: () => void | Promise<void>;
  save: () => void | Promise<void>;
  toggleSourceMode: () => void;
  toggleTheme: () => void;
}

export function buildCommands(actions: CommandActions): Command[] {
  return [
    {
      id: "save",
      title: "Save",
      detail: "Write current document to IndexedDB",
      shortcut: "Cmd/Ctrl+S",
      run: actions.save,
    },
    {
      id: "new",
      title: "New document",
      detail: "Create a blank local document",
      shortcut: "Cmd/Ctrl+N",
      run: actions.createDocument,
    },
    {
      id: "library",
      title: "Open library",
      detail: "Search local documents",
      shortcut: "Cmd/Ctrl+O",
      run: actions.openLibrary,
    },
    {
      id: "outline",
      title: "Open outline",
      detail: "Jump between headings",
      run: actions.openOutline,
    },
    {
      id: "find",
      title: "Find and replace",
      detail: "Search text, jump to matches, or replace",
      shortcut: "Cmd/Ctrl+F",
      run: actions.openFind,
    },
    {
      id: "history",
      title: "Open history",
      detail: "Restore a saved version",
      run: actions.openHistory,
    },
    {
      id: "duplicate",
      title: "Duplicate document",
      detail: "Create a copy of the current document",
      run: actions.duplicateActiveDocument,
    },
    {
      id: "delete",
      title: "Delete document",
      detail: "Remove the current document from local storage",
      run: actions.deleteActiveDocument,
    },
    {
      id: "settings",
      title: "Writing settings",
      detail: "Theme, font, scale, autosave",
      run: actions.openSettings,
    },
    {
      id: "data-safety",
      title: "Storage and backups",
      detail: "Review offline status, backups, and embedded assets",
      run: actions.openDataSafety,
    },
    {
      id: "shortcuts",
      title: "Keyboard shortcuts",
      detail: "Show available keyboard commands",
      shortcut: "?",
      run: actions.openShortcuts,
    },
    {
      id: "export-md",
      title: "Export Markdown",
      detail: "Download the current document",
      run: actions.exportMarkdown,
    },
    {
      id: "export-html",
      title: "Export HTML",
      detail: "Download a standalone rendered document",
      run: actions.exportHtml,
    },
    {
      id: "export-docx",
      title: "Export DOCX",
      detail: "Download a Word-compatible document with simplified styling",
      run: actions.exportDocx,
    },
    {
      id: "export-all-md",
      title: "Export all Markdown",
      detail: "Download every local document as a Markdown ZIP",
      run: actions.exportMarkdownArchive,
    },
    {
      id: "export-pdf",
      title: "Export PDF",
      detail: "Open print dialog using the document print stylesheet",
      shortcut: "Cmd/Ctrl+P",
      run: actions.exportPdf,
    },
    {
      id: "insert-link",
      title: "Insert link",
      detail: "Link to a URL, heading, or local document",
      run: actions.openLinkDialog,
    },
    {
      id: "insert-table",
      title: "Insert table",
      detail: "Choose columns and rows",
      run: actions.openTableDialog,
    },
    {
      id: "add-table-row",
      title: "Add table row",
      detail: "Insert a row in the table at the cursor",
      run: actions.addTableRow,
    },
    {
      id: "add-table-column",
      title: "Add table column",
      detail: "Insert a column in the table at the cursor",
      run: actions.addTableColumn,
    },
    {
      id: "insert-image",
      title: "Insert image",
      detail: "Add source, caption, and layout",
      run: actions.openImageDialog,
    },
    {
      id: "insert-checklist",
      title: "Insert checklist",
      detail: "Turn selected lines into task items",
      run: actions.insertChecklist,
    },
    {
      id: "insert-code-block",
      title: "Insert code block",
      detail: "Wrap the selection in a fenced block",
      run: actions.insertCodeBlock,
    },
    {
      id: "insert-divider",
      title: "Insert divider",
      detail: "Add a horizontal rule",
      run: actions.insertDivider,
    },
    {
      id: "backup",
      title: "Export backup",
      detail: "Download all local documents as JSON",
      run: actions.exportBackup,
    },
    {
      id: "repair-links",
      title: "Repair document links",
      detail: "Update backlinks after renaming this document",
      run: actions.repairLinks,
    },
    {
      id: "import-backup",
      title: "Import backup",
      detail: "Restore documents from MikroDocs JSON",
      run: actions.importBackup,
    },
    {
      id: "import-file",
      title: "Import Markdown or DOCX",
      detail: "Create a document from a local file",
      run: actions.importFile,
    },
    {
      id: "reset",
      title: "Reset local data",
      detail: "Delete all local documents",
      run: actions.resetLocalData,
    },
    {
      id: "theme",
      title: "Toggle theme",
      detail: "Light or dark mode",
      run: actions.toggleTheme,
    },
    {
      id: "source-mode",
      title: "Toggle source mode",
      detail: "Keep Markdown source visible while reading",
      run: actions.toggleSourceMode,
    },
  ];
}
