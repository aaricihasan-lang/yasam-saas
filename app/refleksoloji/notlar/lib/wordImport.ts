function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  );
}

function stripXmlToPlainText(xml: string): string {
  return xml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function inflateRawDeflate(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DEFLATE_UNSUPPORTED");
  }

  const bytes = Uint8Array.from(compressed);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function extractDocumentXmlText(bytes: Uint8Array): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  let offset = 0;

  while (offset + 30 < bytes.length) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x03 ||
      bytes[offset + 3] !== 0x04
    ) {
      offset += 1;
      continue;
    }

    const compression = bytes[offset + 8] | (bytes[offset + 9] << 8);
    const compressedSize = readUInt32LE(bytes, offset + 18);
    const fileNameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
    const extraLength = bytes[offset + 28] | (bytes[offset + 29] << 8);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > bytes.length) break;

    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;

    let fileData = bytes.subarray(dataStart, dataEnd);
    offset = dataEnd;

    if (compression === 8) {
      fileData = await inflateRawDeflate(fileData);
    } else if (compression !== 0) {
      continue;
    }

    if (name === "word/document.xml") {
      return stripXmlToPlainText(decoder.decode(fileData));
    }
  }

  throw new Error("DOCX_XML_MISSING");
}

export type WordImportResult =
  | { ok: true; text: string }
  | { ok: false; code: "UNSUPPORTED" | "EMPTY" | "FAILED" | "DEFLATE_UNSUPPORTED" };

export async function importTextFromWordFile(file: File): Promise<WordImportResult> {
  const lower = file.name.toLowerCase();

  try {
    if (lower.endsWith(".txt") || file.type === "text/plain") {
      const text = (await file.text()).trim();
      if (!text) return { ok: false, code: "EMPTY" };
      return { ok: true, text };
    }

    if (lower.endsWith(".docx")) {
      const text = await extractDocumentXmlText(new Uint8Array(await file.arrayBuffer()));
      if (!text) return { ok: false, code: "EMPTY" };
      return { ok: true, text };
    }

    if (lower.endsWith(".doc")) {
      return { ok: false, code: "UNSUPPORTED" };
    }

    return { ok: false, code: "UNSUPPORTED" };
  } catch (error) {
    if (error instanceof Error && error.message === "DEFLATE_UNSUPPORTED") {
      return { ok: false, code: "DEFLATE_UNSUPPORTED" };
    }
    return { ok: false, code: "FAILED" };
  }
}
