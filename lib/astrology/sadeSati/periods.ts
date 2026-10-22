// Atlas — SADE SATI DÖNEM TARİHLERİ (SAF, deterministik; sağlayıcı çağrısı ve efemeris kütüphanesi YOK).
//
// Girdi: Janma Rashi (natal Ay'ın sidereal Lahiri burcu; önbellekteki Vedik D1 kaydından) + değerlendirme anı.
// Veri: sürümlü Satürn geçiş kataloğu (saturnCatalog.ts; JPL Horizons ile bağımsız doğrulanmış).
//
// Yöntem (aday metodoloji — owner onayına kadar ürün bayrağı KAPALI):
//   • K1 (kesintili, birincil): Satürn Ay'dan 12. / 1. / 2. burçtayken ilgili evre; retro hareketle bu üç burcun dışına geçici
//     çıkış "kesinti" olarak kaydedilir; her giriş ayrı bölümdür (retro geri dönüşler dahil).
//   • Dönem zarfı: üç burçtan ilk girişten son çıkışa; kesintiler 3 yıldan kısa boşluklardır (bir sonraki Sade Sati ~22 yıl sonra).
//   • K2a (karşılaştırma): her evre o burca İLK girişte başlar, sonraki evrenin başlangıcında biter.
//   • K2b (karşılaştırma): her evre o burca son İLERİ (kalıcı) girişte başlar.
//   • 45° derece ekolü bu sürümde YOKTUR.
// Kapsam dışına taşan dönem "kısmi" işaretlenir; kapsam dışı tarih ÜRETİLMEZ.

import { SATURN_CATALOG_META, SATURN_INGRESSES, SATURN_SIGN_BEFORE_FIRST, type SaturnIngress, type SaturnSign } from "./saturnCatalog";

export const SADE_SATI_SIGNS: readonly SaturnSign[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
export type SadeSatiPeriodPhase = "rising" | "peak" | "setting";
/** Metodoloji damgası: arşivde saklanır; kural / katalog değişirse yeni damga. */
export const SADE_SATI_PERIODS_METHOD = `sade-sati-periods.k1.v1+${SATURN_CATALOG_META.id}.v${SATURN_CATALOG_META.version}`;
/** Boşluk bu süreden kısaysa aynı dönemin kesintisidir (retro kaynaklı boşluklar < 1 yıl; ardışık dönemler ~22 yıl). */
const INTERRUPTION_MAX_MS = 3 * 365.25 * 86_400_000;
/** 1″ konum farkı bu kadar dakikadan fazla zaman kaydırıyorsa geçiş "duraklamaya yakın" sayılır (belirsizlik notu). */
export const NEAR_STATION_MIN_PER_ARCSEC = 30;
/** Ortalama Ay hızı (°/gün) — sınır uyarısında doğum saati hassasiyetini dakikaya çevirmek için (gösterim). */
const MOON_MEAN_DEG_PER_DAY = 13.176358;
/** Ay burç sınırına bu kadar dakikalık Ay hareketinden yakınsa uyarı gösterilir (kesinlik eşiği DEĞİL; bilgilendirme). */
export const MOON_BOUNDARY_WARN_MINUTES = 120;

export type SadeSatiEdge = { utc: string; motion: "direct" | "retrograde"; nearStation: boolean } | null;
export type SadeSatiSegment = { phase: SadeSatiPeriodPhase; sign: SaturnSign; start: SadeSatiEdge; end: SadeSatiEdge };
export type SadeSatiInterruption = { sign: SaturnSign; start: string; end: string };
export type SadeSatiPhaseSpan = { start: string | null; end: string | null };
export type SadeSatiCycle = {
  relation: "past" | "active" | "future";
  /** Zarf: üç burca ilk giriş → son çıkış (null = katalog kapsamı dışında, üretilmedi). */
  start: string | null;
  end: string | null;
  partial: boolean;
  beginsBeforeBirth: boolean;
  segments: SadeSatiSegment[];
  interruptions: SadeSatiInterruption[];
  k2a: Record<SadeSatiPeriodPhase, SadeSatiPhaseSpan>;
  k2b: Record<SadeSatiPeriodPhase, SadeSatiPhaseSpan>;
};
export type SadeSatiStatusAt = { state: "none" | "phase" | "interruption"; phase: SadeSatiPeriodPhase | null };
export type SadeSatiPeriods = {
  method: string;
  catalog: { id: string; version: string; sha256: string; coverageFromUtc: string; coverageToUtc: string };
  janmaRashi: SaturnSign;
  asOfUtc: string;
  statusAtAsOf: SadeSatiStatusAt;
  cycles: SadeSatiCycle[];
  moonBoundary: { degreesToBoundary: number; approxMinutes: number; warn: boolean } | null;
};

const ms = (iso: string) => Date.parse(iso);
const COV_FROM = ms(SATURN_CATALOG_META.coverageFromUtc);
const COV_TO = ms(SATURN_CATALOG_META.coverageToUtc);

type Residence = { sign: SaturnSign; from: number; to: number; entry: SaturnIngress | null; exit: SaturnIngress | null };

let RES: Residence[] | null = null;
/** Katalogdan Satürn'ün burç ikamet aralıkları (ilk ve son aralığın dış ucu bilinmez → kapsam dışı). */
function residences(): Residence[] {
  if (RES) return RES;
  const out: Residence[] = [];
  let sign = SATURN_SIGN_BEFORE_FIRST;
  let from = Number.NEGATIVE_INFINITY;
  let entry: SaturnIngress | null = null;
  for (const e of SATURN_INGRESSES) {
    out.push({ sign, from, to: ms(e.utc), entry, exit: e });
    sign = e.to;
    from = ms(e.utc);
    entry = e;
  }
  out.push({ sign, from, to: Number.POSITIVE_INFINITY, entry, exit: null });
  RES = out;
  return out;
}

const signAt = (offset: number, janma: SaturnSign) => SADE_SATI_SIGNS[(SADE_SATI_SIGNS.indexOf(janma) + offset + 12) % 12];
function phaseOfSign(sign: SaturnSign, janma: SaturnSign): SadeSatiPeriodPhase | null {
  if (sign === signAt(-1, janma)) return "rising";
  if (sign === janma) return "peak";
  if (sign === signAt(1, janma)) return "setting";
  return null;
}

const inCoverage = (t: number) => t >= COV_FROM && t <= COV_TO;
const edge = (e: SaturnIngress | null, t: number): SadeSatiEdge =>
  e && inCoverage(t) ? { utc: e.utc, motion: e.motion, nearStation: e.tolMinPerArcsec > NEAR_STATION_MIN_PER_ARCSEC } : null;

/** Belirli bir andaki K1 durumu (yalnız kapsam içinde; dışında null). */
export function sadeSatiStatusAt(janma: SaturnSign, atUtcMs: number): SadeSatiStatusAt | null {
  if (!inCoverage(atUtcMs)) return null;
  const r = residences().find((x) => atUtcMs >= x.from && atUtcMs < x.to);
  if (!r) return null;
  const ph = phaseOfSign(r.sign, janma);
  if (ph) return { state: "phase", phase: ph };
  const cyc = buildCycles(janma).find((c) => c.startMs <= atUtcMs && atUtcMs < c.endMs);
  return cyc ? { state: "interruption", phase: null } : { state: "none", phase: null };
}

type RawCycle = { startMs: number; endMs: number; rows: Residence[] };
const CYCLES = new Map<SaturnSign, RawCycle[]>();
function buildCycles(janma: SaturnSign): RawCycle[] {
  const hit = CYCLES.get(janma);
  if (hit) return hit;
  const all = residences();
  const out: RawCycle[] = [];
  let cur: RawCycle | null = null;
  for (const r of all) {
    if (!phaseOfSign(r.sign, janma)) continue;
    if (cur && r.from - cur.endMs <= INTERRUPTION_MAX_MS) {
      cur.rows.push(r);
      cur.endMs = r.to;
    } else {
      cur = { startMs: r.from, endMs: r.to, rows: [r] };
      out.push(cur);
    }
  }
  CYCLES.set(janma, out);
  return out;
}

function spans(c: RawCycle, janma: SaturnSign, firstEntry: boolean): Record<SadeSatiPeriodPhase, SadeSatiPhaseSpan> {
  const order: SadeSatiPeriodPhase[] = ["rising", "peak", "setting"];
  const starts = order.map((ph) => {
    const rows = c.rows.filter((r) => phaseOfSign(r.sign, janma) === ph);
    const pick = firstEntry ? rows[0] : [...rows].reverse().find((r) => r.entry?.motion === "direct") ?? null;
    return pick && Number.isFinite(pick.from) && inCoverage(pick.from) ? pick.entry!.utc : null;
  });
  const endIso = Number.isFinite(c.endMs) && inCoverage(c.endMs) ? c.rows[c.rows.length - 1].exit!.utc : null;
  return {
    rising: { start: starts[0], end: starts[1] },
    peak: { start: starts[1], end: starts[2] },
    setting: { start: starts[2], end: endIso },
  };
}

/**
 * Janma Rashi için Sade Sati dönemleri. Doğumdan sonra biten tüm dönemler (en çok 3 geçmiş), aktif dönem ve en çok 2 gelecek dönem.
 * Kapsam dışına taşan dönem `partial` ve dış uçları null; kapsam tamamen dışındaysa dönem listelenmez.
 */
export function sadeSatiPeriods(input: { janmaRashi: SaturnSign; asOfUtc: string; birthUtc: string | null; moonDegreeInRashi: number | null }): SadeSatiPeriods {
  const asOf = ms(input.asOfUtc);
  const birth = input.birthUtc ? ms(input.birthUtc) : null;
  const raw = buildCycles(input.janmaRashi).filter((c) => (Number.isFinite(c.endMs) ? c.endMs > COV_FROM : true) && (Number.isFinite(c.startMs) ? c.startMs < COV_TO : true));
  const shaped = raw.map((c): SadeSatiCycle => {
    const relation = c.endMs <= asOf ? "past" : c.startMs > asOf ? "future" : "active";
    const segments: SadeSatiSegment[] = c.rows.map((r) => ({ phase: phaseOfSign(r.sign, input.janmaRashi)!, sign: r.sign, start: edge(r.entry, r.from), end: edge(r.exit, r.to) }));
    const interruptions: SadeSatiInterruption[] = [];
    const all = residences();
    for (let i = 0; i < c.rows.length - 1; i++) {
      const a = c.rows[i];
      const b = c.rows[i + 1];
      if (a.to < b.from) {
        const gap = all.find((x) => x.from === a.to);
        if (gap && inCoverage(a.to) && inCoverage(b.from)) interruptions.push({ sign: gap.sign, start: a.exit!.utc, end: b.entry!.utc });
      }
    }
    const startIso = Number.isFinite(c.startMs) && inCoverage(c.startMs) ? c.rows[0].entry!.utc : null;
    const endIso = Number.isFinite(c.endMs) && inCoverage(c.endMs) ? c.rows[c.rows.length - 1].exit!.utc : null;
    return {
      relation,
      start: startIso,
      end: endIso,
      partial: startIso === null || endIso === null,
      beginsBeforeBirth: birth !== null && c.startMs < birth,
      segments,
      interruptions,
      k2a: spans(c, input.janmaRashi, true),
      k2b: spans(c, input.janmaRashi, false),
    };
  });
  const past = shaped.filter((c) => c.relation === "past" && (birth === null || ms(c.end ?? "") > birth || c.end === null)).slice(-3);
  const active = shaped.filter((c) => c.relation === "active");
  const future = shaped.filter((c) => c.relation === "future").slice(0, 2);
  const deg = input.moonDegreeInRashi;
  const moonBoundary =
    typeof deg === "number" && Number.isFinite(deg)
      ? (() => {
          const d = Math.min(deg, 30 - deg);
          const minutes = (d / MOON_MEAN_DEG_PER_DAY) * 1440;
          return { degreesToBoundary: Math.round(d * 10_000) / 10_000, approxMinutes: Math.round(minutes), warn: minutes < MOON_BOUNDARY_WARN_MINUTES };
        })()
      : null;
  return {
    method: SADE_SATI_PERIODS_METHOD,
    catalog: { id: SATURN_CATALOG_META.id, version: SATURN_CATALOG_META.version, sha256: SATURN_CATALOG_META.sha256, coverageFromUtc: SATURN_CATALOG_META.coverageFromUtc, coverageToUtc: SATURN_CATALOG_META.coverageToUtc },
    janmaRashi: input.janmaRashi,
    asOfUtc: input.asOfUtc,
    statusAtAsOf: sadeSatiStatusAt(input.janmaRashi, asOf) ?? { state: "none", phase: null },
    cycles: [...past, ...active, ...future],
    moonBoundary,
  };
}

/**
 * Sağlayıcının günlük durumu (present/phase) ile katalog K1 durumu aynı mı? Değerlendirme GÜNÜ (UTC) içinde bir geçiş
 * varsa gün başı veya gün sonu durumundan biriyle uyuşması yeterlidir. Kapsam dışı → null (karşılaştırılamaz).
 */
export function providerAgrees(janma: SaturnSign, asOfDay: string, provider: { present: boolean; phase: SadeSatiPeriodPhase | null }): boolean | null {
  const a = sadeSatiStatusAt(janma, ms(`${asOfDay}T00:00:00Z`));
  const b = sadeSatiStatusAt(janma, ms(`${asOfDay}T23:59:59Z`));
  if (!a || !b) return null;
  const same = (s: SadeSatiStatusAt) => (provider.present ? s.state === "phase" && s.phase === provider.phase : s.state !== "phase");
  return same(a) || same(b);
}
