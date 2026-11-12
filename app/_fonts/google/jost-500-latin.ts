// Google Fonts Jost v20 (yalnız 500), latin alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 1af44df083279dd8d8d80ff7be66d7132cce3c5be0c2f80c46d06f9559882239
// Ayrı aile adı (Jost500): yalnız bu ağırlığın statik dosyaları; değişken eşlemesi app/_fonts/google/degiskenler.css.
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Jost500 = localFont({
  src: [
    { path: "./jost-500-latin.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost-500",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-201F, U+2021-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

export default Jost500;
