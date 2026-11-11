/**
 * Gökyüzü Atlası tipografisi — next/font/local ile depodaki dosyalardan kendi alan adımızdan sunulur
 * (derlemede ve çalışma zamanında dış font çağrısı yok; CSP 'self' ile uyumlu). Yalnız bu modülü içe aktaran sayfada yüklenir.
 *   • Unbounded (SIL OFL 1.1) — başlık / görüntü yazısı: modern, yuvarlak-geometrik, kozmik ama mekanik değil.
 *   • Manrope (SIL OFL 1.1) — etiket, slogan ve kart metinleri: rafine, okunaklı çağdaş sans.
 * Türkçe karakterler (Ö Ü Ğ Ş İ ı Ç) için latin-ext alt kümesi; display=swap + otomatik metrik eşlemeli yedek font
 * (yerleşim kaymasını en aza indirir).
 */
import localFont from "next/font/local";

// Yerel dosyalar (app/_fonts/FONTLAR.md): Google'ın sunduğu latin + latin-ext içeriğiyle aynı; build'de ağ isteği yok.
// Google gibi her ağırlık ayrı @font-face (aynı değişken dosya) → eşleşme / yuvarlama davranışı değişmez.
export const atlasDisplay = localFont({
  src: [
    { path: "../../../../_fonts/unbounded.woff2", weight: "300", style: "normal" },
    { path: "../../../../_fonts/unbounded.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  variable: "--font-atlas-display",
});

export const atlasText = localFont({
  src: [
    { path: "../../../../_fonts/manrope.woff2", weight: "300", style: "normal" },
    { path: "../../../../_fonts/manrope.woff2", weight: "400", style: "normal" },
    { path: "../../../../_fonts/manrope.woff2", weight: "500", style: "normal" },
    { path: "../../../../_fonts/manrope.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-atlas-text",
});
