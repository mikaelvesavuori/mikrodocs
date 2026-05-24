import type { EditorSettings } from "../index.js";
import type { PresentationElements } from "./elements.js";

export function applyEditorSettings(settings: EditorSettings, elements: PresentationElements) {
  elements.html.dataset.theme = settings.theme;
  elements.html.dataset.font = settings.font;
  elements.html.dataset.sourceMode = String(settings.sourceMode);
  elements.html.style.setProperty("--editor-scale", String(settings.fontScale));
  const nextTheme = settings.theme === "dark" ? "light" : "dark";
  elements.themeIcon.setAttribute("href", settings.theme === "dark" ? "#icon-sun" : "#icon-moon");
  elements.themeButton.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  elements.themeButton.title = `Switch to ${nextTheme} mode`;
  elements.fontSelect.value = settings.font;
  elements.fontScale.value = String(settings.fontScale);
  elements.autosaveToggle.checked = settings.autosave;
  elements.sourceModeToggle.checked = settings.sourceMode;
}

export function readSettingsFromControls(
  currentSettings: EditorSettings,
  elements: PresentationElements,
): EditorSettings {
  return {
    theme: currentSettings.theme,
    font: elements.fontSelect.value as EditorSettings["font"],
    fontScale: Number(elements.fontScale.value),
    autosave: elements.autosaveToggle.checked,
    sourceMode: elements.sourceModeToggle.checked,
    lastBackupAt: currentSettings.lastBackupAt,
    lastDocumentId: currentSettings.lastDocumentId,
  };
}

export function toggleThemePreference(settings: EditorSettings): EditorSettings {
  return { ...settings, theme: settings.theme === "dark" ? "light" : "dark" };
}

export function toggleSourceModePreference(settings: EditorSettings): EditorSettings {
  return { ...settings, sourceMode: !settings.sourceMode };
}
