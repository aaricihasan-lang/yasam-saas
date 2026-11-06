/**
 * NATAL ELEMENT / NİTELİK DAĞILIMI — iki yöntem harness'i (2026-11-07, feat/natal-element-iki-yontem-imlec).
 *
 *   • 10 Gezegen (varsayılan): sağlayıcının kayıtlı sayımı AYNEN kullanılır; 200 gerçek sağlayıcı yanıtında gövde burçlarından
 *     bağımsız sayım = kayıtlı özet (burç → element / nitelik eşleşmesinin kanıtı).
 *   • 15 Puanlık Analiz: Güneş/Ay/ASC 3, MC + Merkür…Satürn 1 (toplam 15); Uranüs/Neptün/Plüton dahil değil.
 *     Üç owner vakası BAĞIMSIZ Swiss Ephemeris (pyswisseph 2.10.03, SE dosyaları) + zoneinfo ile hesaplanan burçlardan:
 *       12.02.1979 06:30 İstanbul/Fatih (UTC+3)  → Toprak 5, Hava 5, Ateş 4, Su 1 (owner beklentisi)
 *       17.06.1969 16:15 Hatay/İskenderun (UTC+2) → Su 6, Toprak 4, Hava 4, Ateş 1
 *       25.09.1982 07:00 Samsun (UTC+3)           → Hava 8, Toprak 4, Su 2, Ateş 1
 *     (Kanıt: C:/YasamSistemi-QA/NATAL-DOGRULUK-DENETIMI-2026-11-06/06-YONTEM15-UC-VAKA.json; sistemin saat dilimi çözücüsü
 *      ile zoneinfo üç vakada aynı ofseti verir.)
 *   • Eşitlik: hiçbir yöntem eşitlikte tek grup "baskın" ilan etmez; 10 gezegende sağlayıcının eşitlik kuralı ikincil bilgi.
 *   • Saat bilinmiyor (ASC/MC yok) → 15 puan hesaplanmaz (açık neden); 10 gezegen etkilenmez.
 *   • Ekran (NatalTechnicalPanel) ve Word/PDF rapor modeli aynı yardımcıları kullanır; eski kayıt (yalnız teknik veri) açılır.
 *   • İmleç: Natal sonucunda ChartViewport `calmCursor` (cursor-default); diğer tekniklerde eski imleç; SVG <title> ipuçları aynen.
 * Gerçek sağlayıcı / DB / ağ YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/natal-distribution.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NatalTechnicalPanel from "@/app/admin/astroloji/_components/NatalTechnicalPanel";
import NatalWheel from "@/app/admin/astroloji/_components/NatalWheel";
import { DEFAULT_POINTS, extraPointsFor, hiddenBodiesFor } from "@/lib/astrology/view/natalWheelDisplay";
import { maskTimeDependent } from "@/lib/astrology/view/natalView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { SIGN_IDS, type NatalTechnical, type SignId } from "@/lib/astrology/model/western";
import {
  DIST_METHOD_NOTES,
  WEIGHTED15,
  distributive,
  natalDistribution,
  signElement,
  signModality,
  tieSentence,
} from "@/lib/astrology/view/natalDistribution";

const ROOT = join(__dirname, "..", "..");
const FIX = join(__dirname, "fixtures");

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n").join("\n    ")}`);
  }
}

const cumra = JSON.parse(readFileSync(join(FIX, "natal-display", "cumra-1987-swisseph-ref.json"), "utf8")).technical as NatalTechnical;
const real200 = (JSON.parse(readFileSync(join(FIX, "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: NatalTechnical }[]).map((c) => c.technical);

/** Bağımsız SE burçlarından yalnız dağılım için gereken alanlar (konum/derece bu testte kullanılmaz). */
function fromSigns(s: Record<string, SignId>): Pick<NatalTechnical, "bodies" | "angles" | "summary"> {
  const pt = (sign: SignId) => ({ longitude: SIGN_IDS.indexOf(sign) * 30 + 15, sign, degreeInSign: 15 });
  const ids = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
  return {
    bodies: ids.map((id) => ({ id, ...pt(s[id]), latitude: 0, house: null, speed: 1, retrograde: false, dignity: null })) as NatalTechnical["bodies"],
    angles: { ascendant: pt(s.asc), midheaven: pt(s.mc) },
    summary: null as unknown as NatalTechnical["summary"],
  };
}

const OWNER_CASES: { name: string; signs: Record<string, SignId>; e10: number[]; m10: number[]; e15: number[]; m15: number[] }[] = [
  {
    name: "12.02.1979 06:30 İstanbul/Fatih",
    signs: { sun: "aquarius", moon: "leo", mercury: "aquarius", venus: "capricorn", mars: "aquarius", jupiter: "leo", saturn: "virgo", uranus: "scorpio", neptune: "sagittarius", pluto: "libra", asc: "capricorn", mc: "scorpio" },
    e10: [3, 2, 4, 1], m10: [2, 6, 2], e15: [4, 5, 5, 1], m15: [4, 10, 1],
  },
  {
    name: "17.06.1969 16:15 Hatay/İskenderun",
    signs: { sun: "gemini", moon: "cancer", mercury: "gemini", venus: "taurus", mars: "sagittarius", jupiter: "virgo", saturn: "taurus", uranus: "virgo", neptune: "scorpio", pluto: "virgo", asc: "scorpio", mc: "virgo" },
    e10: [1, 5, 2, 2], m10: [1, 3, 6], e15: [1, 4, 4, 6], m15: [3, 5, 7],
  },
  {
    name: "25.09.1982 07:00 Samsun",
    signs: { sun: "libra", moon: "capricorn", mercury: "libra", venus: "virgo", mars: "sagittarius", jupiter: "scorpio", saturn: "libra", uranus: "sagittarius", neptune: "sagittarius", pluto: "libra", asc: "libra", mc: "cancer" },
    e10: [3, 2, 4, 1], m10: [5, 1, 4], e15: [1, 4, 8, 2], m15: [12, 1, 2],
  },
];
const E = (r: Record<string, number>) => [r.fire, r.earth, r.air, r.water];
const M = (r: Record<string, number>) => [r.cardinal, r.fixed, r.mutable];

function main() {
  console.log("natal-distribution harness");

  test("burç → element / nitelik: geleneksel eşleşme (12 burç)", () => {
    assert.deepEqual(SIGN_IDS.map(signElement), ["fire", "earth", "air", "water", "fire", "earth", "air", "water", "fire", "earth", "air", "water"]);
    assert.deepEqual(SIGN_IDS.map(signModality), ["cardinal", "fixed", "mutable", "cardinal", "fixed", "mutable", "cardinal", "fixed", "mutable", "cardinal", "fixed", "mutable"]);
  });

  test("15 puan ağırlıkları: toplam 15; Uranüs/Neptün/Plüton yok", () => {
    assert.equal(WEIGHTED15.reduce((n, w) => n + w.points, 0), 15);
    assert.ok(!WEIGHTED15.some((w) => ["uranus", "neptune", "pluto"].includes(w.key)));
    assert.deepEqual(Object.fromEntries(WEIGHTED15.map((w) => [w.key, w.points])), { sun: 3, moon: 3, asc: 3, mc: 1, mercury: 1, venus: 1, mars: 1, jupiter: 1, saturn: 1 });
  });

  for (const c of OWNER_CASES)
    test(`owner vakası ${c.name}: iki yöntem bağımsız SE ile aynı; toplamlar 10 / 15`, () => {
      const t = fromSigns(c.signs);
      const a = natalDistribution(t, "planets10");
      const b = natalDistribution(t, "weighted15");
      assert.ok(a.available && b.available);
      assert.deepEqual(E(a.elements), c.e10);
      assert.deepEqual(M(a.modalities), c.m10);
      assert.deepEqual(E(b.elements), c.e15);
      assert.deepEqual(M(b.modalities), c.m15);
      assert.equal(E(a.elements).reduce((x, y) => x + y), 10);
      assert.equal(M(a.modalities).reduce((x, y) => x + y), 10);
      assert.equal(E(b.elements).reduce((x, y) => x + y), 15);
      assert.equal(M(b.modalities).reduce((x, y) => x + y), 15);
    });

  test("12.02.1979: 15 puanda Toprak–Hava eşitliği açıkça (tek baskın yok) → 'Toprak ve Hava eşit — 5'er puan.'", () => {
    const b = natalDistribution(fromSigns(OWNER_CASES[0].signs), "weighted15");
    assert.ok(b.available);
    assert.deepEqual(b.topElements, ["earth", "air"]);
    assert.equal(tieSentence(["Toprak", "Hava"], 5, b.unit), "Toprak ve Hava eşit — 5'er puan.");
  });

  test("200 gerçek sağlayıcı yanıtı: gövde burçlarından 10 gezegen sayımı = kayıtlı özet; 15 puan toplamı 15", () => {
    let n = 0;
    for (const t of real200) {
      const kayitli = natalDistribution(t, "planets10");
      const bagimsiz = natalDistribution({ ...t, summary: null as unknown as NatalTechnical["summary"] }, "planets10");
      assert.ok(kayitli.available && bagimsiz.available);
      assert.deepEqual(bagimsiz.elements, kayitli.elements);
      assert.deepEqual(bagimsiz.modalities, kayitli.modalities);
      const w = natalDistribution(t, "weighted15");
      assert.ok(w.available);
      assert.equal(E(w.elements).reduce((x, y) => x + y), 15);
      assert.equal(M(w.modalities).reduce((x, y) => x + y), 15);
      n++;
    }
    assert.equal(n, 200);
  });

  test("10 gezegen: sağlayıcının sayımı ve eşitlik seçimi DEĞİŞMEDEN taşınır (Çumra: Ateş/Toprak/Su 3'er, kaynak → Toprak)", () => {
    const a = natalDistribution(cumra, "planets10");
    assert.ok(a.available);
    assert.deepEqual(a.elements, cumra.summary.elementDistribution);
    assert.deepEqual(a.modalities, cumra.summary.modalityDistribution);
    assert.deepEqual(a.topElements, ["fire", "earth", "water"]);
    assert.equal(a.providerDominant?.element, cumra.summary.dominantElement);
    assert.equal(a.providerDominant?.modality, cumra.summary.dominantModality);
  });

  test("saat bilinmiyor (maskeli: ASC/MC yok) → 15 puan hesaplanmaz; 10 gezegen aynen", () => {
    const m = maskTimeDependent(cumra);
    const b = natalDistribution(m, "weighted15");
    assert.equal(b.available, false);
    assert.equal(!b.available && b.reason, "no_angles");
    const a = natalDistribution(m, "planets10");
    assert.ok(a.available);
    assert.deepEqual(a.elements, cumra.summary.elementDistribution);
  });

  test("üleştirme eki 1–15 (Türkçe)", () => {
    assert.deepEqual(
      Array.from({ length: 15 }, (_, i) => distributive(i + 1)),
      ["1'er", "2'şer", "3'er", "4'er", "5'er", "6'şar", "7'şer", "8'er", "9'ar", "10'ar", "11'er", "12'şer", "13'er", "14'er", "15'er"],
    );
  });

  test("ekran: varsayılan 10 Gezegen seçili; iki seçenek; eşitlikte tek 'baskın' yok, kaynak kuralı ikincil", () => {
    const html = renderToStaticMarkup(createElement(NatalTechnicalPanel, { technical: cumra, timeUnknown: false, part: "overview" }));
    assert.match(html, /data-method="planets10"/);
    assert.match(html, /data-testid="natal-dist-method-planets10"[^>]*>10 Gezegen</);
    assert.match(html, /data-testid="natal-dist-method-weighted15"[^>]*>15 Puanlık Analiz</);
    assert.match(html, /aria-pressed="true"[^>]*data-testid="natal-dist-method-planets10"/);
    assert.match(html, /Element · eşitlik: Ateş · Toprak · Su/);
    assert.ok(!/Element · baskın:/.test(html), "eşitlikte 'baskın' başlığı olmamalı");
    assert.match(html, /data-testid="natal-element-tie"[^>]*>Ateş, Toprak ve Su eşit — 3&#x27;er gezegen\./);
    assert.match(html, /Bu haritada öne alınan: Toprak/);
    assert.match(html, /Nitelik · baskın: Değişken/);
    assert.ok(html.includes(DIST_METHOD_NOTES.planets10.replace(/'/g, "&#x27;")));
    // Sabit sıra: Ateş, Toprak, Hava, Su
    const order = [...html.matchAll(/<span>(Ateş|Toprak|Hava|Su)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(order, ["Ateş", "Toprak", "Hava", "Su"]);
  });

  test("Word/PDF rapor modeli: iki yöntem + eşitlik + yöntem notu; eski tek 'Baskın element' satırı yok", () => {
    const r = buildAstroReport({ id: "x", title: "Çumra", technique: "western.natal", analysisAt: "2026-11-07T00:00:00Z", params: {}, method: { houseSystem: "placidus", nodeType: "true" }, technical: cumra, profile: { label: "Sentetik" } });
    const txt = reportTexts(r).join("\n");
    assert.match(txt, /Element — 10 Gezegen/);
    assert.match(txt, /Ateş 3 · Toprak 3 · Hava 1 · Su 3/);
    assert.match(txt, /Ateş, Toprak ve Su eşit — 3'er gezegen\. Hesaplama kaynağının eşitlik kuralıyla öne alınan: Toprak\./);
    assert.match(txt, /Element — 15 Puanlık Analiz/);
    assert.match(txt, /Yöntem — 15 Puanlık Analiz/);
    assert.ok(!/^Baskın element$/m.test(txt));
    // Çumra 15 puan bağımsız: Güneş Kova 3 + Ay Başak 3 + ASC Terazi 3 + MC Yengeç 1 + Merkür Balık + Venüs Oğlak + Mars Koç + Jüpiter Balık + Satürn Yay
    const w = natalDistribution(cumra, "weighted15");
    assert.ok(w.available);
    assert.deepEqual(E(w.elements), [2, 4, 6, 3]);
    assert.match(txt, /Ateş 2 · Toprak 4 · Hava 6 · Su 3/);
  });

  test("rapor: saat bilinmiyor → 15 puan satırı neden yazar", () => {
    const r = buildAstroReport({ id: "y", title: "Maskeli", technique: "western.natal", analysisAt: "2026-11-07T00:00:00Z", params: {}, method: { houseSystem: "placidus", nodeType: "true" }, technical: maskTimeDependent(cumra), profile: { label: "Sentetik" } });
    assert.match(reportTexts(r).join("\n"), /Doğum saati bilinmediği için Yükselen ve MC yok; hesaplanamaz\./);
  });

  test("imleç: Natal → calmCursor (cursor-default); diğer teknik → eski imleç; ChartViewport tek yerde karar verir", () => {
    const vp = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/ChartViewport.tsx"), "utf8");
    assert.match(vp, /calmCursor \? "cursor-default" : zoomed \? \(dragging \? "cursor-grabbing" : "cursor-grab"\) : "cursor-zoom-in"/);
    const desk = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/ResultDesk.tsx"), "utf8");
    assert.equal((desk.match(/<ChartViewport /g) ?? []).length, (desk.match(/<ChartViewport calmCursor=\{calmCursor\} /g) ?? []).length);
    assert.match(readFileSync(join(ROOT, "app/admin/astroloji/page.tsx"), "utf8"), /calmCursor=\{item\.technique === "western\.natal"\}/);
    assert.match(readFileSync(join(ROOT, "app/admin/astroloji/_components/SavedAnalyses.tsx"), "utf8"), /calmCursor=\{a\.technique === "western\.natal"\}/);
  });

  test("ipuçları korunur: çarkta burç, gezegen, ASC/MC/DSC/IC, ev ve açı <title> ipuçları; çark imleç sınıfı taşımaz", () => {
    // Natal ekranındaki gibi görünüm katmanıyla (Profesyonel, varsayılan noktalar + Şans Noktası/Vertex açık)
    const pts = { ...DEFAULT_POINTS.pro, vertex: true, fortune: true };
    const svg = renderToStaticMarkup(createElement(NatalWheel, { technical: cumra, tinted: true, display: { mode: "pro", hiddenBodies: hiddenBodiesFor(pts), extraPoints: extraPointsFor(cumra, pts) } }));
    for (const re of [/<title>Kova<\/title>/, /<title>Güneş — Kova 25°32′<\/title>/, /<title>Yükselen — Terazi 9°49′<\/title>/, /<title>Tepe Noktası \(MC\) — Yengeç 11°04′<\/title>/, /<title>Alçalan — Koç 9°49′<\/title>/, /<title>Dip Noktası \(IC\) — Oğlak 11°04′<\/title>/, /<title>2\. ev başlangıcı — Akrep 7°04′<\/title>/, /<title>Şans Noktası — Balık 29°24′<\/title>/, /<title>Vertex — Koç 28°44′<\/title>/, /<title>Kiron — İkizler 15°50′ ℞/])
      assert.match(svg, re);
    assert.ok(!/cursor/i.test(svg), "çark SVG'si imleç stili taşımamalı");
  });

  console.log(`\nnatal-distribution harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main();
