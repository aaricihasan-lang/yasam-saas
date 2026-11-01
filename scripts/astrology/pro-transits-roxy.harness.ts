/**
 * GÖKYÜZÜ ATLASI — WT-04 İleri Transit motoru ↔ GERÇEK sağlayıcı (Roxy) yanıtları karşılaştırması (ÇEVRİMDIŞI).
 * Yanıtlar 2026-10-31 gece kampanyasında merkezi defterle alınıp (WT-04, sentetik doğumlar) yalnız karşılaştırma alanlarıyla
 * fixtures/pro-transits/roxy-*.json olarak saklandı; bu dosya ÇAĞRI YAPMAZ.
 *   R1 /astrology/transits/monthly — burç girişleri (dakika çözünürlüğü), 2025–2026 + 1975/1985/2045
 *   R2 /astrology/aspects/monthly  — transit–transit kesin anlar (dakika), 9 açı, 2025–2026
 *   R3 /forecast/transits          — transit→natal kesin an (saniye), istasyon, burç girişi; 6 doğum × 2026
 *   R4 /astrology/transit-aspects  — tek an: transit gövde konumu/hızı, orb, applying
 * Sağlayıcının SUNMADIĞI orb giriş/çıkış anları burada DOĞRULANMAZ (DE440 harness'i: pro-transits.harness.ts).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-transits-roxy.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aspectStateAt, scanTransits } from "@/lib/astrology/pro/transits/scan";
import { wrap180 } from "@/lib/astrology/pro/transits/segments";
import { ASPECTS, TRANSIT_BODIES, lonAt, positionErrorArcsec, speedAt, type AspectId, type ScanResult, type TransitBody, type TransitEvent } from "@/lib/astrology/pro/transits/model";

let pass = 0;
let fail = 0;
const report: string[] = [];
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
const FX = "scripts/astrology/fixtures/pro-transits";
const load = <T,>(n: string): T => JSON.parse(readFileSync(`${FX}/roxy-${n}.json`, "utf8")) as T;
const NAME: Record<string, TransitBody> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus", Neptune: "neptune", Pluto: "pluto" };
const ASP: Record<string, AspectId> = { conjunction: "conjunction", sextile: "sextile", square: "square", trine: "trine", opposition: "opposition", "semi-sextile": "semi_sextile", "semi-square": "semi_square", sesquiquadrate: "sesquiquadrate", quincunx: "quincunx" };
const ms = (s: string) => Date.parse(/Z$/.test(s) ? s : `${s}Z`);
const stats = () => ({ n: 0, max: 0, sum: 0, over: 0, worstRatio: 0 });
type St = ReturnType<typeof stats>;
const add = (s: St, d: number, tol: number) => {
  s.n++;
  s.max = Math.max(s.max, Math.abs(d));
  s.sum += d;
  if (Math.abs(d) > tol) s.over++;
  s.worstRatio = Math.max(s.worstRatio, Math.abs(d) / tol);
};
const fmt = (s: St) => `n=${s.n} maks|Δ|=${s.max.toFixed(1)} sn ort Δ=${s.n ? (s.sum / s.n).toFixed(1) : "-"} sn tolerans aşımı=${s.over} maks Δ/tol=${s.worstRatio.toFixed(3)}`;
function nearest<T extends { ms: number }>(xs: T[], at: number, used: Set<T>): T | null {
  let best: T | null = null;
  for (const x of xs) if (!used.has(x) && (!best || Math.abs(x.ms - at) < Math.abs(best.ms - at))) best = x;
  return best;
}
const MIN = 60_000;

async function main() {
  // ─── R1 burç girişleri ────────────────────────────────────────────────────────────────────────────────
  await t("R1 aylık burç girişi (27 ay): sağlayıcının her girişi motorda var, Δ ≤ beyan belirsizlik + 60 sn (dakika çözünürlüğü); motorda fazla giriş yok", () => {
    const months = load<{ year: number; month: number; events: { planet: string; toSign: string; datetime: string; isRetrograde: boolean }[] }[]>("ingressMonthly");
    const s = stats();
    let missing = 0;
    let extra = 0;
    const deltas: number[] = [];
    const bad: string[] = [];
    for (const m of months) {
      const t0 = Date.UTC(m.year, m.month - 1, 1);
      const t1 = Date.UTC(m.year, m.month, 1);
      const r = scanTransits({ startUtcMs: t0, endUtcMs: t1, bodies: [...TRANSIT_BODIES], aspects: [], include: { natal: false, mundane: false, stations: false, ingresses: true } }) as ScanResult;
      const mine = r.events.filter((e) => e.type === "ingress");
      const used = new Set<TransitEvent>();
      for (const e of m.events) {
        const b = NAME[e.planet];
        if (!b) continue;
        const at = ms(e.datetime);
        const c = nearest(mine.filter((x) => x.body === b && x.toSign === e.toSign.toLowerCase() && x.retrograde === e.isRetrograde), at, used);
        const tol = (c ? c.uncertaintySec : 0) + 60;
        if (!c || Math.abs(c.ms - at) / 1000 > tol + 3600) {
          missing++;
          bad.push(`KAÇAN ${m.year}-${m.month} ${e.planet} → ${e.toSign} ${e.datetime}`);
          continue;
        }
        used.add(c);
        const d = (c.ms - at) / 1000;
        deltas.push(d);
        add(s, d, tol);
        if (Math.abs(d) > tol) bad.push(`${m.year}-${m.month} ${e.planet} → ${e.toSign} Δ${d.toFixed(0)} > ${tol.toFixed(0)}`);
      }
      // Ay sınırındaki dakikaya yuvarlanan girişler komşu aya düşebilir → yalnız ay içinde 2 dk'dan uzak olanlar sayılır.
      for (const x of mine) if (!used.has(x) && x.ms - t0 > 2 * MIN && t1 - x.ms > 2 * MIN) {
        extra++;
        bad.push(`FAZLA ${x.body} → ${x.toSign} ${x.atUtc}`);
      }
    }
    const inMinute = deltas.filter((d) => d >= 0 && d < 60).length;
    report.push(`R1 ingress: ${fmt(s)}; kaçan ${missing}, fazla ${extra}; Δ∈[0,60) (sağlayıcı dakikayı KESİYOR mu) ${inMinute}/${deltas.length}`);
    assert.equal(bad.length, 0, bad.slice(0, 10).join("\n"));
  });

  // ─── R2 transit–transit aylık açılar ──────────────────────────────────────────────────────────────────
  await t("R2 aylık transit–transit kesin anlar (24 ay, 9 gövde, 9 açı): sağlayıcının her olayı motorda var (kesin ya da teğetsel en yakın), Δ ≤ belirsizlik + 60 sn", () => {
    const months = load<{ year: number; month: number; events: { planet1: string; planet2: string; aspect: string; datetime: string; orb: number }[] }[]>("aspectsMonthly");
    const BODIES = TRANSIT_BODIES.filter((b) => b !== "moon");
    const sEx = stats();
    const sTan = stats();
    let missing = 0;
    let extra = 0;
    let roxyN = 0;
    let tanOrbMax = 0;
    const bad: string[] = [];
    const extraList: string[] = [];
    for (const m of months) {
      const t0 = Date.UTC(m.year, m.month - 1, 1);
      const t1 = Date.UTC(m.year, m.month, 1);
      // Sağlayıcı "geleneksel orb"larla kesinleşmeyen yaklaşmaları da (orb > 0, en yakın an) verir; orb'ları belgelenmemiş →
      // teğetsel eşleşme için geniş orb (10°) ile ikinci tarama. Kesinleşmeler orb'dan bağımsızdır.
      const r = scanTransits({ startUtcMs: t0, endUtcMs: t1, bodies: BODIES, mundaneBodies: BODIES, aspects: Object.keys(ASPECTS) as AspectId[], defaultOrb: 1, include: { natal: false, mundane: true, stations: false, ingresses: false } }) as ScanResult;
      // Ay sınırı: yerel minimum komşu ayın ilk/son günlerinde olabilir → geniş taramayı ±3 gün taşır (yalnız eşleşme için).
      const wide = scanTransits({ startUtcMs: t0 - 3 * 86_400_000, endUtcMs: t1 + 3 * 86_400_000, bodies: BODIES, mundaneBodies: BODIES, aspects: Object.keys(ASPECTS) as AspectId[], defaultOrb: 10, include: { natal: false, mundane: true, stations: false, ingresses: false } }) as ScanResult;
      const mine = [...r.events.filter((e) => e.type === "exact"), ...wide.events.filter((e) => e.type === "closest_approach")];
      const used = new Set<TransitEvent>();
      for (const e of m.events) {
        const a = NAME[e.planet1];
        const b = NAME[e.planet2];
        const asp = ASP[e.aspect];
        if (!a || !b || !asp) continue;
        roxyN++;
        const at = ms(e.datetime);
        const pair = (x: TransitEvent) => (x.body === a && x.other === b) || (x.body === b && x.other === a);
        const want = e.orb > 0.001 ? "closest_approach" : "exact";
        const c = nearest(mine.filter((x) => pair(x) && x.aspect === asp && x.type === want), at, used);
        const tol = (c ? c.uncertaintySec : 0) + 60;
        if (!c || Math.abs(c.ms - at) / 1000 > tol + 6 * 3600) {
          missing++;
          bad.push(`KAÇAN ${e.planet1}-${e.planet2} ${e.aspect} ${e.datetime} orb ${e.orb}`);
          continue;
        }
        if (want === "closest_approach") {
          // En yakın yaklaşmadaki açı hatası da karşılaştırılır (sağlayıcı 2 basamak yuvarlıyor).
          const od = Math.abs((c.separationDeg ?? NaN) - e.orb);
          tanOrbMax = Math.max(tanOrbMax, od);
          if (!(od <= 0.005 + (positionErrorArcsec(a, at) + positionErrorArcsec(b, at)) / 3600)) bad.push(`${e.planet1}-${e.planet2} ${e.aspect} en yakın orb ${c.separationDeg} ↔ ${e.orb}`);
        }
        used.add(c);
        const d = (c.ms - at) / 1000;
        add(want === "exact" ? sEx : sTan, d, tol);
        if (Math.abs(d) > tol) bad.push(`${e.planet1}-${e.planet2} ${e.aspect} ${e.datetime} Δ${d.toFixed(0)} > ${tol.toFixed(0)}`);
      }
      for (const x of mine) if (x.type === "exact" && !used.has(x) && x.ms - t0 > 2 * MIN && t1 - x.ms > 2 * MIN) {
        extra++;
        extraList.push(`${x.body}-${x.other} ${x.aspect} ${x.atUtc}`);
      }
    }
    report.push(`R2 aspects/monthly: sağlayıcı ${roxyN} olay; kesin ${fmt(sEx)}; kesinleşmeyen en yakın yaklaşma (sağlayıcı orb>0) ${fmt(sTan)}, en yakın orb farkı maks ${tanOrbMax.toFixed(4)}°; kaçan ${missing}; motorda olup sağlayıcıda olmayan kesinleşme ${extra}${extraList.length ? ` [ilk: ${extraList.slice(0, 6).join("; ")}]` : ""}`);
    assert.equal(bad.length, 0, bad.slice(0, 10).join("\n"));
  });

  // ─── R3 forecast ──────────────────────────────────────────────────────────────────────────────────────
  await t("R3 forecast (6 doğum × 2026): transit→natal kesin an + istasyon + burç girişi — sağlayıcının her olayı motorda, |Δ| ≤ beyan belirsizlik + 2 sn", () => {
    const natal = load<Record<string, { planets: { name: string; longitude: number }[]; ascendant: number | null; midheaven: number | null }>>("natal");
    const fc = load<{ birth: string; startDate: string; endDate: string; events: { datetime: string; type: string; body?: string; target?: string; aspect?: string; station?: string }[] }[]>("forecast");
    const sAsp = stats();
    const sSt = stats();
    const sIn = stats();
    let missing = 0;
    let skippedTargets = 0;
    const cover: Record<string, { roxy: number; mine: number; mineAngles: number; unmatched: number }> = {};
    const unmatchedList: string[] = [];
    const bad: string[] = [];
    const targetsSeen = new Set<string>();
    for (const w of fc) {
      const n = natal[w.birth];
      const pts = n.planets.map((p) => ({ id: p.name.replace(/[^A-Za-z]/g, ""), lon: p.longitude }));
      if (n.ascendant !== null) pts.push({ id: "Ascendant", lon: n.ascendant });
      if (n.midheaven !== null) pts.push({ id: "Midheaven", lon: n.midheaven });
      const t0 = Date.parse(`${w.startDate}T00:00:00Z`);
      const t1 = Date.parse(`${w.endDate}T00:00:00Z`) + 86_400_000;
      const r = scanTransits({ startUtcMs: t0, endUtcMs: t1, bodies: TRANSIT_BODIES.filter((b) => b !== "moon"), natalPoints: pts, aspects: ["conjunction", "sextile", "square", "trine", "opposition"], defaultOrb: 1, include: { natal: true, mundane: false, stations: true, ingresses: true } }) as ScanResult;
      const used = new Set<TransitEvent>();
      for (const e of w.events) {
        const at = ms(e.datetime);
        if (e.type === "transit-aspect") {
          const b = NAME[e.body!];
          const asp = ASP[e.aspect!];
          const tgt = e.target!.replace(/[^A-Za-z]/g, "");
          targetsSeen.add(e.target!);
          if (!b || !asp || !pts.some((p) => p.id === tgt)) {
            skippedTargets++;
            continue;
          }
          const k = `${b}`;
          (cover[k] ??= { roxy: 0, mine: 0, mineAngles: 0, unmatched: 0 }).roxy++;
          const c = nearest(r.events.filter((x) => x.type === "exact" && x.body === b && x.other === tgt && x.aspect === asp), at, used);
          const tol = (c ? c.uncertaintySec : 0) + 2;
          if (!c || Math.abs(c.ms - at) / 1000 > tol + 86_400) {
            missing++;
            bad.push(`KAÇAN ${w.birth} ${e.body} ${e.aspect} natal ${e.target} ${e.datetime}`);
            continue;
          }
          used.add(c);
          const d = (c.ms - at) / 1000;
          add(sAsp, d, tol);
          if (Math.abs(d) > tol) bad.push(`${w.birth} ${e.body} ${e.aspect} ${e.target} Δ${d.toFixed(0)} > ${tol.toFixed(0)}`);
        } else if (e.type === "retrograde-station") {
          const b = NAME[e.body!];
          const c = nearest(r.events.filter((x) => x.type === "station" && x.body === b && x.station === e.station), at, used);
          const tol = (c ? c.uncertaintySec : 0) + 2;
          if (!c || Math.abs(c.ms - at) / 1000 > tol + 86_400) {
            missing++;
            bad.push(`KAÇAN istasyon ${e.body} ${e.station} ${e.datetime}`);
            continue;
          }
          used.add(c);
          const d = (c.ms - at) / 1000;
          add(sSt, d, tol);
          if (Math.abs(d) > tol) bad.push(`istasyon ${e.body} ${e.station} Δ${d.toFixed(0)} > ${tol.toFixed(0)}`);
        } else if (e.type === "sign-ingress") {
          const b = NAME[e.body!];
          if (!b || b === "moon") continue;
          const c = nearest(r.events.filter((x) => x.type === "ingress" && x.body === b && x.toSign === String(e.target).toLowerCase()), at, used);
          const tol = (c ? c.uncertaintySec : 0) + 2;
          if (!c || Math.abs(c.ms - at) / 1000 > tol + 86_400) {
            missing++;
            bad.push(`KAÇAN giriş ${e.body} ${e.target} ${e.datetime}`);
            continue;
          }
          used.add(c);
          const d = (c.ms - at) / 1000;
          add(sIn, d, tol);
          if (Math.abs(d) > tol) bad.push(`giriş ${e.body} ${e.target} Δ${d.toFixed(0)} > ${tol.toFixed(0)}`);
        }
      }
      for (const x of r.events) {
        if (x.type !== "exact" || x.ms < t0 || x.ms >= t1) continue;
        const c = (cover[x.body] ??= { roxy: 0, mine: 0, mineAngles: 0, unmatched: 0 });
        if (x.other === "Ascendant" || x.other === "Midheaven") c.mineAngles++;
        else {
          c.mine++;
          if (!used.has(x)) {
            c.unmatched++;
            if (unmatchedList.length < 8) unmatchedList.push(`${w.birth} ${x.body} ${x.aspect} ${x.other} ${x.atUtc}`);
          }
        }
      }
    }
    report.push(`R3 forecast transit→natal kesin: ${fmt(sAsp)}`);
    report.push(`R3 forecast istasyon: ${fmt(sSt)} · burç girişi: ${fmt(sIn)} · kaçan ${missing} · eşlenmeyen hedef (düğüm/Kiron/Lilith dışı) ${skippedTargets}`);
    report.push(`R3 kapsam (gövde: sağlayıcı / motor gezegen-nokta hedefli kesinleşme / motorda olup sağlayıcıda olmayan / motor ASC-MC hedefli): ${Object.entries(cover).map(([k, v]) => `${k} ${v.roxy}/${v.mine}/${v.unmatched}/${v.mineAngles}`).join(", ")} · sağlayıcı hedefleri (ASC/MC YOK): ${[...targetsSeen].sort().join(", ")}${unmatchedList.length ? ` · eşleşmeyen örnek: ${unmatchedList.join("; ")}` : ""}`);
    assert.equal(bad.length, 0, bad.slice(0, 10).join("\n"));
  });

  // ─── R4 tek an ────────────────────────────────────────────────────────────────────────────────────────
  await t("R4 tek an (30 an): transit konum farkı ≤ ölçülü hata sınırı; orb farkı ≤ sınır; applying aynı (orb ve hız belirsizlik dışında)", () => {
    const ta = load<{ birth: string; transitDate: string; transitTime: string; tz: number; response: { transitPlanets: { name: string; longitude: number; speed: number }[]; natalPlanets: { name: string; longitude: number }[]; aspects: { planet1: string; planet2: string; type: string; angle: number; orb: number; isApplying: boolean }[] } }[]>("transitAspects");
    const posMax: Record<string, number> = {};
    let posOver = 0;
    let orbN = 0;
    let orbOver = 0;
    let orbMax = 0;
    let appN = 0;
    let appDiff = 0;
    let appAmb = 0;
    const bad: string[] = [];
    for (const x of ta) {
      const at = Date.parse(`${x.transitDate}T${x.transitTime}Z`) - x.tz * 3_600_000;
      for (const p of x.response.transitPlanets) {
        const b = NAME[p.name];
        if (!b) continue;
        const d = Math.abs(wrap180(lonAt(b, at) - p.longitude)) * 3600;
        posMax[b] = Math.max(posMax[b] ?? 0, d);
        if (d > positionErrorArcsec(b, at)) {
          posOver++;
          bad.push(`${x.birth} ${x.transitDate} ${b} konum farkı ${d.toFixed(1)}″`);
        }
      }
      const natalLon = Object.fromEntries(x.response.natalPlanets.map((p) => [p.name, p.longitude]));
      for (const a of x.response.aspects) {
        const b = NAME[a.planet1];
        const asp = Object.entries(ASPECTS).find(([, v]) => v === a.angle)?.[0] as AspectId | undefined;
        if (!b || !asp || natalLon[a.planet2] === undefined) continue;
        const st = aspectStateAt(lonAt(b, at), speedAt(b, at), natalLon[a.planet2], 0, asp);
        const err = positionErrorArcsec(b, at) / 3600;
        orbN++;
        const od = Math.abs(st.orb - a.orb);
        orbMax = Math.max(orbMax, od * 3600);
        if (od > err) {
          orbOver++;
          bad.push(`${x.birth} ${b}-${a.planet2} ${asp} orb ${st.orb} ↔ ${a.orb}`);
        }
        appN++;
        // Kesinleşmeye hata kadar yakın ya da istasyondaki gövdede yön belirsizdir.
        const ambiguous = st.orb < err || Math.abs(speedAt(b, at)) < 2 / 3600;
        if (ambiguous) appAmb++;
        else if (st.applying !== a.isApplying) {
          appDiff++;
          bad.push(`${x.birth} ${x.transitDate} ${b}-${a.planet2} ${asp} applying ${st.applying} ↔ ${a.isApplying} (orb ${st.orb.toFixed(4)})`);
        }
      }
    }
    report.push(`R4 tek an konum farkı (″, gövde başına maks): ${Object.entries(posMax).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")} · sınır aşımı ${posOver}`);
    report.push(`R4 orb: ${orbN} açı, maks |Δorb| ${orbMax.toFixed(1)}″, sınır aşımı ${orbOver} · applying: ${appN} karşılaştırma, belirsiz ${appAmb}, FARKLI ${appDiff}`);
    assert.equal(bad.length, 0, bad.slice(0, 10).join("\n"));
  });

  console.log("\n— Rapor satırları —");
  for (const l of report) console.log(l);
  console.log(`\nastrology pro-transits-roxy (WT-04) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
