"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Dna,
  FileJson,
  FlaskConical,
  Footprints,
  Gem,
  Loader2,
  Package,
  Moon,
  Orbit,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  AdminSourceTenantDebug,
  AdminSourceTenantProvider,
  useAdminSourceTenant,
} from "@/components/admin/AdminSourceTenantContext";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";
import { useToast } from "@/components/ui/ToastProvider";
import { ADMIN_SOURCE_TENANT_MISSING_MESSAGE } from "@/lib/admin/adminSourceTenant";
import {
  DOGALTAS_INVENTORY_SUPABASE_TABLE,
  DOGALTAS_WEB_STOCK_STORAGE_KEY,
  importInventoryJsonToWebStock,
  parseInventoryJsonPayload,
  type InventoryJsonRow,
} from "@/lib/urun-stok/inventoryJsonImport";
import { supabase } from "@/lib/supabase";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { HealingGuideJsonTab } from "./HealingGuideJsonTab";

type StoneJsonRecord = Record<string, unknown>;

type FieldMappingRow = {
  jsonField: string;
  webField: string;
  sample: (record: StoneJsonRecord) => string;
  hasValue: (record: StoneJsonRecord) => boolean;
};

type CompatibilityStats = {
  total: number;
  withName: number;
  withPhysical: number;
  withoutPhysical: number;
  withSpiritual: number;
  withoutSpiritual: number;
  withGeneral: number;
  withWarning: number;
  withChakras: number;
  withImagePaths: number;
};

type MigrationRiskLevel = "low" | "medium" | "high";

type MigrationRiskReport = {
  level: MigrationRiskLevel;
  label: string;
  emoji: string;
  reasons: string[];
  windowsPathCount: number;
  recordsWithWindowsPaths: number;
  invalidExtensionCount: number;
  recordsWithInvalidExtension: number;
  unknownAssignmentFields: string[];
  recordsWithoutRealUrl: number;
  lowWarningRatio: boolean;
};

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
]);

const WARNING_RATIO_THRESHOLD = 0.2;
const BATCH_SIZE = 25;
const EFFECT_WARNING_PREVIEW_LIMIT = 10;

type ImportFailedRow = {
  index: number;
  stoneName: string;
  message: string;
};

type ImportRow = {
  payload: StoneInsertPayload;
  stoneName: string;
};

const IGNORE_TOP_LEVEL_KEYS = new Set([
  "id",
  "_id",
  "uuid",
  "tenant_id",
  "created_at",
  "updated_at",
  "slug",
  "version",
  "meta",
]);

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "name",
  "stone_name",
  "effects",
  "assignments",
  "image_paths",
  "physical_effects",
  "spiritual_effects",
  "physical",
  "spiritual",
  "bedensel_etkiler",
  "bedensel",
  "ruhsal_etkiler",
  "ruhsal",
]);

const KNOWN_EFFECT_KEYS = new Set([
  "general",
  "physical",
  "spiritual",
  "bedensel",
  "ruhsal",
  "other",
  "warnings",
  "feng_shui",
  "meditasyon",
  "bakim",
  "uygulama",
]);

const KNOWN_ASSIGNMENT_KEYS = new Set([
  "chakras",
  "organs_text",
  "astrology",
  "minerals",
  "elements",
]);

const FIELD_MAPPINGS: FieldMappingRow[] = [
  {
    jsonField: "name veya stone_name",
    webField: "stone_name",
    sample: (r) => truncate(String(r.stone_name ?? r.name ?? "—")),
    hasValue: hasStoneName,
  },
  {
    jsonField: "effects.general[].note",
    webField: "general_info",
    sample: (r) => truncate(joinEffectNotes(r, "general")),
    hasValue: (r) => effectHasNotes(r, "general"),
  },
  {
    jsonField: "physical / bedensel / physical_effects",
    webField: "physical_effects",
    sample: (r) => truncate(formatResolvedEffectText(extractPhysicalEffectsText(r))),
    hasValue: hasPhysicalEffects,
  },
  {
    jsonField: "spiritual / ruhsal / spiritual_effects",
    webField: "spiritual_effects",
    sample: (r) => truncate(formatResolvedEffectText(extractSpiritualEffectsText(r))),
    hasValue: hasSpiritualEffects,
  },
  {
    jsonField: "effects.other[].note",
    webField: "other_effects",
    sample: (r) => truncate(joinEffectNotes(r, "other")),
    hasValue: (r) => effectHasNotes(r, "other"),
  },
  {
    jsonField: "effects.warnings[].note",
    webField: "warning_text",
    sample: (r) => truncate(joinEffectNotes(r, "warnings")),
    hasValue: (r) => effectHasNotes(r, "warnings"),
  },
  {
    jsonField: "effects.feng_shui[].note",
    webField: "feng_shui",
    sample: (r) => truncate(joinEffectNotes(r, "feng_shui")),
    hasValue: (r) => effectHasNotes(r, "feng_shui"),
  },
  {
    jsonField: "effects.meditasyon[].note",
    webField: "meditation",
    sample: (r) => truncate(joinEffectNotes(r, "meditasyon")),
    hasValue: (r) => effectHasNotes(r, "meditasyon"),
  },
  {
    jsonField: "effects.bakim[].note",
    webField: "care",
    sample: (r) => truncate(joinEffectNotes(r, "bakim")),
    hasValue: (r) => effectHasNotes(r, "bakim"),
  },
  {
    jsonField: "effects.uygulama[].note",
    webField: "application",
    sample: (r) => truncate(joinEffectNotes(r, "uygulama")),
    hasValue: (r) => effectHasNotes(r, "uygulama"),
  },
  {
    jsonField: "assignments.chakras",
    webField: "chakras",
    sample: (r) => truncate(formatAssignmentValue(r, "chakras")),
    hasValue: (r) => assignmentHasValue(r, "chakras"),
  },
  {
    jsonField: "assignments.organs_text",
    webField: "assignments.organs_text",
    sample: (r) => truncate(formatAssignmentValue(r, "organs_text")),
    hasValue: (r) => assignmentHasValue(r, "organs_text"),
  },
  {
    jsonField: "assignments.astrology",
    webField: "assignments.astrology",
    sample: (r) => truncate(formatAssignmentValue(r, "astrology")),
    hasValue: (r) => assignmentHasValue(r, "astrology"),
  },
  {
    jsonField: "assignments.minerals",
    webField: "assignments.minerals",
    sample: (r) => truncate(formatAssignmentValue(r, "minerals")),
    hasValue: (r) => assignmentHasValue(r, "minerals"),
  },
  {
    jsonField: "assignments.elements",
    webField: "assignments.elements",
    sample: (r) => truncate(formatAssignmentValue(r, "elements")),
    hasValue: (r) => assignmentHasValue(r, "elements"),
  },
  {
    jsonField: "image_paths",
    webField: "images",
    sample: (r) => truncate(formatImagePaths(r)),
    hasValue: hasImagePaths,
  },
];

function truncate(value: string, max = 72): string {
  if (!value || value === "—") return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function joinEffectNotes(record: StoneJsonRecord, effectKey: string): string {
  const effects = record.effects;
  if (!effects || typeof effects !== "object") return "—";
  const block = (effects as Record<string, unknown>)[effectKey];
  if (!Array.isArray(block)) return "—";
  const notes = block
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const note = (item as { note?: unknown }).note;
      return note != null ? String(note).trim() : "";
    })
    .filter(Boolean);
  return notes.length > 0 ? notes.join(" · ") : "—";
}

function effectHasNotes(record: StoneJsonRecord, effectKey: string): boolean {
  return joinEffectNotes(record, effectKey) !== "—";
}

function effectNotesToText(record: StoneJsonRecord, effectKey: string): string | null {
  const text = joinEffectNotes(record, effectKey);
  return text === "—" ? null : text;
}

function normalizeEffectText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function extractEffectBlockNotes(block: unknown): string {
  const asString = normalizeEffectText(block);
  if (asString) return asString;
  if (!Array.isArray(block)) return "";

  const notes = block
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const note = (item as { note?: unknown }).note;
        return note != null ? String(note).trim() : "";
      }
      return "";
    })
    .filter(Boolean);

  return notes.length > 0 ? notes.join(" · ") : "";
}

function pickFirstNonEmptyText(...candidates: string[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function getEffectsObject(record: StoneJsonRecord): Record<string, unknown> | null {
  const effects = record.effects;
  if (!effects || typeof effects !== "object") return null;
  return effects as Record<string, unknown>;
}

function extractPhysicalEffectsText(record: StoneJsonRecord): string {
  const effects = getEffectsObject(record);
  return pickFirstNonEmptyText(
    extractEffectBlockNotes(effects?.physical),
    extractEffectBlockNotes(effects?.bedensel),
    normalizeEffectText(record.physical_effects),
    normalizeEffectText(record.physical),
    normalizeEffectText(record.bedensel_etkiler),
    normalizeEffectText(record.bedensel),
  );
}

function extractSpiritualEffectsText(record: StoneJsonRecord): string {
  const effects = getEffectsObject(record);
  return pickFirstNonEmptyText(
    extractEffectBlockNotes(effects?.spiritual),
    extractEffectBlockNotes(effects?.ruhsal),
    normalizeEffectText(record.spiritual_effects),
    normalizeEffectText(record.spiritual),
    normalizeEffectText(record.ruhsal_etkiler),
    normalizeEffectText(record.ruhsal),
  );
}

function formatResolvedEffectText(text: string): string {
  return text.trim() ? text : "—";
}

function hasPhysicalEffects(record: StoneJsonRecord): boolean {
  return extractPhysicalEffectsText(record).length > 0;
}

function hasSpiritualEffects(record: StoneJsonRecord): boolean {
  return extractSpiritualEffectsText(record).length > 0;
}

function physicalEffectsToText(record: StoneJsonRecord): string | null {
  const text = extractPhysicalEffectsText(record);
  return text || null;
}

function spiritualEffectsToText(record: StoneJsonRecord): string | null {
  const text = extractSpiritualEffectsText(record);
  return text || null;
}

function getStoneDisplayName(record: StoneJsonRecord): string {
  return String(record.stone_name ?? record.name ?? "İsimsiz kayıt").trim();
}

type StoneInsertPayload = {
  tenant_id: string;
  stone_name: string;
  short_description: string | null;
  source_note: string | null;
  general_info: string | null;
  physical_effects: string | null;
  spiritual_effects: string | null;
  other_effects: string | null;
  warning_text: string | null;
  feng_shui: string | null;
  meditation: string | null;
  care: string | null;
  application: string | null;
  chakras: string[] | null;
  assignments: Record<string, unknown> | null;
  images: { id: string; name: string; url: string }[];
  warning_tags: string[] | null;
  updated_at: string;
  image_upload_failed?: boolean;
};

function mapJsonChakras(record: StoneJsonRecord): string[] | null {
  const assignments = getAssignments(record);
  if (!assignments) return null;
  const ch = assignments.chakras;
  if (Array.isArray(ch)) {
    const list = ch.map((item) => String(item).trim()).filter(Boolean);
    return list.length > 0 ? list : null;
  }
  if (typeof ch === "string" && ch.trim()) return [ch.trim()];
  return null;
}

function mapJsonAssignments(record: StoneJsonRecord): Record<string, unknown> | null {
  const assignments = getAssignments(record);
  if (!assignments || Object.keys(assignments).length === 0) return null;
  return { ...assignments };
}

function mapJsonImages(
  record: StoneJsonRecord,
  recordIndex: number,
): StoneInsertPayload["images"] {
  const paths = getImagePathList(record);
  return paths.map((path, imageIndex) => {
    const name = path.split(/[/\\]/).pop() ?? `gorsel-${imageIndex + 1}`;
    const url = isRealUrl(path) ? path : "";
    const base = {
      id: `json-import-${recordIndex}-${imageIndex}`,
      name,
      url,
    };
    return isRealUrl(path) ? base : { ...base, file_path: path };
  });
}

function buildStonePayloadWithImages(
  record: StoneJsonRecord,
  tenantId: string,
  recordIndex: number,
): StoneInsertPayload | null {
  const base = mapJsonRecordToStonePayload(record, tenantId, recordIndex);
  if (!base) return null;

  const paths = getImagePathList(record);
  if (paths.length === 0) {
    return base;
  }

  const images: StoneInsertPayload["images"] = [];
  let hasLocalPaths = false;

  for (let imageIndex = 0; imageIndex < paths.length; imageIndex += 1) {
    const path = paths[imageIndex];
    if (isRealUrl(path)) {
      const name = path.split(/[/\\]/).pop() ?? `gorsel-${imageIndex + 1}`;
      images.push({ id: `json-import-${recordIndex}-${imageIndex}`, name, url: path.trim() });
    } else {
      hasLocalPaths = true;
    }
  }

  return {
    ...base,
    images,
    ...(hasLocalPaths ? { image_upload_failed: true } : {}),
  };
}

function mapJsonRecordToStonePayload(
  record: StoneJsonRecord,
  tenantId: string,
  recordIndex: number,
): StoneInsertPayload | null {
  const stoneName = String(record.stone_name ?? record.name ?? "").trim();
  if (!stoneName) return null;

  return {
    tenant_id: tenantId,
    stone_name: stoneName,
    short_description: null,
    source_note: null,
    general_info: effectNotesToText(record, "general"),
    physical_effects: physicalEffectsToText(record),
    spiritual_effects: spiritualEffectsToText(record),
    other_effects: effectNotesToText(record, "other"),
    warning_text: effectNotesToText(record, "warnings"),
    feng_shui: effectNotesToText(record, "feng_shui"),
    meditation: effectNotesToText(record, "meditasyon"),
    care: effectNotesToText(record, "bakim"),
    application: effectNotesToText(record, "uygulama"),
    chakras: mapJsonChakras(record),
    assignments: mapJsonAssignments(record),
    images: mapJsonImages(record, recordIndex),
    warning_tags: null,
    updated_at: new Date().toISOString(),
  };
}

function getAssignments(record: StoneJsonRecord): Record<string, unknown> | null {
  const assignments = record.assignments;
  if (!assignments || typeof assignments !== "object") return null;
  return assignments as Record<string, unknown>;
}

function formatAssignmentValue(record: StoneJsonRecord, key: string): string {
  const assignments = getAssignments(record);
  if (!assignments) return "—";
  const value = assignments[key];
  if (value == null) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(", ");
  }
  if (typeof value === "string") return value.trim() || "—";
  return JSON.stringify(value);
}

function assignmentHasValue(record: StoneJsonRecord, key: string): boolean {
  return formatAssignmentValue(record, key) !== "—";
}

function getImagePathList(record: StoneJsonRecord): string[] {
  const paths = record.image_paths;
  if (!Array.isArray(paths)) return [];
  return paths.map((p) => String(p).trim()).filter(Boolean);
}

function formatImagePaths(record: StoneJsonRecord): string {
  const paths = getImagePathList(record);
  if (paths.length === 0) return "—";
  return paths.join(", ");
}

function hasImagePaths(record: StoneJsonRecord): boolean {
  return getImagePathList(record).length > 0;
}

function isWindowsLocalPath(path: string): boolean {
  const trimmed = path.trim();
  return /^[CD]:[\\/]/i.test(trimmed);
}

function isRealUrl(path: string): boolean {
  try {
    const url = new URL(path.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getImageExtension(path: string): string | null {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? path;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : null;
}

function pathHasInvalidExtension(path: string): boolean {
  if (isRealUrl(path)) {
    const ext = getImageExtension(path);
    if (!ext) return false;
    return !ALLOWED_IMAGE_EXTENSIONS.has(ext);
  }
  const ext = getImageExtension(path);
  if (!ext) return true;
  return !ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

function recordImagePathsLackRealUrl(record: StoneJsonRecord): boolean {
  const paths = getImagePathList(record);
  if (paths.length === 0) return false;
  return paths.some((p) => !isRealUrl(p));
}

function collectUnknownAssignmentFields(records: StoneJsonRecord[]): string[] {
  const unknown = new Set<string>();
  for (const record of records) {
    const assignments = getAssignments(record);
    if (!assignments) continue;
    for (const key of Object.keys(assignments)) {
      if (!KNOWN_ASSIGNMENT_KEYS.has(key)) unknown.add(key);
    }
  }
  return Array.from(unknown).sort();
}

function hasStoneName(record: StoneJsonRecord): boolean {
  const name = record.stone_name ?? record.name;
  return typeof name === "string" && name.trim().length > 0;
}

function collectUnmappedPaths(record: StoneJsonRecord): string[] {
  const unmapped = new Set<string>();

  for (const key of Object.keys(record)) {
    if (IGNORE_TOP_LEVEL_KEYS.has(key)) continue;
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) unmapped.add(key);
  }

  const effects = record.effects;
  if (effects && typeof effects === "object") {
    for (const key of Object.keys(effects as Record<string, unknown>)) {
      if (!KNOWN_EFFECT_KEYS.has(key)) unmapped.add(`effects.${key}`);
    }
  }

  const assignments = getAssignments(record);
  if (assignments) {
    for (const key of Object.keys(assignments)) {
      if (!KNOWN_ASSIGNMENT_KEYS.has(key)) unmapped.add(`assignments.${key}`);
    }
  }

  return Array.from(unmapped).sort();
}

function parseStoneJsonPayload(
  text: string,
): { records: StoneJsonRecord[]; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { records: [], error: "Geçersiz JSON dosyası." };
  }

  if (Array.isArray(parsed)) {
    return {
      records: parsed.filter((item) => item && typeof item === "object") as StoneJsonRecord[],
      error: null,
    };
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.stones)) {
      return {
        records: obj.stones.filter((item) => item && typeof item === "object") as StoneJsonRecord[],
        error: null,
      };
    }
    if (Array.isArray(obj.data)) {
      return {
        records: obj.data.filter((item) => item && typeof item === "object") as StoneJsonRecord[],
        error: null,
      };
    }
  }

  return {
    records: [],
    error: "JSON kökü dizi olmalı veya stones / data dizisi içermeli.",
  };
}

function computeCompatibilityStats(records: StoneJsonRecord[]): CompatibilityStats {
  const total = records.length;
  const withPhysical = records.filter(hasPhysicalEffects).length;
  const withSpiritual = records.filter(hasSpiritualEffects).length;

  return {
    total,
    withName: records.filter(hasStoneName).length,
    withPhysical,
    withoutPhysical: total - withPhysical,
    withSpiritual,
    withoutSpiritual: total - withSpiritual,
    withGeneral: records.filter((r) => effectHasNotes(r, "general")).length,
    withWarning: records.filter((r) => effectHasNotes(r, "warnings")).length,
    withChakras: records.filter((r) => assignmentHasValue(r, "chakras")).length,
    withImagePaths: records.filter(hasImagePaths).length,
  };
}

function computeMigrationRisk(
  records: StoneJsonRecord[],
  stats: CompatibilityStats,
): MigrationRiskReport {
  const reasons: string[] = [];
  let score = 0;

  let windowsPathCount = 0;
  let recordsWithWindowsPaths = 0;
  let invalidExtensionCount = 0;
  let recordsWithInvalidExtension = 0;
  let recordsWithoutRealUrl = 0;

  for (const record of records) {
    const paths = getImagePathList(record);
    let hasWindows = false;
    let hasInvalidExt = false;

    for (const path of paths) {
      if (isWindowsLocalPath(path)) {
        windowsPathCount += 1;
        hasWindows = true;
      }
      if (pathHasInvalidExtension(path)) {
        invalidExtensionCount += 1;
        hasInvalidExt = true;
      }
    }

    if (hasWindows) recordsWithWindowsPaths += 1;
    if (hasInvalidExt) recordsWithInvalidExtension += 1;
    if (recordImagePathsLackRealUrl(record)) recordsWithoutRealUrl += 1;
  }

  const unknownAssignmentFields = collectUnknownAssignmentFields(records);
  const warningRatio = stats.total > 0 ? stats.withWarning / stats.total : 0;
  const lowWarningRatio = stats.total > 0 && warningRatio < WARNING_RATIO_THRESHOLD;

  if (windowsPathCount > 0) {
    score += windowsPathCount >= 5 || recordsWithWindowsPaths >= 3 ? 3 : 2;
    reasons.push(
      `${windowsPathCount} görsel yolu yerel Windows dizini (C:\\ veya D:\\) · ${recordsWithWindowsPaths} kayıt`,
    );
  }

  if (invalidExtensionCount > 0) {
    score += invalidExtensionCount >= 5 ? 3 : 2;
    reasons.push(
      `${invalidExtensionCount} görselde izin verilmeyen uzantı (yalnızca jpg, jpeg, png, webp) · ${recordsWithInvalidExtension} kayıt`,
    );
  }

  if (unknownAssignmentFields.length > 0) {
    score += 2;
    reasons.push(
      `assignments içinde web tarafında kullanılmayan alanlar: ${unknownAssignmentFields.join(", ")}`,
    );
  }

  if (recordsWithoutRealUrl > 0) {
    const ratio = recordsWithoutRealUrl / stats.total;
    score += ratio >= 0.5 ? 3 : ratio >= 0.2 ? 2 : 1;
    reasons.push(
      `${recordsWithoutRealUrl} kayıtta image_paths gerçek http(s) URL içermiyor`,
    );
  }

  if (lowWarningRatio) {
    score += 1;
    reasons.push(
      `Uyarı metni olan kayıt oranı düşük (${stats.withWarning}/${stats.total}, eşik %${WARNING_RATIO_THRESHOLD * 100})`,
    );
  }

  let level: MigrationRiskLevel = "low";
  let label = "Düşük";
  let emoji = "🟢";

  if (score >= 5) {
    level = "high";
    label = "Yüksek";
    emoji = "🔴";
  } else if (score >= 2) {
    level = "medium";
    label = "Orta";
    emoji = "🟡";
  }

  if (reasons.length === 0) {
    reasons.push("Göç öncesi kritik risk sinyali tespit edilmedi.");
  }

  return {
    level,
    label,
    emoji,
    reasons,
    windowsPathCount,
    recordsWithWindowsPaths,
    invalidExtensionCount,
    recordsWithInvalidExtension,
    unknownAssignmentFields,
    recordsWithoutRealUrl,
    lowWarningRatio,
  };
}

const migrationRiskStyles: Record<
  MigrationRiskLevel,
  { box: string; badge: string }
> = {
  low: {
    box: "border-emerald-300 bg-emerald-50/95",
    badge: "bg-emerald-100 text-emerald-950",
  },
  medium: {
    box: "border-amber-300 bg-amber-50/95",
    badge: "bg-amber-100 text-amber-950",
  },
  high: {
    box: "border-rose-300 bg-rose-50/95",
    badge: "bg-rose-100 text-rose-950",
  },
};

function MigrationRiskPanel({ report }: { report: MigrationRiskReport }) {
  const styles = migrationRiskStyles[report.level];

  return (
    <div className={`rounded-2xl border-2 p-5 shadow-sm ${styles.box}`}>
      <h3 className="text-lg font-black text-slate-900">Göç Risk Kontrolü</h3>
      <p className="mt-3 text-sm font-semibold text-slate-600">Göç Riski:</p>
      <p className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-900">
        <span aria-hidden>{report.emoji}</span>
        <span className={`rounded-xl px-3 py-1 text-lg ${styles.badge}`}>{report.label}</span>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <p className="rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
          Windows yolu: {report.windowsPathCount} yol · {report.recordsWithWindowsPaths} kayıt
        </p>
        <p className="rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
          Geçersiz uzantı: {report.invalidExtensionCount} yol ·{" "}
          {report.recordsWithInvalidExtension} kayıt
        </p>
        <p className="rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
          Gerçek URL olmayan kayıt: {report.recordsWithoutRealUrl}
        </p>
        <p className="rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-700">
          Bilinmeyen assignments alanı: {report.unknownAssignmentFields.length}
          {report.unknownAssignmentFields.length > 0
            ? ` (${report.unknownAssignmentFields.join(", ")})`
            : ""}
        </p>
      </div>

      <p className="mt-4 text-sm font-bold text-slate-800">Nedenler</p>
      <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm font-medium text-slate-700">
        {report.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function recordsHaveNonUrlImages(records: StoneJsonRecord[]): boolean {
  return records.some((record) => {
    const paths = getImagePathList(record);
    return paths.length > 0 && paths.some((path) => !isRealUrl(path));
  });
}

type CombinationJsonVariant = {
  source?: unknown;
  stones_text?: unknown;
  notes_text?: unknown;
  notes_text_2?: unknown;
  notes_text_3?: unknown;
};

type CombinationJsonIssue = {
  id?: unknown;
  issue?: unknown;
  description?: unknown;
  variants?: unknown;
};

type CombinationInsertRow = {
  tenant_id: string;
  source_id: string;
  issue: string;
  description: string | null;
  variant_index: number;
  source: string | null;
  stones_text: string | null;
  notes_text: string | null;
  notes_text_2: string | null;
  notes_text_3: string | null;
};

type CombinationImportFailure = {
  issue: string;
  message: string;
};

const KOMBINASYON_BATCH_SIZE = 250;
const KOMBINASYON_PREVIEW_ISSUE_LIMIT = 5;
const KOMBINASYON_FAILED_PREVIEW_LIMIT = 20;

function combinationText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function combinationNullableText(value: unknown): string | null {
  const text = combinationText(value);
  return text || null;
}

function parseCombinationJsonIssues(text: string): {
  issues: CombinationJsonIssue[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { issues: [], error: "Geçersiz JSON dosyası." };
  }

  if (!Array.isArray(parsed)) {
    return { issues: [], error: "JSON kökü bir dizi olmalıdır." };
  }

  const issues = parsed.filter((item) => item && typeof item === "object") as CombinationJsonIssue[];
  if (issues.length === 0) {
    return { issues: [], error: "JSON içinde işlenebilir kayıt bulunamadı." };
  }

  return { issues, error: null };
}

function flattenCombinationIssuesToRows(
  issues: CombinationJsonIssue[],
  tenantId: string,
): CombinationInsertRow[] {
  const rows: CombinationInsertRow[] = [];

  for (const item of issues) {
    const issueTitle = combinationText(item.issue);
    if (!issueTitle) continue;

    const sourceId = combinationText(item.id);
    if (!sourceId) continue;

    const description = combinationNullableText(item.description);
    const variants = Array.isArray(item.variants) ? item.variants : [];

    variants.forEach((variant, index) => {
      if (!variant || typeof variant !== "object") return;
      const v = variant as CombinationJsonVariant;

      rows.push({
        tenant_id: tenantId,
        source_id: sourceId,
        issue: issueTitle,
        description,
        variant_index: index + 1,
        source: combinationNullableText(v.source),
        stones_text: combinationNullableText(v.stones_text),
        notes_text: combinationNullableText(v.notes_text),
        notes_text_2: combinationNullableText(v.notes_text_2),
        notes_text_3: combinationNullableText(v.notes_text_3),
      });
    });
  }

  return rows;
}

function countCombinationVariants(issues: CombinationJsonIssue[]): number {
  return issues.reduce((total, item) => {
    const variants = Array.isArray(item.variants) ? item.variants : [];
    return total + variants.length;
  }, 0);
}

/** Güvenli admin import API'sine batch gönderir (publishable insert yerine service_role). */
async function insertCombinationsViaApi(
  rows: CombinationInsertRow[],
): Promise<{ ok: boolean; error?: string }> {
  const adminId = readYasamUser()?.id ?? "";
  const sessionToken = readSessionToken();
  try {
    const res = await fetch("/api/admin/dogaltas/combinations/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": adminId,
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ rows }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}

async function importCombinationRows(rows: CombinationInsertRow[]): Promise<{
  successCount: number;
  failedCount: number;
  failures: CombinationImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: CombinationImportFailure[] = [];

  for (let offset = 0; offset < rows.length; offset += KOMBINASYON_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + KOMBINASYON_BATCH_SIZE);
    const result = await insertCombinationsViaApi(batch);

    if (result.ok) {
      successCount += batch.length;
      continue;
    }

    // Batch başarısızsa tek tek dene (mevcut fallback davranışı korunur).
    for (const row of batch) {
      const single = await insertCombinationsViaApi([row]);
      if (!single.ok) {
        failedCount += 1;
        if (failures.length < KOMBINASYON_FAILED_PREVIEW_LIMIT) {
          failures.push({ issue: row.issue, message: single.error ?? "Kayıt eklenemedi." });
        }
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function KombinasyonJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [issues, setIssues] = useState<CombinationJsonIssue[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: CombinationImportFailure[];
  } | null>(null);

  const issueCount = issues.length;
  const variantCount = useMemo(() => countCombinationVariants(issues), [issues]);

  const previewIssues = useMemo(
    () => issues.slice(0, KOMBINASYON_PREVIEW_ISSUE_LIMIT),
    [issues],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setIssues([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { issues: parsed, error } = parseCombinationJsonIssues(text);
      if (error) {
        setParseError(error);
        setIssues([]);
        setFileName(file.name);
        return;
      }
      setIssues(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenCombinationIssuesToRows(issues, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak variant kaydı bulunamadı (id, issue ve variants zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } = await importCombinationRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} kombinasyon kaydı başarıyla yüklendi.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      showToast({
        type: "error",
        message: "Hiçbir kayıt yüklenemedi.",
      });
    }
  }, [issues, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-violet-200/80 bg-gradient-to-br from-violet-50/40 via-white to-fuchsia-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Kombinasyon JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Gem className="h-6 w-6 text-violet-700" aria-hidden />
            Kombinasyon JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Issue ve variants içeren JSON dosyasını seçin; özet görüntüleyip tüm kayıtları
            combinations tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut kombinasyon kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-violet-300 bg-white px-5 py-3 text-sm font-bold text-violet-950 shadow-md transition hover:scale-[1.02] hover:border-violet-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {issues.length > 0 ? (
            <button
              type="button"
              disabled={importing || variantCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-fuchsia-400 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-violet-900">{fileName}</span>
          {issues.length > 0 ? (
            <span className="ml-2 text-emerald-700">
              · {issueCount} issue · {variantCount} variant
            </span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {issues.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayılar.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam issue / sorun" value={issueCount} />
              <StatBox label="Toplam variants / kombinasyon" value={variantCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {KOMBINASYON_PREVIEW_ISSUE_LIMIT} issue kaydı (variants sayısı ile).
            </p>
            <div className="mt-4 space-y-3">
              {previewIssues.map((item, index) => {
                const issueTitle = combinationText(item.issue) || "—";
                const variants = Array.isArray(item.variants) ? item.variants : [];
                const firstVariant = variants[0] as CombinationJsonVariant | undefined;
                const previewLine = firstVariant
                  ? combinationText(firstVariant.stones_text) ||
                    combinationText(firstVariant.notes_text) ||
                    "—"
                  : "—";

                return (
                  <div
                    key={`${combinationText(item.id) || issueTitle}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{issueTitle}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {combinationNullableText(item.description) ?? "Açıklama yok"} ·{" "}
                      {variants.length} variant
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{previewLine}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-violet-200 bg-violet-50/90 p-5">
          <h3 className="text-lg font-black text-violet-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {KOMBINASYON_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.issue}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">{row.issue}</span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type MineralJsonItem = {
  id?: unknown;
  name?: unknown;
  aciklama?: unknown;
  organ_etkileri?: unknown;
  fiziksel?: unknown;
  zihinsel?: unknown;
  cakralar?: unknown;
  fizyoloji?: unknown;
  eksiklik_belirtileri?: unknown;
  fazlalik_belirtileri?: unknown;
  doz_asimi?: unknown;
  iceren_taslar?: unknown;
  kategori?: unknown;
};

type MineralInsertRow = {
  tenant_id: string;
  source_id: string;
  name: string;
  aciklama: string | null;
  organ_etkileri: string[];
  fiziksel: string[];
  zihinsel: string[];
  cakralar: string[];
  fizyoloji: string[];
  eksiklik_belirtileri: string[];
  fazlalik_belirtileri: string[];
  doz_asimi: string[];
  iceren_taslar: string[];
  kategori: string;
};

type MineralImportFailure = {
  name: string;
  message: string;
};

const MINERAL_BATCH_SIZE = 250;
const MINERAL_PREVIEW_LIMIT = 5;
const MINERAL_FAILED_PREVIEW_LIMIT = 20;

function mineralText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function mineralNullableText(value: unknown): string | null {
  const text = mineralText(value);
  return text || null;
}

function mineralStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => mineralText(item)).filter(Boolean);
}

function parseMineralJsonItems(text: string): {
  items: MineralJsonItem[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], error: "Geçersiz JSON dosyası." };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], error: "JSON kökü bir dizi olmalıdır." };
  }

  const items = parsed.filter((item) => item && typeof item === "object") as MineralJsonItem[];
  if (items.length === 0) {
    return { items: [], error: "JSON içinde işlenebilir mineral kaydı bulunamadı." };
  }

  return { items, error: null };
}

function mapMineralItemToInsertRow(
  item: MineralJsonItem,
  tenantId: string,
): MineralInsertRow | null {
  const sourceId = mineralText(item.id);
  const name = mineralText(item.name);
  if (!sourceId || !name) return null;

  return {
    tenant_id: tenantId,
    source_id: sourceId,
    name,
    aciklama: mineralNullableText(item.aciklama),
    organ_etkileri: mineralStringArray(item.organ_etkileri),
    fiziksel: mineralStringArray(item.fiziksel),
    zihinsel: mineralStringArray(item.zihinsel),
    cakralar: mineralStringArray(item.cakralar),
    fizyoloji: mineralStringArray(item.fizyoloji),
    eksiklik_belirtileri: mineralStringArray(item.eksiklik_belirtileri),
    fazlalik_belirtileri: mineralStringArray(item.fazlalik_belirtileri),
    doz_asimi: mineralStringArray(item.doz_asimi),
    iceren_taslar: mineralStringArray(item.iceren_taslar),
    kategori: mineralText(item.kategori) || "",
  };
}

function flattenMineralItemsToRows(
  items: MineralJsonItem[],
  tenantId: string,
): MineralInsertRow[] {
  const rows: MineralInsertRow[] = [];
  for (const item of items) {
    const row = mapMineralItemToInsertRow(item, tenantId);
    if (row) rows.push(row);
  }
  return rows;
}

function mineralInsertSucceeded(
  data: { id: string }[] | null,
  expectedCount: number,
): boolean {
  return Boolean(data && data.length === expectedCount);
}

async function importMineralRows(rows: MineralInsertRow[]): Promise<{
  successCount: number;
  failedCount: number;
  failures: MineralImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: MineralImportFailure[] = [];

  const recordFailure = (name: string, message: string) => {
    failedCount += 1;
    if (failures.length < MINERAL_FAILED_PREVIEW_LIMIT) {
      failures.push({ name, message });
    }
  };

  for (let offset = 0; offset < rows.length; offset += MINERAL_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + MINERAL_BATCH_SIZE);
    const { data, error } = await supabase.from("minerals").insert(batch).select("id");

    if (!error && mineralInsertSucceeded(data, batch.length)) {
      successCount += data!.length;
      continue;
    }

    const batchMessage =
      error?.message ??
      "Toplu ekleme tamamlanamadı (public.minerals tablosuna kayıt doğrulanamadı).";

    for (const row of batch) {
      const { data: rowData, error: singleError } = await supabase
        .from("minerals")
        .insert(row)
        .select("id");

      if (singleError || !mineralInsertSucceeded(rowData, 1)) {
        recordFailure(
          row.name,
          singleError?.message ??
            batchMessage,
        );
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function MineralJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<MineralJsonItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: MineralImportFailure[];
  } | null>(null);

  const mineralCount = items.length;
  const importableCount = useMemo(
    () => (tenantId ? flattenMineralItemsToRows(items, tenantId).length : 0),
    [items, tenantId],
  );

  const previewItems = useMemo(() => items.slice(0, MINERAL_PREVIEW_LIMIT), [items]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setItems([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { items: parsed, error } = parseMineralJsonItems(text);
      if (error) {
        setParseError(error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      setItems(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenMineralItemsToRows(items, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak mineral kaydı bulunamadı (id ve name zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } = await importMineralRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (successCount > 0 && failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} mineral kaydı public.minerals tablosuna yazıldı.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      const detail = failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt public.minerals tablosuna yazılamadı.",
      });
    }
  }, [items, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 via-white to-amber-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Mineral JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <FlaskConical className="h-6 w-6 text-emerald-700" aria-hidden />
            Mineral JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Mineral listesi JSON dosyasını seçin; özet görüntüleyip tüm kayıtları minerals
            tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut mineral kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-emerald-300 bg-white px-5 py-3 text-sm font-bold text-emerald-950 shadow-md transition hover:scale-[1.02] hover:border-emerald-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-emerald-600 to-amber-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-emerald-900">{fileName}</span>
          {items.length > 0 ? (
            <span className="ml-2 text-emerald-700">· {mineralCount} mineral</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayı.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam mineral" value={mineralCount} />
              <StatBox label="Aktarılabilir kayıt" value={importableCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {MINERAL_PREVIEW_LIMIT} mineral kaydı.
            </p>
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => {
                const name = mineralText(item.name) || "—";
                const sourceId = mineralText(item.id) || "—";
                const category = mineralText(item.kategori);
                const previewLine =
                  mineralNullableText(item.aciklama) ||
                  mineralStringArray(item.fiziksel)[0] ||
                  mineralStringArray(item.organ_etkileri)[0] ||
                  "—";

                return (
                  <div
                    key={`${sourceId}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{name}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {sourceId}
                      {category ? ` · ${category}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{previewLine}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-5">
          <h3 className="text-lg font-black text-emerald-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {MINERAL_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.name}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">{row.name}</span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type BioenergySymbolJsonItem = {
  symbol?: unknown;
  title?: unknown;
  category?: unknown;
  meaning?: unknown;
  source?: unknown;
};

type BioenergySymbolInsertRow = {
  tenant_id: string;
  symbol: string;
  title: string;
  category: string;
  meaning: string;
  source: string;
};

type BioenergySymbolImportFailure = {
  symbol: string;
  title: string;
  message: string;
};

const SYMBOL_BATCH_SIZE = 250;
const SYMBOL_PREVIEW_LIMIT = 5;
const SYMBOL_FAILED_PREVIEW_LIMIT = 20;

function symbolText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function parseBioenergySymbolJsonItems(text: string): {
  items: BioenergySymbolJsonItem[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], error: "Geçersiz JSON dosyası." };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], error: "JSON kökü bir dizi olmalıdır." };
  }

  const items = parsed.filter(
    (item) => item && typeof item === "object",
  ) as BioenergySymbolJsonItem[];
  if (items.length === 0) {
    return { items: [], error: "JSON içinde işlenebilir sembol kaydı bulunamadı." };
  }

  return { items, error: null };
}

function mapBioenergySymbolItemToInsertRow(
  item: BioenergySymbolJsonItem,
  tenantId: string,
): BioenergySymbolInsertRow | null {
  const symbol = symbolText(item.symbol);
  const title = symbolText(item.title);
  if (!symbol || !title) return null;

  return {
    tenant_id: tenantId,
    symbol,
    title,
    category: symbolText(item.category) || "Genel",
    meaning: symbolText(item.meaning),
    source: symbolText(item.source),
  };
}

function flattenBioenergySymbolItemsToRows(
  items: BioenergySymbolJsonItem[],
  tenantId: string,
): BioenergySymbolInsertRow[] {
  const rows: BioenergySymbolInsertRow[] = [];
  for (const item of items) {
    const row = mapBioenergySymbolItemToInsertRow(item, tenantId);
    if (row) rows.push(row);
  }
  return rows;
}

function bioenergySymbolInsertSucceeded(
  data: { id: string }[] | null,
  expectedCount: number,
): boolean {
  return Boolean(data && data.length === expectedCount);
}

async function importBioenergySymbolRows(rows: BioenergySymbolInsertRow[]): Promise<{
  successCount: number;
  failedCount: number;
  failures: BioenergySymbolImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: BioenergySymbolImportFailure[] = [];

  const recordFailure = (symbol: string, title: string, message: string) => {
    failedCount += 1;
    if (failures.length < SYMBOL_FAILED_PREVIEW_LIMIT) {
      failures.push({ symbol, title, message });
    }
  };

  for (let offset = 0; offset < rows.length; offset += SYMBOL_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + SYMBOL_BATCH_SIZE);
    const { data, error } = await supabase
      .from("bioenergy_symbols")
      .insert(batch)
      .select("id");

    if (!error && bioenergySymbolInsertSucceeded(data, batch.length)) {
      successCount += data!.length;
      continue;
    }

    const batchMessage =
      error?.message ??
      "Toplu ekleme tamamlanamadı (public.bioenergy_symbols tablosuna kayıt doğrulanamadı).";

    for (const row of batch) {
      const { data: rowData, error: singleError } = await supabase
        .from("bioenergy_symbols")
        .insert(row)
        .select("id");

      if (singleError || !bioenergySymbolInsertSucceeded(rowData, 1)) {
        recordFailure(
          row.symbol,
          row.title,
          singleError?.message ?? batchMessage,
        );
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function SembolDiliJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<BioenergySymbolJsonItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: BioenergySymbolImportFailure[];
  } | null>(null);

  const symbolCount = items.length;
  const importableCount = useMemo(
    () => (tenantId ? flattenBioenergySymbolItemsToRows(items, tenantId).length : 0),
    [items, tenantId],
  );

  const previewItems = useMemo(() => items.slice(0, SYMBOL_PREVIEW_LIMIT), [items]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setItems([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { items: parsed, error } = parseBioenergySymbolJsonItems(text);
      if (error) {
        setParseError(error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      setItems(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenBioenergySymbolItemsToRows(items, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak sembol kaydı bulunamadı (symbol ve title zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } = await importBioenergySymbolRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (successCount > 0 && failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} sembol kaydı public.bioenergy_symbols tablosuna yazıldı.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      const detail = failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt public.bioenergy_symbols tablosuna yazılamadı.",
      });
    }
  }, [items, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-fuchsia-200/80 bg-gradient-to-br from-fuchsia-50/40 via-white to-violet-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Sembol Dili JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Sparkles className="h-6 w-6 text-fuchsia-700" aria-hidden />
            Sembol Dili JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Biyoenerji Sembol Dili JSON dosyasını seçin; özet görüntüleyip tüm kayıtları
            bioenergy_symbols tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut sembol kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-fuchsia-300 bg-white px-5 py-3 text-sm font-bold text-fuchsia-950 shadow-md transition hover:scale-[1.02] hover:border-fuchsia-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-violet-400 bg-gradient-to-r from-fuchsia-600 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-fuchsia-900">{fileName}</span>
          {items.length > 0 ? (
            <span className="ml-2 text-fuchsia-700">· {symbolCount} sembol</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayı.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam sembol" value={symbolCount} />
              <StatBox label="Aktarılabilir kayıt" value={importableCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {SYMBOL_PREVIEW_LIMIT} sembol kaydı.
            </p>
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => {
                const symbol = symbolText(item.symbol) || "—";
                const title = symbolText(item.title) || "—";
                const category = symbolText(item.category) || "Genel";
                const meaning = symbolText(item.meaning);
                const source = symbolText(item.source);

                return (
                  <div
                    key={`${symbol}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{title}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {symbol}
                      {category ? ` · ${category}` : ""}
                      {source ? ` · ${source}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {meaning || "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/90 p-5">
          <h3 className="text-lg font-black text-fuchsia-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {SYMBOL_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.symbol}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">
                      {row.symbol}
                      {row.title ? ` · ${row.title}` : ""}
                    </span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type BioenergyImaginationJsonItem = {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  text?: unknown;
  notes?: unknown;
  source?: unknown;
};

type BioenergyImaginationInsertRow = {
  tenant_id: string;
  source_id: string;
  title: string;
  category: string;
  text: string;
  notes: string;
  source: string;
};

type BioenergyImaginationImportFailure = {
  title: string;
  message: string;
};

const IMAGINATION_BATCH_SIZE = 250;
const IMAGINATION_PREVIEW_LIMIT = 5;
const IMAGINATION_FAILED_PREVIEW_LIMIT = 20;

function imaginationText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function imaginationSourceId(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function parseBioenergyImaginationJsonItems(text: string): {
  items: BioenergyImaginationJsonItem[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], error: "Geçersiz JSON dosyası." };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], error: "JSON kökü bir dizi olmalıdır." };
  }

  const items = parsed.filter(
    (item) => item && typeof item === "object",
  ) as BioenergyImaginationJsonItem[];
  if (items.length === 0) {
    return { items: [], error: "JSON içinde işlenebilir imajinasyon kaydı bulunamadı." };
  }

  return { items, error: null };
}

function mapBioenergyImaginationItemToInsertRow(
  item: BioenergyImaginationJsonItem,
  tenantId: string,
): BioenergyImaginationInsertRow | null {
  const sourceId = imaginationSourceId(item.id);
  const title = imaginationText(item.title);
  if (!sourceId || !title) return null;

  return {
    tenant_id: tenantId,
    source_id: sourceId,
    title,
    category: imaginationText(item.category) || "Genel",
    text: imaginationText(item.text),
    notes: imaginationText(item.notes) || "",
    source: imaginationText(item.source),
  };
}

function flattenBioenergyImaginationItemsToRows(
  items: BioenergyImaginationJsonItem[],
  tenantId: string,
): BioenergyImaginationInsertRow[] {
  const rows: BioenergyImaginationInsertRow[] = [];
  for (const item of items) {
    const row = mapBioenergyImaginationItemToInsertRow(item, tenantId);
    if (row) rows.push(row);
  }
  return rows;
}

function bioenergyImaginationInsertSucceeded(
  data: { id: string }[] | null,
  expectedCount: number,
): boolean {
  return Boolean(data && data.length === expectedCount);
}

async function importBioenergyImaginationRows(
  rows: BioenergyImaginationInsertRow[],
): Promise<{
  successCount: number;
  failedCount: number;
  failures: BioenergyImaginationImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: BioenergyImaginationImportFailure[] = [];

  const recordFailure = (title: string, message: string) => {
    failedCount += 1;
    if (failures.length < IMAGINATION_FAILED_PREVIEW_LIMIT) {
      failures.push({ title, message });
    }
  };

  for (let offset = 0; offset < rows.length; offset += IMAGINATION_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + IMAGINATION_BATCH_SIZE);
    const { data, error } = await supabase
      .from("bioenergy_imaginations")
      .insert(batch)
      .select("id");

    if (!error && bioenergyImaginationInsertSucceeded(data, batch.length)) {
      successCount += data!.length;
      continue;
    }

    const batchMessage =
      error?.message ??
      "Toplu ekleme tamamlanamadı (public.bioenergy_imaginations tablosuna kayıt doğrulanamadı).";

    for (const row of batch) {
      const { data: rowData, error: singleError } = await supabase
        .from("bioenergy_imaginations")
        .insert(row)
        .select("id");

      if (singleError || !bioenergyImaginationInsertSucceeded(rowData, 1)) {
        recordFailure(row.title, singleError?.message ?? batchMessage);
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function ImajinasyonJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<BioenergyImaginationJsonItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: BioenergyImaginationImportFailure[];
  } | null>(null);

  const imaginationCount = items.length;
  const importableCount = useMemo(
    () =>
      tenantId ? flattenBioenergyImaginationItemsToRows(items, tenantId).length : 0,
    [items, tenantId],
  );

  const previewItems = useMemo(
    () => items.slice(0, IMAGINATION_PREVIEW_LIMIT),
    [items],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setItems([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { items: parsed, error } = parseBioenergyImaginationJsonItems(text);
      if (error) {
        setParseError(error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      setItems(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenBioenergyImaginationItemsToRows(items, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak imajinasyon kaydı bulunamadı (id ve title zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } =
      await importBioenergyImaginationRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (successCount > 0 && failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} imajinasyon kaydı public.bioenergy_imaginations tablosuna yazıldı.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      const detail = failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt public.bioenergy_imaginations tablosuna yazılamadı.",
      });
    }
  }, [items, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-indigo-200/80 bg-gradient-to-br from-indigo-50/40 via-white to-sky-50/50 p-6 shadow-xl sm:p-8"
      aria-label="İmajinasyon JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Moon className="h-6 w-6 text-indigo-700" aria-hidden />
            İmajinasyon JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Biyoenerji İmajinasyonlar JSON dosyasını seçin; özet görüntüleyip tüm kayıtları
            bioenergy_imaginations tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut imajinasyon kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-indigo-300 bg-white px-5 py-3 text-sm font-bold text-indigo-950 shadow-md transition hover:scale-[1.02] hover:border-indigo-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-sky-400 bg-gradient-to-r from-indigo-600 to-sky-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-indigo-900">{fileName}</span>
          {items.length > 0 ? (
            <span className="ml-2 text-indigo-700">· {imaginationCount} imajinasyon</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayı.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam imajinasyon" value={imaginationCount} />
              <StatBox label="Aktarılabilir kayıt" value={importableCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {IMAGINATION_PREVIEW_LIMIT} imajinasyon kaydı.
            </p>
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => {
                const title = imaginationText(item.title) || "—";
                const sourceId = imaginationSourceId(item.id) || "—";
                const category = imaginationText(item.category) || "Genel";
                const previewLine =
                  imaginationText(item.text) ||
                  imaginationText(item.notes) ||
                  imaginationText(item.source) ||
                  "—";

                return (
                  <div
                    key={`${sourceId}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{title}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {sourceId}
                      {category ? ` · ${category}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{previewLine}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-indigo-200 bg-indigo-50/90 p-5">
          <h3 className="text-lg font-black text-indigo-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {IMAGINATION_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.title}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">{row.title}</span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type BioenergyChakraJsonItem = {
  uid?: unknown;
  name?: unknown;
  organs?: unknown;
  glands?: unknown;
  color?: unknown;
  stones?: unknown;
  causes?: unknown;
  physical?: unknown;
  mental?: unknown;
  notes?: unknown;
};

type BioenergyChakraInsertRow = {
  tenant_id: string;
  source_uid: string;
  name: string;
  organs: string;
  glands: string;
  color: string;
  stones: string;
  causes: string;
  physical: string;
  mental: string;
  notes: string;
};

type BioenergyChakraImportFailure = {
  name: string;
  message: string;
};

const CHAKRA_BATCH_SIZE = 250;
const CHAKRA_PREVIEW_LIMIT = 5;
const CHAKRA_FAILED_PREVIEW_LIMIT = 20;

function chakraText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function chakraSourceUid(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function parseBioenergyChakraJsonItems(text: string): {
  items: BioenergyChakraJsonItem[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], error: "Geçersiz JSON dosyası." };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], error: "JSON kökü bir dizi olmalıdır." };
  }

  const items = parsed.filter(
    (item) => item && typeof item === "object",
  ) as BioenergyChakraJsonItem[];
  if (items.length === 0) {
    return { items: [], error: "JSON içinde işlenebilir çakra kaydı bulunamadı." };
  }

  return { items, error: null };
}

function mapBioenergyChakraItemToInsertRow(
  item: BioenergyChakraJsonItem,
  tenantId: string,
): BioenergyChakraInsertRow | null {
  const sourceUid = chakraSourceUid(item.uid);
  const name = chakraText(item.name);
  if (!sourceUid || !name) return null;

  return {
    tenant_id: tenantId,
    source_uid: sourceUid,
    name,
    organs: chakraText(item.organs) || "",
    glands: chakraText(item.glands) || "",
    color: chakraText(item.color) || "",
    stones: chakraText(item.stones) || "",
    causes: chakraText(item.causes) || "",
    physical: chakraText(item.physical) || "",
    mental: chakraText(item.mental) || "",
    notes: chakraText(item.notes) || "",
  };
}

function flattenBioenergyChakraItemsToRows(
  items: BioenergyChakraJsonItem[],
  tenantId: string,
): BioenergyChakraInsertRow[] {
  const rows: BioenergyChakraInsertRow[] = [];
  for (const item of items) {
    const row = mapBioenergyChakraItemToInsertRow(item, tenantId);
    if (row) rows.push(row);
  }
  return rows;
}

function bioenergyChakraInsertSucceeded(
  data: { id: string }[] | null,
  expectedCount: number,
): boolean {
  return Boolean(data && data.length === expectedCount);
}

async function importBioenergyChakraRows(rows: BioenergyChakraInsertRow[]): Promise<{
  successCount: number;
  failedCount: number;
  failures: BioenergyChakraImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: BioenergyChakraImportFailure[] = [];

  const recordFailure = (name: string, message: string) => {
    failedCount += 1;
    if (failures.length < CHAKRA_FAILED_PREVIEW_LIMIT) {
      failures.push({ name, message });
    }
  };

  for (let offset = 0; offset < rows.length; offset += CHAKRA_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + CHAKRA_BATCH_SIZE);
    const { data, error } = await supabase
      .from("bioenergy_chakras")
      .insert(batch)
      .select("id");

    if (!error && bioenergyChakraInsertSucceeded(data, batch.length)) {
      successCount += data!.length;
      continue;
    }

    const batchMessage =
      error?.message ??
      "Toplu ekleme tamamlanamadı (public.bioenergy_chakras tablosuna kayıt doğrulanamadı).";

    for (const row of batch) {
      const { data: rowData, error: singleError } = await supabase
        .from("bioenergy_chakras")
        .insert(row)
        .select("id");

      if (singleError || !bioenergyChakraInsertSucceeded(rowData, 1)) {
        recordFailure(row.name, singleError?.message ?? batchMessage);
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function CakraJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<BioenergyChakraJsonItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: BioenergyChakraImportFailure[];
  } | null>(null);

  const chakraCount = items.length;
  const importableCount = useMemo(
    () => (tenantId ? flattenBioenergyChakraItemsToRows(items, tenantId).length : 0),
    [items, tenantId],
  );

  const previewItems = useMemo(() => items.slice(0, CHAKRA_PREVIEW_LIMIT), [items]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setItems([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { items: parsed, error } = parseBioenergyChakraJsonItems(text);
      if (error) {
        setParseError(error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      setItems(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenBioenergyChakraItemsToRows(items, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak çakra kaydı bulunamadı (uid ve name zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } = await importBioenergyChakraRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (successCount > 0 && failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} çakra kaydı public.bioenergy_chakras tablosuna yazıldı.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      const detail = failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt public.bioenergy_chakras tablosuna yazılamadı.",
      });
    }
  }, [items, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-teal-200/80 bg-gradient-to-br from-teal-50/40 via-white to-cyan-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Çakra JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Orbit className="h-6 w-6 text-teal-700" aria-hidden />
            Çakra JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Biyoenerji Çakralar JSON dosyasını seçin; özet görüntüleyip tüm kayıtları
            bioenergy_chakras tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut çakra kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-teal-300 bg-white px-5 py-3 text-sm font-bold text-teal-950 shadow-md transition hover:scale-[1.02] hover:border-teal-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-cyan-400 bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-teal-900">{fileName}</span>
          {items.length > 0 ? (
            <span className="ml-2 text-teal-700">· {chakraCount} çakra</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayı.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam çakra" value={chakraCount} />
              <StatBox label="Aktarılabilir kayıt" value={importableCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {CHAKRA_PREVIEW_LIMIT} çakra kaydı.
            </p>
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => {
                const name = chakraText(item.name) || "—";
                const sourceUid = chakraSourceUid(item.uid) || "—";
                const color = chakraText(item.color);
                const previewLine =
                  chakraText(item.organs) ||
                  chakraText(item.physical) ||
                  chakraText(item.mental) ||
                  "—";

                return (
                  <div
                    key={`${sourceUid}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{name}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {sourceUid}
                      {color ? ` · ${color}` : ""}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{previewLine}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-teal-200 bg-teal-50/90 p-5">
          <h3 className="text-lg font-black text-teal-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {CHAKRA_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.name}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">{row.name}</span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type BioenergyEnergyBodyJsonItem = {
  uid?: unknown;
  genel_tanim?: unknown;
  gorevi?: unknown;
  bozulma?: unknown;
  onerilen_taslar?: unknown;
  not?: unknown;
};

type BioenergyEnergyBodyInsertRow = {
  tenant_id: string;
  source_uid: string;
  genel_tanim: string;
  gorevi: string;
  bozulma: string;
  onerilen_taslar: string;
  not_text: string;
};

type BioenergyEnergyBodyImportFailure = {
  source_uid: string;
  message: string;
};

const ENERGY_BODY_BATCH_SIZE = 250;
const ENERGY_BODY_PREVIEW_LIMIT = 4;
const ENERGY_BODY_FAILED_PREVIEW_LIMIT = 20;

function energyBodyText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function energyBodySourceUid(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function parseBioenergyEnergyBodyJsonItems(text: string): {
  items: BioenergyEnergyBodyJsonItem[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], error: "Geçersiz JSON dosyası." };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], error: "JSON kökü bir dizi olmalıdır." };
  }

  const items = parsed.filter(
    (item) => item && typeof item === "object",
  ) as BioenergyEnergyBodyJsonItem[];
  if (items.length === 0) {
    return { items: [], error: "JSON içinde işlenebilir enerji bedeni kaydı bulunamadı." };
  }

  return { items, error: null };
}

function mapBioenergyEnergyBodyItemToInsertRow(
  item: BioenergyEnergyBodyJsonItem,
  tenantId: string,
): BioenergyEnergyBodyInsertRow | null {
  const sourceUid = energyBodySourceUid(item.uid);
  if (!sourceUid) return null;

  return {
    tenant_id: tenantId,
    source_uid: sourceUid,
    genel_tanim: energyBodyText(item.genel_tanim) || "",
    gorevi: energyBodyText(item.gorevi) || "",
    bozulma: energyBodyText(item.bozulma) || "",
    onerilen_taslar: energyBodyText(item.onerilen_taslar) || "",
    not_text: energyBodyText(item.not) || "",
  };
}

function flattenBioenergyEnergyBodyItemsToRows(
  items: BioenergyEnergyBodyJsonItem[],
  tenantId: string,
): BioenergyEnergyBodyInsertRow[] {
  const rows: BioenergyEnergyBodyInsertRow[] = [];
  for (const item of items) {
    const row = mapBioenergyEnergyBodyItemToInsertRow(item, tenantId);
    if (row) rows.push(row);
  }
  return rows;
}

function bioenergyEnergyBodyInsertSucceeded(
  data: { id: string }[] | null,
  expectedCount: number,
): boolean {
  return Boolean(data && data.length === expectedCount);
}

async function importBioenergyEnergyBodyRows(
  rows: BioenergyEnergyBodyInsertRow[],
): Promise<{
  successCount: number;
  failedCount: number;
  failures: BioenergyEnergyBodyImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: BioenergyEnergyBodyImportFailure[] = [];

  const recordFailure = (sourceUid: string, message: string) => {
    failedCount += 1;
    if (failures.length < ENERGY_BODY_FAILED_PREVIEW_LIMIT) {
      failures.push({ source_uid: sourceUid, message });
    }
  };

  for (let offset = 0; offset < rows.length; offset += ENERGY_BODY_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + ENERGY_BODY_BATCH_SIZE);
    const { data, error } = await supabase
      .from("bioenergy_energy_bodies")
      .insert(batch)
      .select("id");

    if (!error && bioenergyEnergyBodyInsertSucceeded(data, batch.length)) {
      successCount += data!.length;
      continue;
    }

    const batchMessage =
      error?.message ??
      "Toplu ekleme tamamlanamadı (public.bioenergy_energy_bodies tablosuna kayıt doğrulanamadı).";

    for (const row of batch) {
      const { data: rowData, error: singleError } = await supabase
        .from("bioenergy_energy_bodies")
        .insert(row)
        .select("id");

      if (singleError || !bioenergyEnergyBodyInsertSucceeded(rowData, 1)) {
        recordFailure(row.source_uid, singleError?.message ?? batchMessage);
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function EnerjiBedenleriJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<BioenergyEnergyBodyJsonItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: BioenergyEnergyBodyImportFailure[];
  } | null>(null);

  const energyBodyCount = items.length;
  const importableCount = useMemo(
    () =>
      tenantId ? flattenBioenergyEnergyBodyItemsToRows(items, tenantId).length : 0,
    [items, tenantId],
  );

  const previewItems = useMemo(
    () => items.slice(0, ENERGY_BODY_PREVIEW_LIMIT),
    [items],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setItems([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { items: parsed, error } = parseBioenergyEnergyBodyJsonItems(text);
      if (error) {
        setParseError(error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      setItems(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenBioenergyEnergyBodyItemsToRows(items, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak enerji bedeni kaydı bulunamadı (uid zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } = await importBioenergyEnergyBodyRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (successCount > 0 && failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} enerji bedeni kaydı public.bioenergy_energy_bodies tablosuna yazıldı.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      const detail = failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt public.bioenergy_energy_bodies tablosuna yazılamadı.",
      });
    }
  }, [items, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-rose-200/80 bg-gradient-to-br from-rose-50/40 via-white to-amber-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Enerji Bedenleri JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Dna className="h-6 w-6 text-rose-700" aria-hidden />
            Enerji Bedenleri JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Biyoenerji Enerji Bedenleri JSON dosyasını seçin; özet görüntüleyip tüm kayıtları
            bioenergy_energy_bodies tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut enerji bedeni kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-rose-300 bg-white px-5 py-3 text-sm font-bold text-rose-950 shadow-md transition hover:scale-[1.02] hover:border-rose-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-rose-600 to-amber-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-rose-900">{fileName}</span>
          {items.length > 0 ? (
            <span className="ml-2 text-rose-700">· {energyBodyCount} enerji bedeni</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayı.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam enerji bedeni" value={energyBodyCount} />
              <StatBox label="Aktarılabilir kayıt" value={importableCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {ENERGY_BODY_PREVIEW_LIMIT} enerji bedeni kaydı.
            </p>
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => {
                const sourceUid = energyBodySourceUid(item.uid) || "—";
                const previewLine =
                  energyBodyText(item.genel_tanim) ||
                  energyBodyText(item.gorevi) ||
                  energyBodyText(item.bozulma) ||
                  "—";

                return (
                  <div
                    key={`${sourceUid}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{sourceUid}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{previewLine}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50/90 p-5">
          <h3 className="text-lg font-black text-rose-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {ENERGY_BODY_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.source_uid}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">{row.source_uid}</span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type BioenergySubconsciousJsonItem = Record<string, unknown>;

type BioenergySubconsciousInsertRow = {
  tenant_id: string;
  source_uid: string;
  title: string;
  category: string;
  content: string;
  note_text: string;
};

type BioenergySubconsciousImportFailure = {
  title: string;
  source_uid: string;
  message: string;
};

const SUBCONSCIOUS_BATCH_SIZE = 250;
const SUBCONSCIOUS_PREVIEW_LIMIT = 5;
const SUBCONSCIOUS_FAILED_PREVIEW_LIMIT = 20;

function subconsciousText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function extractBioenergySubconsciousJsonFields(item: BioenergySubconsciousJsonItem) {
  return {
    title: subconsciousText(item.title),
    category: subconsciousText(item.category) || "Genel",
    content:
      subconsciousText(item.cause_text) ||
      subconsciousText(item.content) ||
      subconsciousText(item.text) ||
      subconsciousText(item.description) ||
      subconsciousText(item.aciklama) ||
      subconsciousText(item.neden) ||
      subconsciousText(item.icerik) ||
      "",
    note_text: subconsciousText(item.note) || subconsciousText(item.notes) || "",
    source_uid: subconsciousText(item.uid),
  };
}

function parseBioenergySubconsciousJsonItems(text: string): {
  items: BioenergySubconsciousJsonItem[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], error: "Geçersiz JSON dosyası." };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], error: "JSON kökü bir dizi olmalıdır." };
  }

  const items = parsed.filter(
    (item) => item && typeof item === "object",
  ) as BioenergySubconsciousJsonItem[];
  if (items.length === 0) {
    return { items: [], error: "JSON içinde işlenebilir bilinçaltı kaydı bulunamadı." };
  }

  return { items, error: null };
}

function mapBioenergySubconsciousItemToInsertRow(
  item: BioenergySubconsciousJsonItem,
  tenantId: string,
): BioenergySubconsciousInsertRow | null {
  const fields = extractBioenergySubconsciousJsonFields(item);
  if (!fields.source_uid || !fields.title) return null;

  return {
    tenant_id: tenantId,
    source_uid: fields.source_uid,
    title: fields.title,
    category: fields.category,
    content: fields.content,
    note_text: fields.note_text,
  };
}

function flattenBioenergySubconsciousItemsToRows(
  items: BioenergySubconsciousJsonItem[],
  tenantId: string,
): BioenergySubconsciousInsertRow[] {
  const rows: BioenergySubconsciousInsertRow[] = [];
  for (const item of items) {
    const row = mapBioenergySubconsciousItemToInsertRow(item, tenantId);
    if (row) rows.push(row);
  }
  return rows;
}

function bioenergySubconsciousInsertSucceeded(
  data: { id: string }[] | null,
  expectedCount: number,
): boolean {
  return Boolean(data && data.length === expectedCount);
}

async function importBioenergySubconsciousRows(
  rows: BioenergySubconsciousInsertRow[],
): Promise<{
  successCount: number;
  failedCount: number;
  failures: BioenergySubconsciousImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: BioenergySubconsciousImportFailure[] = [];

  const recordFailure = (title: string, sourceUid: string, message: string) => {
    failedCount += 1;
    if (failures.length < SUBCONSCIOUS_FAILED_PREVIEW_LIMIT) {
      failures.push({ title, source_uid: sourceUid, message });
    }
  };

  for (let offset = 0; offset < rows.length; offset += SUBCONSCIOUS_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + SUBCONSCIOUS_BATCH_SIZE);
    const { data, error } = await supabase
      .from("bioenergy_subconscious_causes")
      .insert(batch)
      .select("id");

    if (!error && bioenergySubconsciousInsertSucceeded(data, batch.length)) {
      successCount += data!.length;
      continue;
    }

    const batchMessage =
      error?.message ??
      "Toplu ekleme tamamlanamadı (public.bioenergy_subconscious_causes tablosuna kayıt doğrulanamadı).";

    for (const row of batch) {
      const { data: rowData, error: singleError } = await supabase
        .from("bioenergy_subconscious_causes")
        .insert(row)
        .select("id");

      if (singleError || !bioenergySubconsciousInsertSucceeded(rowData, 1)) {
        recordFailure(row.title, row.source_uid, singleError?.message ?? batchMessage);
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function BilincaltiSebepleriJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<BioenergySubconsciousJsonItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: BioenergySubconsciousImportFailure[];
  } | null>(null);

  const recordCount = items.length;
  const importableCount = useMemo(
    () =>
      tenantId ? flattenBioenergySubconsciousItemsToRows(items, tenantId).length : 0,
    [items, tenantId],
  );

  const previewItems = useMemo(
    () => items.slice(0, SUBCONSCIOUS_PREVIEW_LIMIT),
    [items],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setItems([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { items: parsed, error } = parseBioenergySubconsciousJsonItems(text);
      if (error) {
        setParseError(error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      setItems(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenBioenergySubconsciousItemsToRows(items, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak kayıt bulunamadı (uid ve title zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } = await importBioenergySubconsciousRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (successCount > 0 && failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} bilinçaltı kaydı public.bioenergy_subconscious_causes tablosuna yazıldı.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      const detail = failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt public.bioenergy_subconscious_causes tablosuna yazılamadı.",
      });
    }
  }, [items, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-violet-200/80 bg-gradient-to-br from-violet-50/40 via-white to-purple-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Bilinçaltı Sebepleri JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Brain className="h-6 w-6 text-violet-700" aria-hidden />
            Bilinçaltı Sebepleri JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            subconscious_causes.json dosyasını seçin; kayıtları bioenergy_subconscious_causes
            tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut bilinçaltı kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-violet-300 bg-white px-5 py-3 text-sm font-bold text-violet-950 shadow-md transition hover:scale-[1.02] hover:border-violet-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-purple-400 bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-violet-900">{fileName}</span>
          {items.length > 0 ? (
            <span className="ml-2 text-violet-700">· {recordCount} kayıt</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayı.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam kayıt" value={recordCount} />
              <StatBox label="Aktarılabilir kayıt" value={importableCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {SUBCONSCIOUS_PREVIEW_LIMIT} kayıt.
            </p>
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => {
                const fields = extractBioenergySubconsciousJsonFields(item);
                const sourceUid = fields.source_uid || "—";
                const title = fields.title || "—";
                const category = fields.category;
                const contentPreview = fields.content;
                const previewLine = contentPreview || "İçerik bulunamadı";

                return (
                  <div
                    key={`${sourceUid}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{title}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {sourceUid}
                      {category ? ` · ${category}` : ""}
                    </p>
                    <p
                      className={`mt-2 line-clamp-2 text-sm ${
                        contentPreview
                          ? "text-slate-600"
                          : "font-semibold text-rose-700"
                      }`}
                    >
                      {previewLine}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-violet-200 bg-violet-50/90 p-5">
          <h3 className="text-lg font-black text-violet-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {SUBCONSCIOUS_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.source_uid}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">
                      {row.title}
                      {row.source_uid ? ` · ${row.source_uid}` : ""}
                    </span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type ReflexologyProtocolJsonItem = Record<string, unknown>;

type ReflexologyProtocolInsertRow = {
  tenant_id: string;
  source_uid: string;
  title: string;
  target_problem: string;
  organs: string;
  application_notes: string;
  raw_json: ReflexologyProtocolJsonItem;
};

type ReflexologyProtocolImportFailure = {
  title: string;
  source_uid: string;
  message: string;
};

const REFLEXOLOGY_PROTOCOL_BATCH_SIZE = 250;
const REFLEXOLOGY_PROTOCOL_PREVIEW_LIMIT = 5;
const REFLEXOLOGY_PROTOCOL_FAILED_PREVIEW_LIMIT = 20;

function reflexologyText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function reflexologyOrgans(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => reflexologyText(entry))
      .filter(Boolean)
      .join(", ");
  }
  return reflexologyText(value);
}

function extractReflexologyProtocolJsonFields(item: ReflexologyProtocolJsonItem) {
  const organsValue = item.organlar ?? item.organs;

  return {
    source_uid: reflexologyText(item.id) || reflexologyText(item.uid),
    title:
      reflexologyText(item.hedef) ||
      reflexologyText(item.title) ||
      reflexologyText(item.name) ||
      reflexologyText(item.baslik) ||
      reflexologyText(item.protokol_adi) ||
      "",
    target_problem:
      reflexologyText(item.hedef) ||
      reflexologyText(item.target) ||
      reflexologyText(item.problem) ||
      reflexologyText(item.sorun) ||
      reflexologyText(item.target_problem) ||
      "",
    organs: reflexologyOrgans(organsValue),
    application_notes:
      reflexologyText(item.aciklama) ||
      reflexologyText(item.notes) ||
      reflexologyText(item.application_notes) ||
      reflexologyText(item.uygulama_notu) ||
      "",
  };
}

function isReflexologyProtocolTransferable(item: ReflexologyProtocolJsonItem): boolean {
  const title =
    reflexologyText(item.hedef) ||
    reflexologyText(item.title) ||
    reflexologyText(item.name) ||
    reflexologyText(item.baslik) ||
    reflexologyText(item.protokol_adi);
  const notes =
    reflexologyText(item.aciklama) ||
    reflexologyText(item.notes) ||
    reflexologyText(item.application_notes) ||
    reflexologyText(item.uygulama_notu);
  return Boolean(title || notes);
}

function parseReflexologyProtocolJsonItems(text: string): {
  items: ReflexologyProtocolJsonItem[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { items: [], error: "Geçersiz JSON dosyası." };
  }

  const json = parsed;
  const jsonObject =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  const records = Array.isArray(json)
    ? json
    : Array.isArray(jsonObject?.items)
      ? jsonObject.items
      : Array.isArray(jsonObject?.protokoller)
        ? jsonObject.protokoller
        : Array.isArray(jsonObject?.data)
          ? jsonObject.data
          : Array.isArray(jsonObject?.records)
            ? jsonObject.records
            : [];

  if (records.length === 0) {
    return { items: [], error: "JSON içinde protokol kaydı bulunamadı" };
  }

  const items = records.filter(
    (item) => item && typeof item === "object",
  ) as ReflexologyProtocolJsonItem[];
  if (items.length === 0) {
    return { items: [], error: "JSON içinde protokol kaydı bulunamadı" };
  }

  return { items, error: null };
}

function mapReflexologyProtocolItemToInsertRow(
  item: ReflexologyProtocolJsonItem,
  tenantId: string,
): ReflexologyProtocolInsertRow | null {
  if (!isReflexologyProtocolTransferable(item)) return null;

  const fields = extractReflexologyProtocolJsonFields(item);

  return {
    tenant_id: tenantId,
    source_uid: fields.source_uid,
    title: fields.title,
    target_problem: fields.target_problem,
    organs: fields.organs,
    application_notes: fields.application_notes,
    raw_json: item,
  };
}

function flattenReflexologyProtocolItemsToRows(
  items: ReflexologyProtocolJsonItem[],
  tenantId: string,
): ReflexologyProtocolInsertRow[] {
  const rows: ReflexologyProtocolInsertRow[] = [];
  for (const item of items) {
    const row = mapReflexologyProtocolItemToInsertRow(item, tenantId);
    if (row) rows.push(row);
  }
  return rows;
}

/** Güvenli admin import API'sine batch gönderir (publishable insert yerine service_role). */
async function insertReflexologyProtocolsViaApi(
  rows: ReflexologyProtocolInsertRow[],
): Promise<{ ok: boolean; error?: string }> {
  const adminId = readYasamUser()?.id ?? "";
  const sessionToken = readSessionToken();
  try {
    const res = await fetch("/api/admin/refleksoloji/protocols/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-id": adminId,
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ rows }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ağ hatası" };
  }
}

async function importReflexologyProtocolRows(
  rows: ReflexologyProtocolInsertRow[],
): Promise<{
  successCount: number;
  failedCount: number;
  failures: ReflexologyProtocolImportFailure[];
}> {
  let successCount = 0;
  let failedCount = 0;
  const failures: ReflexologyProtocolImportFailure[] = [];

  const recordFailure = (title: string, sourceUid: string, message: string) => {
    failedCount += 1;
    if (failures.length < REFLEXOLOGY_PROTOCOL_FAILED_PREVIEW_LIMIT) {
      failures.push({ title, source_uid: sourceUid, message });
    }
  };

  for (let offset = 0; offset < rows.length; offset += REFLEXOLOGY_PROTOCOL_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + REFLEXOLOGY_PROTOCOL_BATCH_SIZE);
    const result = await insertReflexologyProtocolsViaApi(batch);

    if (result.ok) {
      successCount += batch.length;
      continue;
    }

    const batchMessage =
      result.error ??
      "Toplu ekleme tamamlanamadı (public.reflexology_protocols tablosuna kayıt doğrulanamadı).";

    // Batch başarısızsa tek tek dene (mevcut fallback davranışı korunur).
    for (const row of batch) {
      const single = await insertReflexologyProtocolsViaApi([row]);
      if (!single.ok) {
        recordFailure(row.title, row.source_uid, single.error ?? batchMessage);
      } else {
        successCount += 1;
      }
    }
  }

  return { successCount, failedCount, failures };
}

function RefleksolojiProtokollerJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<ReflexologyProtocolJsonItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    successCount: number;
    failedCount: number;
    totalProcessed: number;
    failures: ReflexologyProtocolImportFailure[];
  } | null>(null);

  const recordCount = items.length;
  const importableCount = useMemo(
    () => items.filter(isReflexologyProtocolTransferable).length,
    [items],
  );

  const previewItems = useMemo(
    () => items.slice(0, REFLEXOLOGY_PROTOCOL_PREVIEW_LIMIT),
    [items],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setItems([]);
    setFileName(null);
    setImportReport(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { items: parsed, error } = parseReflexologyProtocolJsonItems(text);
      if (error) {
        setParseError(error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      setItems(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    const rows = flattenReflexologyProtocolItemsToRows(items, tenantId);
    if (rows.length === 0) {
      setParseError("Aktarılacak kayıt bulunamadı (hedef veya aciklama zorunlu).");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);

    const { successCount, failedCount, failures } = await importReflexologyProtocolRows(rows);

    setImporting(false);
    const totalProcessed = successCount + failedCount;
    setImportReport({
      successCount,
      failedCount,
      totalProcessed,
      failures,
    });

    if (successCount > 0 && failedCount === 0) {
      showToast({
        type: "success",
        message: `${successCount} protokol kaydı public.reflexology_protocols tablosuna yazıldı.`,
      });
    } else if (successCount > 0) {
      showToast({
        type: "warning",
        message: `${successCount} başarılı, ${failedCount} başarısız kayıt.`,
      });
    } else {
      const detail = failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt public.reflexology_protocols tablosuna yazılamadı.",
      });
    }
  }, [items, showToast]);

  return (
    <section
      className="rounded-3xl border-2 border-sky-200/80 bg-gradient-to-br from-sky-50/40 via-white to-teal-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Refleksoloji Protokoller JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Footprints className="h-6 w-6 text-sky-700" aria-hidden />
            Refleksoloji Protokoller JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            protokoller.json dosyasını seçin; kayıtları reflexology_protocols tablosuna aktarın.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Bu işlem mevcut protokol kayıtlarını silmez. Aynı JSON tekrar yüklenirse kayıtlar
            çoğalabilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-sky-300 bg-white px-5 py-3 text-sm font-bold text-sky-950 shadow-md transition hover:scale-[1.02] hover:border-sky-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing}
            />
          </label>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-teal-400 bg-gradient-to-r from-sky-600 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-sky-900">{fileName}</span>
          {items.length > 0 ? (
            <span className="ml-2 text-sky-700">· {recordCount} kayıt</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan toplam sayı.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatBox label="Toplam kayıt" value={recordCount} />
              <StatBox label="Aktarılabilir kayıt" value={importableCount} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {REFLEXOLOGY_PROTOCOL_PREVIEW_LIMIT} kayıt.
            </p>
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => {
                const fields = extractReflexologyProtocolJsonFields(item);
                const hedefTitle = reflexologyText(item.hedef) || fields.title || "—";
                const recordId = reflexologyText(item.id) || fields.source_uid || "—";
                const aciklamaPreview = reflexologyText(item.aciklama) || fields.application_notes || "—";

                return (
                  <div
                    key={`${recordId}-${index}`}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                  >
                    <p className="text-sm font-black text-slate-900">{hedefTitle}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{recordId}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{aciklamaPreview}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-sky-200 bg-sky-50/90 p-5">
          <h3 className="text-lg font-black text-sky-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {REFLEXOLOGY_PROTOCOL_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.source_uid}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">
                      {row.title}
                      {row.source_uid ? ` · ${row.source_uid}` : ""}
                    </span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DogaltasJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [records, setRecords] = useState<StoneJsonRecord[]>([]);
  const [importSummaryOpen, setImportSummaryOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFailedRows, setImportFailedRows] = useState<ImportFailedRow[]>([]);

  const previewRecords = useMemo(() => records.slice(0, 3), [records]);

  const stats = useMemo(
    () => (records.length > 0 ? computeCompatibilityStats(records) : null),
    [records],
  );

  const migrationRisk = useMemo(() => {
    if (!stats || records.length === 0) return null;
    return computeMigrationRisk(records, stats);
  }, [records, stats]);

  const unmappedPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const record of previewRecords) {
      for (const path of collectUnmappedPaths(record)) paths.add(path);
    }
    return Array.from(paths).sort();
  }, [previewRecords]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setRecords([]);
    setFileName(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { records: parsed, error } = parseStoneJsonPayload(text);
      if (error) {
        setParseError(error);
        setRecords([]);
        setFileName(file.name);
        return;
      }
      if (parsed.length === 0) {
        setParseError("JSON içinde işlenebilir kayıt bulunamadı.");
        setRecords([]);
        setFileName(file.name);
        return;
      }
      setRecords(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const importableCount = useMemo(
    () => records.filter((r) => hasStoneName(r)).length,
    [records],
  );

  const hasNonUrlImages = useMemo(() => recordsHaveNonUrlImages(records), [records]);

  const firstTenEffectWarnings = useMemo(() => {
    const subset = records.slice(0, EFFECT_WARNING_PREVIEW_LIMIT);
    const missingPhysical: string[] = [];
    const missingSpiritual: string[] = [];

    for (const record of subset) {
      if (!hasStoneName(record)) continue;
      const name = getStoneDisplayName(record);
      if (!hasPhysicalEffects(record)) missingPhysical.push(name);
      if (!hasSpiritualEffects(record)) missingSpiritual.push(name);
    }

    return { missingPhysical, missingSpiritual };
  }, [records]);

  const handleSupabaseImportClick = useCallback(() => {
    setImportSuccess(null);
    setImportError(null);
    setImportFailedRows([]);

    if (records.length === 0) return;

    if (!tenantId) {
      setImportError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }

    setImportSummaryOpen(true);
  }, [records.length, tenantId, tenantError]);

  const runSupabaseImport = useCallback(async () => {
    if (!tenantId) {
      setImportError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      setImportSummaryOpen(false);
      return;
    }

    const testMode = false;
    const recordsToImport = testMode ? records.slice(0, 10) : records;

    const importRows: ImportRow[] = [];
    for (let index = 0; index < recordsToImport.length; index += 1) {
      const record = recordsToImport[index];
      const payload = buildStonePayloadWithImages(record, tenantId, index);
      if (payload) {
        importRows.push({ payload, stoneName: payload.stone_name });
      }
    }

    if (importRows.length === 0) {
      setImportError("Aktarılacak geçerli taş kaydı bulunamadı (isim zorunlu).");
      setImportSummaryOpen(false);
      return;
    }

    setImportSummaryOpen(false);
    setImporting(true);
    setImportProgress(0);
    setImportTotal(importRows.length);
    setImportError(null);
    setImportSuccess(null);
    setImportFailedRows([]);

    let successCount = 0;
    const failed: ImportFailedRow[] = [];

    for (let i = 0; i < importRows.length; i += BATCH_SIZE) {
      const chunk = importRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("stones")
        .insert(chunk.map((row) => row.payload));

      if (error) {
        chunk.forEach((row, chunkIndex) => {
          failed.push({
            index: i + chunkIndex + 1,
            stoneName: row.stoneName,
            message: error.message,
          });
        });
      } else {
        successCount += chunk.length;
      }

      const done = Math.min(i + BATCH_SIZE, importRows.length);
      setImportProgress(done);
    }

    setImporting(false);
    setImportProgress(importRows.length);
    setImportFailedRows(failed);

    if (successCount > 0 && failed.length === 0) {
      const toastMessage = `${successCount} kayıt başarıyla aktarıldı`;
      setImportSuccess(toastMessage);
      showToast({ type: "success", message: toastMessage });
    } else if (successCount > 0) {
      const summary = `${successCount} başarılı / ${failed.length} başarısız · Tenant: ${tenantId}`;
      setImportSuccess(summary);
      showToast({ type: "warning", message: summary });
    } else {
      setImportError("Hiçbir kayıt aktarılamadı. Başarısız kayıtları listeden inceleyin.");
    }
  }, [records, showToast, tenantId, tenantError]);

  return (
    <section
      className="rounded-3xl border-2 border-cyan-200/80 bg-gradient-to-br from-cyan-50/40 via-white to-teal-50/50 p-6 shadow-xl sm:p-8"
      aria-label="Doğaltaş JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <FileJson className="h-6 w-6 text-cyan-700" aria-hidden />
            Doğaltaş JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            JSON yükleyin; alan eşleştirmesi, göç riski ve Supabase aktarımı bu ekrandan yapılır.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Yerel görsel yolları (C:\... veya göreli yol) production&apos;da desteklenmez; bu kayıtlar görselsiz aktarılır ve{" "}
            <code className="rounded bg-amber-100 px-1">image_upload_failed</code> işaretlenir.
            Yalnızca http(s) URL&apos;leri işlenir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-cyan-300 bg-white px-5 py-3 text-sm font-bold text-cyan-950 shadow-md transition hover:scale-[1.02] hover:border-cyan-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
          {records.length > 0 ? (
            <button
              type="button"
              disabled={importing || importableCount === 0}
              onClick={() => void handleSupabaseImportClick()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-violet-400 bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Supabase&apos;e Aktar
            </button>
          ) : null}
        </div>
      </div>

      {importing ? (
        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/90 p-4" role="status">
          <div className="flex items-center justify-between gap-3 text-sm font-bold text-violet-950">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Aktarılıyor…
            </span>
            <span className="tabular-nums">
              Aktarıldı: {importProgress}/{importTotal}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-600 transition-all duration-300"
              style={{
                width: importTotal > 0 ? `${(importProgress / importTotal) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
      ) : null}

      {importSuccess ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {importSuccess}
        </p>
      ) : null}

      {importError ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {importError}
        </p>
      ) : null}

      {importFailedRows.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/90 p-4">
          <p className="text-sm font-black text-rose-950">
            Başarısız kayıtlar ({importFailedRows.length})
          </p>
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {importFailedRows.map((row) => (
              <li
                key={`${row.index}-${row.stoneName}`}
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
              >
                <span className="font-bold text-rose-950">
                  {row.index}. {row.stoneName}
                </span>
                <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-cyan-900">{fileName}</span>
          {records.length > 0 ? (
            <span className="ml-2 text-emerald-700">· {records.length} kayıt</span>
          ) : null}
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {records.length > 0 ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Alan Eşleştirme Önizlemesi</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk 3 kayıt üzerinden örnek değerler; tablo JSON → Web/Supabase eşlemesini gösterir.
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/95">
                      <th className="px-4 py-3 font-bold text-slate-700">JSON alanı</th>
                      <th className="px-4 py-3 font-bold text-slate-700">Web / Supabase alanı</th>
                      <th className="px-4 py-3 font-bold text-slate-700">Örnek (1. kayıt)</th>
                      <th className="px-4 py-3 font-bold text-slate-700">İlk 3 kayıt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIELD_MAPPINGS.map((row) => {
                      const sample = previewRecords[0]
                        ? row.sample(previewRecords[0])
                        : "—";
                      const hitCount = previewRecords.filter((r) => row.hasValue(r)).length;
                      return (
                        <tr
                          key={row.jsonField}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-slate-800 sm:text-sm">
                            {row.jsonField}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-cyan-900 sm:text-sm">
                            {row.webField}
                          </td>
                          <td className="max-w-xs px-4 py-3 text-slate-600">{sample}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                hitCount === 3
                                  ? "bg-emerald-100 text-emerald-900"
                                  : hitCount > 0
                                    ? "bg-amber-100 text-amber-900"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {hitCount}/3 dolu
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Kontrol sonucu</h3>
            <p className="mt-1 text-sm text-slate-600">Tüm JSON kayıtları üzerinden sayım.</p>
            {stats ? (
              <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
                <StatBox label="Kayıt bulundu" value={stats.total} />
                <StatBox label="İsim var" value={stats.withName} />
                <StatBox label="Fiziksel etki bulunan" value={stats.withPhysical} />
                <StatBox label="Fiziksel etki bulunamayan" value={stats.withoutPhysical} />
                <StatBox label="Ruhsal etki bulunan" value={stats.withSpiritual} />
                <StatBox label="Ruhsal etki bulunamayan" value={stats.withoutSpiritual} />
                <StatBox label="Genel bilgi" value={stats.withGeneral} />
                <StatBox label="Uyarı (opsiyonel)" value={stats.withWarning} />
                <StatBox label="Çakra" value={stats.withChakras} />
                <StatBox label="Görsel yolu" value={stats.withImagePaths} />
              </div>

              {firstTenEffectWarnings.missingPhysical.length > 0 ||
              firstTenEffectWarnings.missingSpiritual.length > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                    İlk {EFFECT_WARNING_PREVIEW_LIMIT} kayıt — etki uyarıları
                  </p>
                  {firstTenEffectWarnings.missingPhysical.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-amber-950">
                        Fiziksel etki bulunamayan taşlar:
                      </p>
                      <p className="mt-1 text-xs font-medium text-amber-900">
                        {firstTenEffectWarnings.missingPhysical.join(" · ")}
                      </p>
                    </div>
                  ) : null}
                  {firstTenEffectWarnings.missingSpiritual.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-amber-950">
                        Ruhsal etki bulunamayan taşlar:
                      </p>
                      <p className="mt-1 text-xs font-medium text-amber-900">
                        {firstTenEffectWarnings.missingSpiritual.join(" · ")}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              </>
            ) : null}
          </div>

          {migrationRisk ? <MigrationRiskPanel report={migrationRisk} /> : null}

          {previewRecords.length > 0 ? (
            <div>
              <h3 className="text-lg font-black text-slate-900">İlk 3 kayıt özeti</h3>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {previewRecords.map((record, index) => (
                  <article
                    key={index}
                    className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Kayıt {index + 1}
                    </p>
                    <p className="mt-2 text-base font-bold text-slate-900">
                      {hasStoneName(record)
                        ? String(record.stone_name ?? record.name)
                        : "İsimsiz kayıt"}
                    </p>
                    <ul className="mt-3 space-y-1 text-xs text-slate-600">
                      {FIELD_MAPPINGS.slice(0, 6).map((row) => (
                        <li key={row.jsonField}>
                          <span className="font-semibold text-slate-700">{row.webField}:</span>{" "}
                          {row.hasValue(record) ? "✓" : "—"}
                        </li>
                      ))}
                      <li className="text-slate-400">+ diğer eşlemeler…</li>
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {unmappedPaths.length > 0 ? (
            <div
              className="rounded-2xl border-2 border-rose-300 bg-rose-50/95 p-5"
              role="alert"
            >
              <p className="flex items-center gap-2 text-base font-black text-rose-950">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                Web karşılığı olmayan JSON alanları
              </p>
              <ul className="mt-3 space-y-2">
                {unmappedPaths.map((path) => (
                  <li
                    key={path}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-900"
                  >
                    <span className="font-mono">{path}</span>
                    <span className="mt-1 block text-xs font-medium text-rose-700">
                      Bu JSON alanı için web karşılığı yok
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
              İlk 3 kayıtta bilinmeyen üst düzey alan tespit edilmedi.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-cyan-200 bg-white/70 px-4 py-8 text-center text-sm font-medium text-slate-500">
          Doğaltaş JSON dosyası yükleyin; eşleştirme önizlemesi burada görünecek.
        </p>
      )}

      {importSummaryOpen && stats && migrationRisk ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/40 bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5 text-white">
              <p className="text-lg font-black">Son güvenlik kontrolü</p>
              <p className="mt-1 text-sm text-white/85">Aktarım öncesi özet</p>
            </div>
            <div className="px-6 py-6">
              <div className="grid grid-cols-2 gap-2 text-sm font-bold text-slate-800">
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  Toplam taş: {importableCount}
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  Genel bilgi: {stats.withGeneral}
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  Fiziksel etki: {stats.withPhysical}
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  Ruhsal etki: {stats.withSpiritual}
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  Görseller: {stats.withImagePaths}
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  Göç riski: {migrationRisk.emoji} {migrationRisk.label}
                </p>
              </div>

              {hasNonUrlImages ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-950">
                  Resimlerin bir kısmı web URL formatında değil.
                  <span className="mt-1 block font-bold">Taş verileri aktarılsın mı?</span>
                </p>
              ) : (
                <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  Taş verileri aktarılsın mı?
                </p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setImportSummaryOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-black text-slate-700"
                >
                  İptal
                </button>
                <button
                  type="button"
                  disabled={importableCount === 0}
                  onClick={() => void runSupabaseImport()}
                  className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Devam Et
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const STOK_JSON_PREVIEW_LIMIT = 40;

function StokJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryJsonRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [lastImportTenant, setLastImportTenant] = useState<string | null>(null);

  const previewRows = useMemo(
    () => rows.slice(0, STOK_JSON_PREVIEW_LIMIT),
    [rows],
  );

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setRows([]);
    setFileName(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { rows: parsed, error } = parseInventoryJsonPayload(text);
      if (error) {
        setParseError(error);
        setRows([]);
        setFileName(file.name);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    };
    reader.onerror = () => setParseError("Dosya okunamadı.");
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleImport = useCallback(async () => {
    if (!tenantId) {
      const msg = tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE;
      setParseError(msg);
      showToast({ type: "error", message: msg });
      return;
    }
    if (rows.length === 0) {
      setParseError("Aktarılacak kayıt yok.");
      return;
    }
    setImporting(true);
    setParseError(null);
    const result = await importInventoryJsonToWebStock(rows, tenantId);
    setImporting(false);

    if (!result.ok) {
      setParseError(result.error);
      showToast({ type: "error", message: result.error });
      return;
    }

    setLastImportTenant(result.tenantId);
    console.log("[stok-json] aktarım tamam", result);
    const verifyMsg =
      result.supabaseVerifiedCount > 0
        ? `Stok JSON aktarıldı. Supabase doğrulama: ${result.supabaseVerifiedCount} kayıt (tenant: ${result.tenantId}).`
        : `Stok JSON aktarıldı ancak Supabase doğrulama 0 kayıt — canlı stokta oturum tenant_id aynı mı kontrol edin.`;
    showToast({
      type: result.supabaseVerifiedCount > 0 ? "success" : "warning",
      message: verifyMsg,
    });
    setParseError(null);
  }, [rows, showToast, tenantId, tenantError]);

  return (
    <section
      className="rounded-3xl border-2 border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/40 p-6 shadow-xl sm:p-8"
      aria-label="Stok JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <Package className="h-6 w-6 text-amber-700" aria-hidden />
            Stok JSON
          </h2>
          <p className="mt-2 max-w-3xl text-base font-medium text-slate-600">
            Masaüstü <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">inventory.json</code>{" "}
            dosyasını web ürün stok sistemine aktarır. Mevcut kayıtlar silinmez; aynı taş adı + tür
            güncellenir.
          </p>
          <p className="mt-2 rounded-xl border border-sky-200 bg-sky-50/90 px-3 py-2 text-sm font-semibold text-sky-950">
            Hedef tablo:{" "}
            <span className="font-mono">{DOGALTAS_INVENTORY_SUPABASE_TABLE}</span> · Aktarım tenant_id:{" "}
            <span className="font-mono">{tenantId ?? "—"}</span>
            {lastImportTenant ? (
              <span className="block mt-1">
                Son aktarım tenant_id: <span className="font-mono">{lastImportTenant}</span>
              </span>
            ) : null}
            <span className="block mt-1 text-xs font-medium">
              Önbellek: {DOGALTAS_WEB_STOCK_STORAGE_KEY} · Canlı stok: /urun-stok/canli-stok (aynı tenant ile
              okur)
            </span>
          </p>
        </div>
        <label className="cursor-pointer">
          <span className="inline-flex h-12 items-center rounded-2xl border-2 border-amber-300 bg-amber-100 px-5 text-sm font-black text-amber-950 shadow-sm">
            JSON Dosyası Seç
          </span>
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-bold text-slate-700">Dosya: {fileName}</p>
      ) : null}

      {parseError ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {parseError}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <p className="mt-4 text-base font-bold text-slate-800">
            Önizleme ({Math.min(rows.length, STOK_JSON_PREVIEW_LIMIT)} / {rows.length} kayıt)
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-base">
              <thead>
                <tr className="text-left text-sm font-black uppercase tracking-wide text-amber-900">
                  <th className="px-3 py-2">Taş Adı</th>
                  <th className="px-3 py-2">Tür</th>
                  <th className="px-3 py-2 text-center">Stok Adedi</th>
                  <th className="px-3 py-2 text-center">Dizi TL</th>
                  <th className="px-3 py-2 text-center">Dizi USD</th>
                  <th className="px-3 py-2 text-center">Adet TL</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${row.name}-${row.type}-${index}`} className="rounded-lg bg-white/90">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{row.name}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{row.type || "—"}</td>
                    <td className="px-3 py-2.5 text-center">{row.adet}</td>
                    <td className="px-3 py-2.5 text-center">{row.dizi_price.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-center">{row.dizi_price_usd.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-center">{row.adet_price.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={importing}
              onClick={() => void handleImport()}
              className="inline-flex h-12 items-center rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 text-base font-black text-white shadow-lg disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  Aktarılıyor…
                </>
              ) : (
                "Aktar"
              )}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function TopluVeriPage() {
  useBfcacheRefresh();
  const [activeTab, setActiveTab] = useState<
    | "dogaltas"
    | "stok-json"
    | "kombinasyon"
    | "mineral"
    | "sembol"
    | "imajinasyon"
    | "cakra"
    | "enerji-bedeni"
    | "bilincalti"
    | "refleksoloji-protokol"
    | "sifa-rehberi"
  >("dogaltas");

  return (
    <AdminSourceTenantProvider>
    <AdminModuleLayout
      title="Toplu Veri Aktarımı"
      description="JSON ve toplu veri içe aktarma merkezi"
      Icon={Upload}
      theme={{
        headerGradient: "from-slate-900 via-violet-900 to-purple-800",
        headerLabelClass: "text-violet-200/90",
        iconWrap: "from-violet-500 to-purple-600",
      }}
      preparingNote="Doğaltaş JSON sekmesinde alan eşleştirme, göç riski ve Supabase aktarımı kullanılabilir."
      demoSectionTitle="Diğer aktarım kuyrukları"
      demoSectionDesc="Aşağıdaki kartlar diğer toplu veri kanalları için demo önizlemedir."
      demoCards={[
        { title: "JSON içe aktarma kuyruğu" },
        { title: "Son aktarım tarihi" },
        { title: "Başarılı kayıt sayısı" },
        { title: "Hatalı kayıt sayısı" },
      ]}
      footerNote="Toplu Veri Aktarımı · uyumluluk önizlemesi"
    >
      <AdminSourceTenantDebug className="mb-4" />
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("dogaltas")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "dogaltas"
              ? "border-cyan-400 bg-cyan-100 text-cyan-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          Doğaltaş JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stok-json")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "stok-json"
              ? "border-amber-400 bg-amber-100 text-amber-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          📦 Stok JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("kombinasyon")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "kombinasyon"
              ? "border-violet-400 bg-violet-100 text-violet-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          💎 Kombinasyon JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("mineral")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "mineral"
              ? "border-emerald-400 bg-emerald-100 text-emerald-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🧪 Mineral JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sembol")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "sembol"
              ? "border-fuchsia-400 bg-fuchsia-100 text-fuchsia-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🔮 Sembol Dili JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("imajinasyon")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "imajinasyon"
              ? "border-indigo-400 bg-indigo-100 text-indigo-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🌙 İmajinasyon JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cakra")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "cakra"
              ? "border-teal-400 bg-teal-100 text-teal-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🌀 Çakra JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("enerji-bedeni")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "enerji-bedeni"
              ? "border-rose-400 bg-rose-100 text-rose-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🧬 Enerji Bedenleri JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bilincalti")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "bilincalti"
              ? "border-violet-400 bg-violet-100 text-violet-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🧠 Bilinçaltı Sebepleri JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("refleksoloji-protokol")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "refleksoloji-protokol"
              ? "border-sky-400 bg-sky-100 text-sky-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🦶 Refleksoloji Protokoller JSON
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sifa-rehberi")}
          className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition ${
            activeTab === "sifa-rehberi"
              ? "border-violet-400 bg-gradient-to-r from-violet-100 to-cyan-100 text-violet-950 shadow-md"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          🩺 Şifa Rehberi JSON
        </button>
      </div>

      {activeTab === "dogaltas" ? <DogaltasJsonTab /> : null}
      {activeTab === "stok-json" ? <StokJsonTab /> : null}
      {activeTab === "kombinasyon" ? <KombinasyonJsonTab /> : null}
      {activeTab === "mineral" ? <MineralJsonTab /> : null}
      {activeTab === "sembol" ? <SembolDiliJsonTab /> : null}
      {activeTab === "imajinasyon" ? <ImajinasyonJsonTab /> : null}
      {activeTab === "cakra" ? <CakraJsonTab /> : null}
      {activeTab === "enerji-bedeni" ? <EnerjiBedenleriJsonTab /> : null}
      {activeTab === "bilincalti" ? <BilincaltiSebepleriJsonTab /> : null}
      {activeTab === "refleksoloji-protokol" ? <RefleksolojiProtokollerJsonTab /> : null}
      {activeTab === "sifa-rehberi" ? <HealingGuideJsonTab /> : null}
    </AdminModuleLayout>
    </AdminSourceTenantProvider>
  );
}
