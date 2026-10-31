/**
 * GÖKYÜZÜ ATLASI — WT-04 İleri Transit motoru (lib/astrology/pro/transits) birim + bağımsız referans testleri.
 * Sağlayıcı (ücretli) çağrısı YOK. Bağımsız referans: scripts/astrology/fixtures/pro-transits/ref-*.json — JPL DE440 (skyfield 1.55),
 * YOĞUN ÖRNEKLEME (Ay varsa 10 dk, yoksa 2 sa ızgara) + skaler ikiye bölme; motorun monoton-parça algoritmasından AYRI Python kodu
 * (C:/YasamSistemi-QA/ASTRO-GECE-4-MOTOR-2026-10-31/kanit/wt04/araclar/de440_ref.py). Beklentiler motor çıktısından türetilmez.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-transits.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { aspectStateAt, scanTransits, timeUncertaintySec } from "@/lib/astrology/pro/transits/scan";
import { levelCrossings, signChanges, wrap180 } from "@/lib/astrology/pro/transits/segments";
import { ACCEL_BOUND, TRANSIT_BODIES, lonAt, speedAt, type ScanRequest, type ScanResult, type TransitEvent } from "@/lib/astrology/pro/transits/model";
import { toLocalStamp, withLocalTimes } from "@/lib/astrology/pro/transits/display";
import { findIngresses, findPerfections, findStations } from "@/lib/astrology/horary/western/timeline";
import { SIGNS } from "@/lib/astrology/horary/western/tables";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import * as Astronomy from "astronomy-engine";
import { isTimeScalesError, scalesFromUtc } from "@/lib/astrology/pro/time";

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
const D = 86_400_000;
const U = Date.UTC;
const FX = "scripts/astrology/fixtures/pro-transits";
type Scenario = ScanRequest & { id: string; note?: string };
const SCEN: Scenario[] = JSON.parse(readFileSync(join(FX, "scenarios.json"), "utf8"));
const runs = new Map<string, ScanResult>();
const run = (id: string) => {
  let r = runs.get(id);
  if (!r) {
    const s = SCEN.find((x) => x.id === id)!;
    const out = scanTransits(s);
    if ("error" in out) throw new Error(`${id}: ${out.error.code}`);
    r = out;
    runs.set(id, r);
  }
  return r;
};
const keyOfWindowId = (id: string) => {
  const [, k, asp, T] = id.split(":");
  return `${k}|${asp}|${T}`;
};

type RefEvent = { type: string; key: string; ms: number; station?: string; level?: number; dir?: number };
function engineKey(e: TransitEvent): string {
  if (e.type === "station") return `${e.body}|${e.station}`;
  if (e.type === "ingress") {
    const sign = e.retrograde ? e.fromSign! : e.toSign!;
    return `${e.body}|${SIGNS.indexOf(sign as (typeof SIGNS)[number]) * 30}|${e.retrograde ? -1 : 1}`;
  }
  return `${e.type}|${keyOfWindowId(e.windowId!)}`;
}
function refKey(e: RefEvent): string {
  if (e.type === "station") return `${e.key}|${e.station}`;
  if (e.type === "ingress") return `${e.key}|${e.level}|${e.dir}`;
  return `${e.type}|${e.key}`;
}

async function main() {
  // ─── T01 ivme sınırları ─────────────────────────────────────────────────────────────────────────────────
  await t("T01 ivme üst sınırı (ACCEL_BOUND) yoğun örneklemde aşılmıyor (8 yıllık parçalar, 1900–2100)", () => {
    let worst = "";
    let worstRatio = 0;
    for (const b of TRANSIT_BODIES) {
      for (const y of [1901, 1950, 1999, 2024, 2060, 2095]) {
        const t0 = U(y, 0, 1);
        const step = b === "moon" ? D / 8 : D / 2;
        const n = b === "moon" ? 600 : 1460;
        let v0 = speedAt(b, t0);
        for (let i = 1; i < n; i++) {
          const v1 = speedAt(b, t0 + i * step);
          const a = Math.abs(v1 - v0) / (step / D);
          const ratio = a / ACCEL_BOUND[b];
          if (ratio > worstRatio) {
            worstRatio = ratio;
            worst = `${b} ${y} a=${a.toFixed(5)}`;
          }
          v0 = v1;
        }
      }
    }
    report.push(`T01 en yüksek ivme/sınır oranı ${worstRatio.toFixed(3)} (${worst})`);
    assert.ok(worstRatio < 1, `oran ${worstRatio}`);
  });

  // ─── T02 / T03 sentetik çekirdek ────────────────────────────────────────────────────────────────────────
  await t("T02 signChanges: aynı ızgara adımına düşen İKİ yakın sıfır (40 dk arayla) bulunur; kaba ızgara kaçırır", () => {
    const a = U(2026, 0, 10, 6, 0);
    const b = a + 40 * 60_000;
    const g = (ms: number) => ((ms - a) / D) * ((ms - b) / D) * 50; // g′ ≤ 50·2·(span) → sınır 100·
    const naive = Math.sign(g(U(2026, 0, 10))) !== Math.sign(g(U(2026, 0, 11)));
    assert.equal(naive, false, "kaba günlük ızgara iki sıfırı görmez (beklenen)");
    const z = signChanges(g, 100, U(2026, 0, 1), U(2026, 0, 20));
    assert.equal(z.length, 2);
    assert.ok(Math.abs(z[0] - a) <= 1000 && Math.abs(z[1] - b) <= 1000);
  });
  await t("T03 levelCrossings: 0/360 sarmalı, parça içinde tek kesişim, yön işareti", () => {
    // d(t) = 350 + 20·sin(2πt/10gün) → 340…360(=0)…  seviyeler 355 ve 5 (sarmal üstünden).
    const t0 = U(2026, 0, 1);
    const d = (ms: number) => 350 + 20 * Math.sin((2 * Math.PI * (ms - t0)) / (10 * D));
    const g = (ms: number) => ((20 * 2 * Math.PI) / 10) * Math.cos((2 * Math.PI * (ms - t0)) / (10 * D));
    const turns = signChanges(g, (20 * 4 * Math.PI * Math.PI) / 100 + 0.1, t0, t0 + 20 * D);
    assert.equal(turns.length, 4);
    const xs = levelCrossings(d, turns, [5, 355], t0, t0 + 20 * D);
    // Her 10 günlük periyotta 5° → 2 kez (çıkış/iniş), 355 → 2 kez (başlangıç anı 350 hariç).
    assert.equal(xs.filter((x) => x.level === 5).length, 4);
    assert.equal(xs.filter((x) => x.level === 355).length, 4);
    for (const x of xs) assert.ok(Math.abs(wrap180(d(x.ms) - x.level)) < 1e-3);
    assert.deepEqual(xs.filter((x) => x.level === 5).map((x) => x.dir), [1, -1, 1, -1]);
  });

  // ─── T04 bağımsız DE440 referansı ───────────────────────────────────────────────────────────────────────
  const refFiles = readdirSync(FX).filter((f) => f.startsWith("ref-"));
  for (const sc of SCEN) {
    const f = `ref-${sc.id}.json`;
    await t(`T04 DE440 referansı ${sc.id}: kaçan/fazla olay 0 (açıklanamayan) ve |Δt| ≤ beyan edilen belirsizlik + 2 sn`, () => {
      assert.ok(refFiles.includes(f), `referans dosyası yok: ${f}`);
      const ref = JSON.parse(readFileSync(join(FX, f), "utf8")) as { events: RefEvent[] };
      const r = run(sc.id);
      const eng = r.events.filter((e) => e.type !== "closest_approach");
      const groups = new Map<string, { eng: TransitEvent[]; ref: RefEvent[] }>();
      for (const e of eng) {
        const k = engineKey(e);
        if (!groups.has(k)) groups.set(k, { eng: [], ref: [] });
        groups.get(k)!.eng.push(e);
      }
      for (const e of ref.events) {
        const k = refKey(e);
        if (!groups.has(k)) groups.set(k, { eng: [], ref: [] });
        groups.get(k)!.ref.push(e);
      }
      const uncertainKeys = new Set<string>();
      for (const w of r.windows) if (w.flags.passCountUncertain || w.flags.windowUncertain) uncertainKeys.add(keyOfWindowId(w.id));
      for (const m of r.nearMisses) uncertainKeys.add(`${m.pair}|${m.aspect}|${m.target}`);
      let matched = 0;
      let refArtifacts = 0;
      const artifactNotes: string[] = [];
      let unexplained = 0;
      let explained = 0;
      let worstRatio = 0;
      let worstSec = 0;
      const bad: string[] = [];
      const byType: Record<string, { n: number; maxSec: number; maxUnc: number }> = {};
      for (const [k, g] of groups) {
        const used = new Set<number>();
        for (const e of g.eng) {
          let bi = -1;
          let bd = Infinity;
          g.ref.forEach((x, i) => {
            if (used.has(i)) return;
            const dd = Math.abs(x.ms - e.ms);
            if (dd < bd) {
              bd = dd;
              bi = i;
            }
          });
          const tol = (Number.isFinite(e.uncertaintySec) ? e.uncertaintySec : 1e12) + 2;
          if (bi >= 0 && bd / 1000 <= Math.max(tol, 3 * 86_400 * (Number.isFinite(e.uncertaintySec) ? 0 : 1))) {
            used.add(bi);
            matched++;
            const sec = bd / 1000;
            const ratio = sec / tol;
            if (ratio > worstRatio) worstRatio = ratio;
            if (sec > worstSec) worstSec = sec;
            const bt = (byType[e.type] ??= { n: 0, maxSec: 0, maxUnc: 0 });
            bt.n++;
            bt.maxSec = Math.max(bt.maxSec, sec);
            bt.maxUnc = Math.max(bt.maxUnc, Number.isFinite(e.uncertaintySec) ? e.uncertaintySec : 0);
            if (sec > tol) bad.push(`${k} Δ${sec.toFixed(1)}s > ${tol}`);
          } else {
            const wk = k.split("|").slice(1).join("|");
            if (uncertainKeys.has(wk)) explained++;
            else {
              unexplained++;
              bad.push(`FAZLA ${k} ${e.atUtc} (en yakın Δ${(bd / 1000).toFixed(0)}s, tol ${tol})`);
            }
          }
        }
        g.ref.forEach((x, i) => {
          if (used.has(i)) return;
          const wk = k.split("|").slice(1).join("|");
          const body = k.split("|")[0];
          // DE440/skyfield görünür konumu Güneş diskinin arkasında kütleçekimsel ışık sapmasıyla sahte hız dönüşü üretir (fiziksel
          // olarak gözlenemeyen an). Gövde Güneş'e < 1° ise referans artefaktı olarak AYRI sayılır (sayı raporda).
          if (x.type === "station" && (TRANSIT_BODIES as readonly string[]).includes(body) && Math.abs(wrap180(lonAt(body as never, x.ms) - lonAt("sun", x.ms))) < 1) {
            refArtifacts++;
            artifactNotes.push(`${k} ${new Date(x.ms).toISOString()}`);
            return;
          }
          if (uncertainKeys.has(wk)) explained++;
          else {
            unexplained++;
            bad.push(`KAÇAN ${k} ${new Date(x.ms).toISOString()}`);
          }
        });
      }
      const types = Object.entries(byType).map(([ty, v]) => `${ty} ${v.n} (maks Δ ${v.maxSec.toFixed(1)} sn / maks beyan ${v.maxUnc.toFixed(0)} sn)`).join("; ");
      report.push(`T04 ${sc.id}: motor ${eng.length} / DE440 ${ref.events.length} olay, eşleşen ${matched}, açıklanan (belirsiz bayraklı) ${explained}, DE440 Güneş-arkası artefaktı ${refArtifacts}${artifactNotes.length ? ` [${artifactNotes.join(", ")}]` : ""}, AÇIKLANAMAYAN ${unexplained}, maks |Δt| ${worstSec.toFixed(1)} sn, maks Δt/tolerans ${worstRatio.toFixed(3)} — ${types}`);
      assert.equal(bad.length, 0, bad.slice(0, 8).join("\n"));
    });
  }

  // ─── Davranış vakaları ──────────────────────────────────────────────────────────────────────────────────
  await t("T05 tek kesinleşme: S1 Jüpiter kare natal 300° (2023-05) tek geçiş, giriş < kesin < çıkış", () => {
    const w = run("S1-dis-coklu").windows.filter((x) => x.a === "jupiter" && x.b === "p300" && x.aspect === "square");
    assert.ok(w.length >= 1);
    const x = w[0];
    assert.equal(x.classification, "single");
    assert.ok(x.enterMs! < x.passes[0].ms && x.passes[0].ms < x.exitMs!);
  });
  await t("T06 çoklu kesinleşme: Plüton kavuşum natal 300° → 2023 ve 2024 pencerelerinde 2'şer geçiş (1/2, 2/2) + 2024-01 tek; Merkür natal 150° üçlü (2024)", () => {
    const pl = run("S1-dis-coklu").windows.filter((x) => x.a === "pluto" && x.b === "p300" && x.aspect === "conjunction");
    const total = pl.reduce((n, w) => n + w.passes.length, 0);
    assert.equal(total, 5, `Plüton 300° geçişi ${total}`);
    assert.ok(pl.some((w) => w.classification === "multiple" && w.passes.map((p) => `${p.pass}/${p.of}`).join(",") === "1/2,2/2"));
    assert.ok(pl.some((w) => w.passes.some((p) => p.aRetrograde)));
    // Orb 2°: Merkür 2024-08-05 geri istasyonu 154° (orb dışı), 08-28 doğrudan istasyonu 141° (orb dışı) → üç AYRI pencere, tek döngü.
    const me = run("S3-merkur-retro").windows.filter((x) => x.a === "mercury" && x.b === "q150" && x.aspect === "conjunction").flatMap((w) => w.passes).filter((p) => p.atUtc.startsWith("2024-0"));
    assert.equal(me.length, 3, "Merkür 2024 Temmuz–Eylül üç geçiş");
    assert.deepEqual(me.map((p) => [p.cyclePass, p.cycleOf, p.aRetrograde, p.pass, p.of]), [[1, 3, false, 1, 1], [2, 3, true, 1, 1], [3, 3, false, 1, 1]]);
    assert.equal(new Set(me.map((p) => p.cycleId)).size, 1);
    const ex = run("S3-merkur-retro").events.filter((e) => e.type === "exact" && e.cycleId === me[0].cycleId);
    assert.deepEqual(ex.map((e) => `${e.pass}/${e.of}`), ["1/3", "2/3", "3/3"]);
    report.push(`T06 Merkür üçlü döngü (3 ayrı orb penceresi): ${me.map((p) => `${p.atUtc}${p.aRetrograde ? " R" : ""}`).join(" · ")}`);
    // Plüton: aynı döngüde 2023-03/06 ve 2024-01 (1 dönüş arayla), 2024-09/11 → döngü ailesi sayısı ve sırası.
    const plc = pl.flatMap((w) => w.passes).map((p) => `${p.atUtc.slice(0, 7)} ${p.cyclePass}/${p.cycleOf}`);
    report.push(`T06 Plüton 300° döngü: ${plc.join(" · ")}`);
    assert.ok(pl.flatMap((w) => w.passes).every((p) => p.cycleOf === 5), "Plüton 2023–2024 beş geçiş tek döngü ailesi (her ardışık çift arası tek istasyon)");
  });
  const s7 = () => run("S7-istasyon-sinir");
  await t("T07 teğetsel temas: Mars natal = istasyon + 0,3° (orb 1°) → orb'a girer, kesinleşmeden çıkar; en yakın ≈ 0,3° istasyon anında", () => {
    const stR = s7().events.find((e) => e.type === "station" && e.station === "retrograde")!.ms;
    const w = s7().windows.filter((x) => x.b === "st_disi" && (x.enterMs ?? 0) < stR && (x.exitMs ?? Infinity) > stR);
    assert.equal(w.length, 1);
    assert.equal(w[0].classification, "tangential");
    assert.ok(Math.abs(w[0].closest.separationDeg - 0.3) < 0.001, String(w[0].closest.separationDeg));
    const st = s7().events.find((e) => e.type === "station" && e.station === "retrograde")!;
    assert.ok(Math.abs(w[0].closest.ms - st.ms) < 2 * 3_600_000);
    assert.ok(s7().events.some((e) => e.type === "closest_approach" && e.other === "st_disi"));
  });
  await t("T08 istasyonda kesin açıya efemeris hatasından yakın (istasyon + 0,003° = 10,8″ < 20″) → passCountUncertain", () => {
    const stR = s7().events.find((e) => e.type === "station" && e.station === "retrograde")!.ms;
    const around = (id: string) => s7().windows.filter((x) => x.b === id && (x.enterMs ?? 0) < stR && (x.exitMs ?? Infinity) > stR);
    const w = around("st_hata");
    assert.equal(w.length, 1);
    assert.equal(w[0].flags.passCountUncertain, true);
    const ok = around("st_ici")[0];
    assert.equal(ok.passes.length, 2, "istasyon − 0,05° → istasyon çevresindeki pencerede iki geçiş");
    assert.equal(ok.flags.passCountUncertain, false);
    report.push(`T08 st_ici döngü: ${s7().windows.filter((x) => x.b === "st_ici").flatMap((x) => x.passes).map((p) => `${p.atUtc} ${p.cyclePass}/${p.cycleOf}${p.cycleClippedByRange ? " (aralık kesiyor)" : ""}`).join(" · ")}`);
  });
  await t("T09 orb sınırına hata kadar yakın uç değer: istasyon + 1,003° → pencere yok ama nearMisses'te; + 0,9° → teğetsel pencere, belirsiz değil", () => {
    const stR = s7().events.find((e) => e.type === "station" && e.station === "retrograde")!.ms;
    assert.equal(s7().windows.filter((x) => x.b === "orb_hata" && (x.enterMs ?? 0) < stR && (x.exitMs ?? Infinity) > stR).length, 0);
    assert.ok(s7().nearMisses.some((m) => m.pair === "mars>orb_hata" && Math.abs(m.ms - stR) < 3_600_000));
    const w = s7().windows.filter((x) => x.b === "orb_ici" && (x.enterMs ?? 0) < stR && (x.exitMs ?? Infinity) > stR);
    assert.equal(w.length, 1);
    assert.equal(w[0].classification, "tangential");
    assert.equal(w[0].flags.windowUncertain, false);
  });
  await t("T10 aralık başında zaten orb içinde / sonunda hâlâ orb içinde: enter/exit null, bayraklar doğru", () => {
    const base = { bodies: ["saturn"] as const, aspects: ["conjunction"] as const, defaultOrb: 1, include: { natal: true, mundane: false, stations: false, ingresses: false } };
    // Satürn 2025-04-27 natal 357,5° kavuşumu (T-S1); aralık kesinleşmenin ortasında başlıyor.
    const r = scanTransits({ ...base, bodies: [...base.bodies], aspects: [...base.aspects], natalPoints: [{ id: "x", lon: 357.5 }], startUtcMs: U(2025, 3, 25), endUtcMs: U(2025, 3, 30) }) as ScanResult;
    assert.equal(r.windows.length, 1);
    const w = r.windows[0];
    assert.equal(w.startsBeforeRange, true);
    assert.equal(w.endsAfterRange, true);
    assert.equal(w.enterMs, null);
    assert.equal(w.exitMs, null);
    assert.equal(w.classification, "single");
    assert.ok(!r.events.some((e) => e.type === "orb_enter" || e.type === "orb_exit"));
    const r2 = scanTransits({ ...base, bodies: [...base.bodies], aspects: [...base.aspects], natalPoints: [{ id: "x", lon: 357.5 }], startUtcMs: U(2025, 4, 1), endUtcMs: U(2025, 4, 3) }) as ScanResult;
    assert.equal(r2.windows[0].classification, "none_in_range");
  });
  await t("T11 0° Koç sürekliliği: Neptün natal 0,2° kavuşumu + Koç girişi (2025-03-30); natal 359,9° Ay geçişleri sarmalda kaçmaz", () => {
    const r = run("S1-dis-coklu");
    assert.ok(r.events.some((e) => e.type === "ingress" && e.body === "neptune" && e.toSign === "aries" && e.atUtc.startsWith("2025-03-30")));
    assert.ok(r.windows.some((w) => w.a === "neptune" && w.b === "a0" && w.aspect === "conjunction" && w.passes.length >= 1));
    const moon = run("S2-ay-yil").windows.filter((w) => w.a === "moon" && w.b === "n3599" && w.aspect === "conjunction");
    assert.ok(moon.length >= 13 && moon.length <= 14, String(moon.length));
    for (const w of moon) assert.equal(w.passes.length, 1);
  });
  await t("T12 aynı gün çoklu olay: S8 kronolojik sıra kesin, aynı gün ≥ 5 olaylı günler var, olay kimlikleri tekil", () => {
    const ev = run("S8-ay-hizli-gun").events;
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].ms >= ev[i - 1].ms);
    const perDay = new Map<string, number>();
    for (const e of ev) perDay.set(e.atUtc.slice(0, 10), (perDay.get(e.atUtc.slice(0, 10)) ?? 0) + 1);
    const maxDay = Math.max(...perDay.values());
    report.push(`T12 S8: ${ev.length} olay, en kalabalık gün ${maxDay} olay`);
    assert.ok(maxDay >= 5);
    const ids = run("S8-ay-hizli-gun").windows.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length);
  });
  await t("T13 saat dilimi / DST: UTC korunur; Berlin 2026-03-29 01:00Z yaz saati; İstanbul +03; New York; geçersiz → null", () => {
    assert.deepEqual(toLocalStamp(U(2026, 2, 29, 0, 59, 59), "Europe/Berlin"), { local: "2026-03-29 01:59:59", offset: "+01:00", timeZone: "Europe/Berlin" });
    assert.deepEqual(toLocalStamp(U(2026, 2, 29, 1, 0, 0), "Europe/Berlin"), { local: "2026-03-29 03:00:00", offset: "+02:00", timeZone: "Europe/Berlin" });
    assert.deepEqual(toLocalStamp(U(2026, 9, 25, 0, 59, 59), "Europe/Berlin")?.offset, "+02:00");
    assert.deepEqual(toLocalStamp(U(2026, 9, 25, 1, 0, 0), "Europe/Berlin"), { local: "2026-10-25 02:00:00", offset: "+01:00", timeZone: "Europe/Berlin" });
    assert.equal(toLocalStamp(U(2026, 6, 1, 12), "Europe/Istanbul")?.offset, "+03:00");
    assert.equal(toLocalStamp(U(2026, 0, 1, 12), "America/New_York")?.local, "2026-01-01 07:00:00");
    assert.equal(toLocalStamp(U(2026, 0, 1), "Mars/Olympus"), null);
    assert.equal(toLocalStamp(U(2026, 0, 1), "Europe/Istanbul; DROP"), null);
    // Ortak zaman yardımcısı (resolveAstroBirthTime: yerel → UTC) ile gidiş-dönüş: aynı tzdata, tarihsel yıllar dahil.
    for (const [date, time, tz] of [["1978-06-01", "12:00", "Europe/Istanbul"], ["1985-07-15", "08:30", "Europe/Istanbul"], ["2026-03-29", "03:30", "Europe/Berlin"], ["2026-11-01", "01:30", "America/New_York"], ["1999-12-31", "23:59", "Asia/Tokyo"], ["2026-06-21", "05:00", "Australia/Sydney"]] as const) {
      const r = resolveAstroBirthTime(date, time, tz, "earlier");
      assert.equal(r.kind, "ok", `${date} ${time} ${tz}`);
      if (r.kind !== "ok") continue;
      const back = toLocalStamp(Date.parse(r.utcIso), tz)!;
      assert.equal(back.local, `${date} ${time}:00`, `${tz} gidiş-dönüş`);
      const sign = r.offsetSeconds < 0 ? "-" : "+";
      const a = Math.abs(r.offsetSeconds);
      assert.equal(back.offset, `${sign}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}`);
    }
    const ev = withLocalTimes(run("S8-ay-hizli-gun").events.slice(0, 5), "Europe/Istanbul");
    for (const e of ev) assert.ok(e.local && e.atUtc.endsWith("Z"));
  });
  await t("T14 kök hassasiyeti: her kesin anda kalan açı hatası ≤ |göreli hız|·1 sn (+1e-7°)", () => {
    let worst = 0;
    for (const id of ["S1-dis-coklu", "S2-ay-yil", "S3-merkur-retro"]) {
      const sc = SCEN.find((x) => x.id === id)!;
      for (const w of run(id).windows) {
        for (const p of w.passes) {
          const natal = sc.natalPoints?.find((n) => n.id === w.b);
          const d = w.kind === "transit_natal" ? lonAt(w.a, p.ms) - natal!.lon : lonAt(w.a, p.ms) - lonAt(w.b as never, p.ms);
          const g = w.kind === "transit_natal" ? speedAt(w.a, p.ms) : speedAt(w.a, p.ms) - speedAt(w.b as never, p.ms);
          const res = Math.abs(wrap180(d - w.target));
          const lim = (Math.abs(g) * 1) / 86_400 + 1e-7;
          worst = Math.max(worst, res / lim);
          assert.ok(res <= lim, `${w.id} ${res}`);
        }
      }
    }
    report.push(`T14 kalan hata / sınır en kötü oran ${worst.toFixed(3)}`);
  });
  await t("T15 performans + maliyet: 10 yıl dış gezegen (S4) < 10 sn; Ay 400 gün × 8 natal nokta × 9 açı < 10 sn; sağlayıcı çağrısı 0", () => {
    const s4 = scanTransits(SCEN.find((x) => x.id === "S4-on-yil-dis")!) as ScanResult;
    const big = scanTransits({ startUtcMs: U(2026, 0, 1), endUtcMs: U(2026, 0, 1) + 400 * D, bodies: ["moon", "sun", "mercury", "venus", "mars"], natalPoints: [0, 45, 90, 135, 180, 225, 270, 315].map((l, i) => ({ id: `p${i}`, lon: l + 0.37 })), aspects: ["conjunction", "semi_sextile", "semi_square", "sextile", "square", "trine", "sesquiquadrate", "quincunx", "opposition"], defaultOrb: 1, include: { natal: true, mundane: true, stations: true, ingresses: true } }) as ScanResult;
    report.push(`T15 S4 10 yıl: ${s4.stats.ms} ms, ${s4.stats.evaluations} konum hesabı, ${s4.events.length} olay · Ay 400 gün geniş: ${big.stats.ms} ms, ${big.stats.evaluations} konum hesabı, ${big.events.length} olay, ${big.windows.length} pencere`);
    assert.ok(s4.stats.ms < 10_000 && big.stats.ms < 10_000, "makine yüküne duyarlı üst sınır (tipik 1–4 sn)");
    assert.equal(s4.source.providerCalls, 0);
    for (const f of ["scan.ts", "segments.ts", "model.ts", "display.ts"]) {
      const src = readFileSync(`lib/astrology/pro/transits/${f}`, "utf8");
      assert.ok(!/providers\/roxy|fetch\(|process\.env/.test(src), `${f} ağ/sağlayıcı/env erişimi içermemeli`);
    }
  });
  await t("T16 doğrulama: geçersiz aralık / yıl / gövde / açı / orb / natal / boş seçim / Ay uzun aralık reddi", () => {
    const ok: ScanRequest = { startUtcMs: U(2026, 0, 1), endUtcMs: U(2026, 1, 1), bodies: ["sun"], natalPoints: [{ id: "a", lon: 1 }], aspects: ["conjunction"], include: { natal: true, mundane: false, stations: false, ingresses: false } };
    const code = (r: ScanRequest) => {
      const o = scanTransits(r);
      return "error" in o ? o.error.code : "ok";
    };
    assert.equal(code(ok), "ok");
    assert.equal(code({ ...ok, endUtcMs: ok.startUtcMs }), "invalid_range");
    assert.equal(code({ ...ok, startUtcMs: U(1850, 0, 1) }), "out_of_years");
    assert.equal(code({ ...ok, bodies: ["chiron" as never] }), "invalid_body");
    assert.equal(code({ ...ok, aspects: ["novile" as never] }), "invalid_aspect");
    assert.equal(code({ ...ok, defaultOrb: 0 }), "invalid_orb");
    assert.equal(code({ ...ok, orbs: { conjunction: 30 } }), "invalid_orb");
    assert.equal(code({ ...ok, natalPoints: [{ id: "a b", lon: 1 }] }), "invalid_natal");
    assert.equal(code({ ...ok, natalPoints: [{ id: "a", lon: NaN }] }), "invalid_natal");
    assert.equal(code({ ...ok, natalPoints: [{ id: "a", lon: 1 }, { id: "a", lon: 2 }] }), "invalid_natal");
    assert.equal(code({ ...ok, include: { natal: false, mundane: false, stations: false, ingresses: false } }), "nothing_selected");
    assert.equal(code({ ...ok, bodies: ["moon"], endUtcMs: ok.startUtcMs + 500 * D }), "range_too_long");
    assert.equal(code({ ...ok, bodies: ["pluto"], endUtcMs: U(2060, 0, 1) }), "range_too_long");
  });
  // AŞAMA 2 (ortak zaman standardı, PR #647): Lilly çizelgesi DEĞİŞMEDİ ve astronomy-engine'in global Espenak–Meeus ΔT'siyle çalışır;
  // bu motor ortak katmanın TT'sini kullanır. Aynı efemeris → olaylar AYNI TT anında; UTC farkı TAM OLARAK ΔT politikası farkıdır:
  // Δt_beklenen = t_bu − t_Lilly = (TT−UT)_EM − (TT−UTC)_ortak (2024–2025: ≈ +5,6…+6,1 s). Test her olayda Δt'nin bu değere ±2 sn eşitliğini sınar
  // (eski ≤2 sn mutlak eşitlik, ΔT farkı giderildiği için tanım gereği geçersizdi; tolerans DEĞİŞMEDİ).
  const policyOffsetSec = (ms: number) => {
    const em = Astronomy.MakeTime(new Date(ms));
    const sc = scalesFromUtc(ms);
    if (isTimeScalesError(sc)) throw new Error(sc.error);
    return (em.tt - em.ut) * 86400 - (sc.ttMs - ms) / 1000;
  };
  const dtOk = (mineMs: number, lillyMs: number) => Math.abs((mineMs - lillyMs) / 1000 - policyOffsetSec(mineMs)) <= 2;
  let maxResid = 0;
  const resid = (mineMs: number, lillyMs: number) => (maxResid = Math.max(maxResid, Math.abs((mineMs - lillyMs) / 1000 - policyOffsetSec(mineMs))));
  await t("T17 mevcut Lilly olay çizelgesiyle tutarlılık (findPerfections / findStations / findIngresses, aynı efemeris): fark = ΔT politikası farkı ± 2 sn", () => {
    const t0 = U(2024, 0, 1);
    const t1 = U(2025, 11, 31);
    const r = run("S3-merkur-retro");
    const pairs: [string, string][] = [["sun", "mercury"], ["sun", "venus"], ["mercury", "venus"], ["mercury", "mars"], ["venus", "mars"], ["sun", "mars"]];
    let n = 0;
    for (const [a, b] of pairs) {
      const lil = findPerfections(a as never, b as never, t0, t1);
      const mine = r.windows.filter((w) => w.kind === "transit_transit" && w.a === a && w.b === b).flatMap((w) => w.passes.map((p) => ({ ms: p.ms, ang: w.target })));
      for (const p of lil) {
        const tgt = (360 + (((p.aLon - p.bLon) % 360) + 360) % 360) % 360;
        const m = mine.find((x) => dtOk(x.ms, p.ms) && Math.abs(wrap180(x.ang - tgt)) < 0.01);
        if (m) resid(m.ms, p.ms);
        assert.ok(m, `${a}-${b} ${p.atUtc} açı ${p.angle} bende yok`);
        n++;
      }
      assert.equal(mine.length, lil.length, `${a}-${b} sayı`);
    }
    for (const b of ["mercury", "venus", "mars"] as const) {
      const ls = findStations(b, t0, t1);
      const ms = r.events.filter((e) => e.type === "station" && e.body === b);
      assert.equal(ms.length, ls.length);
      ls.forEach((s, i) => { resid(ms[i].ms, s.ms); assert.ok(dtOk(ms[i].ms, s.ms)); });
      const li = findIngresses(b, t0, t1);
      const mi = r.events.filter((e) => e.type === "ingress" && e.body === b);
      assert.equal(mi.length, li.length);
      li.forEach((s, i) => { resid(mi[i].ms, s.ms); assert.ok(dtOk(mi[i].ms, s.ms)); });
      n += ls.length + li.length;
    }
    report.push(`T17 Lilly çizelgesiyle ${n} olay eşleşti (S3, 2024–2025): Δt = ΔT politikası farkı (${policyOffsetSec(U(2024, 0, 1)).toFixed(2)}…${policyOffsetSec(U(2025, 11, 31)).toFixed(2)} s), kalan en büyük ${maxResid.toFixed(2)} s ≤ 2 s`);
  });
  await t("T18 aspectStateAt + timeUncertaintySec sentetik", () => {
    assert.deepEqual(aspectStateAt(10, 1, 100, 0, "square"), { target: 270, orb: 0, applying: false });
    const s = aspectStateAt(88, 1, 0, 0, "square");
    assert.equal(s.target, 90);
    assert.ok(Math.abs(s.orb - 2) < 1e-9);
    assert.equal(s.applying, true);
    assert.equal(aspectStateAt(92, 1, 0, 0, "square").applying, false);
    assert.equal(aspectStateAt(92, -1, 0, 0, "square").applying, true);
    // 20″ hata, 1°/gün göreli hız → 20/3600 gün = 480 sn.
    assert.equal(timeUncertaintySec(20 / 3600, 1, 0), 480);
    // Göreli hız 0 (istasyon) → ikinci dereceden sınır √(2·δ/|a|) = √(2·(20/3600)/0,01) gün ≈ 91.066 sn.
    assert.ok(Math.abs(timeUncertaintySec(20 / 3600, 0, 0.01) - Math.sqrt((2 * 20) / 3600 / 0.01) * 86_400) < 1);
    assert.equal(timeUncertaintySec(20 / 3600, 0, 0), Number.POSITIVE_INFINITY);
  });

  await t("T19 pencere içi kesinleşmeyen yerel yaklaşma: Merkür–Mars üçgen 2025-04 (sağlayıcı bağımsız kaydı: en yakın 0,18°, 2025-04-12 01:15Z) orb 1° ile closest_approach olarak döner", () => {
    const r = scanTransits({ startUtcMs: U(2025, 3, 1), endUtcMs: U(2025, 4, 1), bodies: ["mercury", "mars"], aspects: ["trine"], defaultOrb: 1, include: { natal: false, mundane: true, stations: false, ingresses: false } }) as ScanResult;
    const ca = r.events.filter((e) => e.type === "closest_approach" && e.atUtc.startsWith("2025-04-12"));
    assert.equal(ca.length, 1);
    assert.ok(Math.abs(ca[0].separationDeg! - 0.18) < 0.012, String(ca[0].separationDeg));
    assert.ok(Math.abs(ca[0].ms - Date.parse("2025-04-12T01:15:00Z")) < 15 * 60_000);
    const w = r.windows.find((x) => x.id === ca[0].windowId)!;
    assert.equal(w.passes.length, 0);
    assert.equal(w.nearApproaches.length, 1);
  });

  console.log("\n— Rapor satırları —");
  for (const l of report) console.log(l);
  console.log(`\nastrology pro-transits (WT-04) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
