// Google Fonts Jost v20 (yalnız 500), cyrillic alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 0e535fec0bf5e53445aa835d8ea667dabea2d00e2b356fb9492c3f16f77e3505
// Ayrı aile adı (Jost500): yalnız bu ağırlığın statik dosyaları; değişken eşlemesi app/_fonts/google/degiskenler.css.
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Jost500 = localFont({
  src: [
    { path: "./jost-500-cyrillic.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost-500",
  declarations: [{ prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});

export default Jost500;
