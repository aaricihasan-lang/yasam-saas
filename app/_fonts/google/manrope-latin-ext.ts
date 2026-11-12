// Google Fonts Manrope v23, latin-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 27eccb1f8944bc26f6511601bac9284786feb5e5bbb0c8035ff09ac63aaf7c52
// Aile adı "Manrope" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Manrope = localFont({
  src: [
    { path: "./manrope-latin-ext.woff2", weight: "300", style: "normal" },
    { path: "./manrope-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "./manrope-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "./manrope-latin-ext.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Manrope Fallback'"],
  variable: "--font-atlas-text",
  declarations: [{ prop: "unicode-range", value: "U+0100-0130, U+0132-0151, U+0154-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

export default Manrope;
