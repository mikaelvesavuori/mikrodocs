import type { Command } from "./commands.js";
import { escapeText } from "./formatters.js";

export function filterCommands(commands: Command[], term: string) {
  const normalizedTerm = term.toLowerCase().trim();
  return commands.filter((command) =>
    [command.title, command.detail, command.shortcut ?? ""].some((value) =>
      value.toLowerCase().includes(normalizedTerm),
    ),
  );
}

export function clampCommandIndex(index: number, count: number) {
  return Math.min(index, Math.max(0, count - 1));
}

export function getCommandIndexAfterKey(index: number, key: string, count: number) {
  if (key === "ArrowDown") {
    return Math.min(index + 1, count - 1);
  }

  if (key === "ArrowUp") {
    return Math.max(index - 1, 0);
  }

  return index;
}

export function renderCommandList(
  list: HTMLElement,
  commands: Command[],
  activeIndex: number,
  runCommand: (command: Command) => void,
  setHtml: (element: Element, html: string) => void,
) {
  list.replaceChildren(
    ...commands.map((command, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "command-item";
      button.dataset.active = String(index === activeIndex);
      setHtml(
        button,
        `<span><strong>${escapeText(command.title)}</strong><small>${escapeText(command.detail)}</small></span>${command.shortcut ? `<kbd>${escapeText(command.shortcut)}</kbd>` : ""}`,
      );
      button.addEventListener("click", () => runCommand(command));
      return button;
    }),
  );
}
