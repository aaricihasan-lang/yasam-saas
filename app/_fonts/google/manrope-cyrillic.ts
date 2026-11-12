// Google Fonts Manrope v23, cyrillic alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 93bef303b8220d2f59dbe8db119891c9f38d94f48a26d373c28256fb2b50cba7
// Aile adı "Manrope" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Manrope = localFont({
  src: [
    { path: "./manrope-cyrillic.woff2", weight: "300", style: "normal" },
    { path: "./manrope-cyrillic.woff2", weight: "400", style: "normal" },
    { path: "./manrope-cyrillic.woff2", weight: "500", style: "normal" },
    { path: "./manrope-cyrillic.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Manrope Fallback'"],
  variable: "--font-atlas-text",
  declarations: [{ prop: "unicode-range", value: "U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});

export default Manrope;
