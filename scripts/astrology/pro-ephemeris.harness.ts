/**
 * GÖKYÜZÜ ATLASI — WT-03 PROFESYONEL EFEMERİS motoru testleri (ücretli çağrı YOK; sağlayıcı yalnız sahte fetchDay ile).
 * Bağımsız referans: scripts/astrology/fixtures/pro-ephemeris/de440-ref.json (skyfield 1.55 + JPL DE440; düğüm DE440 oskülasyon;
 * Lahiri/ortalama düğüm pyswisseph — yalnız test referansı). Sağlayıcı küçük örneği: provider-sample.json.
 * Her ölçüm satırı "ÖLÇÜ" ile yazılır (rapor tablosu bu çıktıdan üretilir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-ephemeris.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eraOf, LOCAL_LIMITS, PROVIDER_LIMITS, AYANAMSA_LIMIT_ARCSEC, AYANAMSA_MEAN_LIMIT_ARCSEC, precisionFrom, precisionFor, type EraBand } from "@/lib/astrology/pro/ephemeris/accuracy";
import { DELTA_T_TABLE_LENGTH, deltaTSeconds, deltaTClass } from "@/lib/astrology/pro/ephemeris/deltaT";
import { findIngresses, findStations, findEvents } from "@/lib/astrology/pro/ephemeris/events";
import { eclipticToEquatorial, lahiriMeanAyanamsa, lahiriTrueAyanamsa, localEquatorialDirect, localPosition, meanNodeLon, trueNodeLon, wrap180, STATION_THRESHOLD_DEG_PER_DAY } from "@/lib/astrology/pro/ephemeris/local";
import { projectProviderPlanets, providerCallEstimate, providerDailyBody, Lru } from "@/lib/astrology/pro/ephemeris/provider";
import { buildEphemeris, parseEphemerisRequest, pageWindow, type EphemerisRequest } from "@/lib/astrology/pro/ephemeris/table";
import { formatLon, formatRa, formatSigned, formatUncertainty, toCsv } from "@/lib/astrology/pro/ephemeris/format";
import { findIngresses as lillyIngresses, findStations as lillyStations, type Body as LillyBody } from "@/lib/astrology/horary/western/timeline";
import { PLANET_BODIES, type EphemerisBody, type PlanetBody } from "@/lib/astrology/pro/ephemeris/types";

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
const FX = join(process.cwd(), "scripts/astrology/fixtures/pro-ephemeris");
type RefRow = { date: string; at: string; ut1_jd: number; b: Record<string, unknown> };
const REF = JSON.parse(readFileSync(join(FX, "de440-ref.json"), "utf8")) as { rows: RefRow[]; events: { body: string; kind: string; ut1_jd: number; toSign?: number }[] };
const SAMPLE = JSON.parse(readFileSync(join(FX, "provider-sample.json"), "utf8")) as { planets: { body: { date: string; nodeType: "true" }; planets: unknown[] }[]; monthly12utc: { date: string; positions: { planet: string; longitude: number }[] }[] };
const msOf = (jd: number) => (jd - 2440587.5) * 86_400_000;
const as = (deg: number) => Math.abs(deg) * 3600;
const PLANETS = PLANET_BODIES as readonly PlanetBody[];

async function main() {
  // ─── 1. Yerel konum doğruluğu (DE440) ───────────────────────────────────────────────────────────────
  await t("yerel boylam/enlem/RA/dek/hız — her cisim × dönem ölçülü sınır içinde (00:00 ve 12:00 satırları)", () => {
    const worst: Record<string, number[]> = {};
    const viol: string[] = [];
    for (const r of REF.rows) {
      const ms = msOf(r.ut1_jd);
      const era = eraOf(+r.date.slice(0, 4));
      for (const b of PLANETS) {
        const [lon, lat, ra, dec, sp] = r.b[b] as number[];
        const p = localPosition(b, ms);
        const d = [as(wrap180(p.lon - lon)), as(p.lat! - lat), as(wrap180(p.ra! - ra) * Math.cos((dec * Math.PI) / 180)), as(p.dec! - dec), as(p.speed - sp)];
        const lim = LOCAL_LIMITS[era][b]!;
        const k = `${era} ${b}`;
        worst[k] = (worst[k] ?? [0, 0, 0, 0, 0]).map((w, i) => Math.max(w, d[i]));
        if (d[0] > lim.lon || d[1] > lim.lat || d[2] > lim.radec || d[3] > lim.radec || d[4] > lim.speed) viol.push(`${r.date} ${r.at} ${b} ${d.map((x) => x.toFixed(2)).join("/")}`);
      }
    }
    for (const [k, w] of Object.entries(worst)) olcu(`yerel ${k} boylam ${w[0].toFixed(2)}″ enlem ${w[1].toFixed(2)}″ RA·cosδ ${w[2].toFixed(2)}″ dek ${w[3].toFixed(2)}″ hız ${w[4].toFixed(2)}″/gün`);
    assert.deepEqual(viol, []);
  });

  await t("yerel gerçek düğüm ↔ DE440 oskülasyon düğümü; ortalama düğüm ↔ SE ortalama düğüm", () => {
    const w: Record<EraBand, [number, number]> = { "1600-1799": [0, 0], "1800-2100": [0, 0], "2101-2600": [0, 0] };
    const ws: Record<EraBand, number> = { "1600-1799": 0, "1800-2100": 0, "2101-2600": 0 };
    const viol: string[] = [];
    for (const r of REF.rows.filter((x) => x.at === "00:00")) {
      const ms = msOf(r.ut1_jd);
      const era = eraOf(+r.date.slice(0, 4));
      const dt = as(wrap180(trueNodeLon(ms) - (r.b.true_node_de440 as number)));
      const dm = as(wrap180(meanNodeLon(ms) - (r.b.mean_node_se as number)));
      const ds = as(localPosition("true_node", ms).speed - (r.b.true_node_de440_speed as number));
      ws[era] = Math.max(ws[era], ds);
      if (ds > LOCAL_LIMITS[era].true_node!.speed) viol.push(`${r.date} gerçek düğüm hızı ${ds.toFixed(1)}″/gün`);
      w[era] = [Math.max(w[era][0], dt), Math.max(w[era][1], dm)];
      if (dt > LOCAL_LIMITS[era].true_node!.lon || dm > LOCAL_LIMITS[era].mean_node!.lon) viol.push(`${r.date} gerçek ${dt.toFixed(2)} ortalama ${dm.toFixed(2)}`);
    }
    for (const [e, [a, b]] of Object.entries(w)) olcu(`düğüm ${e}: gerçek ${a.toFixed(2)}″ (hız ${ws[e as EraBand].toFixed(1)}″/gün) ortalama ${b.toFixed(2)}″`);
    assert.deepEqual(viol, []);
  });

  await t("Lahiri ayanamsa ↔ SE Lahiri: ortalama ≤0,2″, gerçek ≤0,4″; yerel sidereal Güneş ↔ SE sidereal Güneş", () => {
    let wm = 0;
    let wt = 0;
    let ws = 0;
    for (const r of REF.rows) {
      const ms = msOf(r.ut1_jd);
      wm = Math.max(wm, as(lahiriMeanAyanamsa(ms) - (r.b.ayan_mean_se as number)));
      wt = Math.max(wt, as(lahiriTrueAyanamsa(ms) - (r.b.ayan_true_se as number)));
      const era = eraOf(+r.date.slice(0, 4));
      // SE Güneş kendi (Moshier) Güneş'idir → fark = ayanamsa farkı + iki motorun Güneş farkı; sınır = yerel Güneş sınırı + ayanamsa sınırı + SE–DE440 Güneş farkı.
      const seSunVsDe = as(wrap180((r.b.sun_sid_se as number) + (r.b.ayan_true_se as number) - (r.b.sun as number[])[0]));
      const d = as(wrap180(localPosition("sun", ms, "sidereal_lahiri").lon - (r.b.sun_sid_se as number)));
      ws = Math.max(ws, d);
      assert.ok(d <= LOCAL_LIMITS[era].sun!.lon + AYANAMSA_LIMIT_ARCSEC + seSunVsDe + 0.05, `${r.date} sidereal Güneş ${d.toFixed(2)}″`);
    }
    olcu(`Lahiri ortalama ${wm.toFixed(3)}″ gerçek ${wt.toFixed(3)}″ sidereal Güneş ${ws.toFixed(2)}″`);
    assert.ok(wm <= AYANAMSA_MEAN_LIMIT_ARCSEC && wt <= AYANAMSA_LIMIT_ARCSEC);
  });

  await t("RA/dek dönüşümü: ekliptik→ekvator formülü ↔ doğrudan ekvator vektörü ≤0,01″ (formül bağımsız sağlama)", () => {
    let w = 0;
    for (const r of REF.rows.filter((_, i) => i % 3 === 0)) {
      const ms = msOf(r.ut1_jd);
      for (const b of PLANETS) {
        const p = localPosition(b, ms);
        const d = localEquatorialDirect(b, ms);
        w = Math.max(w, as(wrap180(p.ra! - d.ra) * Math.cos((d.dec * Math.PI) / 180)), as(p.dec! - d.dec));
      }
    }
    olcu(`dönüşüm farkı ${w.toFixed(5)}″`);
    assert.ok(w <= 0.01);
  });

  await t("dönüşüm sınır durumları: λ=0/90/180/270, β=0 → α, δ beklenen; kutup yakını β=±89°", () => {
    const e = 23.44;
    const c = (lon: number, lat: number) => eclipticToEquatorial(lon, lat, e);
    assert.ok(Math.abs(c(0, 0).ra) < 1e-9 || Math.abs(c(0, 0).ra - 360) < 1e-9);
    assert.ok(Math.abs(c(0, 0).dec) < 1e-12);
    assert.ok(Math.abs(c(90, 0).ra - 90) < 1e-9 && Math.abs(c(90, 0).dec - e) < 1e-9);
    assert.ok(Math.abs(c(180, 0).ra - 180) < 1e-9);
    assert.ok(Math.abs(c(270, 0).ra - 270) < 1e-9 && Math.abs(c(270, 0).dec + e) < 1e-9);
    const n = c(123, 89);
    assert.ok(Number.isFinite(n.ra) && n.dec <= 90 && n.dec > 60);
  });

  // ─── 2. Olaylar ─────────────────────────────────────────────────────────────────────────────────────
  await t("burç girişleri + istasyonlar ↔ DE440 olayları: eksiksiz eşleşme, fark ≤ bildirilen belirsizlik", () => {
    const groups: [number, number, string[]][] = [
      [Date.UTC(2024, 0, 1), Date.UTC(2028, 0, 1), ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]],
      [Date.UTC(1900, 0, 1), Date.UTC(1901, 0, 1), ["mercury", "mars"]],
      [Date.UTC(2100, 0, 1), Date.UTC(2101, 0, 1), ["mercury", "venus"]],
    ];
    const stat: Record<string, { n: number; maxS: number; maxRatio: number }> = {};
    const viol: string[] = [];
    let total = 0;
    for (const [t0, t1, bodies] of groups) {
      for (const b of bodies) {
        const mine = [...findIngresses(b as EphemerisBody, t0, t1), ...findStations(b as EphemerisBody, t0, t1)];
        const refs = REF.events.filter((e) => e.body === b && msOf(e.ut1_jd) >= t0 && msOf(e.ut1_jd) < t1);
        // skyfield find_discrete aralık başındaki durumu olay saymaz; aynı tür sayısı eşit olmalı.
        const kinds = (k: string) => refs.filter((e) => e.kind === k).length;
        const mk = (k: string) => mine.filter((e) => (e.kind === "ingress" ? "ingress" : e.direction === "retrograde" ? "station_retrograde" : "station_direct") === k).length;
        for (const k of ["ingress", "station_retrograde", "station_direct"]) if (kinds(k) !== mk(k)) viol.push(`${b} ${k} sayı ${mk(k)} ≠ ${kinds(k)}`);
        for (const e of refs) {
          const rm = msOf(e.ut1_jd);
          const kind = e.kind;
          const m = mine.find((x) => (kind === "ingress" ? x.kind === "ingress" && x.toSign === e.toSign : x.kind === "station" && (kind === "station_retrograde") === (x.direction === "retrograde")) && Math.abs(x.ms - rm) < 5 * 86_400_000);
          total++;
          if (!m) {
            viol.push(`${b} ${kind} ${new Date(rm).toISOString()} eşleşmedi`);
            continue;
          }
          const ds = Math.abs(m.ms - rm) / 1000;
          const key = `${b} ${kind === "ingress" ? "giriş" : "istasyon"}`;
          const s = (stat[key] ??= { n: 0, maxS: 0, maxRatio: 0 });
          s.n++;
          s.maxS = Math.max(s.maxS, ds);
          s.maxRatio = Math.max(s.maxRatio, ds / Math.max(m.uncertaintySec, 1));
          if (ds > Math.max(m.uncertaintySec, 2)) viol.push(`${b} ${kind} ${m.ut} fark ${ds.toFixed(0)} sn > belirsizlik ${m.uncertaintySec.toFixed(0)} sn`);
        }
      }
    }
    for (const [k, s] of Object.entries(stat)) olcu(`olay ${k}: n=${s.n} en büyük fark ${s.maxS.toFixed(0)} sn (fark/belirsizlik ≤ ${s.maxRatio.toFixed(2)})`);
    olcu(`toplam referans olayı ${total}`);
    assert.deepEqual(viol, []);
  });

  await t("çapraz sağlama: Lilly olay bulucuları ile fark yalnız ΔT politikası kadar (2026)", () => {
    const t0 = Date.UTC(2026, 0, 1);
    const t1 = Date.UTC(2027, 0, 1);
    let w = 0;
    for (const b of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const) {
      const a = findIngresses(b, t0, t1);
      const l = lillyIngresses(b as LillyBody, t0, t1);
      assert.equal(a.length, l.length, `${b} giriş sayısı`);
      a.forEach((x, i) => (w = Math.max(w, Math.abs(x.ms - l[i].ms) / 1000)));
      if (b !== "sun" && b !== "moon") {
        const sa = findStations(b, t0, t1);
        const sl = lillyStations(b as LillyBody, t0, t1);
        assert.equal(sa.length, sl.length, `${b} istasyon sayısı`);
      }
    }
    const dtDiff = 75.1 - (deltaTSeconds(Date.UTC(2026, 6, 1)) ?? 0); // astronomy-engine Espenak–Meeus 2026 ≈ 75,1 s
    olcu(`giriş anı farkı en çok ${w.toFixed(1)} sn (ΔT politikası farkı ≈ ${dtDiff.toFixed(1)} sn)`);
    assert.ok(w <= Math.abs(dtDiff) + 3);
  });

  await t("sidereal burç girişi: Lahiri zodyağında Güneş girişi tropikalden ~ayanamsa/hız gün sonra", () => {
    const t0 = Date.UTC(2026, 0, 1);
    const t1 = Date.UTC(2026, 11, 31);
    const s = findIngresses("sun", t0, t1, "sidereal_lahiri");
    const tr = findIngresses("sun", t0, t1, "tropical");
    assert.equal(s.length, 12);
    assert.equal(tr.length, 12);
    const lagDays = (s.find((e) => e.kind === "ingress" && e.toSign === 0)!.ms - tr.find((e) => e.kind === "ingress" && e.toSign === 0)!.ms) / 86_400_000;
    olcu(`sidereal Koç girişi gecikmesi ${lagDays.toFixed(2)} gün (ayanamsa ${lahiriTrueAyanamsa(t0).toFixed(3)}°)`);
    assert.ok(lagDays > 23 && lagDays < 26);
  });

  await t("istasyon çevresi: istasyon anında |hız| < eşik → durağan; 10 gün önce/sonra değil", () => {
    const st = findStations("mercury", Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));
    assert.ok(st.length >= 6);
    for (const e of st) {
      assert.equal(localPosition("mercury", e.ms).stationary, true, e.ut);
      assert.equal(localPosition("mercury", e.ms + 10 * 86_400_000).stationary, false);
    }
    olcu(`2026 Merkür istasyonları ${st.length}; eşik ${(STATION_THRESHOLD_DEG_PER_DAY * 3600).toFixed(1)}″/gün`);
  });

  // ─── 3. İstek / sayfa / sınır ───────────────────────────────────────────────────────────────────────
  await t("istek doğrulama: geçersiz tarih/aralık/sayfa/kaynak reddedilir; artık gün kabul", () => {
    const P = parseEphemerisRequest;
    assert.equal(P({ view: "day", date: "2023-02-29" }).ok, false);
    assert.equal(P({ view: "day", date: "2024-02-29" }).ok, true);
    assert.equal(P({ view: "day", date: "1900-02-29" }).ok, false);
    assert.equal(P({ view: "day", date: "2000-02-29" }).ok, true);
    const o = P({ view: "day", date: "1599-12-31" });
    assert.ok(!o.ok && o.error.code === "OUT_OF_RANGE");
    assert.ok(!P({ view: "day", date: "2601-01-01" }).ok);
    const big = P({ view: "range", start: "2000-01-01", end: "2010-01-02" });
    assert.ok(!big.ok && big.error.code === "RANGE_TOO_LARGE");
    assert.equal(P({ view: "range", start: "2000-01-01", end: "2009-12-31" }).ok, true);
    assert.equal(P({ view: "range", start: "2000-01-02", end: "2000-01-01" }).ok, false);
    assert.equal(P({ view: "year", year: 2026, page: 12 }).ok, false);
    assert.equal(P({ view: "month", year: 2026, month: 13 }).ok, false);
    assert.equal(P({ view: "day", date: "2026-10-31", source: "x" }).ok, false);
    assert.equal(P({ view: "day", date: "2026-10-31", bodies: ["chiron"] }).ok, false);
    assert.equal(P({ view: "day", date: "2026-10-31", source: "provider", nodeType: "true", bodies: ["sun", "mean_node"] }).ok, false);
    const def = P({ view: "day", date: "2026-10-31" });
    assert.ok(def.ok && def.value.bodies.length === 11 && !def.value.bodies.includes("mean_node"));
  });

  await t("sayfa pencereleri: yıl→ay (Şubat 2024 = 29 gün), aralık 31 günlük dilim, yıl geçişi kesintisiz", async () => {
    const y = parseEphemerisRequest({ view: "year", year: 2024, page: 1 });
    assert.ok(y.ok);
    assert.equal(pageWindow(y.value)!.days.length, 29);
    const y2 = parseEphemerisRequest({ view: "year", year: 2100, page: 1 });
    assert.ok(y2.ok);
    assert.equal(pageWindow(y2.value)!.days.length, 28);
    const r = parseEphemerisRequest({ view: "range", start: "2025-12-20", end: "2026-02-28", page: 0 });
    assert.ok(r.ok);
    const w0 = pageWindow(r.value)!;
    const w2 = pageWindow({ ...r.value, page: 2 })!;
    assert.equal(w0.total, 3);
    assert.equal(w0.days.length, 31);
    assert.equal(new Date(w0.days[12]).toISOString().slice(0, 10), "2026-01-01");
    assert.equal(new Date(w2.days[w2.days.length - 1]).toISOString().slice(0, 10), "2026-02-28");
    assert.equal(pageWindow({ ...r.value, page: 3 }), null);
    const res = await buildEphemeris(r.value);
    assert.ok(res.ok);
    const d = res.result.rows.map((x) => x.date);
    assert.equal(d[11], "2025-12-31");
    assert.equal(d[12], "2026-01-01");
  });

  await t("gün/ay görünümü: satır 00:00 UT, tarih sırası, olaylar sayfa penceresinde; 12 Ay girişi/ay ±1", async () => {
    const m = parseEphemerisRequest({ view: "month", year: 2026, month: 10 });
    assert.ok(m.ok);
    const r = await buildEphemeris(m.value);
    assert.ok(r.ok);
    assert.equal(r.result.rows.length, 31);
    assert.ok(r.result.rows.every((x) => x.ut.endsWith("T00:00:00Z")));
    const a = Date.UTC(2026, 9, 1);
    const b = Date.UTC(2026, 10, 1);
    assert.ok(r.result.events.every((e) => e.ms >= a && e.ms < b));
    const moon = r.result.events.filter((e) => e.body === "moon").length;
    assert.ok(moon >= 12 && moon <= 15, `Ay girişi ${moon}`);
    assert.equal(r.result.meta.timeOfDay, "00:00");
    assert.equal(r.result.meta.providerCalls, 0);
    assert.equal(r.result.meta.bodyPrecision.sun!.speed, "arcsec");
    assert.equal(r.result.meta.bodyPrecision.mercury!.speed, "tenth_arcmin");
    assert.equal(r.result.meta.bodyPrecision.true_node!.speed, "arcmin");
    assert.equal(r.result.meta.precision.speed, "arcmin");
    const day = parseEphemerisRequest({ view: "day", date: "2026-10-31" });
    assert.ok(day.ok);
    const rd = await buildEphemeris(day.value);
    assert.ok(rd.ok && rd.result.rows.length === 1);
  });

  await t("gösterim hassasiyeti ölçülü sınırdan: yerel konum dakika, yerel hız 0,1′, sağlayıcı (1800–2100) gezegen boylamı saniye", () => {
    assert.equal(precisionFrom(0.9), "arcsec");
    assert.equal(precisionFrom(2.9), "tenth_arcmin");
    assert.equal(precisionFrom(3.1), "arcmin");
    const all = PLANETS as unknown as EphemerisBody[];
    assert.equal(precisionFor("lon", "local", "1800-2100", all, false), "arcmin");
    assert.equal(precisionFor("speed", "local", "1800-2100", all, false), "tenth_arcmin");
    assert.equal(precisionFor("lon", "provider", "1800-2100", all.filter((b) => b !== "moon"), false), "arcsec");
    assert.equal(precisionFor("lon", "provider", "1800-2100", all, false), "tenth_arcmin");
    assert.equal(precisionFor("lon", "provider", "2101-2600", all, false), "arcmin");
  });

  // ─── 4. Sağlayıcı katmanı ───────────────────────────────────────────────────────────────────────────
  await t("sağlayıcı izdüşümü: gerçek örnek kabul; eksik cisim / bozuk düğüm / geçersiz sayı reddedilir", () => {
    for (const s of SAMPLE.planets) assert.ok(projectProviderPlanets({ planets: s.planets }, "true").ok);
    const base = SAMPLE.planets[0].planets as Record<string, unknown>[];
    assert.equal(projectProviderPlanets({ planets: base.filter((p) => p.name !== "Moon") }, "true").ok, false);
    assert.equal(projectProviderPlanets({ planets: base.map((p) => (p.name === "South Node" ? { ...p, longitude: ((p.longitude as number) + 1) % 360 } : p)) }, "true").ok, false);
    assert.equal(projectProviderPlanets({ planets: base.map((p) => (p.name === "Sun" ? { ...p, longitude: 400 } : p)) }, "true").ok, false);
    assert.equal(projectProviderPlanets({ planets: base.map((p) => (p.name === "Mars" ? { ...p, latitude: Number.NaN } : p)) }, "true").ok, false);
    assert.equal(projectProviderPlanets(null, "true").ok, false);
    const mean = projectProviderPlanets({ planets: base }, "mean");
    assert.ok(mean.ok && mean.positions.mean_node && !mean.positions.true_node);
    assert.deepEqual(providerDailyBody("2026-10-31", "true"), { date: "2026-10-31", time: "00:00:00", timezone: 0, latitude: 0, longitude: 0, nodeType: "true" });
    assert.equal(providerCallEstimate("2026-10-01", "2026-10-31"), 31);
    assert.equal(providerCallEstimate("2024-01-01", "2024-12-31"), 366);
  });

  await t("sağlayıcı örneği ↔ DE440: boylam/enlem PROVIDER_LIMITS içinde; hız ±1 gün farkı (anlık değil) → kullanılmaz", () => {
    for (const s of SAMPLE.planets) {
      const r = REF.rows.find((x) => x.date === s.body.date && x.at === "00:00")!;
      const pr = projectProviderPlanets({ planets: s.planets }, "true");
      assert.ok(pr.ok);
      const era = eraOf(+s.body.date.slice(0, 4));
      for (const b of PLANETS) {
        const [lon, lat] = r.b[b] as number[];
        const p = pr.positions[b]!;
        const lim = PROVIDER_LIMITS[era][b]!;
        assert.ok(as(wrap180(p.lon - lon)) <= lim.lon && as(p.lat - lat) <= lim.lat, `${s.body.date} ${b}`);
      }
      assert.ok(as(wrap180(pr.positions.true_node!.lon - (r.b.true_node_de440 as number))) <= PROVIDER_LIMITS[era].true_node!.lon);
    }
    const s = SAMPLE.planets.find((x) => x.body.date === "2026-10-15")!;
    const moonSp = (s.planets as { name: string; speed: number }[]).find((p) => p.name === "Moon")!.speed;
    const ref = REF.rows.find((x) => x.date === "2026-10-15" && x.at === "00:00")!;
    const prev = REF.rows.find((x) => x.date === "2026-10-14" && x.at === "00:00")!;
    const next = REF.rows.find((x) => x.date === "2026-10-16" && x.at === "00:00")!;
    const cen1d = wrap180((next.b.moon as number[])[0] - (prev.b.moon as number[])[0]) / 2;
    olcu(`Ay hızı sağlayıcı ${moonSp.toFixed(5)} · ±1 gün fark ${cen1d.toFixed(5)} · anlık ${(ref.b.moon as number[])[4].toFixed(5)} °/gün`);
    assert.ok(Math.abs(moonSp - cen1d) < 2e-5);
    assert.ok(Math.abs(moonSp - (ref.b.moon as number[])[4]) > 1e-3);
  });

  await t("sağlayıcı aylık tablosu 12:00 UTC'dir (00:00 DEĞİL) — etiket kuralının kanıtı", () => {
    const NAME: Record<string, PlanetBody> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus", Neptune: "neptune", Pluto: "pluto" };
    let w12 = 0;
    let w00 = 0;
    for (const d of SAMPLE.monthly12utc) {
      const r12 = REF.rows.find((x) => x.date === d.date && x.at === "12:00")!;
      const r00 = REF.rows.find((x) => x.date === d.date && x.at === "00:00")!;
      for (const p of d.positions) {
        const b = NAME[p.planet];
        if (!b) continue;
        w12 = Math.max(w12, as(wrap180(p.longitude - (r12.b[b] as number[])[0])));
        w00 = Math.max(w00, as(wrap180(p.longitude - (r00.b[b] as number[])[0])));
      }
    }
    olcu(`aylık tablo ↔ 12:00 UT ${w12.toFixed(2)}″ · ↔ 00:00 UT ${(w00 / 3600).toFixed(2)}°`);
    assert.ok(w12 <= 0.4 && w00 > 3600);
  });

  await t("sağlayıcı kaynağıyla tablo: gün başına 1 çağrı, LRU ile tekrar 0 çağrı, RA/dek türetilir, hız yerel, sidereal = boylam − ayanamsa", async () => {
    const s = SAMPLE.planets.find((x) => x.body.date === "2026-10-15")!;
    let calls = 0;
    const fetchDay = async (date: string) => {
      calls++;
      return date === "2026-10-15" ? { planets: s.planets } : null;
    };
    const req = parseEphemerisRequest({ view: "day", date: "2026-10-15", source: "provider", nodeType: "true" });
    assert.ok(req.ok);
    const r1 = await buildEphemeris(req.value, { fetchDay });
    assert.ok(r1.ok);
    assert.equal(r1.result.meta.providerCalls, 1);
    const r2 = await buildEphemeris(req.value, { fetchDay });
    assert.ok(r2.ok && r2.result.meta.providerCalls === 0 && calls === 1);
    const ref = REF.rows.find((x) => x.date === "2026-10-15" && x.at === "00:00")!;
    for (const p of r1.result.rows[0].positions) {
      if (!(PLANETS as readonly string[]).includes(p.body)) continue;
      const [, , ra, dec, sp] = ref.b[p.body] as number[];
      assert.ok(as(wrap180(p.ra! - ra) * Math.cos((dec * Math.PI) / 180)) < 2.5 && as(p.dec! - dec) < 2.5, `${p.body} RA/dek`);
      assert.ok(as(p.speed - sp) <= LOCAL_LIMITS["1800-2100"][p.body]!.speed, `${p.body} hız`);
    }
    const sid = await buildEphemeris({ ...req.value, zodiac: "sidereal_lahiri" }, { fetchDay });
    assert.ok(sid.ok);
    const ms = Date.UTC(2026, 9, 15);
    const sunT = r1.result.rows[0].positions.find((p) => p.body === "sun")!.lon;
    const sunS = sid.result.rows[0].positions.find((p) => p.body === "sun")!.lon;
    assert.ok(as(wrap180(sunT - sunS - lahiriTrueAyanamsa(ms))) < 1e-6);
    assert.ok(sid.result.meta.ayanamsa !== null);
  });

  await t("sağlayıcı hatası: eksik gün → PROVIDER_FAILED, yerel veriyle SESSİZ tamamlama YOK; fetchDay yoksa hata; 31 gün sınırı", async () => {
    const req = parseEphemerisRequest({ view: "month", year: 1990, month: 1, source: "provider" });
    assert.ok(req.ok);
    const r = await buildEphemeris(req.value, { fetchDay: async () => null });
    assert.ok(!r.ok && r.error.code === "PROVIDER_FAILED");
    const r2 = await buildEphemeris(req.value);
    assert.ok(!r2.ok && r2.error.code === "PROVIDER_FAILED");
    const lru = new Lru<number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.get("a");
    lru.set("c", 3);
    assert.equal(lru.get("b"), undefined);
    assert.equal(lru.get("a"), 1);
  });

  // ─── 5. Biçim / CSV / ΔT ────────────────────────────────────────────────────────────────────────────
  await t("biçim: yuvarlama taşıması (29°59′59,6″ → sonraki burç 00°00′00″), 0,1′, işaretli değer, RA, belirsizlik", () => {
    assert.equal(formatLon(29 + 59 / 60 + 59.6 / 3600, "arcsec"), "00°00′00″ Boğ");
    assert.equal(formatLon(359.99999, "arcmin"), "00°00′ Koç");
    assert.equal(formatLon(188.3302, "arcsec"), "08°19′49″ Ter");
    assert.equal(formatLon(188.3302, "tenth_arcmin"), "08°19,8′ Ter");
    assert.equal(formatLon(188.3302, "arcmin"), "08°20′ Ter");
    assert.equal(formatSigned(-0.0000001, "arcsec"), "+00°00′00″");
    assert.equal(formatSigned(-5.1483, "arcsec"), "−05°08′54″");
    assert.equal(formatSigned(13.27101, "tenth_arcmin", 1), "+13°16,3′");
    assert.equal(formatRa(0, "arcsec"), "00s 00d 00,0sn");
    assert.equal(formatRa(359.99999, "tenth_arcmin"), "00s 00d 00sn");
    assert.equal(formatRa(15.25, "arcmin"), "01s 01,0d");
    assert.equal(formatUncertainty(12.3), "±12 sn");
    assert.equal(formatUncertainty(5400), "±1,5 sa");
    assert.equal(formatUncertainty(Infinity), "belirsiz");
  });

  await t("CSV yalnız yerel kaynak; başlık + satır sayısı; sağlayıcı sonucu için hata", async () => {
    const req = parseEphemerisRequest({ view: "month", year: 2026, month: 2, bodies: ["sun", "moon"] });
    assert.ok(req.ok);
    const r = await buildEphemeris(req.value);
    assert.ok(r.ok);
    const csv = toCsv(r.result);
    const lines = csv.trim().split("\r\n");
    assert.equal(lines.length, 2 + 28 * 2);
    assert.ok(lines[1].startsWith("tarih;saat_UT;cisim"));
    assert.throws(() => toCsv({ ...r.result, meta: { ...r.result.meta, source: "provider" } }));
  });

  await t("ΔT tablosu: 1001 değer, gözlem dönemi bilinen değerler, sınıflar, aralık dışı null", () => {
    assert.equal(DELTA_T_TABLE_LENGTH, 1001);
    assert.ok(Math.abs(deltaTSeconds(Date.UTC(2000, 0, 1))! - 63.8) < 0.2);
    assert.ok(Math.abs(deltaTSeconds(Date.UTC(1972, 0, 1))! - 42.2) < 0.2);
    assert.equal(deltaTSeconds(Date.UTC(1500, 0, 1)), null);
    assert.equal(deltaTClass(Date.UTC(2030, 0, 1)), "predicted");
    assert.equal(deltaTClass(Date.UTC(1750, 0, 1)), "historical_model");
    assert.equal(deltaTClass(Date.UTC(1990, 0, 1)), "observed");
  });

  // ─── 6. Performans ──────────────────────────────────────────────────────────────────────────────────
  await t("performans: 10 yıl × günlük (119 sayfa) yerel; tek sayfa < 2 sn; toplam bellek artışı ölçülür", async () => {
    const req = parseEphemerisRequest({ view: "range", start: "2026-01-01", end: "2035-12-31" });
    assert.ok(req.ok);
    const h0 = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    let worst = 0;
    let rows = 0;
    let events = 0;
    const total = pageWindow(req.value)!.total;
    for (let p = 0; p < total; p++) {
      const s = Date.now();
      const r = await buildEphemeris({ ...req.value, page: p } as EphemerisRequest);
      assert.ok(r.ok);
      rows += r.result.rows.length;
      events += r.result.events.length;
      worst = Math.max(worst, Date.now() - s);
    }
    const dt = Date.now() - t0;
    const dh = (process.memoryUsage().heapUsed - h0) / 1e6;
    olcu(`10 yıl: ${total} sayfa, ${rows} satır, ${events} olay, toplam ${(dt / 1000).toFixed(1)} sn, en yavaş sayfa ${worst} ms, yığın artışı ${dh.toFixed(1)} MB`);
    assert.equal(rows, 3652);
    assert.ok(worst < 2000);
  });
}

main().then(() => {
  console.log(`\nSONUÇ pro-ephemeris: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
});
