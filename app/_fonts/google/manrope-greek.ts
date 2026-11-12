// Google Fonts Manrope v23, greek alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 6b478f45d63e18352735fd427e92ae4704800a998ec3337c01b59e4f6ef87d44
// Aile adı "Manrope" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Manrope = localFont({
  src: [
    { path: "./manrope-greek.woff2", weight: "300", style: "normal" },
    { path: "./manrope-greek.woff2", weight: "400", style: "normal" },
    { path: "./manrope-greek.woff2", weight: "500", style: "normal" },
    { path: "./manrope-greek.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Manrope Fallback'"],
  variable: "--font-atlas-text",
  declarations: [{ prop: "unicode-range", value: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF" }],
});

export default Manrope;
