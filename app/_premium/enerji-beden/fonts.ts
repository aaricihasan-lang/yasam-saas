/**
 * Enerji & Beden ailesi premium tipografisi (Enerji & Beden, Biyoenerji, Refleksoloji iç sayfaları).
 * next/font ile kendi sunucumuzdan (dış istek yok, CSP uyumlu); Türkçe için latin-ext alt kümesi.
 *   Başlıklar → Fraunces (opsz / SOFT ekseni) · Üst etiket → Jost · Gövde → uygulamanın Geist'i (layout'tan).
 */
import { Fraunces, Jost } from "next/font/google";

const energySerif = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "SOFT"],
  variable: "--eb-serif",
  display: "swap",
});

const energyLabel = Jost({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--eb-label",
  display: "swap",
});

/** Kök öğeye eklenecek font değişkeni sınıfları. */
export const energyFontVars = `${energySerif.variable} ${energyLabel.variable}`;
