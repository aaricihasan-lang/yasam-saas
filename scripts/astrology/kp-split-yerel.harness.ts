/**
 * ATL-P2-03 YEREL KP NUMARASI (2026-10-23) harness'i. Gerçek sağlayıcı / DB YOK — yalnız kayıtlı GERÇEK yanıtlar + sentetik noktalar.
 *   A  KP tablosu kesinliği: 249 satır sınırları 1/9° katı (tam sayı aritmetiği) · bölünmüş 6 sub
 *   B  gerçek yanıtlar (Mars 2036, Ay KP23, Ay KP229): bölünmüş sub 2. parçasındaki yanlış numara tablodan DÜZELTİLİR + işaretlenir
 *   C  gerçek Merkür geri giriş (64→62): yeni KP tablodan 63'e düzeltilir + işaretlenir; zincir sürer
 *   D  fail-closed korunur: lord uyuşmazlığı, ±2 numara, 1. parçada yanlış numara, sınır dışı boylam → RED
 *   E  6 bölünmüş sub × 2. parça boyunca 400 nokta (ileri/geri) → düzeltilen numara tabloyla birebir; 1. parça dokunulmaz
 *   F  doğru numaralı yanıt: işaret YOK (önceki davranış birebir) · ekran/rapor etiketi ve notu
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/kp-split-yerel.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectKpPoint, projectRoxyKpPlanetsAt, projectRoxyKpPlanetsRange, projectRoxyKpSublordChanges } from "@/lib/astrology/providers/roxy/kp";
import { kpTable } from "@/lib/astrology/verify/kpSub";
import { KP_NUMBER_LOCAL_NOTE, kpNumberLabel } from "@/lib/astrology/model/kp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const GOLD = join(__dirname, "fixtures", "golden");
const G = (n: string) => JSON.parse(readFileSync(join(GOLD, `${n}.json`), "utf8")) as { body: J; response: J };
let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
const SPLIT_FIRST = [22, 62, 105, 145, 188, 228];
const range = (g: { body: J; response: J }) =>
  projectRoxyKpPlanetsRange(g.response, { startUtc: g.body.startDatetime, endUtc: g.body.endDatetime, intervalMinutes: g.body.intervalMinutes, ayanamsa: g.body.ayanamsa });
const point = (lon: number, star: string, sub: string, subSub: string, kp: number) => {
  const errors: string[] = [];
  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const lords = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];
  const si = Math.floor(lon / 30);
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const p = projectKpPoint({ longitude: lon, sign: signs[si], signLord: lords[si], starLord: cap(star), subLord: cap(sub), subSubLord: cap(subSub), kpNumber: kp }, "p", errors, [], { requirePada: false, requireSign: true });
  return { p, errors };
};
// tam sayı aritmetiği: sub sınırları 1/9° katıdır (nakshatra 120/9°, sub genişliği yıl/9°)
const subSubOf = (lon: number) => {
  const NAK = 40 / 3;
  const ORDER = ["ketu", "venus", "sun", "moon", "mars", "rahu", "jupiter", "saturn", "mercury"];
  const Y: Record<string, number> = { ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17 };
  const n = Math.floor(lon / NAK);
  const star = ORDER[n % 9];
  let a = n * NAK;
  for (let k = 0; k < 9; k++) {
    const l = ORDER[(ORDER.indexOf(star) + k) % 9];
    const b = a + (NAK * Y[l]) / 120;
    if (lon >= a && lon < b) {
      let s = a;
      for (let m = 0; m < 9; m++) {
        const l2 = ORDER[(ORDER.indexOf(l) + m) % 9];
        const e = s + ((b - a) * Y[l2]) / 120;
        if (lon >= s && lon < e) return { star, sub: l, subSub: l2 };
        s = e;
      }
    }
    a = b;
  }
  throw new Error("bulunamadı");
};

async function main() {
  await t("A KP tablosu: 249 satır; her sınır 1/9° katı (≤1e-9); bölünmüş sub'lar tam 6 ve 30° sınırında", () => {
    const tb = kpTable();
    assert.equal(tb.length, 249);
    for (const r of tb) for (const x of [r.start, r.end]) assert.ok(Math.abs(x * 9 - Math.round(x * 9)) < 1e-9, `${r.kp} ${x}`);
    const splits = tb.filter((r, i) => i > 0 && tb[i - 1].star === r.star && tb[i - 1].sub === r.sub).map((r) => r.kp - 1);
    assert.deepEqual(splits, SPLIT_FIRST);
    for (const f of SPLIT_FIRST) assert.equal(tb[f].start % 30, 0, `KP ${f + 1} burç başı`);
  });

  await t("B1 gerçek Mars 2036 (30.0584°/30.0649°, sağlayıcı 22): planets-at ve aralık KABUL; KP 23 tablodan; sağlayıcı değeri 22 işaretli", () => {
    const g = G("kp-planets-mars-2036-split");
    const at = projectRoxyKpPlanetsAt(g.response, { atUtc: "2036-03-06T00:00", ayanamsa: "kp-newcomb", nodeType: "mean" });
    assert.ok(at.ok, at.ok ? "" : at.errors.join("; "));
    const mars = (at as J).technical.bodies.find((b: J) => b.id === "mars");
    assert.equal(mars.kpNumber, 23);
    assert.equal(mars.kpNumberProvider, 22);
    const rg = range(g);
    assert.ok(rg.ok, rg.ok ? "" : rg.errors.join("; "));
    const rows = (rg as J).part.rows;
    assert.ok(rows.every((r: J) => r.bodies.find((b: J) => b.id === "mars").kpNumber === 23));
  });

  await t("B2 gerçek Ay KP23 (Rahu sub'ı, 17 an) ve KP229 (Ay sub'ı, 17 an): tüm noktalar KABUL; düzeltilenler yalnız 2. parçadakiler ve tabloyla aynı", () => {
    for (const [n, want] of [["kp-planets-moon-kp23-split-2026", 23], ["kp-planets-moon-kp229-split-2026", 229]] as const) {
      const rg = range(G(n));
      assert.ok(rg.ok, `${n}: ${rg.ok ? "" : rg.errors.join("; ")}`);
      let fixed = 0;
      for (const r of (rg as J).part.rows)
        for (const b of r.bodies) {
          const row = kpTable()[b.kpNumber - 1];
          assert.ok(b.longitude >= row.start - 1e-4 && b.longitude < row.end + 1e-4, `${n} ${b.id} ${b.longitude} KP ${b.kpNumber}`);
          if (b.kpNumberProvider !== undefined) {
            fixed++;
            assert.equal(b.kpNumber, want, `${n} ${b.id}`);
            assert.equal(b.kpNumberProvider, want - 1);
          }
        }
      assert.ok(fixed >= 4, `${n}: düzeltilen nokta ${fixed}`);
    }
  });

  await t("C gerçek Merkür geri giriş 2026-07-06 (sağlayıcı 64→62): KABUL; yeni KP 63 (tablo) + işaret; sonraki satır zinciri sürer", () => {
    const g = G("kp-sublord-mercury-retro-2026");
    const r = projectRoxyKpSublordChanges(g.response, { planet: "mercury", startDate: g.body.startDate, endDate: g.body.endDate });
    assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
    const c = (r as J).part.changes.find((x: J) => x.fromKp === 64 && x.corrected);
    assert.ok(c, "64→63 düzeltmesi");
    assert.equal(c.toKp, 63);
    assert.deepEqual([c.corrected.providerToKp, c.corrected.kind], [62, "split-sub"]);
  });

  await t("D fail-closed: lord uyuşmazlığı, ±2 numara, 1. parçada yanlış numara, sınır dışı → RED (düzeltme yok)", () => {
    // 2. parça ortası (Mars 30.5°, Krittika/Rahu, KP 23)
    const ss = subSubOf(30.5);
    assert.equal(point(30.5, ss.star, ss.sub, ss.subSub, 22).errors.length, 0, "desen: düzeltilir");
    assert.ok(point(30.5, ss.star, "jupiter", ss.subSub, 22).errors.length > 0, "sub lord yanlış → RED");
    assert.ok(point(30.5, ss.star, ss.sub, ss.subSub, 21).errors.length > 0, "−2 numara → RED");
    assert.ok(point(30.5, ss.star, ss.sub, ss.subSub, 24).errors.length > 0, "+1 numara → RED");
    const s1 = subSubOf(29.6); // 1. parça
    assert.ok(point(29.6, s1.star, s1.sub, s1.subSub, 23).errors.length > 0, "1. parçada 2. parça numarası → RED");
    assert.ok(point(29.6, s1.star, s1.sub, s1.subSub, 21).errors.length > 0, "1. parçada önceki sub numarası → RED");
    assert.ok(point(31.3, subSubOf(31.3).star, subSubOf(31.3).sub, subSubOf(31.3).subSub, 23).errors.length > 0, "KP 24 alanında 23 → RED");
  });

  await t("E 6 bölünmüş sub × 2. parça 400 nokta: düzeltilen = tablo; 1. parça (doğru numara) işaretsiz; sınırda 4 ondalık (30.0000) doğru dilim", () => {
    const tb = kpTable();
    for (const f of SPLIT_FIRST) {
      const second = tb[f];
      for (let i = 0; i < 400; i++) {
        const lon = Math.round((second.start + ((second.end - second.start) * (i + 0.5)) / 400) * 1e4) / 1e4;
        if (lon < second.start + 2e-4 || lon > second.end - 2e-4) continue; // 4 ondalık yuvarlama sınır payı: komşu adaylar
        const ss = subSubOf(lon);
        const r = point(lon, ss.star, ss.sub, ss.subSub, f); // sağlayıcı kusuru: 1. parça numarası
        assert.equal(r.errors.length, 0, `${lon}: ${r.errors.join("; ")}`);
        assert.deepEqual([r.p!.kpNumber, r.p!.kpNumberProvider], [f + 1, f], `${lon}`);
      }
      const first = tb[f - 1];
      const mid = (first.start + first.end) / 2;
      const s1 = subSubOf(mid);
      const ok = point(mid, s1.star, s1.sub, s1.subSub, f);
      assert.deepEqual([ok.errors.length, ok.p!.kpNumber, ok.p!.kpNumberProvider], [0, f, undefined], "1. parça");
      const ss0 = subSubOf(second.start);
      const atBoundary = point(second.start, ss0.star, ss0.sub, ss0.subSub, f + 1);
      assert.deepEqual([atBoundary.errors.length, atBoundary.p!.kpNumber, atBoundary.p!.kpNumberProvider], [0, f + 1, undefined], "tam sınır, doğru numara");
    }
  });

  await t("F doğru numara → işaret yok; etiket ve not (ekran + rapor ortak)", () => {
    const ss = subSubOf(30.5);
    const r = point(30.5, ss.star, ss.sub, ss.subSub, 23);
    assert.deepEqual([r.errors.length, r.p!.kpNumber, "kpNumberProvider" in r.p!], [0, 23, false]);
    assert.equal(kpNumberLabel({ kpNumber: 23 }), "23");
    assert.equal(kpNumberLabel({ kpNumber: 23, kpNumberProvider: 22 }), "23*");
    assert.ok(KP_NUMBER_LOCAL_NOTE.includes("KP alt bölüm tablosu") && !/roxy/i.test(KP_NUMBER_LOCAL_NOTE));
  });

  await t("G ekran (sunucu render): gezegen ve cusp tablosu — düzeltilen nokta '23*' + not; düzeltilmeyen tabloda not YOK", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { KpBodyTable, KpCuspTable } = await import("@/app/admin/astroloji/_components/KpPanels");
    const at = projectRoxyKpPlanetsAt(G("kp-planets-mars-2036-split").response, { atUtc: "2036-03-06T00:00", ayanamsa: "kp-newcomb", nodeType: "mean" });
    assert.ok(at.ok);
    const bodies = (at as J).technical.bodies;
    const html = renderToStaticMarkup(React.createElement(KpBodyTable, { bodies, sel: null, onSel: () => undefined }));
    assert.ok(html.includes("23*") && html.includes('data-kp-local="1"') && html.includes("astro-kp-local-number-note") && html.includes(KP_NUMBER_LOCAL_NOTE.slice(2, 40)), "işaret + not");
    const clean = bodies.filter((b: J) => b.kpNumberProvider === undefined);
    const html2 = renderToStaticMarkup(React.createElement(KpBodyTable, { bodies: clean, sel: null, onSel: () => undefined }));
    assert.ok(!html2.includes("astro-kp-local-number-note") && !html2.includes('data-kp-local="1"'), "düzeltme yoksa not yok");
    const cusps = [{ ...bodies.find((b: J) => b.id === "mars"), house: 1 }];
    const html3 = renderToStaticMarkup(React.createElement(KpCuspTable, { cusps, sel: null, onSel: () => undefined }));
    assert.ok(html3.includes("23*") && html3.includes("astro-kp-local-number-note"), "cusp tablosu");
  });

  await t("H Word/PDF rapor modeli: konum tablosunda '23*' + yerel numara notu; geri giriş satırında 63 + split notu; eski düzeltme notu karışmaz", async () => {
    const { buildAstroReport, reportTexts } = await import("@/lib/astrology/report/model");
    const { KP_TIMING_TECHNICAL_SCHEMA, KP_SPLIT_CORRECTION_NOTE } = await import("@/lib/astrology/model/kp");
    const g = G("kp-planets-mars-2036-split");
    const pos = range(g);
    assert.ok(pos.ok);
    const m = G("kp-sublord-mercury-retro-2026");
    const sub = projectRoxyKpSublordChanges(m.response, { planet: "mercury", startDate: m.body.startDate, endDate: m.body.endDate });
    assert.ok(sub.ok);
    const technical = {
      schema: KP_TIMING_TECHNICAL_SCHEMA,
      frame: { ayanamsa: "kp-newcomb", ayanamsaDegrees: (pos as J).part.ayanamsaDegrees },
      nodeType: "mean",
      kinds: ["positions", "sublord"],
      rasi: [],
      missing: [],
      window: { startDate: "2036-03-06", endDate: "2036-03-06" },
      planets: ["mars", "mercury"],
      positions: { ...(pos as J).part, intervalMinutes: 15 },
      sublord: [(sub as J).part],
    };
    const s = reportTexts(buildAstroReport({ id: "x", title: "x", technique: "kp.transit", analysisAt: "2036-03-06T00:00:00Z", technical, params: {} } as never)).join("\n");
    assert.ok(s.includes("23*"), "konum tablosunda 23*");
    assert.ok(s.includes(KP_NUMBER_LOCAL_NOTE.slice(2, 60)), "yerel numara notu");
    assert.ok(s.includes(KP_SPLIT_CORRECTION_NOTE.slice(2, 60)), "geri giriş split notu");
    // başlıktaki "Seçenekler" satırı bu sentetik testte boş params'tan gelir; denetim KP gövdesiyle sınırlı
    const body = s.slice(s.indexOf("Gösterim saat dilimi"));
    for (const bad of ["undefined", "NaN", "[object Object]", "Roxy"]) assert.ok(!body.includes(bad), bad);
  });

  console.log(`\nkp-split-yerel harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main();
