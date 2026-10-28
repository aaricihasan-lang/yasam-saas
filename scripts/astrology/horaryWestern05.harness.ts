/**
 * GÖKYÜZÜ ATLASI — H-08 (2026-10-29): Lilly ışık aktarımı KESİNTİ denetimi — bağımsız gerçek gökyüzü vakaları.
 * CA 1647 s. 111 ("separates from a more weighty one, and presently joynes to another more heavy") ve s. 125 ("doth apply to the
 * other Significator … before he meeteth with the ☌ or aspect of any other planet").
 * Beklentiler ÜRETİM FONKSİYONUNDAN TÜRETİLMEZ: Ay temasları bu dosyadaki ayrı kaba taramayla (astronomy-engine doğrudan, 5 dk adım,
 * doğrusal ara değer) bulunur; kabul beklentisi bu dosyada elle kodlanan ev sahipliği tablosundan gelir. Ücretli çağrı YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWestern05.harness.ts
 */
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";
import { analyzePair } from "@/lib/astrology/horary/western/timeline";
import { PROFILE_LILLY_1647, receptionsOf } from "@/lib/astrology/horary/western/calc";
import type { ClassicalPlanet } from "@/lib/astrology/horary/western/tables";

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
const w180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
const BODY: Record<string, Astronomy.Body> = { sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars, jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn };
const L = (b: string, ms: number) => Astronomy.Ecliptic(Astronomy.GeoVector(BODY[b], Astronomy.MakeTime(new Date(ms)), true)).elon;
const D = 86_400_000;

/** BAĞIMSIZ Ay temas taraması: 6 gezegen × 5 Ptolemaik açı, 5 dk adım, işaret değişimi + doğrusal ara değer. */
type Contact = { b: string; ang: number; ms: number };
function moonContacts(t0: number, t1: number): Contact[] {
  const STEP = 5 * 60_000;
  const out: Contact[] = [];
  for (const b of ["sun", "mercury", "venus", "mars", "jupiter", "saturn"]) for (const ang of [0, 60, 90, 120, 180]) for (const tg of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
    let pm = t0;
    let p = w180(L("moon", t0) - L(b, t0) - tg);
    for (let ms = t0 + STEP; ms <= t1; ms += STEP) {
      const c = w180(L("moon", ms) - L(b, ms) - tg);
      if (Math.sign(p) !== Math.sign(c) && Math.abs(p - c) < 90) out.push({ b, ang, ms: Math.round(pm + (p / (p - c)) * STEP) });
      p = c;
      pm = ms;
    }
  }
  return out.sort((x, y) => x.ms - y.ms);
}
/** Bağımsız beklenti: ayrılma (from ile son temas ≤ t0), birleşme (to ile ilk temas > t0) ve aradaki diğer temaslar. */
function expectSequence(t0: number, from: string, to: string, horizonDays: number) {
  const ev = moonContacts(t0 - 3 * D, t0 + horizonDays * D);
  const sep = ev.filter((e) => e.b === from && e.ms <= t0).at(-1) ?? null;
  const join = ev.find((e) => e.b === to && e.ms > t0) ?? null;
  const between = sep && join ? ev.filter((e) => e.ms > sep.ms + 60_000 && e.ms < join.ms - 60_000) : [];
  return { sep, join, between };
}
const moonTr = (a: ClassicalPlanet, b: ClassicalPlanet, iso: string, horizon: number, from: string, to: string, rec: (g: number, h: ClassicalPlanet) => string[] = () => []) =>
  analyzePair(a, b, Date.parse(iso), horizon, rec).translations.find((x) => x.by === "moon" && x.from === from && x.to === to);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16);
// Elle kodlanan klasik ev sahipliği (kabul beklentisi için; tables.ts KULLANILMAZ).
const DOMICILE_SIGNS: Record<string, number[]> = { saturn: [9, 10], jupiter: [8, 11], mars: [0, 7], sun: [4], venus: [1, 6], mercury: [2, 5], moon: [3] };
const signIdx = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);

async function main() {
  await t("X1 kesintisiz GEÇERLİ aktarım (gerçek gökyüzü): 2026-01-05 12:00Z ☽ ♄'den ayrılır (4 Oca, 120°) ve ilk teması ☿ (7 Oca, 120°) — bağımsız taramada arada temas YOK → status=valid, introduction=true, interruptions boş; ayrılma/birleşme anları ±3 dk", () => {
    const iso = "2026-01-05T12:00:00Z";
    const exp = expectSequence(Date.parse(iso), "saturn", "mercury", 10);
    assert.ok(exp.sep && exp.join && exp.between.length === 0, JSON.stringify(exp));
    const tr = moonTr("saturn", "mercury", iso, 10, "saturn", "mercury");
    assert.ok(tr, "kayıt bulunmalı");
    assert.deepEqual([tr!.status, tr!.introduction, tr!.interruptions.length], ["valid", true, 0]);
    assert.ok(Math.abs(Date.parse(tr!.separatedAt) - exp.sep!.ms) <= 3 * 60_000 && Math.abs(Date.parse(tr!.joinsAt) - exp.join!.ms) <= 3 * 60_000);
    console.log(`  bilgi: ayrılma ${fmt(exp.sep!.ms)} (${exp.sep!.ang}°) → birleşme ${fmt(exp.join!.ms)} (${exp.join!.ang}°)`);
  });

  await t("X2 SORU ANINDAN ÖNCE kesinti: 2026-01-03 11:00Z ☽ ♀'den ayrılır (08:40) → ☉ ☍ (10:02, soru anından önce) → ♂ (12:37) — status=interrupted, kesinti kanıtı ☉ 180°, introduction=false, judgement.ok=false", () => {
    const iso = "2026-01-03T11:00:00Z";
    const exp = expectSequence(Date.parse(iso), "venus", "mars", 3);
    assert.deepEqual(exp.between.map((e) => `${e.b}:${e.ang}`), ["sun:180"]);
    assert.ok(exp.between[0].ms < Date.parse(iso));
    const tr = moonTr("venus", "mars", iso, 3, "venus", "mars", () => ["domicile"]);
    assert.ok(tr);
    assert.deepEqual([tr!.status, tr!.introduction, tr!.judgement.ok], ["interrupted", false, false]);
    assert.deepEqual(tr!.interruptions.map((i) => `${i.with}:${i.angle}`), ["sun:180"]);
    assert.ok(Math.abs(Date.parse(tr!.interruptions[0].atUtc) - exp.between[0].ms) <= 3 * 60_000 && !tr!.interruptions[0].orderUncertain);
  });

  await t("X3 SORU ANINDAN SONRA, ikinci kesinleşmeden önce kesinti: aynı dizi, soru anı 09:00Z (☉ ☍ 10:02 soru anından SONRA) — status=interrupted; önceki sürüm bu kaydı hiç üretmiyordu, şimdi kesinti kanıtıyla bilgi kaydı", () => {
    const iso = "2026-01-03T09:00:00Z";
    const exp = expectSequence(Date.parse(iso), "venus", "mars", 3);
    assert.deepEqual(exp.between.map((e) => `${e.b}:${e.ang}`), ["sun:180"]);
    assert.ok(exp.between[0].ms > Date.parse(iso));
    const tr = moonTr("venus", "mars", iso, 3, "venus", "mars");
    assert.ok(tr);
    assert.deepEqual([tr!.status, tr!.introduction], ["interrupted", false]);
    assert.ok(Date.parse(tr!.interruptions[0].atUtc) > Date.parse(iso));
  });

  await t("X4 KABUL SAĞLANAN geçerli aktarım: 2026-01-18 18:00Z ☽ ♄'den ayrılır (17:21) → ilk temas ☉ (19:52), arada temas yok; ☽ soru anında Satürn'ün ev burcunda (bağımsız tablo: Oğlak/Kova) → receivedBy 'domicile' içerir, judgement.ok=true", () => {
    const iso = "2026-01-18T18:00:00Z";
    const ms = Date.parse(iso);
    const exp = expectSequence(ms, "saturn", "sun", 3);
    assert.ok(exp.sep && exp.join && exp.between.length === 0, JSON.stringify(exp.between));
    assert.ok(DOMICILE_SIGNS.saturn.includes(signIdx(L("moon", ms))), "Ay Satürn'ün evinde olmalı (bağımsız)");
    const tr = moonTr("saturn", "sun", iso, 3, "saturn", "sun", (g, h) => receptionsOf(g, h, true, PROFILE_LILLY_1647) as string[]);
    assert.ok(tr);
    assert.deepEqual([tr!.status, tr!.introduction, tr!.judgement.significatorsSeparated], ["valid", true, true]);
    assert.ok(tr!.judgement.receivedBy.includes("domicile") && tr!.judgement.ok === true);
  });

  await t("X5 KABUL SAĞLANMAYAN geçerli aktarım: 2026-01-03 11:00Z ☽ ☉'ten ayrılır (10:02) → ilk temas ♂ (12:37), arada temas yok; ☽ Yengeç'te — Güneş'in orada ev/üçlü/terim asaleti yok (bağımsız: Güneş evi Aslan, üçlüsü ateş, terimi yok) → receivedBy boş, judgement.ok=false, introduction=true", () => {
    const iso = "2026-01-03T11:00:00Z";
    const ms = Date.parse(iso);
    const exp = expectSequence(ms, "sun", "mars", 3);
    assert.ok(exp.sep && exp.join && exp.between.length === 0);
    const sg = signIdx(L("moon", ms));
    assert.ok(!DOMICILE_SIGNS.sun.includes(sg) && ![0, 4, 8].includes(sg), "Ay Güneş'in evinde ya da ateş burcunda olmamalı");
    const tr = moonTr("sun", "mars", iso, 3, "sun", "mars", (g, h) => receptionsOf(g, h, true, PROFILE_LILLY_1647) as string[]);
    assert.ok(tr);
    assert.deepEqual([tr!.status, tr!.introduction, tr!.judgement.receivedBy, tr!.judgement.ok], ["valid", true, [], false]);
  });

  await t("X6 ilk açı var, ikinci açı ufuk içinde YOK: X1 dizisi 1 günlük ufukla (☽–☿ 120° birleşmesi 7 Oca 08:01 ufuk dışında — bağımsız tarama) → aktarım kaydı üretilmez", () => {
    const iso = "2026-01-05T12:00:00Z";
    const exp = expectSequence(Date.parse(iso), "saturn", "mercury", 1);
    assert.ok(exp.sep && exp.join === null);
    assert.equal(moonTr("saturn", "mercury", iso, 1, "saturn", "mercury"), undefined);
  });

  await t("X7 NEREDEYSE EŞZAMANLI temaslar: 2026-01-08 01:20Z ☽ ☉'ten ayrılır (01:04); ☽△♀ (01:43) ile ☽△♂ birleşmesi (01:46) arası bağımsız taramada ≈2–3 dk → geçerli aktarım ÜRETİLMEZ (status interrupted ya da order_uncertain; introduction=false)", () => {
    const iso = "2026-01-08T01:20:00Z";
    const exp = expectSequence(Date.parse(iso), "sun", "mars", 2);
    assert.ok(exp.join && exp.between.some((e) => e.b === "venus" && Math.abs(e.ms - exp.join!.ms) <= 5 * 60_000), JSON.stringify(exp));
    const tr = moonTr("sun", "mars", iso, 2, "sun", "mars");
    assert.ok(tr);
    assert.ok(tr!.status === "interrupted" || tr!.status === "order_uncertain");
    assert.equal(tr!.introduction, false);
    const v = tr!.interruptions.find((i) => i.with === "venus")!;
    console.log(`  bilgi: ☽△♀ ${v.atUtc} ↔ birleşme ${tr!.joinsAt} · status=${tr!.status} · orderUncertain=${v.orderUncertain}`);
  });

  console.log(`\nastrology horary-western-05 (H-08 ışık aktarımı) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
