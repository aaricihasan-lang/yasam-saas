import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Anamnez PDF'leri (boş + dolu form) için Türkçe karakter destekli Geist TTF (base64).
 * Dosya fs ile okunur → Vercel paketine dahil edilmesi için ilgili route'lar
 * next.config.ts `outputFileTracingIncludes` listesinde olmalıdır.
 */
let fontCache: string | null = null;

export function anamnezPdfFontBase64(): string {
  if (!fontCache) {
    fontCache = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
  }
  return fontCache;
}
