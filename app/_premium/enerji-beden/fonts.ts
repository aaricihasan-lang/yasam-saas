/**
 * Enerji & Beden ailesi premium tipografisi (Enerji & Beden, Biyoenerji, Refleksoloji iç sayfaları).
 *   Başlıklar → Fraunces (opsz / SOFT ekseni) · Üst etiket → Jost · Gövde → uygulamanın Geist'i (layout'tan).
 * Değişkenler root layout'taki global Fraunces / Jost ailelerine bağlanır (app/_fonts/google): önceki next/font/google
 * kurulumundaki gibi aynı aileler, alt küme dosyaları ve yedek metrikler; ayrı yazı tipi modülü yok. Kaynak: app/_fonts/FONTLAR.md.
 */
import styles from "./fonts.module.css";

/** Kök öğeye eklenecek font değişkeni sınıfları. */
export const energyFontVars = styles.vars;
