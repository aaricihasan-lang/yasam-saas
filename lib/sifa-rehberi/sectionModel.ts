/**
 * Şifa Rehberi — CANONICAL section modeli (FAZ 2 tek merkez).
 *
 * Amaç: dağınık MODE_LABEL / SECTION_TYPE_LABEL mantığını tek dosyada toplamak ve
 * section-native editörün "modalite" seçimlerini SEMANTİK OLARAK AÇIK yapmak.
 *
 * BAĞLAYICI KARARLAR (Faz 2):
 *  - `herbal` section_type KORUNUR; yeni bitkisel section `applications`'a çevrilmez.
 *  - `applications` gerçek uygulama/modalite kovasıdır.
 *  - Aromaterapi seçilince GİZLİ `supportive` collapse YAPILMAZ: anlam `mode`/`title`
 *    ile açık ve kayıpsız temsil edilir (kullanıcı modaliteyi bilinçli seçer).
 *  - Yeni section_type enum'u açılmaz; canonical 6 tip yeterli.
 */

export const SECTION_TYPES = [
  "reasons",
  "applications",
  "herbal",
  "stones_details",
  "islamic_suggestions",
  "supportive",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export function isSectionType(v: unknown): v is SectionType {
  return typeof v === "string" && (SECTION_TYPES as readonly string[]).includes(v);
}

/**
 * Modalite = kullanıcının editörde bilinçle seçtiği anlam. `id` → DB `mode`,
 * `section_type` → canonical kova, `group` → detay/görünüm sekmesi.
 * (Bitkisel → section_type HERBAL; Aromaterapi → supportive AMA mode=aromaterapi,
 *  yani anlam kaybolmaz.)
 */
export type Modality = {
  id: string;
  label: string;
  section_type: SectionType;
  group: SectionType; // hangi görünüm sekmesinde listelenir
  icon: string;
};

export const MODALITIES: readonly Modality[] = [
  // Nedenler / Sebepler
  { id: "genel_ozet", label: "Genel Özet", section_type: "reasons", group: "reasons", icon: "📋" },
  { id: "tibbi", label: "Tıbbi Nedenler", section_type: "reasons", group: "reasons", icon: "🩺" },
  { id: "bilincalti", label: "Bilinçaltı Sebepleri", section_type: "reasons", group: "reasons", icon: "🧠" },
  { id: "mizac", label: "Mizaç Sebepleri", section_type: "reasons", group: "reasons", icon: "🌡️" },
  { id: "diger", label: "Diğer Sebepler", section_type: "reasons", group: "reasons", icon: "🔍" },
  // Uygulamalar / Yöntemler
  { id: "hacamat_suluk", label: "Hacamat & Sülük", section_type: "applications", group: "applications", icon: "💧" },
  { id: "refleksoloji", label: "Refleksoloji", section_type: "applications", group: "applications", icon: "👣" },
  { id: "diyet", label: "Diyet Önerileri", section_type: "applications", group: "applications", icon: "🥗" },
  { id: "uygulama", label: "Genel Uygulama", section_type: "applications", group: "applications", icon: "🙌" },
  // Bitkisel — section_type HERBAL korunur (Faz 2 karar).
  { id: "bitkisel", label: "Bitkisel Yöntemler", section_type: "herbal", group: "applications", icon: "🌿" },
  // Doğaltaş
  { id: "stones_details", label: "Doğaltaş Önerileri", section_type: "stones_details", group: "stones_details", icon: "💎" },
  // İslami
  { id: "islamic_suggestions", label: "İslami Öneriler", section_type: "islamic_suggestions", group: "islamic_suggestions", icon: "🕌" },
  // Destekleyici — aromaterapi vb. anlam mode ile açık.
  { id: "aromaterapi", label: "Aromaterapi", section_type: "supportive", group: "supportive", icon: "🌸" },
  { id: "meditation", label: "Meditasyon", section_type: "supportive", group: "supportive", icon: "🧘" },
  { id: "nefes", label: "Nefes", section_type: "supportive", group: "supportive", icon: "🌬️" },
  { id: "bioenerji", label: "Biyoenerji", section_type: "supportive", group: "supportive", icon: "✨" },
  { id: "masaj", label: "Masaj", section_type: "supportive", group: "supportive", icon: "💆" },
  { id: "gunluk_rutin", label: "Günlük Rutin", section_type: "supportive", group: "supportive", icon: "📅" },
  { id: "uyku", label: "Uyku Düzeni", section_type: "supportive", group: "supportive", icon: "😴" },
  { id: "destekleyici", label: "Destekleyici / Alternatif", section_type: "supportive", group: "supportive", icon: "✨" },
];

const MODALITY_BY_ID: Record<string, Modality> = Object.fromEntries(
  MODALITIES.map((m) => [m.id, m]),
);

export function modalityById(id: string | null | undefined): Modality | null {
  if (!id) return null;
  return MODALITY_BY_ID[normalizeModeKey(id)] ?? null;
}

export function normalizeModeKey(value: string | null | undefined): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  return raw.toLocaleLowerCase("tr-TR").replace(/\s+/g, "_").replace(/-/g, "_");
}

/** Kaynak türleri — HEPSİ OPSİYONEL. Bilimsel kanıt derecesi DEĞİLDİR. */
export const SOURCE_KINDS = [
  "Kitap",
  "Eğitim / Ders",
  "Geleneksel Kaynak",
  "Makale",
  "Web Kaynağı",
  "İslami Kaynak",
  "Uzman Aktarımı",
  "Kişisel Deneyim / Gözlem",
  "Diğer",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** source_kind opsiyoneldir: boş kabul; doluysa listeden olmalı. */
export function isAllowedSourceKind(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t === "" || (SOURCE_KINDS as readonly string[]).includes(t);
}

// ── Görünen etiketler (word-report + detay için tek kaynak) ────────────────────
export const MODE_LABEL: Record<string, string> = {
  general_summary: "Genel Özet",
  genel_ozet: "Genel Özet",
  medical_causes: "Tıbbi Nedenler",
  tibbi: "Tıbbi Nedenler",
  subconscious_causes: "Bilinçaltı Sebepleri",
  bilincalti: "Bilinçaltı Sebepleri",
  temperament_causes: "Mizaç Sebepleri",
  mizac: "Mizaç Sebepleri",
  other_causes: "Diğer Sebepler",
  diger: "Diğer Sebepler",
  iridology_match: "İridoloji'de Karşılığı",
  hand_analysis_match: "El Analizinde Karşılığı",
  cupping_leech: "Hacamat & Sülük",
  hacamat_suluk: "Hacamat & Sülük",
  hacamat: "Hacamat & Sülük",
  reflexology: "Refleksoloji",
  refleksoloji: "Refleksoloji",
  diet_recommendations: "Diyet Önerileri",
  diyet: "Diyet Önerileri",
  herbal_methods: "Bitkisel Yöntemler",
  herbal: "Bitkisel Yöntemler",
  bitkisel: "Bitkisel Yöntemler",
  stone_recommendations: "Doğaltaş Önerileri",
  stones_details: "Doğaltaş Detayları",
  aromatherapy: "Aromaterapi",
  aromaterapi: "Aromaterapi",
  meditation: "Meditasyon",
  breathwork: "Nefes Çalışması",
  nefes: "Nefes Çalışması",
  bioenergy: "Biyoenerji",
  bioenerji: "Biyoenerji",
  massage: "Masaj",
  masaj: "Masaj",
  daily_routine: "Günlük Rutin",
  gunluk_rutin: "Günlük Rutin",
  sleep_routine: "Uyku Düzeni",
  uyku: "Uyku Düzeni",
  supportive_alternative_methods: "Destekleyici / Alternatif Uygulamalar",
  destekleyici: "Destekleyici / Alternatif Uygulamalar",
  supportive: "Destekleyici Uygulamalar",
  islamic_recommendations: "İslami Öneriler",
  islamic_suggestions: "İslami Öneriler",
  reasons: "Nedenler / Sebepler",
  applications: "Uygulamalar / Yöntemler",
  uygulama: "Uygulama",
};

export const SECTION_TYPE_LABEL: Record<string, string> = {
  reasons: "Nedenler / Sebepler",
  applications: "Uygulamalar / Yöntemler",
  herbal: "Bitkisel Yöntemler",
  stones_details: "Doğaltaş Detayları",
  islamic_suggestions: "İslami Öneriler",
  supportive: "Destekleyici Uygulamalar",
};

export const SECTION_TYPE_ORDER: readonly string[] = [
  "reasons",
  "applications",
  "herbal",
  "stones_details",
  "islamic_suggestions",
  "supportive",
];

/**
 * Word/gösterim için bir bölümde YAZDIRILABİLİR herhangi bir katman var mı?
 * (note / source / source_kind / expert_note / attention). Bu YALNIZ boş-bölüm
 * filtresidir; İÇERİK EŞİTLİĞİNE bakmaz → aynı metne sahip iki FARKLI section
 * asla birbirini düşürmez (content dedup YOK).
 */
export function sectionHasAnyLayer(s: {
  note?: string | null;
  source?: string | null;
  source_kind?: string | null;
  expert_note?: string | null;
  attention?: string | null;
}): boolean {
  const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return Boolean(t(s.note) || t(s.source) || t(s.source_kind) || t(s.expert_note) || t(s.attention));
}

// ── Section-native replace payload — saf normalize (route + harness ortak) ─────
export type IncomingSection = Record<string, unknown>;

export type NormalizedSection = {
  section_type: string;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  source_kind: string | null;
  expert_note: string | null;
  attention: string | null;
  images: unknown[];
  sort_order: number;
};

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

/**
 * Editörden gelen ham section listesini kayıpsız DB payload'ına çevirir.
 * section_type/mode/title/note/source/source_kind/expert_note/attention/images KORUNUR.
 * sort_order dizinden deterministik atanır (0..N-1); RPC ordinality ile aynı sonucu üretir.
 */
export function normalizeReplaceSections(incoming: IncomingSection[]): NormalizedSection[] {
  return incoming.map((s, i) => ({
    section_type: String(s.section_type ?? ""),
    mode: strOrNull(s.mode),
    title: strOrNull(s.title),
    note: strOrNull(s.note),
    source: strOrNull(s.source),
    source_kind: strOrNull(s.source_kind),
    expert_note: strOrNull(s.expert_note),
    attention: strOrNull(s.attention),
    images: Array.isArray(s.images) ? s.images : [],
    sort_order: typeof s.sort_order === "number" ? s.sort_order : i,
  }));
}
