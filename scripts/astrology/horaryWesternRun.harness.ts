/**
 * GÖKYÜZÜ ATLASI — Batı Horary ürün çalıştırıcısı (lib/astrology/horary/westernRun.ts) — istek doğrulama, yerel saat → UTC,
 * gösterge seçimi, olay çizelgesi ve önizleme bayrağı. Beklentiler elle kodlanır (ev yöneticisi tablosu, saat dilimi ofsetleri);
 * üretim fonksiyonundan türetilmez. Ağ / veritabanı / ücretli çağrı YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWesternRun.harness.ts
 */
import assert from "node:assert/strict";
import { parseWesternHoraryBody, runWesternHorary, HORARY_HORIZON_DAYS } from "@/lib/astrology/horary/westernRun";
import { isWesternHoraryPreviewEnabled } from "@/lib/astrology/horary/westernPreview";

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
const IST = { label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const BER = { label: "Berlin, Almanya", timezone: "Europe/Berlin", latitude: 52.52, longitude: 13.405 };
// Elle kodlanan klasik ev yöneticileri (tables.ts KULLANILMAZ).
const RULER = ["mars", "venus", "mercury", "moon", "sun", "mercury", "venus", "mars", "jupiter", "saturn", "saturn", "jupiter"];
const rulerOf = (lon: number) => RULER[Math.floor((((lon % 360) + 360) % 360) / 30)];

t("R1 istek doğrulama: eksik/bozuk tarih, saat, konum ve 2–12 dışı ev → INVALID_INPUT ve doğru alan", () => {
  const ok = { date: "2026-10-29", time: "14:30", locationId: "tr-34-istanbul", quesitedHouse: 7 };
  assert.equal(parseWesternHoraryBody(ok).ok, true);
  const field = (b: unknown) => {
    const r = parseWesternHoraryBody(b);
    assert.equal(r.ok, false);
    return !r.ok && r.error.code === "INVALID_INPUT" ? r.error.field : null;
  };
  assert.equal(field({ ...ok, date: "29.10.2026" }), "date");
  assert.equal(field({ ...ok, time: "2pm" }), "time");
  assert.equal(field({ ...ok, locationId: "" }), "place");
  assert.equal(field({ ...ok, quesitedHouse: 1 }), "quesitedHouse");
  assert.equal(field({ ...ok, quesitedHouse: 13 }), "quesitedHouse");
  assert.equal(field({ ...ok, quesitedHouse: "7" }), "quesitedHouse");
  assert.equal(field(null), "date");
});

t("R2 DEMO girdisi (İstanbul 2026-10-29 14:30, 7. ev): UTC 11:30Z (GMT+3); soran = ASC burcunun yöneticisi, sorulan = 7. ev başlangıcı burcunun yöneticisi (bağımsız tablo); 7 gezegen, 12 ev", () => {
  const r = runWesternHorary({ date: "2026-10-29", time: "14:30", place: IST, quesitedHouse: 7 });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.error));
  const x = r.result;
  assert.equal(x.question.utc, "2026-10-29T11:30:00Z");
  assert.equal(x.question.offsetSeconds, 3 * 3600);
  assert.equal(x.chart.planets.length, 7);
  assert.equal(x.chart.cusps.length, 12);
  assert.equal(x.significators.querent, rulerOf(x.chart.cusps[0]));
  assert.equal(x.significators.quesited, rulerOf(x.chart.cusps[6]));
  assert.deepEqual(x.pairs.map((p) => p.role), x.significators.sameRuler ? ["moon_lordN"] : ["lord1_lordN", "moon_lordN"]);
});

t("R3 yaz saati: Berlin 2026-03-29 02:30 yaşanmadı → TIME_GAP; 2026-10-25 02:30 iki kez → TIME_AMBIGUOUS (2 seçenek, +2/+1 sa); dst=earlier → 00:30Z, dst=later → 01:30Z", () => {
  const gap = runWesternHorary({ date: "2026-03-29", time: "02:30", place: BER, quesitedHouse: 7 });
  assert.ok(!gap.ok && gap.error.code === "TIME_GAP");
  const amb = runWesternHorary({ date: "2026-10-25", time: "02:30", place: BER, quesitedHouse: 7 });
  assert.ok(!amb.ok && amb.error.code === "TIME_AMBIGUOUS");
  assert.deepEqual(!amb.ok && amb.error.code === "TIME_AMBIGUOUS" ? amb.error.options.map((o) => o.offsetSeconds) : [], [7200, 3600]);
  const e = runWesternHorary({ date: "2026-10-25", time: "02:30", place: BER, quesitedHouse: 7, dst: "earlier" });
  const l = runWesternHorary({ date: "2026-10-25", time: "02:30", place: BER, quesitedHouse: 7, dst: "later" });
  assert.ok(e.ok && l.ok);
  assert.deepEqual([e.ok && e.result.question.utc, l.ok && l.result.question.utc, e.ok && e.result.question.dstResolved], ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", true]);
});

t("R4 kutup bölgesi (Tromsø 69,65°K > 90° − ε) → POLAR_LATITUDE; harita üretilmez", () => {
  const r = runWesternHorary({ date: "2026-10-29", time: "12:00", place: { label: "Tromsø", timezone: "Europe/Oslo", latitude: 69.65, longitude: 18.96 }, quesitedHouse: 7 });
  assert.ok(!r.ok && r.error.code === "POLAR_LATITUDE", JSON.stringify(r.ok ? "ok" : r.error));
});

t("R5 aralık dışı tarih (1700) → OUT_OF_RANGE", () => {
  const r = runWesternHorary({ date: "1700-01-01", time: "12:00", place: IST, quesitedHouse: 7 });
  assert.ok(!r.ok && r.error.code === "OUT_OF_RANGE");
});

t("R6 olay çizelgesi: sıralı, tamamı (soru anı, soru anı + ufuk] içinde, aynı an+gövde tek satır, kesintili aktarım ana çizelgede YOK", () => {
  const r = runWesternHorary({ date: "2026-10-29", time: "14:30", place: IST, quesitedHouse: 7 });
  assert.ok(r.ok);
  const q = Date.parse(r.result.question.utc);
  const ms = r.result.timeline.map((e) => Date.parse(e.atUtc));
  assert.ok(ms.length > 0);
  assert.ok(ms.every((m, i) => m > q && m <= q + HORARY_HORIZON_DAYS * 86_400_000 && (i === 0 || m >= ms[i - 1])));
  const keys = r.result.timeline.map((e) => `${e.atUtc}|${[...e.bodies].sort().join()}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(r.result.timeline.every((e) => e.tags.every((g) => !(g.kind === "translation_join" && g.note === "interrupted"))));
  // Motorun kesintili kayıtları ileri ayrıntı için yanıtta korunur.
  assert.ok(r.result.pairs.some((p) => p.analysis.translations.some((x) => x.status === "interrupted")));
});

t("R7 soran = sorulan aynı gezegen (ASC ile seçilen ev başlangıcı aynı yöneticinin burçlarında) → sameRuler, gösterge çifti analizi YOK, Ay çifti var", () => {
  const base = runWesternHorary({ date: "2026-10-29", time: "14:30", place: IST, quesitedHouse: 7 });
  assert.ok(base.ok);
  const c = base.result.chart.cusps;
  const h = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].find((n) => rulerOf(c[n - 1]) === rulerOf(c[0]) && rulerOf(c[0]) !== "moon");
  assert.ok(h, "bu haritada aynı yöneticili ev bulunmalı");
  const r = runWesternHorary({ date: "2026-10-29", time: "14:30", place: IST, quesitedHouse: h! });
  assert.ok(r.ok);
  assert.equal(r.result.significators.sameRuler, true);
  assert.deepEqual(r.result.pairs.map((p) => p.role), ["moon_lordN"]);
  console.log(`  bilgi: ${h}. ev yöneticisi = soran (${rulerOf(c[0])})`);
});

t("R8 önizleme bayrağı: tanımsız / '0' / 'true' → KAPALI; yalnız '1' → açık", () => {
  const prev = process.env.NEXT_PUBLIC_ATLAS_HORARY_PREVIEW;
  try {
    delete process.env.NEXT_PUBLIC_ATLAS_HORARY_PREVIEW;
    assert.equal(isWesternHoraryPreviewEnabled(), false);
    for (const v of ["0", "true", ""]) {
      process.env.NEXT_PUBLIC_ATLAS_HORARY_PREVIEW = v;
      assert.equal(isWesternHoraryPreviewEnabled(), false, v);
    }
    process.env.NEXT_PUBLIC_ATLAS_HORARY_PREVIEW = "1";
    assert.equal(isWesternHoraryPreviewEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_ATLAS_HORARY_PREVIEW;
    else process.env.NEXT_PUBLIC_ATLAS_HORARY_PREVIEW = prev;
  }
});

console.log(`\nastrology horary-western-run (ürün çalıştırıcısı) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
