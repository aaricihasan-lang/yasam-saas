// Google Fonts Geist Mono v6, vietnamese alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 16e1d48b6dd29eb240aec5db36184eb182933c082cd43de7f35af686d58087d2
// Önceki kurulumun yapısı: alt küme ayrımı, yalnız latin ön yükleme, "Geist Mono Fallback" metrikleri. unicode-range Google
// CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const GeistMono = localFont({
  src: "./geist-mono-vietnamese.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["'Geist Mono Fallback'"],
  variable: "--font-geist-mono",
  declarations: [{ prop: "unicode-range", value: "U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF1" }],
});

export default GeistMono;
