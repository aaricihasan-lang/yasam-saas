// Google Fonts Manrope v23, cyrillic-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 347c589d57130c68f9829c2cd24969eed590328078ff921ca6000a56e5a2cc84
// Aile adı "Manrope" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Manrope = localFont({
  src: [
    { path: "./manrope-cyrillic-ext.woff2", weight: "300", style: "normal" },
    { path: "./manrope-cyrillic-ext.woff2", weight: "400", style: "normal" },
    { path: "./manrope-cyrillic-ext.woff2", weight: "500", style: "normal" },
    { path: "./manrope-cyrillic-ext.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Manrope Fallback'"],
  variable: "--font-atlas-text",
  declarations: [{ prop: "unicode-range", value: "U+0460-048F, U+0492-04AF, U+04B2-052F, U+1C80-1C8A, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" }],
});

export default Manrope;
