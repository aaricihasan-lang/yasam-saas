// Google Fonts Jost v20 (yalnız 500), latin-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 59516d45ab9b34bb74e1c8de5bb93df757d428bb3b9653adc1b2258964fe4f8d
// Ayrı aile adı (Jost500): yalnız bu ağırlığın statik dosyaları; değişken eşlemesi app/_fonts/google/degiskenler.css.
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
// Danışan Yolculuğu'na ayrılmış kopya modül (aynı dosya, aynı aile): ortak modül Turbopack'te Atlas / Analiz CSS parçasıyla
// birleşip bu rotaya Atlas yazı tiplerini ön yüklettiği için ayrıldı (etiket-500-dy.ts).
import localFont from "next/font/local";

const Jost500 = localFont({
  src: [
    { path: "./jost-500-latin-ext.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost-500",
  declarations: [{ prop: "unicode-range", value: "U+0100-0130, U+0132-0151, U+0154-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

export default Jost500;
