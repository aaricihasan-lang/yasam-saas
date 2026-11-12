// Google Fonts Unbounded v12, cyrillic-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 5501f713602e4960a52d096d6a4afb72b5d163c5bf27173e93da41a6837e3a2d
// Aile adı "Unbounded" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Unbounded = localFont({
  src: [
    { path: "./unbounded-cyrillic-ext.woff2", weight: "300", style: "normal" },
    { path: "./unbounded-cyrillic-ext.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Unbounded Fallback'"],
  variable: "--font-atlas-display",
  declarations: [{ prop: "unicode-range", value: "U+0460-048F, U+0492-04AF, U+04B2-052F, U+1C80-1C8A, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" }],
});

export default Unbounded;
