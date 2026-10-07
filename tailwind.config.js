/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    // HD hesaplanmış harita: geniş + yatay masaüstü (bilgi kolonu BodyGraph'ı küçültmeden sığar).
    // `screens`e EKLENMEZ: nesne tipli screen, uygulama genelindeki min-[…]/max-* varyantlarını bozar.
    ({ addVariant }) => {
      // `html &`: özgüllük +1 → CSS sırasından bağımsız olarak lg:/xl: kurallarını geçer.
      addVariant("hdwide", "@media (min-width: 1280px) and (min-aspect-ratio: 8/5) { html & }");
    },
  ],
}