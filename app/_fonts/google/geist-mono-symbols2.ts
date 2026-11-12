// Google Fonts Geist Mono v6, symbols2 alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 d67e4a94ba498635f764ddca7d1ec4271f5642f032eb24b426764480f66f8497
// Önceki kurulumun yapısı: alt küme ayrımı, yalnız latin ön yükleme, "Geist Mono Fallback" metrikleri. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const GeistMono = localFont({
  src: "./geist-mono-symbols2.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Geist Mono Fallback'"],
  variable: "--font-geist-mono",
  declarations: [{ prop: "unicode-range", value: "U+23B8-23BD, U+2500-259F" }],
});

export default GeistMono;
