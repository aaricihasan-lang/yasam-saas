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
 */

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  buildPremiumCover,
  buildFooter,
  twoColTable,
  h2,
  h3,
  bodyText,
  muted,
  spacer,
  repeatingHeaderTable,
  REPORT_FONT,
  C_DARK,
  C_MID,
  C_LIGHT,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import {
  sumNutrients,
  itemNutrientContribution,
  effectiveDailyTarget,
  daysBetween,
  type ItemNutrientSnapshot,
} from "@/lib/beslenme/planContracts";

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

export type PlanDocxTree = { plan: PlanDocxPlan; days: PlanDocxDay[]; recipientName?: string | null };

export type PlanDocxError = { code: string; status: number };
export type PlanDocxOk = { ok: true; buffer: Buffer; filename: string };
export type PlanDocxResult = PlanDocxOk | { ok: false; error: PlanDocxError };

// ── Boyut sınırları (abuse + wall-clock koruması) ──────────────────────────────
export const MAX_PLAN_DAY_SPAN = 366; // ≤ 1 yıl + artık gün
export const MAX_PLAN_ITEMS = 3000;

// ── Görüntüleme yardımcıları (yuvarlama YALNIZ display; §15/§37) ───────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  active: "Aktif",
  archived: "Arşiv",
};
function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s;
}

/** TR sayı biçimi (yuvarlanmış; ham değer korunur, yalnız gösterim). */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("tr-TR");
}
function fmtKcal(n: number): string {
  return `${fmtNum(n)} kcal`;
}
function fmtGram(n: number): string {
  return `${fmtNum(n)} g`;
}

/** ISO tarih → TR uzun tarih (ör. "3 Mart 2026"). Geçersizse ham string. */
function fmtDateTr(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

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

/** Beslenme-Plani_<slug>_<start>_<end>_V<revision>.docx (ASCII-only, injection-safe). */
export function planDocxFilename(plan: PlanDocxPlan): string {
  const slug = slugifyPlanTitle(plan.title) || "plan";
  const safe = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "");
  const rev = Number.isFinite(plan.revision_number as number) ? Number(plan.revision_number) : 1;
  return `Beslenme-Plani_${slug}_${safe(plan.start_date)}_${safe(plan.end_date)}_V${rev}.docx`;
}

// ── Gün toplamı (tüm öğün item'ları; HAM accumulator) ──────────────────────────

type DayTotals = { energy: number; protein: number; carbohydrate: number; total_fat: number; fiber: number };

function itemsOfDay(day: PlanDocxDay): Array<{ grams: number; nutrients: ItemNutrientSnapshot[] }> {
  const out: Array<{ grams: number; nutrients: ItemNutrientSnapshot[] }> = [];
  for (const m of day.meals) for (const it of m.items) out.push({ grams: it.grams, nutrients: it.nutrients });
  return out;
}

function codeAmount(totals: { nutrient_code: string; amount: number }[], code: string): number {
  return totals.find((t) => t.nutrient_code === code)?.amount ?? 0;
}

function dayTotals(day: PlanDocxDay): DayTotals {
  const t = sumNutrients(itemsOfDay(day));
  return {
    energy: codeAmount(t, "energy"),
    protein: codeAmount(t, "protein"),
    carbohydrate: codeAmount(t, "carbohydrate"),
    total_fat: codeAmount(t, "total_fat"),
    fiber: codeAmount(t, "fiber"),
  };
}

/** Item enerji katkısı (snapshot energy amount üzerinden). Yoksa 0. */
function itemEnergy(it: PlanDocxItem): number {
  const e = it.nutrients.find((n) => n.nutrient_code === "energy")?.amount ?? 0;
  return itemNutrientContribution(it.grams, e);
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
  const days = [...tree.days].sort((a, b) => a.plan_date.localeCompare(b.plan_date));

  const target = effectiveDailyTarget(null, plan.daily_energy_target);
  const rev = Number.isFinite(plan.revision_number as number) ? Number(plan.revision_number) : 1;

  // ── KAPAK ────────────────────────────────────────────────────────────────────
  const range = `${fmtDateTr(plan.start_date)} – ${fmtDateTr(plan.end_date)}`;
  const cover: ReportChild[] = buildPremiumCover({
    title1: "YAŞAM SİSTEMİ",
    title2: "BESLENME PLANI",
    subtitle: plan.title || "Beslenme Planı",
    date: range,
    stats: [
      // Danışan adı (FAZ 7) — yalnız bağlıysa; export anındaki current ad, PII snapshot YOK (§34).
      ...(tree.recipientName ? [{ label: "Danışan", value: tree.recipientName }] : []),
      { label: "Durum", value: statusLabel(plan.status) },
      { label: "Revizyon", value: `V${rev}` },
      { label: "Günlük Enerji Hedefi", value: target != null ? fmtKcal(target) : "—" },
      { label: "Plan Süresi", value: `${days.length} gün kaydı` },
    ],
  });

  // Kısa amaç satırı (danışan verisi YOK; geleneksel/mizaç YOK).
  const purpose: ReportChild[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      pageBreakBefore: true,
      children: [new TextRun({
        text: "Bu belge, plan içindeki öğün ve besinlerin donmuş kayıt (snapshot) değerlerinden üretilmiş " +
          "profesyonel beslenme planı özetidir. Enerji ve makro değerleri, kayıt anındaki besin değerlerine dayanır.",
        size: 22, font: REPORT_FONT, color: C_MID,
      })],
      spacing: { after: 200 },
    }),
  ];
  if (plan.note && plan.note.trim()) {
    purpose.push(bodyText(plan.note.trim()));
  }

  // ── GÜNLER ───────────────────────────────────────────────────────────────────
  const body: ReportChild[] = [];
  const HEADERS = ["Besin", "Miktar", "Gram", "Enerji"];
  const WIDTHS = [46, 24, 15, 15];

  days.forEach((day, di) => {
    // Her gün yeni sayfadan (uzun planlar okunur kalsın).
    body.push(h2(fmtDateTr(day.plan_date), { pageBreakBefore: di > 0, keepNext: true }));
    const dTarget = effectiveDailyTarget(day.energy_target_override, plan.daily_energy_target);
    if (dTarget != null) body.push(muted(`Günlük enerji hedefi: ${fmtKcal(dTarget)}`));
    if (day.note && day.note.trim()) body.push(bodyText(day.note.trim()));

    const meals = [...day.meals].sort((a, b) => a.sort_order - b.sort_order);
    let hasAnyItem = false;
    for (const meal of meals) {
      body.push(h3(meal.label || "Öğün", { keepNext: true }));
      const items = [...meal.items].sort((a, b) => a.sort_order - b.sort_order);
      if (items.length === 0) {
        body.push(muted("Bu öğüne besin eklenmemiş."));
        continue;
      }
      hasAnyItem = true;
      const rows = items.map((it) => {
        const miktar = it.portion_label_snapshot
          ? `${fmtNum(it.quantity ?? 1)} × ${it.portion_label_snapshot}`
          : "—";
        return [it.food_name_snapshot || "—", miktar, fmtGram(it.grams), fmtKcal(itemEnergy(it))];
      });
      body.push(...repeatingHeaderTable(HEADERS, WIDTHS, rows));
    }

    if (!hasAnyItem && meals.length === 0) {
      body.push(muted("Bu güne öğün eklenmemiş."));
    }

    // Günlük toplamlar satırı.
    const t = dayTotals(day);
    body.push(spacer());
    body.push(twoColTable([
      ["Gün Toplamı — Enerji", fmtKcal(t.energy)],
      ["Protein", fmtGram(t.protein)],
      ["Karbonhidrat", fmtGram(t.carbohydrate)],
      ["Yağ", fmtGram(t.total_fat)],
      ["Lif", fmtGram(t.fiber)],
    ]));
  });

  // ── PLAN GENEL ÖZETİ ─────────────────────────────────────────────────────────
  const contentDays = days.filter((d) => itemsOfDay(d).length > 0);
  const planDayCount = days.length;
  const contentDayCount = contentDays.length;

  const acc = contentDays.reduce(
    (s, d) => {
      const t = dayTotals(d);
      s.energy += t.energy; s.protein += t.protein; s.carbohydrate += t.carbohydrate;
      s.total_fat += t.total_fat; s.fiber += t.fiber;
      return s;
    },
    { energy: 0, protein: 0, carbohydrate: 0, total_fat: 0, fiber: 0 },
  );
  const denom = contentDayCount || 1;
  const avgEnergy = acc.energy / denom;
  const avgProtein = acc.protein / denom;
  const avgCarb = acc.carbohydrate / denom;
  const avgFat = acc.total_fat / denom;
  const avgFiber = acc.fiber / denom;
  const delta = target != null ? avgEnergy - target : null;

  const summaryRows: [string, string][] = [
    ["Plan Süresi (gün kaydı)", String(planDayCount)],
    ["İçerikli Gün Sayısı", String(contentDayCount)],
    ["Günlük Enerji Hedefi", target != null ? fmtKcal(target) : "—"],
    ["Ortalama Günlük Enerji", contentDayCount ? fmtKcal(avgEnergy) : "—"],
    ["Hedefe Göre Fark", delta != null && contentDayCount ? `${delta >= 0 ? "+" : "−"}${fmtKcal(Math.abs(delta))}` : "—"],
    ["Ortalama Protein", contentDayCount ? fmtGram(avgProtein) : "—"],
    ["Ortalama Karbonhidrat", contentDayCount ? fmtGram(avgCarb) : "—"],
    ["Ortalama Yağ", contentDayCount ? fmtGram(avgFat) : "—"],
    ["Ortalama Lif", contentDayCount ? fmtGram(avgFiber) : "—"],
  ];

  const summary: ReportChild[] = [
    new Paragraph({
      pageBreakBefore: true,
      children: [new TextRun({ text: "Plan Genel Özeti", bold: true, size: 32, font: REPORT_FONT, color: C_DARK })],
      spacing: { before: 200, after: 300 },
    }),
    twoColTable(summaryRows),
    new Paragraph({
      children: [new TextRun({
        text: "Ortalamalar yalnız en az bir besin içeren günler üzerinden hesaplanır.",
        size: 18, font: REPORT_FONT, color: C_LIGHT, italics: true,
      })],
      spacing: { before: 240, after: 0 },
    }),
  ];

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Beslenme Planı · Yaşam Sistemi") },
      children: [...cover, ...purpose, ...body, ...summary],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { ok: true, buffer, filename: planDocxFilename(plan) };
}
