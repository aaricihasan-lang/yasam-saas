// Google Fonts Unbounded v12, latin alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 d7f07f8a308ce0a7287d79a65a85cfbc0f4741ef426bf1a3902d24392cc71723
// Aile adı "Unbounded" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Unbounded = localFont({
  src: [
    { path: "./unbounded-latin.woff2", weight: "300", style: "normal" },
    { path: "./unbounded-latin.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Unbounded Fallback'"],
  variable: "--font-atlas-display",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-201F, U+2021-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

export default Unbounded;
