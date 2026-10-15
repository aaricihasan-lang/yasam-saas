// Sağlayıcı (Roxy) yorum katmanının TÜRÜ — ekran sekmesi ve Word/PDF aynı kaynaktan (2026-10-15; önce yalnız ekrandaydı).
// "Otomatik Yorum" = kişiye özel anlatı; "Teknik Açıklama" = genel/teknik açıklama (ev temaları, bala bileşenleri…);
// "Roxy Olay Açıklamaları" = Transit Takvimi'nde olay başına teknik cümle. Saf modül (istemci + sunucu).

export type InterpretationKind = "Otomatik Yorum" | "Teknik Açıklama" | "Roxy Olay Açıklamaları";

const TECHNICAL_DESCRIPTION_SCHEMAS = new Set(["astro.kp.chart.interp.v1", "astro.kp.extra.interp.v1", "astro.vedic.shadbala.interp.v1", "astro.vedic.panchanga.interp.v1", "astro.vedic.varga.interp.v1"]);

export function interpretationKindOfSchema(schema: string): InterpretationKind {
  // 2026-10-12 (UAT 2. tur, madde N): Transit Takvimi'nde Roxy yalnız olay başına teknik cümle verir; "Otomatik Yorum"
  // (kişiye özel yorum) izlenimi vermesin.
  if (schema === "astro.western.forecast.interp.v1") return "Roxy Olay Açıklamaları";
  return TECHNICAL_DESCRIPTION_SCHEMAS.has(schema) ? "Teknik Açıklama" : "Otomatik Yorum";
}

/** Word/PDF'te yorum bölümünün altına basılan tür satırı (ekran sekme adıyla aynı ayrım). */
export function interpretationKindNote(kind: InterpretationKind): string {
  if (kind === "Teknik Açıklama") return "Bu bölüm: Teknik Açıklama — sağlayıcının genel/teknik açıklamasıdır; danışana özel yorum değildir.";
  if (kind === "Roxy Olay Açıklamaları") return "Bu bölüm: Roxy Olay Açıklamaları — olay başına teknik açıklamadır; danışana özel yorum değildir.";
  return "Bu bölüm: Otomatik Yorum — sağlayıcının bu haritaya özel otomatik metnidir; uzman yorumu değildir.";
}
