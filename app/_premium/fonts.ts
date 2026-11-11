/**
 * Premium sayfalar için ortak başlık yazı tipi değişkeni (owner onaylı prototiplerin --font-display'i: Fraunces).
 * Değişken, root layout'taki global Fraunces ailesine bağlanır (app/_fonts/google): önceki next/font/google kurulumundaki
 * gibi aynı aile, aynı alt küme dosyaları ve aynı yedek metrikler; ayrı yazı tipi modülü yok. Kaynak: app/_fonts/FONTLAR.md.
 * Yalnız sınıfı alan kök öğenin altında geçerlidir — global tema değildir.
 */
import styles from "./fonts.module.css";

/** Kök öğeye eklenecek font değişkeni sınıfları. */
export const premiumFontVars = styles.vars;
