const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const crcTable = createCrcTable();

export type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

/**
 * @description Creates and reads small unencrypted ZIP packages without a runtime dependency.
 */
export class ZipService {
  static create(entries: ZipEntry[]) {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
      const path = textEncoder.encode(entry.path);
      const crc = crc32(entry.bytes);
      const localHeader = new Uint8Array(30 + path.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 0, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, entry.bytes.length, true);
      localView.setUint32(22, entry.bytes.length, true);
      localView.setUint16(26, path.length, true);
      localHeader.set(path, 30);
      localParts.push(localHeader, entry.bytes);

      const centralHeader = new Uint8Array(46 + path.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, entry.bytes.length, true);
      centralView.setUint32(24, entry.bytes.length, true);
      centralView.setUint16(28, path.length, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(path, 46);
      centralParts.push(centralHeader);

      offset += localHeader.length + entry.bytes.length;
    }

    const centralOffset = offset;
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, centralOffset, true);

    return concatBytes([...localParts, ...centralParts, endRecord]);
  }

  static createTextPackage(entries: Array<{ path: string; text: string }>) {
    return ZipService.create(
      entries.map((entry) => ({
        path: entry.path,
        bytes: textEncoder.encode(entry.text),
      })),
    );
  }

  static async read(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const endOffset = findEndOfCentralDirectory(view);
    const entryCount = view.getUint16(endOffset + 10, true);
    let centralOffset = view.getUint32(endOffset + 16, true);
    const files = new Map<string, Uint8Array>();

    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(centralOffset, true) !== 0x02014b50) {
        throw new Error("Invalid ZIP central directory");
      }

      const method = view.getUint16(centralOffset + 10, true);
      const compressedSize = view.getUint32(centralOffset + 20, true);
      const fileNameLength = view.getUint16(centralOffset + 28, true);
      const extraLength = view.getUint16(centralOffset + 30, true);
      const commentLength = view.getUint16(centralOffset + 32, true);
      const localOffset = view.getUint32(centralOffset + 42, true);
      const path = textDecoder.decode(
        bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength),
      );
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      files.set(path, await decompressZipEntry(compressed, method));
      centralOffset += 46 + fileNameLength + extraLength + commentLength;
    }

    return files;
  }
}

async function decompressZipEntry(bytes: Uint8Array, method: number) {
  if (method === 0) {
    return bytes;
  }

  if (method !== 8 || !("DecompressionStream" in globalThis)) {
    throw new Error("This ZIP compression method is not supported in this browser");
  }

  const stream = new Blob([bytesToArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function findEndOfCentralDirectory(view: DataView) {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Invalid ZIP file");
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  });
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}
