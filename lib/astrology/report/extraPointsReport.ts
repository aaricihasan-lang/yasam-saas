// Astroloji — EK NOKTALAR Word/PDF bölümü (SAF; yalnız kayıtlı snapshot; yeni hesap / sağlayıcı çağrısı YOK). 2026-10-22.
// report/model.ts bu modülü çağırır (paylaşılan dosyada yalnız birer satırlık ekleme). Ortalama / gerçek Lilith ayrı satır ve
// ayrı etiketle; Şans Noktası tek kaynak (lot tablosu) + natal tutarlılık sonucu; Zafer Noktası yöntem farkı açık notla.

import { formatDegree, HOUSE_SYSTEM_LABELS, SIGN_GLYPHS, SIGN_LABELS } from "../labels/tr";
import {
  ASTEROID_GLYPHS,
  ASTEROID_LABELS,
  CONSISTENCY_LABELS,
  EXTRA_NATAL_MISSING_NOTE,
  EXTRA_POINTS_METHOD_TEXT,
  EXTRA_SECTION_LABELS,
  FORTUNE_SINGLE_SOURCE_NOTE,
  LILITH_LABELS,
  LOT_LABELS,
  LOT_NONTRADITIONAL_NOTE,
  LOT_VICTORY_LOCAL_NOTE,
  LOT_VICTORY_NOTE,
  LOT_WITHHELD_CELL,
  LOTS_METHOD_TEXT,
  SECT_LABELS,
  fmtDiffDeg,
  lotFormulaText,
} from "../labels/extraPoints";
import { EXTRA_POINTS_INTERP_NOTE, EXTRA_SECTIONS, lotPositionWithheld, type AsteroidId, type ExtraSection, type LilithVariant, type LotId, type LotTerm } from "../model/westernExtraPoints";
import type { SignId } from "../model/western";

/** report/model.ts'teki blok oluşturucunun bu modülün kullandığı yüzü (yapısal). */
export type ExtraReportBuilder = {
  h(level: 1 | 2 | 3, text: string): void;
  p(text: string, tone?: "muted" | "warn"): void;
  kv(rows: [string, string][]): void;
  table(columns: string[], rows: string[][], opts?: { widths?: number[]; caption?: string; compact?: boolean; empty?: string }): void;
};

type O = Record<string, unknown>;
const DASH = "—";
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): O[] => (Array.isArray(v) ? (v.filter(isObj) as O[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const noVs = (x: string) => x.replace(/[︎️]/g, "");
const signL = (v: unknown) => (typeof v === "string" && v in SIGN_LABELS ? `${noVs(SIGN_GLYPHS[v as SignId])} ${SIGN_LABELS[v as SignId]}` : DASH);
const posL = (o: O) => (typeof o.sign === "string" && num(o.degreeInSign) !== null ? `${signL(o.sign)} ${formatDegree(num(o.degreeInSign)!)}` : DASH);
const lonL = (v: unknown) => (num(v) === null ? DASH : `${num(v)!.toFixed(4).replace(".", ",")}°`);
const houseL = (v: unknown) => (num(v) === null ? DASH : `${num(v)}. ev`);
const speedL = (v: unknown) => (num(v) === null ? DASH : `${num(v)!.toFixed(4).replace(".", ",")}°/gün`);
const latL = (v: unknown) => (num(v) === null ? DASH : `${num(v)!.toFixed(2).replace(".", ",")}°`);
const retroL = (v: unknown) => (v === true ? "Geri (℞)" : v === false ? "İleri" : DASH);
const hsL = (v: unknown) => (typeof v === "string" ? ((HOUSE_SYSTEM_LABELS as Record<string, string>)[v] ?? v) : DASH);

export function extraPointsReportSection(b: ExtraReportBuilder, t: O): void {
  const sections = (Array.isArray(t.sections) ? t.sections : []).filter((s): s is ExtraSection => (EXTRA_SECTIONS as readonly unknown[]).includes(s));
  b.kv([
    ["Seçilen bölümler", sections.length ? sections.map((s) => EXTRA_SECTION_LABELS[s]).join(" · ") : DASH],
    ["Ev sistemi (asteroit ve Lilith evleri)", hsL(t.houseSystem)],
    ["Zodyak", "Tropikal"],
  ]);
  b.p(EXTRA_POINTS_METHOD_TEXT, "muted");

  const missing = sections.filter((s) => !isObj(t[s]));
  if (missing.length) b.p(`Bu kayıtta gösterilmeyen bölüm: ${missing.map((s) => EXTRA_SECTION_LABELS[s]).join(", ")} (doğum saati bilinmiyor ya da bölüm hesaplanmadı).`, "warn");

  if (isObj(t.asteroids)) {
    b.h(3, "Asteroitler");
    const rows = arr(t.asteroids.bodies).map((x) => [`${ASTEROID_GLYPHS[x.id as AsteroidId] ?? ""} ${ASTEROID_LABELS[x.id as AsteroidId] ?? DASH}`.trim(), posL(x), lonL(x.longitude), latL(x.latitude), houseL(x.house), speedL(x.speed), retroL(x.retrograde)]);
    b.table(["Asteroit", "Burç ve derece", "Boylam", "Ekliptik enlem", "Ev", "Günlük hız", "Hareket"], rows, { widths: [14, 20, 13, 12, 9, 16, 12], compact: true, empty: "Asteroit verisi yok." });
  }

  if (isObj(t.lilith)) {
    b.h(3, "Kara Ay Lilith — ortalama ve gerçek (ayrı noktalar)");
    const rows = (["mean", "true"] as LilithVariant[])
      .map((v) => (isObj((t.lilith as O)[v]) ? ((t.lilith as O)[v] as O) : null))
      .filter((x): x is O => !!x)
      .map((x) => [LILITH_LABELS[x.variant as LilithVariant] ?? DASH, posL(x), lonL(x.longitude), latL(x.latitude), houseL(x.house), speedL(x.speed), retroL(x.retrograde)]);
    b.table(["Değişken", "Burç ve derece", "Boylam", "Ekliptik enlem", "Ev", "Günlük hız", "Hareket"], rows, { widths: [22, 18, 12, 11, 8, 16, 11], compact: true });
    const m = isObj(t.lilith.mean) ? num(t.lilith.mean.longitude) : null;
    const tr = isObj(t.lilith.true) ? num(t.lilith.true.longitude) : null;
    if (m !== null && tr !== null) {
      const d = Math.abs(((m - tr + 540) % 360) - 180);
      b.p(`Ortalama ile gerçek Lilith arasındaki fark: ${d.toFixed(2).replace(".", ",")}°. İki değer birbirinin yerine kullanılmaz.`, "muted");
    }
  }

  if (isObj(t.lots)) {
    b.h(3, "Hermetik lotlar");
    const sect = t.lots.sect === "day" || t.lots.sect === "night" ? t.lots.sect : null;
    b.kv([["Gündüz / gece", sect ? SECT_LABELS[sect] : DASH]]);
    const lots = arr(t.lots.lots);
    // Metodolojisi doğrulanmamış lotun burç/derecesi rapora yazılmaz (lotPositionWithheld; kayıtlı veri değişmez).
    const rows = lots.map((x) => {
      const held = lotPositionWithheld(x);
      return [
        LOT_LABELS[x.id as LotId] ?? DASH,
        held ? LOT_WITHHELD_CELL : posL(x),
        held ? DASH : lonL(x.longitude),
        typeof x.plus === "string" && typeof x.minus === "string" ? lotFormulaText({ plus: x.plus as LotTerm, minus: x.minus as LotTerm }) : DASH,
        isObj(x.localFrom) && !held ? "Paulus (yerel hesap) †" : x.traditional === true && !held ? "Paulus ile aynı" : x.traditional === false ? "Yöntem farkı *" : held ? "Doğrulanıyor *" : DASH,
      ];
    });
    b.table(["Lot", "Burç ve derece", "Boylam", "Kullanılan formül", "Gelenek"], rows, { widths: [24, 18, 12, 32, 14], compact: true });
    b.p(LOTS_METHOD_TEXT, "muted");
    const nonTrad = lots.filter((x) => lotPositionWithheld(x));
    if (nonTrad.some((x) => x.id === "victory")) b.p(`* ${LOT_VICTORY_NOTE}`, "warn");
    else if (nonTrad.length) b.p(`* ${LOT_NONTRADITIONAL_NOTE}`, "warn");
    if (lots.some((x) => isObj(x.localFrom) && !lotPositionWithheld(x))) b.p(`† ${LOT_VICTORY_LOCAL_NOTE}`, "muted");
    b.p(FORTUNE_SINGLE_SOURCE_NOTE, "muted");
  }

  const nc = isObj(t.natalCheck) ? t.natalCheck : null;
  if (sections.length && (isObj(t.lots) || isObj(t.lilith))) {
    b.h(3, "Natal harita ile tutarlılık");
    if (!nc) b.p(EXTRA_NATAL_MISSING_NOTE, "muted");
    else {
      const st = (x: unknown) => (isObj(x) && typeof x.status === "string" ? (CONSISTENCY_LABELS as Record<string, string>)[x.status] ?? DASH : DASH);
      const rows: [string, string][] = [];
      if (isObj(t.lilith) && isObj(nc.meanLilith)) rows.push(["Ortalama Lilith ↔ natal Kara Ay Lilith", `${st(nc.meanLilith)} (fark ${fmtDiffDeg(num(nc.meanLilith.diffDeg))})`]);
      if (isObj(t.lots) && isObj(nc.fortune)) {
        const ls = nc.fortune.lotSect === "day" ? "gündüz" : nc.fortune.lotSect === "night" ? "gece" : DASH;
        const ns = nc.fortune.natalSect === "day" ? "gündüz" : nc.fortune.natalSect === "night" ? "gece" : DASH;
        rows.push(["Şans Noktası ↔ natal Şans Noktası", `${st(nc.fortune)} (fark ${fmtDiffDeg(num(nc.fortune.diffDeg))}; lot: ${ls}, natal: ${ns})`]);
      }
      if (isObj(t.lots) && isObj(nc.lotFormulas)) rows.push(["Yedi lotun natal Yükselen ve gezegenlerden aritmetik denetimi", `${st(nc.lotFormulas)} (en büyük fark ${fmtDiffDeg(num(nc.lotFormulas.maxDiffDeg))})`]);
      b.kv(rows);
    }
  }
}

/** Sistem Yorumu (yalnız yorum görünürken çağrılır). Metinler AYNEN; boş metin üretilmez. */
export function extraPointsInterpBlocks(b: ExtraReportBuilder, c: O): void {
  b.p(EXTRA_POINTS_INTERP_NOTE, "muted");
  const para = (label: string, text: unknown) => {
    if (typeof text === "string" && text.trim()) {
      b.h(3, label);
      b.p(text);
    }
  };
  if (isObj(c.asteroids)) for (const x of arr(c.asteroids.items)) para(ASTEROID_LABELS[x.id as AsteroidId] ?? DASH, x.text);
  if (isObj(c.lilith))
    for (const x of arr(c.lilith.items)) {
      para(LILITH_LABELS[x.variant as LilithVariant] ?? DASH, x.text);
      if (typeof x.note === "string" && x.note.trim()) b.p(x.note, "muted");
    }
  // Gizlenen lotun açıklaması burcunu söyler ("… burcuna düşer") → o da yazılmaz.
  if (isObj(c.lots)) for (const x of arr(c.lots.items)) if (!lotPositionWithheld({ id: x.id })) para(LOT_LABELS[x.id as LotId] ?? DASH, x.text);
}
