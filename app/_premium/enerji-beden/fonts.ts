/**
 * Enerji & Beden ailesi premium tipografisi (Enerji & Beden, Biyoenerji, Refleksoloji iç sayfaları).
 * next/font ile kendi sunucumuzdan (dış istek yok, CSP uyumlu); Türkçe için latin-ext alt kümesi.
 *   Başlıklar → Fraunces (opsz / SOFT ekseni) · Üst etiket → Jost · Gövde → uygulamanın Geist'i (layout'tan).
 */
import localFont from "next/font/local";

// Yerel dosyalar (app/_fonts/FONTLAR.md): Google'ın sunduğu latin + latin-ext içeriğiyle aynı; build'de ağ isteği yok.
const energySerif = localFont({
  src: "../../_fonts/fraunces.woff2",
  weight: "100 900",
  variable: "--eb-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const energyLabel = localFont({
  src: [
    { path: "../../_fonts/jost.woff2", weight: "400", style: "normal" },
    { path: "../../_fonts/jost.woff2", weight: "500", style: "normal" },
  ],
  variable: "--eb-label",
  display: "swap",
});

/** Kök öğeye eklenecek font değişkeni sınıfları. */
export const energyFontVars = `${energySerif.variable} ${energyLabel.variable}`;
