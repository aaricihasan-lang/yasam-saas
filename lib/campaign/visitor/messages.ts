// KM-3 — kota / altyapı reddi → ziyaretçi mesajı (SAF). İç neden (uzman payı, sağlayıcı durumu vb.) ziyaretçiye SÖYLENMEZ.
import type { VisitorDenial } from "./types";

const UNAVAILABLE = "Bu analiz bugün için geçici olarak kullanılamıyor. Başka bir analizi deneyebilir ya da daha sonra tekrar gelebilirsiniz.";

export function denialMessage(reason: string): VisitorDenial {
  switch (reason) {
    case "kampanya_kapali":
      return { code: reason, message: "Ücretsiz analiz kampanyası şu anda kapalı.", retryable: false };
    case "teknik_kapali":
    case "katalogda_yok":
      return { code: reason, message: "Bu analiz şu anda ücretsiz kampanyada yer almıyor.", retryable: false };
    case "genel_kontenjan_doldu":
    case "teknik_kontenjan_doldu":
      return { code: reason, message: "Bugünkü ücretsiz kontenjan doldu. Yarın yeniden deneyebilirsiniz.", retryable: false };
    case "ip_hakki_doldu":
    case "tarayici_hakki_doldu":
      return { code: reason, message: "Bugünkü ücretsiz analiz hakkınızı kullandınız. Yarın yeniden deneyebilirsiniz.", retryable: false };
    case "istek_suruyor":
      return { code: reason, message: "Analiziniz hazırlanıyor, lütfen birkaç saniye bekleyin.", retryable: true };
    case "istek_tamamlandi":
    case "onceki_istek_sonlandi":
      return { code: reason, message: "Bu istek zaten işlendi. Yeni bir analiz için formu yeniden gönderin.", retryable: false };
    case "hiz_siniri":
      return { code: reason, message: "Kısa sürede çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.", retryable: true };
    case "bot_dogrulama_basarisiz":
      return { code: reason, message: "Güvenlik doğrulaması tamamlanamadı. Doğrulamayı yenileyip tekrar deneyin.", retryable: true };
    case "ip_bilinmiyor":
      return { code: reason, message: "Bağlantınız doğrulanamadığı için bu analiz şu anda sunulamıyor.", retryable: false };
    case "bot_dogrulama_yok":
    case "bot_altyapi":
      return { code: "gecici_kullanilamiyor", message: UNAVAILABLE, retryable: true };
    case "gecersiz_istek":
      return { code: reason, message: "İstek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.", retryable: false };
    case "genel_kredi_doldu":
    case "teknik_kredi_doldu":
    case "aylik_kampanya_payi_doldu":
    case "uzman_payi_korunuyor":
    case "saglayici_kotasi_tanimsiz":
    case "saglayici_durumu_bilinmiyor":
    case "saglayici_kotasi_bilinmiyor":
    case "saglayici_kotasi_uyusmuyor":
    case "saglayici_bekleme":
    case "saglayici_dakika_siniri":
      return { code: "gecici_kullanilamiyor", message: UNAVAILABLE, retryable: false };
    default:
      return { code: "hizmet_yok", message: "Şu anda hizmet veremiyoruz. Lütfen daha sonra tekrar deneyin.", retryable: true };
  }
}
