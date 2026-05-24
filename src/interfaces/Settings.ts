export type ThemePreference = "light" | "dark";

export type FontPreference = "system" | "serif" | "mono";

export interface EditorSettings {
  theme: ThemePreference;
  font: FontPreference;
  fontScale: number;
  autosave: boolean;
  sourceMode: boolean;
  lastBackupAt: string | null;
  lastDocumentId: string | null;
}
