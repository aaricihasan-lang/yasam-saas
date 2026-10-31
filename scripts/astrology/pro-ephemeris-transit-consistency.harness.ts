/**
 * GÖKYÜZÜ ATLASI — B2 (AŞAMA 4): Profesyonel Efemeris (#645, lib/astrology/pro/ephemeris) ↔ İleri Transit (#646,
 * lib/astrology/pro/transits) AYNI FİZİKSEL OLAY tutarlılığı. Ağ / Roxy / Python GEREKMEZ (CI `astro-pro` işinde koşar).
 *
 * Neden ayrı test: iki motor ortak zaman katmanını (#647) kullanır ama AYRI konum fonksiyonu ve AYRI kök çözücüyle olay bulur.
 * Yalnız birbirleriyle kıyaslamak "aynı hesabı iki kez çağırmak" olabilirdi → her olay BAĞIMSIZ JPL DE440 referansına
 * (fixtures/pro-consistency/ref-*.json; skyfield 1.55 + DE440, Python, fixtures/pro-transits/de440_ref_v2.py — motor çıktısından
 * DEĞİL) çapalanır ve iki motorun olayı AYNI referans olayına eşlenmek zorundadır.
 *
 * BAĞIMLILIK: her iki motor da statik import edilir. Biri yoksa modül çözümlenemez → süreç sıfırdan farklı çıkar → pro-run-all
 * FAIL (sessiz SKIP / sahte PASS YOK). Bu dosya yalnız #647 + #645 + #646 birlikte bulunan dalda anlamlıdır (entegrasyon dalı;
 * main'de üç PR merge edildikten sonra).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-ephemeris-transit-consistency.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findIngresses, findStations } from "@/lib/astrology/pro/ephemeris/events";
import { scanTransits } from "@/lib/astrology/pro/transits/scan";
import { lonAt } from "@/lib/astrology/pro/transits/model";
import { isTimeScalesError, scalesFromUtc } from "@/lib/astrology/pro/time";
import { SIGNS } from "@/lib/astrology/horary/western/tables";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack ?? String(e)}\n`);
  }
}
const olcu = (s: string) => console.log(`  ÖLÇÜ ${s}`);

const FX = join(process.cwd(), "scripts/astrology/fixtures/pro-consistency");
type Win = { id: string; startUtcMs: number; endUtcMs: number; bodies: string[] };
const WINS = JSON.parse(readFileSync(join(FX, "windows.json"), "utf8")) as Win[];
type RefEv = { type: "ingress" | "station"; key: string; ms: number; level?: number; dir?: number; station?: string };
type Ev = { type: "ingress" | "station"; body: string; k: string; ms: number; unc: number };

/** Kimlik anahtarı: tür + gövde + (ingress: geçilen burç sınırı derecesi + yön | istasyon: tür). */
const kIngress = (body: string, level: number, dir: number) => `ingress|${body}|${level}|${dir}`;
const kStation = (body: string, kind: string) => `station|${body}|${kind}`;
const refEvents = (w: Win): Ev[] =>
  (JSON.parse(readFileSync(join(FX, `ref-${w.id}.json`), "utf8")).events as RefEv[]).map((e) => ({
    type: e.type,
    body: e.key,
    k: e.type === "ingress" ? kIngress(e.key, e.level!, e.dir!) : kStation(e.key, e.station!),
    ms: e.ms,
    unc: 0,
  }));
/** #645: toSign/fromSign burç İNDEKSİ (0 = Koç). İleri: girilen burcun başı; geri: terk edilen burcun başı. */
const ephemerisEvents = (w: Win): Ev[] =>
  w.bodies.flatMap((b) => [
    ...findIngresses(b as never, w.startUtcMs, w.endUtcMs).map((e) => {
      const x = e as { body: string; ms: number; fromSign: number; toSign: number; retrograde: boolean; uncertaintySec: number };
      return { type: "ingress" as const, body: x.body, k: kIngress(x.body, (x.retrograde ? x.fromSign : x.toSign) * 30, x.retrograde ? -1 : 1), ms: x.ms, unc: x.uncertaintySec };
    }),
    ...findStations(b as never, w.startUtcMs, w.endUtcMs).map((e) => {
      const x = e as { body: string; ms: number; direction: string; uncertaintySec: number };
      return { type: "station" as const, body: x.body, k: kStation(x.body, x.direction), ms: x.ms, unc: x.uncertaintySec };
    }),
  ]);
/** #646: fromSign/toSign burç KİMLİĞİ ("aries" …) → indeks. */
function transitRun(w: Win) {
  const r = scanTransits({ startUtcMs: w.startUtcMs, endUtcMs: w.endUtcMs, bodies: w.bodies as never, aspects: ["conjunction"], include: { natal: false, mundane: false, stations: true, ingresses: true } });
  if ("error" in r) throw new Error(`${w.id}: ${r.error.code}`);
  return r;
}
const transitEvents = (r: ReturnType<typeof transitRun>): Ev[] =>
  r.events
    .filter((e) => e.type === "ingress" || e.type === "station")
    .map((e) => {
      const x = e as unknown as { type: string; body: string; ms: number; uncertaintySec: number; fromSign?: string; toSign?: string; retrograde?: boolean; station?: string };
      if (x.type === "station") return { type: "station" as const, body: x.body, k: kStation(x.body, x.station!), ms: x.ms, unc: x.uncertaintySec };
      const idx = SIGNS.indexOf((x.retrograde ? x.fromSign : x.toSign) as never);
      return { type: "ingress" as const, body: x.body, k: kIngress(x.body, idx * 30, x.retrograde ? -1 : 1), ms: x.ms, unc: x.uncertaintySec };
    });

/** DE440/skyfield görünür konumu Güneş diskinin arkasında ışık sapmasıyla sahte hız dönüşü üretir (T04 ile aynı kural). */
const isRefArtifact = (e: Ev) => e.type === "station" && Math.abs(((lonAt(e.body as never, e.ms) - lonAt("sun", e.ms) + 540) % 360) - 180) < 1;

/** Anahtarı aynı, henüz kullanılmamış, en yakın referans. Arama yarıçapı = max(1 sa, olayın KENDİ belirsizliği + 2 s): dış gezegenlerde
 *  model hatası saatlerdir (Neptün ingress ≈ 3,2 sa; 09 raporu §4) — yarıçap eşleşmeyi bulur, doğruluk kapısı ayrı testtedir. Yoksa -1. */
function matchToRef(evs: Ev[], ref: Ev[]): number[] {
  const used = new Set<number>();
  return [...evs.keys()]
    .sort((a, b) => evs[a].ms - evs[b].ms)
    .reduce((out, i) => {
      let bi = -1;
      let bd = Infinity;
      ref.forEach((r, j) => {
        if (used.has(j) || r.k !== evs[i].k) return;
        const d = Math.abs(r.ms - evs[i].ms);
        if (d < bd && d <= Math.max(3_600_000, ((Number.isFinite(evs[i].unc) ? evs[i].unc : 0) + 2) * 1000)) {
          bd = d;
          bi = j;
        }
      });
      if (bi >= 0) used.add(bi);
      out[i] = bi;
      return out;
    }, new Array<number>(evs.length).fill(-1));
}
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// Toleranslar (ölçü ve kaynak):
//  • |t645 − t646| ≤ 1 s: iki kök çözücünün hassasiyeti ≤ 1 s (Lilly/#646 ROOT_PRECISION_SEC = 1); ölçülen en büyük fark AŞAMA 2'de 0,00 s.
//  • |t − tDE440| ≤ olayın KENDİ beyan ettiği belirsizlik + 2 s (#645 ve #646'nın kendi DE440 testleriyle AYNI kural).
//  • Ay ingress işaretli medyanı (her motor, her pencere, n ≥ 10): |·| ≤ 3,0 s 1950 ve sonrası (#646 T04S ile aynı kapı; ölçülen en büyük
//    1,8 s). 1950 öncesi Ay model hatası ≈ 2 kat (#646 3.000 örnek ölçüsü: 1900–1950 5,72″ ↔ 1950–2050 2,94″) → kapı aynı oranla 6,0 s
//    (ölçülen 1900: −4,14 s). 1900'de eski/yeni ΔT farkı yalnız −0,8 s olduğundan bu pencerede sistematik kapı model sınırlıdır.
const TOL = { crossSec: 1, refExtraSec: 2, moonMedianSec: 3.0, moonMedianPre1950Sec: 6.0, minN: 10 } as const;
// Dönemin zaman politikası (ortak katman `scalesFromUtc` basis'i ve #646 sonucunun timeScale işaretleri).
const EXPECT: Record<string, { basis: string; flag: string }> = {
  C1900: { basis: "pre1961_civil_ut", flag: "pre1961_civil_time_as_ut" },
  C1950: { basis: "pre1961_civil_ut", flag: "pre1961_civil_time_as_ut" },
  "C1972-artik-saniye": { basis: "utc_leap_table", flag: "dut1_assumed_zero" },
  C2000: { basis: "utc_leap_table", flag: "dut1_assumed_zero" },
  "C2017-artik-saniye": { basis: "utc_leap_table", flag: "dut1_assumed_zero" },
  C2026: { basis: "utc_leap_table", flag: "dut1_assumed_zero" },
  C2050: { basis: "beyond_leap_table", flag: "future_delta_t_predicted" },
  C2100: { basis: "beyond_leap_table", flag: "future_delta_t_predicted" },
};

let totalRef = 0;
let totalPairs = 0;
let worstCross = 0;
for (const w of WINS) {
  const ref = refEvents(w);
  const artifacts = ref.filter(isRefArtifact);
  const refPhys = ref.filter((e) => !isRefArtifact(e));
  const eph = ephemerisEvents(w);
  const tr = transitRun(w);
  const trn = transitEvents(tr);
  const mE = matchToRef(eph, refPhys);
  const mT = matchToRef(trn, refPhys);

  t(`B2 ${w.id}: olay KÜMESİ — DE440 = #645 = #646 (tür, gövde, burç sınırı, yön / istasyon türü; sayı ve kimlik)`, () => {
    const count = (a: Ev[]) => a.reduce<Record<string, number>>((m, e) => ((m[e.k] = (m[e.k] ?? 0) + 1), m), {});
    assert.deepEqual(count(eph), count(refPhys), `#645 ≠ DE440 (artefakt ${artifacts.length})`);
    assert.deepEqual(count(trn), count(refPhys), "#646 ≠ DE440");
    assert.ok(mE.every((j) => j >= 0) && mT.every((j) => j >= 0), "1 sa içinde referansa eşlenmeyen motor olayı var");
    assert.equal(new Set(mE).size, refPhys.length);
    assert.equal(new Set(mT).size, refPhys.length);
  });

  t(`B2 ${w.id}: AYNI FİZİKSEL OLAY — #645 ve #646 her referans olayına birer olayla eşlenir; |t645 − t646| ≤ ${TOL.crossSec} s`, () => {
    const byRef645 = new Map(mE.map((j, i) => [j, eph[i]]));
    const byRef646 = new Map(mT.map((j, i) => [j, trn[i]]));
    let mx = 0;
    for (let j = 0; j < refPhys.length; j++) {
      const a = byRef645.get(j);
      const b = byRef646.get(j);
      assert.ok(a && b, `${refPhys[j].k} ${new Date(refPhys[j].ms).toISOString()} iki motorda birden yok`);
      mx = Math.max(mx, Math.abs(a.ms - b.ms) / 1000);
    }
    worstCross = Math.max(worstCross, mx);
    totalRef += refPhys.length;
    totalPairs += byRef645.size;
    olcu(`${w.id}: DE440 ${refPhys.length} olay (Güneş-arkası artefakt ${artifacts.length}) · eşleşen çift ${byRef645.size} · en büyük |t645 − t646| ${mx.toFixed(3)} s`);
    assert.ok(mx <= TOL.crossSec, `|t645 − t646| ${mx} s`);
  });

  t(`B2 ${w.id}: her iki motor DE440'a karşı KENDİ belirsizliği + ${TOL.refExtraSec} s içinde; Ay ingress işaretli medyanı ≤ ${new Date(w.startUtcMs).getUTCFullYear() < 1950 ? TOL.moonMedianPre1950Sec : TOL.moonMedianSec} s`, () => {
    const over: string[] = [];
    const lines: string[] = [];
    for (const [name, evs, m] of [["#645", eph, mE], ["#646", trn, mT]] as const) {
      const moon: number[] = [];
      evs.forEach((e, i) => {
        const r = refPhys[m[i]];
        const d = (e.ms - r.ms) / 1000;
        if (!(Math.abs(d) <= e.unc + TOL.refExtraSec)) over.push(`${name} ${e.k} Δ${d.toFixed(1)} s > ${(e.unc + TOL.refExtraSec).toFixed(1)}`);
        if (e.body === "moon" && e.type === "ingress") moon.push(d);
      });
      const mm = med(moon);
      lines.push(`${name} Ay ingress n=${moon.length} işaretli medyan ${mm.toFixed(2)} s`);
      const lim = new Date(w.startUtcMs).getUTCFullYear() < 1950 ? TOL.moonMedianPre1950Sec : TOL.moonMedianSec;
      if (moon.length >= TOL.minN && !(Math.abs(mm) <= lim)) over.push(`${name} Ay ingress medyanı ${mm.toFixed(2)} s > ±${lim} s`);
    }
    olcu(`${w.id}: ${lines.join(" · ")}`);
    assert.deepEqual(over, [], over.slice(0, 6).join(" | "));
  });

  t(`B2 ${w.id}: zaman standardı — ortak katman basis '${EXPECT[w.id].basis}', #646 timeScale işareti '${EXPECT[w.id].flag}'`, () => {
    const s = scalesFromUtc(w.startUtcMs, { pre1961: "civil_as_ut" });
    assert.ok(!isTimeScalesError(s) && s.basis === EXPECT[w.id].basis, `basis ${isTimeScalesError(s) ? s.error : s.basis}`);
    assert.ok(tr.timeScale.policy === "lib/astrology/pro/time" && tr.timeScale.assumptions.includes(EXPECT[w.id].flag as never), JSON.stringify(tr.timeScale));
  });
}

t(`B2 KAPSAM: 8 pencere (1900, 1950, 1972 artık saniye, 2000, 2016–17 artık saniye, 2026, 2050, 2100), ≥ 500 fiziksel olay`, () => {
  assert.equal(WINS.length, 8);
  olcu(`toplam DE440 fiziksel olay ${totalRef} · iki motorda eşleşen ${totalPairs} · en büyük |t645 − t646| ${worstCross.toFixed(3)} s`);
  assert.ok(totalRef >= 500 && totalPairs === totalRef);
});

console.log(`\nSONUÇ pro-ephemeris-transit-consistency: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
