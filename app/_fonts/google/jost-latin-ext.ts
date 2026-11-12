// Google Fonts Jost v20, latin-ext alt kümesi (public/premium/fonts, Doğal Destek ile ortak). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 b2a539cd1f2bbf123e66bafa988bbd32249a7ba3335aec377a9fc1b37734b1ed
// Aile adı "Jost" sabit adından gelir → eski CSS'teki sabit "Jost" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Jost = localFont({
  src: [
    { path: "../../../public/premium/fonts/9b8f0e32b229dbc1-s.p.0dguglgc-iz4q.woff2", weight: "400", style: "normal" },
    { path: "../../../public/premium/fonts/9b8f0e32b229dbc1-s.p.0dguglgc-iz4q.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost",
  declarations: [{ prop: "unicode-range", value: "U+0100-0130, U+0132-0151, U+0154-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

export default Jost;
