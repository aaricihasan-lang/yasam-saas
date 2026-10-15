// Astroloji raporu — sembol yedek yazı tiplerini diskten okur (YALNIZ SUNUCU). Dosyalar next.config.ts
// outputFileTracingIncludes listesindedir (rapor rotaları). Bkz. symbolFonts.ts.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { SYMBOL_FONT_FILES } from "./symbolFonts";

let cache: { A: Buffer; B: Buffer } | null = null;

export function symbolFontBuffers(): { A: Buffer; B: Buffer } {
  if (!cache) {
    const dir = path.join(process.cwd(), "public", "fonts");
    cache = { A: fs.readFileSync(path.join(dir, SYMBOL_FONT_FILES.A)), B: fs.readFileSync(path.join(dir, SYMBOL_FONT_FILES.B)) };
  }
  return cache;
}

export function symbolFontsBase64(): { A: string; B: string } {
  const b = symbolFontBuffers();
  return { A: b.A.toString("base64"), B: b.B.toString("base64") };
}
