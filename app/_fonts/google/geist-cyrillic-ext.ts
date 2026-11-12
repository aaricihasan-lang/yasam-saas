// Google Fonts Geist v5, cyrillic-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 b7a545bbb08256bd809f11cfe66d88da3e22d169ea4407737b1ef0ec1ed3d791
// Aile adı "Geist" sabit adından gelir → eski CSS'teki sabit "Geist" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Geist = localFont({
  src: "./geist-cyrillic-ext.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Geist Fallback'"],
  variable: "--font-geist-sans",
  declarations: [{ prop: "unicode-range", value: "U+0460-048F, U+0492-04AF, U+04B2-052F, U+1C80-1C8A, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" }],
});

export default Geist;
