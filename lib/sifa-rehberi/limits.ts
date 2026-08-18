/**
 * Şifa Rehberi — merkezî girdi doğrulaması (API sertleştirme, Faz 1).
 *
 * ÜRÜN KARARI (Faz 1 / Bölüm 3): Şifa Rehberi profesyonel bir bilgi arşividir.
 * ANA İÇERİK / profesyonel metin alanlarında hard karakter limiti YOKTUR.
 * (20.000 / 50.000 gibi kullanıcıyı bloke eden içerik üst sınırı KALDIRILDI.)
 * Gerçek profesyonel metin keyfi bir karakter sınırı yüzünden REDDEDİLMEZ,
 * KESİLMEZ (truncate) veya OTOMATİK ÖZETLENMEZ.
 *
 * Kalan doğrulama iki amaçlıdır — kullanıcı içerik sınırı DEĞİL:
 *   1) ALTYAPI / ABUSE koruması: içerik alanları string olmalı (object/array/number
 *      gibi bozuk/anormal payload reddedilir); görsel ve bölüm sayısı sınırlı.
 *   2) METADATA: name / category / bölüm başlığı / mode / kaynak için makul teknik
 *      uzunluk sınırı (bunlar ana içerik değildir).
 */

import { isAllowedSourceKind } from "@/lib/sifa-rehberi/sectionModel";

/** Metadata alanları için makul teknik uzunluk sınırları (ana içerik DEĞİL). */
export const FIELD_MAX = {
  name: 200,
  category: 120,
  title: 300,
  mode: 120,
  source: 2_000,
} as const;

export const MAX_IMAGES = 40;
export const MAX_SECTIONS = 200;

/** Guide gövdesindeki METADATA alanları — makul uzunluk sınırı uygulanır. */
const GUIDE_METADATA_LIMITS: Record<string, number> = {
  name: FIELD_MAX.name,
  category: FIELD_MAX.category,
};

/**
 * Guide gövdesindeki ANA İÇERİK / profesyonel metin alanları.
 * Bu alanlara UZUNLUK SINIRI UYGULANMAZ (ürün kararı). Yalnız tip guard'ı vardır:
 * değer varsa string olmalı; object/array/number → bozuk payload olarak reddedilir.
 */
const GUIDE_CONTENT_TEXT_FIELDS: readonly string[] = [
  "symptoms",
  "general_summary",
  "medical_causes",
  "subconscious_causes",
  "temperament_causes",
  "other_causes",
  "iridology_match",
  "hand_analysis_match",
  "cupping_leech",
  "reflexology",
  "diet_recommendations",
  "herbal_methods",
  "stone_recommendations",
  "aromatherapy",
  "meditation",
  "breathwork",
  "bioenergy",
  "massage",
  "daily_routine",
  "sleep_routine",
  "supportive_alternative_methods",
  "islamic_recommendations",
];

/**
 * Guide gövdesini doğrular. Geçersizse insan-okunur hata mesajı döner; geçerliyse
 * null. (Tenant/auth davranışını DEĞİŞTİRMEZ — yalnız şekil/metadata/abuse.)
 */
export function validateGuideBody(body: Record<string, unknown>): string | null {
  // 1) Metadata: tip + makul uzunluk.
  for (const [key, max] of Object.entries(GUIDE_METADATA_LIMITS)) {
    const v = body[key];
    if (v == null) continue;
    if (typeof v !== "string") {
      return `Geçersiz alan tipi: ${key}.`;
    }
    if (v.length > max) {
      return `Alan çok uzun: ${key} (en fazla ${max} karakter).`;
    }
  }
  // 2) Ana içerik: UZUNLUK SINIRI YOK; yalnız tip guard (object/array/number → red).
  for (const key of GUIDE_CONTENT_TEXT_FIELDS) {
    const v = body[key];
    if (v == null) continue;
    if (typeof v !== "string") {
      return `Geçersiz alan tipi: ${key}.`;
    }
  }
  // 3) Görsel listesi: abuse sınırı.
  if ("images" in body && body.images != null) {
    if (!Array.isArray(body.images)) return "Geçersiz görsel listesi.";
    if (body.images.length > MAX_IMAGES) return `En fazla ${MAX_IMAGES} görsel eklenebilir.`;
  }
  return null;
}

/** section_type için makul teknik uzunluk sınırı (metadata). */
const SECTION_TYPE_MAX = 60;

/**
 * Section insert dizisini doğrular (FAZ 2: source_kind / expert_note / attention dahil).
 *
 * ÜRÜN KARARI: ANA İÇERİK alanları — note, expert_note, attention — UZUNLUK SINIRSIZ;
 * yalnız tip guard'ı (object/array → red). Metadata (title/mode/source/section_type)
 * makul teknik sınırlarını korur. source_kind opsiyonel + merkezi allow-list ile doğrulanır.
 */
export function validateSectionsBody(sections: unknown): string | null {
  if (!Array.isArray(sections)) return "Geçersiz bölüm listesi.";
  if (sections.length > MAX_SECTIONS) return `En fazla ${MAX_SECTIONS} bölüm.`;
  for (const s of sections) {
    if (!s || typeof s !== "object") return "Geçersiz bölüm kaydı.";
    const row = s as Record<string, unknown>;
    if (typeof row.section_type !== "string" || row.section_type.length === 0) {
      return "Bölüm tipi zorunlu.";
    }
    if (row.section_type.length > SECTION_TYPE_MAX) return "Geçersiz bölüm tipi.";
    // Ana içerik (note): UZUNLUK SINIRI YOK; yalnız tip guard (object/array → red).
    if ("note" in row && row.note != null && typeof row.note !== "string") {
      return "Geçersiz bölüm metni.";
    }
    // Uzman notu (expert_note): ANA İÇERİK — uzunluk sınırı YOK; yalnız tip guard.
    if ("expert_note" in row && row.expert_note != null && typeof row.expert_note !== "string") {
      return "Geçersiz uzman notu.";
    }
    // Dikkat notu (attention): ANA İÇERİK — uzunluk sınırı YOK; yalnız tip guard.
    if ("attention" in row && row.attention != null && typeof row.attention !== "string") {
      return "Geçersiz dikkat notu.";
    }
    // Kaynak türü (source_kind): opsiyonel; doluysa merkezi allow-list.
    if ("source_kind" in row && row.source_kind != null) {
      if (typeof row.source_kind !== "string") return "Geçersiz kaynak türü.";
      if (!isAllowedSourceKind(row.source_kind)) return "Geçersiz kaynak türü.";
    }
    if (typeof row.title === "string" && row.title.length > FIELD_MAX.title) {
      return `Bölüm başlığı çok uzun (en fazla ${FIELD_MAX.title} karakter).`;
    }
    if (typeof row.mode === "string" && row.mode.length > FIELD_MAX.mode) {
      return "Bölüm modu çok uzun.";
    }
    if (typeof row.source === "string" && row.source.length > FIELD_MAX.source) {
      return "Bölüm kaynağı çok uzun.";
    }
    if ("images" in row && row.images != null && !Array.isArray(row.images)) {
      return "Geçersiz bölüm görselleri.";
    }
  }
  return null;
}
