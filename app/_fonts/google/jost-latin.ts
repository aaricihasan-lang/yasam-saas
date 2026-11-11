// Google Fonts Jost v20, latin alt kümesi (public/premium/fonts, Doğal Destek ile ortak). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 235d8f8964bfdf105fc0c3e4c77b5e70f31bee1dad611d59318b5f2a5cb64d90
// Aile adı "Jost" sabit adından gelir → eski CSS'teki sabit "Jost" başvuruları çalışır. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Jost = localFont({
  src: [
    { path: "../../../public/premium/fonts/81cef6a21128489e-s.p.2csanl8cs02r-.woff2", weight: "400", style: "normal" },
    { path: "../../../public/premium/fonts/81cef6a21128489e-s.p.2csanl8cs02r-.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Jost Fallback'"],
  variable: "--font-jost",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

export default Jost;
