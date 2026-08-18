/**
 * Şifa Rehberi — CANONICAL model köprüsü (Faz 1).
 *
 * KARAR: `healing_guide_sections` canonical içerik modelidir (production'da 35/35
 * gerçek kayıt section-only). Bu modül, 7 sekmeli manuel formun 21 içerik alanını
 * KAYIPSIZ olarak section insert'lerine çevirir (import ile aynı section_type/mode
 * sözleşmesi) ve tersini yapar. Böylece YENİ manuel kayıtlar da canonical section
 * modeline yazılır; yeni flat-only borç üretilmez.
 *
 * MİGRASYON GEREKMEZ: 21 alanın tamamı mevcut section_type'lara (reasons,
 * applications, stones_details, islamic_suggestions, supportive) birebir oturur.
 *
 * GÜVENLİK/KAYIP: yalnızca "form-şekilli" (her section tek bir forma alanına
 * birebir dönen, görsel/kaynak taşımayan) kayıtlar forma geri-map'lenir ve
 * düzenlenebilir. Çok-section'lı / import edilmiş karmaşık kayıtlar form-şekilli
 * DEĞİLDİR → mevcut salt-okunur davranışları KORUNUR (sessiz veri kaybı olmaz).
 */
import type { HealingGuideSectionType } from "@/lib/admin/healingGuideJsonImport";
import { isMeaningfulText } from "@/lib/sifa-rehberi/normalizeTr";

/** 7 sekmeli formun 21 içerik alanı (name/category/symptoms guide-level'dır). */
export const GUIDE_CONTENT_FIELDS = [
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
] as const;

export type GuideContentField = (typeof GUIDE_CONTENT_FIELDS)[number];
export type GuideContentDraft = Record<GuideContentField, string>;

type FieldMeta = { section_type: HealingGuideSectionType; title: string };

/**
 * Alan → (section_type, görünen başlık). `mode` = alan anahtarının kendisi
 * (deterministik + benzersiz → tersine map kesin). Başlıklar Türkçe; detay
 * render `title`'ı doğrudan kullanır (getHealingGuideSectionDisplayTitle).
 */
export const FIELD_SECTION_META: Record<GuideContentField, FieldMeta> = {
  general_summary: { section_type: "reasons", title: "Genel Özet" },
  medical_causes: { section_type: "reasons", title: "Tıbbi Nedenler" },
  subconscious_causes: { section_type: "reasons", title: "Bilinçaltı Sebepleri" },
  temperament_causes: { section_type: "reasons", title: "Mizaç Sebepleri" },
  other_causes: { section_type: "reasons", title: "Diğer Sebepler" },
  iridology_match: { section_type: "reasons", title: "İridoloji’de Karşılığı" },
  hand_analysis_match: { section_type: "reasons", title: "El Analizinde Karşılığı" },
  cupping_leech: { section_type: "applications", title: "Hacamat & Sülük" },
  reflexology: { section_type: "applications", title: "Refleksoloji" },
  diet_recommendations: { section_type: "applications", title: "Diyet Önerileri" },
  herbal_methods: { section_type: "applications", title: "Bitkisel Yöntemler" },
  stone_recommendations: { section_type: "stones_details", title: "Doğaltaş Önerileri" },
  aromatherapy: { section_type: "supportive", title: "Aromaterapi" },
  meditation: { section_type: "supportive", title: "Meditasyon" },
  breathwork: { section_type: "supportive", title: "Nefes" },
  bioenergy: { section_type: "supportive", title: "Biyoenerji" },
  massage: { section_type: "supportive", title: "Masaj" },
  daily_routine: { section_type: "supportive", title: "Günlük Rutin" },
  sleep_routine: { section_type: "supportive", title: "Uyku Düzeni" },
  supportive_alternative_methods: {
    section_type: "supportive",
    title: "Destekleyici / Alternatif Uygulamalar",
  },
  islamic_recommendations: { section_type: "islamic_suggestions", title: "İslami Öneriler" },
};

/** Section insert payload (guide_id sunucuda eklenir). */
export type SectionInsertPayload = {
  section_type: HealingGuideSectionType;
  mode: string;
  title: string;
  note: string;
  source: null;
  images: [];
};

/** mode → alan tersine haritası (form-şekilli tespiti + geri-map için). */
const MODE_TO_FIELD: Record<string, GuideContentField> = Object.fromEntries(
  GUIDE_CONTENT_FIELDS.map((f) => [f, f]),
) as Record<string, GuideContentField>;

/**
 * Form draft'ını canonical section insert'lerine çevirir. Yalnız anlamlı alanlar
 * (placeholder/boş değil) section üretir. Alan sırası korunur (detay sırası).
 */
export function formToSections(draft: Partial<GuideContentDraft>): SectionInsertPayload[] {
  const out: SectionInsertPayload[] = [];
  for (const field of GUIDE_CONTENT_FIELDS) {
    const value = draft[field];
    if (!isMeaningfulText(value)) continue;
    const meta = FIELD_SECTION_META[field];
    out.push({
      section_type: meta.section_type,
      mode: field,
      title: meta.title,
      note: (value as string).trim(),
      source: null,
      images: [],
    });
  }
  return out;
}

/** Boş içerik draft'ı. */
export function emptyContentDraft(): GuideContentDraft {
  const d = {} as GuideContentDraft;
  for (const f of GUIDE_CONTENT_FIELDS) d[f] = "";
  return d;
}

type MinimalSection = {
  section_type?: string | null;
  mode?: string | null;
  title?: string | null;
  note?: string | null;
  source?: string | null;
  images?: unknown[] | null;
};

/**
 * Kayıt "form-şekilli" mi? → yalnız o zaman 7 sekmeli formda KAYIPSIZ düzenlenebilir.
 * Koşullar (hepsi):
 *   - her section'ın mode'u bilinen bir form alanına dönüyor,
 *   - hiçbir alana birden fazla section düşmüyor (tek textarea, tek section),
 *   - hiçbir section görsel taşımıyor (form section-görseli tutmaz → kayıp olmaz),
 *   - hiçbir section source taşımıyor (form kaynak alanı yok → kayıp olmaz).
 * Import edilmiş çok-section'lı / kaynaklı / görselli kayıtlar → FALSE (salt-okunur kalır).
 */
export function isFormShapedSections(sections: MinimalSection[] | null | undefined): boolean {
  if (!Array.isArray(sections) || sections.length === 0) return false;
  const usedFields = new Set<GuideContentField>();
  for (const s of sections) {
    const field = resolveField(s);
    if (!field) return false;
    if (usedFields.has(field)) return false; // aynı alana iki section → çok-section
    usedFields.add(field);
    if (Array.isArray(s.images) && s.images.length > 0) return false;
    if (typeof s.source === "string" && s.source.trim().length > 0) return false;
  }
  return true;
}

function resolveField(s: MinimalSection): GuideContentField | null {
  const modeKey = (s.mode ?? "").toString().trim();
  if (modeKey && MODE_TO_FIELD[modeKey]) return MODE_TO_FIELD[modeKey];
  return null;
}

/**
 * Form-şekilli section'ları 7 sekmeli form draft'ına geri-map'ler. Form-şekilli
 * DEĞİLSE null döner (çağıran salt-okunur davranışı korur).
 */
export function sectionsToFormDraft(
  sections: MinimalSection[] | null | undefined,
): GuideContentDraft | null {
  if (!isFormShapedSections(sections)) return null;
  const draft = emptyContentDraft();
  for (const s of sections!) {
    const field = resolveField(s);
    if (!field) return null;
    draft[field] = (s.note ?? "").toString();
  }
  return draft;
}
