// Sağlayıcı (Roxy) yorum katmanının TÜRÜ — ekran sekmesi ve Word/PDF aynı kaynaktan (2026-10-15; önce yalnız ekrandaydı).
// "Otomatik Yorum" = kişiye özel anlatı; "Teknik Açıklama" = genel/teknik açıklama (ev temaları, bala bileşenleri…);
// "Roxy Olay Açıklamaları" = Transit Takvimi'nde olay başına teknik cümle. Saf modül (istemci + sunucu).

export type InterpretationKind = "Otomatik Yorum" | "Teknik Açıklama" | "Olay Açıklamaları" | "Sistem Yorumu";

const TECHNICAL_DESCRIPTION_SCHEMAS = new Set(["astro.kp.chart.interp.v1", "astro.kp.extra.interp.v1", "astro.vedic.shadbala.interp.v1", "astro.vedic.panchanga.interp.v1", "astro.vedic.varga.interp.v1"]);

export function interpretationKindOfSchema(schema: string): InterpretationKind {
  // 2026-10-12 (UAT 2. tur, madde N): Transit Takvimi'nde Roxy yalnız olay başına teknik cümle verir; "Otomatik Yorum"
  // (kişiye özel yorum) izlenimi vermesin.
  if (schema === "astro.western.forecast.interp.v1") return "Olay Açıklamaları";
  // 2026-10-20 (owner): Yıllık Profeksiyonlar'da sağlayıcının kısa açıklaması "Sistem Yorumu" başlığıyla gösterilir.
  if (schema === "astro.western.profections.interp.v1") return "Sistem Yorumu";
  // 2026-10-22: Ek noktalar (asteroit / lot / Lilith) — sağlayıcının nokta başına kısa açıklaması da "Sistem Yorumu".
  if (schema === "astro.western.extra_points.interp.v1") return "Sistem Yorumu";
  return TECHNICAL_DESCRIPTION_SCHEMAS.has(schema) ? "Teknik Açıklama" : "Otomatik Yorum";
}

/** Word/PDF'te yorum bölümünün altına basılan tür satırı (ekran sekme adıyla aynı ayrım). */
export function interpretationKindNote(kind: InterpretationKind): string {
  if (kind === "Teknik Açıklama") return "Bu bölüm: Teknik Açıklama — otomatik oluşturulmuş genel/teknik açıklamadır; danışana özel yorum değildir.";
  if (kind === "Sistem Yorumu") return "Bu bölüm: Sistem Yorumu — otomatik oluşturulan kısa astrolojik açıklama; kapsamlı uzman değerlendirmesi değildir.";
  if (kind === "Olay Açıklamaları") return "Bu bölüm: Olay Açıklamaları — olay başına otomatik teknik açıklamadır; danışana özel yorum değildir.";
  return "Bu bölüm: Otomatik Yorum — bu harita için otomatik oluşturulmuş metindir; uzman yorumu değildir.";
}
