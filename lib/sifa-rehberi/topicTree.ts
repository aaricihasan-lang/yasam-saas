/**
 * Şifa Rehberi — PREMIUM UX V2 · TEK KANONİK KONU AĞACI.
 *
 * create / detail / edit ekranlarının HEPSİ bu tek tanımı ve aynı
 * (section_type + mode) eşlemesini kullanır → zamanla kopan üç ayrı gruplama
 * tablosu (CREATE_TABS / HEALING_SECTION_DISPLAY / DETAIL_TABS) yerine tek kaynak.
 *
 * TASARIM KARARLARI:
 *  - Kanonik DB değerleri (section_type/mode) DEĞİŞMEZ; yalnız görünen ağaç birleşir.
 *  - Aromaterapi supportive+mode=aromaterapi saklansa da AYRI ana bölümdür
 *    (Destekleyici'ye düşmez) — resolveTopicId bunu her ekranda garanti eder.
 *  - `resolveTopicId` KAYIPSIZDIR: bilinmeyen/legacy mode değerleri asla düşmez;
 *    section_type'a göre grubun "genel" alt konusuna yerleştirilir (mode DB'de korunur).
 *  - Her alt konunun bir `legacyKey`'i olabilir → eski düz kolon içeriği ilgili konu
 *    altında "Önceki kayıt" olarak KAYIPSIZ gösterilir (otomatik dönüştürme YOK).
 *  - Yeni alt konu (iridoloji/el_analizi) mode serbest metin olduğundan MIGRATION GEREKMEZ.
 */
import type { SectionType } from "@/lib/sifa-rehberi/sectionModel";
import { normalizeModeKey } from "@/lib/sifa-rehberi/sectionModel";

export type Topic = {
  /** Kanonik mode değeri (yeni section notları bu mode ile yazılır). */
  id: string;
  label: string;
  icon: string;
  section_type: SectionType;
  mode: string;
  /** healing_guides düz (legacy) kolon karşılığı — varsa "Önceki kayıt" gösterimi. */
  legacyKey?: string;
};

export type TopicGroupKind = "rahatsizlik" | "topics";

export type TopicGroup = {
  id: string;
  label: string;
  icon: string;
  desc: string;
  kind: TopicGroupKind;
  topics: Topic[];
};

export const TOPIC_GROUPS: readonly TopicGroup[] = [
  {
    id: "rahatsizlik",
    label: "Rahatsızlık",
    icon: "📋",
    desc: "Ad, kategori ve rahatsızlık düzeyi görseller.",
    kind: "rahatsizlik",
    topics: [],
  },
  {
    id: "belirtiler",
    label: "Belirtiler / Sebepler",
    icon: "🔍",
    desc: "Genel özet, nedenler ve analiz eşleştirmeleri.",
    kind: "topics",
    topics: [
      { id: "genel_ozet", label: "Genel / Özet", icon: "📋", section_type: "reasons", mode: "genel_ozet", legacyKey: "general_summary" },
      { id: "tibbi", label: "Tıbbi Nedenler", icon: "🩺", section_type: "reasons", mode: "tibbi", legacyKey: "medical_causes" },
      { id: "bilincalti", label: "Bilinçaltı Sebepleri", icon: "🧠", section_type: "reasons", mode: "bilincalti", legacyKey: "subconscious_causes" },
      { id: "mizac", label: "Mizaç Sebepleri", icon: "🌡️", section_type: "reasons", mode: "mizac", legacyKey: "temperament_causes" },
      { id: "diger", label: "Diğer Sebepler", icon: "🔎", section_type: "reasons", mode: "diger", legacyKey: "other_causes" },
      { id: "iridoloji", label: "İridolojide Karşılığı", icon: "👁️", section_type: "reasons", mode: "iridoloji", legacyKey: "iridology_match" },
      { id: "el_analizi", label: "El Analizinde Karşılığı", icon: "✋", section_type: "reasons", mode: "el_analizi", legacyKey: "hand_analysis_match" },
    ],
  },
  {
    id: "uygulamalar",
    label: "Uygulamalar / Yöntemler",
    icon: "🙌",
    desc: "Hacamat, refleksoloji, diyet, bitkisel ve genel uygulamalar.",
    kind: "topics",
    topics: [
      { id: "hacamat_suluk", label: "Hacamat & Sülük", icon: "💧", section_type: "applications", mode: "hacamat_suluk", legacyKey: "cupping_leech" },
      { id: "refleksoloji", label: "Refleksoloji", icon: "👣", section_type: "applications", mode: "refleksoloji", legacyKey: "reflexology" },
      { id: "diyet", label: "Diyet Önerileri", icon: "🥗", section_type: "applications", mode: "diyet", legacyKey: "diet_recommendations" },
      { id: "bitkisel", label: "Bitkisel Yöntemler", icon: "🌿", section_type: "herbal", mode: "bitkisel", legacyKey: "herbal_methods" },
      { id: "uygulama", label: "Genel Uygulama", icon: "🙌", section_type: "applications", mode: "uygulama" },
    ],
  },
  {
    id: "dogaltas",
    label: "Doğaltaş & Mineral",
    icon: "💎",
    desc: "Taş ve mineral önerileri (serbest metin, çoklu not).",
    kind: "topics",
    topics: [
      { id: "stones_details", label: "Doğaltaş & Mineral", icon: "💎", section_type: "stones_details", mode: "stones_details", legacyKey: "stone_recommendations" },
    ],
  },
  {
    id: "aromaterapi",
    label: "Aromaterapi",
    icon: "🌸",
    desc: "Aromaterapi notları ve önerileri.",
    kind: "topics",
    topics: [
      { id: "aromaterapi", label: "Aromaterapi", icon: "🌸", section_type: "supportive", mode: "aromaterapi", legacyKey: "aromatherapy" },
    ],
  },
  {
    id: "islami",
    label: "İslami Öneriler",
    icon: "🕌",
    desc: "Dua, sure, niyet ve manevi destek.",
    kind: "topics",
    topics: [
      { id: "islamic_suggestions", label: "İslami Öneriler", icon: "🕌", section_type: "islamic_suggestions", mode: "islamic_suggestions", legacyKey: "islamic_recommendations" },
    ],
  },
  {
    id: "destekleyici",
    label: "Destekleyici / Alternatif Uygulamalar",
    icon: "✨",
    desc: "Nefes, meditasyon, biyoenerji, masaj, rutinler ve destekleyici uygulamalar.",
    kind: "topics",
    topics: [
      { id: "nefes", label: "Nefes", icon: "🌬️", section_type: "supportive", mode: "nefes", legacyKey: "breathwork" },
      { id: "meditation", label: "Meditasyon", icon: "🧘", section_type: "supportive", mode: "meditation", legacyKey: "meditation" },
      { id: "bioenerji", label: "Biyoenerji", icon: "✨", section_type: "supportive", mode: "bioenerji", legacyKey: "bioenergy" },
      { id: "masaj", label: "Masaj", icon: "💆", section_type: "supportive", mode: "masaj", legacyKey: "massage" },
      { id: "gunluk_rutin", label: "Günlük Rutin", icon: "📅", section_type: "supportive", mode: "gunluk_rutin", legacyKey: "daily_routine" },
      { id: "uyku", label: "Uyku Düzeni", icon: "😴", section_type: "supportive", mode: "uyku", legacyKey: "sleep_routine" },
      { id: "destekleyici", label: "Genel Destekleyici", icon: "✨", section_type: "supportive", mode: "destekleyici", legacyKey: "supportive_alternative_methods" },
    ],
  },
] as const;

/** Tüm alt konular (rahatsizlik hariç), ağaç sırasında. */
export const TOPICS: readonly Topic[] = TOPIC_GROUPS.flatMap((g) => g.topics);

const TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

export function topicById(id: string | null | undefined): Topic | null {
  if (!id) return null;
  return TOPIC_BY_ID[id] ?? null;
}

/** Bir section_type için grubun "genel/fallback" alt konu id'si (kayıpsız yerleştirme). */
const FALLBACK_TOPIC_BY_TYPE: Record<SectionType, string> = {
  reasons: "diger",
  applications: "uygulama",
  herbal: "bitkisel",
  stones_details: "stones_details",
  islamic_suggestions: "islamic_suggestions",
  supportive: "destekleyici",
};

/**
 * Bir section satırını (section_type + mode) TEK bir alt konuya çözer. KAYIPSIZDIR:
 * eşleşme yoksa (bilinmeyen/legacy mode) section_type'ın fallback konusuna düşer —
 * satır asla kaybolmaz, DB'deki mode değeri DEĞİŞTİRİLMEZ (yalnız gruplama içindir).
 */
export function resolveTopicId(section: { section_type: string; mode?: string | null }): string {
  const type = section.section_type as SectionType;
  const modeKey = normalizeModeKey(section.mode);

  // supportive: aromaterapi AYRI ana bölüm; diğer supportive modları Destekleyici altında.
  if (type === "supportive") {
    if (modeKey === "aromaterapi") return "aromaterapi";
    const t = TOPICS.find((x) => x.section_type === "supportive" && x.mode === modeKey && x.id !== "aromaterapi");
    return t ? t.id : "destekleyici";
  }

  // Diğer tipler: (section_type, mode) tam eşleşmesi → o konu; yoksa tip fallback'i.
  const exact = TOPICS.find((x) => x.section_type === type && x.mode === modeKey);
  if (exact) return exact.id;

  return FALLBACK_TOPIC_BY_TYPE[type] ?? "diger";
}

/** Grup id'sini bir alt konu id'sinden bul. */
export function groupIdOfTopic(topicId: string): string | null {
  const g = TOPIC_GROUPS.find((grp) => grp.topics.some((t) => t.id === topicId));
  return g?.id ?? null;
}

/** legacy düz kolon anahtarı → alt konu id (eski içeriğin gösterileceği konu). */
export const LEGACY_KEY_TO_TOPIC_ID: Record<string, string> = Object.fromEntries(
  TOPICS.filter((t) => t.legacyKey).map((t) => [t.legacyKey as string, t.id]),
);

/** İlk grup (rahatsizlik) her zaman başta; ilk seçilebilir alt konu id'si. */
export const FIRST_TOPIC_ID: string = TOPICS[0]?.id ?? "genel_ozet";

/**
 * Bir section listesini alt konu id'sine göre gruplar (KAYIPSIZ). Ağaç sırasını
 * korur; her konu için (boş da olsa) bir dizi döner. create/detail/edit ortak kullanır.
 */
export function groupByTopic<T extends { section_type: string; mode?: string | null }>(
  items: T[],
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const t of TOPICS) grouped[t.id] = [];
  for (const item of items) {
    const tid = resolveTopicId(item);
    (grouped[tid] ??= []).push(item);
  }
  return grouped;
}

/** Sadece içeriği olan (veya legacy içeriği olan) grupların/konuların sayımı için yardımcı. */
export function topicNoteCounts<T extends { section_type: string; mode?: string | null }>(
  items: T[],
): Record<string, number> {
  const grouped = groupByTopic(items);
  const counts: Record<string, number> = {};
  for (const t of TOPICS) counts[t.id] = grouped[t.id]?.length ?? 0;
  return counts;
}
