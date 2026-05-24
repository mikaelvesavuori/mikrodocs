interface EditorSurfaceElements {
  editorShell: HTMLElement;
  editor: HTMLTextAreaElement;
  prettyEditor: HTMLElement;
}

export function isEditing(elements: EditorSurfaceElements) {
  return elements.editorShell.dataset.editing === "true";
}

export function setEditingMode(elements: EditorSurfaceElements, editing: boolean) {
  elements.editorShell.dataset.editing = String(editing);
}

export function getActiveLineIndex(markdown: string, cursorPosition: number) {
  return markdown.slice(0, cursorPosition).split("\n").length - 1;
}

export function getLineStartPosition(markdown: string, lineIndex: number) {
  const lines = markdown.split("\n");
  const clampedLineIndex = Math.max(0, Math.min(lines.length - 1, lineIndex));
  return lines.slice(0, clampedLineIndex).join("\n").length + (clampedLineIndex > 0 ? 1 : 0);
}

export function resizeEditor(elements: EditorSurfaceElements) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  if (isEditing(elements)) {
    elements.editor.style.height = "auto";
  }
  elements.prettyEditor.style.minHeight = "auto";
  const renderedHeight = elements.prettyEditor.scrollHeight;
  const sourceHeight = isEditing(elements) ? elements.editor.scrollHeight : 0;
  const nextHeight = Math.max(sourceHeight, renderedHeight, window.innerHeight - 230);
  elements.editor.style.height = `${nextHeight}px`;
  elements.prettyEditor.style.minHeight = `${nextHeight}px`;
  window.scrollTo(scrollX, scrollY);
}

export function syncPrettyEditorScroll(elements: EditorSurfaceElements) {
  elements.prettyEditor.style.transform = isEditing(elements)
    ? `translateY(-${elements.editor.scrollTop}px)`
    : "translateY(0)";
}

export function getPrettySourceLineFromPoint(
  prettyEditor: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const blocks = [
    ...prettyEditor.querySelectorAll<HTMLElement>("[data-source-start][data-source-end]"),
  ];
  const block =
    blocks.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return (
        clientY >= rect.top &&
        clientY <= rect.bottom &&
        clientX >= rect.left &&
        clientX <= rect.right
      );
    }) ??
    blocks.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    }) ??
    blocks.reduce<HTMLElement | null>((closest, candidate) => {
      const rect = candidate.getBoundingClientRect();
      const distance = Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
      if (!closest) {
        return candidate;
      }

      const closestRect = closest.getBoundingClientRect();
      const closestDistance = Math.min(
        Math.abs(clientY - closestRect.top),
        Math.abs(clientY - closestRect.bottom),
      );
      return distance < closestDistance ? candidate : closest;
    }, null);

  const start = Number(block?.dataset.sourceStart ?? 0);
  const end = Number(block?.dataset.sourceEnd ?? start);
  if (!block || start === end) {
    return start;
  }

  const rect = block.getBoundingClientRect();
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return Math.max(start, Math.min(end, start + Math.floor(ratio * (end - start + 1))));
}

export function getApproximateLinePosition(
  editor: HTMLTextAreaElement,
  lineNumber: number,
  clientX: number,
) {
  const lines = editor.value.split("\n");
  const line = lines[lineNumber] ?? "";
  const lineStart = getLineStartPosition(editor.value, lineNumber);
  if (!line) {
    return lineStart;
  }

  const rect = editor.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
  return lineStart + Math.round(line.length * ratio);
}

export function focusEditorAt(
  elements: EditorSurfaceElements,
  position: number,
  lineNumber: number,
  targetClientY: number,
) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  setEditingMode(elements, true);
  elements.editor.focus({ preventScroll: true });
  elements.editor.setSelectionRange(position, position);
  resizeEditor(elements);
  window.scrollTo(scrollX, scrollY);
  scrollRawLineTowardClick(elements.editor, lineNumber, targetClientY);
}

export function scrollRawLineTowardClick(
  editor: HTMLTextAreaElement,
  lineNumber: number,
  targetClientY: number,
) {
  const lineHeight = getEditorLineHeight(editor);
  const editorTop = editor.getBoundingClientRect().top;
  const rawLineClientY = editorTop + lineHeight * lineNumber + lineHeight * 0.5;
  const viewportMargin = Math.min(160, window.innerHeight * 0.22);
  const clampedTargetY = Math.max(
    viewportMargin,
    Math.min(window.innerHeight - viewportMargin, targetClientY),
  );
  window.scrollBy(0, rawLineClientY - clampedTargetY);
}

export function getEditorLineHeight(editor: HTMLTextAreaElement) {
  const computedStyle = window.getComputedStyle(editor);
  const parsed = Number.parseFloat(computedStyle.lineHeight);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return Number.parseFloat(computedStyle.fontSize) * 1.72;
}

export function scrollPrettySourceLineIntoView(prettyEditor: HTMLElement, lineIndex: number) {
  const blocks = [
    ...prettyEditor.querySelectorAll<HTMLElement>("[data-source-start][data-source-end]"),
  ];
  const block = blocks.find((candidate) => {
    const start = Number(candidate.dataset.sourceStart ?? 0);
    const end = Number(candidate.dataset.sourceEnd ?? start);
    return lineIndex >= start && lineIndex <= end;
  });

  if (!block) {
    return;
  }

  const blockRect = block.getBoundingClientRect();
  const targetTop = Math.max(0, window.scrollY + blockRect.top - window.innerHeight * 0.28);
  window.scrollTo({ top: targetTop, behavior: "smooth" });
}
