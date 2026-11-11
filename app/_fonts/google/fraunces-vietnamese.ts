// Google Fonts Fraunces v38, vietnamese alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 871c9b3232eccd35c9f2fb7b9f598c313c41d1e93525df35f9f54a8b9dd56df8
// Aile adı "Fraunces" sabit adından gelir → eski CSS'teki sabit "Fraunces" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Fraunces = localFont({
  src: "./fraunces-vietnamese.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Fraunces Fallback'"],
  variable: "--font-fraunces",
  declarations: [{ prop: "unicode-range", value: "U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF1" }],
});

export default Fraunces;
