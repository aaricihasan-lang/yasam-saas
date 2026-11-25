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
import trAnamnez from "@/messages/tr/clients.anamnez.json";
import enAnamnez from "@/messages/en/clients.anamnez.json";
import { effectiveSections, fieldLabel, getCatalog, isKnownTemplateVersion } from "@/lib/danisan/anamnez/schema";
import { displayAnswer } from "@/lib/danisan/anamnez/format";
import { isEmptyAnswer, validateFormCustom } from "@/lib/danisan/anamnez/validate";
import type { AnswerValue, FormCustom } from "@/lib/danisan/anamnez/types";
import { dyDataTable, dyGap, dyKvTable, dyNote, dySubTitle, filledRows } from "./clientReportLayout";
import { dyText, type DyText } from "./clientReportText";

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

/**
 * `x` (I18N çıktı dili metin katmanı) verilmezse TR = bugünkü çıktı. Anamnez soru/seçenek etiketleri şablonun
 * kendi dil kataloğundan (std-v1 TR/EN); danışanın yazdığı cevaplar ÇEVRİLMEZ.
 */
export function buildAnamnezSection(row: AnamnezReportRow, color: string, x: DyText = dyText()): ReportChild[] {
  // Savunma: yalnız tamamlanmış ve bilinen şablonlu form (route da doğrular).
  if (row.status !== "completed" || !isKnownTemplateVersion(row.template_version)) return [];
  const lang = x.rl.isSource ? "tr" : "en";
  const loc = x.rl.isSource ? {} : { locale: x.rl.intlTag };
  const m = (lang === "en" ? enAnamnez : trAnamnez).clients.anamnez;
  const yesNo = { yes: m.field.yes, no: m.field.no };
  const catalog = getCatalog(row.template_version, lang);
  const answers = row.answers ?? {};
  const kindLabel = (m.kind as Record<string, string>)[row.kind] ?? "";
  // DB varsayılanı '{}' (kısmi) olabilir → anamnez PDF route'u ile AYNI doğrulama/normalizasyon.
  const fc = validateFormCustom(row.template_version, row.form_custom ?? {});
  if (!fc.ok) return [dyNote(x.t("anamnez.unreadable"))];

  const out: ReportChild[] = [];
  out.push(dyNote(x.t("anamnez.intro")));
  const meta = dyKvTable(filledRows([
    [x.t("anamnez.form"), row.title?.trim() || kindLabel],
    [x.t("anamnez.assessmentDate"), row.assessment_date ? x.loose(row.assessment_date, row.assessment_date) : ""],
    [x.t("anamnez.completedAt"), row.completed_at ? x.instantDateTime(row.completed_at) : ""],
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
      const text = displayAnswer(v, f, row.template_version, lang, yesNo).trim();
      if (text) rows.push([fieldLabel(f, catalog), text]);
    }
    if (!rows.length) continue;
    answered += rows.length;
    out.push(dySubTitle(`${s.key}. ${catalog.sections[s.key]?.title ?? s.key}`, color));
    const t = dyKvTable(rows, { cols: 2, labelColor: color });
    if (t) out.push(t, dyGap());
  }
  if (!answered) out.push(dyNote(x.t("anamnez.noAnswers")));
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
  /** C12 (2026-11-04): tercih edilen / kaçınılan besinler (opsiyonel; yoksa bölüm yok). */
  preferences?: BeslenmePreferenceRow[];
};
export type BeslenmePreferenceRow = { stance: string; label: string; note?: string | null };
/** Kanonik tercih kodları (etiket katalogda: reports.clients.nutrition.stance). */
const PREFERENCE_STANCES = new Set(["preferred", "avoided"]);
const GOAL_TYPES = new Set(["weight_loss", "weight_gain", "maintenance", "muscle_gain", "healthy_lifestyle", "other"]);
const ACTIVITY_LEVELS = new Set(["sedentary", "light", "moderate", "active", "very_active"]);

export const BESLENME_MEASUREMENT_LIMIT = 10;
export const BESLENME_PROFILE_COLUMNS = "goal_type, goal_note, activity_level, dietary_pattern, daily_meal_count, target_weight_kg, water_note, lifestyle_note, general_note";
export const BESLENME_MEASUREMENT_COLUMNS = "measured_at, weight_kg, height_cm, waist_cm, hip_cm, note";

/** Ölçüm değeri: kayıtlı sayı AYNEN (yuvarlama yok); yalnız ondalık ayırıcı dile göre (tr "," · en "."). */
const fmtNumFor = (x: DyText) => (v: unknown, unit: string) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return "";
  return `${x.rl.isSource ? String(n).replace(".", ",") : String(n)} ${unit}`;
};

export function buildBeslenmeSection(input: BeslenmeReportInput, color: string, x: DyText = dyText()): ReportChild[] {
  const out: ReportChild[] = [];
  const fmtNum = fmtNumFor(x);
  const p = input.profile;
  const profileRows = p ? filledRows([
    [x.t("nutrition.goal"), p.goal_type ? (GOAL_TYPES.has(p.goal_type) ? x.t(`nutrition.goalType.${p.goal_type}`) : p.goal_type) : ""],
    [x.t("nutrition.goalNote"), p.goal_note],
    [x.t("nutrition.activity"), p.activity_level ? (ACTIVITY_LEVELS.has(p.activity_level) ? x.t(`nutrition.activityLevel.${p.activity_level}`) : p.activity_level) : ""],
    [x.t("nutrition.dietaryPattern"), p.dietary_pattern],
    [x.t("nutrition.mealCount"), p.daily_meal_count != null ? String(p.daily_meal_count) : ""],
    [x.t("nutrition.targetWeight"), fmtNum(p.target_weight_kg, "kg")],
    [x.t("nutrition.water"), p.water_note],
    [x.t("nutrition.lifestyle"), p.lifestyle_note],
    [x.t("nutrition.generalNote"), p.general_note],
  ]) : [];
  const allergens = input.allergens.filter((a) => a.name.trim());
  const meas = input.measurements.filter((r) => [r.weight_kg, r.height_cm, r.waist_cm, r.hip_cm].some((x) => fmtNum(x, "") !== "") || (r.note ?? "").trim());
  const prefs = (input.preferences ?? []).filter((r) => r.label.trim() && PREFERENCE_STANCES.has(r.stance));
  if (!profileRows.length && !allergens.length && !meas.length && !prefs.length) return [];

  out.push(dyNote(prefs.length ? x.t("nutrition.introWithPrefs") : x.t("nutrition.intro")));
  if (profileRows.length) {
    out.push(dySubTitle(x.t("nutrition.profile"), color));
    const t = dyKvTable(profileRows, { cols: 2, labelColor: color });
    if (t) out.push(t, dyGap());
  }
  if (allergens.length) {
    out.push(dySubTitle(x.t("nutrition.allergens"), color));
    out.push(dyDataTable([{ header: x.t("nutrition.colAllergen"), pct: 40 }, { header: x.t("nutrition.colNote"), pct: 60 }], allergens.map((a) => [a.name, a.note?.trim() || "—"]), { headerFill: color }), dyGap());
  }
  if (prefs.length) {
    // C12: önce tercih edilenler, sonra kaçınılanlar (kendi içinde kayıt sırası korunur).
    const ordered = [...prefs.filter((r) => r.stance === "preferred"), ...prefs.filter((r) => r.stance === "avoided")];
    out.push(dySubTitle(x.t("nutrition.preferences"), color));
    out.push(dyDataTable(
      [{ header: x.t("nutrition.colStance"), pct: 22 }, { header: x.t("nutrition.colFood"), pct: 38 }, { header: x.t("nutrition.colNote"), pct: 40 }],
      ordered.map((r) => [x.t(`nutrition.stance.${r.stance}`), r.label.trim(), r.note?.trim() || "—"]),
      { headerFill: color },
    ), dyGap());
  }
  if (meas.length) {
    out.push(dySubTitle(x.t("nutrition.measurements"), color));
    out.push(dyDataTable(
      [{ header: x.t("nutrition.colDate"), pct: 16 }, { header: x.t("nutrition.colWeight"), pct: 13, align: "center" }, { header: x.t("nutrition.colHeight"), pct: 13, align: "center" }, { header: x.t("nutrition.colWaist"), pct: 13, align: "center" }, { header: x.t("nutrition.colHip"), pct: 13, align: "center" }, { header: x.t("nutrition.colNote"), pct: 32 }],
      meas.map((r) => [
        r.measured_at ? x.loose(r.measured_at, r.measured_at) : "—",
        fmtNum(r.weight_kg, "kg") || "—",
        fmtNum(r.height_cm, "cm") || "—",
        fmtNum(r.waist_cm, "cm") || "—",
        fmtNum(r.hip_cm, "cm") || "—",
        r.note?.trim() || "—",
      ]),
      { headerFill: color },
    ));
    if (input.measurementTotal > meas.length) out.push(dyNote(x.count("nutrition.measurementsShown", meas.length, { total: String(input.measurementTotal) })));
    else out.push(dyGap());
  }
  return out;
}
