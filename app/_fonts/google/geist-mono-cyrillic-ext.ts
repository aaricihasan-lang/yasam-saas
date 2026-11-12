// Google Fonts Geist Mono v6, cyrillic-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 e27f657e38d52887baa3b6b2f812bef93dfdd356f0810e40edd4ee284cc7e9f6
// Önceki kurulumun yapısı: alt küme ayrımı, yalnız latin ön yükleme, "Geist Mono Fallback" metrikleri. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const GeistMono = localFont({
  src: "./geist-mono-cyrillic-ext.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Geist Mono Fallback'"],
  variable: "--font-geist-mono",
  declarations: [{ prop: "unicode-range", value: "U+0460-048F, U+0492-04AF, U+04B2-052F, U+1C80-1C8A, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" }],
});

export default GeistMono;
