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
};

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
function fmtItemEnergy(it: PlanDocxItem): string {
  const e = itemEnergy(it);
  return e == null ? "Kalori girilmemiş" : fmtKcal(e);
}

/** Toplam enerji: eksik kalem varsa "≥ X kcal (N kalemde enerji verisi eksik)". */
function fmtEnergyWithCoverage(known: number, missing: number): string {
  if (missing <= 0) return fmtKcal(known);
  return `≥ ${fmtKcal(known)} (${missing} kalemde enerji verisi eksik)`;
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

  // ── KAPAK (ayrı bölüm; üst/alt bilgi yok) ───────────────────────────────────
  const range = `${fmtDateTr(plan.start_date)} – ${fmtDateTr(plan.end_date)}`;
  const cover: ReportChild[] = bCover({
    logo: tree.logo ?? null,
    planTitle: plan.title || "Beslenme Planı",
    range,
    meta: [
      // Danışan adı (FAZ 7) — yalnız bağlıysa; export anındaki current ad, PII snapshot YOK (§34).
      ...(tree.recipientName ? [["Danışan", tree.recipientName] as [string, string]] : []),
      ["Durum", `${statusLabel(plan.status)} · Revizyon V${rev}`],
      ["Günlük Enerji Hedefi", target != null ? fmtKcal(target) : ""],
      ["Plan Süresi", `${days.length} gün kaydı`],
      ["Uzman", tree.expertName?.trim() ?? ""],
    ],
  });

  // Kısa amaç satırı (danışan verisi YOK; geleneksel/mizaç YOK). Sayfa sonu ZORLANMAZ.
  const body: ReportChild[] = [
    bMuted(
      "Bu belge, plan içindeki öğün ve besinlerin donmuş kayıt (snapshot) değerlerinden üretilmiş " +
        "profesyonel beslenme planı özetidir. Enerji ve makro değerleri, kayıt anındaki besin değerlerine dayanır.",
    ),
  ];
  if (plan.note && plan.note.trim()) {
    body.push(bMealTitle("Plan Notu"), bText(plan.note.trim()));
  }

  // ── GÜNLER (doğal akış: gün yeni sayfaya ZORLANMAZ; başlık içeriğinden kopmaz) ──
  const COLUMNS = [
    { header: "Besin", pct: 46 },
    { header: "Miktar", pct: 24 },
    { header: "Gram", pct: 15, align: "right" as const },
    { header: "Enerji", pct: 15, align: "right" as const },
  ];

  days.forEach((day) => {
    const dTarget = effectiveDailyTarget(day.energy_target_override, plan.daily_energy_target);
    body.push(bDayTitle(fmtDateTr(day.plan_date), dTarget != null ? `Günlük enerji hedefi: ${fmtKcal(dTarget)}` : null));
    if (day.note && day.note.trim()) body.push(bText(day.note.trim(), { keepNext: true }));

    const meals = [...day.meals].sort((a, b) => a.sort_order - b.sort_order);
    let hasAnyItem = false;
    for (const meal of meals) {
      body.push(bMealTitle(meal.label || "Öğün"));
      const items = [...meal.items].sort((a, b) => a.sort_order - b.sort_order);
      if (items.length === 0) {
        body.push(bMuted("Bu öğüne besin eklenmemiş.", { keepNext: true }));
        continue;
      }
      hasAnyItem = true;
      const rows = items.map((it) => {
        // Miktar: ortak SAF formatter (web ile aynı contract). "su bardağı" gibi ithal ölçü
        // veya güvenle normalize edilemeyen hâl → "—" (gram kolonu authoritative kalır).
        const miktar =
          formatPortionLabel({ quantity: it.quantity, portionLabel: it.portion_label_snapshot }) ??
          "—";
        return [it.food_name_snapshot || "—", miktar, fmtGram(it.grams), fmtItemEnergy(it)];
      });
      body.push(bDataTable(COLUMNS, rows));
    }

    if (!hasAnyItem && meals.length === 0) {
      body.push(bMuted("Bu güne öğün eklenmemiş.", { keepNext: true }));
    }

    // Günlük toplamlar (tek satırlık şerit; değerler eskisiyle BİREBİR).
    const t = dayTotals(day);
    body.push(bGap(100));
    body.push(bStripTable([
      { label: "Gün Toplamı — Enerji", value: fmtEnergyWithCoverage(t.energy, t.energyMissing) },
      { label: "Protein", value: fmtGram(t.protein) },
      { label: "Karbonhidrat", value: fmtGram(t.carbohydrate) },
      { label: "Yağ", value: fmtGram(t.total_fat) },
      { label: "Lif", value: fmtGram(t.fiber) },
    ]));
    body.push(bGap(120));
  });

  // ── PLAN GENEL ÖZETİ (yeni sayfaya ZORLANMAZ) ────────────────────────────────
  const contentDays = days.filter((d) => itemsOfDay(d).length > 0);
  const planDayCount = days.length;
  const contentDayCount = contentDays.length;

  const acc = contentDays.reduce(
    (s, d) => {
      const t = dayTotals(d);
      s.energy += t.energy; s.protein += t.protein; s.carbohydrate += t.carbohydrate;
      s.total_fat += t.total_fat; s.fiber += t.fiber; s.energyMissing += t.energyMissing;
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
    ["Plan Süresi (gün kaydı)", String(planDayCount)],
    ["İçerikli Gün Sayısı", String(contentDayCount)],
    ["Günlük Enerji Hedefi", target != null ? fmtKcal(target) : "—"],
    ["Ortalama Günlük Enerji", contentDayCount ? (acc.energyMissing > 0 ? `≥ ${fmtKcal(avgEnergy)}` : fmtKcal(avgEnergy)) : "—"],
    ["Hedefe Göre Fark", delta != null && contentDayCount ? `${delta >= 0 ? "+" : "−"}${fmtKcal(Math.abs(delta))}` : "—"],
    ["Ortalama Protein", contentDayCount ? fmtGram(avgProtein) : "—"],
    ["Ortalama Karbonhidrat", contentDayCount ? fmtGram(avgCarb) : "—"],
    ["Ortalama Yağ", contentDayCount ? fmtGram(avgFat) : "—"],
    ["Ortalama Lif", contentDayCount ? fmtGram(avgFiber) : "—"],
    ...(acc.energyMissing > 0
      ? ([["Enerji Verisi Eksik Kalem", `${acc.energyMissing} kalem (toplamlara dahil edilmedi)`]] as [string, string][])
      : []),
  ];

  body.push(
    bSectionTitle("Plan Genel Özeti"),
    bKvTable(summaryRows),
    bMuted("Ortalamalar yalnız en az bir besin içeren günler üzerinden hesaplanır."),
    // FA-16: rapor sonu sade "Bilgilendirme" (+ Hazırlayan) — bölünmeyen tek blok.
    ...bWellness(wellnessNote("beslenme").full, tree.expertName),
  );

  const page = { size: BPAGE.size, margin: BPAGE.margin };
  const doc = new Document({
    creator: "Yaşam Sistemi",
    title: `Beslenme Planı — ${plan.title || ""}`.trim(),
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [
      { properties: { page }, children: cover },
      {
        properties: { page },
        headers: { default: bHeader(plan.title || "Beslenme Planı") },
        // FA-16: sayfa altı kısa not + sayfa numarası.
        footers: { default: buildFooter("Beslenme Planı · Yaşam Sistemi", { note: "beslenme" }) },
        children: body,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return { ok: true, buffer, filename: planDocxFilename(plan) };
}
