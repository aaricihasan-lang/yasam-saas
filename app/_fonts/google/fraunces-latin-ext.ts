// Google Fonts Fraunces v38, latin-ext alt kümesi (public/premium/fonts, Doğal Destek ile ortak). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 0346b5001571b34d8d4d229a4d823d20d51a42bb48159118602837d4fe4ad4d4
// Aile adı "Fraunces" sabit adından gelir → eski CSS'teki sabit "Fraunces" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Fraunces = localFont({
  src: "../../../public/premium/fonts/5307092570128b5a-s.p.16191ingcc7md.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Fraunces Fallback'"],
  variable: "--font-fraunces",
  declarations: [{ prop: "unicode-range", value: "U+0100-0130, U+0132-0151, U+0154-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

export default Fraunces;
