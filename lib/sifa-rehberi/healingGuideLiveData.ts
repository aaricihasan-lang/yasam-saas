import { supabase } from "@/lib/supabase";
import type { HealingGuideSectionType } from "@/lib/admin/healingGuideJsonImport";

export type HealingGuideListRow = {
  id: string;
  tenant_id: string;
  name: string;
  category: string | null;
  symptoms: string | null;
  created_at: string;
  updated_at: string | null;
  sectionCount: number;
  sectionTypes: HealingGuideSectionType[];
  /** Arama / önizleme için kısa metin parçaları */
  sectionSnippets: string[];
};

export type HealingGuideSectionRow = {
  id: string;
  guide_id: string;
  section_type: HealingGuideSectionType;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  images: unknown[] | null;
  created_at: string;
};

export type HealingGuideDetail = {
  guide: {
    id: string;
    tenant_id: string;
    name: string;
    category: string | null;
    symptoms: string | null;
    created_at: string;
    updated_at: string | null;
    related_stones: unknown | null;
    related_reflexology: unknown | null;
    /** Eski düz kolonlar — düzenleme modu için */
    legacy: Record<string, string | null>;
    images: unknown[] | null;
  };
  sections: HealingGuideSectionRow[];
};

export const HEALING_SECTION_DISPLAY: {
  type: HealingGuideSectionType;
  label: string;
  icon: string;
  desc: string;
}[] = [
  {
    type: "reasons",
    label: "Nedenler / Sebepler",
    icon: "🔍",
    desc: "Tıbbi, bilinçaltı ve diğer olası nedenler.",
  },
  {
    type: "herbal",
    label: "Bitkisel Yöntemler",
    icon: "🌿",
    desc: "Bitkisel uygulama ve öneriler.",
  },
  {
    type: "stones_details",
    label: "Doğaltaş Detayları",
    icon: "💎",
    desc: "Taş ve mineral önerileri.",
  },
  {
    type: "islamic_suggestions",
    label: "İslami Öneriler",
    icon: "🕌",
    desc: "Dua, sure, niyet ve manevi destek.",
  },
  {
    type: "supportive",
    label: "Destekleyici Uygulamalar",
    icon: "✨",
    desc: "Meditasyon, nefes, rutin ve destekleyici yöntemler.",
  },
];

const LEGACY_TEXT_KEYS = [
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

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function normalizeImages(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [];
}

type RawGuideRow = Record<string, unknown> & {
  healing_guide_sections?: RawSectionRow[] | null;
};

type RawSectionRow = Record<string, unknown>;

function mapSectionRow(row: RawSectionRow): HealingGuideSectionRow | null {
  const sectionType = textValue(row.section_type) as HealingGuideSectionType;
  if (!sectionType) return null;
  const guideId = textValue(row.guide_id);
  const id = textValue(row.id);
  if (!id || !guideId) return null;

  return {
    id,
    guide_id: guideId,
    section_type: sectionType,
    mode: textValue(row.mode) || null,
    title: textValue(row.title) || null,
    note: textValue(row.note) || null,
    source: textValue(row.source) || null,
    images: normalizeImages(row.images),
    created_at: textValue(row.created_at) || new Date().toISOString(),
  };
}

function legacyFieldsFromRow(row: RawGuideRow): Record<string, string | null> {
  const legacy: Record<string, string | null> = {};
  for (const key of LEGACY_TEXT_KEYS) {
    const value = row[key];
    legacy[key] = typeof value === "string" ? value : value == null ? null : String(value);
  }
  return legacy;
}

export function hasLegacyDetailContent(legacy: Record<string, string | null>): boolean {
  return LEGACY_TEXT_KEYS.some((key) => {
    const v = legacy[key];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function sectionSnippet(section: HealingGuideSectionRow): string {
  return [section.title, section.note, section.mode, section.source]
    .map((part) => textValue(part))
    .filter(Boolean)
    .join(" · ");
}

export function listRowPreview(row: HealingGuideListRow, limit = 140): string {
  const fromSymptoms = row.symptoms?.trim();
  if (fromSymptoms) {
    return fromSymptoms.length > limit ? `${fromSymptoms.slice(0, limit)}…` : fromSymptoms;
  }

  const fromSection = row.sectionSnippets.find((s) => s.length > 0);
  if (fromSection) {
    return fromSection.length > limit ? `${fromSection.slice(0, limit)}…` : fromSection;
  }

  if (row.sectionCount > 0) {
    return `${row.sectionCount} alt içerik kaydı mevcut.`;
  }

  return "Henüz özet eklenmedi.";
}

export function countListFilledSections(row: HealingGuideListRow): number {
  if (row.sectionCount > 0) return row.sectionCount;
  return 0;
}

export function matchesListSearch(row: HealingGuideListRow, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("tr-TR");
  if (!q) return true;

  const haystack = [
    row.name,
    row.category ?? "",
    row.symptoms ?? "",
    ...row.sectionSnippets,
  ]
    .join(" ")
    .toLocaleLowerCase("tr-TR");

  return haystack.includes(q);
}

function mapListRow(row: RawGuideRow): HealingGuideListRow | null {
  const id = textValue(row.id);
  const name = textValue(row.name);
  const tenantId = textValue(row.tenant_id);
  if (!id || !name || !tenantId) return null;

  const rawSections = Array.isArray(row.healing_guide_sections)
    ? row.healing_guide_sections
    : [];

  const sections = rawSections
    .map((entry) => mapSectionRow(entry))
    .filter((entry): entry is HealingGuideSectionRow => Boolean(entry));

  const sectionTypes = [
    ...new Set(sections.map((section) => section.section_type)),
  ] as HealingGuideSectionType[];

  return {
    id,
    tenant_id: tenantId,
    name,
    category: textValue(row.category) || null,
    symptoms: textValue(row.symptoms) || null,
    created_at: textValue(row.created_at) || new Date().toISOString(),
    updated_at: textValue(row.updated_at) || null,
    sectionCount: sections.length,
    sectionTypes,
    sectionSnippets: sections.map(sectionSnippet).filter(Boolean),
  };
}

const GUIDE_LIST_SELECT = `
  id,
  tenant_id,
  name,
  category,
  symptoms,
  created_at,
  updated_at,
  healing_guide_sections (
    id,
    guide_id,
    section_type,
    mode,
    title,
    note,
    source,
    images,
    created_at
  )
`;

const GUIDE_DETAIL_SELECT = `
  id,
  tenant_id,
  name,
  category,
  symptoms,
  created_at,
  updated_at,
  related_stones,
  related_reflexology,
  images,
  general_summary,
  medical_causes,
  subconscious_causes,
  temperament_causes,
  other_causes,
  iridology_match,
  hand_analysis_match,
  cupping_leech,
  reflexology,
  diet_recommendations,
  herbal_methods,
  stone_recommendations,
  aromatherapy,
  meditation,
  breathwork,
  bioenergy,
  massage,
  daily_routine,
  sleep_routine,
  supportive_alternative_methods,
  islamic_recommendations,
  healing_guide_sections (
    id,
    guide_id,
    section_type,
    mode,
    title,
    note,
    source,
    images,
    created_at
  )
`;

export async function fetchHealingGuideList(
  tenantId: string,
): Promise<{ rows: HealingGuideListRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("healing_guides")
    .select(GUIDE_LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows = ((data ?? []) as RawGuideRow[])
    .map((row) => mapListRow(row))
    .filter((row): row is HealingGuideListRow => Boolean(row));

  return { rows, error: null };
}

export async function fetchHealingGuideDetail(
  tenantId: string,
  guideId: string,
): Promise<{ detail: HealingGuideDetail | null; error: string | null; notFound: boolean }> {
  const { data, error } = await supabase
    .from("healing_guides")
    .select(GUIDE_DETAIL_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", guideId)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message, notFound: false };
  }

  if (!data) {
    return { detail: null, error: null, notFound: true };
  }

  const row = data as RawGuideRow;
  const rawSections = Array.isArray(row.healing_guide_sections)
    ? row.healing_guide_sections
    : [];

  const sections = rawSections
    .map((entry) => mapSectionRow(entry))
    .filter((entry): entry is HealingGuideSectionRow => Boolean(entry))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const detail: HealingGuideDetail = {
    guide: {
      id: textValue(row.id),
      tenant_id: textValue(row.tenant_id),
      name: textValue(row.name),
      category: textValue(row.category) || null,
      symptoms: textValue(row.symptoms) || null,
      created_at: textValue(row.created_at) || new Date().toISOString(),
      updated_at: textValue(row.updated_at) || null,
      related_stones: row.related_stones ?? null,
      related_reflexology: row.related_reflexology ?? null,
      legacy: legacyFieldsFromRow(row),
      images: normalizeImages(row.images),
    },
    sections,
  };

  return { detail, error: null, notFound: false };
}

export function groupSectionsByType(
  sections: HealingGuideSectionRow[],
): Record<HealingGuideSectionType, HealingGuideSectionRow[]> {
  const grouped: Record<HealingGuideSectionType, HealingGuideSectionRow[]> = {
    reasons: [],
    herbal: [],
    stones_details: [],
    islamic_suggestions: [],
    supportive: [],
  };

  for (const section of sections) {
    if (grouped[section.section_type]) {
      grouped[section.section_type].push(section);
    }
  }

  return grouped;
}

export function firstSectionTabWithContent(
  grouped: Record<HealingGuideSectionType, HealingGuideSectionRow[]>,
): HealingGuideSectionType {
  const found = HEALING_SECTION_DISPLAY.find((tab) => grouped[tab.type].length > 0);
  return found?.type ?? "reasons";
}
