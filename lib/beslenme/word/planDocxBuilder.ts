/**
 * Beslenme FAZ 6 / Plan Word — SAF belge kurucusu (DB YOK, IO YOK, server-only YOK).
 *
 * Bu dosya bilinçli olarak `server-only` İÇERMEZ ve uzaktan görsel getirme kod-yolu
 * TAŞIMAZ (SSRF-güvenli): hiçbir uzak-görsel getirme/gömme API'si çağrılmaz.
 * Beslenme Word raporu HİÇBİR uzak görsel çekmez — yalnız plan SNAPSHOT verisinden
 * metin/tablo üretir. Böylece harness bu saf kurucuyu doğrudan (DB'siz) test edebilir.
 *
 * Girdi: `buildPlanDocxBuffer` (planDocx.ts) tarafından SNAPSHOT tablolarından
 * (nutrition_plan_days/_meals/_items/_item_nutrients) yüklenmiş bir `PlanDocxTree`.
 * nutrition_foods ASLA okunmaz — donmuş snapshot (food_name/quantity/grams/nutrient) esastır.
 *
 * PREMIUM DÜZEN (22.10.2026): sunum `planDocxLayout` (Beslenme'ye özel, yeşil/doğal) ile yapılır.
 * Kapak ayrı bölüm; gövdede ZORUNLU sayfa sonu YOK (eskiden her gün + genel özet yeni sayfaya
 * zorlanıyordu → 1 günlük planda 3 sayfa). Hesaplama / değer / metin içerikleri DEĞİŞMEDİ.
 * Tek görsel: çağıranın verdiği onaylı logo (tree.logo; yerel asset) — uzak görsel YOK.
 */

import { Document, Packer } from "docx";
import { buildFooter, type ReportChild } from "@/lib/docx/reportHelpers";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import { expertFooterParagraph, type ExpertBranding, type ExpertBrandingVariant } from "@/lib/docx/expertBranding";
import {
  BPAGE,
  bCover,
  bDataTable,
  bDayTitle,
  bGap,
  bHeader,
  bKvTable,
  bMealTitle,
  bMuted,
  bSectionTitle,
  bStripTable,
  bText,
  bWellness,
} from "./planDocxLayout";
import {
  sumNutrients,
  itemNutrientContribution,
  energyCoverage,
  effectiveDailyTarget,
  daysBetween,
  type ItemNutrientSnapshot,
} from "@/lib/beslenme/planContracts";
import { formatPortionLabel } from "@/lib/beslenme/portionDisplay";
import type { ReportLocale } from "@/lib/i18n/reportLocale";
import { nutritionText, type NutritionText } from "./planDocxText";

// ── Girdi ağacı (snapshot-only; server loader bu şekli üretir) ─────────────────

export type PlanDocxItem = {
  id: string;
  food_name_snapshot: string;
  quantity: number | null;
  portion_label_snapshot: string | null;
  grams: number;
  sort_order: number;
  nutrients: ItemNutrientSnapshot[];
};

export type PlanDocxMeal = {
  id: string;
  meal_type: string | null;
  label: string;
  sort_order: number;
  items: PlanDocxItem[];
};

export type PlanDocxDay = {
  id: string;
  plan_date: string;
  energy_target_override: number | null;
  note: string | null;
  meals: PlanDocxMeal[];
};

export type PlanDocxPlan = {
  id: string;
  title: string;
  note: string | null;
  start_date: string;
  end_date: string;
  daily_energy_target: number | null;
  status: string;
  revision_number: number | null;
};

export type PlanDocxTree = {
  plan: PlanDocxPlan;
  days: PlanDocxDay[];
  recipientName?: string | null;
  /** FA-16: belgeyi hazırlayan uzmanın görünen adı ("Hazırlayan: …"); yoksa satır basılmaz. */
  expertName?: string | null;
  /** Onaylı Yaşam Sistemi logosu (sunucu yerel asset'ten okur). Yoksa kapakta yazı ile marka. */
  logo?: Buffer | null;
  /**
   * F3A: uzman rapor markalaması (render-hazır). null/yok → çıktı bugünküyle birebir.
   * Veri kaynağı (expert_profiles / logo) F1/F2 ile bağlanacak; route şimdilik null geçer.
   */
  branding?: ExpertBranding | null;
  /** Yalnız örnek/test üretimi için tasarım varyantı. */
  brandingVariant?: ExpertBrandingVariant;
  /** I18N çıktı dili (route `resolveReportLocale`). Yoksa kaynak dil (tr) → bugünkü çıktı birebir. */
  output?: ReportLocale | null;
};

export type PlanDocxError = { code: string; status: number };
export type PlanDocxOk = { ok: true; buffer: Buffer; filename: string };
export type PlanDocxResult = PlanDocxOk | { ok: false; error: PlanDocxError };

// ── Boyut sınırları (abuse + wall-clock koruması) ──────────────────────────────
export const MAX_PLAN_DAY_SPAN = 366; // ≤ 1 yıl + artık gün
export const MAX_PLAN_ITEMS = 3000;

// ── Görüntüleme yardımcıları (yuvarlama YALNIZ display; §15/§37) ───────────────

// Durum etiketi, sayı ve tarih biçimi çıktı diline bağlıdır → ./planDocxText
// (TR'de eski "tr-TR" biçimi ve "Taslak/Aktif/Arşiv" etiketleriyle birebir; golden kilitli).

/**
 * Traversal-safe slug: küçük harf, TR karakter → ascii, [^a-z0-9]+ → "-", baş/son "-" atılır.
 * slash/backslash/nokta/".." ÜRETMEZ (Content-Disposition injection engellenir).
 */
export function slugifyPlanTitle(t: string): string {
  return (t || "")
    // TR karakterleri toLowerCase'DEN ÖNCE eşle: JS `İ`.toLowerCase() = "i"+birleşen-nokta
    // üretir; bu birleşen nokta sonradan "-" olur (Plan İçin → plan-i-cin hatası). Önce eşleyip
    // sonra normalize edilir.
    .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u").replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // artık birleşen aksan işaretlerini at
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Beslenme-Plani_<slug>_<start>_<end>_V<revision>.docx (ASCII-only, injection-safe).
 * Yalnız sistem öneki çıktı dilindedir (EN: Nutrition-Plan_…); plan adı slug'ı (kullanıcı içeriği) aynen.
 */
export function planDocxFilename(plan: PlanDocxPlan, output?: ReportLocale | null): string {
  const slug = slugifyPlanTitle(plan.title) || "plan";
  const safe = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "");
  const rev = Number.isFinite(plan.revision_number as number) ? Number(plan.revision_number) : 1;
  const prefix = nutritionText(output).t("filePrefix").replace(/[^A-Za-z0-9-]/g, "") || "Beslenme-Plani";
  return `${prefix}_${slug}_${safe(plan.start_date)}_${safe(plan.end_date)}_V${rev}.docx`;
}

// ── Gün toplamı (tüm öğün item'ları; HAM accumulator) ──────────────────────────

/**
 * energy = BİLİNEN enerji toplamı; energyMissing = enerji verisi girilmemiş kalem sayısı.
 * EKSİK VERİ ≠ 0 kcal (web ile aynı contract: energyCoverage). Eksik kalem varsa toplam
 * "≥ X kcal" + eksik uyarısıyla gösterilir; 0 gibi gerçek ölçüm olarak sunulmaz.
 */
type DayTotals = { energy: number; energyMissing: number; protein: number; carbohydrate: number; total_fat: number; fiber: number };

function itemsOfDay(day: PlanDocxDay): Array<{ grams: number; nutrients: ItemNutrientSnapshot[] }> {
  const out: Array<{ grams: number; nutrients: ItemNutrientSnapshot[] }> = [];
  for (const m of day.meals) for (const it of m.items) out.push({ grams: it.grams, nutrients: it.nutrients });
  return out;
}

function codeAmount(totals: { nutrient_code: string; amount: number }[], code: string): number {
  return totals.find((t) => t.nutrient_code === code)?.amount ?? 0;
}

function dayTotals(day: PlanDocxDay): DayTotals {
  const items = itemsOfDay(day);
  const t = sumNutrients(items);
  const cov = energyCoverage(items);
  return {
    energy: cov.known,
    energyMissing: cov.missingCount,
    protein: codeAmount(t, "protein"),
    carbohydrate: codeAmount(t, "carbohydrate"),
    total_fat: codeAmount(t, "total_fat"),
    fiber: codeAmount(t, "fiber"),
  };
}

/** Item enerji katkısı (snapshot energy amount üzerinden). Enerji satırı YOKSA null (bilinmiyor ≠ 0). */
function itemEnergy(it: PlanDocxItem): number | null {
  const row = it.nutrients.find((n) => n.nutrient_code === "energy");
  if (!row) return null;
  return itemNutrientContribution(it.grams, row.amount);
}

/** Enerji hücresi: bilinmiyorsa "Kalori girilmemiş" (web MealCard ile aynı ifade). */
function fmtItemEnergy(x: NutritionText, it: PlanDocxItem): string {
  const e = itemEnergy(it);
  return e == null ? x.t("energyUnknown") : x.kcal(e);
}

/** Toplam enerji: eksik kalem varsa "≥ X kcal (N kalemde enerji verisi eksik)". */
function fmtEnergyWithCoverage(x: NutritionText, known: number, missing: number): string {
  if (missing <= 0) return x.kcal(known);
  return x.t("energyWithMissing", { value: x.kcal(known), count: missing, shown: String(missing) });
}

// ── Boyut kontrolü ─────────────────────────────────────────────────────────────

export function checkPlanSize(tree: PlanDocxTree): PlanDocxError | null {
  const span = daysBetween(tree.plan.start_date, tree.plan.end_date);
  if (Number.isFinite(span) && span > MAX_PLAN_DAY_SPAN) return { code: "PLAN_TOO_LARGE", status: 413 };
  let itemCount = 0;
  for (const d of tree.days) for (const m of d.meals) itemCount += m.items.length;
  if (itemCount > MAX_PLAN_ITEMS) return { code: "PLAN_TOO_LARGE", status: 413 };
  return null;
}

// ── Belge kurucusu ─────────────────────────────────────────────────────────────

/**
 * Yüklü bir plan ağacından profesyonel DOCX üretir. Uzak görsel/fetch YOK.
 * Boyut aşımı → { ok:false, error:{ PLAN_TOO_LARGE, 413 } }.
 */
export async function buildPlanDocxFromTree(tree: PlanDocxTree): Promise<PlanDocxResult> {
  const sizeErr = checkPlanSize(tree);
  if (sizeErr) return { ok: false, error: sizeErr };

  const { plan } = tree;
  // I18N: sistem metni / sayı / tarih biçimi çıktı dilinden (yoksa tr → bugünkü çıktı birebir). Hesap dilden bağımsız.
  const x = nutritionText(tree.output);
  const t = x.t;
  const common = tree.output?.common;
  const days = [...tree.days].sort((a, b) => a.plan_date.localeCompare(b.plan_date));

  const target = effectiveDailyTarget(null, plan.daily_energy_target);
  const rev = Number.isFinite(plan.revision_number as number) ? Number(plan.revision_number) : 1;

  // ── KAPAK (ayrı bölüm; üst/alt bilgi yok) ───────────────────────────────────
  const range = `${x.longDate(plan.start_date)} – ${x.longDate(plan.end_date)}`;
  const cover: ReportChild[] = bCover({
    logo: tree.logo ?? null,
    planTitle: plan.title || t("planFallback"),
    range,
    meta: [
      // Danışan adı (FAZ 7) — yalnız bağlıysa; export anındaki current ad, PII snapshot YOK (§34).
      ...(tree.recipientName ? [[t("meta.client"), tree.recipientName] as [string, string]] : []),
      [t("meta.status"), t("meta.statusValue", { status: x.status(plan.status), rev: String(rev) })],
      [t("meta.energyTarget"), target != null ? x.kcal(target) : ""],
      [t("meta.duration"), t("meta.durationValue", { count: days.length, shown: String(days.length) })],
      [t("meta.expert"), tree.expertName?.trim() ?? ""],
    ],
    expertLabel: t("meta.expert"),
    text: x,
    branding: tree.branding,
    brandingVariant: tree.brandingVariant,
    expertName: tree.expertName,
  });

  // Kısa amaç satırı (danışan verisi YOK; geleneksel/mizaç YOK). Sayfa sonu ZORLANMAZ.
  const body: ReportChild[] = [bMuted(t("intro"))];
  if (plan.note && plan.note.trim()) {
    body.push(bMealTitle(t("planNote")), bText(plan.note.trim()));
  }

  // ── GÜNLER (doğal akış: gün yeni sayfaya ZORLANMAZ; başlık içeriğinden kopmaz) ──
  const COLUMNS = [
    { header: t("columns.food"), pct: 46 },
    { header: t("columns.amount"), pct: 24 },
    { header: t("columns.grams"), pct: 15, align: "right" as const },
    { header: t("columns.energy"), pct: 15, align: "right" as const },
  ];

  days.forEach((day) => {
    const dTarget = effectiveDailyTarget(day.energy_target_override, plan.daily_energy_target);
    body.push(bDayTitle(x.longDate(day.plan_date), dTarget != null ? t("dayTarget", { value: x.kcal(dTarget) }) : null));
    if (day.note && day.note.trim()) body.push(bText(day.note.trim(), { keepNext: true }));

    const meals = [...day.meals].sort((a, b) => a.sort_order - b.sort_order);
    let hasAnyItem = false;
    for (const meal of meals) {
      body.push(bMealTitle(meal.label || t("mealFallback")));
      const items = [...meal.items].sort((a, b) => a.sort_order - b.sort_order);
      if (items.length === 0) {
        body.push(bMuted(t("mealEmpty"), { keepNext: true }));
        continue;
      }
      hasAnyItem = true;
      const rows = items.map((it) => {
        // Miktar: ortak SAF formatter (web ile aynı contract). "su bardağı" gibi ithal ölçü
        // veya güvenle normalize edilemeyen hâl → "—" (gram kolonu authoritative kalır).
        // Porsiyon etiketi snapshot içeriğidir (çevrilmez); yalnız ondalık ayracı çıktı dilinde.
        const miktar =
          formatPortionLabel({ quantity: it.quantity, portionLabel: it.portion_label_snapshot }, x.intlTag) ??
          "—";
        return [it.food_name_snapshot || "—", miktar, x.gram(it.grams), fmtItemEnergy(x, it)];
      });
      body.push(bDataTable(COLUMNS, rows));
    }

    if (!hasAnyItem && meals.length === 0) {
      body.push(bMuted(t("dayEmpty"), { keepNext: true }));
    }

    // Günlük toplamlar (tek satırlık şerit; değerler eskisiyle BİREBİR).
    const tot = dayTotals(day);
    body.push(bGap(100));
    body.push(bStripTable([
      { label: t("strip.energy"), value: fmtEnergyWithCoverage(x, tot.energy, tot.energyMissing) },
      { label: t("strip.protein"), value: x.gram(tot.protein) },
      { label: t("strip.carbohydrate"), value: x.gram(tot.carbohydrate) },
      { label: t("strip.fat"), value: x.gram(tot.total_fat) },
      { label: t("strip.fiber"), value: x.gram(tot.fiber) },
    ]));
    body.push(bGap(120));
  });

  // ── PLAN GENEL ÖZETİ (yeni sayfaya ZORLANMAZ) ────────────────────────────────
  const contentDays = days.filter((d) => itemsOfDay(d).length > 0);
  const planDayCount = days.length;
  const contentDayCount = contentDays.length;

  const acc = contentDays.reduce(
    (s, d) => {
      const dt = dayTotals(d);
      s.energy += dt.energy; s.protein += dt.protein; s.carbohydrate += dt.carbohydrate;
      s.total_fat += dt.total_fat; s.fiber += dt.fiber; s.energyMissing += dt.energyMissing;
      return s;
    },
    { energy: 0, protein: 0, carbohydrate: 0, total_fat: 0, fiber: 0, energyMissing: 0 },
  );
  const denom = contentDayCount || 1;
  const avgEnergy = acc.energy / denom;
  const avgProtein = acc.protein / denom;
  const avgCarb = acc.carbohydrate / denom;
  const avgFat = acc.total_fat / denom;
  const avgFiber = acc.fiber / denom;
  const delta = target != null ? avgEnergy - target : null;

  const summaryRows: [string, string][] = [
    [t("summary.durationDays"), String(planDayCount)],
    [t("summary.contentDays"), String(contentDayCount)],
    [t("summary.energyTarget"), target != null ? x.kcal(target) : "—"],
    [t("summary.avgEnergy"), contentDayCount ? (acc.energyMissing > 0 ? `≥ ${x.kcal(avgEnergy)}` : x.kcal(avgEnergy)) : "—"],
    [t("summary.delta"), delta != null && contentDayCount ? `${delta >= 0 ? "+" : "−"}${x.kcal(Math.abs(delta))}` : "—"],
    [t("summary.avgProtein"), contentDayCount ? x.gram(avgProtein) : "—"],
    [t("summary.avgCarbohydrate"), contentDayCount ? x.gram(avgCarb) : "—"],
    [t("summary.avgFat"), contentDayCount ? x.gram(avgFat) : "—"],
    [t("summary.avgFiber"), contentDayCount ? x.gram(avgFiber) : "—"],
    ...(acc.energyMissing > 0
      ? ([[t("summary.missingItems"), t("summary.missingItemsValue", { count: acc.energyMissing, shown: String(acc.energyMissing) })]] as [string, string][])
      : []),
  ];

  body.push(
    bSectionTitle(t("summary.title")),
    bKvTable(summaryRows),
    bMuted(t("summary.note")),
    // FA-16: rapor sonu sade "Bilgilendirme" (+ Hazırlayan) — bölünmeyen tek blok.
    ...bWellness(wellnessNote("beslenme", common).full, tree.expertName, { branding: tree.branding, brandingVariant: tree.brandingVariant, common }),
  );

  const page = { size: BPAGE.size, margin: BPAGE.margin };
  // Belge dili: TR'de dil işareti EKLENMEZ (bugünkü çıktı birebir); EN'de w:lang = en-GB.
  const lang = tree.output?.docxStyles() ? { language: { value: tree.output.documentLang } } : {};
  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: t("docTitle", { title: plan.title || "" }).trim(),
    styles: { default: { document: { run: { font: "Calibri", ...lang } } } },
    sections: [
      { properties: { page }, children: cover },
      {
        properties: { page },
        headers: { default: bHeader(plan.title || t("planFallback"), t("headerBrand")) },
        // FA-16: sayfa altı kısa not + sayfa numarası.
        footers: { default: buildFooter(t("footerName"), { note: "beslenme", brandLine: expertFooterParagraph(tree.branding, { variant: tree.brandingVariant }), common }) },
        children: body,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return { ok: true, buffer, filename: planDocxFilename(plan, tree.output) };
}
