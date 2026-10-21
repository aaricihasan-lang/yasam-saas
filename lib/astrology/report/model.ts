// Astroloji Aşama 8 — Kayıtlı analiz RAPOR MODELİ (SAF; Word ve PDF aynı modelden üretilir).
//
// Girdi YALNIZ `getAnalysis` yanıtının `analysis` gövdesidir: yetki / tenant / uzman / Roxy yorum kapısı
// orada uygulanmıştır (yorum yetkisi yoksa yorum kolonu DB'den okunmaz bile). Bu modül:
//   • yeni hesap YAPMAZ, sağlayıcı çağırmaz; yalnız kayıtlı snapshot'ı okunur tablolara çevirir,
//   • tekniğe özgü bölümler üretir (KP'de KP alanları, Vedik'te Vedik alanları),
//   • eksik alanı "—" ile gösterir; "undefined"/"null"/"[object Object]"/ham JSON asla çıkmaz,
//   • Roxy yorum bölümünü yalnız `interpretation.visible === true` ise kurar.

import { ASPECT_GLYPHS, BODY_GLYPHS, SIGN_GLYPHS, BODY_LABELS, ASPECT_LABELS, DIGNITY_LABELS, ELEMENT_LABELS, HOUSE_SYSTEM_LABELS, MODALITY_LABELS, NATURE_LABELS, NODE_TYPE_LABELS, PATTERN_LABELS, SIGN_LABELS, formatDegree } from "../labels/tr";
import { SIGN_IDS, type SignId } from "../model/western";
import { GRAHA_LABELS, KARANA_LABELS, NAKSHATRA_LABELS, VEDIC_YOGA_NAMES } from "../topics/vedic";
import { KP_NODE_SIG_METHODS, KP_NODE_SIG_SOURCE, KP_RULING_METHOD_NOTE, KP_RULING_SIG_NOTE, type KpNodeSigMethodId } from "../model/kp";
import { WHEEL_LEGEND } from "./wheelSvg";
import { bayerBoth, FIXED_STAR_CATALOG, FIXED_STAR_FAR_LAT, fixedStarName, fixedStarNatureLabel, starKeywordTr } from "../labels/fixedStars";
import { FIXED_STAR_ORB_QUERY, fixedStarOrbOf } from "../model/westernFixedStars";
import { PROFECTIONS_INTERP_MISSING, PROFECTIONS_INTERP_NOTE } from "../model/westernProfections";
import { describeOptions, techniqueLabel as uiTechniqueLabel, zodiacLabel } from "@/app/admin/astroloji/_lib/techniques";
import { KP_DASHA_TECHNICAL_SCHEMA, VEDIC_D1_TECHNICAL_SCHEMA, VEDIC_DASHA_TECHNICAL_SCHEMA, VEDIC_YOGA_FAMILY_LABELS, VEDIC_SHADBALA_TECHNICAL_SCHEMA, VEDIC_TRANSIT_TECHNICAL_SCHEMA, VEDIC_VARGA_TECHNICAL_SCHEMA, VIMSHOTTARI_YEARS, type VedicD1Technical, type VedicGrahaId, type VedicTransitTechnical, type VedicVargaTechnical } from "../model/vedic";
import { KP_CHART_TECHNICAL_SCHEMA, KP_HORARY_TECHNICAL_SCHEMA, KP_TRANSIT_TECHNICAL_SCHEMA, type KpChartTechnical, type KpHoraryTechnical, type KpTransitTechnical } from "../model/kp";
import { kundliTitles, toKundliData, toVargaChartData } from "@/app/admin/astroloji/_lib/kundliData";
import { kundliLegend } from "@/app/admin/astroloji/_lib/kundliLocalize";
import { localSpaceCenter, localSpaceCenterNote, localSpaceText } from "../localSpaceCenter";
import { interpretationKindNote, interpretationKindOfSchema } from "../interpretationKind";
import { KP_LEGEND, KP_TRANSIT_LEGEND } from "@/app/admin/astroloji/_lib/kpChart";
import { kpSplitFromLabel } from "../verify/kpSub";
// TRANSİT-03: KP zaman aralığı şeması (ayrı satır: TRANSİT-01/02 import değişiklikleriyle birleştirme çakışması olmasın).
import { KP_PROVIDER_CORRECTION_NOTE, KP_TIMING_TECHNICAL_SCHEMA } from "../model/kp";
import { KP_HORARY_TEXT, kpCuspSublordRows, kpHoraryLagnaContrast } from "../view/kpHorary";
import { NO_PROVIDER_INTERPRETATION_NOTE, hasNoProviderInterpretation } from "../noProviderInterp";
import { figureTitle, type ReportFigure } from "./figures";
import { GOCHARA_STRIP_LEGEND, GOCHARA_SUMMARY_NOTE, GOCHARA_TERMS, gocharaSummary } from "../gocharaSummary";
import { ACG_ANGLES, BODY_COLORS, CLASSICAL, acgMapLines, acgMcLabels, localSpaceMapLines } from "@/app/admin/astroloji/_lib/locationMaps";
import { ACG_TECHNICAL_SCHEMA, LOCAL_SPACE_TECHNICAL_SCHEMA, type AstrocartographyTechnical, type LocalSpaceTechnical } from "../model/westernLocation";
import type { BodyId } from "../model/western";
import type { TransitAspect, TransitCalendarExact } from "../model/westernTiming";
import { LEGACY_METHOD_LEAD } from "../legacyMethodText";
import { representativeLmtNotice } from "../birth/representativeLmt";
import {
  CALENDAR_UNMATCHED_NOTE,
  NATAL_HOUSE_NOTE,
  SIGNIFICANCE_BAND_LABELS,
  SIGNIFICANCE_NOTE,
  aspectTypeCounts,
  exactTimesOf,
  formatInZone,
  groupEventsByDay,
  horaryDisplayZone,
  isIanaZone,
  questionMomentLabel,
  relativeTo,
  significanceBand,
  strongestTransits,
  transitNatalHouses,
} from "../transitDetail";

// ─── Blok modeli ─────────────────────────────────────────────────────────────

export type ReportTable = { columns: string[]; rows: string[][]; /** göreli sütun genişlikleri */ widths?: number[]; compact?: boolean };
export type ReportBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "para"; text: string; tone?: "muted" | "warn" }
  | { kind: "kv"; rows: [string, string][] }
  | { kind: "table"; table: ReportTable; caption?: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "chart"; chart: WheelInput; caption: string }
  /** 2026-10-15: Vedik D1 / Varga / KP haritası (ekrandaki çizimle aynı kaynak; bkz. figures.ts). Word ve PDF aynı PNG'yi alır. */
  | { kind: "chart"; figure: ReportFigure; caption: string }
  /** Toplu raporda her analiz yeni sayfada başlar (tekli raporda kullanılmaz). */
  | { kind: "pagebreak" };

/** Natal çark çizimi için yalnız kayıtlı teknik veriden alınan en küçük biçim. */
export type WheelInput = {
  bodies: { id: string; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean }[];
  houses: { number: number; longitude: number; sign: SignId; degreeInSign: number }[];
  angles: { ascendant: { longitude: number }; midheaven: { longitude: number } } | null;
  aspects: { a: string; b: string; type: string; nature: string | null }[];
  /**
   * 2026-10-12 (UAT 2. tur, madde L): çift halka (Transit: dış halka transit; Sinastri: dış halka 1. kişi). Yalnız
   * kayıtlı veriden; yoksa tek halka çizilir.
   */
  outer?: { bodies: { id: string; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean }[] } | null;
  /**
   * 2026-10-15: çift halkada iki halka ARASI açılar (Transit: transit → natal; Sinastri: 1. kişi → 2. kişi). Uygulamadaki
   * Roxy çift halka bileşenleriyle aynı veri: kayıtlı teknik katmanın açı listesi (yeni hesap YOK). outer = dış halka gövdesi,
   * inner = iç halka gövdesi. Natal ASC/MC hedefli transit açıları çizilmez (uygulamayla aynı; tabloda kalır).
   */
  crossAspects?: { outer: string; inner: string; type: string; nature: string | null }[];
};

export type AstroReport = {
  title: string;
  /** Kapak alt satırları */
  cover: { client: string; analysisDate: string; tradition: string; technique: string; options: string; /** Kapak tarih etiketi (varsayılan "Analiz tarihi"; toplu raporda "Rapor tarihi"). */ dateLabel?: string };
  blocks: ReportBlock[];
  /** Dosya adı kökü (uzantısız, ASCII güvenli) */
  fileBase: string;
  hasInterpretation: boolean;
  hasChart: boolean;
};

// ─── Güvenli biçimleme ───────────────────────────────────────────────────────

const DASH = "—";
type O = Record<string, unknown>;
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T = O>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Metin: yalnız string/number/boolean; nesne ve null → "—" (asla "[object Object]"). */
export function s(v: unknown): string {
  if (typeof v === "string") return v.trim() === "" ? DASH : v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : DASH;
  if (typeof v === "boolean") return v ? "Evet" : "Hayır";
  return DASH;
}
const fix = (v: unknown, d = 2) => {
  const n = num(v);
  return n === null ? DASH : n.toFixed(d).replace(".", ",");
};
const yesNo = (v: unknown) => (v === true ? "Evet" : v === false ? "Hayır" : DASH);
const deg = (v: unknown) => {
  const n = num(v);
  return n === null ? DASH : formatDegree(n);
};
// 2026-10-14 owner kararı: sembol + Türkçe karşılık BİRLİKTE ("☉ Güneş", "♌ Aslan", "☌ Kavuşum"). Görünüm seçicisi (VS15)
// rapora yazılmaz; glifler PDF'te sembol yedek yazı tipiyle, Word'de gömülü yazı tipiyle çizilir (symbolFonts.ts).
const noVs = (x: string) => x.replace(/[\uFE0E\uFE0F]/g, "");
const signG = (id: string) => ((SIGN_GLYPHS as Record<string, string>)[id] ? `${noVs((SIGN_GLYPHS as Record<string, string>)[id])} ` : "");
const bodyG = (id: string) => ((BODY_GLYPHS as Record<string, string>)[id] ? `${noVs((BODY_GLYPHS as Record<string, string>)[id])} ` : "");
const signL = (v: unknown) => (typeof v === "string" && v in SIGN_LABELS ? `${signG(v)}${SIGN_LABELS[v as SignId]}` : s(v));
/** Burç + burç içi derece */
const pos = (sign: unknown, d: unknown) => (typeof sign === "string" && num(d) !== null ? `${signL(sign)} ${formatDegree(num(d)!)}` : DASH);
/** Mutlak ekliptik boylam → "Burç 12°34′" */
const lonPos = (v: unknown) => {
  const n = num(v);
  if (n === null) return DASH;
  const l = ((n % 360) + 360) % 360;
  return `${signL(SIGN_IDS[Math.floor(l / 30) % 12])} ${formatDegree(l % 30)}`;
};
const ANGLE_LABELS: Record<string, string> = { ascendant: "Yükselen (ASC)", midheaven: "Tepe Noktası (MC)" };
const bodyL = (v: unknown) => (typeof v === "string" ? ((BODY_LABELS as Record<string, string>)[v] ? `${bodyG(v)}${(BODY_LABELS as Record<string, string>)[v]}` : (ANGLE_LABELS[v] ?? v)) : DASH);
/** Vedik graha: aynı gezegen glifi + Vedik ad (Rahu ☊ / Ketu ☋). */
const GRAHA_GLYPH_ID: Record<string, string> = { rahu: "north_node", ketu: "south_node" };
const grahaL = (v: unknown) => (typeof v === "string" ? (v === "lagna" ? "Lagna" : `${bodyG(GRAHA_GLYPH_ID[v] ?? v)}${GRAHA_LABELS[v] ?? v}`) : DASH);
const aspectL = (v: unknown) => (typeof v === "string" ? ((ASPECT_LABELS as Record<string, string>)[v] ? `${(ASPECT_GLYPHS as Record<string, string>)[v] ?? ""} ${(ASPECT_LABELS as Record<string, string>)[v]}`.trim() : v) : DASH);
const natureL = (v: unknown) => (typeof v === "string" ? ((NATURE_LABELS as Record<string, string>)[v] ?? v) : DASH);
const nakL = (v: unknown) => (typeof v === "string" ? (NAKSHATRA_LABELS[v] ?? v) : DASH);
const houseL = (v: unknown) => (num(v) === null ? DASH : `${num(v)}. ev`);
const list = (v: unknown, f: (x: unknown) => string = s) => {
  const a = arr<unknown>(v);
  return a.length ? a.map(f).join(", ") : DASH;
};
/** "YYYY-MM-DD…" → "GG.AA.YYYY" */
export function dateTr(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return DASH;
  return `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}`;
}
/**
 * 9B-P2-02: ANLIK zaman damgası (ISO UTC, ör. analysis_at) → Türkiye takvim günü / saati (Europe/Istanbul).
 * Kayıt tarihi, kapak ve dosya adı bununla yazılır; DB'deki UTC değer değişmez. (00:00–03:00 TR arasında
 * kaydedilen analiz artık bir önceki günü göstermez.)
 */
const TR_PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function trParts(v: unknown): Record<string, string> | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  return Object.fromEntries(TR_PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
}
/** ISO anı → "GG.AA.YYYY" (Türkiye saati). */
export function instantDateTr(v: unknown): string {
  const p = trParts(v);
  return p ? `${p.day}.${p.month}.${p.year}` : DASH;
}
/** ISO anı → "YYYY-MM-DD" (Türkiye takvim günü; dosya adı için). */
export function instantDayKeyTr(v: unknown): string | null {
  const p = trParts(v);
  return p ? `${p.year}-${p.month}-${p.day}` : null;
}
/** ISO anı → "GG.AA.YYYY SS:DD (TSİ)". */
const instantTr = (v: unknown) => {
  const p = trParts(v);
  return p ? `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute} (TSİ)` : DASH;
};
/** ISO UTC → "GG.AA.YYYY SS:DD UTC" */
const utcTr = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? `${dateTr(v)} ${v.slice(11, 16)} UTC` : dateTr(v));
/** Ofsetsiz yerel "YYYY-MM-DDTHH:MM…" → "GG.AA.YYYY SS:DD" */
const localTr = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? `${dateTr(v)} ${v.slice(11, 16)}` : dateTr(v));
const coord = (lat: unknown, lon: unknown) =>
  num(lat) === null || num(lon) === null ? DASH : `${Math.abs(num(lat)!).toFixed(4).replace(".", ",")}° ${num(lat)! >= 0 ? "K" : "G"}, ${Math.abs(num(lon)!).toFixed(4).replace(".", ",")}° ${num(lon)! >= 0 ? "D" : "B"}`;
const offset = (h: unknown) => {
  const n = num(h);
  if (n === null) return DASH;
  const sign = n >= 0 ? "+" : "−";
  const a = Math.abs(n);
  return `UTC${sign}${String(Math.floor(a)).padStart(2, "0")}:${String(Math.round((a % 1) * 60)).padStart(2, "0")}`;
};

const TRADITION_LABEL: Record<string, string> = { western: "Batı Astrolojisi", vedic: "Vedik / Jyotish", kp: "KP (Krishnamurti Paddhati)" };
const traditionOf = (t: string) => (t.startsWith("vedic.") ? "vedic" : t.startsWith("kp.") ? "kp" : "western");
const AYANAMSA_LABEL: Record<string, string> = { lahiri: "Lahiri (Chitrapaksha)", raman: "B.V. Raman", "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };
const ayL = (v: unknown) => (typeof v === "string" ? (AYANAMSA_LABEL[v] ?? v) : DASH);
const hsL = (v: unknown) => (v === "whole_sign" ? "Bütün-burç (rashi chakra)" : typeof v === "string" ? ((HOUSE_SYSTEM_LABELS as Record<string, string>)[v] ?? v) : DASH);
const SIGN_ABBR = ["Koç", "Boğ", "İki", "Yen", "Asl", "Baş", "Ter", "Akr", "Yay", "Oğl", "Kov", "Bal"];

// ─── Blok yardımcıları ───────────────────────────────────────────────────────

class B {
  blocks: ReportBlock[] = [];
  h(level: 1 | 2 | 3, text: string) {
    this.blocks.push({ kind: "heading", level, text });
  }
  p(text: string, tone?: "muted" | "warn") {
    if (text.trim()) this.blocks.push({ kind: "para", text, tone });
  }
  kv(rows: [string, string][]) {
    const r = rows.filter(([, v]) => v !== DASH);
    if (r.length) this.blocks.push({ kind: "kv", rows: r });
  }
  table(columns: string[], rows: string[][], opts: { widths?: number[]; caption?: string; compact?: boolean; empty?: string } = {}) {
    if (!rows.length) {
      if (opts.empty) this.p(opts.empty, "muted");
      return;
    }
    this.blocks.push({ kind: "table", table: { columns, rows, widths: opts.widths, compact: opts.compact }, caption: opts.caption });
  }
  bullets(items: string[]) {
    const i = items.filter((x) => x.trim());
    if (i.length) this.blocks.push({ kind: "bullets", items: i });
  }
}

// ─── Batı ────────────────────────────────────────────────────────────────────

function bodyTable(b: B, title: string, bodies: unknown, opts: { dignity?: boolean; houseInOther?: string } = {}) {
  const rows = arr(bodies).map((x) => {
    const r = [bodyL(x.id), pos(x.sign, x.degreeInSign), houseL(x.house)];
    if (opts.houseInOther) r.push(houseL(x.houseInOther));
    r.push(x.retrograde === true ? "℞ Retro" : "");
    if (opts.dignity) r.push(typeof x.dignity === "string" ? ((DIGNITY_LABELS as Record<string, string>)[x.dignity] ?? x.dignity) : "");
    return r;
  });
  const cols = ["Gezegen / nokta", "Burç ve derece", "Ev"];
  if (opts.houseInOther) cols.push(opts.houseInOther);
  cols.push("Retro");
  if (opts.dignity) cols.push("Asalet");
  b.h(3, title);
  b.table(cols, rows, { empty: "Kayıtta gezegen verisi yok." });
}

function houseTable(b: B, houses: unknown) {
  const rows = arr(houses).map((h) => [houseL(h.number), pos(h.sign, h.degreeInSign)]);
  if (!rows.length) return;
  b.h(3, "Ev başlangıçları (cusp)");
  b.table(["Ev", "Burç ve derece"], rows, { widths: [1, 2] });
}

function aspectTable(b: B, aspects: unknown, colA = "Gezegen", colB = "Gezegen", keys: [string, string] = ["a", "b"], title = "Açılar") {
  const rows = arr(aspects).map((a) => [bodyL(a[keys[0]]), aspectL(a.type), bodyL(a[keys[1]]), deg(a.orb), natureL(a.nature), a.applying === true ? "Yaklaşan" : a.applying === false ? "Ayrılan" : ""]);
  b.h(3, title);
  b.table([colA, "Açı", colB, "Orb", "Nitelik", "Durum"], rows, { empty: "Kayıtta açı yok." });
}

function anglesKv(b: B, angles: unknown, points?: unknown) {
  const a = isObj(angles) ? angles : null;
  const p = isObj(points) ? points : null;
  const pof = p && isObj(p.partOfFortune) ? p.partOfFortune : null;
  const vx = p && isObj(p.vertex) ? p.vertex : null;
  b.kv([
    ["Yükselen (ASC)", a && isObj(a.ascendant) ? pos(a.ascendant.sign, a.ascendant.degreeInSign) : DASH],
    ["Tepe Noktası (MC)", a && isObj(a.midheaven) ? pos(a.midheaven.sign, a.midheaven.degreeInSign) : DASH],
    ["Şans Noktası", pof ? `${pos(pof.sign, pof.degreeInSign)}${num(pof.house) ? ` · ${houseL(pof.house)}` : ""}` : DASH],
    ["Vertex", vx ? `${pos(vx.sign, vx.degreeInSign)}${num(vx.house) ? ` · ${houseL(vx.house)}` : ""}` : DASH],
  ]);
}

function wheelOf(t: O, aspects = true): WheelInput | null {
  const bodies = arr(t.bodies).filter((x) => typeof x.sign === "string" && num(x.longitude) !== null);
  if (!bodies.length) return null;
  const a = isObj(t.angles) && isObj(t.angles.ascendant) && isObj(t.angles.midheaven) && num(t.angles.ascendant.longitude) !== null && num(t.angles.midheaven.longitude) !== null ? t.angles : null;
  return {
    bodies: bodies.map((x) => ({ id: String(x.id), longitude: x.longitude as number, sign: x.sign as SignId, degreeInSign: num(x.degreeInSign) ?? 0, retrograde: x.retrograde === true })),
    houses: arr(t.houses)
      .filter((h) => num(h.longitude) !== null && typeof h.sign === "string")
      .map((h) => ({ number: num(h.number) ?? 0, longitude: h.longitude as number, sign: h.sign as SignId, degreeInSign: num(h.degreeInSign) ?? 0 })),
    angles: a ? { ascendant: { longitude: (a.ascendant as O).longitude as number }, midheaven: { longitude: (a.midheaven as O).longitude as number } } : null,
    aspects: aspects ? arr(t.aspects).map((x) => ({ a: String(x.a), b: String(x.b), type: String(x.type), nature: typeof x.nature === "string" ? x.nature : null })) : [],
  };
}

const wheelBodies = (v: unknown) =>
  arr(v)
    .filter((x) => typeof x.sign === "string" && num(x.longitude) !== null)
    .map((x) => ({ id: String(x.id), longitude: x.longitude as number, sign: x.sign as SignId, degreeInSign: num(x.degreeInSign) ?? 0, retrograde: x.retrograde === true }));

/** İlerletilmiş çark: ilerletilmiş ASC/MC + sağlayıcının yöntemiyle ilerletilmiş Yükselen burcundan TAM BURÇ evleri (uygulamadaki çarkla aynı). */
function progressionWheel(t: O): WheelInput | null {
  const w = wheelOf(t, false);
  if (!w || !w.angles) return null;
  const first = Math.floor(w.angles.ascendant.longitude / 30) * 30;
  w.houses = Array.from({ length: 12 }, (_, i) => {
    const lon = (first + i * 30) % 360;
    return { number: i + 1, longitude: lon, sign: SIGN_IDS[Math.floor(lon / 30)], degreeInSign: 0 };
  });
  return w;
}

/** Transit çift halka: iç halka kayıtlı (veya aynı revizyonun önbellekteki) natal çerçeve, dış halka transit gezegenleri. Çerçeve yoksa çizilmez. */
function transitWheel(t: O): WheelInput | null {
  if (!isObj(t.natalFrame)) return null;
  const inner = wheelOf(t.natalFrame, false);
  const outer = wheelBodies(t.bodies);
  if (!inner || !inner.angles || !outer.length) return null;
  const crossAspects = arr(t.aspects)
    .filter((x) => typeof x.transit === "string" && typeof x.natal === "string" && x.natal !== "ascendant" && x.natal !== "midheaven")
    .map((x) => ({ outer: String(x.transit), inner: String(x.natal), type: String(x.type), nature: typeof x.nature === "string" ? x.nature : null }));
  return { ...inner, outer: { bodies: outer }, crossAspects };
}

/** Sinastri çift halka: iç halka 2. kişi, dış halka 1. kişi; sağlayıcı sinastride ev vermez → yalnız burç bölümleri, Koç 0° solda. */
function synastryWheel(t: O): WheelInput | null {
  const p1 = isObj(t.person1) ? t.person1 : null;
  const p2 = isObj(t.person2) ? t.person2 : null;
  const a = p1 ? wheelBodies(p1.bodies) : [];
  const bb = p2 ? wheelBodies(p2.bodies) : [];
  if (!a.length || !bb.length) return null;
  const crossAspects = arr(t.aspects)
    .filter((x) => typeof x.a === "string" && typeof x.b === "string")
    .map((x) => ({ outer: String(x.a), inner: String(x.b), type: String(x.type), nature: typeof x.nature === "string" ? x.nature : null }));
  return { bodies: bb, houses: [], angles: null, aspects: [], outer: { bodies: a }, crossAspects };
}

function wheelCaption(technique: string, techLabel: string, people: { a: string; b: string }): string {
  if (technique === "western.transit") return "Transit çift halka — iç halka: natal (kayıtlı doğum bilgisi revizyonu), dış halka (mor): transit gezegenleri. Ortadaki çizgiler transit → natal açılarıdır (mor nokta transit gezegeni; natal Yükselen/MC hedefli açılar yalnız tabloda). Kayıtlı analiz verisinden çizilmiştir.";
  if (technique === "western.synastry") return `Sinastri çift halka — dış halka (mor): ${people.a}, iç halka: ${people.b}. Bölümler burç sınırlarıdır (sağlayıcı sinastride ev vermez); Koç 0° solda. Ortadaki çizgiler iki kişi arasındaki açılardır (mor nokta dış halka). Kayıtlı analiz verisinden çizilmiştir.`;
  if (technique === "western.progression") return "İlerletilmiş (secondary progression) çark — ilerletilmiş Yükselen'den tam burç evleri. Kayıtlı analiz verisinden çizilmiştir.";
  return `${techLabel} çarkı — kayıtlı analiz verisinden çizilmiştir.`;
}

function westernNatal(b: B, t: O) {
  b.kv([
    ["Zodyak", "Tropikal"],
    ["Ev sistemi", hsL(t.houseSystem)],
    ["Ay düğümü", typeof t.nodeType === "string" ? ((NODE_TYPE_LABELS as Record<string, string>)[t.nodeType] ?? t.nodeType) : DASH],
  ]);
  anglesKv(b, t.angles, t.points);
  bodyTable(b, "Gezegen yerleşimleri", t.bodies, { dignity: true });
  houseTable(b, t.houses);
  aspectTable(b, t.aspects);
  // AŞAMA 2 (2026-10-21): ekrandaki nitelik (modality), sıkılık ve burç dışı bilgisi rapora da aktarılır (kayıtta zaten vardı).
  const pats = arr(t.patterns).map((p) => [
    typeof p.kind === "string" ? ((PATTERN_LABELS as Record<string, string>)[p.kind] ?? p.kind) : DASH,
    list(p.bodies, bodyL),
    p.apex ? bodyL(p.apex) : "",
    typeof p.element === "string" ? ((ELEMENT_LABELS as Record<string, string>)[p.element] ?? p.element) : "",
    typeof p.modality === "string" ? ((MODALITY_LABELS as Record<string, string>)[p.modality] ?? p.modality) : "",
    num(p.tightness) !== null ? `%${Math.round(num(p.tightness)!)}` : DASH,
    p.outOfSign === true ? "Evet" : p.outOfSign === false ? "Hayır" : DASH,
  ]);
  if (pats.length) {
    b.h(3, "Açı kalıpları");
    b.table(["Kalıp", "Gezegenler", "Tepe", "Element", "Nitelik", "Sıkılık", "Burç dışı"], pats, { widths: [1.8, 3.6, 1.3, 1.2, 1.2, 1, 1] });
    if (pats.some((r) => r[6] === "Evet")) b.p("Burç dışı: kalıbı oluşturan açılardan en az biri orb içinde ama burç sınırını aşıyor (ör. burçları kare olmayan bir kare).", "muted");
  }
  const sm = isObj(t.summary) ? t.summary : null;
  if (sm) {
    const ed = isObj(sm.elementDistribution) ? sm.elementDistribution : null;
    const md = isObj(sm.modalityDistribution) ? sm.modalityDistribution : null;
    const ab = isObj(sm.aspectBalance) ? sm.aspectBalance : null;
    b.h(3, "Özet");
    b.kv([
      ["Baskın element", typeof sm.dominantElement === "string" ? ((ELEMENT_LABELS as Record<string, string>)[sm.dominantElement] ?? sm.dominantElement) : DASH],
      ["Baskın nitelik", typeof sm.dominantModality === "string" ? ((MODALITY_LABELS as Record<string, string>)[sm.dominantModality] ?? sm.dominantModality) : DASH],
      ["Element dağılımı", ed ? Object.entries(ELEMENT_LABELS).map(([k, l]) => `${l} ${s(ed[k])}`).join(" · ") : DASH],
      ["Nitelik dağılımı", md ? Object.entries(MODALITY_LABELS).map(([k, l]) => `${l} ${s(md[k])}`).join(" · ") : DASH],
      ["Retro gezegenler", arr(sm.retrograde).length ? list(sm.retrograde, bodyL) : DASH],
      ["Açı dengesi", ab ? `Uyumlu ${s(ab.harmonious)} · Zorlayıcı ${s(ab.challenging)} · Nötr ${s(ab.neutral)}` : DASH],
    ]);
  }
}

const FORECAST_EVENT: Record<string, string> = { transit_aspect: "Transit açı", sign_ingress: "Burç girişi", retrograde_station: "Duraklama", eclipse: "Tutulma", lunar_phase: "Ay evresi" };
const ECLIPSE: Record<string, string> = { penumbral: "yarı gölge", partial: "parçalı", annular: "halkalı", total: "tam" };

function forecastDetail(e: O): string {
  switch (e.type) {
    case "transit_aspect":
      return `${bodyL(e.body)} ${aspectL(e.aspect)} natal ${bodyL(e.targetBody)}${num(e.orb) !== null ? ` (orb ${deg(e.orb)})` : ""}`;
    case "sign_ingress":
      return `${bodyL(e.body)} → ${signL(e.targetSign)}`;
    case "retrograde_station":
      return `${bodyL(e.body)} ${e.station === "retrograde" ? "geri harekete başlar" : e.station === "direct" ? "düz harekete döner" : ""}`.trim();
    case "eclipse":
      return `${bodyL(e.body)} tutulması${typeof e.eclipseKind === "string" ? ` (${ECLIPSE[e.eclipseKind] ?? e.eclipseKind})` : ""}${num(e.obscuration) !== null ? ` · örtme %${Math.round(num(e.obscuration)! * (num(e.obscuration)! <= 1 ? 100 : 1))}` : ""}`;
    case "lunar_phase":
      return `${e.phase === "new_moon" ? "Yeni Ay" : e.phase === "full_moon" ? "Dolunay" : "Ay evresi"}${e.targetSign ? ` · ${signL(e.targetSign)}` : ""}`;
    default:
      return DASH;
  }
}

// ─── TRANSİT-01: Batı Transit + Transit Takvimi raporu (ekrandaki bölümlerle aynı veri; yeni hesap YOK) ─────────

const zoneOpt = (v: unknown): string | null => (isIanaZone(v) && v !== "UTC" ? v : null);
/** UTC anı → seçilen saat diliminde "GG.AA.YYYY SS:DD GMT+3"; dilim yoksa UTC. */
const atZone = (utcIso: unknown, tz: string | null) => {
  if (typeof utcIso !== "string") return DASH;
  if (!tz) return utcTr(utcIso);
  const z = formatInZone(utcIso, tz);
  return z ? `${z.text} ${z.zone}` : utcTr(utcIso);
};
/** Yalnız saat kısmı ("SS:DD GMT+3" / "SS:DD UTC"). */
const timeZoneOnly = (utcIso: unknown, tz: string | null) => {
  const full = atZone(utcIso, tz);
  return full === DASH ? DASH : full.slice(11);
};
const strengthL = (v: unknown) => (num(v) === null ? DASH : `%${Math.round(num(v)!)}`);
const applyingL = (v: unknown) => (v === true ? "Yaklaşan" : v === false ? "Ayrılan" : DASH);

function transitReport(b: B, t: O, opts: O) {
  const tz = zoneOpt(opts.displayTz);
  const at = typeof t.atUtc === "string" ? t.atUtc.replace(/Z$/, "") : null;
  const cal = isObj(opts.calendar) ? opts.calendar : null;
  b.kv([
    ["Transit anı (yerel)", at && tz ? `${atZone(at, tz)} (${tz})` : DASH],
    ["Saat dilimi", tz ?? "UTC (gösterim saat dilimi kaydedilmemiş)"],
    ["Transit anı (UTC)", utcTr(t.atUtc)],
    ["Zodyak", "Tropikal"],
    ["Ay düğümü", typeof t.nodeType === "string" ? ((NODE_TYPE_LABELS as Record<string, string>)[t.nodeType] ?? t.nodeType) : DASH],
    ["Kaynak takvim", cal && typeof cal.startDate === "string" ? `${dateTr(cal.startDate)} + ${s(cal.days)} gün` : DASH],
  ]);
  const aspects = arr(t.aspects).filter((x) => typeof x.transit === "string" && typeof x.natal === "string");
  const ce = isObj(t.calendarExact) ? (t.calendarExact as unknown as TransitCalendarExact) : null;
  const exactL = (x: O) => {
    const xs = exactTimesOf(ce, { transit: x.transit as never, natal: x.natal as never, type: x.type as never });
    return xs.length ? xs.map((e) => `${atZone(e, tz)}${at ? ` (${relativeTo(at, e)})` : ""}`).join("; ") : DASH;
  };
  const sm = isObj(t.summary) ? t.summary : null;
  const byType = aspectTypeCounts(aspects as unknown as Pick<TransitAspect, "type">[]);
  b.h(3, "Özet");
  b.kv([
    ["Toplam açı", String(aspects.length)],
    ["Açı dengesi", sm ? `Uyumlu ${s(sm.harmonious)} · Zorlayıcı ${s(sm.challenging)} · Nötr ${s(sm.neutral)}` : DASH],
    ["Açı türleri", byType.length ? byType.map(([k, n]) => `${aspectL(k)} ${n}`).join(" · ") : DASH],
  ]);
  const top = strongestTransits(aspects.filter((x) => num(x.strength) !== null && num(x.orb) !== null) as unknown as (TransitAspect & O)[], 5);
  b.h(3, "En güçlü transitler");
  b.table(
    ["Transit", "Açı", "Natal", "Güç", "Orb", "Durum", ...(ce ? ["Kesinleşme"] : [])],
    top.map((x) => [bodyL(x.transit), aspectL(x.type), bodyL(x.natal), strengthL(x.strength), deg(x.orb), applyingL(x.applying), ...(ce ? [exactL(x as unknown as O)] : [])]),
    { widths: ce ? [1.4, 1.4, 1.4, 0.8, 0.9, 1, 2.6] : [1.6, 1.6, 1.6, 0.9, 1, 1.1], empty: "Bu anda natal haritaya transit açısı yok." },
  );
  b.p("Sıralama: sağlayıcının açı gücü (orb darlığı; %100 = tam açı), eşitlikte daha dar orb.", "muted");
  const sorted = [...aspects].sort((x, y) => (num(x.orb) ?? 99) - (num(y.orb) ?? 99));
  b.h(3, "Transit → natal açılar (teknik tablo)");
  b.table(
    ["Transit", "Açı", "Natal", "Orb", "Güç", "Durum", "Nitelik", ...(ce ? ["Kesinleşme"] : [])],
    sorted.map((x) => [bodyL(x.transit), aspectL(x.type), bodyL(x.natal), deg(x.orb), strengthL(x.strength), applyingL(x.applying), natureL(x.nature), ...(ce ? [exactL(x)] : [])]),
    { widths: ce ? [1.3, 1.3, 1.3, 0.8, 0.7, 0.9, 0.9, 2.4] : [1.5, 1.5, 1.5, 0.9, 0.8, 1, 1], compact: true, empty: "Kayıtta açı yok." },
  );
  if (ce) {
    b.p(
      `Kesinleşme anları kaynak takvimin olaylarından alınmıştır (takvim penceresi ${dateTr(ce.window.start)} – ${dateTr(ce.window.end)}${ce.complete ? "" : "; takvimin bazı parçaları kayıtlı değildi, liste eksik olabilir"}). Takvim yalnız majör açıların kesinleşmesini verir; “—” bu pencerede kesinleşme olmadığı veya eşleşme yapılamadığı anlamına gelir. ${CALENDAR_UNMATCHED_NOTE}`,
      "muted",
    );
  } else {
    b.p("Bu transit analizi tek bir anı hesaplar; kesinleşme anları yalnız Transit Takvimi gününden açılan transitlerde, takvim olaylarından gösterilir.", "muted");
  }
  const houses = transitNatalHouses({ bodies: arr(t.bodies) as never, natalFrame: (isObj(t.natalFrame) ? t.natalFrame : null) as never });
  const tb = arr(t.bodies).map((x) => {
    const h = houses.get(x.id as BodyId);
    return [bodyL(x.id), pos(x.sign, x.degreeInSign), x.retrograde === true ? "℞ Retro" : "", num(x.speed) !== null ? (num(x.speed) as number).toFixed(3).replace(".", ",") : DASH, ...(houses.size ? [h ? `${h}. ev` : DASH] : [])];
  });
  b.h(3, "Transit gezegenleri");
  b.table(["Gezegen", "Burç ve derece", "Retro", "Hız (°/gün)", ...(houses.size ? ["Natal ev"] : [])], tb, { widths: houses.size ? [2, 3, 1, 1.2, 1.1] : [2, 3, 1, 1.2], empty: "Kayıtta transit gezegen verisi yok." });
  if (houses.size) b.p(NATAL_HOUSE_NOTE, "muted");
}

function forecastReport(b: B, t: O, opts: O) {
  const tz = zoneOpt(opts.displayTz);
  const w = isObj(t.window) ? t.window : {};
  const events = arr(t.events);
  const personal = events.filter((e) => e.type === "transit_aspect").length;
  const hasSig = events.some((e) => num(e.significance) !== null);
  b.kv([
    ["Dönem", `${dateTr(w.start)} – ${dateTr(w.end)}`],
    ["Saat dilimi", tz ?? "UTC"],
    ["Olay sayısı", `${events.length} (natal haritaya açı: ${personal} · genel gökyüzü: ${events.length - personal})`],
  ]);
  if (hasSig) b.p(SIGNIFICANCE_NOTE, "muted");
  const sigL = (v: unknown) => {
    const n = num(v);
    const band = significanceBand(n);
    return n === null || !band ? DASH : `${Math.round(n)} · ${SIGNIFICANCE_BAND_LABELS[band]}`;
  };
  const top = [...events].filter((e) => num(e.significance) !== null).sort((x, y) => (num(y.significance) ?? 0) - (num(x.significance) ?? 0)).slice(0, 10);
  if (top.length) {
    b.h(3, "Önem puanı en yüksek olaylar");
    b.table([`Tarih (${tz ?? "UTC"})`, "Olay", "Ayrıntı", "Önem"], top.map((e) => [atZone(e.datetime ?? e.date, tz), typeof e.type === "string" ? (FORECAST_EVENT[e.type] ?? e.type) : DASH, forecastDetail(e), sigL(e.significance)]), { widths: [1.7, 1.2, 3.6, 1] });
  }
  const dated = events.filter((e): e is O & { datetime: string } => typeof e.datetime === "string");
  const groups = groupEventsByDay(dated, tz ?? "UTC");
  b.h(3, "Takvim (gün gün)");
  if (!groups.length) b.p("Bu dönemde kayıtlı olay yok.", "muted");
  for (const [day, list] of groups) {
    b.table(
      [`${dateTr(day)} · saat (${tz ?? "UTC"})`, "Olay", "Ayrıntı", ...(hasSig ? ["Önem"] : [])],
      list.map((e) => [timeZoneOnly(e.datetime, tz), typeof e.type === "string" ? (FORECAST_EVENT[e.type] ?? e.type) : DASH, `${e.type === "transit_aspect" ? "" : "[genel] "}${forecastDetail(e)}`, ...(hasSig ? [sigL(e.significance)] : [])]),
      { widths: hasSig ? [1.5, 1.2, 4, 1.1] : [1.5, 1.3, 4.4], compact: true },
    );
  }
  b.p("[genel] = kişiye özel olmayan gökyüzü olayı (burç girişi, istasyon, tutulma, Ay evresi). Takvimden açılan gün haritaları ayrı Transit analizleri olarak kaydedilir ve toplu raporda bu takvimle birlikte basılabilir.", "muted");
}

/**
 * Dönüş anı: Roxy yerel saati DOĞUM ofsetiyle verir (ör. 1988 Türkiye UTC+2). Dönüş tarihindeki gerçek yerel saat farklı
 * olabilir (2026 Türkiye UTC+3) → rapor UTC anını ve (doğum yerinde hesaplanan dönüşte) IANA saat dilimiyle gerçek yerel
 * saati AYRICA yazar; "yerel" etiketi sağlayıcı ofsetinin ne olduğunu açıkça söyler.
 */
export function returnTimes(t: O, birthTz: string | null, relocated: boolean): { utc: string | null; local: string | null } {
  const rl = typeof t.returnLocal === "string" ? t.returnLocal : null;
  const off = num(t.returnOffsetHours);
  if (!rl || off === null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rl)) return { utc: null, local: null };
  const ms = Date.parse(`${rl.length === 16 ? rl + ":00" : rl.slice(0, 19)}Z`) - off * 3600_000;
  if (!Number.isFinite(ms)) return { utc: null, local: null };
  const utc = new Date(ms).toISOString();
  if (relocated || !birthTz) return { utc, local: null };
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("tr-TR", { timeZone: birthTz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value]),
    );
    return { utc, local: `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute} (${p.timeZoneName}, ${birthTz})` };
  } catch {
    return { utc, local: null };
  }
}

function westernTiming(b: B, technique: string, t: O, people: { a: string; b: string }, ret: { birthTz: string | null; relocated: boolean } = { birthTz: null, relocated: false }, opts: O = {}) {
  switch (technique) {
    case "western.transit": {
      transitReport(b, t, opts);
      return;
    }
    case "western.forecast": {
      forecastReport(b, t, opts);
      return;
    }
    case "western.progression": {
      b.kv([
        ["Hedef tarih", dateTr(t.targetDate)],
        ["İlerletilmiş tarih", dateTr(t.progressedDate)],
        ["Geçen yıl", fix(t.elapsedYears, 2)],
        ["Ev yöntemi", "İlerletilmiş Yükselen'den bütün-burç evleri"],
      ]);
      anglesKv(b, t.angles);
      bodyTable(b, "İlerletilmiş gezegenler", t.bodies);
      return;
    }
    case "western.solar_arc": {
      b.kv([
        ["Hedef tarih", dateTr(t.targetDate)],
        ["Yay (arc)", deg(t.arc)],
        ["Açı yöntemi", "Majör açılar, 1° orb (Yaşam Sistemi aritmetiği)"],
      ]);
      const rows = arr(t.directed).map((d) => [bodyL(d.id), lonPos(d.natalLongitude), pos(d.sign, d.degreeInSign)]);
      b.h(3, "Directed noktalar");
      b.table(["Nokta", "Natal", "Directed"], rows, { empty: "Kayıtta directed nokta yok." });
      const ar = arr(t.aspects).map((a) => [bodyL(a.directed), aspectL(a.type), bodyL(a.natal), deg(a.orb)]);
      b.h(3, "Directed → natal açılar");
      b.table(["Directed", "Açı", "Natal", "Orb"], ar, { empty: "1° içinde açı yok." });
      return;
    }
    case "western.solar_return":
    case "western.lunar_return": {
      const rq = isObj(t.requested) ? t.requested : {};
      const np = isObj(t.natalPoint) ? t.natalPoint : null;
      const loc = isObj(t.location) ? t.location : {};
      const rt = returnTimes(t, ret.birthTz, ret.relocated);
      b.kv([
        ["Dönüş türü", t.kind === "lunar" ? "Lunar return (Ay dönüşü)" : "Solar return (Güneş dönüşü)"],
        ["İstenen", num(rq.returnYear) !== null ? `${rq.returnYear} yılı` : dateTr(rq.returnDate)],
        ["Dönüş sırası", num(rq.sequence) !== null ? `${rq.sequence}. dönüş` : DASH],
        ["Dönüş anı (UTC)", rt.utc ? utcTr(rt.utc) : DASH],
        ...(rt.local ? ([["Dönüş anı (doğum yeri yerel saati)", rt.local]] as [string, string][]) : []),
        ["Sağlayıcı saati (doğum ofseti)", `${localTr(t.returnLocal)} · ${offset(t.returnOffsetHours)}`],
        [t.kind === "lunar" ? "Natal Ay" : "Natal Güneş", np ? pos(np.sign, np.degreeInSign) : DASH],
        ["Dönüş konumu", coord(loc.latitude, loc.longitude)],
      ]);
      const c = isObj(t.chart) ? t.chart : {};
      b.kv([["Ev sistemi", hsL(c.houseSystem)]]);
      anglesKv(b, c.angles, c.points);
      bodyTable(b, "Dönüş haritası gezegenleri", c.bodies);
      houseTable(b, c.houses);
      aspectTable(b, c.aspects);
      return;
    }
    case "western.synastry": {
      const sm = isObj(t.summary) ? t.summary : {};
      b.kv([
        ["Ev sistemi", hsL(t.houseSystem)],
        ["Uyum puanı (sağlayıcı)", num(t.compatibilityScore) !== null ? num(t.compatibilityScore)!.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : DASH],
        ["Açı sayısı", `Toplam ${s(sm.total)} · Uyumlu ${s(sm.harmonious)} · Zorlayıcı ${s(sm.challenging)} · Nötr ${s(sm.neutral)}`],
      ]);
      for (const [key, label, other] of [
        ["person1", people.a, people.b],
        ["person2", people.b, people.a],
      ] as const) {
        const p = isObj(t[key]) ? (t[key] as O) : {};
        if (isObj(p.ascendant)) b.kv([[`${label} · Yükselen`, pos(p.ascendant.sign, p.ascendant.degreeInSign)]]);
        bodyTable(b, `${label} · gezegenler`, p.bodies, { houseInOther: `${other} evinde` });
      }
      aspectTable(b, t.aspects, people.a, people.b, ["a", "b"], "Sinastri açıları");
      return;
    }
    case "western.composite": {
      b.kv([
        ["Yöntem", "Orta nokta (midpoint)"],
        ["Ev sistemi", hsL(t.houseSystem)],
      ]);
      anglesKv(b, t.angles);
      bodyTable(b, "Composite gezegenler", t.bodies);
      houseTable(b, t.houses);
      aspectTable(b, t.aspects);
      return;
    }
  }
}

const COMPASS: Record<string, string> = {
  n: "K", nne: "KKD", ne: "KD", ene: "DKD", e: "D", ese: "DGD", se: "GD", sse: "GGD", s: "G", ssw: "GGB", sw: "GB", wsw: "BGB", w: "B", wnw: "BKB", nw: "KB", nnw: "KKB",
};

function westernLocation(b: B, technique: string, t: O, opts: O) {
  switch (technique) {
    case "western.astrocartography": {
      b.p("Hatlar yukarıdaki dünya haritasında çizilidir; aşağıda her gezegenin meridyen (MC/IC) boylamları ve gök koordinatları listelenir. Yükselen/Alçalan eğrilerinin nokta listesi tabloya dökülmez (haritada çizilidir).", "muted");
      const rows = arr(t.bodies).map((x) => [bodyL(x.id), coord(0, x.mcLongitude).split(", ")[1] ?? DASH, coord(0, x.icLongitude).split(", ")[1] ?? DASH, deg(x.rightAscension), fix(x.declination, 2) === DASH ? DASH : `${fix(x.declination, 2)}°`]);
      b.h(3, "Gezegen hatları");
      b.table(["Gezegen", "MC hattı boylamı", "IC hattı boylamı", "Sağ açıklık", "Dik açıklık"], rows, { empty: "Kayıtta hat verisi yok." });
      return;
    }
    case "western.relocation": {
      const ch = isObj(t.changes) ? t.changes : {};
      const tg = isObj(opts.target) ? opts.target : {};
      const tc = isObj(t.target) ? t.target : {};
      b.kv([
        ["Hedef konum", typeof tg.label === "string" ? tg.label : coord(tc.latitude, tc.longitude)],
        ["Hedef koordinat", coord(tc.latitude, tc.longitude)],
        ["Uzaklık", num(ch.distanceKm) !== null ? `${Math.round(num(ch.distanceKm)!).toLocaleString("tr-TR")} km` : DASH],
        ["Yön", typeof ch.direction === "string" ? (COMPASS[ch.direction] ?? ch.direction) : DASH],
        ["Yükselen burcu değişti mi", yesNo(ch.ascendantSignChanged)],
        ["Yeni açılara yakın gezegenler", arr(ch.angularBodies).length ? list(ch.angularBodies, bodyL) : DASH],
        ["Ev sistemi", hsL(t.houseSystem)],
      ]);
      anglesKv(b, t.angles, { vertex: t.vertex });
      const natal = isObj(t.natal) ? t.natal : null;
      const natalHouse = new Map(arr(natal?.bodyHouses).map((x) => [String(x.id), x.house]));
      const rows = arr(t.bodies).map((x) => [bodyL(x.id), pos(x.sign, x.degreeInSign), houseL(natalHouse.get(String(x.id))), houseL(x.house)]);
      b.h(3, "Gezegenler: doğum yeri ↔ hedef");
      b.table(["Gezegen", "Burç ve derece", "Natal ev", "Hedefte ev"], rows, { empty: "Kayıtta gezegen verisi yok." });
      houseTable(b, t.houses);
      return;
    }
    case "western.local_space": {
      const ref = isObj(t.reference) ? t.reference : {};
      const rl = isObj(opts.reference) ? opts.reference : {};
      b.kv([["Merkez", typeof rl.label === "string" ? `${rl.label} (${coord(ref.latitude, ref.longitude)})` : coord(ref.latitude, ref.longitude)]]);
      const rows = arr(t.bodies).map((x) => [bodyL(x.id), num(x.azimuth) !== null ? `${fix(x.azimuth, 1)}°` : DASH, num(x.altitude) !== null ? `${fix(x.altitude, 1)}°` : DASH, typeof x.compass === "string" ? (COMPASS[x.compass] ?? x.compass) : DASH, x.aboveHorizon === true ? "Ufkun üstünde" : x.aboveHorizon === false ? "Ufkun altında" : DASH]);
      b.h(3, "Local space yönleri");
      b.table(["Gezegen", "Azimut", "Yükseklik", "Yön", "Ufuk"], rows, { empty: "Kayıtta yön verisi yok." });
      return;
    }
  }
}

// ─── Sabit yıldızlar ─────────────────────────────────────────────────────────

const CONJ = `${ASPECT_GLYPHS.conjunction} Kavuşum`;
const orbTr = (v: unknown) => (num(v) === null ? DASH : `${num(v)!.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`);
const latTr = (lat: number | undefined) => (lat === undefined ? DASH : `${lat > 0 ? "+" : ""}${lat.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`);
const magTr = (v: unknown) => (num(v) === null ? DASH : num(v)!.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export const FIXED_STARS_METHOD_TEXT =
  "Yöntem: ekliptik boylam kavuşumu. Yıldızın doğum anındaki görünür tropikal boylamı (presesyon, nütasyon ve yıllık aberasyon uygulanmış) ile natal nokta boylamı arasındaki fark, seçilen orb içindeyse kavuşum sayılır. Bu yöntem paran (yıldız ile gezegenin aynı anda ufuk veya meridyen üzerinde olması) DEĞİLDİR; paran ve heliakal doğuş bu raporda yer almaz. Yıldız konumları ve kavuşumlar teknik hesaplama sonuçlarıdır; Yaşam Sistemi konumları Swiss Ephemeris yıldız kataloğu (SIMBAD ICRS J2000 + öz hareket) ile bağımsız olarak doğrulamıştır.";

export const PROFECTIONS_METHOD_TEXT =
  "Yöntem: yıllık profeksiyon, bütün-burç (Whole Sign). Her tamamlanmış yaşta Yükselen burçtan bir burç ilerlenir; etkin ev = yaş mod 12 + 1 (0, 12, 24, 36… yaşlarında 1. ev). Yılın yönetici gezegeni, etkin burcun klasik yöneticisidir (yedi gezegen; Uranüs, Neptün ve Plüton yönetici sayılmaz). Yöneticinin natal evi de bütün-burç evleriyle gösterilir; doğum haritası analizlerinizdeki ev sistemi tercihi değişmez. Profeksiyon yılı doğum gününde başlar.";
export const PROFECTIONS_LEAP_DAY_TEXT = "29 Şubat doğumu: artık olmayan yıllarda yeni profeksiyon yılı 1 Mart'ta başlar (28 Şubat önceki yaşa aittir); artık yıllarda 29 Şubat'ta başlar.";

/** Yıllık profeksiyonlar — yalnız kayıtlı teknik veri (sağlayıcı anlatısı yok). */
function westernProfections(b: B, t: O) {
  const age = num(t.age);
  b.kv([
    ["Profeksiyon yılı", age !== null ? `${age} yaş profeksiyon yılı` : DASH],
    ["Yıl aralığı", `${dateTr(t.yearStart)} – ${dateTr(t.yearEnd)}`],
    ["Tamamlanmış yaş", age !== null ? String(age) : DASH],
    ["Etkin astrolojik ev", num(t.profectedHouse) !== null ? `${t.profectedHouse}. ev` : DASH],
    ["Etkin burç", signL(t.profectedSign)],
    ["Yılın yönetici gezegeni", bodyL(t.lordOfYear)],
    ["Yöneticinin natal konumu", isObj(t.lordNatal) ? `${signL(t.lordNatal.sign)} · ${num(t.lordNatal.house) !== null ? `${t.lordNatal.house}. ev` : DASH}` : DASH],
    ["Ev sistemi", hsL(t.houseSystem)],
    ["Zodyak", "Tropikal"],
  ]);
  b.p(PROFECTIONS_METHOD_TEXT, "muted");
  if (t.leapDayBirth === true) b.p(PROFECTIONS_LEAP_DAY_TEXT, "muted");
}

function westernFixedStars(b: B, t: O, opts: O) {
  const orb = fixedStarOrbOf(opts.orb);
  const stars = arr(t.stars);
  const byId = new Map(stars.map((x) => [String(x.id), x]));
  const all = arr(t.contacts);
  const inOrb = all.filter((c) => (num(c.orb) ?? 99) <= orb + 1e-9);
  b.kv([
    ["Yöntem", "Ekliptik boylam kavuşumu (paran değildir)"],
    ["Zodyak", "Tropikal"],
    ["Rapor orbu", orbTr(orb)],
    ["Sağlayıcı sorgu orbu", orbTr(num(t.orbQueried) ?? FIXED_STAR_ORB_QUERY)],
    ["Ay düğümü", typeof t.nodeType === "string" ? ((NODE_TYPE_LABELS as Record<string, string>)[t.nodeType] ?? t.nodeType) : DASH],
    ["Yıldız sayısı", String(stars.length)],
    ["Orb içindeki kavuşum", String(inOrb.length)],
  ]);
  b.p(FIXED_STARS_METHOD_TEXT, "muted");
  b.h(3, `Önemli sabit yıldız kavuşumları (orb ≤ ${orbTr(orb)})`);
  const rows = inOrb.map((c) => {
    const st = byId.get(String(c.star));
    const cat = FIXED_STAR_CATALOG[String(c.star)];
    const far = cat && Math.abs(cat.latJ2000) > FIXED_STAR_FAR_LAT;
    return [fixedStarName(String(c.star)), bodyL(c.point), orbTr(c.orb), st ? pos(st.sign, st.degreeInSign) : DASH, magTr(st?.magnitude), fixedStarNatureLabel(arr<string>(st?.nature)), `${latTr(cat?.latJ2000)}${far ? " *" : ""}`];
  });
  b.table(["Yıldız", "Natal nokta", "Orb", "Yıldız konumu", "Kadir", "Geleneksel doğa", "Ekliptik enlem"], rows, {
    widths: [16, 14, 9, 17, 8, 20, 12],
    compact: true,
    empty: `Seçilen orb (${orbTr(orb)}) içinde sabit yıldız kavuşumu yok.`,
  });
  if (inOrb.some((c) => Math.abs(FIXED_STAR_CATALOG[String(c.star)]?.latJ2000 ?? 0) > FIXED_STAR_FAR_LAT)) {
    b.p(`* Ekliptik enlemi ±${FIXED_STAR_FAR_LAT}°'yi aşan yıldız: boylam kavuşumu bir izdüşümdür; yıldız gökyüzünde natal noktadan uzaktadır. Bu yıldızlar için paran yöntemi daha anlamlı kabul edilir (bu raporda yoktur).`, "warn");
  }
  const wider = all.length - inOrb.length;
  if (wider > 0) b.p(`Rapor orbu ile ${orbTr(num(t.orbQueried) ?? FIXED_STAR_ORB_QUERY)} arasında ${wider} temas daha vardır; uygulamadaki sabit yıldız ekranında orb ayarıyla görüntülenebilir.`, "muted");
  if (opts.reportCatalog === true) {
    b.h(3, `Ek: Sabit yıldız kataloğu (${stars.length} yıldız; doğum tarihine göre konumlar)`);
    const contactCount = (id: string) => all.filter((c) => String(c.star) === id && (num(c.orb) ?? 99) <= orb + 1e-9).length;
    const cRows = [...stars]
      .sort((x, y) => (num(x.longitude) ?? 0) - (num(y.longitude) ?? 0))
      .map((x) => {
        const id = String(x.id);
        const cat = FIXED_STAR_CATALOG[id];
        return [fixedStarName(id), cat ? bayerBoth(cat.bayer) : DASH, pos(x.sign, x.degreeInSign), magTr(x.magnitude), fixedStarNatureLabel(arr<string>(x.nature)), latTr(cat?.latJ2000), contactCount(id) ? String(contactCount(id)) : DASH];
      });
    b.table(["Yıldız", "Bayer", "Konum", "Kadir", "Geleneksel doğa", "Enlem", "Kavuşum"], cRows, { widths: [17, 17, 17, 8, 21, 10, 10], compact: true });
    b.p("Ekliptik enlem: J2000, SIMBAD ICRS konumundan Yaşam Sistemi hesaplaması (sağlayıcı enlem vermez). Kadir: küçük değer daha parlak yıldız demektir.", "muted");
  }
}

// ─── Vedik ───────────────────────────────────────────────────────────────────

const frameKv = (f: unknown): [string, string][] => {
  const x = isObj(f) ? f : {};
  return [
    ["Zodyak", "Sidereal (nirayana)"],
    ["Ayanamsa", `${ayL(x.ayanamsa)}${num(x.ayanamsaDegrees) !== null ? ` · ${deg(x.ayanamsaDegrees)}` : ""}`],
  ];
};
const nakCell = (n: unknown) => (isObj(n) ? `${nakL(n.id)}${num(n.pada) !== null ? ` (${n.pada}. pada)` : ""}` : DASH);
const AVASTHA = (a: unknown) => (isObj(a) ? [a.baladi, a.jagradadi, a.deeptadi].filter((x) => typeof x === "string").map((x) => String(x)[0].toUpperCase() + String(x).slice(1)).join(" · ") || DASH : DASH);
const QUALITY: Record<string, string> = { positive: "Olumlu", negative: "Olumsuz", both: "Karma" };

function vedic(b: B, technique: string, t: O) {
  switch (technique) {
    case "vedic.d1": {
      const lg = isObj(t.lagna) ? t.lagna : null;
      b.kv([...frameKv(t.frame), ["Bhava sistemi", "Bütün-burç (Lagna = 1. ev)"], ["Lagna", lg ? `${pos(lg.rashi, lg.degreeInRashi)} · ${nakCell(lg.nakshatra)}` : DASH]]);
      const rows = arr(t.grahas).map((g) => [grahaL(g.id), pos(g.rashi, g.degreeInRashi), nakCell(g.nakshatra), isObj(g.nakshatra) ? grahaL(g.nakshatra.lord) : DASH, houseL(g.house), g.retrograde === true ? "R" : "", AVASTHA(g.avastha)]);
      b.h(3, "Graha yerleşimleri (D1 / Rashi)");
      b.table(["Graha", "Rashi ve derece", "Nakshatra", "Nakshatra lordu", "Bhava", "Retro", "Avastha"], rows, { widths: [1.6, 1.6, 1.7, 1.4, 0.8, 0.6, 1.8], compact: true, empty: "Kayıtta graha verisi yok." });
      const cb = arr(t.combustion).map((c) => [grahaL(c.id), `${fix(c.distanceFromSun, 2)}°`, `${fix(c.orb, 2)}°`]);
      if (cb.length) {
        b.h(3, "Yanma (combustion)");
        b.table(["Graha", "Güneş'e uzaklık", "Sınır"], cb);
      }
      // AŞAMA 2: nakshatra içi ilerleme (katedilen oran, kalan derece, Abhijit) — ekrandaki Nakshatra & Pada tablosuyla aynı veri.
      const nakRows = [["Lagna", lg?.nakshatra] as const, ...arr(t.grahas).map((g) => [grahaL(g.id), g.nakshatra] as const)].map(([label, n]) => {
        const x = isObj(n) ? n : {};
        return [label, isObj(n) ? nakL(x.id) : DASH, num(x.pada) !== null ? String(x.pada) : DASH, num(x.ratio) !== null ? `%${Math.round(num(x.ratio)! * 100)}` : DASH, deg(x.remaining), x.abhijit === true ? "Evet" : x.abhijit === false ? "" : DASH];
      });
      if (nakRows.length > 1) {
        b.h(3, "Nakshatra ilerlemesi");
        b.table(["Nokta", "Nakshatra", "Pada", "Katedilen", "Kalan", "Abhijit"], nakRows, { widths: [1.4, 1.8, 0.7, 1, 1, 0.9], compact: true });
        b.p("Kalan: nakshatranın sonuna kalan derece (bir nakshatra 13°20′). Janma nakshatra Chandra'nınkidir; Vimshottari dasha bu yönetici ve kalan oranla başlar.", "muted");
      }
      // AŞAMA 2: savaş uzaklığı (vedic-d1-proj-2). Eski kayıtta alan yoksa "—" (uydurulmaz).
      const pw = arr(t.planetaryWar).map((w) => [grahaL(w.a), grahaL(w.b), num(w.distance) !== null ? `${fix(w.distance, 2)}°` : DASH, w.winner ? grahaL(w.winner) : DASH]);
      if (pw.length) {
        b.h(3, "Gezegen savaşı (graha yuddha)");
        b.table(["Graha 1", "Graha 2", "Uzaklık", "Kazanan"], pw);
        b.p("Görünür iki graha 1° içinde; kazanan daha kuzey ekliptik enlemli grahadır, kaybeden zayıflar.", "muted");
      }
      const yogas = arr(t.yogas);
      const present = yogas.filter((y) => y.present === true).map((y) => [s(y.name), s(y.family), typeof y.quality === "string" ? (QUALITY[y.quality] ?? y.quality) : DASH, s(y.evidence)]);
      b.h(3, "Yogalar");
      if (yogas.length) b.p(`${yogas.length} yoga denetlendi; ${present.length} tanesi haritada oluşuyor.`, "muted");
      b.table(["Yoga", "Aile", "Nitelik", "Oluşum kanıtı"], present, { widths: [1.5, 1.3, 1, 4], empty: "Kayıtta oluşan yoga yok." });
      // AŞAMA 2: kuralı sağlayıp üst aile tarafından bastırılan yogalar (yalnız alan kayıtta varsa; eski kayıtta bölüm yok).
      const suppressed = yogas.filter((y) => y.present === false && typeof y.suppressedBy === "string").map((y) => [s(y.name), s(y.family), (VEDIC_YOGA_FAMILY_LABELS as Record<string, string>)[String(y.suppressedBy)] ?? s(y.suppressedBy), s(y.evidence)]);
      if (suppressed.length) {
        b.h(3, "Bastırılan yogalar");
        b.table(["Yoga", "Aile", "Bastıran aile", "Kanıt"], suppressed, { widths: [1.5, 1.1, 1.4, 4] });
        b.p("Kural sağlandı, ancak klasik öncelik gereği üst sıradaki aile öne geçti (Akriti, Asraya'nın; Akriti, Asraya ve Dala, Sankhya'nın önüne geçer). Bu yogalar haritada oluşmuş sayılmaz.", "muted");
      }
      return;
    }
    case "vedic.varga": {
      const dv = isObj(t.division) ? t.division : {};
      const lg = isObj(t.lagna) ? t.lagna : null;
      b.kv([
        ...frameKv(t.frame),
        ["Bölüm", `D${s(dv.number)}${typeof dv.sanskritName === "string" ? ` · ${dv.sanskritName}` : ""}${typeof dv.name === "string" ? ` (${dv.name})` : ""}`],
        ["Varga Lagna", lg ? `${signL(lg.rashi)}${lg.vargottama === true ? " · vargottama" : ""}` : DASH],
        ["Vargottama grahalar", arr(t.vargottama).length ? list(t.vargottama, grahaL) : DASH],
      ]);
      const rows = arr(t.grahas).map((g) => [grahaL(g.id), signL(g.d1Rashi), signL(g.rashi), houseL(g.house), g.vargottama === true ? "Evet" : "", g.retrograde === true ? "R" : ""]);
      b.h(3, "Varga yerleşimleri");
      b.table(["Graha", "D1 rashi", "Varga rashi", "Varga bhava", "Vargottama", "Retro"], rows, { empty: "Kayıtta varga verisi yok." });
      return;
    }
    case "vedic.dasha":
    case "kp.dasha":
      return dasha(b, technique, t);
    case "vedic.drishti": {
      b.kv([
        ["Zodyak", "Sidereal (Lahiri, sabit)"],
        ["Yöntem", "Parashari bütün-burç graha drishti"],
      ]);
      const rows = arr(t.aspects).map((a) => [grahaL(a.from), grahaL(a.to), num(a.type) !== null ? `${a.type}. bakış` : DASH]);
      b.h(3, "Graha bakışları");
      b.table(["Bakan", "Bakılan", "Bakış"], rows, { empty: "Kayıtta bakış yok." });
      const mu = arr(t.mutual).map((m) => [grahaL(m.a), grahaL(m.b), num(m.type) !== null ? `${m.type}. bakış` : DASH]);
      if (mu.length) {
        b.h(3, "Karşılıklı bakışlar");
        b.table(["Graha 1", "Graha 2", "Bakış"], mu);
      }
      return;
    }
    case "vedic.ashtakavarga": {
      b.kv(frameKv(t.frame));
      const row = (r: O) => [grahaL(r.id), ...Array.from({ length: 12 }, (_, i) => s(arr<unknown>(r.bindus)[i])), s(r.total)];
      const cols = ["", ...SIGN_ABBR, "Top."];
      const widths = [1.6, ...Array(12).fill(0.62), 0.8];
      const sav = isObj(t.sav) ? t.sav : null;
      b.h(3, "Bhinnashtakavarga (BAV)");
      b.table(cols, [...arr(t.bav).map(row), ...(sav ? [["SAV", ...Array.from({ length: 12 }, (_, i) => s(arr<unknown>(sav.bindus)[i])), s(sav.total)]] : [])], { widths, compact: true, empty: "Kayıtta ashtakavarga verisi yok." });
      const rsav = isObj(t.reducedSav) ? t.reducedSav : null;
      if (arr(t.reducedBav).length) {
        b.h(3, "İndirgenmiş (shodhita) BAV");
        b.table(cols, [...arr(t.reducedBav).map(row), ...(rsav ? [["SAV", ...Array.from({ length: 12 }, (_, i) => s(arr<unknown>(rsav.bindus)[i])), s(rsav.total)]] : [])], { widths, compact: true });
      }
      const sp = arr(t.shodhyaPinda).map((x) => [grahaL(x.id), s(x.rashiPinda), s(x.grahaPinda), s(x.total)]);
      if (sp.length) {
        b.h(3, "Shodhya Pinda");
        b.table(["Graha", "Rashi pinda", "Graha pinda", "Toplam"], sp);
      }
      return;
    }
    case "vedic.shadbala": {
      b.kv(frameKv(t.frame));
      const rows = arr(t.planets).map((p) => [grahaL(p.id), fix(p.sthanaBala, 1), fix(p.digBala, 1), fix(p.kalaBala, 1), fix(p.chestaBala, 1), fix(p.naisargikaBala, 1), fix(p.drikBala, 1), fix(p.totalRupas, 2), fix(p.minRequired, 2), fix(p.strengthRatio, 2), s(p.rank)]);
      b.h(3, "Shadbala (bileşenler virupa; toplam rupa)");
      b.table(["Graha", "Sthana", "Dig", "Kala", "Chesta", "Naisarg.", "Drik", "Toplam", "Asgari", "Oran", "Sıra"], rows, { widths: [1.8, 0.9, 0.8, 0.8, 0.9, 0.9, 0.8, 0.9, 0.9, 0.8, 0.6], compact: true, empty: "Kayıtta shadbala verisi yok." });
      const ip = arr(t.planets).map((p) => [grahaL(p.id), fix(p.ishtaPhala, 2), fix(p.kashtaPhala, 2)]);
      if (ip.length) {
        b.h(3, "Ishta / Kashta Phala");
        b.table(["Graha", "Ishta", "Kashta"], ip);
      }
      return;
    }
    case "vedic.panchanga": {
      const ti = isObj(t.tithi) ? t.tithi : {};
      const nk = isObj(t.nakshatra) ? t.nakshatra : {};
      const yg = isObj(t.nityaYoga) ? t.nityaYoga : {};
      const kr = isObj(t.karana) ? t.karana : {};
      b.kv([
        ["Zodyak", "Sidereal (Lahiri, sabit)"],
        ["Güneş boylamı", lonPos(t.sunLongitude)],
        ["Ay boylamı", lonPos(t.moonLongitude)],
        ["Tithi", `${s(ti.number)}. ${s(ti.name)} · ${ti.paksha === "shukla" ? "Shukla paksha" : ti.paksha === "krishna" ? "Krishna paksha" : DASH} · %${fix(ti.percent, 1)}`],
        ["Tithi yöneticisi", ti.rulingPlanet ? grahaL(ti.rulingPlanet) : DASH],
        ["Nakshatra", `${num(nk.index) !== null ? `${(nk.index as number) + 1}. ` : ""}${nakL(nk.id)}${num(nk.pada) !== null ? ` (${nk.pada}. pada)` : ""} · lord ${grahaL(nk.lord)}`],
        ["Nitya yoga", `${s(yg.number)}. ${s(yg.name)} · %${fix(yg.percent, 1)}`],
        ["Karana", `${typeof kr.id === "string" ? (KARANA_LABELS[kr.id] ?? kr.id) : s(kr.name)} · %${fix(kr.percent, 1)}${kr.movable === true ? " · hareketli" : kr.movable === false ? " · sabit" : ""}`],
      ]);
      return;
    }
    case "vedic.transit": {
      // TRANSİT-02: Türkçe teknik başlıklar + Türkçe teknik özet (yorum değil) + natal referans + terimler.
      const at = isObj(t.at) ? t.at : {};
      const fr = isObj(t.frame) ? t.frame : {};
      b.kv([
        ["Zodyak", "Sidereal (nirayana)"],
        ["Ayanamsa", `${ayL(fr.ayanamsa ?? "lahiri")}${num(fr.ayanamsaDegrees) !== null ? ` · ${formatDegree(num(fr.ayanamsaDegrees)!)}` : ""} — bu teknikte sabit (sağlayıcı başka ayanamsa kabul etmez)`],
        ["Transit anı (UTC)", utcTr(at.utc)],
        ["Transit anı (doğum ofsetinde)", `${localTr(at.local)} (${offset(at.utcOffsetHours)})`],
        ["Lagna rashisi", signL(t.lagnaRashi)],
        ["Janma rashisi (natal Ay)", signL(t.janmaRashi)],
        ["Yavaş grahalar", arr(t.slow).length ? list(t.slow, grahaL) : DASH],
      ]);
      b.p("Klasik Gochara evleri Janma Rashi'den (natal Ay burcu) sayılır; Lagna'dan bhava ayrıca verilir. Drishti Parashari bütün-burç kuralıdır (herkes 7.; Mars 4./8.; Jüpiter 5./9.; Satürn 3./10.; Rahu/Ketu bakış atmaz). Batı açıları (kare, üçgen vb.) bu teknikte kullanılmaz.", "muted");
      const rows = arr(t.transits).map((x) => {
        const k = isObj(x.kaksha) ? x.kaksha : null;
        return [
          `${grahaL(x.id)}${arr<unknown>(t.slow).includes(x.id) ? " (yavaş)" : ""}`,
          pos(x.rashi, x.degreeInRashi),
          num(x.houseFromMoon) === null ? DASH : `${num(x.houseFromMoon)}.`,
          num(x.natalHouse) === null ? DASH : `${num(x.natalHouse)}.`,
          arr(x.drishti).length ? arr(x.drishti).map((d) => `${grahaL(d.to)} (${d.type === 1 ? "aynı rashi" : `${s(d.type)}. bakış`})`).join(", ") : x.id === "rahu" || x.id === "ketu" ? "bakış yok (Rahu/Ketu)" : DASH,
          k ? `${s(k.number)}/8 · ${k.lord === "lagna" ? "Lagna" : grahaL(k.lord)}${k.bindu === true ? ` · bindu var (${s(k.binduCount)}/8)` : k.bindu === false ? ` · bindu yok (${s(k.binduCount)}/8)` : " · bindu uygulanmaz"}` : DASH,
        ];
      });
      b.h(3, "Gochara tablosu");
      b.table(["Transit graha", "Rashi ve derece", "Janma Rashi'den ev", "Lagna'dan bhava", "Natal grahaya drishti", "Kaksha · yönetici · bindu"], rows, {
        widths: [1.5, 1.5, 1, 1, 2.4, 2],
        compact: true,
        empty: "Kayıtta transit verisi yok.",
      });
      const tech = t as unknown as VedicTransitTechnical;
      const summary = arr(t.transits).length ? gocharaSummary(tech) : [];
      if (summary.length) {
        b.h(3, "Türkçe teknik özet");
        b.p(GOCHARA_SUMMARY_NOTE, "muted");
        b.bullets(summary.map((x) => x.text));
      }
      const natal = arr(t.natal).map((n) => [grahaL(n.id), pos(n.rashi, num(n.longitude) !== null ? (num(n.longitude) as number) % 30 : null), num(n.house) === null ? DASH : `${num(n.house)}.`]);
      if (natal.length) {
        b.h(3, "Natal grahalar (Gochara referansı)");
        b.table(["Natal graha", "Rashi ve derece", "Lagna'dan bhava"], natal, { widths: [2, 2.5, 1.5], compact: true });
      }
      b.h(3, "Terimler");
      b.table(["Terim", "Açıklama"], GOCHARA_TERMS.map(([k, v]) => [k, v]), { widths: [1.4, 5], compact: true });
      return;
    }
  }
}


const DASHA_LEVEL: Record<string, string> = { mahadasha: "Mahadasha", antardasha: "Antardasha (bhukti)", pratyantardasha: "Pratyantardasha" };

function dasha(b: B, technique: string, t: O) {
  const path = isObj(t.path) ? t.path : {};
  const moon = isObj(t.moon) ? t.moon : {};
  const bal = isObj(t.balance) ? t.balance : null;
  const parent = isObj(t.parent) ? t.parent : null;
  b.kv([
    ...frameKv(t.frame),
    ["Sistem", "Vimshottari"],
    ["Düzey", typeof t.level === "string" ? (DASHA_LEVEL[t.level] ?? t.level) : DASH],
    ["Yol", [path.mahadasha, path.antardasha].filter(Boolean).map(grahaL).join(" / ") || DASH],
    ["Ay nakshatrası lordu", grahaL(moon.nakshatraLord)],
    ["Doğumdaki bakiye", bal ? `${s(bal.years)} yıl ${s(bal.months)} ay ${s(bal.days)} gün` : DASH],
    ["Üst dönem", parent ? `${grahaL(parent.lord)} · ${localTr(parent.start)} – ${localTr(parent.end)}` : DASH],
    ["Tarih ofseti", offset(t.utcOffsetHours)],
  ]);
  const periods = arr(t.periods);
  const kp = technique === "kp.dasha" && periods.some((p) => isObj(p.kp));
  const rows = periods.map((p) => {
    const r = [grahaL(p.lord), localTr(p.start), localTr(p.end), fix(p.durationYears, 2)];
    if (kp) {
      const k = isObj(p.kp) ? p.kp : null;
      const lv = k && isObj(k.levels) ? k.levels : {};
      r.push(k ? houseL(k.house) : DASH, k ? grahaL(k.starLord) : DASH, k ? grahaL(k.subLord) : DASH, k ? [1, 2, 3, 4].map((n) => `L${n}: ${list((lv as O)[n])}`).join(" · ") : DASH);
    }
    return r;
  });
  b.h(3, "Dönemler");
  b.table(
    kp ? ["Lord", "Başlangıç", "Bitiş", "Yıl", "Ev", "Yıldız L.", "Sub L.", "Significator evleri"] : ["Lord", "Başlangıç", "Bitiş", "Süre (yıl)"],
    rows,
    { widths: kp ? [1.3, 1.2, 1.2, 0.6, 0.7, 1.1, 1.1, 2.8] : [2, 2, 2, 1], compact: kp, empty: "Kayıtta dönem yok." },
  );
  // 2026-10-20: ekranda açılan alt dönemler bu kayda girmez (GA-P2-02 kararı: kayıt tek düzey) — rapor bunu açıkça söyler.
  if (t.level === "mahadasha" || t.level === "antardasha")
    b.p(`Bu kayıt yalnız ${DASHA_LEVEL[t.level]} düzeyini içerir. Ekranda açılan alt dönemler bu rapora girmez; raporda yer almaları için alt düzey "Bu düzeyi seçiciye aktar" ile ayrı analiz olarak kaydedilmelidir.`, "muted");
  if (kp) nodeNote(b, KP_NODE_SIG_SOURCE.dasha, "KP dasha");
}

// ─── KP ──────────────────────────────────────────────────────────────────────

const kpPointCells = (p: O) => [pos(p.rashi, p.degreeInRashi), grahaL(p.signLord), nakCell(p.nakshatra), grahaL(p.starLord), grahaL(p.subLord), p.subSubLord ? grahaL(p.subSubLord) : DASH];
const kpFrame = (t: O): [string, string][] => {
  const f = isObj(t.frame) ? t.frame : {};
  return [
    ["Zodyak", "Sidereal (KP)"],
    ["Ayanamsa", `${ayL(f.ayanamsa)}${num(f.ayanamsaDegrees) !== null ? ` · ${deg(f.ayanamsaDegrees)}` : ""}`],
    ["Ev sistemi", "Placidus"],
    ["Ay düğümü", t.nodeType === "true" ? "Gerçek düğüm" : t.nodeType === "mean" ? "Ortalama düğüm" : DASH],
  ];
};
const lordSet = (v: unknown) => (isObj(v) ? `Burç ${grahaL(v.sign)} · Yıldız ${grahaL(v.star)} · Sub ${grahaL(v.sub)} · Sub-sub ${grahaL(v.subSub)}` : DASH);

function nodeNote(b: B, method: KpNodeSigMethodId, context: string) {
  const m = KP_NODE_SIG_METHODS[method];
  b.p(`Rahu/Ketu significator kuralı (${context}): ${m.label}. ${m.status}`, "muted");
}

function kpCuspsBodies(b: B, t: O) {
  const cusps = arr(t.cusps).map((c) => [houseL(c.house), ...kpPointCells(c)]);
  if (cusps.length) {
    b.h(3, "Cusp'lar (Placidus)");
    b.table(["Ev", "Rashi ve derece", "Burç L.", "Nakshatra", "Yıldız L.", "Sub L.", "Sub-sub L."], cusps, { widths: [0.8, 1.6, 1.3, 1.6, 1.3, 1.3, 1.3], compact: true });
  }
  const bodies = arr(t.bodies).map((x) => [grahaL(x.id), ...kpPointCells(x), houseL(x.house), x.retrograde === true ? "R" : ""]);
  b.h(3, "Gezegenler");
  b.table(["Graha", "Rashi ve derece", "Burç L.", "Nakshatra", "Yıldız L.", "Sub L.", "Sub-sub L.", "Ev", "Retro"], bodies, { widths: [1.5, 1.5, 1.2, 1.5, 1.2, 1.2, 1.2, 0.7, 0.5], compact: true, empty: "Kayıtta gezegen verisi yok." });
}

function kpSignificators(b: B, sig: unknown, method: KpNodeSigMethodId) {
  const sg = isObj(sig) ? sig : null;
  if (!sg) return;
  const hs = arr(sg.houses).map((h) => {
    const lv = isObj(h.levels) ? h.levels : {};
    return [houseL(h.house), ...[1, 2, 3, 4].map((n) => list(lv[n], grahaL))];
  });
  if (hs.length) {
    b.h(3, "Ev significator'ları (4 düzey)");
    b.table(["Ev", "L1 · yıldızı sakinde", "L2 · sakin", "L3 · yıldızı sahipte", "L4 · sahip"], hs, { widths: [0.8, 2, 2, 2, 2], compact: true });
  }
  const ps = arr(sg.planets).map((p) => {
    const lv = isObj(p.levels) ? p.levels : {};
    return [grahaL(p.id), ...[1, 2, 3, 4].map((n) => list(lv[n]))];
  });
  if (ps.length) {
    b.h(3, "Gezegen significator'ları (ev numaraları)");
    b.table(["Graha", "L1", "L2", "L3", "L4"], ps, { widths: [1.8, 1.5, 1.5, 1.5, 1.5], compact: true });
  }
  nodeNote(b, method, "bu tablo");
}

// ─── TRANSİT-03: KP Transit zaman aralığı raporu (ekrandaki tablolarla aynı veri; yeni hesap YOK) ───────────────
const kpTz = (v: unknown): string => {
  if (typeof v !== "string" || !v) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return v;
  } catch {
    return "UTC";
  }
};
/** UTC anı → seçilen bölgede "GG.AA.YYYY SS:DD GMT+3" (UTC ise "… UTC"). */
const kpAtZone = (utcIso: unknown, tz: string) => {
  if (typeof utcIso !== "string" || !Number.isFinite(Date.parse(utcIso))) return DASH;
  if (tz === "UTC") return utcTr(utcIso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" })
      .formatToParts(new Date(Date.parse(utcIso)))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute} ${p.timeZoneName}`;
};
const gShort = (v: unknown) => (typeof v === "string" ? (GRAHA_LABELS[v] ?? v).split(" ")[0] : DASH);

/** Kip etiketi gerçekten seçilen içeriklerden (yalnız konum tablosu → "geçişleri" demez). Tür yoksa (eski/eksik kayıt) yalnız "Zaman aralığı". */
export function kpTimingModeLabel(kinds: unknown[]): string {
  const ev = [kinds.includes("sublord") ? "Sub-Lord" : null, kinds.includes("rasi") ? "Rasi" : null].filter(Boolean);
  const parts = [ev.length ? `${ev.join(" / ")} geçişleri` : null, kinds.includes("positions") ? "KP konum tablosu" : null].filter(Boolean);
  return parts.length ? `Zaman aralığı (${parts.join(" + ")})` : "Zaman aralığı";
}

/** ATL-P3-11: rapor ham parça kimliği ("sublord:moon") yazmaz — ekrandaki (KpTimingPanel) Türkçe karşılıkla aynı. */
export const kpMissingLabel = (m: string) => {
  const [k, p] = m.split(":");
  return `${k === "sublord" ? "Sub-Lord" : k === "rasi" ? "Rasi" : "Konum tablosu"}${p ? ` (${GRAHA_LABELS[p] ?? p})` : ""}`;
};
/** ATL-P3-11: KP dönem gücü etiketi ham İngilizce yerine ekrandaki Türkçe karşılık (ProviderInterpretationPanel KP_STRENGTH_TR). */
export const KP_STRENGTH_LABEL: Record<string, string> = { "very-strong": "çok güçlü bağ", strong: "güçlü bağ", moderate: "orta bağ", weak: "zayıf bağ" };

function kpTimingReport(b: B, t: O, opts: O) {
  const tz = kpTz(opts.displayTz);
  const w = isObj(t.window) ? t.window : {};
  b.kv([
    ...kpFrame(t).filter(([k]) => k !== "Ev sistemi"),
    ["Kip", kpTimingModeLabel(arr<unknown>(t.kinds))],
    ["Aralık", `${dateTr(w.startDate)} – ${dateTr(w.endDate)} (UTC günleri, iki uç dahil)`],
    ["Gösterim saat dilimi", tz],
    ["Gezegenler", arr<unknown>(t.planets).length ? list(t.planets, grahaL) : DASH],
  ]);
  b.p("Anlar sağlayıcıdan UTC alınmış ve seçilen saat diliminde gösterilmiştir (yaz/kış saati her an için ayrı). KP yalnız KP numarası, yıldız (nakshatra) lordu, sub-lord ve rasi ile okunur; Batı açıları bu teknikte yoktur.", "muted");
  const missing = arr<unknown>(t.missing).filter((x): x is string => typeof x === "string");
  if (missing.length) b.p(`Hesaplanamayan parçalar: ${missing.map(kpMissingLabel).join(", ")} — bu parçalar için liste eksiktir.`, "warn");
  const kinds = arr<unknown>(t.kinds);
  if (kinds.includes("sublord")) {
    const rows = arr(t.sublord)
      .flatMap((x) => arr(x.changes).map((c): O => ({ ...c, planet: x.planet })))
      .sort((a, z) => String(a.atUtc).localeCompare(String(z.atUtc)))
      .map((c) => [kpAtZone(c.atUtc, tz), grahaL(c.planet), `${kpSplitFromLabel(c.fromKp, c.toKp)} · ${gShort(c.fromStar)} / ${gShort(c.fromSub)}`, `${s(c.toKp)} · ${gShort(c.toStar)} / ${gShort(c.toSub)}${c.fromStar !== c.toStar ? " (yıldız değişti)" : ""}${isObj(c.corrected) ? " *" : ""}`, utcTr(c.atUtc)]);
    b.h(3, `Sub-Lord değişimleri (${rows.length})`);
    b.table([`An (${tz})`, "Gezegen", "Önceki KP · yıldız / sub", "Yeni KP · yıldız / sub", "UTC (tarih ve saat)"], rows, { widths: [1.7, 1.15, 1.75, 2.1, 1.6], compact: true, empty: "Bu aralıkta Sub-Lord değişimi yok." });
    if (arr(t.sublord).some((x) => arr(x.changes).some((c) => isObj(c.corrected)))) b.p(KP_PROVIDER_CORRECTION_NOTE, "muted");
  }
  if (kinds.includes("rasi")) {
    const rows = arr(t.rasi)
      .flatMap((x) => arr(x.changes).map((c): O => ({ ...c, planet: x.planet })))
      .sort((a, z) => String(a.atUtc).localeCompare(String(z.atUtc)))
      .map((c) => [kpAtZone(c.atUtc, tz), grahaL(c.planet), `${signL(c.fromRashi)} (${gShort(c.fromLord)})`, `${signL(c.toRashi)} (${gShort(c.toLord)})`, utcTr(c.atUtc)]);
    b.h(3, `Rasi (burç) geçişleri (${rows.length})`);
    b.table([`An (${tz})`, "Gezegen", "Çıkılan burç (yönetici)", "Girilen burç (yönetici)", "UTC (tarih ve saat)"], rows, { widths: [1.7, 1.15, 1.85, 1.85, 1.6], compact: true, empty: "Bu aralıkta rasi geçişi yok." });
  }
  const pos = isObj(t.positions) ? t.positions : null;
  if (pos) {
    // Geniş tablo sayfa taşmasın: her an için 9 graha ayrı satır (an · graha · rashi/derece · KP no · yıldız/sub · retro).
    const rows = arr(pos.rows).flatMap((r) => arr(r.bodies).map((x, i) => [i === 0 ? kpAtZone(r.atUtc, tz) : "", grahaL(x.id), pos2(x), s(x.kpNumber), `${gShort(x.starLord)} / ${gShort(x.subLord)}`, x.retrograde === true && x.id !== "rahu" && x.id !== "ketu" ? "℞" : ""]));
    b.h(3, `KP konum tablosu (${arr(pos.rows).length} an · ${num(pos.intervalMinutes) !== null && (num(pos.intervalMinutes) as number) >= 60 ? `${(num(pos.intervalMinutes) as number) / 60} saatte bir` : `${s(pos.intervalMinutes)} dk`})`);
    b.table([`An (${tz})`, "Graha", "Rashi ve derece", "KP no", "Yıldız / sub", "Retro"], rows, { widths: [1.8, 1.4, 1.6, 0.7, 1.6, 0.5], compact: true });
  }
}
const pos2 = (x: O) => (typeof x.rashi === "string" && num(x.degreeInRashi) !== null ? `${signL(x.rashi)} ${formatDegree(num(x.degreeInRashi)!)}` : DASH);

function kp(b: B, technique: string, t: O, opts: O, birth: { lat: number; lon: number } | null) {
  const placeLabel = isObj(opts.place) && typeof opts.place.label === "string" ? opts.place.label : null;
  switch (technique) {
    case "kp.chart": {
      const asc = isObj(t.ascendant) ? t.ascendant : null;
      b.kv([...kpFrame(t), ["Lagna (ASC)", asc ? `${pos(asc.rashi, asc.degreeInRashi)} · Yıldız ${grahaL(asc.starLord)} · Sub ${grahaL(asc.subLord)}` : DASH]]);
      kpCuspsBodies(b, t);
      kpSignificators(b, t.significators, KP_NODE_SIG_SOURCE.chart);
      return;
    }
    case "kp.ruling": {
      const at = isObj(t.at) ? t.at : {};
      const pl = isObj(t.place) ? t.place : {};
      // AŞAMA 2 (2026-10-21) eksiksizlik denetimi: etiketler ekranla aynı (doğum ofsetinde yerel an, gözlem yeri, Lagna = an);
      // yöntem açıklaması ekranla ORTAK metin (önceden yalnız ekranda vardı).
      b.kv([
        ["Zodyak", "Sidereal (KP-Newcomb, sabit)"],
        ["An", `${utcTr(at.utc)} · doğum ofsetinde ${localTr(at.local)}`],
        ["Gözlem yeri", placeLabel ? `${placeLabel} (${coord(pl.latitude, pl.longitude)})` : coord(pl.latitude, pl.longitude)],
        ["Gün lordu", grahaL(t.dayLord)],
        ["Ay lordları", lordSet(t.moon)],
        ["Lagna (an) lordları", lordSet(t.lagna)],
        ["Ruling planets (güç sırası)", list(t.rulingPlanets, grahaL)],
      ]);
      b.p(KP_RULING_METHOD_NOTE, "muted");
      const sg = arr(t.significators).map((x) => [grahaL(x.id), list(x.houses)]);
      if (t.significatorsOmitted === "place_differs") {
        b.p("Gözlem yeri doğum yerinden farklı olduğu için natal significator'lar bu hesapta alınmadı (sağlayıcı bu uçta natal haritayı da gözlem yerinde kurar). Natal significator'lar için KP doğum haritası analizini kullanın.", "muted");
        return;
      }
      // 9A-P2-04: Aşama 9A öncesi kayıt + gözlem yeri ≠ doğum yeri → significator'lar yanlış konumdan.
      if (birth && sg.length && (Math.abs(Number(pl.latitude) - birth.lat) > 1e-6 || Math.abs(Number(pl.longitude) - birth.lon) > 1e-6)) {
        b.p("Uyarı: Bu eski kayıtta gözlem yeri doğum yerinden farklı; aşağıdaki significator'lar doğum yeri yerine gözlem yeri haritasından hesaplanmıştır ve natal significator olarak kullanılmamalıdır.", "warn");
      }
      b.h(3, "Ruling planet'lerin natal evleri (güç sırası)");
      if (sg.length) b.p(KP_RULING_SIG_NOTE, "muted");
      b.table(["Graha", "Evler"], sg, { widths: [1, 2], empty: "Kayıtta significator yok." });
      // Ekranla aynı: Rahu/Ketu kuralı yalnız listede düğüm varsa açıklanır.
      if (arr(t.significators).some((x) => x.id === "rahu" || x.id === "ketu")) nodeNote(b, KP_NODE_SIG_SOURCE.ruling, "ruling");
      return;
    }
    case "kp.transit": {
      if (t.schema === KP_TIMING_TECHNICAL_SCHEMA) {
        kpTimingReport(b, t, opts);
        return;
      }
      const at = isObj(t.at) ? t.at : {};
      b.kv([...kpFrame(t).filter(([k]) => k !== "Ev sistemi"), ["An", utcTr(at.utc)]]);
      b.p("KP transit tek an için KP efemerisidir; natal cusp'lara göre ev analizi sağlayıcıda yoktur.", "muted");
      const rows = arr(t.bodies).map((x) => [grahaL(x.id), ...kpPointCells(x), x.retrograde === true ? "R" : ""]);
      b.h(3, "Transit gezegenleri");
      b.table(["Graha", "Rashi ve derece", "Burç L.", "Nakshatra", "Yıldız L.", "Sub L.", "Sub-sub L.", "Retro"], rows, { widths: [1.5, 1.5, 1.2, 1.5, 1.2, 1.2, 1.2, 0.5], compact: true, empty: "Kayıtta gezegen verisi yok." });
      return;
    }
    case "kp.horary": {
      const at = isObj(t.at) ? t.at : {};
      const pl = isObj(t.place) ? t.place : {};
      const sp = isObj(t.span) ? t.span : {};
      const asc = isObj(t.ascendant) ? t.ascendant : null;
      const ru = isObj(t.ruling) ? t.ruling : {};
      // HORARY-KP-01: soru anı yerel saatle, iki Lagna ayrımı, cusp sub-lord tablosu. HORARY-P2: ekranla AYNI etiket; dilim =
      // displayTz → kayıtlı değerlendirme yeri → yoksa UTC + not (yalnız gösterim).
      const tz = horaryDisplayZone(opts);
      b.kv([
        ...kpFrame(t),
        ["Horary sayısı", s(t.horaryNumber)],
        ["Soru anı", typeof at.utc === "string" ? questionMomentLabel(at.utc, tz) : DASH],
        ["Soru anı (UTC)", utcTr(at.utc)],
        ["Değerlendirme yeri", placeLabel ? `${placeLabel} (${coord(pl.latitude, pl.longitude)})` : coord(pl.latitude, pl.longitude)],
        ["Sayının aralığı", num(sp.from) !== null && num(sp.to) !== null ? `${lonPos(sp.from)} – ${lonPos(sp.to)}` : DASH],
        ["Horary Lagna (sayıdan)", asc ? `${pos(asc.rashi, asc.degreeInRashi)} · Yıldız ${grahaL(asc.starLord)} · Sub ${grahaL(asc.subLord)}` : DASH],
        ["Gün lordu", grahaL(ru.dayLord)],
        ["Ay lordları", lordSet(ru.moon)],
        ["Soru anı Lagna'sı (zaman) lordları", lordSet(ru.lagna)],
        ["Ruling planets", list(ru.rulingPlanets, grahaL)],
      ]);
      b.p(KP_HORARY_TEXT.numberRule, "muted");
      b.p(KP_HORARY_TEXT.rulingRule, "muted");
      const valid = asc && isObj(ru.lagna) && Array.isArray(t.cusps) && isObj(t.significators);
      if (valid) {
        const h = t as unknown as KpHoraryTechnical;
        const c = kpHoraryLagnaContrast(h);
        b.p(
          `Horary Lagna lordları: ${grahaL(c.horary.signLord)} / ${grahaL(c.horary.starLord)} / ${grahaL(c.horary.subLord)} · Soru anı Lagna lordları: ${grahaL(c.time.sign)} / ${grahaL(c.time.star)} / ${grahaL(c.time.sub)} (burç / yıldız / sub)${c.differs ? " — bu soruda iki Lagna farklıdır." : "."}`,
          "muted",
        );
        const rows = kpCuspSublordRows(h).map((r) => [
          houseL(r.house),
          grahaL(r.subLord),
          ...[1, 2, 3, 4].map((l) => {
            if (!r.levels) return DASH;
            const plain = r.levels[l as 1 | 2 | 3 | 4];
            const extra = r.agent ? r.agent.levels[l as 1 | 2 | 3 | 4].filter((x) => !plain.includes(x)) : [];
            return `${plain.join(", ") || DASH}${extra.length ? ` +${extra.join(", ")}` : ""}`;
          }),
        ]);
        b.h(3, "Cusp sub lordları ve gösterdikleri evler");
        b.table(["Ev", "Sub lord", "L1 · yıldızı sakinde", "L2 · sakin", "L3 · yıldızı sahipte", "L4 · sahip"], rows, { widths: [0.8, 1.4, 1.6, 1.4, 1.6, 1.4], compact: true });
        b.p(`${KP_HORARY_TEXT.cuspSubRule}${kpCuspSublordRows(h).some((r) => r.isNode) ? ` ${KP_HORARY_TEXT.nodeRule}` : ""}`, "muted");
      }
      kpCuspsBodies(b, t);
      kpSignificators(b, t.significators, KP_NODE_SIG_SOURCE.horaryLevels);
      b.p(KP_HORARY_TEXT.source, "muted");
      return;
    }
  }
}

// ─── Roxy yorum katmanı (yalnız görünürse) ───────────────────────────────────

function interpBlocks(b: B, technique: string, c: O, people: { a: string; b: string }, opts: O = {}) {
  const para = (label: string | null, text: unknown) => {
    if (typeof text === "string" && text.trim()) {
      if (label) b.h(3, label);
      b.p(text);
    }
  };
  const kw = (v: unknown) => (arr<unknown>(v).length ? `Anahtar kelimeler: ${list(v)}` : "");
  switch (c.schema) {
    case "astro.western.natal.interp.v1":
    case "astro.western.relocation.interp.v1":
      for (const x of arr(c.bodies)) {
        para(bodyL(x.id), [x.summary, x.detailed].filter((y) => typeof y === "string" && y.trim()).join("\n\n"));
        b.p(kw(x.keywords), "muted");
      }
      for (const x of arr(c.aspects)) {
        para(`${bodyL(x.a)} ${aspectL(x.type)} ${bodyL(x.b)}`, x.summary);
        b.p(kw(x.keywords), "muted");
      }
      for (const x of arr(c.patterns)) para(typeof x.kind === "string" ? ((PATTERN_LABELS as Record<string, string>)[x.kind] ?? x.kind) : null, x.text);
      if (isObj(c.overall)) para("Genel", c.overall.aspectSummary);
      para("Özet", c.summary);
      return;
    case "astro.western.transit.interp.v1":
      for (const x of arr(c.aspects)) {
        para(`Transit ${bodyL(x.transit)} ${aspectL(x.type)} natal ${bodyL(x.natal)}`, [x.summary, x.timing, x.impact, x.guidance].filter((y) => typeof y === "string" && y.trim()).join("\n\n"));
        b.p(kw(x.keywords), "muted");
      }
      return;
    case "astro.western.forecast.interp.v1":
      // Roxy olay başına tek cümle (ayrı genel yorum yok) — aynen, tarih sırasıyla.
      b.p("Bu teknikte ayrı bir genel otomatik yorum bulunmuyor; her olayın otomatik açıklama cümlesi değiştirilmeden aktarılmıştır.", "muted");
      {
        // TRANSİT-01: analizin gösterim saat dilimi varsa yerel saat + UTC (ekrandaki "Olay Açıklamaları" ile aynı).
        const tz = zoneOpt(opts.displayTz);
        for (const x of arr(c.events)) para(typeof x.datetime === "string" ? (tz ? `${atZone(x.datetime, tz)} · ${x.datetime.slice(11, 16)} UTC` : `${localTr(x.datetime)} UTC`) : null, x.text);
      }
      return;
    case "astro.western.progression.interp.v1":
    case "astro.western.solar_arc.interp.v1":
    case "astro.western.local_space.interp.v1":
      for (const x of [...arr(c.bodies), ...arr(c.directed)]) para(bodyL(x.id), x.text);
      para("Genel", c.overall ?? c.summary);
      return;
    case "astro.western.profections.interp.v1": {
      // Sağlayıcının kısa açıklaması + özeti AYNEN; boşsa açık not (metin üretilmez).
      b.p(PROFECTIONS_INTERP_NOTE, "muted");
      const text = typeof c.text === "string" && c.text.trim() ? c.text : null;
      const summary = typeof c.summary === "string" && c.summary.trim() && c.summary !== text ? c.summary : null;
      if (!text && !summary) b.p(PROFECTIONS_INTERP_MISSING, "muted");
      if (text) b.p(text);
      para("Özet", summary);
      return;
    }
    case "astro.western.fixed_stars.interp.v1": {
      // Kavuşum anlatıları (Roxy, lang=tr) aynen; anahtar kelimeler Roxy'de İngilizce gelir → Yaşam sözlüğüyle Türkçe (özgün).
      b.p("Kavuşum metinleri otomatik yorum metinleridir (yalnız rapor orbu içindeki temaslar); anahtar kelimeler İngilizce kaynak verinin Yaşam sözlüğüyle Türkçe karşılığıdır (özgün sözcük parantez içinde).", "muted");
      for (const x of arr(c.contacts)) para(`${fixedStarName(String(x.star))} ${CONJ} ${bodyL(x.point)}`, x.text);
      const used = new Set(arr(c.contacts).map((x) => String(x.star)));
      for (const st of arr(c.stars).filter((x) => used.has(String(x.id)))) {
        const k = arr<unknown>(st.keywords).filter((y): y is string => typeof y === "string");
        if (k.length) b.p(`${fixedStarName(String(st.id))} — anahtar kelimeler: ${k.map((y) => `${starKeywordTr(y)}${starKeywordTr(y) !== y ? ` (${y})` : ""}`).join(", ")}`, "muted");
      }
      para("Sağlayıcı özeti (3° sorgu)", c.summary);
      return;
    }
    case "astro.western.return.interp.v1":
      para("Özet", c.summary);
      para("Amaç", c.purpose);
      b.bullets(arr<unknown>(c.keyThemes).filter((x): x is string => typeof x === "string"));
      return;
    case "astro.western.synastry.interp.v1":
      for (const x of arr(c.aspects)) {
        para(`${people.a}: ${bodyL(x.a)} ${aspectL(x.type)} ${people.b}: ${bodyL(x.b)}`, [x.short, x.long, x.relationshipContext].filter((y) => typeof y === "string" && y.trim()).join("\n\n"));
        b.p(kw(x.keywords), "muted");
      }
      if (isObj(c.overall)) {
        para("Genel", c.overall.text);
        if (arr(c.overall.strengths).length) b.bullets(arr<unknown>(c.overall.strengths).map((x) => `Güçlü yan: ${s(x)}`));
        if (arr(c.overall.challenges).length) b.bullets(arr<unknown>(c.overall.challenges).map((x) => `Zorluk: ${s(x)}`));
      }
      return;
    case "astro.western.composite.interp.v1":
      // AŞAMA 2: ekrandaki anahtar kelimeler rapora da (yalnız yorum görünürken — bu blok yorum yetkisi kapısının arkasında).
      for (const x of arr(c.bodies)) {
        para(bodyL(x.id), [x.summary, x.relationshipMeaning].filter((y) => typeof y === "string" && y.trim()).join("\n\n"));
        if (arr(x.keywords).length) b.p(kw(x.keywords), "muted");
      }
      if (isObj(c.overall)) {
        para("Genel", c.overall.summary);
        if (arr(c.overall.strengths).length) b.bullets(arr<unknown>(c.overall.strengths).map((x) => `Güçlü yan: ${s(x)}`));
        if (arr(c.overall.challenges).length) b.bullets(arr<unknown>(c.overall.challenges).map((x) => `Zorluk: ${s(x)}`));
      }
      return;
    case "astro.western.astrocartography.interp.v1":
      for (const x of arr(c.lines)) para(`${bodyL(x.id)} · ${typeof x.angle === "string" ? x.angle.toUpperCase() : DASH} hattı`, x.text);
      para("Özet", c.summary);
      return;
    case "astro.vedic.d1.interp.v1":
      // 2026-10-12 (UAT madde 13 G): graha (rashi / nakshatra) yorumları ekranda vardı ama Word/PDF'e AKTARILMIYORDU.
      for (const x of arr(c.grahas)) para(`${grahaL(x.id)} (rashi / nakshatra)`, [x.rashi, x.nakshatra].filter((y) => typeof y === "string" && y.trim()).join("\n\n"));
      for (const x of arr(c.houses)) {
        para(houseL(x.number), x.description);
        if (arr(x.themes).length) b.p(`Temalar: ${list(x.themes)}`, "muted");
      }
      for (const x of arr(c.yogas)) {
        const name = typeof x.id === "string" && VEDIC_YOGA_NAMES[x.id] ? `${VEDIC_YOGA_NAMES[x.id]} Yoga` : s(x.id);
        para(`Yoga: ${name}`, [x.description, x.result].filter((y) => typeof y === "string" && y.trim()).join("\n\n"));
      }
      return;
    case "astro.vedic.varga.interp.v1":
      para("Bölümün anlamı", c.significance);
      return;
    case "astro.vedic.dasha.interp.v1":
      para("Üst dönem", c.parent);
      for (const x of arr(c.periods)) para(`${grahaL(x.lord)} · ${localTr(x.start)}`, x.text);
      if (arr(c.kpStrength).length) {
        b.h(3, "Dönem gücü (sağlayıcı değerlendirmesi)");
        b.table(["Lord", "Başlangıç", "Puan", "Derece", "Etiket"], arr(c.kpStrength).map((x) => [grahaL(x.lord), localTr(x.start), s(x.score), s(x.grade), KP_STRENGTH_LABEL[s(x.label)] ?? s(x.label)]));
      }
      if (arr(c.houseThemes).length) {
        b.h(3, "Ev temaları");
        b.table(["Ev", "Anahtar kelimeler"], arr(c.houseThemes).map((x) => [houseL(x.house), list(x.keywords)]), { widths: [1, 4] });
      }
      return;
    case "astro.vedic.shadbala.interp.v1":
      for (const x of arr(c.themes)) para(s(x.name), x.meaning);
      return;
    case "astro.vedic.panchanga.interp.v1":
      para("Nakshatra", c.nakshatra);
      para("Yoga", c.yoga);
      para("Karana", c.karana);
      return;
    case "astro.vedic.transit.interp.v1":
      // Sağlayıcı bu metni Türkçe istek olmasına rağmen İngilizce döndürür; aynen korunur (çevrilmez), ekrandaki gibi belirtilir.
      if (arr(c.keyTransits).length) b.p("Not: Bu bölümün otomatik metni yalnız İngilizce mevcuttur; metin değiştirilmeden aktarılmıştır.", "muted");
      for (const x of arr(c.keyTransits)) para(grahaL(x.id), x.text);
      return;
    case "astro.kp.chart.interp.v1":
    case "astro.kp.extra.interp.v1":
      if (arr(c.houseThemes).length) {
        b.h(3, "Ev temaları");
        b.table(["Ev", "Anahtar kelimeler"], arr(c.houseThemes).map((x) => [houseL(x.house), list(x.keywords)]), { widths: [1, 4] });
      }
      return;
    default:
      b.p("Bu analiz türünün otomatik yorum biçimi raporda desteklenmiyor; uygulamada görüntüleyin.", "muted");
  }
}

// ─── Ana kurucu ──────────────────────────────────────────────────────────────

export type ReportAnalysisInput = {
  id: string;
  title: string;
  technique: string;
  params?: O;
  analysisAt: string;
  profile?: unknown;
  method?: unknown;
  technical?: unknown;
  knowledgeBank?: unknown;
  notes?: unknown;
  interpretation?: unknown;
  versions?: unknown;
  /** YENİ-P2-03: getAnalysis okuma anı "eski hesap sürümü" notları. */
  legacyNotes?: unknown;
};

/** Dosya adı: Türkçe harfler ASCII'ye, güvensiz karakter → "-". */
export function asciiSlug(v: string, max = 60): string {
  const map: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };
  return (
    v
      .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c])
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "Analiz"
  );
}

function personBlock(b: B, label: string, p: O | null) {
  const r = p && isObj(p.revision) ? p.revision : null;
  if (!p || !r) return;
  b.h(3, label);
  b.kv([
    ["Profil", s(p.label)],
    ["Danışan", isObj(p.client) && typeof p.client.name === "string" ? p.client.name : DASH],
    ["Doğum tarihi", dateTr(r.birthDate)],
    ["Doğum saati", r.timeKnown === true && typeof r.birthTime === "string" ? r.birthTime.slice(0, 5) : "Bilinmiyor"],
    ["Saat doğruluğu", s(r.timeAccuracyLabel)],
    ["Doğum yeri", s(r.locationLabel)],
    ["Koordinat", coord(r.latitude, r.longitude)],
    ["Saat dilimi", s(r.timezone)],
    ["Profil revizyonu", num(r.revision) !== null ? String(r.revision) : DASH],
  ]);
  // ATL-P2-07 (2026-10-20): temsilci şehrin yerel ortalama saati ↔ doğum yeri boylamı farkı — yalnız uyarı (hesap aynen).
  const lmt = representativeLmtNotice(r);
  if (lmt) b.p(lmt.text, "warn");
}

// ─── Vedik / KP harita figürü (2026-10-15) ────────────────────────────────────────────────────────────

const VEDIC_GRAHA_ORDER: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];
const KP_AY: Record<string, string> = { "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };
const FIGURE_MISSING = "Harita bu kayıtta eksik teknik veri nedeniyle çizilemedi; teknik tablolar aşağıdadır.";
const KUNDLI_LEGEND = `${kundliLegend(VEDIC_GRAHA_ORDER)} · ʳ vakri · ᶜ yanık (asta) · ʷ graha yuddha. Kuzey düzeninde 3+ grahalı hücrede derece haritada gösterilmez (tabloda).`;
// KP harita açıklamaları ekranla ORTAK kaynaktan (KP-UX-06): KP transit figüründe cusp YOK → KP_TRANSIT_LEGEND.
const KUNDLI_NOTE = "Kuzey Hindistan düzeni (uygulamadaki varsayılan görünüm; Lagna üst ortadaki 1. ev). Kayıtlı analiz verisinden, uygulamadaki harita bileşeniyle çizilmiştir.";
const KP_NOTE = "Güney Hindistan burç düzeni; uygulamadaki KP haritasıyla aynı yerleşim. Kayıtlı analiz verisinden çizilmiştir.";

const hasPts = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every((x) => isObj(x) && typeof x.rashi === "string" && num(x.longitude) !== null);

/**
 * Teknik → harita figürü. Teknik adı VE kayıttaki şema eşleşmeli (yanlış haritanın yanlış rapora girmesi engellenir).
 * Harita çizilmeyen teknik → null; veri eksik → { missing } (rapor açık not verir, görsel uydurulmaz).
 */
const DASHA_LEVEL_TR: Record<string, string> = { mahadasha: "Mahadasha", antardasha: "Antardasha (bhukti)", pratyantardasha: "Pratyantardasha" };
const isGraha = (v: unknown): v is VedicGrahaId => typeof v === "string" && v in VIMSHOTTARI_YEARS;
const LOCAL_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DASHA_LEGEND = "Kesim genişliği dönemin süresiyle orantılıdır (uygulamadaki çizelgeyle aynı ölçek); payı %5'ten küçük ya da adı sığmayan dönemde ad yazılmaz (tarihler aşağıdaki tabloda). Ekrandaki “bugün” işareti rapora konmaz: rapor değişmez kayıttan üretilir.";
const SHADBALA_LEGEND = "Çubuk = güç oranı (toplam rupa / BPHS asgari rupa). Koyu dikey çizgi 1,00 asgari düzeyidir; yeşil asgarinin üstü, pembe altı. Sıra 1 = en güçlü (uygulamadaki grafikle aynı ölçek).";

const finite = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isBody = (v: unknown): v is BodyId => typeof v === "string" && v in BODY_COLORS;
const validPts = (v: unknown, min: number) => Array.isArray(v) && v.length >= min && v.every((q) => Array.isArray(q) && q.length >= 2 && finite(q[0], -90, 90) && finite(q[1], -540, 540));
const ACG_MAP_LEGEND = "MC (düz) ve IC (uzun kesikli) hatları sabit boylamlı dikey meridyenlerdir; AC (düz) ve DC (noktalı) hatları enleme göre eğrilen doğuş/batış hatlarıdır. Hat rengi gök cismini gösterir (lejant). Uygulamadaki varsayılan görünüm çizilir: klasik 10 gök cismi (Güneş…Plüton), dört açı. Eşdikdörtgen projeksiyon; altlık Natural Earth 1:110m (kamu malı).";
const LS_MAP_LEGEND = "Hatlar merkezden her gök cisminin doğum anındaki azimut yönünde çizilen büyük çember yollarıdır (eşdikdörtgen projeksiyonda eğri görünür). Pusula aynı azimutları gösterir: K üstte, D sağda. Kesikli = cisim ufkun altında. Uygulamadaki varsayılan görünüm: klasik 10 gök cismi. Altlık Natural Earth 1:110m (kamu malı).";

type FigureCtx = { birth: { lat: number; lon: number; label: string } | null; referenceLabel: string | null };

function vedicKpFigure(technique: string, t: O, ctx: FigureCtx = { birth: null, referenceLabel: null }): { figure: ReportFigure; caption: string; legend: string; heading?: string } | { missing: string; heading?: string } | null {
  try {
    if (technique === "western.astrocartography") {
      const heading = "Dünya haritası";
      const bs = arr(t.bodies);
      const sm = isObj(t.sampling) ? t.sampling : {};
      const valid =
        bs.length > 0 &&
        finite(sm.latitudeMin, -90, 90) &&
        finite(sm.latitudeMax, -90, 90) &&
        bs.every((x) => isBody(x.id) && finite(x.mcLongitude, -360, 360) && finite(x.icLongitude, -360, 360) && finite(x.rightAscension, -360, 360) && finite(x.declination, -90, 90) && isObj(x.asc) && isObj(x.dsc) && validPts((x.asc as O).points, 0) && validPts((x.dsc as O).points, 0));
      if (t.schema !== ACG_TECHNICAL_SCHEMA || !valid) return { missing: FIGURE_MISSING, heading };
      const d = t as unknown as AstrocartographyTechnical;
      const bodies = new Set(d.bodies.map((x) => x.id).filter((id) => CLASSICAL.has(id)));
      const angles = new Set(ACG_ANGLES);
      const lines = acgMapLines(d, bodies, angles);
      if (!lines.length) return { missing: FIGURE_MISSING, heading };
      const markers = ctx.birth ? [{ key: "birth", lat: ctx.birth.lat, lon: ctx.birth.lon, label: `Doğum: ${ctx.birth.label}` }] : [];
      return {
        figure: { type: "acgMap", lines, labels: acgMcLabels(d, bodies, angles), markers, bodies: d.bodies.map((x) => x.id).filter((id) => bodies.has(id)), angles: [...ACG_ANGLES], sampling: d.sampling },
        caption: `${figureTitle(technique)} — doğum anının gezegen hatları; kayıtlı analiz verisinden, uygulamadaki haritayla aynı projeksiyon ve hatlarla çizilmiştir.`,
        legend: ACG_MAP_LEGEND,
        heading,
      };
    }
    if (technique === "western.local_space") {
      const heading = "Dünya haritası";
      const bs = arr(t.bodies);
      const ref = isObj(t.reference) ? t.reference : {};
      const valid = finite(ref.latitude, -90, 90) && finite(ref.longitude, -180, 180) && bs.length > 0 && bs.every((x) => isBody(x.id) && finite(x.azimuth, 0, 360) && typeof x.aboveHorizon === "boolean" && typeof x.compass === "string" && finite(x.altitude, -90, 90) && validPts(x.line, 2));
      if (t.schema !== LOCAL_SPACE_TECHNICAL_SCHEMA || !valid) return { missing: FIGURE_MISSING, heading };
      const d = t as unknown as LocalSpaceTechnical;
      const bodies = new Set(d.bodies.map((x) => x.id).filter((id) => CLASSICAL.has(id)));
      const lines = localSpaceMapLines(d, bodies);
      if (!lines.length) return { missing: FIGURE_MISSING, heading };
      const label = ctx.referenceLabel ?? "doğum yeri";
      return {
        figure: { type: "localSpaceMap", lines, reference: { key: "ref", lat: d.reference.latitude, lon: d.reference.longitude, label }, compass: d.bodies.filter((x) => bodies.has(x.id)).map((x) => ({ id: x.id, azimuth: x.azimuth, aboveHorizon: x.aboveHorizon })) },
        caption: `${figureTitle(technique)} — merkez: ${label}; kayıtlı analiz verisinden, uygulamadaki harita ve pusulayla aynı hatlarla çizilmiştir.`,
        legend: LS_MAP_LEGEND,
        heading,
      };
    }
    if (technique === "vedic.dasha" || technique === "kp.dasha") {
      const heading = "Dönem çizelgesi";
      const schema = technique === "kp.dasha" ? KP_DASHA_TECHNICAL_SCHEMA : VEDIC_DASHA_TECHNICAL_SCHEMA;
      const ps = arr(t.periods);
      const valid = ps.length > 0 && ps.every((p) => isGraha(p.lord) && typeof p.start === "string" && LOCAL_DT.test(p.start) && typeof p.end === "string" && LOCAL_DT.test(p.end) && (num(p.durationYears) ?? -1) >= 0);
      if (t.schema !== schema || !valid) return { missing: FIGURE_MISSING, heading };
      const periods = ps.map((p) => ({ lord: p.lord as VedicGrahaId, start: String(p.start), end: String(p.end), durationYears: num(p.durationYears)! }));
      const level = DASHA_LEVEL_TR[String(t.level)] ?? "Dasha";
      return { figure: { type: "dashaTimeline", periods }, caption: `${figureTitle(technique)} — ${level} dönemleri; kayıtlı analiz verisinden çizilmiştir.`, legend: DASHA_LEGEND, heading };
    }
    if (technique === "vedic.transit") {
      const heading = "Gochara ev şeridi";
      const tr = arr(t.transits);
      const valid = tr.length > 0 && typeof t.janmaRashi === "string" && SIGN_IDS.includes(t.janmaRashi as SignId) && tr.every((x) => isGraha(x.id) && num(x.houseFromMoon) !== null && (num(x.houseFromMoon) as number) >= 1 && (num(x.houseFromMoon) as number) <= 12);
      if (t.schema !== VEDIC_TRANSIT_TECHNICAL_SCHEMA || !valid) return { missing: FIGURE_MISSING, heading };
      const slow = arr<unknown>(t.slow).filter((x): x is string => typeof x === "string");
      const j = SIGN_IDS.indexOf(t.janmaRashi as SignId);
      const cells = Array.from({ length: 12 }, (_, i) => ({
        house: i + 1,
        rashi: SIGN_IDS[(j + i) % 12],
        grahas: tr.filter((x) => num(x.houseFromMoon) === i + 1).map((x) => ({ id: x.id as VedicGrahaId, slow: slow.includes(String(x.id)) })),
      }));
      return { figure: { type: "gocharaStrip", cells }, caption: `${figureTitle(technique)} — kayıtlı analiz verisinden çizilmiştir.`, legend: GOCHARA_STRIP_LEGEND, heading };
    }
    if (technique === "vedic.shadbala") {
      const heading = "Güç grafiği";
      const ps = arr(t.planets);
      const valid = ps.length > 0 && ps.every((p) => isGraha(p.id) && num(p.rank) !== null && num(p.strengthRatio) !== null);
      if (t.schema !== VEDIC_SHADBALA_TECHNICAL_SCHEMA || !valid) return { missing: FIGURE_MISSING, heading };
      return { figure: { type: "shadbalaBars", planets: ps.map((p) => ({ id: p.id as VedicGrahaId, rank: num(p.rank)!, ratio: num(p.strengthRatio)! })) }, caption: `${figureTitle(technique)} — kayıtlı analiz verisinden çizilmiştir.`, legend: SHADBALA_LEGEND, heading };
    }
    if (technique === "vedic.d1") {
      if (t.schema !== VEDIC_D1_TECHNICAL_SCHEMA || !hasPts(t.grahas) || !isObj(t.lagna) || !isObj(t.frame)) return { missing: FIGURE_MISSING };
      const d = t as unknown as VedicD1Technical;
      const figure: ReportFigure = { type: "kundli", component: "kundli", style: "north", data: toKundliData(d), titles: kundliTitles(d.grahas, undefined, (d.combustion ?? []).map((c) => c.id)), grahaCount: d.grahas.length, centreLabel: "D1 Rashi" };
      return { figure, caption: `${figureTitle(technique)} — ${KUNDLI_NOTE}`, legend: KUNDLI_LEGEND };
    }
    if (technique === "vedic.varga") {
      if (t.schema !== VEDIC_VARGA_TECHNICAL_SCHEMA || !hasPts(t.grahas) || !isObj(t.lagna) || !isObj(t.division) || num(t.division.number) === null || typeof t.division.name !== "string") return { missing: FIGURE_MISSING };
      const d = t as unknown as VedicVargaTechnical;
      const figure: ReportFigure = { type: "kundli", component: "divisional", style: "north", data: toVargaChartData(d), titles: kundliTitles(d.grahas, d.division.number), grahaCount: d.grahas.length, centreLabel: `D${d.division.number} ${d.division.name}` };
      return { figure, caption: `${figureTitle(technique, d.division)} — ${KUNDLI_NOTE}`, legend: KUNDLI_LEGEND };
    }
    if (technique === "kp.chart" || technique === "kp.horary") {
      const schema = technique === "kp.chart" ? KP_CHART_TECHNICAL_SCHEMA : KP_HORARY_TECHNICAL_SCHEMA;
      if (t.schema !== schema || !hasPts(t.cusps) || !hasPts(t.bodies) || !isObj(t.ascendant) || !isObj(t.frame)) return { missing: FIGURE_MISSING };
      const d = t as unknown as KpChartTechnical | KpHoraryTechnical;
      const lagna = `Lagna ${SIGN_LABELS[d.ascendant.rashi]}`;
      const center = technique === "kp.chart" ? { title: "KP · Placidus", lines: [KP_AY[d.frame.ayanamsa] ?? String(d.frame.ayanamsa), lagna] } : { title: `Horary ${(d as KpHoraryTechnical).horaryNumber}`, lines: ["KP · Placidus", lagna] };
      return { figure: { type: "kp", cusps: d.cusps, bodies: d.bodies, center }, caption: `${figureTitle(technique)} — ${KP_NOTE}`, legend: KP_LEGEND };
    }
    if (technique === "kp.transit") {
      // TRANSİT-03: zaman aralığı kipinde harita yok (tablolar); "çizilemedi" notu da konmaz.
      if (t.schema === KP_TIMING_TECHNICAL_SCHEMA) return null;
      if (t.schema !== KP_TRANSIT_TECHNICAL_SCHEMA || !hasPts(t.bodies) || !isObj(t.frame)) return { missing: FIGURE_MISSING };
      const d = t as unknown as KpTransitTechnical;
      return { figure: { type: "kp", cusps: [], bodies: d.bodies, center: { title: "KP transit", lines: ["gökyüzü (an)", KP_AY[d.frame.ayanamsa] ?? String(d.frame.ayanamsa)] } }, caption: `${figureTitle(technique)} — ${KP_NOTE}`, legend: KP_TRANSIT_LEGEND };
    }
  } catch {
    return { missing: FIGURE_MISSING };
  }
  return null;
}

export function buildAstroReport(a: ReportAnalysisInput): AstroReport {
  const b = new B();
  const technique = a.technique;
  const tradition = traditionOf(technique);
  const profile = isObj(a.profile) ? a.profile : null;
  const partner = profile && isObj(profile.partner) ? profile.partner : null;
  const method = isObj(a.method) ? a.method : {};
  const opts = isObj(a.params) ? a.params : {};
  const tech = isObj(a.technical) ? a.technical : null;
  const clientName = profile && isObj(profile.client) && typeof profile.client.name === "string" && profile.client.name.trim() ? profile.client.name : profile && typeof profile.label === "string" ? profile.label : DASH;
  const people = { a: profile && typeof profile.label === "string" ? profile.label : "1. kişi", b: partner && typeof partner.label === "string" ? partner.label : "2. kişi" };
  const techLabel = uiTechniqueLabel(technique);
  const optionSummary = describeOptions(technique, opts, () => (partner && typeof partner.label === "string" ? partner.label : null)) || DASH;

  // 4. Doğum verileri
  b.h(1, "Doğum verileri");
  personBlock(b, partner ? `1. kişi · ${people.a}` : "Doğum profili", profile);
  if (partner) personBlock(b, `2. kişi · ${people.b}`, partner);

  // Yöntem
  b.h(1, "Yöntem");
  b.kv([
    ["Gelenek", TRADITION_LABEL[tradition]],
    ["Analiz türü", techLabel],
    ["Seçenekler", optionSummary],
    ["Zodyak", zodiacLabel(technique)],
    ["Ev sistemi", method.houseSystem ? hsL(method.houseSystem) : DASH],
  ]);
  const warnings = arr<unknown>(method.warnings).filter((x): x is string => typeof x === "string");
  if (method.timeUnknownMasked === true || warnings.length) {
    for (const w of warnings) b.p(w, "warn");
  }

  // 5. Harita görseli (yalnız sistemin kendi çarkı; kayıtlı veriden çizilir — yeni hesap YOK)
  let chart: WheelInput | null = null;
  if (tech) {
    if (technique === "western.natal" || technique === "western.composite") chart = wheelOf(tech);
    else if (technique === "western.relocation") chart = wheelOf(tech, false);
    else if (technique === "western.solar_return" || technique === "western.lunar_return") chart = isObj(tech.chart) ? wheelOf(tech.chart) : null;
    else if (technique === "western.progression") chart = progressionWheel(tech);
    else if (technique === "western.transit") chart = transitWheel(tech);
    else if (technique === "western.synastry") chart = synastryWheel(tech);
  }
  if (chart) {
    b.h(1, "Harita");
    b.blocks.push({ kind: "chart", chart, caption: wheelCaption(technique, techLabel, people) });
    b.p(WHEEL_LEGEND, "muted");
  }
  // 5b. Vedik D1 / Varga / KP haritası (2026-10-15): ekranda çizilen haritanın aynısı, kayıtlı teknik veriden.
  const rv0 = profile && isObj(profile.revision) ? profile.revision : null;
  const birth = rv0 && num(rv0.latitude) !== null && num(rv0.longitude) !== null ? { lat: num(rv0.latitude)!, lon: num(rv0.longitude)!, label: typeof rv0.locationLabel === "string" ? rv0.locationLabel : "doğum yeri" } : null;
  const refOpt = isObj(opts.reference) ? opts.reference : null;
  const fig = tech ? vedicKpFigure(technique, tech, { birth, referenceLabel: refOpt && typeof refOpt.label === "string" ? refOpt.label : null }) : null;
  if (fig) {
    b.h(1, fig.heading ?? "Harita");
    if ("missing" in fig) b.p(fig.missing, "warn");
    else {
      b.blocks.push({ kind: "chart", figure: fig.figure, caption: fig.caption });
      b.p(fig.legend, "muted");
    }
  }

  // 6–7. Teknik sonuçlar
  b.h(1, "Teknik hesaplama sonuçları");
  if (!tech) {
    b.p(warnings.length ? "Bu analizde saat-bağımlı teknik sonuçlar gösterilmez (yukarıdaki uyarıya bakın)." : "Bu kayıtta teknik sonuç bulunmuyor.", "muted");
  } else if (technique === "western.natal") westernNatal(b, tech);
  else if (["western.transit", "western.forecast", "western.progression", "western.solar_arc", "western.solar_return", "western.lunar_return", "western.synastry", "western.composite"].includes(technique)) {
    const rv = profile && isObj(profile.revision) ? profile.revision : null;
    westernTiming(b, technique, tech, people, { birthTz: rv && typeof rv.timezone === "string" ? rv.timezone : null, relocated: typeof opts.returnLocationId === "string" && opts.returnLocationId !== "" }, opts);
  }
  else if (["western.astrocartography", "western.relocation", "western.local_space"].includes(technique)) westernLocation(b, technique, tech, opts);
  else if (technique === "western.fixed_stars") westernFixedStars(b, tech, opts);
  else if (technique === "western.profections") westernProfections(b, tech);
  else if (technique.startsWith("vedic.") || technique === "kp.dasha") vedic(b, technique, tech);
  else if (technique.startsWith("kp.")) {
    const rv = profile && isObj(profile.revision) ? profile.revision : null;
    kp(b, technique, tech, opts, rv && num(rv.latitude) !== null && num(rv.longitude) !== null ? { lat: rv.latitude as number, lon: rv.longitude as number } : null);
  }
  else b.p("Bu analiz türünün teknik tabloları rapor biçiminde desteklenmiyor; uygulamada görüntüleyin.", "muted");

  // 8. Uzman notları
  const notes = arr(a.notes).filter((n) => typeof n.body === "string" && n.body.trim());
  b.h(1, "Uzman notları");
  if (!notes.length) b.p("Bu analize kaydedilmiş uzman notu yok.", "muted");
  for (const n of notes) {
    b.h(3, s(n.sectionLabel));
    b.p(n.body as string);
  }

  // 9. Bilgi Bankası (analize kaydedilmiş snapshot)
  const kb = arr(a.knowledgeBank).filter((e) => typeof e.body === "string" || typeof e.title === "string");
  b.h(1, "Bilgi Bankası");
  if (!kb.length) b.p("Bu analizle eşleşen güncel Bilgi Bankası kaydınız yok.", "muted");
  else b.p("Bilgi Bankası içeriği uzmanın güncel kayıtlarından alınmıştır (analize kopyalanmaz).", "muted");
  for (const e of kb) {
    b.h(3, `${s(e.title)}${typeof e.topicLabel === "string" ? ` · ${e.topicLabel}` : ""}`);
    if (typeof e.body === "string") b.p(e.body);
    if (typeof e.sourceNote === "string" && e.sourceNote.trim()) b.p(`Kaynak: ${e.sourceNote}`, "muted");
  }

  // 10. Roxy otomatik yorumu — YALNIZ görünür (yetkili + kayıtta var) ise.
  const it = isObj(a.interpretation) ? a.interpretation : null;
  const interpVisible = !!it && it.visible === true && isObj(it.content);
  if (!interpVisible && hasNoProviderInterpretation(technique)) {
    // 2026-10-15: Roxy bu teknikte yorum üretmez — boşluk yetki/kayıt eksikliği sanılmasın (yorum UYDURULMAZ).
    // 2026-10-20: başlık ekrandaki çip ile aynı ("Otomatik yorum yok"); "Sistem Yorumu" yalnız Profeksiyonlar'ın yorum türüdür.
    b.h(1, "Otomatik yorum yok");
    b.p(NO_PROVIDER_INTERPRETATION_NOTE, "muted");
  }
  if (interpVisible) {
    // 2026-10-20: başlık ekrandaki sekme adıyla AYNI tür (Otomatik Yorum / Teknik Açıklama / Olay Açıklamaları / Sistem Yorumu);
    // önceden Teknik Açıklama ve Olay Açıklamaları raporda "Otomatik Yorum" başlığıyla çıkıyordu (ekranla uyumsuz).
    b.h(1, interpretationKindOfSchema(typeof (it!.content as O).schema === "string" ? String((it!.content as O).schema) : ""));
    // 2026-10-15: ekrandaki sekme adıyla aynı tür ayrımı (Otomatik Yorum / Teknik Açıklama / Olay Açıklamaları).
    b.p(interpretationKindNote(interpretationKindOfSchema(typeof (it!.content as O).schema === "string" ? String((it!.content as O).schema) : "")), "muted");
    if (typeof it!.notice === "string") b.p(it!.notice, "muted");
    let content = it!.content as O;
    if (technique === "western.fixed_stars" && tech) {
      // Rapor orbu dışındaki temasların anlatısı rapora girmez (teknik tabloyla tutarlı).
      const orb = fixedStarOrbOf(opts.orb);
      const ok = new Set(arr(tech.contacts).filter((c) => (num(c.orb) ?? 99) <= orb + 1e-9).map((c) => `${String(c.star)}|${String(c.point)}`));
      content = { ...content, contacts: arr(content.contacts).filter((x) => ok.has(`${String(x.star)}|${String(x.point)}`)) };
    }
    if (technique === "western.local_space") {
      // 2026-10-16: merkez doğum yerinden farklıysa kalıptaki "doğum yerinizden" atfı seçilen merkeze bağlanır (snapshot aynen).
      const ls = localSpaceCenter(tech, opts, birth);
      const note = localSpaceCenterNote(ls);
      if (note) b.p(note, "muted");
      const fix = (x: O) => (typeof x.text === "string" ? { ...x, text: localSpaceText(x.text, ls) } : x);
      content = { ...content, bodies: arr(content.bodies).map(fix), ...(typeof content.summary === "string" ? { summary: localSpaceText(content.summary, ls) } : {}) };
    }
    interpBlocks(b, technique, content, people, opts);
  }

  // Sürüm bilgisi
  const v = isObj(a.versions) ? a.versions : {};
  b.h(1, "Kayıt bilgisi");
  b.kv([
    ["Analiz kimliği", a.id],
    ["Kayıt tarihi", instantTr(a.analysisAt)],
    ["Hesap tarihi", instantTr(v.resultComputedAt)],
    ["Hesaplama sağlayıcısı", typeof v.provider === "string" ? "Harici hizmet" : DASH],
    ["Snapshot şeması", s(v.snapshotSchema)],
  ]);
  // YENİ-P2-03 (2026-10-20): düzeltilen hesap kurallarından önceki kayıt — rapor bunu açıkça yazar (değerler değiştirilmez).
  const legacy = arr(a.legacyNotes).filter((n) => typeof n.text === "string");
  if (legacy.length) {
    b.p(LEGACY_METHOD_LEAD, "warn");
    for (const n of legacy) b.p(`• ${String(n.text)}`, "warn");
  }
  b.p("Harita ve teknik sonuçlar kaydedildiği andaki değişmez analiz kaydından, uzman notları kayıt anındaki hâlinden, Bilgi Bankası açıklamaları uzmanın güncel kayıtlarından alınmıştır; rapor oluşturulurken yeni hesaplama yapılmaz.", "muted");

  const date = instantDateTr(a.analysisAt);
  return {
    title: s(a.title),
    cover: { client: clientName, analysisDate: date, tradition: TRADITION_LABEL[tradition], technique: techLabel, options: optionSummary },
    blocks: b.blocks,
    fileBase: `Astroloji-${asciiSlug(clientName, 40)}-${asciiSlug(techLabel, 40)}-${instantDayKeyTr(a.analysisAt) ?? "tarihsiz"}`,
    hasInterpretation: interpVisible,
    hasChart: !!chart || (!!fig && !("missing" in fig)),
  };
}

/** Rapor metnindeki her dizgeyi sırayla verir (test + sızıntı denetimi için). */
export function reportTexts(r: AstroReport): string[] {
  const out = [r.title, ...Object.values(r.cover).filter((x): x is string => typeof x === "string")];
  for (const bl of r.blocks) {
    if (bl.kind === "heading" || bl.kind === "para") out.push(bl.text);
    else if (bl.kind === "kv") bl.rows.forEach(([k, v]) => out.push(k, v));
    else if (bl.kind === "table") out.push(...bl.table.columns, ...bl.table.rows.flat(), ...(bl.caption ? [bl.caption] : []));
    else if (bl.kind === "bullets") out.push(...bl.items);
    else if (bl.kind === "chart") out.push(bl.caption);
  }
  return out;
}

// ─── 2026-10-12 (UAT 2. tur, madde L): seçili / tüm analizler tek dosyada ───────────────────────────────

export type CombinedSection = { report: AstroReport; analysisId: string; technique: string; revision: string; analysisDate: string };
export type CombinedAstroReport = AstroReport & { sections: CombinedSection[] };

/**
 * Birden çok kayıtlı analizi TEK rapora dizer. Her analiz kendi bölümünde (yeni sayfa) ve kendi kayıtlı verisiyle yer
 * alır: başlıklar bir kademe içeri alınır, bölüm başında teknik + revizyon + analiz tarihi künyesi verilir. Yeni hesap YOK.
 * Çağıran tarafın tüm analizlerin AYNI doğum profiline ait olduğunu doğrulamış olması gerekir.
 */
export function buildCombinedAstroReport(items: ReportAnalysisInput[], scope: "selected" | "all", today: string): CombinedAstroReport {
  const sections: CombinedSection[] = items.map((a) => {
    const report = buildAstroReport(a);
    const profile = isObj(a.profile) ? a.profile : null;
    const rv = profile && isObj(profile.revision) ? profile.revision : null;
    return { report, analysisId: a.id, technique: report.cover.technique, revision: rv && num(rv.revision) !== null ? String(rv.revision) : DASH, analysisDate: report.cover.analysisDate };
  });
  const client = sections[0]?.report.cover.client ?? DASH;
  const n = sections.length;
  const blocks: ReportBlock[] = [];
  blocks.push({ kind: "heading", level: 1, text: "İçindekiler" });
  blocks.push({
    kind: "table",
    table: { columns: ["#", "Analiz türü", "Analiz başlığı", "Analiz tarihi", "Revizyon"], rows: sections.map((x, i) => [String(i + 1), x.technique, x.report.title, x.analysisDate, x.revision]), widths: [0.5, 2.4, 3.2, 1.4, 1] },
  });
  blocks.push({
    kind: "para",
    tone: "muted",
    text: "Her analiz kendi bölümünde, kaydedildiği andaki değişmez kayıtlı veriden yer alır; doğum bilgisi revizyonu her bölümde ayrıca belirtilir. Rapor oluşturulurken yeni hesaplama yapılmaz.",
  });
  sections.forEach((x, i) => {
    blocks.push({ kind: "pagebreak" });
    blocks.push({ kind: "heading", level: 1, text: `${i + 1}. ${x.technique}` });
    blocks.push({
      kind: "kv",
      rows: [
        ["Analiz başlığı", x.report.title],
        ["Analiz tarihi", x.analysisDate],
        ["Doğum bilgisi revizyonu", x.revision],
        ["Gelenek", x.report.cover.tradition],
        ...(x.report.cover.options !== DASH ? ([["Seçenekler", x.report.cover.options]] as [string, string][]) : []),
      ],
    });
    for (const bl of x.report.blocks) blocks.push(bl.kind === "heading" ? { ...bl, level: bl.level === 1 ? 2 : 3 } : bl);
  });
  const label = scope === "all" ? `Tüm kayıtlı analizler (${n})` : `Seçili analizler (${n})`;
  return {
    title: `${client} — ${label}`,
    cover: { client, analysisDate: today, dateLabel: "Rapor tarihi", tradition: [...new Set(sections.map((x) => x.report.cover.tradition))].join(", "), technique: label, options: DASH },
    blocks,
    fileBase: `Astroloji-${asciiSlug(client, 40)}-${scope === "all" ? "Tum-Analizler" : "Secili-Analizler"}-${n}`,
    hasInterpretation: sections.some((x) => x.report.hasInterpretation),
    hasChart: sections.some((x) => x.report.hasChart),
    sections,
  };
}
