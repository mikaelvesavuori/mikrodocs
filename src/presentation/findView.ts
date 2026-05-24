import { highlightSearchResult } from "./formatters.js";
import { createEmptyState } from "./viewHelpers.js";

interface SearchLineResult {
  line: number;
  matchEnd: number;
  matchStart: number;
  text: string;
}

interface RenderFindResultsOptions {
  findList: HTMLElement;
  query: string;
  results: SearchLineResult[];
  setHtml: (element: Element, html: string) => void;
  onJumpToLine: (line: number) => void;
}

export function renderFindResultsView({
  findList,
  query,
  results,
  setHtml,
  onJumpToLine,
}: RenderFindResultsOptions) {
  findList.replaceChildren(
    ...(results.length
      ? results.map((result) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "find-result";
          setHtml(
            button,
            `<span>Line ${result.line}</span><small>${highlightSearchResult(result.text, result.matchStart, result.matchEnd)}</small>`,
          );
          button.addEventListener("click", () => onJumpToLine(result.line));
          return button;
        })
      : [createEmptyState(query ? "No matches" : "Type to search this document")]),
  );
}
