/**
 * Premium sayfalar için ortak başlık yazı tipi değişkeni (owner onaylı prototiplerin --font-display'i: Fraunces).
 * next/font/local ile depodaki dosyadan (build'de ve çalışma zamanında dış istek yok, CSP uyumlu); latin + latin-ext
 * (Türkçe) ve opsz / SOFT / wght eksenleri dahil — kaynak ve doğrulama: app/_fonts/FONTLAR.md.
 * Yalnız sınıfı alan kök öğenin altında geçerlidir — global tema değildir.
 */
import localFont from "next/font/local";

const premiumDisplay = localFont({
  src: "../_fonts/fraunces.woff2",
  weight: "100 900",
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

/** Kök öğeye eklenecek font değişkeni sınıfları. */
export const premiumFontVars = premiumDisplay.variable;
