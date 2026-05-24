import { MarkdownCommandService } from "../index.js";

type EditorCommandResult = {
  markdown: string;
  selectionEnd: number;
  selectionStart: number;
};

export function getInlineFormattingResult(
  command: string,
  source: string,
  selectionStart: number,
  selectionEnd: number,
): EditorCommandResult | null {
  const operations: Record<string, () => EditorCommandResult> = {
    bold: () => MarkdownCommandService.toggleWrap(source, selectionStart, selectionEnd, "**"),
    italic: () => MarkdownCommandService.toggleWrap(source, selectionStart, selectionEnd, "*"),
    heading: () => MarkdownCommandService.prefixLines(source, selectionStart, selectionEnd, "## "),
    list: () => MarkdownCommandService.prefixLines(source, selectionStart, selectionEnd, "- "),
    checklist: () =>
      MarkdownCommandService.prefixLines(source, selectionStart, selectionEnd, "- [ ] "),
    quote: () => MarkdownCommandService.prefixLines(source, selectionStart, selectionEnd, "> "),
    code: () => MarkdownCommandService.insertCodeBlock(source, selectionStart, selectionEnd),
    divider: () => MarkdownCommandService.insertDivider(source, selectionStart),
  };

  return operations[command]?.() ?? null;
}
