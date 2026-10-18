/**
 * Premium sayfalar için ortak başlık yazı tipi değişkeni (owner onaylı prototiplerin --font-display'i: Fraunces).
 * next/font ile kendi sunucumuzdan (dış istek yok, CSP uyumlu); Türkçe için latin-ext alt kümesi.
 * Yalnız sınıfı alan kök öğenin altında geçerlidir — global tema değildir.
 */
import { Fraunces } from "next/font/google";

const premiumDisplay = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "SOFT"],
  variable: "--font-display",
  display: "swap",
});

/** Kök öğeye eklenecek font değişkeni sınıfları. */
export const premiumFontVars = premiumDisplay.variable;
