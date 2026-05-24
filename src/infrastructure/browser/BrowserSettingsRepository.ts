import type { EditorSettings } from "../../interfaces/Settings.js";

const settingsKey = "mikrodocs_settings";

export const defaultEditorSettings: EditorSettings = {
  theme: "light",
  font: "system",
  fontScale: 1,
  autosave: true,
  sourceMode: false,
  lastBackupAt: null,
  lastDocumentId: null,
};

/**
 * @description Stores non-document UI preferences locally in the current browser.
 */
export class BrowserSettingsRepository {
  load(): EditorSettings {
    try {
      const raw = globalThis.localStorage?.getItem(settingsKey);
      if (!raw) {
        return { ...defaultEditorSettings };
      }

      return { ...defaultEditorSettings, ...(JSON.parse(raw) as Partial<EditorSettings>) };
    } catch {
      return { ...defaultEditorSettings };
    }
  }

  save(settings: EditorSettings) {
    globalThis.localStorage?.setItem(settingsKey, JSON.stringify(settings));
  }
}
