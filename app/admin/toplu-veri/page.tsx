"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { AlertTriangle, CheckCircle2, FileJson, Upload } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

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
  withSpiritual: number;
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

const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const WARNING_RATIO_THRESHOLD = 0.2;

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
]);

const KNOWN_EFFECT_KEYS = new Set([
  "general",
  "physical",
  "spiritual",
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
    jsonField: "effects.physical[].note",
    webField: "physical_effects",
    sample: (r) => truncate(joinEffectNotes(r, "physical")),
    hasValue: (r) => effectHasNotes(r, "physical"),
  },
  {
    jsonField: "effects.spiritual[].note",
    webField: "spiritual_effects",
    sample: (r) => truncate(joinEffectNotes(r, "spiritual")),
    hasValue: (r) => effectHasNotes(r, "spiritual"),
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
  return {
    total: records.length,
    withName: records.filter(hasStoneName).length,
    withPhysical: records.filter((r) => effectHasNotes(r, "physical")).length,
    withSpiritual: records.filter((r) => effectHasNotes(r, "spiritual")).length,
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

function DogaltasJsonTab() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [records, setRecords] = useState<StoneJsonRecord[]>([]);

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
            JSON yükleyin; alan eşleştirmesi ve uyumluluk kontrolü yapılır. Supabase insert
            şimdilik kapalıdır.
          </p>
        </div>
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
      </div>

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
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
                <StatBox label="Kayıt bulundu" value={stats.total} />
                <StatBox label="İsim var" value={stats.withName} />
                <StatBox label="Fiziksel etki" value={stats.withPhysical} />
                <StatBox label="Ruhsal etki" value={stats.withSpiritual} />
                <StatBox label="Genel bilgi" value={stats.withGeneral} />
                <StatBox label="Uyarı" value={stats.withWarning} />
                <StatBox label="Çakra" value={stats.withChakras} />
                <StatBox label="Görsel yolu" value={stats.withImagePaths} />
              </div>
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
    </section>
  );
}

export default function TopluVeriPage() {
  const [activeTab, setActiveTab] = useState<"dogaltas">("dogaltas");

  return (
    <AdminModuleLayout
      title="Toplu Veri Aktarımı"
      description="JSON ve toplu veri içe aktarma merkezi"
      Icon={Upload}
      theme={{
        headerGradient: "from-slate-900 via-violet-900 to-purple-800",
        headerLabelClass: "text-violet-200/90",
        iconWrap: "from-violet-500 to-purple-600",
      }}
      preparingNote="Doğaltaş JSON sekmesinde alan eşleştirme ve uyumluluk kontrolü aktif. Supabase insert henüz yapılmaz."
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
      </div>

      {activeTab === "dogaltas" ? <DogaltasJsonTab /> : null}
    </AdminModuleLayout>
  );
}
