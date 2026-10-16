// Astroloji raporu — SEMBOL YAZI TİPİ YÖNLENDİRMESİ (SAF; PDF, Word ve testler ortak kullanır).
//
// Sorun (2026-10-14 görsel denetim): rapor yazı tipi Geist'te astrolojik glifler (☉ ☽ ☿ … ♈ … ☌ ☍ □ ⚹ ∠ ℞) ve Yunan
// harfleri (α β γ …) YOK → PDF'te boş/kare çıkıyordu. Çözüm: metin karakter karakter şu sırayla yönlendirilir:
//   base (Geist; Türkçe dahil tüm Latin metin)  →  A ("Yasam Astro Symbols A")  →  B ("Yasam Astro Symbols B")
// A = DejaVu Sans 2.37 alt kümesi (Yunanca, ℞, ∠, geometrik şekiller, astroloji/çeşitli semboller; Bitstream Vera lisansı
//     gereği yeniden adlandırıldı; public/fonts/YasamAstroSymbolsA-LICENSE.txt).
// B = Noto Sans Symbols 2.003 alt kümesi (⚹ ⚺ ⚻ ⚼ — DejaVu'da yok; SIL OFL 1.1; public/fonts/YasamAstroSymbolsB-OFL.txt).
// Yönlendirme GERÇEK glif kapsamına göredir (symbolFontCoverage.ts, fontTools ile üretildi): Geist'te bulunan her karakter
// (Türkçe, ≤, °, △ …) Geist'te kalır → genel tasarım değişmez. Kapsam testi: scripts/astrology/symbols.harness.ts.

import { GEIST_RANGES, SYM_A_RANGES, SYM_B_RANGES } from "./symbolFontCoverage";

export const SYMBOL_FONT_A = "Yasam Astro Symbols A";
export const SYMBOL_FONT_B = "Yasam Astro Symbols B";
export const SYMBOL_FONT_FILES = { A: "YasamAstroSymbolsA.ttf", B: "YasamAstroSymbolsB.ttf" } as const;

export type FontKey = "base" | "A" | "B";

/** Metin/emoji görünüm seçicileri: PDF'te glifsiz kutu üretir; sembol zaten metin biçiminde çizilir. */
const VS_RE = /[\uFE0E\uFE0F]/g;

const inRanges = (cp: number, rs: readonly (readonly [number, number])[]) => {
  let lo = 0;
  let hi = rs.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (cp < rs[m][0]) hi = m - 1;
    else if (cp > rs[m][1]) lo = m + 1;
    else return true;
  }
  return false;
};

/** GERÇEK glif kapsamına göre: Geist'te varsa base; yoksa A; o da yoksa B; hiçbirinde yoksa base (çizilemez → test yakalar). */
export function fontKeyOf(ch: string): FontKey {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80 || inRanges(cp, GEIST_RANGES)) return "base";
  if (inRanges(cp, SYM_A_RANGES)) return "A";
  if (inRanges(cp, SYM_B_RANGES)) return "B";
  return "base";
}

/** Karakter herhangi bir rapor yazı tipinde var mı? (testler: sembol kaybı = false) */
export function isRenderable(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x20 || inRanges(cp, GEIST_RANGES) || inRanges(cp, SYM_A_RANGES) || inRanges(cp, SYM_B_RANGES);
}

/** Metni aynı yazı tipindeki ardışık parçalara böler (görünüm seçicileri atılır). */
export function fontRuns(text: string): { font: FontKey; text: string }[] {
  const out: { font: FontKey; text: string }[] = [];
  for (const ch of Array.from(text.replace(VS_RE, ""))) {
    const k = fontKeyOf(ch);
    const last = out[out.length - 1];
    if (last && last.font === k) last.text += ch;
    else out.push({ font: k, text: ch });
  }
  return out;
}

export function hasSymbolChars(text: string): boolean {
  return fontRuns(text).some((r) => r.font !== "base");
}
