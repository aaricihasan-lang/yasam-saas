// Google Fonts Geist Mono v6, cyrillic alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 75b3bedbebc35f347c0ae3b416aa871941555357e7b0f83767eb5987875589ed
// Önceki kurulumun yapısı: alt küme ayrımı, yalnız latin ön yükleme, "Geist Mono Fallback" metrikleri. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const GeistMono = localFont({
  src: "./geist-mono-cyrillic.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Geist Mono Fallback'"],
  variable: "--font-geist-mono",
  declarations: [{ prop: "unicode-range", value: "U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});

export default GeistMono;
