/**
 * Gökyüzü Atlası tipografisi — next/font/local ile depodaki dosyalardan kendi alan adımızdan sunulur
 * (derlemede ve çalışma zamanında dış font çağrısı yok; CSP 'self' ile uyumlu). Yalnız bu modülü içe aktaran sayfada yüklenir.
 *   • Unbounded (SIL OFL 1.1) — başlık / görüntü yazısı: modern, yuvarlak-geometrik, kozmik ama mekanik değil.
 *   • Manrope (SIL OFL 1.1) — etiket, slogan ve kart metinleri: rafine, okunaklı çağdaş sans.
 * Önceki next/font/google kurulumuyla aynı yapı (app/_fonts/google): aynı aile adları ("Unbounded", "Manrope"), Google'ın
 * sunduğu aynı alt küme dosyaları (bayt bayt), aynı unicode-range ayrımı, aynı ön yükleme (latin + latin-ext) ve aynı
 * yedek metrikler (yedek-metrikler.css). Her ağırlık ayrı @font-face (aynı dosya) — Google gibi.
 */
import unboundedCyrillicExt from "@/app/_fonts/google/unbounded-cyrillic-ext";
import unboundedCyrillic from "@/app/_fonts/google/unbounded-cyrillic";
import unboundedVietnamese from "@/app/_fonts/google/unbounded-vietnamese";
import unboundedLatinExt from "@/app/_fonts/google/unbounded-latin-ext";
import unboundedLatin from "@/app/_fonts/google/unbounded-latin";
import manropeCyrillicExt from "@/app/_fonts/google/manrope-cyrillic-ext";
import manropeCyrillic from "@/app/_fonts/google/manrope-cyrillic";
import manropeGreek from "@/app/_fonts/google/manrope-greek";
import manropeVietnamese from "@/app/_fonts/google/manrope-vietnamese";
import manropeLatinExt from "@/app/_fonts/google/manrope-latin-ext";
import manropeLatin from "@/app/_fonts/google/manrope-latin";

const sinif = (fontlar: { variable: string }[]) => fontlar.map((f) => f.variable).join(" ");

/** --font-atlas-display (Unbounded 300 / 400). Kullanım: kök öğeye `atlasDisplay.variable`. */
export const atlasDisplay = {
  variable: sinif([unboundedCyrillicExt, unboundedCyrillic, unboundedVietnamese, unboundedLatinExt, unboundedLatin]),
};

/** --font-atlas-text (Manrope 300–600). Kullanım: kök öğeye `atlasText.variable`. */
export const atlasText = {
  variable: sinif([manropeCyrillicExt, manropeCyrillic, manropeGreek, manropeVietnamese, manropeLatinExt, manropeLatin]),
};
