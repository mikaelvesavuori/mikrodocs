export function createReviewLine(label: string, value: string) {
  const item = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  item.append(strong, ` ${value}`);
  return item;
}

export function createEmptyState(message: string) {
  const item = document.createElement("div");
  item.className = "empty-state";
  item.textContent = message;
  return item;
}

export function setSafeHtml(
  element: Element,
  html: string,
  trustedTypesPolicy?: { createHTML: (value: string) => unknown },
) {
  element.innerHTML = (trustedTypesPolicy?.createHTML(html) ?? html) as string;
}
