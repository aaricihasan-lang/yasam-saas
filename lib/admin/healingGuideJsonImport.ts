import { supabase } from "@/lib/supabase";

export const HEALING_GUIDE_SECTION_TYPES = [
  "reasons",
  "herbal",
  "stones_details",
  "islamic_suggestions",
  "supportive",
] as const;

export type HealingGuideSectionType = (typeof HEALING_GUIDE_SECTION_TYPES)[number];

export type HealingGuideSectionInsert = {
  guide_id: string;
  section_type: HealingGuideSectionType;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  images: unknown[];
};

export type HealingGuideInsert = {
  tenant_id: string;
  name: string;
  category: string | null;
  symptoms: string | null;
  related_stones: unknown | null;
  related_reflexology: unknown | null;
};

export type HealingGuideImportDraft = {
  sourceKey: string;
  name: string;
  category: string | null;
  symptoms: string | null;
  related_stones: unknown | null;
  related_reflexology: unknown | null;
  sections: Omit<HealingGuideSectionInsert, "guide_id">[];
};

export type HealingGuideImportStats = {
  totalDiseases: number;
  totalSections: number;
  importableGuides: number;
  duplicateInFile: number;
  sectionTypeCounts: Record<HealingGuideSectionType, number>;
};

export type HealingGuidePreviewRow = {
  name: string;
  category: string | null;
  sectionCount: number;
  sectionTypes: string[];
};

export type HealingGuideImportPlan = {
  drafts: HealingGuideImportDraft[];
  stats: HealingGuideImportStats;
  preview: HealingGuidePreviewRow[];
};

export type HealingGuideImportFailure = {
  name: string;
  message: string;
};

export type HealingGuideImportReport = {
  successCount: number;
  failedCount: number;
  duplicateSkipped: number;
  totalProcessed: number;
  failures: HealingGuideImportFailure[];
};

export type HealingGuideImportProgress = {
  processed: number;
  total: number;
  phase: string;
};

const PARSE_CHUNK_SIZE = 40;
const GUIDE_INSERT_BATCH = 6;
const SECTION_INSERT_BATCH = 120;
const FAILED_PREVIEW_LIMIT = 25;
const PREVIEW_LIMIT = 5;

const LEGACY_REASON_FIELDS = [
  "medical_causes",
  "subconscious_causes",
  "temperament_causes",
  "other_causes",
  "iridology_match",
  "hand_analysis_match",
] as const;

const LEGACY_HERBAL_FIELDS = [
  "herbal_methods",
  "cupping_leech",
  "reflexology",
  "diet_recommendations",
] as const;

const LEGACY_SUPPORTIVE_FIELDS = [
  "aromatherapy",
  "meditation",
  "breathwork",
  "bioenergy",
  "massage",
  "daily_routine",
  "sleep_routine",
  "supportive_alternative_methods",
] as const;

const SUPPORTIVE_SUBKEY_LABELS: Record<string, string> = {
  aromatherapy: "Aromaterapi",
  meditation: "Meditasyon",
  breathwork: "Nefes",
  bioenergy: "Biyoenerji",
  massage: "Masaj",
  daily_routine: "Günlük Rutin",
  sleep_routine: "Uyku Düzeni",
  supportive_alternative_methods: "Destekleyici / Alternatif",
  diet_recommendations: "Diyet",
  cupping_leech: "Hacamat & Sülük",
};

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export function normalizeHealingGuideKey(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function symptomsText(value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value.map((entry) => textValue(entry)).filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : null;
  }
  const text = textValue(value);
  return text || null;
}

function jsonValueOrNull(value: unknown): unknown | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    return null;
  }
  return value;
}

function normalizeImages(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return [value];
  return [];
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toLocaleUpperCase("tr-TR"));
}

function sectionFromParts(
  sectionType: HealingGuideSectionType,
  parts: {
    mode?: string | null;
    title?: string | null;
    note?: string | null;
    source?: string | null;
    images?: unknown;
  },
): Omit<HealingGuideSectionInsert, "guide_id"> | null {
  const note = textValue(parts.note);
  const title = textValue(parts.title);
  const mode = textValue(parts.mode);
  const source = textValue(parts.source);
  const images = normalizeImages(parts.images);

  if (!note && !title && images.length === 0) return null;

  return {
    section_type: sectionType,
    mode: mode || null,
    title: title || null,
    note: note || null,
    source: source || null,
    images,
  };
}

function parseSectionEntry(
  entry: unknown,
  sectionType: HealingGuideSectionType,
  fallbackMode?: string | null,
): Omit<HealingGuideSectionInsert, "guide_id"> | null {
  if (typeof entry === "string") {
    return sectionFromParts(sectionType, { note: entry, mode: fallbackMode });
  }

  if (!entry || typeof entry !== "object") return null;

  const row = entry as Record<string, unknown>;
  return sectionFromParts(sectionType, {
    mode: textValue(row.mode) || fallbackMode || null,
    title: textValue(row.title) || textValue(row.baslik) || null,
    note:
      textValue(row.note) ||
      textValue(row.text) ||
      textValue(row.content) ||
      textValue(row.aciklama) ||
      textValue(row.description) ||
      null,
    source: textValue(row.source) || textValue(row.kaynak) || null,
    images: row.images ?? row.gorseller,
  });
}

function normalizeSectionBlock(
  value: unknown,
  sectionType: HealingGuideSectionType,
): Omit<HealingGuideSectionInsert, "guide_id">[] {
  if (value == null) return [];

  if (typeof value === "string") {
    const single = sectionFromParts(sectionType, { note: value });
    return single ? [single] : [];
  }

  if (Array.isArray(value)) {
    const sections: Omit<HealingGuideSectionInsert, "guide_id">[] = [];
    for (const entry of value) {
      const parsed = parseSectionEntry(entry, sectionType);
      if (parsed) sections.push(parsed);
    }
    return sections;
  }

  if (typeof value === "object") {
    if (sectionType === "supportive") {
      const sections: Omit<HealingGuideSectionInsert, "guide_id">[] = [];
      for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
        const mode = key;
        const label = SUPPORTIVE_SUBKEY_LABELS[key] ?? humanizeKey(key);

        if (typeof sub === "string") {
          const parsed = sectionFromParts("supportive", {
            mode,
            title: label,
            note: sub,
          });
          if (parsed) sections.push(parsed);
          continue;
        }

        if (Array.isArray(sub)) {
          for (const entry of sub) {
            const parsed =
              parseSectionEntry(entry, "supportive", mode) ??
              sectionFromParts("supportive", { mode, title: label, note: textValue(entry) });
            if (parsed) sections.push(parsed);
          }
          continue;
        }

        if (sub && typeof sub === "object") {
          const parsed =
            parseSectionEntry(sub, "supportive", textValue((sub as Record<string, unknown>).mode) || mode) ??
            sectionFromParts("supportive", {
              mode,
              title: textValue((sub as Record<string, unknown>).title) || label,
              note: textValue((sub as Record<string, unknown>).note),
            });
          if (parsed) sections.push(parsed);
        }
      }
      return sections;
    }

    const single = parseSectionEntry(value, sectionType);
    return single ? [single] : [];
  }

  return [];
}

function legacyStringSections(
  item: Record<string, unknown>,
  fields: readonly string[],
  sectionType: HealingGuideSectionType,
): Omit<HealingGuideSectionInsert, "guide_id">[] {
  const sections: Omit<HealingGuideSectionInsert, "guide_id">[] = [];
  for (const field of fields) {
    const text = textValue(item[field]);
    if (!text) continue;
    const parsed = sectionFromParts(sectionType, {
      mode: humanizeKey(field),
      title: SUPPORTIVE_SUBKEY_LABELS[field] ?? humanizeKey(field),
      note: text,
    });
    if (parsed) sections.push(parsed);
  }
  return sections;
}

function dedupeSections(
  sections: Omit<HealingGuideSectionInsert, "guide_id">[],
): Omit<HealingGuideSectionInsert, "guide_id">[] {
  const seen = new Set<string>();
  const result: Omit<HealingGuideSectionInsert, "guide_id">[] = [];

  for (const section of sections) {
    const key = [
      section.section_type,
      normalizeHealingGuideKey(section.mode ?? ""),
      normalizeHealingGuideKey(section.title ?? ""),
      normalizeHealingGuideKey(section.note ?? ""),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(section);
  }

  return result;
}

export function mapHealingGuideJsonItem(item: Record<string, unknown>): HealingGuideImportDraft | null {
  const name =
    textValue(item.name) ||
    textValue(item.hastalik) ||
    textValue(item.rahatsizlik) ||
    textValue(item.title) ||
    textValue(item.baslik);
  if (!name) return null;

  const sourceKey =
    textValue(item.id) ||
    textValue(item.uid) ||
    textValue(item.source_id) ||
    normalizeHealingGuideKey(name);

  const sections: Omit<HealingGuideSectionInsert, "guide_id">[] = [];

  for (const sectionType of HEALING_GUIDE_SECTION_TYPES) {
    sections.push(...normalizeSectionBlock(item[sectionType], sectionType));
  }

  sections.push(...legacyStringSections(item, LEGACY_REASON_FIELDS, "reasons"));
  sections.push(...legacyStringSections(item, LEGACY_HERBAL_FIELDS, "herbal"));

  const stoneText = textValue(item.stone_recommendations);
  if (stoneText) {
    const parsed = sectionFromParts("stones_details", {
      title: "Doğaltaş Önerileri",
      note: stoneText,
    });
    if (parsed) sections.push(parsed);
  }

  const islamicText = textValue(item.islamic_recommendations);
  if (islamicText) {
    const parsed = sectionFromParts("islamic_suggestions", {
      title: "İslami Öneriler",
      note: islamicText,
    });
    if (parsed) sections.push(parsed);
  }

  sections.push(...legacyStringSections(item, LEGACY_SUPPORTIVE_FIELDS, "supportive"));

  const generalSummary = textValue(item.general_summary);
  if (generalSummary) {
    const parsed = sectionFromParts("reasons", { title: "Genel Özet", note: generalSummary });
    if (parsed) sections.push(parsed);
  }

  return {
    sourceKey,
    name,
    category: textValue(item.category) || textValue(item.kategori) || null,
    symptoms:
      symptomsText(item.symptoms) ??
      symptomsText(item.belirtiler) ??
      symptomsText(item.sikayetler) ??
      null,
    related_stones: jsonValueOrNull(item.related_stones),
    related_reflexology: jsonValueOrNull(item.related_reflexology),
    sections: dedupeSections(sections),
  };
}

export function extractHealingGuideJsonRecords(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  if (parsed && typeof parsed === "object") {
    const root = parsed as Record<string, unknown>;
    const candidates = [
      root.items,
      root.data,
      root.records,
      root.guides,
      root.hastaliklar,
      root.diseases,
      root.sifa_rehberi,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (item) => item && typeof item === "object",
        ) as Record<string, unknown>[];
      }
    }
  }

  return [];
}

export function computeHealingGuideImportStats(
  drafts: HealingGuideImportDraft[],
): HealingGuideImportStats {
  const sectionTypeCounts: Record<HealingGuideSectionType, number> = {
    reasons: 0,
    herbal: 0,
    stones_details: 0,
    islamic_suggestions: 0,
    supportive: 0,
  };

  let totalSections = 0;
  for (const draft of drafts) {
    totalSections += draft.sections.length;
    for (const section of draft.sections) {
      sectionTypeCounts[section.section_type] += 1;
    }
  }

  return {
    totalDiseases: drafts.length,
    totalSections,
    importableGuides: drafts.length,
    duplicateInFile: 0,
    sectionTypeCounts,
  };
}

export async function buildHealingGuideImportPlan(
  jsonText: string,
): Promise<{ plan: HealingGuideImportPlan | null; error: string | null }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { plan: null, error: "Geçersiz JSON dosyası." };
  }

  const records = extractHealingGuideJsonRecords(parsed);
  if (records.length === 0) {
    return { plan: null, error: "JSON içinde şifa rehberi kaydı bulunamadı." };
  }

  const drafts: HealingGuideImportDraft[] = [];
  const seenKeys = new Set<string>();
  let duplicateInFile = 0;

  for (let offset = 0; offset < records.length; offset += PARSE_CHUNK_SIZE) {
    const slice = records.slice(offset, offset + PARSE_CHUNK_SIZE);
    for (const record of slice) {
      const draft = mapHealingGuideJsonItem(record);
      if (!draft) continue;

      const dedupeKey = normalizeHealingGuideKey(draft.name);
      if (seenKeys.has(dedupeKey)) {
        duplicateInFile += 1;
        continue;
      }
      seenKeys.add(dedupeKey);
      drafts.push(draft);
    }
    if (offset + PARSE_CHUNK_SIZE < records.length) {
      await yieldToMain();
    }
  }

  if (drafts.length === 0) {
    return {
      plan: null,
      error: "Aktarılabilir hastalık kaydı bulunamadı (name alanı zorunlu).",
    };
  }

  const stats = computeHealingGuideImportStats(drafts);
  stats.duplicateInFile = duplicateInFile;
  stats.importableGuides = drafts.length;

  const preview: HealingGuidePreviewRow[] = drafts.slice(0, PREVIEW_LIMIT).map((draft) => ({
    name: draft.name,
    category: draft.category,
    sectionCount: draft.sections.length,
    sectionTypes: [...new Set(draft.sections.map((section) => section.section_type))],
  }));

  return {
    plan: { drafts, stats, preview },
    error: null,
  };
}

export async function fetchExistingHealingGuideNameKeys(tenantId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const pageSize = 500;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("healing_guides")
      .select("name")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) break;

    const rows = data ?? [];
    for (const row of rows) {
      const name = textValue((row as { name?: unknown }).name);
      if (name) keys.add(normalizeHealingGuideKey(name));
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return keys;
}

function guideInsertRow(
  draft: HealingGuideImportDraft,
  tenantId: string,
  updatedAt: string,
): HealingGuideInsert & { updated_at: string } {
  return {
    tenant_id: tenantId,
    name: draft.name,
    category: draft.category,
    symptoms: draft.symptoms,
    related_stones: draft.related_stones,
    related_reflexology: draft.related_reflexology,
    updated_at: updatedAt,
  };
}

export async function importHealingGuideDrafts(
  drafts: HealingGuideImportDraft[],
  tenantId: string,
  existingNameKeys: Set<string>,
  onProgress?: (progress: HealingGuideImportProgress) => void,
): Promise<HealingGuideImportReport> {
  const importable = drafts.filter((draft) => !existingNameKeys.has(normalizeHealingGuideKey(draft.name)));
  const duplicateSkipped = drafts.length - importable.length;

  let successCount = 0;
  let failedCount = 0;
  const failures: HealingGuideImportFailure[] = [];
  const total = importable.length;

  const reportFailure = (name: string, message: string) => {
    failedCount += 1;
    if (failures.length < FAILED_PREVIEW_LIMIT) {
      failures.push({ name, message });
    }
  };

  onProgress?.({ processed: 0, total, phase: "Hazırlanıyor…" });

  for (let offset = 0; offset < importable.length; offset += GUIDE_INSERT_BATCH) {
    const batch = importable.slice(offset, offset + GUIDE_INSERT_BATCH);
    const now = new Date().toISOString();
    const guidePayload = batch.map((draft) => guideInsertRow(draft, tenantId, now));

    onProgress?.({
      processed: offset,
      total,
      phase: `Hastalık kayıtları (${offset + 1}-${Math.min(offset + batch.length, total)})`,
    });

    const { data: insertedGuides, error: guideError } = await supabase
      .from("healing_guides")
      .insert(guidePayload)
      .select("id, name");

    if (guideError || !insertedGuides?.length) {
      for (const draft of batch) {
        const { data: singleGuide, error: singleGuideError } = await supabase
          .from("healing_guides")
          .insert(guideInsertRow(draft, tenantId, now))
          .select("id, name")
          .maybeSingle();

        if (singleGuideError || !singleGuide?.id) {
          reportFailure(draft.name, singleGuideError?.message ?? guideError?.message ?? "Kayıt eklenemedi.");
          continue;
        }

        const sectionRows: HealingGuideSectionInsert[] = draft.sections.map((section) => ({
          guide_id: singleGuide.id,
          ...section,
        }));

        if (sectionRows.length === 0) {
          successCount += 1;
          existingNameKeys.add(normalizeHealingGuideKey(draft.name));
          continue;
        }

        const { error: sectionError } = await supabase
          .from("healing_guide_sections")
          .insert(sectionRows);

        if (sectionError) {
          reportFailure(draft.name, sectionError.message);
        } else {
          successCount += 1;
          existingNameKeys.add(normalizeHealingGuideKey(draft.name));
        }
      }

      await yieldToMain();
      continue;
    }

    for (let index = 0; index < batch.length; index += 1) {
      const draft = batch[index]!;
      const guideRow = insertedGuides[index];
      if (!guideRow?.id) {
        reportFailure(draft.name, "Hastalık kaydı oluşturuldu ancak id alınamadı.");
        continue;
      }

      const sectionRows: HealingGuideSectionInsert[] = draft.sections.map((section) => ({
        guide_id: guideRow.id,
        ...section,
      }));

      if (sectionRows.length === 0) {
        successCount += 1;
        existingNameKeys.add(normalizeHealingGuideKey(draft.name));
        continue;
      }

      let sectionsOk = true;
      for (let s = 0; s < sectionRows.length; s += SECTION_INSERT_BATCH) {
        const sectionBatch = sectionRows.slice(s, s + SECTION_INSERT_BATCH);
        const { error: sectionError } = await supabase
          .from("healing_guide_sections")
          .insert(sectionBatch);
        if (sectionError) {
          sectionsOk = false;
          reportFailure(draft.name, sectionError.message);
          break;
        }
      }

      if (sectionsOk) {
        successCount += 1;
        existingNameKeys.add(normalizeHealingGuideKey(draft.name));
      }
    }

    onProgress?.({
      processed: Math.min(offset + batch.length, total),
      total,
      phase: "Alt içerikler yazılıyor…",
    });

    await yieldToMain();
  }

  onProgress?.({ processed: total, total, phase: "Tamamlandı" });

  return {
    successCount,
    failedCount,
    duplicateSkipped,
    totalProcessed: successCount + failedCount,
    failures,
  };
}

export const HEALING_GUIDE_PREVIEW_LIMIT = PREVIEW_LIMIT;
export const HEALING_GUIDE_FAILED_PREVIEW_LIMIT = FAILED_PREVIEW_LIMIT;
