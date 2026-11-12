// Google Fonts Unbounded v12, cyrillic alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 c3880f0c5afb7890a102bc4b9c8257703664388f708b4be880ec5f5f68e8ea9d
// Aile adı "Unbounded" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Unbounded = localFont({
  src: [
    { path: "./unbounded-cyrillic.woff2", weight: "300", style: "normal" },
    { path: "./unbounded-cyrillic.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Unbounded Fallback'"],
  variable: "--font-atlas-display",
  declarations: [{ prop: "unicode-range", value: "U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});

export default Unbounded;
