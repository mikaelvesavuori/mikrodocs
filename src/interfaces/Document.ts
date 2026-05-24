export type MikroDocumentId = string;

export type ImageLayout = "contained" | "wide" | "small";

export interface MikroDocumentSnapshot {
  id: string;
  documentId: MikroDocumentId;
  markdown: string;
  createdAt: string;
  reason: "manual" | "autosave" | "import";
}

export interface MikroDocumentRecord {
  id: MikroDocumentId;
  title: string;
  markdown: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string | null;
  version: number;
  snapshots: MikroDocumentSnapshot[];
}

export interface StorageMetadata {
  schemaVersion: number;
  migratedAt: string;
}

export interface CreateDocumentInput {
  title?: string;
  markdown?: string;
}

export interface UpdateDocumentInput {
  title?: string;
  markdown?: string;
  saveSnapshot?: boolean;
  snapshotReason?: MikroDocumentSnapshot["reason"];
}

export interface DocumentStats {
  words: number;
  characters: number;
  readingMinutes: number;
}

export interface HeadingInfo {
  id: string;
  level: number;
  text: string;
  line: number;
}

export interface LinkInfo {
  label: string;
  target: string;
  kind: "internal" | "document" | "external";
  line: number;
}

export interface DocumentSearchResult {
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface ParsedDocument {
  html: string;
  outline: HeadingInfo[];
  links: LinkInfo[];
  stats: DocumentStats;
}
