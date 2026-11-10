/**
 * F3A — DOCX normalize: docProps/* (tarih/metadata) dışarıda; w:rsid* öznitelikleri silinir; media
 * dosyaları içerik SHA-256 ile temsil edilir ve rels içindeki medya adları bu SHA'ya eşlenir.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";

export const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

export async function normalizeDocx(buf: Buffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(buf);
  const parts: Record<string, string> = {};
  const mediaMap = new Map<string, string>();
  const names = Object.keys(zip.files).filter((f) => !zip.files[f]!.dir).sort();
  for (const f of names) {
    if (f.startsWith("word/media/")) {
      const h = sha(await zip.file(f)!.async("nodebuffer"));
      mediaMap.set(path.posix.basename(f), h);
      parts[`media:${h}`] = h;
    }
  }
  for (const f of names) {
    if (f.startsWith("word/media/") || f.startsWith("docProps/")) continue;
    let x = await zip.file(f)!.async("string");
    x = x.replace(/\s+w:rsid[A-Za-z]*="[^"]*"/g, "");
    for (const [n, h] of mediaMap) x = x.split(`media/${n}`).join(`media/${h}`);
    parts[f] = x;
  }
  return parts;
}
