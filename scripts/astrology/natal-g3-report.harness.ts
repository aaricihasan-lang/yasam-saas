/**
 * G3 — NATAL WORD / PDF RAPORU: burç / derece / dakika etiketleri ve saat bilinmiyor kuralı (2026-11-22). Ağ / DB / sağlayıcı YOK.
 *
 * Gerçek dosya üretir (servisle AYNI yol: buildAstroReport → renderWheelPng → renderAstroReportDocx / buildAstroReportPdf) ve
 * içeriği metin düzeyinde doğrular (DOCX word/document.xml, PDF unpdf metni):
 *   • Konum tablosu: her gövde ve özel nokta kendi burcu (sembol + ad) ve formatDegree derece°dakika′ ile; ℞; ev; eksen tablosu
 *     gerçek ASC / DSC / MC / IC; 12 ev başlangıcı houses[] ile. Sınır değerler (gerçek fixture): 29°59′ ve 0°00′ (yuvarlanmaz).
 *   • Çark görseli: G3 çizicisi (natal) yalnız Natal'da; TEK çark PNG'si (önceki rapor sözleşmesi); etiket değerleri tabloyla aynı;
 *     yoğun kümelerin her noktası "Gezegen yerleşimleri" tablosunda.
 *   • Saat bilinmiyor: Ay çarkta yok; Ay satırı Owner metni (burç / derece yok); Ay açıları listede yok; dağılım Ay hariç 9;
 *     uyarı her teknik bölümde tekrar; ev / eksen bölümleri yazılmaz, Şans Noktası / Vertex "hesaplanamaz"; Word ve PDF aynı.
 *   • 8 ev sistemi: ev başlangıcı tablosu houses[] ile; Tam Burç / Eşit Ev eksen notu.
 *   • Diğer teknikler: chartPng'ye natal verilmezse wheelSvg çıktısı değişmez (Kompozit / Dönüş çarkı natal katmanı almaz).
 * Dosyalar `G3_REPORT_OUT` (ya da 1. argüman) klasörüne yazılır (sayfa görüntüsü / punto ölçümü ayrı Python adımında).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/natal-g3-report.harness.ts [çıktı klasörü]
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { buildAstroReport, type AstroReport, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { renderWheelPng } from "@/lib/astrology/report/chartPng";
import { buildWheelSvg, WHEEL_FONT_STACK } from "@/lib/astrology/report/wheelSvg";
import { buildNatalReportSvg, natalDegreeRulerFigures, natalDegreeRulerSvg, natalReportLayout, natalRulerLayout, NATAL_RULER_VIEWBOX_W, rulerX, type NatalDegreeRulerFigure } from "@/lib/astrology/report/natalWheelReport";
import { renderFigurePng } from "@/lib/astrology/report/figurePng";
import { signIndexOf } from "@/lib/astrology/view/natalLabelLayout";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { anamnezPdfFontBase64 } from "@/lib/danisan/anamnez/pdfFont";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { maskTimeDependent } from "@/lib/astrology/view/natalView";
import { deriveLocalNatalHouses } from "@/lib/astrology/houses/natalLocal";
import { SIGN_IDS, type NatalTechnical } from "@/lib/astrology/model/western";
import { BODY_LABELS, formatDegree, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { MOON_UNKNOWN_ROW, MOON_UNKNOWN_TEXT } from "@/lib/astrology/view/natalLabelLayout";

const FIX = join(__dirname, "fixtures");
const OUT = process.argv[2] ?? process.env.G3_REPORT_OUT ?? null;
if (OUT) mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const info: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message.split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const norm = (s: string) => s.replace(/[︎️]/g, "").replace(/\s+/g, " ");
async function pdfText(buf: Uint8Array) {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return norm(text as string);
}
async function docxText(buf: Buffer) {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
  return norm(
    [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join("")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

const golden = (() => {
  const raw = JSON.parse(readFileSync(join(FIX, "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const p = projectRoxyNatal(raw.response ?? raw, { houseSystem: "placidus", nodeType: "true" });
  if (!p.ok) throw new Error("golden");
  return p.value.technical as NatalTechnical;
})();
const cumra = JSON.parse(readFileSync(join(FIX, "natal-display", "cumra-1987-swisseph-ref.json"), "utf8")).technical as NatalTechnical;
const cases = new Map(
  (JSON.parse(readFileSync(join(FIX, "pro-natal-houses", "roxy-natal-technical-2026-10-31.json"), "utf8")).cases as { id: string; technical: NatalTechnical }[]).map((c) => [c.id, c.technical]),
);

function input(technical: NatalTechnical, opts: { timeUnknown?: boolean; label?: string; houseCalculation?: "local" } = {}): ReportAnalysisInput {
  const tu = opts.timeUnknown === true;
  return {
    id: "00000000-0000-4000-8000-0000000000g3".replace("g3", "33"),
    title: `${opts.label ?? "Sentetik"} natal`,
    technique: "western.natal",
    analysisAt: "2026-11-22T12:00:00Z",
    technical: technical as unknown as Record<string, unknown>,
    params: { houseSystem: technical.houseSystem, nodeType: technical.nodeType },
    method: { houseSystem: technical.houseSystem, nodeType: technical.nodeType, timeUnknownMasked: tu, warnings: tu ? ["Doğum saati bilinmiyor: evler, Yükselen/MC, ev yerleşimleri, Şans Noktası ve Vertex gösterilmez."] : [], ...(opts.houseCalculation ? { houseCalculation: opts.houseCalculation } : {}) },
    profile: {
      label: opts.label ?? "Sentetik kişi (G3 testi)",
      revision: { revision: 1, birthDate: technical.echo?.date ?? "1990-01-01", birthTime: tu ? null : (technical.echo?.time ?? "12:00:00"), timeKnown: !tu, timezone: "Europe/Istanbul", latitude: technical.echo?.latitude ?? 41, longitude: technical.echo?.longitude ?? 29, locationLabel: "Sentetik konum", timeAccuracyLabel: tu ? "Saat bilinmiyor" : "Kesin" },
    },
  } as unknown as ReportAnalysisInput;
}

/** Servisle AYNI üretim: Natal çarkı 2000 px (tekli rapor), diğer çarklar 1200 px; Natal derece cetveli figürleri 2000 px. */
async function produce(name: string, inp: ReportAnalysisInput) {
  const report = buildAstroReport(inp);
  const charts: ({ png: Buffer; width: number; height: number } | null)[] = [];
  for (const b of report.blocks) {
    if (b.kind !== "chart") continue;
    if ("chart" in b) charts.push(renderWheelPng(b.chart, b.chart.natal ? 2000 : 1200));
    else {
      const r = await renderFigurePng(b.figure, 2000);
      charts.push("error" in r ? null : r);
    }
  }
  const docx = await renderAstroReportDocx(report, charts.map((c) => c?.png ?? null), symbolFontBuffers());
  const pdf = buildAstroReportPdf(report, charts, anamnezPdfFontBase64(), symbolFontsBase64());
  if (OUT) {
    writeFileSync(join(OUT, `${name}.docx`), docx);
    writeFileSync(join(OUT, `${name}.pdf`), pdf);
    charts.forEach((c, i) => c && writeFileSync(join(OUT, `${name}-gorsel${i + 1}.png`), c.png));
  }
  return { report, charts, docx, pdf, docxText: await docxText(docx), pdfText: await pdfText(pdf) };
}

const signTxt = (s: string) => `${SIGN_LABELS[s as keyof typeof SIGN_LABELS]}`;

// ── G3 (2026-11-23): derece cetveli yardımcıları ──
const natalOf = (r: AstroReport) => {
  const ch = r.blocks.find((b) => b.kind === "chart" && "chart" in b && !!b.chart.natal);
  assert.ok(ch && ch.kind === "chart" && "chart" in ch && ch.chart.natal);
  return { ...ch.chart, natal: ch.chart.natal };
};
const rulerFigsOf = (r: AstroReport) => r.blocks.flatMap((b) => (b.kind === "chart" && "figure" in b && b.figure.type === "natalDegreeRuler" ? [b.figure as NatalDegreeRulerFigure] : []));
/** Cetvel değişmezleri: grup ↔ cetvel birebir; her nokta GERÇEK kayıtlı konumunda; etiketler çakışmaz ve sayfa içinde. */
const checkRuler = (w: ReturnType<typeof natalOf>, figs: NatalDegreeRulerFigure[], tag: string) => {
  const lay = natalReportLayout(w);
  const sgn = figs.flatMap((f) => f.signs);
  assert.deepEqual(sgn.map((s) => s.sign).sort(), lay.groups.map((g) => g.sign).sort(), `${tag}: cetvel burçları = çark grupları`);
  for (const g of lay.groups) {
    const s = sgn.find((x) => x.sign === g.sign)!;
    assert.equal(s.points.length, g.ids.length, `${tag}: ${g.sign} nokta sayısı = grup sayısı`);
    assert.deepEqual(s.points.map((p) => p.key).sort(), [...g.ids].sort(), `${tag}: ${g.sign} aynı üyeler`);
  }
  for (const s of sgn) {
    for (const p of s.points) {
      // Kayıtlı veriyle birebir (yeni hesap yok): gövde → bodies[], özel nokta → natal.points
      const src = p.kind === "body" ? w.bodies.find((b) => b.id === p.key)! : w.natal.points.find((x) => `x:${x.id}` === p.key)!;
      assert.ok(src, `${tag}: ${p.key} kaynak`);
      assert.equal(p.deg, src.degreeInSign, `${tag}: ${p.key} derece`);
      assert.equal(p.sign, src.sign, `${tag}: ${p.key} burç`);
      assert.equal(p.sign, s.sign, `${tag}: ${p.key} şerit burcu`);
      assert.equal(SIGN_IDS[signIndexOf(p.lon)], p.sign, `${tag}: ${p.key} boylam burcu`);
      assert.ok(Math.abs((((p.lon % 30) + 30) % 30) - p.deg) < 1e-6 || Math.abs(p.deg) < 1e-6 || Math.abs(p.deg - 30) < 1e-6, `${tag}: ${p.key} boylam ↔ derece`);
      assert.ok(p.deg >= 0 && p.deg < 30, `${tag}: ${p.key} 0–30`);
      assert.ok(!formatDegree(p.deg).startsWith("30°"), `${tag}: ${p.key} yuvarlama sonraki burca taşımamalı`);
      if (w.natal.timeUnknown) assert.notEqual(p.key, "moon", `${tag}: saat bilinmiyor — Ay cetvelde olmamalı`);
    }
    const rl = natalRulerLayout(s.points, w.natal.timeUnknown);
    for (const L of rl.labels) assert.ok(L.cx - L.w / 2 >= rl.lo - 1e-6 && L.cx + L.w / 2 <= rl.hi + 1e-6, `${tag}: ${s.sign} ${L.p.key} etiket sayfa içinde`);
    for (let l = 0; l < rl.lanes; l++) {
      const row = rl.labels.filter((_, i) => i % rl.lanes === l).sort((a, b) => a.cx - b.cx);
      for (let i = 1; i < row.length; i++) assert.ok(row[i].cx - row[i].w / 2 >= row[i - 1].cx + row[i - 1].w / 2 - 1e-6, `${tag}: ${s.sign} etiket çakışması ${row[i - 1].p.key}/${row[i].p.key}`);
    }
  }
  for (const f of figs) {
    const svg = natalDegreeRulerSvg(f, WHEEL_FONT_STACK);
    for (const s of f.signs)
      for (const p of s.points) {
        const m = new RegExp(`<circle cx="([0-9.]+)"[^>]*data-deg="${String(p.deg).replace(".", "\\.")}" data-key="${p.key.replace(":", "\\:")}"`).exec(svg);
        assert.ok(m, `${tag}: ${p.key} işaret yok`);
        assert.ok(Math.abs(Number(m![1]) - rulerX(p.deg)) < 0.006, `${tag}: ${p.key} işaret gerçek derecede değil`);
      }
    const sizes = [...svg.matchAll(/font-size="([0-9.]+)"/g)].map((m) => Number(m[1]));
    const minPtWord = (Math.min(...sizes) * 166.4) / NATAL_RULER_VIEWBOX_W / 0.352778;
    assert.ok(minPtWord >= 8, `${tag}: en küçük yazı Word'de ${minPtWord.toFixed(2)} pt`);
  }
};
const docxImages = async (buf: Buffer) => {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => ({ cx: Number(m[1]), cy: Number(m[2]) }));
};

async function main() {
  console.log("natal-g3-report harness");
  const N153 = cases.get("N153")!; // Merkür 29,998° (gerçek sağlayıcı yanıtı)
  const N010 = cases.get("N010")!; // Uranüs 0,0007°
  const dense = [...cases.values()].find((t) => natalReportLayout({ bodies: t.bodies, houses: t.houses, angles: t.angles, aspects: [], natal: { timeUnknown: false, points: [] } } as never).groups.length >= 2)!;

  const known = await produce("1-normal-cumra", input(cumra, { label: "Çumra 1987 (referans)" }));
  // Yoğun grubu OLMAYAN gerçek sağlayıcı haritası (N034; Şans Noktası / Vertex dahil hiçbir burçta grup yok).
  const sparse = await produce("1b-normal-yogun-degil-N034", input(cases.get("N034")!, { label: "Normal — yoğun grup yok (N034 fixture)" }));
  await test("normal (yoğun grup yok, N034): TEK çark görseli, derece cetveli / boş bölüm YOK (Word + PDF)", async () => {
    assert.equal(natalReportLayout(natalOf(sparse.report)).groups.length, 0);
    assert.equal(sparse.report.blocks.filter((b) => b.kind === "chart").length, 1);
    assert.equal(sparse.charts.length, 1);
    assert.equal((await docxImages(sparse.docx)).length, 1);
    for (const txt of [sparse.docxText, sparse.pdfText]) assert.ok(!txt.includes("Derece cetveli") && !txt.includes("Cetveldeki noktalar"), "yoğun olmayan haritada cetvel olmamalı");
  });
  await test("normal (Çumra): çark görseli (G3 natal çizici) 2000 px + yalnız yoğun gruplar için cetvel; tablo başlığı \"Gezegen yerleşimleri\"", () => {
    const natalCharts = known.report.blocks.filter((b) => b.kind === "chart");
    const figs = rulerFigsOf(known.report);
    assert.ok(natalCharts.length === 1 + figs.length && known.charts.every(Boolean));
    assert.equal(figs.flatMap((f) => f.signs).length, natalReportLayout(natalOf(known.report)).groups.length);
    assert.ok(known.docxText.includes("Gezegen yerleşimleri") && known.pdfText.includes("Gezegen yerleşimleri"));
    assert.equal(known.charts[0]!.width, 2000);
    info.push(`normal: ${natalCharts.length} görsel (${known.charts.map((c) => `${c!.width}×${c!.height}`).join(", ")}) · DOCX ${known.docx.byteLength} B · PDF ${known.pdf.byteLength} B`);
  });
  await test("normal: her gövde Word ve PDF'te kendi burcu + derece°dakika′ (formatDegree) ile; ℞ yalnız geri harekette", () => {
    for (const [fmt, txt] of [["docx", known.docxText], ["pdf", known.pdfText]] as const) {
      for (const b of cumra.bodies) {
        const want = `${BODY_LABELS[b.id]}`;
        assert.ok(txt.includes(want), `${fmt}: ${want}`);
        assert.ok(txt.includes(formatDegree(b.degreeInSign)), `${fmt}: ${b.id} ${formatDegree(b.degreeInSign)}`);
        assert.ok(txt.includes(signTxt(b.sign)), `${fmt}: ${b.id} burç`);
      }
      assert.ok(txt.includes("℞ Retro"), `${fmt} retro`);
    }
    const retro = cumra.bodies.filter((b) => b.retrograde).length;
    assert.ok(retro > 0);
  });
  await test("normal: Şans Noktası / Vertex konum tablosunda; ASC / DSC / MC / IC eksen tablosunda; 12 ev başlangıcı", () => {
    for (const [fmt, txt] of [["docx", known.docxText], ["pdf", known.pdfText]] as const) {
      assert.ok(/Şans Noktası/.test(txt) && txt.includes(formatDegree(cumra.points.partOfFortune!.degreeInSign)), `${fmt} şans`);
      assert.ok(/Vertex/.test(txt) && txt.includes(formatDegree(cumra.points.vertex!.degreeInSign)), `${fmt} vertex`);
      for (const n of ["Yükselen (ASC)", "Alçalan (DSC)", "Tepe Noktası (MC)", "Dip Noktası (IC)"]) assert.ok(txt.includes(n), `${fmt} ${n}`);
      const asc = cumra.angles!.ascendant.longitude;
      assert.ok(txt.includes(formatDegree(asc % 30)), `${fmt} ASC derece`);
      const dsc = (asc + 180) % 360;
      assert.ok(txt.includes(`${signTxt(SIGN_IDS[Math.floor(dsc / 30)])} `) || txt.includes(signTxt(SIGN_IDS[Math.floor(dsc / 30)])), `${fmt} DSC burç`);
      for (const h of cumra.houses) assert.ok(txt.includes(`${h.number}. ev`) && txt.includes(formatDegree(h.degreeInSign)), `${fmt} ev ${h.number}`);
    }
  });
  await test("çark SVG'si: her tekil etiketin derece / dakikası formatDegree ile; gerçek boylam çentiği; açı çizgileri kayıtlı listeden", () => {
    const nc = known.report.blocks.find((b) => b.kind === "chart" && "chart" in b && !!b.chart.natal);
    assert.ok(nc && nc.kind === "chart" && "chart" in nc);
    const svg = buildNatalReportSvg({ ...nc.chart, natal: nc.chart.natal! }, WHEEL_FONT_STACK);
    const lay = natalReportLayout({ ...nc.chart, natal: nc.chart.natal! });
    const grouped = new Set(lay.groups.flatMap((g) => g.ids));
    for (const b of cumra.bodies.filter((x) => !grouped.has(x.id))) {
      const [dg, mn] = formatDegree(b.degreeInSign).split("°");
      assert.ok(svg.includes(`>${dg}°`) && svg.includes(`>${mn}</text>`), `${b.id}`);
    }
    const aspLines = (svg.match(/stroke-dasharray="3 3" opacity="0.8"|opacity="0.8"\/>/g) ?? []).length;
    assert.ok(aspLines > 0);
  });

  const dn = await produce("2-yogun", input(dense, { label: "Yoğun harita (fixture)" }));
  await test("yoğun: 2+ grup → çarkta grup etiketi + derece cetveli figürü; her nokta (grup üyeleri dahil) konum tablosunda burç + derece°dakika′ (Word + PDF)", () => {
    const figs = dn.report.blocks.filter((b) => b.kind === "chart" && "figure" in b);
    assert.ok(figs.length >= 1, "derece cetveli figürü yok");
    assert.ok(dn.charts.length === 1 + figs.length && dn.charts.every(Boolean));
    for (const b of dense.bodies) for (const txt of [dn.docxText, dn.pdfText]) assert.ok(txt.includes(formatDegree(b.degreeInSign)), b.id);
    info.push(`yoğun (${dense.echo.date}): ${natalReportLayout({ bodies: dense.bodies, houses: dense.houses, angles: dense.angles, aspects: [], natal: { timeUnknown: false, points: [] } } as never).groups.length} grup`);
  });

  // ── G3 (2026-11-23, Owner Karar 2): YOĞUN BURÇ DERECE CETVELİ ─────────────────────────────────────────────────────────
  const allFixtures: [string, NatalTechnical][] = [["golden", golden], ["cumra", cumra], ...[...cases.entries()]];
  await test("cetvel (200 sağlayıcı fixture + golden + Çumra): grup ↔ cetvel birebir, gerçek derece, Ay kuralı, etiket çakışması yok, en küçük yazı ≥ 8 pt", () => {
    let withRuler = 0;
    let points = 0;
    let maxPts = 0;
    for (const [id, t] of allFixtures) {
      for (const tuMode of [false, true]) {
        const tech = tuMode ? maskTimeDependent(t) : t;
        const r = buildAstroReport(input(tech, { timeUnknown: tuMode }));
        const w = natalOf(r);
        const figs = rulerFigsOf(r);
        checkRuler(w, figs, `${id}${tuMode ? " (saat bilinmiyor)" : ""}`);
        const groups = natalReportLayout(w).groups.length;
        assert.equal(figs.length > 0, groups > 0, `${id}: grup yoksa cetvel yok`);
        if (!tuMode && figs.length) {
          withRuler++;
          const n = figs.reduce((a, f) => a + f.signs.reduce((x, s) => x + s.points.length, 0), 0);
          points += n;
          maxPts = Math.max(maxPts, ...figs.flatMap((f) => f.signs.map((s) => s.points.length)));
        }
      }
    }
    info.push(`cetvel taraması: ${allFixtures.length} harita × (saat biliniyor + bilinmiyor); cetvelli ${withRuler} harita, ${points} nokta; bir burçta en çok ${maxPts} nokta`);
  });
  await test("cetvel: gövde sırası / etiketleri değişse de konumlar aynı (yalnız boylam belirleyici)", () => {
    const t = cases.get("N044")!;
    const a = rulerFigsOf(buildAstroReport(input(t)));
    const shuffled = { ...t, bodies: [...t.bodies].reverse() } as NatalTechnical;
    const b = rulerFigsOf(buildAstroReport(input(shuffled)));
    const pos = (fs: NatalDegreeRulerFigure[]) => fs.flatMap((f) => f.signs.flatMap((s) => s.points.map((p) => `${s.sign}|${p.key}|${p.deg}|${rulerX(p.deg).toFixed(4)}`))).sort();
    assert.deepEqual(pos(a), pos(b));
  });
  await test("cetvel sınırları: 0°00′ (0,0007°) sol uçta, 29°59′ (29,998°) sağ uçta; yuvarlama sonraki burca taşımaz; burç geçişi ayrı şerit", () => {
    const mkb = (id: string, lon: number, retro = false) => ({ id, longitude: lon, sign: SIGN_IDS[Math.floor(lon / 30)], degreeInSign: lon % 30, retrograde: retro, speed: 1, house: 1, dignity: null });
    // İkizler'de 5 nokta (0,0007° … 29,998°) + Yengeç'in hemen başında 4 nokta (90,0001° …): sınırın iki yanı ayrı burç.
    const bodies = [mkb("sun", 60.0007), mkb("moon", 67.5), mkb("mercury", 75.2, true), mkb("venus", 82.4), mkb("mars", 89.998), mkb("jupiter", 90.0001), mkb("saturn", 91.2), mkb("uranus", 93.4, true), mkb("neptune", 95.9), mkb("pluto", 200)];
    const w = { bodies, houses: [], angles: null, aspects: [], natal: { timeUnknown: false, points: [] } } as unknown as ReturnType<typeof natalOf>;
    const figs = natalDegreeRulerFigures(w);
    const pts = figs.flatMap((f) => f.signs.flatMap((s) => s.points.map((p) => ({ ...p, strip: s.sign }))));
    const sun = pts.find((p) => p.key === "sun")!;
    const mars = pts.find((p) => p.key === "mars")!;
    const jup = pts.find((p) => p.key === "jupiter")!;
    assert.equal(sun.strip, "gemini");
    assert.equal(formatDegree(sun.deg), "0°00′");
    assert.ok(Math.abs(rulerX(sun.deg) - rulerX(0)) < 0.05);
    assert.equal(mars.strip, "gemini", "29°59′ İkizler'de kalmalı");
    assert.equal(formatDegree(mars.deg), "29°59′");
    assert.ok(rulerX(mars.deg) < rulerX(30) && rulerX(30) - rulerX(mars.deg) < 0.1);
    assert.equal(jup.strip, "cancer");
    assert.equal(formatDegree(jup.deg), "0°00′");
    checkRuler(w, figs, "sınır");
    const svg = natalDegreeRulerSvg(figs[0], WHEEL_FONT_STACK);
    assert.ok(svg.includes(">0°00′<") && svg.includes(">29°59′<") && svg.includes("℞"));
  });

  const b29 = await produce("3-sinir-29-59", input(N153, { label: "Sınır 29°59′ (N153 fixture)" }));
  const b00 = await produce("3-sinir-0-00", input(N010, { label: "Sınır 0°00′ (N010 fixture)" }));
  await test("sınır: Merkür 29,998° → 29°59′ (sonraki burca yuvarlanmaz); Uranüs 0,0007° → 0°00′; Word = PDF", () => {
    const me = N153.bodies.find((b) => b.id === "mercury")!;
    const ur = N010.bodies.find((b) => b.id === "uranus")!;
    assert.equal(formatDegree(me.degreeInSign), "29°59′");
    assert.equal(formatDegree(ur.degreeInSign), "0°00′");
    for (const txt of [b29.docxText, b29.pdfText]) assert.ok(txt.includes(`${signTxt(me.sign)}`) && txt.includes("29°59′"));
    for (const txt of [b00.docxText, b00.pdfText]) assert.ok(txt.includes("0°00′"));
  });

  const masked = maskTimeDependent(golden);
  const tu = await produce("4-saat-bilinmiyor", input(masked, { timeUnknown: true, label: "Saat bilinmeyen (golden, maskeli)" }));
  await test("saat bilinmiyor: Ay çarkta yok (G3 çizici), açı çizgisi yok, grup sayıları Ay'sız", () => {
    for (const b of tu.report.blocks) {
      if (b.kind !== "chart" || !("chart" in b) || !b.chart.natal) continue;
      assert.equal(b.chart.natal.timeUnknown, true);
      const lay = natalReportLayout({ ...b.chart, natal: b.chart.natal });
      assert.ok(!lay.entries.some((e) => e.id === "moon"));
      assert.ok(!lay.groups.some((g) => g.ids.includes("moon")));
      const svg = buildNatalReportSvg({ ...b.chart, natal: b.chart.natal }, WHEEL_FONT_STACK);
      assert.ok(!svg.includes("☽"), "Ay simgesi");
      assert.ok(!/opacity="0.8"\/>/.test(svg), "açı çizgisi");
      assert.ok(svg.includes("Saat bilinmiyor"));
    }
  });
  await test("saat bilinmiyor: Word ve PDF — Ay satırı Owner metni (burç / derece yok), uyarı her bölümde, Ay açıları ve dağılımı yok, ev / eksen / özel nokta hesaplanamaz", () => {
    const moon = golden.bodies.find((b) => b.id === "moon")!;
    const moonDeg = formatDegree(moon.degreeInSign);
    for (const [fmt, txt] of [["docx", tu.docxText], ["pdf", tu.pdfText]] as const) {
      assert.ok(txt.includes(MOON_UNKNOWN_ROW), `${fmt}: Ay satırı`);
      const owner = (txt.match(new RegExp(MOON_UNKNOWN_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
      assert.ok(owner >= 5, `${fmt}: Owner metni ${owner} kez`);
      assert.ok(!txt.includes(`☽ Ay ≈`) && !new RegExp(`Ay[^.]{0,40}${moonDeg}`).test(txt), `${fmt}: Ay derecesi sızıyor`);
      assert.ok(!/Ay – |☽ Ay (☌|☍|□|△|⚹)/.test(txt), `${fmt}: Ay açısı`);
      assert.ok(txt.includes("Ay hariç 9 gezegen"), `${fmt}: dağılım`);
      assert.ok(!txt.includes("Ev başlangıçları (cusp)") && !txt.includes("Yükselen (ASC)"), `${fmt}: ev / eksen bölümü yazılmamalı (önceki kural)`);
      assert.ok(txt.includes("Hesaplanamaz — doğum saati bilinmiyor"), `${fmt}: Şans / Vertex`);
      assert.ok(txt.includes("12:00 varsayımı"), `${fmt}: ≈ varsayım`);
      assert.ok(!txt.includes("15 Puanlık Analiz Element"), `${fmt}: 15 puan`);
    }
    // Word ve PDF aynı uyarı sayısı
    const c = (t: string) => (t.match(/Doğum saati bilinmiyor\./g) ?? []).length;
    assert.equal(c(tu.docxText), c(tu.pdfText));
    info.push(`saat bilinmiyor: Owner metni Word'de ${(tu.docxText.match(/doğrulanamıyor/g) ?? []).length} / PDF'te ${(tu.pdfText.match(/doğrulanamıyor/g) ?? []).length} kez`);
  });

  // ── Cetvel: gerçek Word / PDF dosyaları ─────────────────────────────────────────────────────────────────────────────
  const N011 = cases.get("N011")!; // Yengeç 5 (Ay dahil) · Aslan 4 · Başak 3
  const rulerDocs: [string, Awaited<ReturnType<typeof produce>>, boolean][] = [
    ["2-yogun", dn, false],
    ["2b-cok-yogun-N044", await produce("2b-cok-yogun-N044", input(cases.get("N044")!, { label: "Çok yoğun — İkizler'de 7 nokta (N044 fixture)" })), false],
    ["2c-cok-yogun-N074", await produce("2c-cok-yogun-N074", input(cases.get("N074")!, { label: "Çok yoğun — 5 grup (N074 fixture)" })), false],
    ["6-retro-N078", await produce("6-retro-N078", input(cases.get("N078")!, { label: "7 retro gezegen (N078 fixture)" })), false],
    ["7-saat-bilinmiyor-yogun-N011", await produce("7-saat-bilinmiyor-yogun-N011", input(maskTimeDependent(N011), { timeUnknown: true, label: "Saat bilinmeyen yoğun (N011, maskeli)" })), true],
  ];
  for (const [name, d, tuR] of rulerDocs) {
    await test(`cetvel Word + PDF — ${name}: bölüm başlığı, görsel sayısı (çark + cetvel), cetvel tablosu her iki formatta AYNI kayıtlı değerler`, async () => {
      const figs = rulerFigsOf(d.report);
      assert.ok(figs.length >= 1, "cetvel yok");
      checkRuler(natalOf(d.report), figs, name);
      assert.equal(d.charts.length, 1 + figs.length);
      assert.ok(d.charts.every(Boolean), "görsel üretilemedi");
      const ext = await docxImages(d.docx);
      assert.equal(ext.length, 1 + figs.length, "Word görsel sayısı");
      // Word: çark ve cetvel aynı genişlik 629 px = 5 991 225 EMU ≈ 166,4 mm (6 000 000 EMU sınırı içinde)
      for (const e of ext) assert.equal(e.cx, 629 * 9525, "Word görsel genişliği");
      for (const txt of [d.docxText, d.pdfText]) {
        assert.ok(txt.includes("Derece cetveli — yoğun burçlar"), "başlık");
        assert.ok(txt.includes("Cetveldeki noktalar"), "cetvel tablosu");
        for (const f of figs)
          for (const s of f.signs)
            for (const p of s.points) {
              assert.ok(txt.includes(`${tuR ? "≈ " : ""}${formatDegree(p.deg)}`), `${p.key} ${formatDegree(p.deg)}`);
              assert.ok(txt.includes(SIGN_LABELS[s.sign]), `${s.sign}`);
            }
      }
      if (tuR) {
        for (const txt of [d.docxText, d.pdfText]) assert.ok(txt.includes(MOON_UNKNOWN_TEXT) && txt.includes("Ay hariç"), "saat bilinmiyor uyarısı / Ay hariç");
        assert.ok(!figs.some((f) => f.signs.some((s) => s.points.some((p) => p.key === "moon"))), "Ay cetvelde");
        const cancer = figs.flatMap((f) => f.signs).find((s) => s.sign === "cancer");
        info.push(`saat bilinmiyor yoğun (N011): Yengeç ${cancer ? `${cancer.points.length} nokta (Ay hariç)` : "grubu Ay çıkınca dağıldı"}`);
      }
      info.push(`${name}: ${figs.length} cetvel figürü, ${figs.flatMap((f) => f.signs).map((s) => `${s.sign}:${s.points.length}`).join(" ")} · DOCX ${d.docx.byteLength} B · PDF ${d.pdf.byteLength} B`);
    });
  }
  await test("cetvel görseli üretilemezse: Word ve PDF'te açık not (\"Harita görseli\" değil), tablo yine var; çark görseli yerinde", async () => {
    const d = rulerDocs[1][1];
    const charts = d.charts.map((c, i) => (i === 0 ? c : null));
    const docx = await docxText(await renderAstroReportDocx(d.report, charts.map((c) => c?.png ?? null), symbolFontBuffers()));
    const pdf = await pdfText(buildAstroReportPdf(d.report, charts, anamnezPdfFontBase64(), symbolFontsBase64()));
    for (const txt of [docx, pdf]) {
      assert.ok(txt.includes("Derece cetveli görseli bu raporda oluşturulamadı"), "cetvel notu");
      assert.ok(!txt.includes("Harita görseli bu raporda oluşturulamadı"), "çark notu yanlışlıkla");
      assert.ok(txt.includes("Cetveldeki noktalar"), "tablo");
    }
  });
  await test("cetvel: Word ve PDF metinleri aynı cetvel satırlarını aynı sırada içerir (format çelişkisi yok)", () => {
    for (const [, d] of rulerDocs) {
      const seq = (txt: string) => {
        const from = txt.indexOf("Cetveldeki noktalar");
        return [...txt.slice(from, from + 4000).matchAll(/≈? ?\d{1,2}°\d\d′/g)].map((m) => m[0].replace(/\s/g, "")).slice(0, 12);
      };
      assert.deepEqual(seq(d.docxText), seq(d.pdfText));
    }
  });

  // ── G3-GK1 (2026-11-23): AÇI TUTARLILIĞI + GERÇEK AÇILI NATAL + SON SAYFA ─────────────────────────────────────────────
  const withAspects = [...cases.values()].filter((t) => t.aspects.length > 0);
  await test("GK1 veri: açı listesi olan 20 sağlayıcı vakası + golden — summary.aspectBalance = listenin nitelik sayımı (iki alan AYNI açı kümesi)", () => {
    assert.equal(withAspects.length, 20);
    const goldenBal = golden.summary?.aspectBalance;
    for (const t of [...withAspects, ...(goldenBal && goldenBal.harmonious !== null ? [golden] : [])]) {
      const ab = t.summary!.aspectBalance!;
      const n = (k: string) => t.aspects.filter((a) => a.nature === k).length;
      assert.deepEqual([ab.harmonious, ab.challenging, ab.neutral], [n("harmonious"), n("challenging"), n("neutral")], t.echo?.date);
    }
    // Kırpılmış fixture vakaları (N021–N200): liste YOK, özet VAR → çelişki kaynağı veri değil fixture kırpması.
    const trimmed = [...cases.entries()].filter(([, t]) => !t.aspects.length && t.summary?.aspectBalance && (t.summary.aspectBalance.harmonious ?? 0) > 0);
    info.push(`açı verisi: ${withAspects.length} vakada liste + özet (sayımlar eşit); ${trimmed.length} vakada fixture kırpması (liste yok, özet var) — N044 / N074 bunlardan`);
  });
  const N044r = rulerDocs[1][1];
  const N074r = rulerDocs[2][1];
  await test("GK1 açı listesi kayıtta YOK (N044 / N074): \"Kayıtta açı yok.\" yerine açık etiket; özet satırı \"sağlayıcı özeti\"; çarkta açı çizgisi yok ve açıklama renkleri anlatmaz (Word + PDF)", () => {
    for (const d of [N044r, N074r]) {
      for (const txt of [d.docxText, d.pdfText]) {
        assert.ok(!txt.includes("Kayıtta açı yok."), "çelişkili ifade");
        assert.ok(txt.includes("Bu kayıtta açı listesi (açı çiftleri, orb, nitelik) bulunmuyor"), "açıklama");
        assert.ok(txt.includes("Açı dengesi (sağlayıcı özeti; açı listesi kayıtta yok)"), "özet etiketi");
        assert.ok(txt.includes("Bu kayıtta açı listesi olmadığı için açı çizgisi çizilmez."), "çark açıklaması");
      }
      const svg = buildNatalReportSvg(natalOf(d.report), WHEEL_FONT_STACK);
      assert.ok(!/opacity="0.8"\/>/.test(svg), "açı çizgisi olmamalı");
    }
  });

  // Gerçek açılı Natal: N011 (gerçek sağlayıcı yanıtı, 40 açı; Yengeç / Aslan / Başak yoğun) — saat biliniyor.
  const asp = await produce("8-acili-natal-N011", input(N011, { label: "Açılı natal — 40 kayıtlı açı (N011 fixture)" }));
  await test("GK1 açılı natal (N011): açı tablosu = kayıtlı liste (40 satır, sıra ve çiftler), Word ve PDF aynı orb değerleri; özet = listenin sayımı", () => {
    const blocks = asp.report.blocks;
    const h = blocks.findIndex((b) => b.kind === "heading" && b.text === "Açılar");
    const tb = blocks[h + 1];
    assert.ok(tb && tb.kind === "table", "açı tablosu");
    assert.equal(tb.table.rows.length, N011.aspects.length);
    N011.aspects.forEach((a, i) => {
      assert.ok(tb.table.rows[i][0].includes(BODY_LABELS[a.a as keyof typeof BODY_LABELS] ?? a.a), `satır ${i} a`);
      assert.ok(tb.table.rows[i][2].includes(BODY_LABELS[a.b as keyof typeof BODY_LABELS] ?? a.b), `satır ${i} b`);
    });
    const orbs = tb.table.rows.map((r) => r[3].replace(/\s/g, ""));
    const seg = (txt: string) => {
      const from = txt.indexOf("Açılar", txt.indexOf("Ev başlangıçları (cusp)"));
      const to = txt.indexOf("Açı kalıpları", from) > 0 ? txt.indexOf("Açı kalıpları", from) : txt.indexOf("Özet", from);
      return [...txt.slice(from, to).matchAll(/\d{1,2}°\d\d′/g)].map((m) => m[0]);
    };
    assert.deepEqual(seg(asp.docxText), orbs, "Word orb sırası");
    assert.deepEqual(seg(asp.pdfText), orbs, "PDF orb sırası");
    const ab = N011.summary!.aspectBalance!;
    for (const txt of [asp.docxText, asp.pdfText]) {
      assert.ok(txt.includes(`Uyumlu ${ab.harmonious} · Zorlayıcı ${ab.challenging} · Nötr ${ab.neutral}`), "özet");
      assert.ok(!txt.includes("açı listesi kayıtta yok") && !txt.includes("Kayıtta açı yok."), "yanlış etiket");
      assert.ok(txt.includes("Açı çizgileri: mavi uyumlu, kırmızı zorlayıcı, gri nötr"), "çark açıklaması renkleri");
    }
    info.push(`açılı natal N011: ${N011.aspects.length} açı (uyumlu ${ab.harmonious} · zorlayıcı ${ab.challenging} · nötr ${ab.neutral}) · DOCX ${asp.docx.byteLength} B · PDF ${asp.pdf.byteLength} B`);
  });
  await test("GK1 açılı natal (N011): çarkta her açı çizgisi doğru gezegen çiftinde (uç noktaları gerçek boylamda), renk niteliğe göre, minör açı kesikli", () => {
    const w = natalOf(asp.report);
    const svg = buildNatalReportSvg(w, WHEEL_FONT_STACK);
    const lines = [...svg.matchAll(/<line x1="([-0-9.]+)" y1="([-0-9.]+)" x2="([-0-9.]+)" y2="([-0-9.]+)" stroke="(#[0-9a-f]+)" stroke-width="([0-9.]+)"( stroke-dasharray="3 3")? opacity="0.8"\/>/g)];
    const pos = new Map(w.bodies.map((b) => [b.id, b.longitude]));
    const drawable = w.aspects.filter((a) => pos.has(a.a) && pos.has(a.b));
    assert.equal(lines.length, drawable.length, "çizgi sayısı");
    assert.ok(drawable.length >= 30, `çizilebilir açı ${drawable.length}`);
    const asc = w.angles!.ascendant.longitude;
    const P = (lon: number) => {
      const r = ((180 + (lon - asc)) * Math.PI) / 180;
      return [60 + 302 + 122 * Math.cos(r), 60 + 302 - 122 * Math.sin(r)];
    };
    const COLOR: Record<string, string> = { harmonious: "#2563eb", challenging: "#dc2626", neutral: "#64748b" };
    const MAJOR = new Set(["conjunction", "opposition", "trine", "square", "sextile"]);
    drawable.forEach((a, i) => {
      const m = lines[i];
      const [x1, y1] = P(pos.get(a.a)!);
      const [x2, y2] = P(pos.get(a.b)!);
      assert.ok(Math.abs(Number(m[1]) - x1) < 0.01 && Math.abs(Number(m[2]) - y1) < 0.01 && Math.abs(Number(m[3]) - x2) < 0.01 && Math.abs(Number(m[4]) - y2) < 0.01, `${a.a}-${a.b} uçları`);
      assert.equal(m[5], COLOR[a.nature ?? "neutral"], `${a.a}-${a.b} renk`);
      assert.equal(!!m[7], !MAJOR.has(a.type), `${a.a}-${a.b} kesikli`);
    });
    // Çizilen çiftler = kayıtlı listedeki çiftler (çark verisi kayıttan; yeni açı yok)
    assert.deepEqual(w.aspects.map((a) => `${a.a}|${a.b}|${a.type}`), N011.aspects.map((a) => `${a.a}|${a.b}|${a.type}`));
  });
  await test("GK1 saat bilinmiyor (N011 maskeli): açı çizgisi yok, Ay'lı açılar listede yok, açı dengesi Ay hariç listeden (≈) — yanlış kesinlik geri gelmiyor", () => {
    const d = rulerDocs[4][1];
    const svg = buildNatalReportSvg(natalOf(d.report), WHEEL_FONT_STACK);
    assert.ok(!/opacity="0.8"\/>/.test(svg));
    const kept = N011.aspects.filter((a) => a.a !== "moon" && a.b !== "moon");
    const n = (k: string) => kept.filter((a) => a.nature === k).length;
    for (const txt of [d.docxText, d.pdfText]) {
      assert.ok(txt.includes(`Açı dengesi (Ay hariç, ≈)`) && txt.includes(`Uyumlu ${n("harmonious")} · Zorlayıcı ${n("challenging")} · Nötr ${n("neutral")}`), "Ay hariç denge");
      assert.ok(!txt.includes("sağlayıcı özeti"), "saatsizde sağlayıcı özeti etiketi olmamalı");
    }
  });

  /** PDF sayfa metinleri (unpdf, sayfa sayfa). */
  const pdfPages = async (buf: Uint8Array) => {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: false });
    return (text as string[]).map(norm);
  };
  const CLOSING = "Rapor Yaşam Sistemi Astroloji modülünde, kayıtlı analizden oluşturulmuştur.";
  await test("GK1 son sayfa (PDF): kapanış notu \"Kayıt bilgisi\" bölümüyle AYNI sayfada (tek başına yeni sayfaya düşmez); sayfa sayısı artmaz; içerik eksiksiz", async () => {
    const all: [string, Awaited<ReturnType<typeof produce>>][] = [["1-normal-cumra", known], ["1b", sparse], ...rulerDocs.map(([n, d]) => [n, d] as [string, Awaited<ReturnType<typeof produce>>]), ["8-acili", asp]];
    for (const [name, d] of all) {
      const pages = await pdfPages(d.pdf);
      const last = pages[pages.length - 1];
      assert.ok(last.includes(CLOSING), `${name}: kapanış son sayfada`);
      assert.ok(last.includes("Kayıt bilgisi"), `${name}: kapanış "Kayıt bilgisi" bölümünden ayrılmış (son sayfa yalnız kapanış)`);
      assert.ok(last.includes("Harita ve teknik sonuçlar kaydedildiği andaki"), `${name}: açıklama metni`);
      // Kapanışsız ilk yerleşimle aynı ya da daha az sayfa (yalnız yeniden yerleşim; içerik silinmez)
      const plain = buildAstroReportPdf({ ...d.report, keepRecordTail: false }, d.charts, anamnezPdfFontBase64(), symbolFontsBase64());
      assert.ok(pages.length <= (await pdfPages(plain)).length, `${name}: sayfa sayısı arttı`);
      assert.equal(norm((await pdfText(plain)).replace(/Sayfa \d+ \/ \d+/g, "")).length, norm(d.pdfText.replace(/Sayfa \d+ \/ \d+/g, "")).length, `${name}: metin uzunluğu değişti`);
    }
  });
  await test("GK1 son bölüm (Word): \"Kayıt bilgisi\" başlığı → tablo satırları → açıklama → kapanış \"sonrakiyle birlikte tut\" zinciri; Natal dışı raporlarda zincir YOK", async () => {
    const chainOk = async (buf: Buffer) => {
      const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
      const from = xml.lastIndexOf("Kayıt bilgisi");
      const to = xml.indexOf("Rapor Yaşam Sistemi Astroloji modülünde", from);
      const paras = [...xml.slice(from, to).matchAll(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
      return paras.length > 0 && paras.every((p) => p.includes("<w:keepNext/>"));
    };
    for (const d of [N044r, N074r, asp]) assert.ok(await chainOk(d.docx), "natal zincir");
    const comp = buildAstroReport({ ...input(cases.get("N044")!), technique: "western.composite", technical: cases.get("N044")! } as unknown as ReportAnalysisInput);
    assert.equal(comp.keepRecordTail, undefined, "kompozit bayrağı");
    assert.equal(await chainOk(await renderAstroReportDocx(comp, null, symbolFontBuffers())), false, "kompozitte zincir olmamalı");
  });

  // 8 ev sistemi
  const base = cumra;
  const ascLon = base.angles!.ascendant.longitude;
  const ws = [...cases.values()].find((t) => t.houseSystem === "whole-sign")!;
  const mk = (hs: string, cusps: number[]) =>
    ({
      ...base,
      houseSystem: hs,
      houses: cusps.map((lon, i) => {
        const l = ((lon % 360) + 360) % 360;
        return { number: i + 1, longitude: l, sign: SIGN_IDS[Math.floor(l / 30) % 12], degreeInSign: l % 30 };
      }),
    }) as unknown as NatalTechnical;
  const systems: [string, NatalTechnical, string][] = [
    ["placidus", base, "bağımsız Swiss Ephemeris referansı (Çumra)"],
    ["whole-sign", ws, "sağlayıcı fixture"],
    ["equal", mk("equal", Array.from({ length: 12 }, (_, i) => ascLon + i * 30)), "tanım gereği ASC + 30°·k (yalnız biçim)"],
    ["koch", mk("koch", base.houses.map((h) => h.longitude)), "Koch sağlayıcı referansı YOK — yalnız biçim (houses[] → tablo)"],
  ];
  for (const sys of ["regiomontanus", "campanus", "porphyry", "alcabitius"] as const) {
    const r = deriveLocalNatalHouses(base, sys);
    assert.ok(r.ok);
    systems.push([sys, r.technical as unknown as NatalTechnical, "mevcut yerel ev motoru (değiştirilmedi)"]);
  }
  for (const [name, t, note] of systems) {
    const r = await produce(`5-ev-${name}`, input(t, { label: `Ev sistemi ${name}`, houseCalculation: ["regiomontanus", "campanus", "porphyry", "alcabitius"].includes(name) ? "local" : undefined }));
    await test(`8 ev sistemi — ${name}: ev başlangıcı tablosu houses[] ile (Word + PDF); eksen notu`, () => {
      for (const h of t.houses) for (const txt of [r.docxText, r.pdfText]) assert.ok(txt.includes(`${h.number}. ev`) && txt.includes(formatDegree(h.degreeInSign)), `ev ${h.number}`);
      const mcCusp = t.houses.find((h) => h.number === 10)!;
      const mcSep = Math.min(Math.abs(mcCusp.longitude - t.angles!.midheaven.longitude) % 360, 360 - (Math.abs(mcCusp.longitude - t.angles!.midheaven.longitude) % 360)) >= 0.02;
      for (const txt of [r.docxText, r.pdfText]) assert.equal(txt.includes("10. ev başlangıcından ayrı"), mcSep, `MC notu`);
    });
    info.push(`ev ${name}: ${note}`);
  }

  await test("diğer teknikler: natal katmanı verilmeyen çark wheelSvg ile AYNI (Kompozit / Dönüş / Transit çarkı natal almaz)", () => {
    // G3 (2026-11-23): yoğun gruplu veriyle (N044) de diğer tekniklerde derece cetveli / ikinci görsel OLUŞMAZ.
    for (const [technique, src] of [["western.composite", cumra], ["western.solar_return", cumra], ["western.relocation", cumra], ["western.composite", cases.get("N044")!], ["western.solar_return", cases.get("N044")!], ["western.relocation", cases.get("N044")!]] as const) {
      const technical = technique === "western.solar_return" ? { chart: src } : src;
      const r = buildAstroReport({ ...input(src), technique, technical } as unknown as ReportAnalysisInput);
      for (const b of r.blocks) if (b.kind === "chart" && "chart" in b) assert.equal(b.chart.natal, undefined, technique);
      assert.ok(r.blocks.filter((b) => b.kind === "chart").length <= 1, `${technique}: tek görsel`);
      assert.ok(!r.blocks.some((b) => b.kind === "chart" && "figure" in b && b.figure.type === "natalDegreeRuler"), `${technique}: cetvel olmamalı`);
      assert.ok(!r.blocks.some((b) => b.kind === "heading" && b.text.startsWith("Derece cetveli")), `${technique}: cetvel başlığı olmamalı`);
      const ch = r.blocks.find((b) => b.kind === "chart");
      if (ch && ch.kind === "chart" && "chart" in ch) {
        const png = renderWheelPng(ch.chart, 600);
        assert.ok(png);
        assert.ok(buildWheelSvg(ch.chart).includes("<svg"));
      }
    }
  });

  for (const l of info) console.log(`  · ${l}`);
  console.log(`\nnatal-g3-report harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void ((): AstroReport | null => null);
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
