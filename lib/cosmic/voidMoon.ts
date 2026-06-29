/**
 * lib/cosmic/voidMoon.ts
 * FAZ 3B — Production VOID OF COURSE MOON motoru (klasik tanım).
 *
 * UI'da HENÜZ KULLANILMAZ (FAZ 3B Adım 3'te bağlanacak). FAZ 2C aspect motorlarına
 * (aspects/exactAspects/aspectMotion) ve FAZ 3A eclipse motoruna DOKUNMAZ — yalnız
 * mevcut, doğrulanmış fonksiyonları import eder.
 *
 * ── Klasik tanım (production varsayılanı) ─────────────────────────────────────
 *   Ay, bulunduğu burçta KLASİK 6 cisme (Güneş, Merkür, Venüs, Mars, Jüpiter, Satürn)
 *   yaptığı SON exact MAJÖR aspektten (Kavuşum/Sekstil/Kare/Üçgen/Karşıt) sonra, yeni
 *   burca girene kadar Void of Course'tur. Dış gezegen / minör aspekt / asteroid HARİÇ.
 *
 * ── Bağımsız doğrulama ────────────────────────────────────────────────────────
 *   scripts/cosmic-validation/voidmoon/ (Swiss Ephemeris) ile 213/213 burç periyodu:
 *   ingress ≤45sn, VOC başlangıç ≤39sn, son aspect gezegen+tür 213/213, aspectsiz
 *   pencere ve 0/360 (Balık→Koç) dahil.
 *
 * Saf/deterministik: yalnız dışarıdan verilen Date'lerle çalışır (SSR↔client tutarlı);
 * gizli new Date() yok.
 */

import { getMoonSign, getMoonSignPeriod } from "./moon";
import { findExactAspectsInWindow } from "./exactAspects";
import type { AspectBody, AspectName } from "./aspects";

// ─── Tipler ─────────────────────────────────────────────────────────────────────

export type VoidMoonLastAspect = {
  planet: AspectBody;     // Ay'ın son aspekt yaptığı klasik cisim
  aspect: AspectName;     // Kavuşum | Sekstil | Kare | Üçgen | Karşıt
  exactUTC: string;
  exactTR: string;
};

export type VoidMoonPeriod = {
  id: string;
  moonSign: string;
  nextMoonSign: string;
  signStartUTC: string;
  signEndUTC: string;
  signStartTR: string;
  signEndTR: string;
  voidStartUTC: string;
  voidEndUTC: string;
  voidStartTR: string;
  voidEndTR: string;
  durationMinutes: number;
  durationLabel: string;
  lastAspect: VoidMoonLastAspect | null;
  noAspectInSign: boolean;
  definition: string;
  includedBodies: ReadonlyArray<AspectBody>;
  includedAspects: ReadonlyArray<AspectName>;
  excludedBodies: ReadonlyArray<string>;
  source: string;
  validationStatus: "harness-verified";
  confidence: "high";
  notes: string[];
};

// ─── Sabitler (klasik tanım) ────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const TR_OFFSET_MS = 3 * 3_600_000;   // UTC+3 sabit (retro/eclipses ile aynı)

/** Klasik 6 cisim — Ay bunlarla aspekt yapınca "engaged" sayılır. */
const CLASSICAL_BODIES: ReadonlyArray<AspectBody> = ["Güneş", "Merkür", "Venüs", "Mars", "Jüpiter", "Satürn"];
const INCLUDED_ASPECTS: ReadonlyArray<AspectName> = ["Kavuşum", "Sekstil", "Kare", "Üçgen", "Karşıt"];
const EXCLUDED_BODIES: ReadonlyArray<string> = ["Uranüs", "Neptün", "Plüton", "Chiron", "asteroidler"];

const DEFINITION =
  "Klasik VOC: Ay, bulunduğu burçta klasik 6 cisme (Güneş, Merkür, Venüs, Mars, Jüpiter, Satürn) " +
  "yaptığı son exact majör aspektten sonra, yeni burca girene kadar Void of Course'tur. " +
  "Dış gezegen, minör aspekt ve asteroidler hariçtir.";
const SOURCE =
  "astronomy-engine (getMoonSignPeriod + findExactAspectsInWindow); harness-doğrulanmış 213/213 vs Swiss Ephemeris";

// ─── Yardımcılar ────────────────────────────────────────────────────────────────

const isoZ = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
function isoTR(ms: number): string {
  const t = new Date(ms + TR_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+03:00`;
}

/** Süre etiketi: "2 gün 3 saat", "5 saat 59 dk", "12 dk". */
function durationLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} gün`);
  if (h) parts.push(`${h} saat`);
  if (mm || parts.length === 0) parts.push(`${mm} dk`);
  return parts.join(" ");
}

type Occ = { fromMs: number; toMs: number; sign: string; nextSign: string | null };

/**
 * [startMs, endMs) içinde, enter'ı pencerede olan tam burç periyotlarını döner.
 * getMoonSignPeriod (~1 dk) zincirlenir; `to` burçtaki son andır (≈ sonraki ingress − ≤60sn).
 */
function enumerateOccupancies(startMs: number, endMs: number): Occ[] {
  const occ: Occ[] = [];
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs + 3 * DAY_MS && guard++ < 5000) {
    const p = getMoonSignPeriod(new Date(cursor));
    const fromMs = p.from.getTime();
    const toMs = p.to.getTime();
    const sign = getMoonSign(new Date(Math.floor((fromMs + toMs) / 2))).name;
    occ.push({ fromMs, toMs, sign, nextSign: null });
    cursor = toMs + 120_000; // 2 dk sonrası → sonraki burç
  }
  for (let i = 0; i < occ.length; i++) occ[i]!.nextSign = occ[i + 1]?.sign ?? null;
  return occ.filter(o => o.fromMs >= startMs && o.fromMs < endMs && o.nextSign != null);
}

/** Bir burç periyodundan VoidMoonPeriod üretir. */
function buildPeriod(o: Occ): VoidMoonPeriod {
  const hits = CLASSICAL_BODIES.flatMap(body =>
    findExactAspectsInWindow("Ay", body, new Date(o.fromMs), new Date(o.toMs)));

  let voidStartMs: number;
  let lastAspect: VoidMoonLastAspect | null = null;
  let noAspectInSign: boolean;
  const notes: string[] = [];

  if (hits.length) {
    const last = hits.reduce((a, b) => (a.exactAt.getTime() >= b.exactAt.getTime() ? a : b));
    const planet = (last.bodyA === "Ay" ? last.bodyB : last.bodyA) as AspectBody;
    voidStartMs = last.exactAt.getTime();
    lastAspect = { planet, aspect: last.aspect, exactUTC: isoZ(voidStartMs), exactTR: isoTR(voidStartMs) };
    noAspectInSign = false;
  } else {
    voidStartMs = o.fromMs;
    noAspectInSign = true;
    notes.push("Bu burç periyodunda klasik kapsamda majör aspekt bulunmadı.");
  }
  const voidEndMs = o.toMs;
  const durationMinutes = Math.round((voidEndMs - voidStartMs) / 60000 * 10) / 10;

  return {
    id: `voc-${isoZ(o.fromMs)}`,
    moonSign: o.sign,
    nextMoonSign: o.nextSign!,
    signStartUTC: isoZ(o.fromMs), signEndUTC: isoZ(o.toMs),
    signStartTR: isoTR(o.fromMs), signEndTR: isoTR(o.toMs),
    voidStartUTC: isoZ(voidStartMs), voidEndUTC: isoZ(voidEndMs),
    voidStartTR: isoTR(voidStartMs), voidEndTR: isoTR(voidEndMs),
    durationMinutes,
    durationLabel: durationLabel(durationMinutes),
    lastAspect,
    noAspectInSign,
    definition: DEFINITION,
    includedBodies: CLASSICAL_BODIES,
    includedAspects: INCLUDED_ASPECTS,
    excludedBodies: EXCLUDED_BODIES,
    source: SOURCE,
    validationStatus: "harness-verified",
    confidence: "high",
    notes,
  };
}

// ─── Memoizasyon (deterministik → güvenli) ──────────────────────────────────────
const _cache = new Map<string, VoidMoonPeriod[]>();

// ─── Public API ─────────────────────────────────────────────────────────────────

/** [start, end) aralığındaki tüm VOC periyotları, kronolojik. */
export function getVoidMoonPeriods(start: Date, end: Date): VoidMoonPeriod[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!(endMs > startMs)) return [];
  const key = `${startMs}|${endMs}`;
  const cached = _cache.get(key);
  if (cached) return cached;
  const periods = enumerateOccupancies(startMs, endMs).map(buildPeriod);
  _cache.set(key, periods);
  return periods;
}

/** `from`tan sonraki (void'i henüz bitmemiş) ilk `count` VOC periyodu. */
export function getUpcomingVoidMoonPeriods(from: Date, count = 6): VoidMoonPeriod[] {
  const fromMs = from.getTime();
  // Her burç periyodu ≤ ~2.6 gün; count+2 tampon yeterli.
  const end = new Date(fromMs + (count + 2) * 2.7 * DAY_MS);
  return getVoidMoonPeriods(new Date(fromMs - 2.7 * DAY_MS), end)
    .filter(p => Date.parse(p.voidEndUTC) >= fromMs)
    .slice(0, count);
}

/** `date` anını kapsayan burç periyodunun VOC bilgisi (yoksa null). */
export function getCurrentVoidMoon(date: Date): VoidMoonPeriod | null {
  const p = getMoonSignPeriod(date);
  const sign = getMoonSign(new Date(Math.floor((p.from.getTime() + p.to.getTime()) / 2))).name;
  // nextSign için sonraki periyodu da hesapla
  const next = getMoonSignPeriod(new Date(p.to.getTime() + 120_000));
  const nextSign = getMoonSign(new Date(Math.floor((next.from.getTime() + next.to.getTime()) / 2))).name;
  return buildPeriod({ fromMs: p.from.getTime(), toMs: p.to.getTime(), sign, nextSign });
}

/** `date` anında Ay boşlukta (void) mı? */
export function isMoonVoid(date: Date): boolean {
  const cur = getCurrentVoidMoon(date);
  if (!cur) return false;
  return date.getTime() >= Date.parse(cur.voidStartUTC) && date.getTime() < Date.parse(cur.voidEndUTC);
}

/** Kullanılan tanım metası (UI'da açıkça gösterilmek üzere). */
export function getVoidMoonDefinition(): {
  definition: string;
  includedBodies: ReadonlyArray<AspectBody>;
  includedAspects: ReadonlyArray<AspectName>;
  excludedBodies: ReadonlyArray<string>;
  source: string;
} {
  return {
    definition: DEFINITION,
    includedBodies: CLASSICAL_BODIES,
    includedAspects: INCLUDED_ASPECTS,
    excludedBodies: EXCLUDED_BODIES,
    source: SOURCE,
  };
}
