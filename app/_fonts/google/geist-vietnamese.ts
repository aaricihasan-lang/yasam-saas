// Google Fonts Geist v5, vietnamese alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 f689f638f29fff460a2d5749edb5d5c38d7bef0389f32032d871f23fc6ebb008
// Aile adı "Geist" sabit adından gelir → eski CSS'teki sabit "Geist" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Geist = localFont({
  src: "./geist-vietnamese.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Geist Fallback'"],
  variable: "--font-geist-sans",
  declarations: [{ prop: "unicode-range", value: "U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF1" }],
});

export default Geist;
