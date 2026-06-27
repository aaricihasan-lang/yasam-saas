import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { HealingGuideSectionType } from "@/lib/admin/healingGuideJsonImport";

/**
 * healing_guides tablosuna tarayıcıdan doğrudan (anon/publishable) erişim
 * KALDIRILDI. Tüm okuma/yazma /api/sifa-rehberi/guides güvenli sunucu API'si
 * üzerinden gider (verifyUserRequest + service_role + tenant binding).
 *
 * fetchHealingGuideList/Detail imzalarındaki tenantId parametresi geriye-uyum
 * için korunur; gerçek tenant_id sunucuda session/user kaydından alınır.
 */
function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

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
    type: "applications",
    label: "Uygulamalar / Yöntemler",
    icon: "🙌",
    desc: "Hacamat, diyet, refleksoloji, bitkisel ve diğer yöntemler.",
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

/** Kullanıcıya gösterilecek mode / teknik başlık etiketleri */
const MODE_DISPLAY_LABELS: Record<string, string> = {
  herbal: "Bitkisel Yöntemler",
  bitkisel: "Bitkisel Yöntemler",
  herbal_methods: "Bitkisel Yöntemler",
  hacamat_suluk: "Hacamat & Sülük",
  hacamat: "Hacamat & Sülük",
  cupping_leech: "Hacamat & Sülük",
  refleksoloji: "Refleksoloji",
  reflexology: "Refleksoloji",
  diyet: "Diyet Önerileri",
  diet_recommendations: "Diyet Önerileri",
  aromaterapi: "Aromaterapi",
  aromatherapy: "Aromaterapi",
  supportive: "Destekleyici Uygulamalar",
  applications: "Uygulamalar / Yöntemler",
  reasons: "Nedenler / Sebepler",
  stones_details: "Doğaltaş Detayları",
  islamic_suggestions: "İslami Öneriler",
  bilincalti: "Bilinçaltı Sebepleri",
  mizac: "Mizaç Sebepleri",
  tibbi: "Tıbbi Nedenler",
  diger: "Diğer Sebepler",
  medical_causes: "Tıbbi Nedenler",
  subconscious_causes: "Bilinçaltı Sebepleri",
  temperament_causes: "Mizaç Sebepleri",
  other_causes: "Diğer Sebepler",
  iridology_match: "İridoloji Eşleşmesi",
  hand_analysis_match: "El Analizi Eşleşmesi",
  uygulama: "Uygulama",
  masaj: "Masaj",
  massage: "Masaj",
  nefes: "Nefes",
  breathwork: "Nefes",
  bioenerji: "Biyoenerji",
  bioenergy: "Biyoenerji",
  meditation: "Meditasyon",
  daily_routine: "Günlük Rutin",
  sleep_routine: "Uyku Düzeni",
  supportive_alternative_methods: "Destekleyici / Alternatif",
  stone_recommendations: "Doğaltaş Önerileri",
  islamic_recommendations: "İslami Öneriler",
  general_summary: "Genel Özet",
};

function normalizeModeKey(value: string | null | undefined): string {
  const raw = textValue(value);
  if (!raw) return "";
  return raw
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function isTechnicalStoredTitle(title: string, modeKey: string): boolean {
  const titleKey = normalizeModeKey(title);
  if (!titleKey) return false;
  if (modeKey && titleKey === modeKey) return true;
  if (!(titleKey in MODE_DISPLAY_LABELS)) return false;

  const upper = title.toLocaleUpperCase("tr-TR");
  if (title === upper) return true;
  if (title.replace(/\s+/g, "_").toLocaleUpperCase("tr-TR") === titleKey.toLocaleUpperCase("tr-TR")) {
    return true;
  }
  return false;
}

export function getHealingGuideSectionDisplayTitle(section: HealingGuideSectionRow): string {
  const modeKey = normalizeModeKey(section.mode);
  const storedTitle = textValue(section.title);
  const titleKey = normalizeModeKey(storedTitle);

  if (storedTitle && !isTechnicalStoredTitle(storedTitle, modeKey) && titleKey !== modeKey) {
    return storedTitle;
  }

  if (modeKey && MODE_DISPLAY_LABELS[modeKey]) {
    return MODE_DISPLAY_LABELS[modeKey];
  }

  if (titleKey && MODE_DISPLAY_LABELS[titleKey]) {
    return MODE_DISPLAY_LABELS[titleKey];
  }

  if (storedTitle && !isTechnicalStoredTitle(storedTitle, modeKey)) {
    return storedTitle;
  }

  const tab = HEALING_SECTION_DISPLAY.find((t) => t.type === section.section_type);
  return tab?.label ?? "İçerik";
}

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

/**
 * Liste — /api/sifa-rehberi/guides (GET). tenantId parametresi geriye-uyum için
 * korunur; sunucu gerçek tenant'ı session'dan zorlar.
 */
export async function fetchHealingGuideList(
  _tenantId: string,
): Promise<{ rows: HealingGuideListRow[]; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/sifa-rehberi/guides", { headers: authHeaders() });
  } catch {
    return { rows: [], error: "Sunucuya ulaşılamadı." };
  }

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    rows?: unknown;
    error?: string;
  };

  if (!res.ok || json.ok !== true) {
    return { rows: [], error: json.error ?? `Kayıtlar alınamadı (HTTP ${res.status}).` };
  }

  const rows = ((json.rows ?? []) as RawGuideRow[])
    .map((row) => mapListRow(row))
    .filter((row): row is HealingGuideListRow => Boolean(row));

  return { rows, error: null };
}

/**
 * Detay — /api/sifa-rehberi/guides/[id] (GET). tenantId parametresi geriye-uyum
 * için korunur; sunucu gerçek tenant'ı session'dan zorlar.
 */
export async function fetchHealingGuideDetail(
  _tenantId: string,
  guideId: string,
): Promise<{ detail: HealingGuideDetail | null; error: string | null; notFound: boolean }> {
  let res: Response;
  try {
    res = await fetch(`/api/sifa-rehberi/guides/${encodeURIComponent(guideId)}`, {
      headers: authHeaders(),
    });
  } catch {
    return { detail: null, error: "Sunucuya ulaşılamadı.", notFound: false };
  }

  if (res.status === 404) {
    return { detail: null, error: null, notFound: true };
  }

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    row?: unknown;
    notFound?: boolean;
    error?: string;
  };

  if (json.notFound === true) {
    return { detail: null, error: null, notFound: true };
  }

  if (!res.ok || json.ok !== true || !json.row) {
    return { detail: null, error: json.error ?? `Kayıt yüklenemedi (HTTP ${res.status}).`, notFound: false };
  }

  const row = json.row as RawGuideRow;
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

// ── Mutasyon yardımcıları — hepsi güvenli API üzerinden gider ────────────────────

/** Yeni healing_guides kaydı oluşturur → POST /api/sifa-rehberi/guides. */
export async function createHealingGuide(
  fields: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/sifa-rehberi/guides", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(fields),
    });
  } catch {
    return { id: null, error: "Sunucuya ulaşılamadı." };
  }
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    guide?: { id?: string } | null;
    error?: string;
  };
  if (!res.ok || json.ok !== true) {
    return { id: null, error: json.error ?? `Kayıt eklenemedi (HTTP ${res.status}).` };
  }
  return { id: json.guide?.id ?? null, error: null };
}

/** healing_guides kaydını günceller → PATCH /api/sifa-rehberi/guides/[id]. */
export async function updateHealingGuide(
  guideId: string,
  fields: Record<string, unknown>,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/sifa-rehberi/guides/${encodeURIComponent(guideId)}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(fields),
    });
  } catch {
    return { error: "Sunucuya ulaşılamadı." };
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || json.ok !== true) {
    return { error: json.error ?? `Kayıt güncellenemedi (HTTP ${res.status}).` };
  }
  return { error: null };
}

/** Tek healing_guides kaydını siler → DELETE /api/sifa-rehberi/guides/[id]. */
export async function deleteHealingGuide(
  guideId: string,
): Promise<{ error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/sifa-rehberi/guides/${encodeURIComponent(guideId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    return { error: "Sunucuya ulaşılamadı." };
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || json.ok !== true) {
    return { error: json.error ?? `Kayıt silinemedi (HTTP ${res.status}).` };
  }
  return { error: null };
}

/** Toplu healing_guides silme → DELETE /api/sifa-rehberi/guides (ids body). */
export async function deleteHealingGuides(
  ids: string[],
): Promise<{ deletedIds: string[]; error: string | null }> {
  let res: Response;
  try {
    res = await fetch("/api/sifa-rehberi/guides", {
      method: "DELETE",
      headers: authHeaders(),
      body: JSON.stringify({ ids }),
    });
  } catch {
    return { deletedIds: [], error: "Sunucuya ulaşılamadı." };
  }
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    deletedIds?: string[];
    error?: string;
  };
  if (!res.ok || json.ok !== true) {
    return { deletedIds: [], error: json.error ?? `Kayıtlar silinemedi (HTTP ${res.status}).` };
  }
  return { deletedIds: json.deletedIds ?? [], error: null };
}

export function groupSectionsByType(
  sections: HealingGuideSectionRow[],
): Record<HealingGuideSectionType, HealingGuideSectionRow[]> {
  const grouped: Record<HealingGuideSectionType, HealingGuideSectionRow[]> = {
    reasons: [],
    applications: [],
    herbal: [],
    stones_details: [],
    islamic_suggestions: [],
    supportive: [],
  };

  for (const section of sections) {
    if (section.section_type === "herbal" || section.section_type === "applications") {
      grouped.applications.push(section);
      continue;
    }
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
