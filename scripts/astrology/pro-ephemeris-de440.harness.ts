/**
 * GÖKYÜZÜ ATLASI — JPL DE440 KONUM MOTORU: bağımsız doğrulama (ücretli çağrı YOK; ağ YOK).
 *
 * "DE440 kullanan iki okuyucunun uyuşması tek başına yeterli değildir" (owner 03.11.2026) → referanslar FARKLI veri ve/veya kod:
 *   K-SE   Swiss Ephemeris 2.10.03 SWIEPH dosyaları (DE431 tabanlı sıkıştırılmış veri + Astrodienst indirgeme kodu)
 *   K-HZ   JPL Horizons astrometrik α/δ (DE441 + JPL'in kendi yazılımı)
 *   K-IERS IERS Conventions 2010 Tablo 5.3a/5.3b nütasyonu (fikstür üreticisinde ayrı Python uygulaması)
 *   K-MO   Swiss Ephemeris Moshier (JPL'den bağımsız analitik; yalnız kaba sağlama)
 * Fikstür: scripts/astrology/fixtures/pro-ephemeris-de440/independent-ref.json (üretici ref_independent.py; ürün kodu kullanılmaz).
 * Konum hatası, olay anı hatası (TT'de) ve ΔT belirsizliği AYRI ölçülür. Her ölçüm "ÖLÇÜ" satırıyla yazılır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-ephemeris-de440.harness.ts
 * Önkoşul: data/ephemeris/de440.bsp (npm run ephemeris:fetch). Dosya yoksa test DÜŞER (atlanmaz).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { deltaTUncertaintySec, DE440_LIMITS, eraOf, LOCAL_LIMITS, localLimits } from "@/lib/astrology/pro/ephemeris/accuracy";
import { astrometricRaDec } from "@/lib/astrology/positions/de440/apparent";
import { nutation2006A, nutationFast } from "@/lib/astrology/positions/de440/frames";
import { de440, de440Path, de440Status, DE440_FILE } from "@/lib/astrology/positions/de440/source";
import { ensurePositionEngine, positionEngineInfo } from "@/lib/astrology/pro/ephemeris/engine";
import { findEvents } from "@/lib/astrology/pro/ephemeris/events";
import { localPosition, meanNodeLon, trueNodeLon, wrap180 } from "@/lib/astrology/pro/ephemeris/local";
import { buildEphemeris, parseEphemerisRequest } from "@/lib/astrology/pro/ephemeris/table";
import { PLANET_BODIES, type EphemerisBody, type EphemerisEvent, type PlanetBody } from "@/lib/astrology/pro/ephemeris/types";
import { findDegreeCrossings, type DegreeCrossing } from "@/lib/astrology/pro/degrees/crossings";
import { buildDegreeCrossings, parseDegreeRequest } from "@/lib/astrology/pro/degrees/request";
import { deltaTModelSeconds, scalesFromUtc, isTimeScalesError } from "@/lib/astrology/time";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack ?? String(e)}\n`);
  }
}
const olcu = (s: string) => console.log(`  ÖLÇÜ ${s}`);
const as = (deg: number) => Math.abs(deg) * 3600;
const PLANETS = PLANET_BODIES as readonly PlanetBody[];
const JD_UNIX = 2440587.5;
const DAY = 86_400_000;

type Row = { tt_jd: number; b: Record<string, { se: number[]; mo?: number[] }>; nut_iers: [number, number]; se_true_obliquity: number; se_dpsi_arcsec: number };
type RefEvent = { body: EphemerisBody; kind: "ingress" | "station"; tt_jd: number; toSign?: number; direction?: string; window: [number[], number[]] };
type DegCase = { body: EphemerisBody; degrees: number[]; start: string; end: string; events: [number, number, number][]; moshier_ref: [number, number, number, number, number][] };
const REF = JSON.parse(readFileSync(join(process.cwd(), "scripts/astrology/fixtures/pro-ephemeris-de440/independent-ref.json"), "utf8")) as {
  rows: Row[];
  horizons: { epochs_tt_jd: number[]; bodies: Record<string, { source: string; rows: number[][] }> };
  events: RefEvent[];
  pluto_2055: { D: number; tt_jd: number[]; dir: number[]; station_tt_jd: number; station_excess_arcsec: number };
  degree_cases: Record<string, DegCase[]>;
  deltat_se_sample: Record<string, number>;
};

/** TT JD → UTC ms (ortak zaman katmanıyla; yineleme). */
function utcMsOfTt(ttJd: number): number {
  const ttMs = (ttJd - JD_UNIX) * DAY;
  let ms = ttMs - 69_000;
  for (let i = 0; i < 6; i++) {
    const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
    if (isTimeScalesError(s)) throw new Error(s.error);
    ms += ttMs - s.ttMs;
  }
  return ms;
}
function ttJdOfUtc(ms: number): number {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(s)) throw new Error(s.error);
  return s.ttMs / DAY + JD_UNIX;
}
const withEngine = <T>(engine: "de440" | "legacy", fn: () => T): T => {
  const prev = process.env.ATLAS_PRO_EPHEMERIS_ENGINE;
  process.env.ATLAS_PRO_EPHEMERIS_ENGINE = engine;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ATLAS_PRO_EPHEMERIS_ENGINE;
    else process.env.ATLAS_PRO_EPHEMERIS_ENGINE = prev;
  }
};

async function sha256(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const c of createReadStream(path)) h.update(c as Buffer);
  return h.digest("hex");
}

async function main() {
  // ─── 0. Veri dosyası kimliği ──────────────────────────────────────────────────────────────────────
  await t("DE440 dosyası: resmî boyut + SHA-256 (değiştirilmemiş kernel) ve kapsam 1550–2650", async () => {
    const st = de440Status();
    assert.ok(st.ok, `DE440 yok: ${"reason" in st ? st.reason : ""} — önce: npm run ephemeris:fetch`);
    assert.equal(await sha256(de440Path()), DE440_FILE.sha256);
    const c = de440().coverage;
    olcu(`kapsam TDB ${new Date(c.start * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString().slice(0, 10)} – ${new Date(c.end * 1000 + Date.UTC(2000, 0, 1, 12)).toISOString().slice(0, 10)}`);
    assert.ok(c.start < (Date.UTC(1600, 0, 1) - Date.UTC(2000, 0, 1, 12)) / 1000 && c.end > (Date.UTC(2601, 0, 1) - Date.UTC(2000, 0, 1, 12)) / 1000);
  });

  // ─── 1. Nütasyon (ERFA aktarımı) ↔ IERS 2010 tabloları (ayrı uygulama) ───────────────────────────────
  await t("IAU 2000A_R06 nütasyon ↔ IERS Conventions 2010 Tablo 5.3a/b: |ΔΔψ|, |ΔΔε| ≤ 0,0001″ (1600–2600)", () => {
    let wp = 0;
    let we = 0;
    for (const r of REF.rows) {
      const n = nutation2006A((r.tt_jd - 2451545) / 36525);
      const R2AS = 180 / Math.PI * 3600;
      wp = Math.max(wp, Math.abs(n.dpsi * R2AS - r.nut_iers[0]));
      we = Math.max(we, Math.abs(n.deps * R2AS - r.nut_iers[1]));
    }
    olcu(`nütasyon farkı Δψ ${(wp * 1e6).toFixed(2)} µas, Δε ${(we * 1e6).toFixed(2)} µas (${REF.rows.length} an)`);
    assert.ok(wp <= 1e-4 && we <= 1e-4);
  });

  await t("hızlı nütasyon (8 günlük blok Chebyshev) ↔ tam IAU 2000A_R06 serisi: < 1 µas (5.000 rastgele an, 1600–2600)", () => {
    let w = 0;
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      const tc = -4 + 10 * rnd();
      const a = nutationFast(tc);
      const b = nutation2006A(tc);
      w = Math.max(w, Math.abs(a.dpsi - b.dpsi), Math.abs(a.deps - b.deps));
    }
    const uas = w * (180 / Math.PI) * 3600 * 1e6;
    olcu(`ara değer hatası en çok ${uas.toFixed(4)} µas`);
    assert.ok(uas < 1);
  });

  // ─── 2. Konum: DE440 motoru ↔ Swiss Ephemeris SWIEPH (TT anı; ΔT yok) ────────────────────────────────
  const posWorst: Record<string, number[]> = {};
  await t("konum (TT anında) ↔ Swiss Ephemeris SWIEPH: boylam/enlem/α·cosδ/δ/hız ≤ DE440 sınırı (1600–2600, 384 an)", () => {
    const viol: string[] = [];
    const conj: string[] = [];
    for (const r of REF.rows) {
      const ms = utcMsOfTt(r.tt_jd);
      const era = eraOf(new Date(ms).getUTCFullYear());
      for (const b of PLANETS) {
        const [lon, lat, ra, dec, sp] = r.b[b].se;
        const p = localPosition(b, ms);
        const d = [as(wrap180(p.lon - lon)), as(p.lat! - lat), as(wrap180(p.ra! - ra) * Math.cos((dec * Math.PI) / 180)), as(p.dec! - dec), as(p.speed - sp)];
        const k = `${era} ${b}`;
        posWorst[k] = (posWorst[k] ?? [0, 0, 0, 0, 0]).map((w, i) => Math.max(w, d[i]));
        const lim = DE440_LIMITS[era][b]!;
        // Güneş'e < 2° kavuşumda SE hızı ışık bükülmesi türevini içermez (tanım farkı) → hız orada ayrı raporlanır, konum yine sınanır.
        if (b !== "sun" && b !== "moon" && as(wrap180(p.lon - r.b.sun.se[0])) < 2 * 3600) {
          conj.push(`${r.tt_jd} ${b} ${d[4].toFixed(3)}″/gün`);
          d[4] = 0;
        }
        if (d[0] > lim.lon || d[1] > lim.lat || d[2] > lim.radec || d[3] > lim.radec || d[4] > lim.speed) viol.push(`${r.tt_jd} ${b} ${d.map((x) => x.toFixed(4)).join("/")}`);
      }
    }
    olcu(`Güneş kavuşumu (<2°) anları: ${conj.length} (hız sınanmadı — referansın hız tanımı ışık bükülmesi türevini içermez); en büyükleri: ${conj.filter((c) => +c.split(" ").at(-1)!.replace("″/gün", "") > 0.05).join("; ") || "yok"}`);
    for (const [k, w] of Object.entries(posWorst)) olcu(`DE440↔SE ${k} boylam ${w[0].toFixed(4)}″ enlem ${w[1].toFixed(4)}″ α·cosδ ${w[2].toFixed(4)}″ δ ${w[3].toFixed(4)}″ hız ${w[4].toFixed(4)}″/gün`);
    assert.deepEqual(viol, []);
  });

  await t("astrometrik α/δ (ICRF) ↔ JPL Horizons (DE441, JPL yazılımı): gezegen/Güneş ≤ 0,01″; Ay ≤ dönem sınırı (DE440↔DE441 Ay farkı)", () => {
    const per: Record<string, number> = {};
    const viol: string[] = [];
    REF.horizons.epochs_tt_jd.forEach((jd, i) => {
      const era = eraOf(new Date(utcMsOfTt(jd)).getUTCFullYear());
      for (const b of PLANETS) {
        const [ra, dec] = REF.horizons.bodies[b].rows[i];
        const p = astrometricRaDec(de440(), b, jd);
        const d = Math.max(as(wrap180(p.ra - ra) * Math.cos((dec * Math.PI) / 180)), as(p.dec - dec));
        const k = `${era} ${b}`;
        per[k] = Math.max(per[k] ?? 0, d);
        if (d > (b === "moon" ? DE440_LIMITS[era].moon!.radec : 0.01)) viol.push(`${k} ${jd} ${d.toFixed(4)}″`);
      }
    });
    olcu(`Horizons astrometrik Ay: ${Object.entries(per).filter(([k]) => k.endsWith("moon")).map(([k, v]) => `${k} ${v.toFixed(4)}″`).join(" · ")}`);
    olcu(`Horizons astrometrik Güneş+gezegenler en büyük ${Math.max(...Object.entries(per).filter(([k]) => !k.endsWith("moon")).map(([, v]) => v)).toFixed(5)}″ (${REF.horizons.epochs_tt_jd.length} an)`);
    assert.deepEqual(viol, []);
  });

  await t("Horizons GÖRÜNÜR α/δ (bilgi): fark IAU76/80 ↔ IAU2006/2000A model farkı (≤ 1,5″, −53 mas ekinoks ofseti dahil)", () => {
    let w = 0;
    REF.horizons.epochs_tt_jd.forEach((jd, i) => {
      const ms = utcMsOfTt(jd);
      for (const b of PLANETS) {
        const [, , ra, dec] = REF.horizons.bodies[b].rows[i];
        const p = localPosition(b, ms);
        w = Math.max(w, as(wrap180(p.ra! - ra) * Math.cos((dec * Math.PI) / 180)), as(p.dec! - dec));
      }
    });
    olcu(`Horizons görünür α/δ en büyük fark ${w.toFixed(3)}″ (model farkı; doğrulama ölçütü astrometrik testtir)`);
    assert.ok(w <= 1.5);
  });

  await t("kaba bağımsız sağlama: Moshier (JPL'den bağımsız analitik) ↔ DE440: 1920–2150 ≤ 5″, 1600–2600 ≤ 20″ (Moshier'in kendi hatası)", () => {
    let w = 0;
    let wAll = 0;
    for (const r of REF.rows) {
      const ms = utcMsOfTt(r.tt_jd);
      const y = new Date(ms).getUTCFullYear();
      for (const b of PLANETS) {
        const d = as(wrap180(localPosition(b, ms).lon - r.b[b].mo![0]));
        wAll = Math.max(wAll, d);
        if (y >= 1920 && y <= 2150) w = Math.max(w, d);
      }
    }
    olcu(`Moshier farkı 1920–2150 en çok ${w.toFixed(2)}″, 1600–2600 en çok ${wAll.toFixed(2)}″`);
    assert.ok(w <= 5 && wAll <= 20);
  });

  await t("düğümler ↔ SE SWIEPH: ortalama ≤ dönem sınırı, gerçek (oskülasyon) ≤ dönem sınırı", () => {
    let wm = 0;
    let wt = 0;
    const viol: string[] = [];
    for (const r of REF.rows) {
      const ms = utcMsOfTt(r.tt_jd);
      const era = eraOf(new Date(ms).getUTCFullYear());
      const dm = as(wrap180(meanNodeLon(ms) - r.b.mean_node.se[0]));
      const dt = as(wrap180(trueNodeLon(ms) - r.b.true_node.se[0]));
      wm = Math.max(wm, dm);
      wt = Math.max(wt, dt);
      if (dm > DE440_LIMITS[era].mean_node!.lon || dt > DE440_LIMITS[era].true_node!.lon) viol.push(`${r.tt_jd} ortalama ${dm.toFixed(3)} gerçek ${dt.toFixed(3)}`);
    }
    const oldTrue = withEngine("legacy", () => Math.max(...REF.rows.map((r) => as(wrap180(trueNodeLon(utcMsOfTt(r.tt_jd)) - r.b.true_node.se[0])))));
    olcu(`ortalama düğüm ${wm.toFixed(3)}″ (formül; motordan bağımsız), gerçek düğüm ${wt.toFixed(3)}″ (eski motor ${oldTrue.toFixed(2)}″) — SE SWIEPH`);
    assert.deepEqual(viol, []);
  });

  await t("ÖNCE/SONRA: aynı anlarda eski motor ↔ SE (boylam, en büyük)", () => {
    const w: Record<string, [number, number]> = {};
    for (const r of REF.rows.filter((x) => x.tt_jd > 2422324 && x.tt_jd < 2506697)) {
      const ms = utcMsOfTt(r.tt_jd);
      for (const b of PLANETS) {
        const nw = as(wrap180(localPosition(b, ms).lon - r.b[b].se[0]));
        const old = withEngine("legacy", () => as(wrap180(localPosition(b, ms).lon - r.b[b].se[0])));
        w[b] = [Math.max(w[b]?.[0] ?? 0, old), Math.max(w[b]?.[1] ?? 0, nw)];
      }
    }
    for (const [b, [o, n]] of Object.entries(w)) olcu(`1920–2150 ${b}: eski ${o.toFixed(2)}″ → DE440 ${n.toFixed(4)}″`);
  });

  // ─── 3. Olaylar ↔ SE (TT ekseninde; ΔT ayrı) ─────────────────────────────────────────────────────────
  await t("burç girişleri + istasyonlar ↔ SE SWIEPH olayları: eksik 0 / fazla 0, |ΔTT| ≤ konum belirsizliği + 1 s", () => {
    const windows = new Map<string, { a: number[]; z: number[]; bodies: Set<EphemerisBody> }>();
    for (const e of REF.events) {
      const k = `${e.window[0].join("-")}_${e.window[1].join("-")}`;
      const w = windows.get(k) ?? { a: e.window[0], z: e.window[1], bodies: new Set() };
      w.bodies.add(e.body);
      windows.set(k, w);
    }
    const viol: string[] = [];
    const stat: Record<string, { n: number; maxS: number }> = {};
    let n = 0;
    let edge = 0;
    for (const [k, w] of windows) {
      const t0 = Date.UTC(w.a[0], w.a[1] - 1, w.a[2]);
      const t1 = Date.UTC(w.z[0], w.z[1] - 1, w.z[2]);
      for (const b of w.bodies) {
        const ref = REF.events.filter((e) => e.body === b && `${e.window[0].join("-")}_${e.window[1].join("-")}` === k);
        const mine = findEvents([b], t0, t1, "tropical", "local");
        const used = new Set<number>();
        for (const r of ref) {
          const rUtc = utcMsOfTt(r.tt_jd);
          if (Math.abs(rUtc - t0) < 600_000 || Math.abs(rUtc - t1) < 600_000) {
            edge++;
            continue;
          }
          let best = -1;
          let bd = Infinity;
          mine.forEach((m, i) => {
            if (used.has(i) || m.kind !== r.kind) return;
            const d = Math.abs(ttJdOfUtc(m.ms) - r.tt_jd) * 86400;
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          if (best < 0 || bd > 3 * 86400) {
            viol.push(`EKSİK ${b} ${r.kind} ${new Date(rUtc).toISOString()}`);
            continue;
          }
          used.add(best);
          const m = mine[best] as EphemerisEvent;
          const posUnc = m.uncertaintySec - deltaTUncertaintySec(m.ms);
          const key = `${b} ${r.kind}`;
          stat[key] = { n: (stat[key]?.n ?? 0) + 1, maxS: Math.max(stat[key]?.maxS ?? 0, bd) };
          n++;
          if (bd > posUnc) viol.push(`${b} ${r.kind} ${m.ut} ΔTT ${bd.toFixed(1)} s > ${posUnc.toFixed(1)} s`);
          if (m.kind === "ingress" && r.toSign !== undefined && m.toSign !== r.toSign) viol.push(`${b} burç ${m.toSign}≠${r.toSign}`);
        }
        mine.forEach((m, i) => {
          if (used.has(i)) return;
          if (Math.abs(m.ms - t0) < 600_000 || Math.abs(m.ms - t1) < 600_000) return;
          viol.push(`FAZLA ${b} ${m.kind} ${m.ut}`);
        });
      }
    }
    for (const [k, s] of Object.entries(stat)) olcu(`olay ${k}: ${s.n} eşleşme, en büyük |ΔTT| ${s.maxS.toFixed(2)} s`);
    olcu(`toplam ${n} olay eşleşti, ${edge} pencere kenarı olayı sayılmadı`);
    assert.deepEqual(viol, []);
    assert.ok(n >= 900);
  });

  await t("Neptün 1984-01-19 Oğlak girişi: ÖNCE (eski motor) / SONRA (DE440) ↔ SE SWIEPH (TT)", () => {
    const r = REF.events.find((e) => e.body === "neptune" && e.kind === "ingress" && e.toSign === 9 && e.tt_jd > 2445700 && e.tt_jd < 2445720)!;
    assert.ok(r, "referans olay yok");
    const t0 = Date.UTC(1984, 0, 1);
    const t1 = Date.UTC(1984, 1, 1);
    const pick = (es: EphemerisEvent[]) => es.find((e) => e.kind === "ingress" && e.toSign === 9)!;
    const nw = pick(findEvents(["neptune"], t0, t1, "tropical", "local"));
    const old = withEngine("legacy", () => pick(findEvents(["neptune"], t0, t1, "tropical", "local")));
    const dNew = (ttJdOfUtc(nw.ms) - r.tt_jd) * 86400;
    const dOld = (ttJdOfUtc(old.ms) - r.tt_jd) * 86400;
    olcu(`Neptün Oğlak girişi SE ${new Date(utcMsOfTt(r.tt_jd)).toISOString()} · eski ${old.ut} (Δ ${dOld.toFixed(0)} s, bildirilen ±${old.uncertaintySec.toFixed(0)} s) · DE440 ${nw.ut} (Δ ${dNew.toFixed(2)} s, bildirilen ±${nw.uncertaintySec.toFixed(0)} s)`);
    assert.ok(Math.abs(dOld) > 3600, "eski motor farkı yeniden üretilemedi");
    assert.ok(Math.abs(dNew) <= nw.uncertaintySec);
  });

  // ─── 4. Plüton 2055 ─────────────────────────────────────────────────────────────────────────────────
  await t("Plüton D=346,99° (2052-03-17..2060-03-14): DE440 5 geçiş D/R/D/R/D, tekrar 1/5..5/5, ΔTT ≤ belirsizlik; eski motor 3", () => {
    const P = REF.pluto_2055;
    const req = parseDegreeRequest({ body: "pluto", degrees: [346.99], start: "2052-03-17", end: "2060-03-14", zodiac: "tropical" });
    assert.ok(req.ok);
    const r = buildDegreeCrossings(req.value);
    assert.ok(r.ok);
    const ev = r.result.events;
    const old = withEngine("legacy", () => {
      const x = buildDegreeCrossings(req.value);
      assert.ok(x.ok);
      return x.result;
    });
    olcu(`Plüton istasyon aşımı (SE): ${P.station_excess_arcsec.toFixed(3)}″ · eski motor ${old.events.length} geçiş (${old.positionEngine.label}) → DE440 ${ev.length} geçiş`);
    ev.forEach((e, i) => olcu(`  ${i + 1}. ${e.ut} ${e.direction} ${e.pass}/${e.passCount} ±${e.uncertaintySec.toFixed(0)} s · SE ${new Date(utcMsOfTt(P.tt_jd[i])).toISOString()} · ΔTT ${((ttJdOfUtc(e.ms) - P.tt_jd[i]) * 86400).toFixed(1)} s`));
    assert.equal(old.events.length, 3);
    assert.equal(ev.length, 5);
    assert.deepEqual(ev.map((e) => e.direction), ["direct", "retrograde", "direct", "retrograde", "direct"]);
    assert.deepEqual(P.dir, [1, -1, 1, -1, 1]);
    assert.deepEqual(ev.map((e) => `${e.pass}/${e.passCount}`), ["1/5", "2/5", "3/5", "4/5", "5/5"]);
    ev.forEach((e, i) => assert.ok(Math.abs(ttJdOfUtc(e.ms) - P.tt_jd[i]) * 86400 <= e.uncertaintySec - deltaTUncertaintySec(e.ms), `geçiş ${i + 1}`));
    assert.equal(r.result.positionEngine.id, "jpl_de440");
    assert.equal(r.result.engineVersion, "pro-degree-crossings-1+jpl_de440");
  });

  // ─── 5. 03.11 canlı QA derece vakaları (120 vaka; aynı tanımlar) ↔ SE SWIEPH (TT) ────────────────────
  await t("03.11 canlı QA 120 derece vakası: geçiş sayısı + yön + tekrar k/n BİREBİR (SE SWIEPH), |ΔTT| ≤ belirsizlik", () => {
    const viol: string[] = [];
    let cases = 0;
    let events = 0;
    let maxRatio = 0;
    const beforeAfter: string[] = [];
    for (const [group, list] of Object.entries(REF.degree_cases)) {
      list.forEach((c, idx) => {
        cases++;
        const t0 = Date.parse(`${c.start}T00:00:00Z`);
        const t1 = Date.parse(`${c.end}T00:00:00Z`) + DAY;
        const r = findDegreeCrossings(c.body, c.degrees, t0, t1, "tropical");
        assert.ok(r.ok);
        const mine = r.events as DegreeCrossing[];
        const ref = c.events.filter((e) => Math.abs(utcMsOfTt(e[1]) - t0) > 600_000 && Math.abs(utcMsOfTt(e[1]) - t1) > 600_000);
        // tekrar grupları (owner tanımı: aynı derecede ardışık geçişler yön değiştiriyorsa aynı grup)
        const byDeg = new Map<number, [number, number, number][]>();
        for (const e of ref) byDeg.set(e[0], [...(byDeg.get(e[0]) ?? []), e]);
        const refPass = new Map<string, string>();
        for (const [, lst] of byDeg) {
          let grp: [number, number, number][] = [];
          const close = () => grp.forEach((x, i) => refPass.set(`${x[0]}|${x[1]}`, `${i + 1}/${grp.length}`));
          for (const e of lst.sort((a, b) => a[1] - b[1])) {
            if (grp.length && grp[grp.length - 1][2] === e[2]) {
              close();
              grp = [];
            }
            grp.push(e);
          }
          close();
        }
        const tag = `${group}#${idx + 1} ${c.body} ${c.degrees.length > 1 ? `${c.degrees.length} derece` : c.degrees[0]}`;
        if (mine.length !== ref.length) {
          viol.push(`${tag}: sayı ${mine.length} ≠ SE ${ref.length}`);
          return;
        }
        const refSorted = [...ref].sort((a, b) => a[1] - b[1]);
        mine.forEach((m, i) => {
          const e = refSorted[i];
          events++;
          const dir = m.direction === "direct" ? 1 : -1;
          const d = Math.abs(ttJdOfUtc(m.ms) - e[1]) * 86400;
          const posUnc = m.uncertaintySec - deltaTUncertaintySec(m.ms);
          maxRatio = Math.max(maxRatio, d / posUnc);
          if (Math.abs(m.degree - e[0]) > 1e-6 || dir !== e[2]) viol.push(`${tag} ${i + 1}: derece/yön`);
          if (`${m.pass}/${m.passCount}` !== refPass.get(`${e[0]}|${e[1]}`)) viol.push(`${tag} ${i + 1}: tekrar ${m.pass}/${m.passCount} ≠ ${refPass.get(`${e[0]}|${e[1]}`)}`);
          if (d > posUnc) viol.push(`${tag} ${i + 1}: ΔTT ${d.toFixed(1)} s > ${posUnc.toFixed(1)} s`);
        });
        const oldN = withEngine("legacy", () => {
          const x = findDegreeCrossings(c.body, c.degrees, t0, t1, "tropical");
          return x.ok ? x.events.length : -1;
        });
        if (oldN !== ref.length) beforeAfter.push(`${tag}: eski ${oldN} → DE440 ${mine.length} (SE ${ref.length})`);
      });
    }
    olcu(`${cases} vaka, ${events} geçiş; en büyük |ΔTT|/konum-belirsizliği oranı ${maxRatio.toFixed(3)}`);
    for (const x of beforeAfter) olcu(`ÖNCE/SONRA ${x}`);
    if (beforeAfter.length === 0) olcu("ÖNCE/SONRA: eski motor sayı farkı yok");
    assert.deepEqual(viol, []);
    assert.equal(cases, 120);
  });

  // ─── 6. ΔT ayrı ölçüm ───────────────────────────────────────────────────────────────────────────────
  await t("ΔT: model tablosu ↔ Swiss Ephemeris ΔT (bilgi) + belirsizlik modeli (konumdan AYRI) monoton ve kaynaklı", () => {
    for (const [y, se] of Object.entries(REF.deltat_se_sample)) {
      const ms = Date.UTC(+y, 0, 1);
      const ours = deltaTModelSeconds(ms);
      olcu(`ΔT ${y}: tablo ${ours?.toFixed(2)} s · SE ${se.toFixed(2)} s · fark ${ours === null ? "-" : (ours - se).toFixed(2)} s · belirsizlik (model) ±${deltaTUncertaintySec(ms).toFixed(1)} s`);
    }
    assert.equal(deltaTUncertaintySec(Date.UTC(2026, 10, 3)), 0);
    assert.ok(deltaTUncertaintySec(Date.UTC(2100, 0, 1)) > deltaTUncertaintySec(Date.UTC(2055, 0, 1)));
    assert.ok(deltaTUncertaintySec(Date.UTC(1600, 0, 1)) > deltaTUncertaintySec(Date.UTC(1900, 0, 1)));
  });

  await t("gösterim hassasiyeti ΔT'yi hesaba katar: 2026 Ay boylamı saniye; 2150 Ay boylamı dakika (gereğinden ince basamak yok)", async () => {
    const a = parseEphemerisRequest({ view: "month", year: 2026, month: 11, bodies: ["moon", "pluto"] });
    const b = parseEphemerisRequest({ view: "month", year: 2150, month: 6, bodies: ["moon", "pluto"] });
    assert.ok(a.ok && b.ok);
    assert.ok(deltaTUncertaintySec(Date.UTC(1600, 0, 1)) >= Math.abs(REF.deltat_se_sample["1600"] - deltaTModelSeconds(Date.UTC(1600, 0, 1))!), "ΔT belirsizliği model farkını kapsamalı");
    const ra = await buildEphemeris(a.value);
    const rb = await buildEphemeris(b.value);
    assert.ok(ra.ok && rb.ok);
    olcu(`2026-11: Ay ${ra.result.meta.bodyPrecision.moon!.lon}, Plüton ${ra.result.meta.bodyPrecision.pluto!.lon}, ΔT ±${ra.result.meta.deltaTUncertaintySec.join("/")} s · 2150-06: Ay ${rb.result.meta.bodyPrecision.moon!.lon}, Plüton ${rb.result.meta.bodyPrecision.pluto!.lon}, ΔT ±${rb.result.meta.deltaTUncertaintySec.map((x) => x.toFixed(0)).join("/")} s`);
    assert.equal(ra.result.meta.bodyPrecision.moon!.lon, "arcsec");
    assert.equal(rb.result.meta.bodyPrecision.moon!.lon, "arcmin");
    assert.equal(rb.result.meta.bodyPrecision.pluto!.lon, "arcsec");
    assert.equal(ra.result.meta.positionEngine.id, "jpl_de440");
    assert.equal(ra.result.meta.engineVersion, "pro-ephemeris-2-de440");
  });

  // ─── 7. Geri dönüş ve açık hata ─────────────────────────────────────────────────────────────────────
  await t("kontrollü geri dönüş: ATLAS_PRO_EPHEMERIS_ENGINE=legacy → eski sınırlar + sonuçta 'yedek motor' uyarısı", async () => {
    await withEngine("legacy", async () => {
      assert.equal(localLimits("1800-2100"), LOCAL_LIMITS["1800-2100"]);
      const info = positionEngineInfo();
      assert.equal(info.fallback, true);
      const q = parseEphemerisRequest({ view: "day", date: "2026-11-03", bodies: ["pluto"] });
      assert.ok(q.ok);
      const r = await buildEphemeris(q.value);
      assert.ok(r.ok);
      assert.equal(r.result.meta.engineVersion, "pro-ephemeris-1");
      assert.equal(r.result.meta.positionEngine.fallback, true);
    });
  });

  await t("DE440 dosyası yoksa AÇIK HATA (ENGINE_UNAVAILABLE) — eski motora sessiz düşüş YOK", async () => {
    const prev = process.env.ATLAS_DE440_PATH;
    process.env.ATLAS_DE440_PATH = join(process.cwd(), "data", "ephemeris", "YOK-de440.bsp");
    try {
      assert.equal(ensurePositionEngine().ok, false);
      const q = parseEphemerisRequest({ view: "day", date: "2026-11-03", bodies: ["pluto"] });
      assert.ok(q.ok);
      const r = await buildEphemeris(q.value);
      assert.ok(!r.ok && r.error.code === "ENGINE_UNAVAILABLE");
      const d = parseDegreeRequest({ body: "pluto", degrees: [346.99], start: "2055-01-01", end: "2055-12-31" });
      assert.ok(d.ok);
      const x = buildDegreeCrossings(d.value);
      assert.ok(!x.ok && x.error.code === "ENGINE_UNAVAILABLE");
    } finally {
      if (prev === undefined) delete process.env.ATLAS_DE440_PATH;
      else process.env.ATLAS_DE440_PATH = prev;
    }
    assert.equal(ensurePositionEngine().ok, true);
  });

  // ─── 8. Performans (bilgi) ──────────────────────────────────────────────────────────────────────────
  await t("performans: 1 yıllık Ay+10 gezegen tablosu ve 8 yıllık Plüton derece taraması süresi", async () => {
    const t0 = performance.now();
    const q = parseEphemerisRequest({ view: "month", year: 2026, month: 11 });
    assert.ok(q.ok);
    const r = await buildEphemeris(q.value);
    assert.ok(r.ok);
    const t1 = performance.now();
    const d = parseDegreeRequest({ body: "pluto", degrees: [346.99], start: "2052-03-17", end: "2060-03-14" });
    assert.ok(d.ok);
    buildDegreeCrossings(d.value);
    const t2 = performance.now();
    olcu(`aylık tablo (11 cisim + olaylar) ${(t1 - t0).toFixed(0)} ms · Plüton 8 yıl derece ${(t2 - t1).toFixed(0)} ms · RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  });

  console.log(`\nDE440 harness: ${pass} PASS, ${fail} FAIL`);
  if (fail) process.exit(1);
}

void main();
