// Google Fonts Fraunces v38, latin alt kümesi (public/premium/fonts, Doğal Destek ile ortak). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 ae1d21f0a3120a56e7b163af66f709b58f140d024c0ac4f0a362662c7692a738
// Aile adı "Fraunces" sabit adından gelir → eski CSS'teki sabit "Fraunces" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Fraunces = localFont({
  src: "../../../public/premium/fonts/b67966e0b83b2cd0-s.p.0fuf3937kiol3.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Fraunces Fallback'"],
  variable: "--font-fraunces",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

export default Fraunces;
