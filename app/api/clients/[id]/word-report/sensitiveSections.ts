/**
 * AŞAMA 2 / BUG-005 — Danışan Word raporunda AÇIK SEÇİMLE eklenen hassas bölümler (SAF; DB/ağ YOK).
 *
 * Owner kararı A (23.10.2026):
 *  - Anamnez ve Beslenme ayrı seçilebilir bölümlerdir; ikisi de VARSAYILAN KAPALI, Tam Rapor dahil
 *    hiçbir rapora otomatik eklenmez (route yalnız açık `includeAnamnez` / `includeBeslenme` ile verir).
 *  - Anamnez: yalnız TAMAMLANMIŞ form + danışanın açık rıza kaydı (route doğrular). Yalnız yanıtlanmış
 *    alanlar; boş alan / taslak / ek dosya rapora girmez.
 *  - Beslenme: yalnız profil, alerjen ve ölçüm özeti (Beslenme Planı'nın kendi premium Word'ü ayrı kalır).
 *  - Veri yoksa içerik UYDURULMAZ: bölüm üretilmez.
 */
import type { ReportChild } from "@/lib/docx/reportHelpers";
import { formatDateLoose, formatInstantDateTime } from "@/lib/time/reportTime";
import trAnamnez from "@/messages/tr/clients.anamnez.json";
import { effectiveSections, fieldLabel, getCatalog, isKnownTemplateVersion } from "@/lib/danisan/anamnez/schema";
import { displayAnswer } from "@/lib/danisan/anamnez/format";
import { isEmptyAnswer, validateFormCustom } from "@/lib/danisan/anamnez/validate";
import type { AnswerValue, FormCustom } from "@/lib/danisan/anamnez/types";
import { ACTIVITY_LEVEL_LABELS, GOAL_TYPE_LABELS } from "@/lib/beslenme/clientContracts";
import { dyDataTable, dyGap, dyKvTable, dyNote, dySubTitle, filledRows } from "./clientReportLayout";

// ─── Anamnez ─────────────────────────────────────────────────────────────────

export type AnamnezReportRow = {
  id: string;
  kind: string;
  title: string | null;
  assessment_date: string | null;
  status: string;
  template_version: string;
  form_custom: FormCustom | null;
  answers: Record<string, AnswerValue> | null;
  completed_at: string | null;
};

export const ANAMNEZ_REPORT_COLUMNS = "id, kind, title, assessment_date, status, template_version, form_custom, answers, completed_at";

export function buildAnamnezSection(row: AnamnezReportRow, color: string): ReportChild[] {
  // Savunma: yalnız tamamlanmış ve bilinen şablonlu form (route da doğrular).
  if (row.status !== "completed" || !isKnownTemplateVersion(row.template_version)) return [];
  const m = trAnamnez.clients.anamnez;
  const yesNo = { yes: m.field.yes, no: m.field.no };
  const catalog = getCatalog(row.template_version, "tr");
  const answers = row.answers ?? {};
  const kindLabel = (m.kind as Record<string, string>)[row.kind] ?? "";
  // DB varsayılanı '{}' (kısmi) olabilir → anamnez PDF route'u ile AYNI doğrulama/normalizasyon.
  const fc = validateFormCustom(row.template_version, row.form_custom ?? {});
  if (!fc.ok) return [dyNote("Bu anamnez formunun yapısı okunamadı; içerik rapora aktarılmadı.")];

  const out: ReportChild[] = [];
  out.push(dyNote("Danışanın tamamlanmış anamnez formundan, kaydedildiği haliyle aktarılmıştır. Danışanın açık rıza kaydı mevcuttur. Yalnız yanıtlanmış alanlar gösterilir."));
  const meta = dyKvTable(filledRows([
    ["Form", row.title?.trim() || kindLabel],
    ["Değerlendirme Tarihi", row.assessment_date ? formatDateLoose(row.assessment_date, { fallback: row.assessment_date }) : ""],
    ["Tamamlanma", row.completed_at ? formatInstantDateTime(row.completed_at) : ""],
  ]), { cols: 2, labelColor: color });
  if (meta) out.push(meta, dyGap());

  let answered = 0;
  for (const s of effectiveSections(row.template_version, fc.value)) {
    if (s.optional && !s.enabled) continue;
    const rows: [string, string][] = [];
    for (const f of s.fields) {
      if (f.hidden) continue;
      const v = answers[f.key];
      if (isEmptyAnswer(v)) continue;
      const text = displayAnswer(v, f, row.template_version, "tr", yesNo).trim();
      if (text) rows.push([fieldLabel(f, catalog), text]);
    }
    if (!rows.length) continue;
    answered += rows.length;
    out.push(dySubTitle(`${s.key}. ${catalog.sections[s.key]?.title ?? s.key}`, color));
    const t = dyKvTable(rows, { cols: 2, labelColor: color });
    if (t) out.push(t, dyGap());
  }
  if (!answered) out.push(dyNote("Bu tamamlanmış formda yanıtlanmış alan bulunmuyor."));
  return out;
}

// ─── Beslenme (profil · alerjen · ölçüm özeti) ────────────────────────────────

export type BeslenmeProfileRow = {
  goal_type?: string | null;
  goal_note?: string | null;
  activity_level?: string | null;
  dietary_pattern?: string | null;
  daily_meal_count?: number | null;
  target_weight_kg?: number | string | null;
  water_note?: string | null;
  lifestyle_note?: string | null;
  general_note?: string | null;
};
export type BeslenmeAllergenRow = { name: string; note: string | null };
export type BeslenmeMeasurementRow = {
  measured_at: string | null;
  weight_kg?: number | string | null;
  height_cm?: number | string | null;
  waist_cm?: number | string | null;
  hip_cm?: number | string | null;
  note?: string | null;
};
export type BeslenmeReportInput = {
  profile: BeslenmeProfileRow | null;
  allergens: BeslenmeAllergenRow[];
  /** En yeni → en eski (route en fazla MEASUREMENT_LIMIT satır okur). */
  measurements: BeslenmeMeasurementRow[];
  /** Danışanın toplam ölçüm sayısı (özet satırı için). */
  measurementTotal: number;
};

export const BESLENME_MEASUREMENT_LIMIT = 10;
export const BESLENME_PROFILE_COLUMNS = "goal_type, goal_note, activity_level, dietary_pattern, daily_meal_count, target_weight_kg, water_note, lifestyle_note, general_note";
export const BESLENME_MEASUREMENT_COLUMNS = "measured_at, weight_kg, height_cm, waist_cm, hip_cm, note";

const fmtNum = (v: unknown, unit: string) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? `${String(n).replace(".", ",")} ${unit}` : "";
};

export function buildBeslenmeSection(input: BeslenmeReportInput, color: string): ReportChild[] {
  const out: ReportChild[] = [];
  const p = input.profile;
  const profileRows = p ? filledRows([
    ["Hedef", p.goal_type ? (GOAL_TYPE_LABELS as Record<string, string>)[p.goal_type] ?? p.goal_type : ""],
    ["Hedef Notu", p.goal_note],
    ["Aktivite Düzeyi", p.activity_level ? (ACTIVITY_LEVEL_LABELS as Record<string, string>)[p.activity_level] ?? p.activity_level : ""],
    ["Beslenme Düzeni", p.dietary_pattern],
    ["Günlük Öğün Sayısı", p.daily_meal_count != null ? String(p.daily_meal_count) : ""],
    ["Hedef Kilo", fmtNum(p.target_weight_kg, "kg")],
    ["Su Tüketimi", p.water_note],
    ["Yaşam Tarzı", p.lifestyle_note],
    ["Genel Not", p.general_note],
  ]) : [];
  const allergens = input.allergens.filter((a) => a.name.trim());
  const meas = input.measurements.filter((r) => [r.weight_kg, r.height_cm, r.waist_cm, r.hip_cm].some((x) => fmtNum(x, "") !== "") || (r.note ?? "").trim());
  if (!profileRows.length && !allergens.length && !meas.length) return [];

  out.push(dyNote("Beslenme modülündeki danışan profili, beyan edilen alerjiler ve ölçüm özetinden aktarılmıştır. Beslenme planları bu rapora eklenmez; planın kendi Word raporu ayrıca alınabilir."));
  if (profileRows.length) {
    out.push(dySubTitle("Beslenme Profili", color));
    const t = dyKvTable(profileRows, { cols: 2, labelColor: color });
    if (t) out.push(t, dyGap());
  }
  if (allergens.length) {
    out.push(dySubTitle("Beyan Edilen Alerjiler", color));
    out.push(dyDataTable([{ header: "Alerji", pct: 40 }, { header: "Not", pct: 60 }], allergens.map((a) => [a.name, a.note?.trim() || "—"]), { headerFill: color }), dyGap());
  }
  if (meas.length) {
    out.push(dySubTitle("Ölçüm Özeti", color));
    out.push(dyDataTable(
      [{ header: "Tarih", pct: 16 }, { header: "Kilo", pct: 13, align: "center" }, { header: "Boy", pct: 13, align: "center" }, { header: "Bel", pct: 13, align: "center" }, { header: "Kalça", pct: 13, align: "center" }, { header: "Not", pct: 32 }],
      meas.map((r) => [
        r.measured_at ? formatDateLoose(r.measured_at, { fallback: r.measured_at }) : "—",
        fmtNum(r.weight_kg, "kg") || "—",
        fmtNum(r.height_cm, "cm") || "—",
        fmtNum(r.waist_cm, "cm") || "—",
        fmtNum(r.hip_cm, "cm") || "—",
        r.note?.trim() || "—",
      ]),
      { headerFill: color },
    ));
    if (input.measurementTotal > meas.length) out.push(dyNote(`Son ${meas.length} ölçüm gösterilmiştir (toplam ${input.measurementTotal}).`));
    else out.push(dyGap());
  }
  return out;
}
