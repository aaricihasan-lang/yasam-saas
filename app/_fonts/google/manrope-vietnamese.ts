// Google Fonts Manrope v23, vietnamese alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 ddbf28cebf2fbbf800d307f020689bed6d1a96c5a22aed50fee23bf7de80d0f1
// Aile adı "Manrope" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Manrope = localFont({
  src: [
    { path: "./manrope-vietnamese.woff2", weight: "300", style: "normal" },
    { path: "./manrope-vietnamese.woff2", weight: "400", style: "normal" },
    { path: "./manrope-vietnamese.woff2", weight: "500", style: "normal" },
    { path: "./manrope-vietnamese.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Manrope Fallback'"],
  variable: "--font-atlas-text",
  declarations: [{ prop: "unicode-range", value: "U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF1" }],
});

export default Manrope;
