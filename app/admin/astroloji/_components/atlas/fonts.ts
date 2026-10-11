/**
 * Gökyüzü Atlası tipografisi — next/font ile DERLEME ZAMANINDA indirilip kendi alan adımızdan sunulur
 * (çalışma zamanında dış font çağrısı yok; CSP 'self' ile uyumlu). Yalnız bu modülü içe aktaran sayfada yüklenir.
 *   • Unbounded (SIL OFL 1.1) — başlık / görüntü yazısı: modern, yuvarlak-geometrik, kozmik ama mekanik değil.
 *   • Manrope (SIL OFL 1.1) — etiket, slogan ve kart metinleri: rafine, okunaklı çağdaş sans.
 * Türkçe karakterler (Ö Ü Ğ Ş İ ı Ç) için latin-ext alt kümesi; display=swap + otomatik metrik eşlemeli yedek font
 * (yerleşim kaymasını en aza indirir).
 */
import { Manrope, Unbounded } from "next/font/google";

export const atlasDisplay = Unbounded({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400"],
  display: "swap",
  variable: "--font-atlas-display",
});

export const atlasText = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-atlas-text",
});
