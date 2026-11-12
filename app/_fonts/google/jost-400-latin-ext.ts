// Google Fonts Jost v20 (yalnız 400), latin-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 f0f29b491ceac5bbaf1024d9cbfd0e3be5607c565012124ab4b6b45f56b6af21
// Ayrı aile adı (Jost400): yalnız bu ağırlığın statik dosyaları; değişken eşlemesi app/_fonts/google/degiskenler.css.
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Jost400 = localFont({
  src: [
    { path: "./jost-400-latin-ext.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost-400",
  declarations: [{ prop: "unicode-range", value: "U+0100-0130, U+0132-0151, U+0154-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

export default Jost400;
