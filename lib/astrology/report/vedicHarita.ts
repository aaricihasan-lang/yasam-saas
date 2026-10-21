// Astroloji raporu — VEDİK HARİTA bölümleri (22.10.2026; SAF). Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala.
//
// Girdi YALNIZ kayıtlı analizin teknik / yorum katmanıdır (rapor modeli); sağlayıcı çağrısı ve yeni hesap YOKTUR. Eksik alan "—".
// D1 (bütün-burç rashi evi) ile Bhav Chalit (bhava) sütunları AYRI başlıklarla basılır; Shadbala (graha gücü) ile Bhava Bala
// (ev gücü) ayrımı açıkça yazılır.

import { BODY_GLYPHS, SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "../labels/tr";
import { SIGN_IDS, type SignId } from "../model/western";
import { GRAHA_LABELS } from "../topics/vedic";
import {
  ARUDHA_ABBR,
  ARUDHA_METHOD_NOTE,
  ARUDHA_NAMES,
  BHAVA_BALA_VS_SHADBALA_NOTE,
  CHALIT_VS_D1_NOTE,
  CHARA_KARAKA_ABBR,
  CHARA_KARAKA_METHOD_NOTE,
  CHARA_KARAKA_NAMES,
  CHARA_KARAKA_SCHEME_LABELS,
  VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA,
  VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA,
  bhavaSystemLabel,
  type ArudhaPadaId,
  type CharaKarakaId,
  type VedicBhavChalitTechnical,
} from "../model/vedicHarita";
import { CHALIT_CENTRE_TEXT, CHALIT_KUNDLI_NOTE, chalitKundliTitles, toChalitKundliData } from "@/app/admin/astroloji/_lib/chalitKundli";
import { kundliLegend } from "@/app/admin/astroloji/_lib/kundliLocalize";
import type { ReportFigure } from "./figures";
import { BHAVA_BALA_LEGEND } from "./vedicHaritaFigures";

type O = Record<string, unknown>;
/** model.ts içindeki blok kurucusunun (B) yapısal alt kümesi. */
export type ReportBuilder = {
  h(level: 1 | 2 | 3, text: string): void;
  p(text: string, tone?: "muted" | "warn"): void;
  kv(rows: [string, string][]): void;
  table(columns: string[], rows: string[][], opts?: { widths?: number[]; caption?: string; compact?: boolean; empty?: string }): void;
};

export const VEDIC_HARITA_TECHNIQUES: ReadonlySet<string> = new Set(["vedic.bhav_chalit", "vedic.chara_karaka", "vedic.arudha", "vedic.bhava_bala"]);
export const VEDIC_HARITA_INTERP_SCHEMAS: ReadonlySet<string> = new Set(["astro.vedic.bhav_chalit.interp.v1", "astro.vedic.chara_karaka.interp.v1", "astro.vedic.arudha.interp.v1", "astro.vedic.bhava_bala.interp.v1"]);

const DASH = "—";
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const arr = <T = O>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : DASH);
const fix = (v: unknown, d = 2) => (num(v) === null ? DASH : num(v)!.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const noVs = (x: string) => x.replace(/[︎️]/g, "");
const signL = (v: unknown) => (typeof v === "string" && v in SIGN_LABELS ? `${noVs((SIGN_GLYPHS as Record<string, string>)[v] ?? "")} ${SIGN_LABELS[v as SignId]}`.trim() : s(v));
const GLYPH_ID: Record<string, string> = { rahu: "north_node", ketu: "south_node" };
const grahaL = (v: unknown) => {
  if (typeof v !== "string") return DASH;
  const gl = (BODY_GLYPHS as Record<string, string>)[GLYPH_ID[v] ?? v];
  return `${gl ? `${noVs(gl)} ` : ""}${GRAHA_LABELS[v] ?? v}`;
};
const lonL = (v: unknown) => (num(v) === null ? DASH : `${signL(SIGN_IDS[Math.floor((((num(v)! % 360) + 360) % 360) / 30) % 12])} ${formatDegree(num(v)! % 30)}`);
const houseL = (v: unknown) => (num(v) === null ? DASH : `${num(v)}. ev`);
const frameKv = (f: unknown): [string, string][] => {
  const x = isObj(f) ? f : {};
  const AY: Record<string, string> = { lahiri: "Lahiri (Chitrapaksha)", raman: "B.V. Raman", "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };
  return [
    ["Zodyak", "Sidereal (nirayana)"],
    ["Ayanamsa", `${typeof x.ayanamsa === "string" ? (AY[x.ayanamsa] ?? x.ayanamsa) : DASH}${num(x.ayanamsaDegrees) !== null ? ` · ${formatDegree(num(x.ayanamsaDegrees)!)}` : ""}`],
  ];
};

/** Teknik bölüm. Tanınan teknik değilse false (çağıran kendi akışına devam eder). */
export function vedicHaritaTechnical(b: ReportBuilder, technique: string, t: O): boolean {
  switch (technique) {
    case "vedic.bhav_chalit": {
      b.kv([...frameKv(t.frame), ["Bhava yöntemi", typeof t.houseSystem === "string" ? bhavaSystemLabel(t.houseSystem) : DASH], ["Lagna (Yükselen)", lonL(t.ascendant)], ["MC (10. bhava madhyası)", lonL(t.midheaven)], ["Bhavası değişen graha", num(t.movedCount) !== null ? String(t.movedCount) : DASH]]);
      b.p(CHALIT_VS_D1_NOTE, "muted");
      b.h(3, "Bhava sınırları (başlangıç · madhya · bitiş)");
      b.table(
        ["Bhava", "Başlangıç (sandhi)", "Madhya (cusp)", "Bitiş (sandhi)", "Genişlik", "Madhya rashisi", "Grahalar"],
        arr(t.bhavas).map((x) => [houseL(x.house), lonL(x.start), lonL(x.madhya), lonL(x.end), `${fix(x.span, 2)}°`, signL(x.rashi), arr<unknown>(x.grahas).length ? arr<unknown>(x.grahas).map(grahaL).join(", ") : DASH]),
        { widths: [0.8, 1.6, 1.6, 1.6, 0.9, 1.3, 2], compact: true, empty: "Kayıtta bhava verisi yok." },
      );
      b.h(3, "D1 (rashi) ile Bhav Chalit karşılaştırması");
      b.table(
        ["Graha", "Rashi ve derece", "Rashi evi (D1, bütün-burç)", "Chalit bhavası", "Değişti mi"],
        arr(t.grahas).map((g) => [grahaL(g.id), lonL(g.longitude), houseL(g.rashiHouse), houseL(g.bhava), g.moved === true ? "Evet" : g.moved === false ? "Hayır" : DASH]),
        { widths: [1.6, 1.6, 1.6, 1.3, 1], empty: "Kayıtta graha verisi yok." },
      );
      return true;
    }
    case "vedic.chara_karaka": {
      const sc = typeof t.scheme === "string" ? (CHARA_KARAKA_SCHEME_LABELS as Record<string, string>)[t.scheme] ?? t.scheme : DASH;
      b.kv([...frameKv(t.frame), ["Karaka şeması", sc], ["Atmakaraka", grahaL(t.atmakaraka)], ["Darakaraka", grahaL(t.darakaraka)]]);
      b.p(CHARA_KARAKA_METHOD_NOTE, "muted");
      b.h(3, `Chara karakalar — derece sıralaması (${sc})`);
      b.table(
        ["Sıra", "Karaka", "Graha", "Rashi ve burç içi derece", "Sıralama derecesi", "Ters (Rahu)"],
        arr(t.karakas).map((k, i) => [String(i + 1), `${CHARA_KARAKA_NAMES[k.id as CharaKarakaId] ?? s(k.id)} (${CHARA_KARAKA_ABBR[k.id as CharaKarakaId] ?? DASH})`, grahaL(k.graha), `${signL(k.rashi)} ${num(k.degreeInRashi) !== null ? formatDegree(num(k.degreeInRashi)!) : DASH}`, num(k.rankingDegree) !== null ? formatDegree(num(k.rankingDegree)!) : DASH, k.reversed === true ? "Evet (30° − derece)" : ""]),
        { widths: [0.6, 1.8, 1.5, 1.8, 1.2, 1.2], empty: "Kayıtta karaka verisi yok." },
      );
      return true;
    }
    case "vedic.arudha": {
      b.kv([...frameKv(t.frame), ["Lagna rashisi", signL(t.lagnaRashi)], ["Arudha Lagna (AL)", signL(t.arudhaLagna)], ["Upapada (UL / A12)", signL(t.upapada)]]);
      b.p(ARUDHA_METHOD_NOTE, "muted");
      b.h(3, "Arudha padalar — hesap tablosu");
      b.table(
        ["Pada", "Bhava", "Bhava rashisi", "Lord", "Lordun rashisi", "Sayım", "Ham sonuç", "İstisna", "Pada rashisi", "Lagna'dan ev"],
        arr(t.padas).map((p) => [
          `${ARUDHA_NAMES[p.id as ArudhaPadaId] ?? s(p.id)} (${ARUDHA_ABBR[p.id as ArudhaPadaId] ?? DASH})`,
          houseL(p.house),
          signL(p.bhavaRashi),
          grahaL(p.lord),
          signL(p.lordRashi),
          num(p.count) !== null ? String(p.count) : DASH,
          signL(p.rawRashi),
          p.exceptionApplied === true ? "Evet (10.)" : p.exceptionApplied === false ? "Hayır" : DASH,
          signL(p.rashi),
          houseL(p.houseFromLagna),
        ]),
        { widths: [1.8, 0.7, 1.1, 1.1, 1.1, 0.6, 1.1, 0.8, 1.1, 0.8], compact: true, empty: "Kayıtta pada verisi yok." },
      );
      return true;
    }
    case "vedic.bhava_bala": {
      b.kv([...frameKv(t.frame), ["Bhava yöntemi", typeof t.houseSystem === "string" ? bhavaSystemLabel(t.houseSystem) : DASH]]);
      b.p(BHAVA_BALA_VS_SHADBALA_NOTE, "muted");
      b.h(3, "Bhava Bala (bileşenler virupa; toplam rupa)");
      b.table(
        ["Bhava", "Rashi", "Lord", "Bhavadhipati", "Dig", "Drishti", "Toplam (virupa)", "Rupa", "Sıra"],
        arr(t.bhavas).map((x) => [houseL(x.house), signL(x.rashi), grahaL(x.lord), fix(x.bhavadhipatiBala), fix(x.digBala), fix(x.drishtiBala), fix(x.totalVirupas), fix(x.totalRupas), s(x.rank)]),
        { widths: [0.8, 1.2, 1.4, 1.1, 0.8, 0.9, 1.2, 0.8, 0.6], compact: true, empty: "Kayıtta bhava bala verisi yok." },
      );
      return true;
    }
    default:
      return false;
  }
}

/** Yorum (Teknik Açıklama) bölümü. Tanınan şema değilse false. */
export function vedicHaritaInterp(b: ReportBuilder, c: O, para: (label: string | null, text: unknown) => void): boolean {
  switch (c.schema) {
    case "astro.vedic.bhav_chalit.interp.v1":
    case "astro.vedic.bhava_bala.interp.v1":
      if (arr(c.houseThemes).length) {
        b.h(3, "Ev temaları");
        b.table(["Ev", "Anahtar kelimeler"], arr(c.houseThemes).map((x) => [houseL(x.house), arr<unknown>(x.keywords).filter((k): k is string => typeof k === "string").join(", ") || DASH]), { widths: [1, 4] });
      }
      return true;
    case "astro.vedic.chara_karaka.interp.v1":
      for (const x of arr(c.karakas)) para(`${CHARA_KARAKA_NAMES[x.id as CharaKarakaId] ?? s(x.id)}${typeof x.meaning === "string" && x.meaning.trim() ? ` — ${x.meaning}` : ""}`, x.significations);
      return true;
    case "astro.vedic.arudha.interp.v1":
      for (const x of arr(c.padas)) para(`${ARUDHA_NAMES[x.id as ArudhaPadaId] ?? s(x.id)} (${ARUDHA_ABBR[x.id as ArudhaPadaId] ?? DASH})${typeof x.meaning === "string" && x.meaning.trim() ? ` — ${x.meaning}` : ""}`, x.significations);
      return true;
    default:
      return false;
  }
}

const FIGURE_MISSING = "Harita bu kayıtta eksik teknik veri nedeniyle çizilemedi; teknik tablolar aşağıdadır.";
const isSign = (v: unknown): v is SignId => typeof v === "string" && (SIGN_IDS as readonly string[]).includes(v);
const CHALIT_GRAHAS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"] as const;

/** Harita / grafik (yalnız Bhav Chalit kundlisi ve Bhava Bala çubukları; Chara Karaka / Arudha tablo tekniğidir → null). */
export function vedicHaritaFigure(technique: string, t: O): { figure: ReportFigure; caption: string; legend: string; heading?: string } | { missing: string; heading?: string } | null {
  if (technique === "vedic.bhav_chalit") {
    const gs = arr(t.grahas);
    const valid = isSign(t.lagnaRashi) && num(t.ascendant) !== null && isObj(t.frame) && gs.length > 0 && gs.every((g) => typeof g.id === "string" && (CHALIT_GRAHAS as readonly string[]).includes(g.id) && num(g.longitude) !== null && isSign(g.rashi) && (num(g.bhava) ?? 0) >= 1 && (num(g.bhava) ?? 13) <= 12 && num(g.rashiHouse) !== null);
    if (t.schema !== VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA || !valid) return { missing: FIGURE_MISSING, heading: "Bhav Chalit haritası" };
    const d = t as unknown as VedicBhavChalitTechnical;
    const figure: ReportFigure = { type: "kundli", component: "kundli", style: "north", data: toChalitKundliData(d), titles: chalitKundliTitles(d), grahaCount: d.grahas.length, centreLabel: "D1 Rashi", centreText: CHALIT_CENTRE_TEXT };
    return { figure, caption: `Bhav Chalit haritası — ${CHALIT_KUNDLI_NOTE}`, legend: `${kundliLegend([...CHALIT_GRAHAS])}.`, heading: "Bhav Chalit haritası" };
  }
  if (technique === "vedic.bhava_bala") {
    const bs = arr(t.bhavas);
    const valid = bs.length === 12 && bs.every((x) => num(x.house) !== null && isSign(x.rashi) && num(x.rank) !== null && num(x.totalRupas) !== null);
    if (t.schema !== VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA || !valid) return { missing: FIGURE_MISSING, heading: "Ev gücü grafiği" };
    return {
      figure: { type: "bhavaBalaBars", bhavas: bs.map((x) => ({ house: num(x.house)!, rashi: x.rashi as SignId, rank: num(x.rank)!, rupas: num(x.totalRupas)! })) },
      caption: "Bhava Bala ev gücü grafiği — kayıtlı analiz verisinden çizilmiştir.",
      legend: BHAVA_BALA_LEGEND,
      heading: "Ev gücü grafiği",
    };
  }
  return null;
}
