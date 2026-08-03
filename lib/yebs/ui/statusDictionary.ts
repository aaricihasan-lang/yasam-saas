// ============================================================
// YEBS A8 — Durum (status / verification_status) Türkçe sözlüğü + tone
// Durum YALNIZ renkle anlatılmaz: her badge metin + tone (+ opsiyonel ikon adı) taşır.
// ============================================================

export type StatusTone = "slate" | "sky" | "amber" | "violet" | "emerald" | "rose" | "stone";

export type StatusMeta = { label: string; tone: StatusTone; short: string };

/** Canonical + claim/relation + source durumları (birleşik sözlük). */
export const STATUS_META: Record<string, StatusMeta> = {
  draft: { label: "Taslak", tone: "slate", short: "Taslak" },
  under_review: { label: "İncelemede", tone: "sky", short: "İncelemede" },
  needs_verification: { label: "Doğrulama Bekliyor", tone: "amber", short: "Doğrulama" },
  verified: { label: "Doğrulandı", tone: "violet", short: "Doğrulandı" },
  approved: { label: "Onaylandı", tone: "sky", short: "Onaylandı" },
  published: { label: "Yayında", tone: "emerald", short: "Yayında" },
  archived: { label: "Arşivde", tone: "stone", short: "Arşiv" },
};

/** Evidence verification_status sözlüğü. */
export const VERIFICATION_META: Record<string, StatusMeta> = {
  unverified: { label: "Doğrulanmadı", tone: "slate", short: "Doğrulanmadı" },
  verified: { label: "Doğrulandı", tone: "emerald", short: "Doğrulandı" },
  rejected: { label: "Reddedildi", tone: "rose", short: "Reddedildi" },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: status, tone: "slate", short: status };
}

export function verificationMeta(status: string): StatusMeta {
  return VERIFICATION_META[status] ?? { label: status, tone: "slate", short: status };
}

/** Tailwind sınıfları — badge (metin + arka plan + kenarlık; yalnız renge güvenilmez). */
export const TONE_BADGE_CLASS: Record<StatusTone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  stone: "bg-stone-100 text-stone-600 ring-stone-300",
};

// ---- Entity-type / enum Türkçe etiketleri (form + liste görünürlüğü) ----
export const CONCEPT_TYPE_LABEL: Record<string, string> = {
  energy_center: "Enerji Merkezi", channel: "Kanal", vital_substance: "Yaşamsal Öz",
  anatomy_model: "Anatomi Modeli", technique: "Teknik", principle: "İlke", other: "Diğer",
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  classical_text: "Klasik Metin", book: "Kitap", journal_article: "Makale",
  regulatory_document: "Mevzuat Belgesi", monograph: "Monografi", standard: "Standart",
  database_record: "Veritabanı Kaydı", thesis: "Tez", website: "Web Sitesi",
  oral_tradition_record: "Sözlü Gelenek Kaydı", other: "Diğer",
  institutional_report: "Kurumsal Rapor", archival_document: "Arşiv Belgesi",
  media_recording: "Medya Kaydı", interview_record: "Görüşme Kaydı",
  field_observation_record: "Saha Gözlem Kaydı", experiential_record: "Deneyimsel Kayıt",
};

export const RELATION_TYPE_LABEL: Record<string, string> = {
  broader_than: "Daha Geneli", part_of: "Parçası", related_to: "İlişkili",
  contrasted_with: "Karşıtlık", corresponds_to: "Karşılık Gelir",
};

/** İlişki yönünü kullanıcı dilinde açıklar (canonical normalizasyonu teknik anlatılmaz). */
export const RELATION_DIRECTION_TEXT: Record<string, (a: string, b: string) => string> = {
  broader_than: (a, b) => `${a}, ${b} kavramından daha geneldir`,
  part_of: (a, b) => `${a}, ${b} kavramının bir parçasıdır`,
  related_to: (a, b) => `${a} ile ${b} ilişkilidir`,
  contrasted_with: (a, b) => `${a} ile ${b} karşıtlık içindedir`,
  corresponds_to: (a, b) => `${a}, ${b} kavramına karşılık gelir`,
};

export const CLAIM_TYPE_LABEL: Record<string, string> = {
  identity: "Kimlik", function: "İşlev", relationship: "İlişki",
  practice: "Uygulama", safety: "Güvenlik", research_finding: "Araştırma Bulgusu",
};

export const EVIDENCE_ROLE_LABEL: Record<string, string> = {
  primary_support: "Birincil Destek", supporting: "Destekleyici",
  contradiction: "Çelişki", context: "Bağlam",
};

export const LABEL_KIND_LABEL: Record<string, string> = {
  original: "Özgün", transliteration: "Çevriyazı", faithful_translation: "Sadık Çeviri",
  common_name: "Yaygın Ad", alternative: "Alternatif",
};

export const EVIDENCE_LAYER_LABEL: Record<string, string> = {
  classical_textual: "Klasik Metinsel", traditional: "Geleneksel", ethnographic: "Etnografik",
  clinical: "Klinik", experimental: "Deneysel", scientific_review: "Bilimsel Derleme",
  regulatory: "Düzenleyici", experiential: "Deneyimsel", energetic_metaphysical: "Enerjetik/Metafizik",
};
