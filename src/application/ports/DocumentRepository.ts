import type { MikroDocumentId, MikroDocumentRecord } from "../../interfaces/Document.js";

export interface DocumentRepository {
  list(): Promise<MikroDocumentRecord[]>;
  load(id: MikroDocumentId): Promise<MikroDocumentRecord | null>;
  save(document: MikroDocumentRecord): Promise<void>;
  delete(id: MikroDocumentId): Promise<void>;
}
