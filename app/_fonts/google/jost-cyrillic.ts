// Google Fonts Jost v20, cyrillic alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 184c3af415cddd52af31cf70166bf351adb70b09e64fdb1948109192a26c2c0d
// Aile adı "Jost" sabit adından gelir → eski CSS'teki sabit "Jost" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Jost = localFont({
  src: [
    { path: "./jost-cyrillic.woff2", weight: "400", style: "normal" },
    { path: "./jost-cyrillic.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost",
  declarations: [{ prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
});

export default Jost;
