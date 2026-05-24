import { escapeRegExp } from "./formatters.js";

export function isLikelyUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value) || /^mailto:\S+@\S+$/i.test(value);
}

export function repairDocumentLinkTargets(
  markdown: string,
  previousTitle: string,
  nextTitle: string,
) {
  const escapedTitle = escapeRegExp(previousTitle);
  return markdown
    .replaceAll(new RegExp(`\\[\\[${escapedTitle}\\]\\]`, "g"), `[[${nextTitle}]]`)
    .replaceAll(new RegExp(`\\]\\(${escapedTitle}\\)`, "g"), `](${nextTitle})`);
}
