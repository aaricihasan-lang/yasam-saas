// Gökyüzü Atlası — İleri Transit: tarih aralığı OLAY TARAMA motoru (SAF; ÜRÜNE BAĞLI DEĞİL; sağlayıcı çağrısı YOK).
//
// Üretilen olaylar: transit→natal ve transit–transit açılar için orb'a giriş, kesin an (geri hareket döngüsünde 1/N geçiş),
// orb'dan çıkış, teğetsel temas (kesinleşmeden çıkış) en yakın anı; geri/doğrudan istasyonlar; burç girişleri.
// Yöntem (segments.ts): göreli hızın işaret değişimleri → monoton parçalar → her hedef seviyenin tek kesişimi (≤1 sn).
// Zaman belirsizliği: efemeris konum hatası / göreli hız; hız sıfıra yaklaşınca ikinci dereceden sınır √(2·hata/|ivme|).
// HÜKÜM / YORUM ÜRETİLMEZ.

import { degInSign, signOf } from "../../horary/western/tables";
import { closestTo, levelCrossings, n360, signChanges, wrap180, type Crossing } from "./segments";
import {
  ACCEL_BOUND,
  ASPECTS,
  DEFAULT_ORB_DEG,
  SPEED_ERR_ARCSEC_PER_DAY,
  relativeMotionCanReverse,
  positionErrorArcsec,
  iso,
  lonAt as rawLon,
  speedAt as rawSpeed,
  validateScanRequest,
  type AspectId,
  type ContactKind,
  type ContactWindow,
  type ScanRequest,
  type ScanResult,
  type TransitBody,
  type TransitEvent,
  type ValidationError,
} from "./model";

const DAY = 86_400_000;
/** Döngü ailesi sınır taraması: iki ardışık istasyon arası en uzun süre (Mars ≈ 2 yıl) + pay. */
const CYCLE_PAD = 800 * DAY;
const LEVEL_EPS = 1e-9;

/** Kesin açı hedefleri: 0 ve 180 tek; diğerleri ±θ (d = λa − λb için θ ve 360 − θ ayrı aileler). */
export function targetsOf(aspect: AspectId): number[] {
  const t = ASPECTS[aspect];
  return t === 0 || t === 180 ? [t] : [t, 360 - t];
}

/** Olay zamanı belirsizliği (sn): hata δ (derece), göreli hız g (°/gün), ivme a (°/gün²). */
export function timeUncertaintySec(errDeg: number, g: number, a: number): number {
  const lin = Math.abs(g) > 1e-12 ? errDeg / Math.abs(g) : Infinity;
  const quad = Math.abs(a) > 1e-12 ? Math.sqrt((2 * errDeg) / Math.abs(a)) : Infinity;
  const days = Math.min(lin, quad);
  return Number.isFinite(days) ? Math.round(days * 86_400 * 10) / 10 : Number.POSITIVE_INFINITY;
}

type Track = {
  key: string;
  kind: ContactKind;
  a: TransitBody;
  b: string;
  d: (ms: number) => number;
  g: (ms: number) => number;
  turns: number[];
  errDeg: (ms: number) => number;
  bRetro: ((ms: number) => boolean) | null;
  canTurn: boolean;
};

export function scanTransits(req: ScanRequest): ScanResult | { error: ValidationError } {
  const bad = validateScanRequest(req);
  if (bad) return { error: bad };
  const started = Date.now();
  let evaluations = 0;
  const lonAt = (b: TransitBody, ms: number) => {
    evaluations++;
    return rawLon(b, ms);
  };
  const speedAt = (b: TransitBody, ms: number) => {
    evaluations += 2;
    return rawSpeed(b, ms);
  };
  const { startUtcMs: t0, endUtcMs: t1 } = req;
  const errOf = (b: TransitBody) => (ms: number) => positionErrorArcsec(b, ms) / 3600;
  const orbOf = (a: AspectId) => req.orbs?.[a] ?? req.defaultOrb ?? DEFAULT_ORB_DEG;
  const orbsUsed: Partial<Record<AspectId, number>> = {};
  for (const a of req.aspects) orbsUsed[a] = orbOf(a);

  // Gövde başına hız işaret değişimleri (istasyonlar) — transit→natal, burç girişi ve istasyon taramasında ortak.
  const bodyTurns = new Map<TransitBody, number[]>();
  const turnsOf = (b: TransitBody) => {
    let t = bodyTurns.get(b);
    if (!t) {
      t = signChanges((ms) => speedAt(b, ms), ACCEL_BOUND[b], t0, t1);
      bodyTurns.set(b, t);
    }
    return t;
  };

  const tracks: Track[] = [];
  if (req.include.natal) {
    for (const a of req.bodies) {
      for (const p of req.natalPoints ?? []) {
        tracks.push({ key: `${a}>${p.id}`, kind: "transit_natal", a, b: p.id, d: (ms) => lonAt(a, ms) - p.lon, g: (ms) => speedAt(a, ms), turns: turnsOf(a), errDeg: errOf(a), bRetro: null, canTurn: relativeMotionCanReverse(a, null) });
      }
    }
  }
  if (req.include.mundane) {
    const mb = req.mundaneBodies ?? req.bodies;
    for (let i = 0; i < mb.length; i++) {
      for (let j = i + 1; j < mb.length; j++) {
        const a = mb[i];
        const b = mb[j];
        const g = (ms: number) => speedAt(a, ms) - speedAt(b, ms);
        tracks.push({ key: `${a}~${b}`, kind: "transit_transit", a, b, d: (ms) => lonAt(a, ms) - lonAt(b, ms), g, turns: signChanges(g, ACCEL_BOUND[a] + ACCEL_BOUND[b], t0, t1), errDeg: (ms) => errOf(a)(ms) + errOf(b)(ms), bRetro: (ms) => speedAt(b, ms) < 0, canTurn: relativeMotionCanReverse(a, b) });
      }
    }
  }

  // Aralık dışı dönüşler (yalnız döngü ailesi sınırını belirlemek için; olay listesine GİRMEZ).
  const extCache = new Map<string, number[]>();
  const outsideTurns = (tr: Track, side: "before" | "after") => {
    const k = `${tr.kind === "transit_natal" ? tr.a : tr.key}|${side}`;
    let v = extCache.get(k);
    if (!v) {
      const [a, b] = side === "before" ? [t0 - CYCLE_PAD, t0] : [t1, t1 + CYCLE_PAD];
      const bound = tr.kind === "transit_natal" ? ACCEL_BOUND[tr.a] : ACCEL_BOUND[tr.a] + ACCEL_BOUND[tr.b as TransitBody];
      v = signChanges(tr.g, bound, a, b);
      extCache.set(k, v);
    }
    return v;
  };
  const windows: ContactWindow[] = [];
  const events: TransitEvent[] = [];
  const nearMisses: ScanResult["nearMisses"] = [];
  const accelOf = (g: (ms: number) => number, ms: number) => (g(ms + DAY / 2) - g(ms - DAY / 2)) / 1;

  for (const tr of tracks) {
    for (const aspect of req.aspects) {
      const orb = orbOf(aspect);
      for (const T of targetsOf(aspect)) {
        const levels = [n360(T - orb), n360(T), n360(T + orb)];
        const xs: Crossing[] = levelCrossings(tr.d, tr.turns, levels, t0, t1);
        const sep = (ms: number) => Math.abs(wrap180(tr.d(ms) - T));
        const isLevel = (x: Crossing, L: number) => Math.abs(wrap180(x.level - L)) < LEVEL_EPS;
        let inOrb = sep(t0) <= orb;
        type Open = { enter: number | null; exacts: number[] };
        let cur: Open | null = inOrb ? { enter: null, exacts: [] } : null;
        const closed: { enter: number | null; exit: number | null; exacts: number[] }[] = [];
        for (const x of xs) {
          if (isLevel(x, T)) {
            if (cur) cur.exacts.push(x.ms);
            continue;
          }
          inOrb = !inOrb;
          if (inOrb) cur = { enter: x.ms, exacts: [] };
          else if (cur) {
            closed.push({ enter: cur.enter, exit: x.ms, exacts: cur.exacts });
            cur = null;
          }
        }
        if (cur) closed.push({ enter: cur.enter, exit: null, exacts: cur.exacts });
        const marginal = tr.turns.filter((t) => t > t0 && t < t1).map((t) => ({ t, s: sep(t) }));
        // Geri hareket döngüsü aileleri: ardışık kesinleşmeler arasında tam 1 dönüş → aynı aile.
        const allExacts = closed.flatMap((w) => w.exacts).sort((x, y) => x - y);
        const famOf = new Map<number, { id: string; k: number; n: number; clipped: boolean }>();
        {
          const fams: number[][] = [];
          for (const ms of allExacts) {
            const last = fams[fams.length - 1];
            const prev = last?.[last.length - 1];
            const between = prev === undefined ? 0 : tr.turns.filter((t) => t > prev && t < ms).length;
            if (last && between === 1) last.push(ms);
            else fams.push([ms]);
          }
          fams.forEach((f, i) => {
            // Aile aralık sınırında kesiliyor mu? Aralığın DIŞINDAKİ en yakın kesinleşme ve aradaki dönüşler gerçekten taranır
            // (CYCLE_PAD); tahmin yapılmaz. Göreli hareketi hiç dönemeyen izlerde (Ay, Güneş–Mars…) aile her zaman tek geçiştir.
            let clipped = false;
            if (tr.canTurn && i === 0) {
              const ext = outsideTurns(tr, "before");
              const prev = levelCrossings(tr.d, ext, [T], t0 - CYCLE_PAD, t0).filter((x) => x.ms < t0).pop();
              if (prev) clipped = [...ext, ...tr.turns].filter((t) => t > prev.ms && t < f[0]).length === 1;
            }
            if (tr.canTurn && i === fams.length - 1 && !clipped) {
              const ext = outsideTurns(tr, "after");
              const next = levelCrossings(tr.d, ext, [T], t1, t1 + CYCLE_PAD).find((x) => x.ms > t1);
              if (next) clipped = [...tr.turns, ...ext].filter((t) => t > f[f.length - 1] && t < next.ms).length === 1;
            } else if (tr.canTurn && i === fams.length - 1 && i === 0) {
              const ext = outsideTurns(tr, "after");
              const next = levelCrossings(tr.d, ext, [T], t1, t1 + CYCLE_PAD).find((x) => x.ms > t1);
              if (next && [...tr.turns, ...ext].filter((t) => t > f[f.length - 1] && t < next.ms).length === 1) clipped = true;
            }
            const id = `${tr.kind === "transit_natal" ? "N" : "M"}:${tr.key}:${aspect}:${T}:c${i + 1}`;
            f.forEach((ms, k) => famOf.set(ms, { id, k: k + 1, n: f.length, clipped }));
          });
        }
        let n = 0;
        for (const w of closed) {
          n++;
          const id = `${tr.kind === "transit_natal" ? "N" : "M"}:${tr.key}:${aspect}:${T}:${n}`;
          const lo = w.enter ?? t0;
          const hi = w.exit ?? t1;
          const inside = marginal.filter((m) => m.t >= lo && m.t <= hi);
          // Yerel minimum: dönüş anında |d − T| iki yandan (±1 sa) büyükse ve kesin açıya ulaşılmadıysa (> 0).
          const nearApproaches = inside
            .filter((m) => m.s > 0 && sep(m.t - 3_600_000) > m.s && sep(m.t + 3_600_000) > m.s)
            .map((m) => ({ ms: m.t, atUtc: iso(m.t), separationDeg: m.s, uncertain: m.s < tr.errDeg(m.t) }));
          let closest: { ms: number; sep: number };
          if (w.exacts.length) closest = { ms: w.exacts[0], sep: 0 };
          else {
            const cands = [...inside.map((m) => ({ ms: m.t, sep: m.s })), { ms: lo, sep: sep(lo) }, { ms: hi, sep: sep(hi) }];
            closest = cands.reduce((x, y) => (y.sep < x.sep ? y : x));
            if (closest.ms !== lo && closest.ms !== hi) closest = closestTo(tr.d, T, Math.max(lo, closest.ms - DAY / 4), Math.min(hi, closest.ms + DAY / 4));
          }
          const unc = (ms: number) => timeUncertaintySec(tr.errDeg(ms), tr.g(ms), accelOf(tr.g, ms));
          const classification: ContactWindow["classification"] =
            w.exacts.length >= 2 ? "multiple" : w.exacts.length === 1 ? "single" : w.enter !== null && w.exit !== null ? "tangential" : "none_in_range";
          const win: ContactWindow = {
            id,
            kind: tr.kind,
            a: tr.a,
            b: tr.b,
            aspect,
            target: T,
            orb,
            enterMs: w.enter,
            enterUtc: w.enter === null ? null : iso(w.enter),
            enterUncertaintySec: w.enter === null ? null : unc(w.enter),
            exitMs: w.exit,
            exitUtc: w.exit === null ? null : iso(w.exit),
            exitUncertaintySec: w.exit === null ? null : unc(w.exit),
            startsBeforeRange: w.enter === null,
            endsAfterRange: w.exit === null,
            passes: w.exacts.map((ms, i) => ({
              ms,
              atUtc: iso(ms),
              pass: i + 1,
              of: w.exacts.length,
              cycleId: famOf.get(ms)!.id,
              cyclePass: famOf.get(ms)!.k,
              cycleOf: famOf.get(ms)!.n,
              cycleClippedByRange: famOf.get(ms)!.clipped,
              aRetrograde: speedAt(tr.a, ms) < 0,
              bRetrograde: tr.bRetro ? tr.bRetro(ms) : null,
              uncertaintySec: unc(ms),
            })),
            classification,
            closest: { ms: closest.ms, atUtc: iso(closest.ms), separationDeg: closest.sep },
            nearApproaches,
            flags: {
              passCountUncertain: inside.some((m) => m.s < tr.errDeg(m.t)) || (w.exacts.length === 0 && closest.sep < tr.errDeg(closest.ms)),
              windowUncertain: inside.some((m) => Math.abs(m.s - orb) < tr.errDeg(m.t)),
            },
          };
          windows.push(win);
          const base = { windowId: id, body: tr.a, other: tr.b, aspect };
          if (w.enter !== null) events.push({ type: "orb_enter", ms: w.enter, atUtc: iso(w.enter), uncertaintySec: win.enterUncertaintySec!, ...base });
          for (const p of win.passes) events.push({ type: "exact", ms: p.ms, atUtc: p.atUtc, uncertaintySec: p.uncertaintySec, pass: p.cyclePass, of: p.cycleOf, cycleId: p.cycleId, retrograde: p.aRetrograde, ...base });
          // Teğetsel pencerenin en yakın anı + pencere içindeki diğer kesinleşmeyen yerel yaklaşmalar (tekrarsız).
          const approaches = classification === "tangential" && !nearApproaches.some((x) => Math.abs(x.ms - closest.ms) < 2000) ? [{ ms: closest.ms, separationDeg: closest.sep }, ...nearApproaches] : nearApproaches;
          for (const x of approaches) events.push({ type: "closest_approach", ms: x.ms, atUtc: iso(x.ms), uncertaintySec: unc(x.ms), separationDeg: x.separationDeg, ...base });
          if (w.exit !== null) events.push({ type: "orb_exit", ms: w.exit, atUtc: iso(w.exit), uncertaintySec: win.exitUncertaintySec!, ...base });
        }
        // Orb dışında kalmış ama sınıra hata kadar yakın uç değerler → olası fazladan pencere.
        for (const m of marginal) {
          if (m.s > orb && m.s - orb < tr.errDeg(m.t) && !closed.some((w) => m.t >= (w.enter ?? t0) && m.t <= (w.exit ?? t1))) {
            nearMisses.push({ pair: tr.key, aspect, target: T, ms: m.t, atUtc: iso(m.t), separationDeg: m.s });
          }
        }
      }
    }
  }

  const SIGN_LEVELS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  for (const b of req.bodies) {
    if (req.include.stations && b !== "sun" && b !== "moon") {
      for (const ms of turnsOf(b)) {
        if (ms <= t0 || ms >= t1) continue;
        const after = speedAt(b, ms + 3_600_000);
        const acc = speedAt(b, ms + DAY / 2) - speedAt(b, ms - DAY / 2);
        const unc = Math.abs(acc) < 1e-12 ? Number.POSITIVE_INFINITY : Math.round(((SPEED_ERR_ARCSEC_PER_DAY[b] / 3600) / Math.abs(acc)) * 86_400 * 10) / 10;
        events.push({ type: "station", ms, atUtc: iso(ms), uncertaintySec: unc, body: b, other: null, station: after < 0 ? "retrograde" : "direct", lon: n360(lonAt(b, ms)) });
      }
    }
    if (req.include.ingresses) {
      const g = (ms: number) => speedAt(b, ms);
      for (const x of levelCrossings((ms) => lonAt(b, ms), turnsOf(b), SIGN_LEVELS, t0, t1)) {
        const to = x.dir > 0 ? signOf(x.level + 1e-6) : signOf(x.level - 1e-6);
        const from = x.dir > 0 ? signOf(x.level - 1e-6) : signOf(x.level + 1e-6);
        events.push({ type: "ingress", ms: x.ms, atUtc: iso(x.ms), uncertaintySec: timeUncertaintySec(errOf(b)(x.ms), g(x.ms), accelOf(g, x.ms)), body: b, other: to, fromSign: from, toSign: to, retrograde: x.dir < 0 });
      }
    }
  }

  const ORDER: Record<string, number> = { ingress: 0, station: 1, orb_enter: 2, exact: 3, closest_approach: 4, orb_exit: 5 };
  events.sort((x, y) => x.ms - y.ms || ORDER[x.type] - ORDER[y.type]);
  windows.sort((x, y) => (x.enterMs ?? t0) - (y.enterMs ?? t0));
  return {
    schema: "astro.pro.transit-scan.v1",
    source: { ephemeris: "astronomy-engine@2.1.19", positionErrorArcsec: Object.fromEntries([...new Set([...req.bodies, ...(req.mundaneBodies ?? [])])].map((b) => [b, positionErrorArcsec(b, t0)])), providerCalls: 0 },
    range: { startUtc: iso(t0), endUtc: iso(t1) },
    orbsUsed,
    windows,
    events,
    nearMisses,
    stats: { evaluations, ms: Date.now() - started },
  };
}

/** Anlık açı durumu (sağlayıcı tek-an karşılaştırması için): orb = |d − hedef|, applying = |d − hedef| azalıyor mu. */
export function aspectStateAt(aLon: number, aSpeed: number, bLon: number, bSpeed: number, aspect: AspectId) {
  let best = { target: 0, err: Infinity };
  for (const T of targetsOf(aspect)) {
    const e = wrap180(aLon - bLon - T);
    if (Math.abs(e) < Math.abs(best.err)) best = { target: T, err: e };
  }
  const rel = aSpeed - bSpeed;
  return { target: best.target, orb: Math.abs(best.err), applying: best.err * rel < 0 };
}

export const degreeInSign = degInSign;
