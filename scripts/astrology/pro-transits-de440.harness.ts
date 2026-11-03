/**
 * GÖKYÜZÜ ATLASI — GELİŞMİŞ TRANSİT TARAMASI × NASA/JPL DE440 (03.11.2026 AŞAMA 2): BAĞIMSIZ doğrulama (ücretli çağrı YOK; ağ YOK).
 *
 * Referans K-SE: Swiss Ephemeris 2.10.03 SWIEPH (DE431 tabanlı dosyalar, Astrodienst indirgeme kodu; motordan BAĞIMSIZ), TT ekseninde
 * kök bulma — fikstür scripts/astrology/fixtures/pro-transits-de440/ref-se-transit.json (üretici build_cases.py + ref_se.py; motor kodu
 * kullanılmaz). 66 vaka: harness S1–S10, 03.11 canlı QA ana (1.609 pencere / 1.559 kesinleşme) + ek set, istasyon sınırı (SE istasyon
 * boylamı ±1/3/5/10/30″) ve yavaş gezegen çoklu geçiş vakaları.
 * Kural (tolerans GENİŞLETİLMEDİ): pencere kümesi, sınıf, geçiş sayısı, döngü ailesi k/n, istasyon ve burç girişi kümesi BİREBİR;
 * her olay anında |Δt| ≤ motorun BEYAN ettiği belirsizlik.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-transits-de440.harness.ts
 * Önkoşul: data/ephemeris/de440.bsp (npm run ephemeris:fetch). Dosya yoksa testler DÜŞER (atlanmaz).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanTransits } from "@/lib/astrology/transits/scan";
import { ACCEL_BOUND, ACCEL_BOUND_DE440, ACCEL_LIMB_EXTRA, DISK_ZONE_DEG, lonAt, NEAR_SUN_DEG, speedAt, TRANSIT_BODIES, type ScanRequest, type ScanResult } from "@/lib/astrology/transits/model";
import { findIngresses, findPerfections, findStations } from "@/lib/astrology/horary/western/timeline";
import { SIGNS } from "@/lib/astrology/horary/western/tables";
import { isTimeScalesError, scalesFromUtc } from "@/lib/astrology/time";
import { de440Status } from "@/lib/astrology/positions/de440/source";
import { legacyMethodNotes } from "@/lib/astrology/legacyMethod";
import { transitScanEngineOf, transitScanSourceText } from "@/lib/astrology/model/westernTransitScan";
import { transitScanReport } from "@/lib/astrology/report/transitScanReport";
import { resolveSelectionContexts, type EngineCtx } from "@/lib/astrology/engine/service";
import type { RevisionRow } from "@/lib/astrology/persistence/repo";

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
const D = 86_400_000;
const U = Date.UTC;
const w180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
function withEngine<T>(eng: "de440" | "legacy", fn: () => T): T {
  const prev = process.env.ATLAS_TRANSIT_ENGINE;
  process.env.ATLAS_TRANSIT_ENGINE = eng;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ATLAS_TRANSIT_ENGINE;
    else process.env.ATLAS_TRANSIT_ENGINE = prev;
  }
}
const ttSec = (ms: number) => {
  const s = scalesFromUtc(ms, { pre1961: "civil_as_ut" });
  if (isTimeScalesError(s)) throw new Error(s.error);
  return s.ttMs / 1000;
};
const scan = (req: ScanRequest) => {
  const r = scanTransits(req);
  if ("error" in r) throw new Error(r.error.code);
  return r;
};

type RefW = [string, number | null, number | null, [number, number, number, number, number, number][], number, [number, number][], [number, number] | null];
type RefCase = { id: string; group: string; tt0: number; tt1: number; W: RefW[]; ST: [string, number, string, number][]; IN: [string, number, number, number][]; M: Record<string, unknown[]>; req: ScanRequest };
const REF = JSON.parse(readFileSync(join(process.cwd(), "scripts/astrology/fixtures/pro-transits-de440/ref-se-transit.json"), "utf8")) as { cases: RefCase[]; counts: Record<string, unknown> };
const CLS: Record<number, string> = { 1: "single", 2: "multiple", 3: "tangential", 0: "none_in_range" };

async function main() {
  await t("önkoşul: DE440 dosyası mevcut ve doğrulanabilir; varsayılan transit motoru DE440", () => {
    const st = de440Status();
    assert.ok(st.ok, `DE440 yok — önce: npm run ephemeris:fetch (${"reason" in st ? st.reason : ""})`);
    const r = scan({ startUtcMs: U(2026, 0, 1), endUtcMs: U(2026, 1, 1), bodies: ["mars"], natalPoints: [{ id: "x", lon: 100 }], aspects: ["conjunction"], defaultOrb: 1, include: { natal: true, mundane: false, stations: true, ingresses: true } });
    assert.equal(r.source.ephemeris, "jpl-de440");
    assert.equal(r.source.engineVersion, "transit-scan-2-de440");
    assert.equal(r.source.positionErrorArcsec.mars, 0.1);
    assert.equal(r.source.providerCalls, 0);
  });

  // ─── 1. Bağımsız Swiss Ephemeris (SWIEPH) karşılaştırması — 66 vaka ────────────────────────────────────
  await t("K-SE 66 vaka: pencere/sınıf/geçiş/aile k/n + istasyon + burç girişi BİREBİR; her olay |Δt| ≤ beyan edilen belirsizlik", () => {
    const viol: string[] = [];
    const agg: Record<string, { n: number; worstRatio: number; worstDt: number }> = {};
    const bump = (k: string, dt: number, u: number) => {
      const a = (agg[k] ??= { n: 0, worstRatio: 0, worstDt: 0 });
      a.n++;
      a.worstRatio = Math.max(a.worstRatio, Math.abs(dt) / u);
      a.worstDt = Math.max(a.worstDt, Math.abs(dt));
    };
    let windows = 0;
    let exacts = 0;
    let stations = 0;
    let ingresses = 0;
    const t0w = performance.now();
    for (const c of REF.cases) {
      const r = scan(c.req);
      const tag = (k: string) => `${c.id} ${k}`;
      // pencereler: anahtar + aralık örtüşmesi
      const se = new Map<string, RefW[]>();
      for (const w of c.W) se.set(w[0], [...(se.get(w[0]) ?? []), w]);
      const en = new Map<string, ScanResult["windows"]>();
      for (const w of r.windows) {
        const k = `${w.a}${w.kind === "transit_natal" ? ">" : "~"}${w.b}|${w.aspect}|${w.target}`;
        en.set(k, [...(en.get(k) ?? []), w]);
      }
      for (const k of new Set([...se.keys(), ...en.keys()])) {
        const S = [...(se.get(k) ?? [])];
        const E = en.get(k) ?? [];
        for (const w of E) {
          const a0 = w.enterMs === null ? c.tt0 : ttSec(w.enterMs);
          const a1 = w.exitMs === null ? c.tt1 : ttSec(w.exitMs);
          let bi = -1;
          let bo = -1;
          S.forEach((s, i) => {
            const ov = Math.min(a1, s[2] ?? c.tt1) - Math.max(a0, s[1] ?? c.tt0);
            if (ov >= 0 && ov > bo) {
              bo = ov;
              bi = i;
            }
          });
          if (bi < 0) {
            viol.push(`FAZLA pencere ${tag(k)}`);
            continue;
          }
          const s = S.splice(bi, 1)[0];
          windows++;
          if (w.classification !== CLS[s[4]] || w.passes.length !== s[3].length) viol.push(`sınıf/geçiş ${tag(k)}: ${w.classification} ${w.passes.length} ≠ SE ${CLS[s[4]]} ${s[3].length}`);
          for (const [typ, ms, u, sv] of [["orb_enter", w.enterMs, w.enterUncertaintySec, s[1]], ["orb_exit", w.exitMs, w.exitUncertaintySec, s[2]]] as const) {
            if ((ms === null) !== (sv === null)) viol.push(`${typ} aralık ucu ${tag(k)}`);
            else if (ms !== null && sv !== null) {
              const dt = ttSec(ms) - sv;
              bump(`${c.group} ${typ}`, dt, u!);
              if (Math.abs(dt) > u!) viol.push(`${typ} ${tag(k)} Δt ${dt.toFixed(1)} s > ${u} s`);
            }
          }
          if (w.passes.length === s[3].length) {
            w.passes.forEach((p, i) => {
              const sp = s[3][i];
              exacts++;
              const dt = ttSec(p.ms) - sp[0];
              bump(`${c.group} exact`, dt, p.uncertaintySec);
              if (Math.abs(dt) > p.uncertaintySec) viol.push(`exact ${tag(k)} Δt ${dt.toFixed(1)} s > ${p.uncertaintySec} s`);
              if (p.cyclePass !== sp[3] || p.cycleOf !== sp[4]) viol.push(`aile k/n ${tag(k)}: ${p.cyclePass}/${p.cycleOf} ≠ SE ${sp[3]}/${sp[4]}`);
              if ((p.cycleClippedByRange ? 1 : 0) !== sp[5]) viol.push(`aralık kesimi ${tag(k)}`);
            });
          }
        }
        for (const s of S) viol.push(`EKSİK pencere ${tag(k)} (SE ${CLS[s[4]]})`);
      }
      // istasyon + burç girişi
      const pool = <X extends [string, number, ...unknown[]]>(rows: X[], key: (x: X) => string) => {
        const m = new Map<string, X[]>();
        for (const x of rows) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
        return m;
      };
      const stS = pool(c.ST, (x) => `${x[0]}|${x[2]}`);
      for (const e of r.events.filter((x) => x.type === "station")) {
        const k = `${e.body}|${(e as { station: string }).station}`;
        const cand = stS.get(k) ?? [];
        const i = cand.reduce((bi, x, j) => (bi < 0 || Math.abs(x[1] - ttSec(e.ms)) < Math.abs(cand[bi][1] - ttSec(e.ms)) ? j : bi), -1);
        if (i < 0 || Math.abs(cand[i][1] - ttSec(e.ms)) > 20 * 86400) {
          viol.push(`FAZLA istasyon ${tag(k)} ${e.atUtc}`);
          continue;
        }
        const dt = ttSec(e.ms) - cand.splice(i, 1)[0][1];
        stations++;
        bump(`${c.group} station`, dt, e.uncertaintySec);
        if (Math.abs(dt) > e.uncertaintySec) viol.push(`istasyon ${tag(k)} Δt ${dt.toFixed(0)} s > ${e.uncertaintySec} s`);
      }
      for (const [k, v] of stS) for (const x of v) viol.push(`EKSİK istasyon ${tag(k)} ${x[1]}`);
      const inS = pool(c.IN, (x) => `${x[0]}|${x[2]}|${x[3]}`);
      for (const e of r.events.filter((x) => x.type === "ingress")) {
        const ev = e as { body: string; retrograde: boolean; fromSign: string; toSign: string; ms: number; uncertaintySec: number; atUtc: string };
        const k = `${ev.body}|${SIGNS.indexOf((ev.retrograde ? ev.fromSign : ev.toSign) as never) * 30}|${ev.retrograde ? -1 : 1}`;
        const cand = inS.get(k) ?? [];
        const i = cand.reduce((bi, x, j) => (bi < 0 || Math.abs(x[1] - ttSec(ev.ms)) < Math.abs(cand[bi][1] - ttSec(ev.ms)) ? j : bi), -1);
        if (i < 0 || Math.abs(cand[i][1] - ttSec(ev.ms)) > 20 * 86400) {
          viol.push(`FAZLA burç girişi ${tag(k)} ${ev.atUtc}`);
          continue;
        }
        const dt = ttSec(ev.ms) - cand.splice(i, 1)[0][1];
        ingresses++;
        bump(`${c.group} ingress`, dt, ev.uncertaintySec);
        if (Math.abs(dt) > ev.uncertaintySec) viol.push(`burç girişi ${tag(k)} Δt ${dt.toFixed(1)} s > ${ev.uncertaintySec} s`);
      }
      for (const [k, v] of inS) for (const x of v) viol.push(`EKSİK burç girişi ${tag(k)} ${x[1]}`);
    }
    for (const [k, a] of Object.entries(agg).sort()) olcu(`${k}: n=${a.n} en büyük |Δt| ${a.worstDt.toFixed(1)} s, |Δt|/beyan ≤ ${a.worstRatio.toFixed(3)}`);
    olcu(`toplam: ${windows} pencere, ${exacts} kesinleşme, ${stations} istasyon, ${ingresses} burç girişi eşleşti (${REF.cases.length} vaka, ${(performance.now() - t0w).toFixed(0)} ms)`);
    assert.deepEqual(viol.slice(0, 30), []);
    assert.equal(windows, 4740);
    assert.equal(exacts, 4571);
    assert.equal(stations, 532);
    assert.equal(ingresses, 977);
  });

  await t("ÖNCE/SONRA: aynı 66 vakada eski motor ↔ SE uyuşmazlık sayısı (bilgi; eski motor sınır vakalarını belirsiz işaretler)", () => {
    let diff = 0;
    let flagged = 0;
    withEngine("legacy", () => {
      for (const c of REF.cases.filter((x) => x.group.startsWith("sinir"))) {
        const r = scan(c.req);
        const se = new Map<string, number>();
        for (const w of c.W) se.set(w[0], (se.get(w[0]) ?? 0) + w[3].length);
        const en = new Map<string, { n: number; f: boolean }>();
        for (const w of r.windows) {
          const k = `${w.a}${w.kind === "transit_natal" ? ">" : "~"}${w.b}|${w.aspect}|${w.target}`;
          const cur = en.get(k) ?? { n: 0, f: false };
          en.set(k, { n: cur.n + w.passes.length, f: cur.f || w.flags.passCountUncertain || w.flags.windowUncertain });
        }
        for (const k of new Set([...se.keys(), ...en.keys()])) {
          if ((se.get(k) ?? 0) !== (en.get(k)?.n ?? 0)) {
            diff++;
            if (en.get(k)?.f || r.nearMisses.some((m) => k.startsWith(m.pair))) flagged++;
          }
        }
      }
    });
    olcu(`sınır vakalarında eski motor ↔ SE kesinleşme sayısı farklı anahtar: ${diff} (belirsiz bayraklı: ${flagged}) → DE440: 0`);
  });

  // ─── 2. DE440 ivme sınırı (budama garantisi) ─────────────────────────────────────────────────────────
  await t("T01D DE440 ivme katmanları: Güneş'ten ≥ 3° → ACCEL_BOUND; 0,6–3° → + limb payı; < 0,6° → ACCEL_BOUND_DE440 (kavuşum çevresi 0,01 gün adım)", () => {
    let worst = "";
    let worstR = 0;
    for (const b of TRANSIT_BODIES) {
      for (const y of [1901, 1950, 1999, 2024, 2060, 2095]) {
        const t0 = U(y, 0, 1);
        const step = b === "moon" ? D / 8 : D / 2;
        const n = b === "moon" ? 600 : 1460;
        let v0 = speedAt(b, t0, "de440");
        for (let i = 1; i < n; i++) {
          const ms = t0 + i * step;
          const v1 = speedAt(b, ms, "de440");
          const a = Math.abs(v1 - v0) / (step / D);
          v0 = v1;
          const el = b === "sun" || b === "moon" ? 180 : Math.abs(w180(lonAt(b, ms, "de440") - lonAt("sun", ms, "de440")));
          const bound = el >= NEAR_SUN_DEG ? ACCEL_BOUND[b] : el >= DISK_ZONE_DEG ? ACCEL_BOUND[b] + ACCEL_LIMB_EXTRA : ACCEL_BOUND_DE440[b];
          if (a / bound > worstR) {
            worstR = a / bound;
            worst = `${b} ${new Date(ms).toISOString().slice(0, 10)} a=${a.toFixed(5)} uzama ${el.toFixed(2)}°`;
          }
          if (el < 2) {
            let p2 = speedAt(b, ms - D, "de440");
            for (let u = ms - D + D / 100; u < ms + D; u += D / 100) {
              const s2 = speedAt(b, u, "de440");
              const a2 = Math.abs(s2 - p2) * 100;
              p2 = s2;
              const e2 = Math.abs(w180(lonAt(b, u, "de440") - lonAt("sun", u, "de440")));
              const bd = e2 >= DISK_ZONE_DEG ? ACCEL_BOUND[b] + ACCEL_LIMB_EXTRA : ACCEL_BOUND_DE440[b];
              if (a2 / bd > worstR) {
                worstR = a2 / bd;
                worst = `${b} kavuşum ${new Date(u).toISOString().slice(0, 10)} a=${a2.toFixed(5)} uzama ${e2.toFixed(3)}°`;
              }
            }
          }
        }
      }
    }
    olcu(`DE440 en yüksek ivme/sınır oranı ${worstR.toFixed(3)} (${worst})`);
    assert.ok(worstR < 1, `oran ${worstR}`);
  });

  // ─── 3. Sınır vakaları DE440 istasyon boylamından (0,1″ hata payı) ────────────────────────────────────
  await t("T08D/T09D istasyon sınırı (DE440): +0,07″ → passCountUncertain; −0,72″ → iki geçiş, belirsiz değil; +0,72″ → teğet; orb sınırı +0,07″ → nearMisses", () => {
    const base = { startUtcMs: U(2024, 9, 1), endUtcMs: U(2025, 3, 1), bodies: ["mars" as const], aspects: ["conjunction" as const], defaultOrb: 1, include: { natal: true, mundane: false, stations: true, ingresses: false } };
    const st = scan({ ...base, natalPoints: [] }).events.find((e) => e.type === "station" && (e as { station: string }).station === "retrograde") as { ms: number; lon: number };
    const L = st.lon;
    const as = (x: number) => x / 3600;
    const r = scan({ ...base, natalPoints: [
      { id: "hata", lon: L + as(0.07) }, { id: "ici", lon: L - as(0.72) }, { id: "disi", lon: L + as(0.72) }, { id: "orb_hata", lon: L + 1 + as(0.07) }, { id: "orb_ici", lon: L + 0.9 },
    ] });
    const around = (id: string) => r.windows.filter((w) => w.b === id && (w.enterMs ?? 0) < st.ms && (w.exitMs ?? Infinity) > st.ms);
    olcu(`DE440 Mars geri istasyonu ${new Date(st.ms).toISOString()} boylam ${L.toFixed(8)}°`);
    assert.equal(around("hata").length, 1);
    assert.equal(around("hata")[0].flags.passCountUncertain, true);
    assert.equal(around("ici")[0].passes.length, 2);
    assert.equal(around("ici")[0].flags.passCountUncertain, false);
    assert.equal(around("disi")[0].classification, "tangential");
    assert.equal(around("disi")[0].flags.passCountUncertain, false);
    assert.equal(around("orb_hata").length, 0);
    assert.ok(r.nearMisses.some((m) => m.pair === "mars>orb_hata" && Math.abs(m.ms - st.ms) < 3_600_000));
    assert.equal(around("orb_ici")[0].classification, "tangential");
    assert.equal(around("orb_ici")[0].flags.windowUncertain, false);
  });

  // ─── 4. Plüton 2055 (AŞAMA 1 vakası transit motorunda) ─────────────────────────────────────────────────
  await t("Plüton natal 346,99° kavuşum (2052–2060): DE440 5 kesinleşme, tek aile 1/5..5/5; eski motor 3", () => {
    const req: ScanRequest = { startUtcMs: U(2052, 2, 17), endUtcMs: U(2060, 2, 15), bodies: ["pluto"], natalPoints: [{ id: "d", lon: 346.99 }], aspects: ["conjunction"], defaultOrb: 1, include: { natal: true, mundane: false, stations: false, ingresses: false } };
    const nw = scan(req).windows.flatMap((w) => w.passes);
    const old = withEngine("legacy", () => scan(req).windows.flatMap((w) => w.passes));
    olcu(`DE440: ${nw.map((p) => `${p.atUtc} ${p.cyclePass}/${p.cycleOf}`).join(" · ")} · eski motor ${old.length} geçiş`);
    assert.equal(nw.length, 5);
    assert.deepEqual(nw.map((p) => `${p.cyclePass}/${p.cycleOf}`), ["1/5", "2/5", "3/5", "4/5", "5/5"]);
    assert.equal(old.length, 3);
  });

  // ─── 5. Lilly olay çizelgesi (astronomy-engine'de kalır) ile geçişli tutarlılık ───────────────────────
  await t("T17D Lilly çizelgesi: DE440 olay sayısı eşit; her olay eski motor olayıyla |Δt| ≤ (eski + DE440 beyan belirsizliği)", () => {
    const t0 = U(2024, 0, 1);
    const t1 = U(2025, 11, 31);
    const req: ScanRequest = { startUtcMs: t0, endUtcMs: t1, bodies: ["sun", "mercury", "venus", "mars"], aspects: ["conjunction", "sextile", "square", "trine", "opposition"], defaultOrb: 1, include: { natal: false, mundane: true, stations: true, ingresses: true } };
    const nw = scan(req);
    const old = withEngine("legacy", () => scan(req));
    let n = 0;
    let worst = 0;
    const key = (e: ScanResult["events"][number]) => `${e.type}|${e.body}|${e.other}|${(e as { aspect?: string }).aspect ?? ""}`;
    const pool = new Map<string, ScanResult["events"]>();
    for (const e of old.events.filter((x) => x.type !== "closest_approach")) pool.set(key(e), [...(pool.get(key(e)) ?? []), e]);
    for (const e of nw.events.filter((x) => x.type !== "closest_approach")) {
      const c = pool.get(key(e)) ?? [];
      const i = c.reduce((bi, x, j) => (bi < 0 || Math.abs(x.ms - e.ms) < Math.abs(c[bi].ms - e.ms) ? j : bi), -1);
      assert.ok(i >= 0, `eşi yok: ${key(e)} ${e.atUtc}`);
      const o = c.splice(i, 1)[0];
      const allow = o.uncertaintySec + e.uncertaintySec;
      worst = Math.max(worst, Math.abs(o.ms - e.ms) / 1000 / allow);
      assert.ok(Math.abs(o.ms - e.ms) / 1000 <= allow, `${key(e)} ${e.atUtc}`);
      n++;
    }
    for (const [k, v] of pool) assert.equal(v.length, 0, `eksik ${k}`);
    // Lilly sayıları eski motorla zaten birebir (pro-transits T17, legacy) → DE440 sayısı da Lilly ile eşit.
    const lil = (["mercury", "venus", "mars"] as const).reduce((s, b) => s + findStations(b, t0, t1).length + findIngresses(b, t0, t1).length, 0) + findPerfections("sun" as never, "mercury" as never, t0, t1).length;
    olcu(`DE440 ↔ eski motor ${n} olay; |Δt|/(iki beyan toplamı) en çok ${worst.toFixed(3)}; Lilly örnek sayısı ${lil}`);
  });

  // ─── 6. Geri dönüş, sürüm, önbellek ayrımı, açık hata ───────────────────────────────────────────────
  await t("geri dönüş: ATLAS_TRANSIT_ENGINE=legacy → kaynak astronomy-engine@2.1.19, eski hata payları; önbellek motorlar arası karışmaz", () => {
    const req: ScanRequest = { startUtcMs: U(2026, 0, 1), endUtcMs: U(2026, 3, 1), bodies: ["mars", "saturn"], natalPoints: [{ id: "x", lon: 10 }], aspects: ["conjunction", "square"], defaultOrb: 1, include: { natal: true, mundane: false, stations: true, ingresses: true } };
    const a = scan(req);
    const b = withEngine("legacy", () => scan(req));
    const c = scan(req);
    assert.equal(b.source.ephemeris, "astronomy-engine@2.1.19");
    assert.equal(b.source.engineVersion, undefined);
    assert.equal(b.source.positionErrorArcsec.mars, 20);
    assert.equal(a.source.ephemeris, "jpl-de440");
    assert.deepEqual(JSON.stringify(c.windows), JSON.stringify(a.windows), "DE440 sonucu eski motor çağrısından sonra aynı (önbellek anahtarı motoru içerir)");
    assert.notEqual(lonAt("saturn", U(2026, 1, 1), "de440"), lonAt("saturn", U(2026, 1, 1), "legacy"));
  });

  await t("DE440 dosyası yoksa tarama AÇIK HATA verir (eski motora sessiz düşüş YOK)", () => {
    const prev = process.env.ATLAS_DE440_PATH;
    process.env.ATLAS_DE440_PATH = join(process.cwd(), "data", "ephemeris", "YOK-de440.bsp");
    try {
      assert.throws(
        () => scan({ startUtcMs: U(2031, 0, 1), endUtcMs: U(2031, 1, 1), bodies: ["jupiter"], natalPoints: [{ id: "x", lon: 3 }], aspects: ["conjunction"], defaultOrb: 1, include: { natal: true, mundane: false, stations: false, ingresses: false } }),
        (e: Error) => e.name === "Error" && /DE440/.test(e.message),
      );
    } finally {
      if (prev === undefined) delete process.env.ATLAS_DE440_PATH;
      else process.env.ATLAS_DE440_PATH = prev;
    }
  });

  await t("ΔT belirsizliği AYRI terim: 2026 olayında yok, 2090 olayında var; çözünürlük 1 s eklenir", () => {
    const mk = (y: number) => scan({ startUtcMs: U(y, 0, 1), endUtcMs: U(y, 2, 1), bodies: ["sun"], natalPoints: [{ id: "x", lon: 300 }], aspects: ["conjunction"], defaultOrb: 1, include: { natal: true, mundane: false, stations: false, ingresses: false } });
    const e26 = mk(2026).windows[0].passes[0].uncertaintySec;
    const e90 = mk(2090).windows[0].passes[0].uncertaintySec;
    olcu(`Güneş kavuşumu belirsizliği 2026: ±${e26} s · 2090: ±${e90} s; 2090 tarama ΔT üst sınırı ${mk(2090).source.deltaTUncertaintySecMax?.toFixed(1)} s`);
    assert.ok(e26 < 20 && e90 > 60);
  });

  // ─── 7. Kayıt / arşiv / rapor: eski (v1, astronomy-engine) kayıt aynen açılır + etiket; yeni kayıt DE440 etiketi ─────────────────
  const technicalOf = (r: ScanResult) => ({ schema: "astro.western.transit_scan.v1", zodiac: "tropical", nodeType: "true", range: { start: "2026-01-01", end: "2026-03-31" }, orb: 1, bodies: ["mars"], points: ["sun"], aspects: ["conjunction"], include: { stations: true, ingresses: true }, displayTz: "Europe/Istanbul", natal: [{ id: "sun", lon: 10 }], scan: r });
  const reportKv = (tech: Record<string, unknown>) => {
    const kv: [string, string][] = [];
    transitScanReport({ h: () => {}, p: () => {}, kv: (rows) => kv.push(...rows), table: () => {}, bullets: () => {} }, tech);
    return Object.fromEntries(kv);
  };
  await t("kayıt/rapor: eski v1 snapshot → 'önceki yerel konum motoru' + transit_scan_legacy_engine notu; DE440 kaydı → DE440 etiketi, not yok", () => {
    const req: ScanRequest = { startUtcMs: U(2026, 0, 1), endUtcMs: U(2026, 2, 31), bodies: ["mars"], natalPoints: [{ id: "sun", lon: 10 }], aspects: ["conjunction"], defaultOrb: 1, include: { natal: true, mundane: false, stations: true, ingresses: true } };
    const oldTech = technicalOf(withEngine("legacy", () => scan(req)));
    const newTech = technicalOf(scan(req));
    assert.equal(oldTech.scan.source.ephemeris, "astronomy-engine@2.1.19");
    assert.equal(transitScanEngineOf(oldTech), "legacy");
    assert.equal(transitScanEngineOf(newTech), "de440");
    assert.equal(transitScanEngineOf({}), "legacy", "alan yoksa eski kabul");
    assert.match(reportKv(oldTech).Kaynak, /önceki yerel konum motoru/);
    assert.match(reportKv(newTech).Kaynak, /NASA\/JPL DE440/);
    assert.ok(!/Roxy/i.test(transitScanSourceText(oldTech) + transitScanSourceText(newTech)), "kullanıcı metninde sağlayıcı markası yok");
    const notes = (tech: unknown) => legacyMethodNotes({ technique: "western.transit_scan", adapterVersion: "x", houseSystem: "placidus", revisions: [], technical: tech }).map((n) => n.code);
    assert.deepEqual(notes(oldTech), ["transit_scan_legacy_engine"]);
    assert.deepEqual(notes(newTech), []);
    assert.deepEqual(legacyMethodNotes({ technique: "western.natal", adapterVersion: "x", houseSystem: "placidus", revisions: [], technical: oldTech }), [], "başka teknik etkilenmez");
    // Eski kaydın snapshot'ı DEĞİŞMEDEN rapora girer (yeniden hesap yok): eski motorla yeniden üretilen pencereler birebir.
    assert.equal(JSON.stringify(oldTech.scan.windows), JSON.stringify(technicalOf(withEngine("legacy", () => scan(req))).scan.windows));
    // Demo fikstürü (gerçek kayıt biçimi) DE440 ile yeniden üretildi: kayıtlı transit analizi DE440 kaynağını taşır.
    const demo = readFileSync(join(process.cwd(), "lib/astrology/demo/fixture.generated.ts"), "utf8");
    assert.ok(demo.includes('\\"ephemeris\\":\\"jpl-de440\\"') && !demo.includes('\\"ephemeris\\":\\"astronomy-engine@2.1.19\\"'), "demo fikstürü DE440 kaynağıyla");
  });

  await t("ön kontrol: DE440 yoksa transit seçimi ENGINE_UNAVAILABLE ile PLANLANMAZ (ücretli Natal çağrısı yok); natal seçimi etkilenmez", async () => {
    const rev: RevisionRow = { id: "r", profile_id: "p", revision: 1, birth_date: "1990-05-05", birth_time: "12:00:00", time_known: true, time_accuracy: "exact", location_id: null, location_label: "x", latitude: 41, longitude: 29, timezone: "UTC", dst_choice: "auto", utc_offset_seconds: 0, birth_utc: "1990-05-05T12:00:00Z", change_note: null, created_at: "2026-01-01T00:00:00Z" };
    const ctx = { db: {} as never, tenantId: "t", userId: "u", entitlements: {} as never } as EngineCtx;
    const sel = [{ technique: "western.transit_scan", options: { start: "2026-01-01", end: "2026-03-31" } }, { technique: "western.natal", options: {} }];
    type V = { ok: true; v: { blocked: { code: string } | null }[] };
    const prev = process.env.ATLAS_DE440_PATH;
    process.env.ATLAS_DE440_PATH = join(process.cwd(), "data", "ephemeris", "YOK2-de440.bsp");
    try {
      const r = (await resolveSelectionContexts(ctx, rev, sel as never)) as V;
      assert.ok(r.ok);
      assert.equal(r.v[0].blocked?.code, "ENGINE_UNAVAILABLE");
      assert.equal(r.v[1].blocked, null);
      const leg = (await withEngine("legacy", () => resolveSelectionContexts(ctx, rev, sel as never))) as V;
      assert.ok(leg.ok && leg.v[0].blocked === null, "legacy bayrağıyla engel yok (kontrollü geri dönüş)");
    } finally {
      if (prev === undefined) delete process.env.ATLAS_DE440_PATH;
      else process.env.ATLAS_DE440_PATH = prev;
    }
    const ok = (await resolveSelectionContexts(ctx, rev, sel as never)) as V;
    assert.ok(ok.ok && ok.v[0].blocked === null, "dosya varken engel yok");
  });

  console.log(`\nDE440 transit harness: ${pass} PASS, ${fail} FAIL`);
  if (fail) process.exit(1);
}

void main();
