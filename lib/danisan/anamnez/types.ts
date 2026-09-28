/**
 * Danışan Yolculuğu — Anamnez V1 SAF sözleşme tipleri (client + server import edilebilir).
 *
 * Veri modeli (migration 20270202000000_client_anamnesis.sql):
 *   client_anamneses          → her satır bir anamnez SÜRÜMÜ (tarihsel snapshot).
 *     form_custom  jsonb      → kanonik şablona göre danışana özel FARK (delta), şablonun kopyası DEĞİL.
 *     answers      jsonb      → fieldKey → değer.
 *     source_links jsonb      → Danışan Detayı kaynaklarından aktarım / "mevcudu koru" kayıtları.
 *   client_anamnesis_attachments → private Storage PDF ekleri.
 *
 * Kanonik şablon KODDADIR (template/stdV1.ts) ve sürümüyle dondurulmuştur; uzman global
 * şablonu değiştiremez. Hiçbir tip DOM/Node API'si içermez.
 */

export const ANAMNEZ_SECTION_KEYS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q",
] as const;
export type AnamnezSectionKey = (typeof ANAMNEZ_SECTION_KEYS)[number];

export const ANAMNEZ_FIELD_TYPES = [
  "yn",        // evet / hayır
  "ynd",       // evet / hayır + açıklama
  "single",    // tek seçim
  "multi",     // çoklu seçim
  "text",      // kısa metin
  "textarea",  // uzun metin
  "date",      // tarih (YYYY-MM-DD)
  "number",    // sayı (min/max/birim)
  "time",      // saat (HH:MM)
  "scale10",   // 0–10 ölçek
  "rows",      // tekrarlanabilir satırlar
] as const;
export type AnamnezFieldType = (typeof ANAMNEZ_FIELD_TYPES)[number];

/** Danışana özel eklenen sorularda izinli tipler (rows/time bilinçli olarak dışarıda). */
export const CUSTOM_FIELD_TYPES = [
  "text", "textarea", "yn", "ynd", "single", "multi", "scale10", "date", "number",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Danışan Detayı / Beslenme'den eşlenebilen (yapılandırılmış, 1:1) kaynaklar. */
export const ANAMNEZ_SOURCE_KEYS = [
  "clients.kan",
  "nutrition.height_cm",
  "nutrition.weight_kg",
  "nutrition.allergens",
  "nutrition.daily_meal_count",
  "nutrition.water_note",
  "nutrition.dietary_pattern",
  "nutrition.activity_level",
  "nutrition.lifestyle_note",
] as const;
export type AnamnezSourceKey = (typeof ANAMNEZ_SOURCE_KEYS)[number];

export type RowColumnType = "text" | "number" | "single";

export type RowColumn = {
  key: string;
  type: RowColumnType;
  /** type=single için seçenek kümesi anahtarı (OPTION_SETS). */
  options?: string;
  min?: number;
  max?: number;
};

export type TemplateField = {
  key: string;
  type: AnamnezFieldType;
  /** single/multi için seçenek kümesi anahtarı (OPTION_SETS). */
  options?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Birim etiketi anahtarı (katalog `units`). */
  unit?: string;
  /** rows için kolonlar. */
  columns?: readonly RowColumn[];
  /** Danışan Detayı kaynağı (varsa). */
  source?: AnamnezSourceKey;
};

export type TemplateSection = {
  key: AnamnezSectionKey;
  /** true → varsayılan KAPALI; uzman bu anamnez için etkinleştirir (veri minimizasyonu, ör. L). */
  optional?: boolean;
  fields: readonly TemplateField[];
};

export type AnamnezTemplate = {
  key: "standard";
  version: string;
  optionSets: Readonly<Record<string, readonly string[]>>;
  sections: readonly TemplateSection[];
};

// ─── Danışana özel form farkı (form_custom) ──────────────────────────────────

export type CustomOption = { key: string; label: string };

export type CustomField = {
  key: string;                 // c_<hex>
  section: AnamnezSectionKey;
  type: CustomFieldType;
  label: string;
  options?: CustomOption[];    // single/multi
};

export type FormCustom = {
  /** "Bu danışandan kaldır" ile gizlenen alanlar (kanonik veya özel). Cevaplar SİLİNMEZ. */
  hidden: string[];
  /** Kanonik alan başlığı düzenlemeleri (yalnız bu anamnez). */
  labels: Record<string, string>;
  /** Varsayılan kapalı (optional) bölümlerden bu anamnezde etkinleştirilenler. */
  enabledSections: AnamnezSectionKey[];
  /** Bu anamneze eklenen sorular. */
  custom: CustomField[];
};

export const EMPTY_FORM_CUSTOM: FormCustom = Object.freeze({
  hidden: [],
  labels: {},
  enabledSections: [],
  custom: [],
}) as FormCustom;

// ─── Cevaplar ────────────────────────────────────────────────────────────────

export type YndValue = { v: boolean | null; d: string };
export type RowValue = { id: string; ref?: string } & Record<string, string | number | null | undefined>;

export type AnswerValue =
  | boolean
  | string
  | number
  | string[]
  | YndValue
  | RowValue[]
  | null;

export type Answers = Record<string, AnswerValue>;

// ─── Kaynak bağlantıları (source_links) ──────────────────────────────────────

/** Karşılaştırılabilir kaynak değeri (normalize). Liste kaynakları sıralı ref dizisidir. */
export type SourceCmpValue = string | number | string[] | null;

export type SourceLink = {
  src: AnamnezSourceKey;
  /** Aktarım / koru anındaki normalize kaynak değeri. */
  v: SourceCmpValue;
  /** imported = danışan bilgisi kullanıldı; kept = mevcut anamnez değeri korundu. */
  a: "imported" | "kept";
  /** Sunucu damgası (ISO). */
  at: string;
};

export type SourceLinks = Record<string, SourceLink>;

// ─── Kaynak değerleri (sunucudan, hedef alan biçiminde) ──────────────────────

export type AllergenSourceItem = { ref: string; labelTr: string; labelEn: string; note: string };

export type SourceValues = {
  "clients.kan": string | null;                 // option key (a_pos…) — kanonik dışı → null
  "nutrition.height_cm": number | null;
  "nutrition.weight_kg": number | null;
  "nutrition.allergens": AllergenSourceItem[];  // boş liste = kaynak yok
  "nutrition.daily_meal_count": number | null;
  "nutrition.water_note": string | null;
  "nutrition.dietary_pattern": string | null;
  "nutrition.activity_level": string | null;    // option key
  "nutrition.lifestyle_note": string | null;
};

export type SourceMeta = {
  /** Beslenme profilinin gerçek updated_at'i (varsa) — yalnız güvenilir kaynak için gösterilir. */
  nutritionProfileUpdatedAt: string | null;
  /** Kullanılan ölçümün tarihi (varsa). */
  heightMeasuredAt: string | null;
  weightMeasuredAt: string | null;
};

export type FieldSourceState = "none" | "current" | "available" | "changed";

// ─── Kayıt tipleri (API sözleşmesi) ──────────────────────────────────────────

export type AnamnezStatus = "draft" | "completed";
export type AnamnezKind = "initial" | "update";

export type ClientSnapshot = { ad: string | null; soyad: string | null; dogum: string | null };

export type AnamnezSummary = {
  id: string;
  kind: AnamnezKind;
  title: string | null;
  assessment_date: string;
  status: AnamnezStatus;
  template_version: string;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  attachment_count: number;
  /** Yalnız kaynak bağlantılarından hesaplanan uyarı (liste görünümü; cevaplar yüklenmez). */
  source_changed: boolean;
};

export type AnamnezRecord = {
  id: string;
  client_id: string;
  kind: AnamnezKind;
  title: string | null;
  assessment_date: string;
  status: AnamnezStatus;
  template_key: string;
  template_version: string;
  form_custom: FormCustom;
  answers: Answers;
  source_links: SourceLinks;
  client_snapshot: ClientSnapshot;
  based_on_anamnesis_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AnamnezAttachment = {
  id: string;
  original_name: string;
  size_bytes: number;
  created_at: string;
};
