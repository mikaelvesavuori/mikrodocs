import type { DocumentFileGateway } from "../index.js";
import { downloadBytes, downloadText } from "./browser.js";

type TauriGlobal = {
  dialog?: {
    save?: (options?: {
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }) => Promise<string | null>;
  };
  fs?: {
    writeFile?: (path: string, contents: Uint8Array | string) => Promise<void>;
  };
};

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

/**
 * @description Browser download implementation of the document file gateway.
 */
export class BrowserDocumentFileGateway implements DocumentFileGateway {
  saveText(filename: string, text: string, type?: string) {
    downloadText(filename, text, type);
  }

  saveBytes(filename: string, bytes: Uint8Array, type?: string) {
    downloadBytes(filename, bytes, type);
  }
}

/**
 * @description Optional Tauri global API implementation used when MikroDocs is bundled with native filesystem access.
 */
export class TauriDocumentFileGateway implements DocumentFileGateway {
  constructor(private readonly tauri: TauriGlobal) {}

  async saveText(filename: string, text: string) {
    const path = await this.chooseSavePath(filename);
    if (path) {
      await this.tauri.fs?.writeFile?.(path, text);
    }
  }

  async saveBytes(filename: string, bytes: Uint8Array) {
    const path = await this.chooseSavePath(filename);
    if (path) {
      await this.tauri.fs?.writeFile?.(path, bytes);
    }
  }

  private chooseSavePath(filename: string) {
    return this.tauri.dialog?.save?.({
      defaultPath: filename,
      filters: [{ name: "Document", extensions: [filename.split(".").pop() || "txt"] }],
    });
  }
}

export function createDocumentFileGateway(): DocumentFileGateway {
  const tauri = window.__TAURI__;
  if (tauri?.dialog?.save && tauri.fs?.writeFile) {
    return new TauriDocumentFileGateway(tauri);
  }

  return new BrowserDocumentFileGateway();
}
