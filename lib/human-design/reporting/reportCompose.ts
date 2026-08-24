/**
 * HD FAZ 2 — Profesyonel Word/DOCX · PAYLAŞILAN İÇERİK KOMPOZİSYON KATMANI
 * =======================================================================
 *
 * SAF (React/DB/DOCX yok). Canonical alan ETİKETLERİ ve sıralaması TEK KAYNAKTAN
 * gelir; hem Premium Reader paneli (composeContentText) hem DOCX kurucusu (per-kind
 * alan sırası) buradan tüketir → ikinci bir etiket/sıra listesi İCAT EDİLMEZ (§8).
 *
 * Not: Bu katman canonical METNİ DEĞİŞTİRMEZ; yalnız hangi alanın hangi başlıkla,
 * hangi sırada sunulacağını tanımlar. Metin ham/kayıpsız akar.
 */

import type { FrozenCanonicalContent } from "./reportSnapshot";

/** İçerik alanı anahtarı (11 canonical alan). */
export type ContentFieldKey = keyof FrozenCanonicalContent;

/**
 * Canonical alan → Türkçe etiket. Panel ve Word AYNI etiketleri kullanır.
 * (hanging_gate_context ayrı ele alınır — asılı-kapı bölümünde.)
 */
export const FIELD_LABELS: ReadonlyArray<readonly [ContentFieldKey, string]> = [
  ["general_description", "Genel Açıklama"],
  ["report_text", "Kaynaklandırılmış Ana Metin"],
  ["strategy_text", "Strateji"],
  ["signature_text", "İmza"],
  ["not_self_text", "Kendinden-Olmayan Tema"],
  ["decision_mechanism", "Karar Mekanizması"],
  ["application_text", "Uygulama"],
  ["caution_notes", "Dikkat Notları"],
  ["general_theme", "Genel Tema"],
  ["full_channel_text", "Tam Kanal Metni"],
] as const;

export const FIELD_LABEL_MAP: Readonly<Record<ContentFieldKey, string>> = {
  general_description: "Genel Açıklama",
  report_text: "Kaynaklandırılmış Ana Metin",
  strategy_text: "Strateji",
  signature_text: "İmza",
  not_self_text: "Kendinden-Olmayan Tema",
  decision_mechanism: "Karar Mekanizması",
  application_text: "Uygulama",
  caution_notes: "Dikkat Notları",
  general_theme: "Genel Tema",
  full_channel_text: "Tam Kanal Metni",
  hanging_gate_context: "Asılı Kapı Bağlamı",
};

// ── Per-kind alan sırası (Word bölüm sözleşmesi §23–§26) ──────────────────────
/** Tip: Genel Açıklama, Ana Metin, Strateji, İmza, Kendinden-Olmayan Tema (§23). */
export const TYPE_FIELD_ORDER: readonly ContentFieldKey[] = [
  "general_description",
  "report_text",
  "strategy_text",
  "signature_text",
  "not_self_text",
];

/** Otorite: Genel Açıklama, Ana Metin, Karar Mekanizması, Uygulama, Dikkat Notları (§24). */
export const AUTHORITY_FIELD_ORDER: readonly ContentFieldKey[] = [
  "general_description",
  "report_text",
  "decision_mechanism",
  "application_text",
  "caution_notes",
];

/** Kanal: Genel Açıklama, Ana Metin, Tam Kanal Metni (§25). */
export const CHANNEL_FIELD_ORDER: readonly ContentFieldKey[] = [
  "general_description",
  "report_text",
  "full_channel_text",
];

/** Kapı: Genel Tema, Genel Açıklama, Ana Metin (§26). */
export const GATE_FIELD_ORDER: readonly ContentFieldKey[] = [
  "general_theme",
  "general_description",
  "report_text",
];

export type ComposedField = { key: ContentFieldKey; label: string; value: string };

/**
 * Verilen sıraya göre YALNIZ non-empty alanları {key,label,value} olarak döner.
 * Metin trim'lenir (sunum boşluğu); içerik/anlam DEĞİŞMEZ.
 */
export function composeFields(
  content: FrozenCanonicalContent,
  order: readonly ContentFieldKey[],
): ComposedField[] {
  const out: ComposedField[] = [];
  for (const key of order) {
    const v = content[key];
    if (typeof v === "string" && v.trim() !== "") {
      out.push({ key, label: FIELD_LABEL_MAP[key], value: v.trim() });
    }
  }
  return out;
}

/**
 * Premium Reader için birleşik metin ("## Etiket\n\n değer"). Panel'in mevcut
 * davranışıyla BİREBİR (FIELD_LABELS sırası). Reader parser'ı bu metni H2/H3'e çevirir.
 */
export function composeContentText(content: FrozenCanonicalContent): string {
  const parts: string[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const v = content[key];
    if (typeof v === "string" && v.trim() !== "") parts.push(`## ${label}\n\n${v.trim()}`);
  }
  return parts.join("\n\n");
}

/** Kart önizlemesi için ilk anlamlı metin (panel ile aynı öncelik). */
export function previewText(content: FrozenCanonicalContent): string {
  return (
    content.general_description?.trim() ||
    content.report_text?.trim() ||
    content.general_theme?.trim() ||
    ""
  );
}
