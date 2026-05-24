import { escapeRegExp } from "./formatters.js";

export function findNextSourceMatch(source: string, query: string, startAt: number) {
  if (!query) {
    return null;
  }

  const lowerSource = source.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const fromCursor = lowerSource.indexOf(lowerQuery, startAt);
  const start = fromCursor >= 0 ? fromCursor : lowerSource.indexOf(lowerQuery);
  if (start < 0) {
    return null;
  }

  return { start, end: start + query.length };
}

export function replaceSourceRange(
  source: string,
  start: number,
  end: number,
  replacement: string,
) {
  return {
    cursor: start + replacement.length,
    markdown: `${source.slice(0, start)}${replacement}${source.slice(end)}`,
  };
}

export function replaceAllSourceMatches(source: string, query: string, replacement: string) {
  if (!query) {
    return { count: 0, markdown: source };
  }

  const expression = new RegExp(escapeRegExp(query), "gi");
  const matches = source.match(expression);
  if (!matches?.length) {
    return { count: 0, markdown: source };
  }

  return {
    count: matches.length,
    markdown: source.replaceAll(expression, () => replacement),
  };
}
