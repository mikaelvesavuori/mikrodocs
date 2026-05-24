/**
 * @description Abstracts document import/export so the browser build and future Tauri shell can share editor workflows.
 */
export interface DocumentFileGateway {
  saveText(filename: string, text: string, type?: string): Promise<void> | void;
  saveBytes(filename: string, bytes: Uint8Array, type?: string): Promise<void> | void;
}
