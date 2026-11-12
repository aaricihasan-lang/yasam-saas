// Google Fonts Manrope v23, latin alt kümesi (bu dizin). Önceki next/font/google build'inin
// indirdiği dosyayla bayt bayt aynı: SHA-256 8bd97e6bbbc1f602a8f791530eed1064c9a357d5731bbc76e3fc587fb068728f
// Aile adı "Manrope" sabit adından gelir (önceki next/font/google ailesiyle aynı ad).
// unicode-range Google CSS'inden; alt kümeler arası örtüşen karakterler eski seçimdeki alt kümede (app/_fonts/FONTLAR.md).
import localFont from "next/font/local";

const Manrope = localFont({
  src: [
    { path: "./manrope-latin.woff2", weight: "300", style: "normal" },
    { path: "./manrope-latin.woff2", weight: "400", style: "normal" },
    { path: "./manrope-latin.woff2", weight: "500", style: "normal" },
    { path: "./manrope-latin.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  fallback: ["'Manrope Fallback'"],
  variable: "--font-atlas-text",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-201F, U+2021-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

export default Manrope;
