// Google Fonts Geist v5, cyrillic alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 6129fc8571c3e0cb0a4c41f5160c974a843b055009dc4ad8858bd808e18a2d86
// Aile adı "Geist" sabit adından gelir → eski CSS'teki sabit "Geist" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Geist = localFont({
  src: "./geist-cyrillic.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Geist Fallback'"],
  variable: "--font-geist-sans",
  declarations: [{ prop: "unicode-range", value: "U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});

export default Geist;
