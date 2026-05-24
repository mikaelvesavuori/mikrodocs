import { describe, expect, it } from "vitest";

import { MikroDocument } from "../../src/domain/index.js";
import { parseBackupRecords } from "../../src/presentation/backupRecords.js";
import { shouldShowBackupReminder } from "../../src/presentation/backupReminder.js";
import { createEmptyAssetSummary, mergeAssetSummaries } from "../../src/presentation/backupView.js";
import {
  clampCommandIndex,
  filterCommands,
  getCommandIndexAfterKey,
} from "../../src/presentation/commandPalette.js";
import { buildCommands } from "../../src/presentation/commands.js";
import { isLikelyUrl, repairDocumentLinkTargets } from "../../src/presentation/documentLinks.js";
import {
  getActiveLineIndex,
  getApproximateLinePosition,
  getLineStartPosition,
} from "../../src/presentation/editorSurface.js";
import {
  findNextSourceMatch,
  replaceAllSourceMatches,
  replaceSourceRange,
} from "../../src/presentation/findController.js";
import { escapeText, formatStorageUsage } from "../../src/presentation/formatters.js";
import { getInlineFormattingResult } from "../../src/presentation/formattingCommands.js";
import { filterLibraryDocuments } from "../../src/presentation/libraryView.js";
import { findBacklinks } from "../../src/presentation/outlineView.js";
import {
  toggleSourceModePreference,
  toggleThemePreference,
} from "../../src/presentation/settingsController.js";
import { createStandaloneHtml } from "../../src/presentation/standaloneHtml.js";
import { setSafeHtml } from "../../src/presentation/viewHelpers.js";

describe("presentation helpers", () => {
  it("builds the command palette from injected actions", () => {
    const noop = () => undefined;
    const commands = buildCommands({
      addTableColumn: noop,
      addTableRow: noop,
      createDocument: noop,
      deleteActiveDocument: noop,
      duplicateActiveDocument: noop,
      exportBackup: noop,
      exportDocx: noop,
      exportHtml: noop,
      exportMarkdown: noop,
      exportMarkdownArchive: noop,
      exportPdf: noop,
      importBackup: noop,
      importFile: noop,
      insertChecklist: noop,
      insertCodeBlock: noop,
      insertDivider: noop,
      openDataSafety: noop,
      openFind: noop,
      openHistory: noop,
      openImageDialog: noop,
      openLibrary: noop,
      openLinkDialog: noop,
      openOutline: noop,
      openSettings: noop,
      openShortcuts: noop,
      openTableDialog: noop,
      repairLinks: noop,
      resetLocalData: noop,
      save: noop,
      toggleSourceMode: noop,
      toggleTheme: noop,
    });

    expect(commands.map((command) => command.id)).toContain("data-safety");
    expect(commands.map((command) => command.id)).toContain("source-mode");
    expect(commands.find((command) => command.id === "save")?.shortcut).toBe("Cmd/Ctrl+S");
  });

  it("filters command palette commands and moves the active index", () => {
    const commands = [
      { id: "save", title: "Save", detail: "Write document", run: () => undefined },
      {
        id: "source",
        title: "Toggle source mode",
        detail: "Keep Markdown source visible",
        run: () => undefined,
      },
    ];

    expect(filterCommands(commands, "markdown").map((command) => command.id)).toEqual(["source"]);
    expect(clampCommandIndex(4, commands.length)).toBe(1);
    expect(getCommandIndexAfterKey(0, "ArrowDown", commands.length)).toBe(1);
    expect(getCommandIndexAfterKey(1, "ArrowUp", commands.length)).toBe(0);
  });

  it("builds inline formatting command results", () => {
    expect(getInlineFormattingResult("bold", "word", 0, 4)).toEqual({
      markdown: "**word**",
      selectionEnd: 6,
      selectionStart: 2,
    });
    expect(getInlineFormattingResult("heading", "Title", 0, 5)).toEqual({
      markdown: "## Title",
      selectionEnd: 8,
      selectionStart: 0,
    });
    expect(getInlineFormattingResult("unknown", "word", 0, 0)).toBeNull();
  });

  it("calculates editor line positions for the pretty source surface", () => {
    const markdown = "Alpha\nBeta\nGamma";
    const editor = {
      value: markdown,
      getBoundingClientRect: () => ({ left: 10, width: 100 }),
    } as HTMLTextAreaElement;

    expect(getActiveLineIndex(markdown, 8)).toBe(1);
    expect(getLineStartPosition(markdown, 2)).toBe(11);
    expect(getApproximateLinePosition(editor, 1, 60)).toBe(8);
  });

  it("finds and replaces source ranges without depending on selection state", () => {
    expect(findNextSourceMatch("Alpha beta alpha", "alpha", 1)).toEqual({ start: 11, end: 16 });
    expect(findNextSourceMatch("Alpha beta", "", 0)).toBeNull();
    expect(findNextSourceMatch("Alpha beta", "missing", 0)).toBeNull();
    expect(replaceSourceRange("Alpha beta", 6, 10, "gamma")).toEqual({
      cursor: 11,
      markdown: "Alpha gamma",
    });
    expect(replaceAllSourceMatches("Price is $1. $1 again.", "$1", "$2")).toEqual({
      count: 2,
      markdown: "Price is $2. $2 again.",
    });
  });

  it("toggles persisted editor preferences without reading controls", () => {
    const settings = {
      autosave: true,
      font: "system" as const,
      fontScale: 1,
      lastBackupAt: null,
      lastDocumentId: null,
      sourceMode: false,
      theme: "light" as const,
    };

    expect(toggleThemePreference(settings).theme).toBe("dark");
    expect(toggleSourceModePreference(settings).sourceMode).toBe(true);
  });

  it("formats and escapes display text", () => {
    expect(escapeText(`<script>"x"</script>`)).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    expect(formatStorageUsage(1024, 1024 * 1024)).toBe("1.0 KB of 1.0 MB");
  });

  it("repairs local document links and detects URL-like paste text", () => {
    expect(
      repairDocumentLinkTargets("See [[Old Title]] and [x](Old Title)", "Old Title", "New"),
    ).toBe("See [[New]] and [x](New)");
    expect(isLikelyUrl("https://example.com")).toBe(true);
    expect(isLikelyUrl("not a url")).toBe(false);
  });

  it("shows backup reminders only for meaningful unbacked-up libraries", () => {
    const starter = MikroDocument.create().toRecord();
    const realDocument = MikroDocument.create({
      title: "Plan",
      markdown: "# Plan\n\nShip.",
    }).toRecord();

    expect(shouldShowBackupReminder([starter], null)).toBe(false);
    expect(shouldShowBackupReminder([realDocument], null)).toBe(true);
    expect(shouldShowBackupReminder([realDocument], new Date().toISOString())).toBe(false);
  });

  it("filters library documents by active tag", () => {
    const plan = { ...MikroDocument.create({ title: "Plan" }).toRecord(), tags: ["work"] };
    const note = { ...MikroDocument.create({ title: "Note" }).toRecord(), tags: ["personal"] };

    expect(filterLibraryDocuments([plan, note], "work")).toEqual([plan]);
    expect(filterLibraryDocuments([plan, note], null)).toEqual([plan, note]);
  });

  it("finds document backlinks by title or stable document id", () => {
    const target = MikroDocument.create({ title: "Target" }).toRecord();
    const byTitle = MikroDocument.create({
      title: "By title",
      markdown: "[Read](Target)",
    }).toRecord();
    const byId = MikroDocument.create({
      title: "By id",
      markdown: `[[${target.id}]]`,
    }).toRecord();
    const unrelated = MikroDocument.create({
      title: "Unrelated",
      markdown: "[Nope](Other)",
    }).toRecord();

    expect(findBacklinks(target, [target, byTitle, byId, unrelated])).toEqual([byTitle, byId]);
  });

  it("merges image asset summaries", () => {
    expect(
      mergeAssetSummaries(
        { ...createEmptyAssetSummary(), embeddedImages: 1, embeddedBytes: 20 },
        { ...createEmptyAssetSummary(), remoteImages: 2, totalImages: 2 },
      ),
    ).toEqual({
      embeddedImages: 1,
      embeddedBytes: 20,
      remoteImages: 2,
      localImages: 0,
      totalImages: 2,
    });
  });

  it("parses valid backups and rejects malformed backup files", () => {
    const record = MikroDocument.create({
      title: "Backup",
      markdown: "# Backup",
    }).toRecord();

    expect(parseBackupRecords(JSON.stringify([record]))).toEqual([record]);
    expect(() => parseBackupRecords("[]")).toThrow("Backup file does not contain any documents");
    expect(() => parseBackupRecords(JSON.stringify([{ title: "Nope" }]))).toThrow(
      "Backup document 1 is missing required fields",
    );
  });

  it("sets HTML through an optional Trusted Types policy", () => {
    const element = { innerHTML: "" } as Element;

    setSafeHtml(element, "<strong>Safe</strong>", {
      createHTML: (value) => `${value}<em>trusted</em>`,
    });

    expect(element.innerHTML).toBe("<strong>Safe</strong><em>trusted</em>");
  });

  it("creates standalone rendered HTML exports", () => {
    const html = createStandaloneHtml("Title", "# Title\n\nBody");

    expect(html).toContain("<title>Title</title>");
    expect(html).toContain('<h1 id="title">Title</h1>');
  });
});
