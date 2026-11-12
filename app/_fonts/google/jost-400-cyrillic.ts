// Google Fonts Jost v20 (yalnız 400), cyrillic alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 c7a905112b2f751b32417df6d8a9446b3fce90211ba14b69906fd600a2699185
// Ayrı aile adı (Jost400): yalnız bu ağırlığın statik dosyaları; değişken eşlemesi app/_fonts/google/degiskenler.css.
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Jost400 = localFont({
  src: [
    { path: "./jost-400-cyrillic.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost-400",
  declarations: [{ prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});

export default Jost400;
