// Google Fonts Unbounded v12, latin-ext alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 ed84482df7b95e6a56a113de1ba2a8d54337f499ba19d54ca697a7e15427ff5f
// Aile adı "Unbounded" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Unbounded = localFont({
  src: [
    { path: "./unbounded-latin-ext.woff2", weight: "300", style: "normal" },
    { path: "./unbounded-latin-ext.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Unbounded Fallback'"],
  variable: "--font-atlas-display",
  declarations: [{ prop: "unicode-range", value: "U+0100-0130, U+0132-0151, U+0154-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

export default Unbounded;
