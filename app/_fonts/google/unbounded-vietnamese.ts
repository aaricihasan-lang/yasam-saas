// Google Fonts Unbounded v12, vietnamese alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 54a956ea5b2cfddfea2d336dd36bfcba64f40fa8b2d41685d9d4edf4a2910ab8
// Aile adı "Unbounded" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Unbounded = localFont({
  src: [
    { path: "./unbounded-vietnamese.woff2", weight: "300", style: "normal" },
    { path: "./unbounded-vietnamese.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Unbounded Fallback'"],
  variable: "--font-atlas-display",
  declarations: [{ prop: "unicode-range", value: "U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF1" }],
});

export default Unbounded;
