// 2026-10-15 (satış öncesi yorum denetimi): Roxy'nin bu tekniklerin uçlarında ANLATI / yorum metni YOKTUR — yanıt yalnız
// teknik veridir (golden yanıtlar + envanter: /vedic-astrology/aspects, /vedic-astrology/ashtakavarga,
// /vedic-astrology/kp/planets-interval). Adaptörleri bu yüzden yorum katmanını bilinçli olarak boş (null) bırakır.
// Ekran ve Word/PDF bunu "yorum dahil edilmedi" ya da yetki eksikliği gibi değil, AÇIKÇA sağlayıcı kapsamı olarak söyler.
// Yeni yorum UYDURULMAZ. Saf modül (istemci + sunucu); motor kaydıyla uyumu scripts/astrology/report8.harness.ts denetler.

// (2026-10-20: western.profections listeden çıkarıldı — owner kararıyla sağlayıcının kısa açıklaması "Sistem Yorumu" olarak gösterilir.)
export const NO_PROVIDER_INTERPRETATION: ReadonlySet<string> = new Set(["vedic.drishti", "vedic.ashtakavarga", "kp.transit"]);

export const NO_PROVIDER_INTERPRETATION_NOTE =
  "Bu analiz türünde otomatik yorum bulunmuyor; yalnızca teknik hesaplama sonuçları sunuluyor. Danışana özel değerlendirme için “Kendi Yorumum” bölümünü kullanabilirsiniz.";

export function hasNoProviderInterpretation(technique: string): boolean {
  return NO_PROVIDER_INTERPRETATION.has(technique);
}
