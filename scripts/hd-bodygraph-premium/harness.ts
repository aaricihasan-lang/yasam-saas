/**
 * Premium BodyGraph — bireysel harita + aktif/pasif çizici düzeni (SAF; ağ / DB yok).
 *   A) Kayıtlı Roxy haritası (gerçek fixture) → premium durum: tanımlı kanallar / merkezler kayıtlı listelerle birebir,
 *      kapı tonları Kişilik / Tasarım eşlemesine göre; tutarsız kayıt → null (pasif çiziciye düşer).
 *   B) Görünüm: HdComputedChartView varsayılan premium; 9 merkez, 64 kapı; Design / Personality korunur.
 *   C) Pasif eski yapılar SİLİNMEDİ ve çalışır (Roxy bireysel, eski Yaşam Sistemi çizimi, Roxy Connection,
 *      şematik Connection); seçim tek yerde (rendererConfig).
 *   D) Sunucu PNG doğrulayıcısı premium oranı ve Roxy oranını kabul eder; kare reddedilir.
 *
 * Çalıştırma: npx tsx scripts/hd-bodygraph-premium/harness.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { premiumStateFromChart } from "../../lib/human-design/bodygraph/premiumChartState";
import { HD_CONNECTION_BODYGRAPH, HD_INDIVIDUAL_BODYGRAPH, HD_PREMIUM_INDIVIDUAL_TONE } from "../../lib/human-design/bodygraph/rendererConfig";
import { buildConnectionBodygraphScene, cbgStateFromModel, connectionBodygraphSvg } from "../../lib/human-design/relations/connectionBodygraphScene";
import { buildCompositeModel } from "../../lib/human-design/relations/compositeModel";
import { CBG_GATES } from "../../lib/human-design/relations/connectionBodygraphGeometry";
import { validateBodygraphPng } from "../../lib/human-design/reporting/bodygraphPng";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { HdRoxyBodygraph } from "../../app/human-design/kayitli-haritalar/components/HdRoxyBodygraph";
import { BodyGraph } from "../../app/human-design/harita/components/BodyGraph";
import { LegacySchematicCompositePanel, LegacyRoxyCompositePanel } from "../../app/human-design/iliski-grup/components/LegacyConnectionPanels";
import { expectedConnection, type HdConnectionResult } from "../../lib/human-design/relations/connection";
import type { RelationAnalysisView } from "../../lib/human-design/relations/relationService";

const ROOT = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 300)}`}`); }
}

const FIXTURE = JSON.parse(src("scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"));
const v = validateRoxyBodygraph(FIXTURE);
if (!v.ok) throw new Error("fixture");
const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
if (!n.ok) throw new Error("normalize");
const chart = n.chart;
const GP = new Map(CBG_GATES.map(([g, x, y]) => [g, [x, y] as const]));
const payload = buildRoxyRenderPayload(FIXTURE)!;

console.log("\n—— A. Bireysel harita → premium durum");
const st = premiumStateFromChart(chart);
ok("A1 kayıtlı Roxy haritasından premium durum üretilir", !!st);
if (st) {
  const defined = Object.values(st.channels).filter((c) => c.state === "defined").map((c) => c.id).sort().join();
  ok("A2 tanımlı kanallar = kayıtlı kanal listesi", defined === chart.channels.map((c) => c.id).sort().join(), { defined, stored: chart.channels.map((c) => c.id) });
  ok("A3 tanımlı merkezler = kayıtlı tanımlı merkezler", [...st.definedCenters].sort().join() === [...chart.centers.defined].sort().join());
  const P = new Set(chart.activations.filter((a) => a.side === "personality").map((a) => a.gate));
  const D = new Set(chart.activations.filter((a) => a.side === "design").map((a) => a.gate));
  const toneOk = Array.from({ length: 64 }, (_, i) => i + 1).every((g) => {
    const h = st.gates[g];
    const exp = P.has(g) && D.has(g) ? "both" : P.has(g) ? HD_PREMIUM_INDIVIDUAL_TONE.personality : D.has(g) ? HD_PREMIUM_INDIVIDUAL_TONE.design : null;
    return h === exp;
  });
  ok("A4 kapı tonları: Kişilik = A, Tasarım = B, ikisi = iki renkli; palet bireysel", toneOk && HD_PREMIUM_INDIVIDUAL_TONE.personality === "A" && HD_PREMIUM_INDIVIDUAL_TONE.design === "B" && st.palette === "individual");
  const svg = connectionBodygraphSvg(buildConnectionBodygraphScene(st), { logoHref: null, fontFamily: "Geist" });
  ok("A5 premium SVG geçerli: 9 merkez, 64 kapı, NaN yok", !/NaN|undefined/.test(svg) && (svg.match(/<polygon /g) ?? []).length === 9 && (svg.match(/ r="6\.2"/g) ?? []).length === 64);
  // Renk: bireysel SİYAH (Kişilik) / KIRMIZI (Tasarım); mavi / turuncu YOK. İki taraflı kapı iki renkli.
  const bodyColors = [...svg.matchAll(/<polyline [^>]*stroke="(#[0-9a-f]{6})" stroke-width="9\.8"/g)].map((m) => m[1]);
  ok("A5b bireysel boru renkleri: siyah + kırmızı (gövde katmanı); mavi / turuncu yok", bodyColors.includes("#2a2c36") && bodyColors.includes("#dc2626") && !bodyColors.includes("#1f63e6") && !bodyColors.includes("#ff7a0f"), [...new Set(bodyColors)]);
  const pGates = [...P].filter((g) => !D.has(g)), dGates = [...D].filter((g) => !P.has(g)), both = [...P].filter((g) => D.has(g));
  const gateFill = (g: number) => { const p = GP.get(g)!; const m = new RegExp(`<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="6\\.2" fill="url\\(#(cbgGate[A-Z])\\)"`).exec(svg); return m?.[1] ?? null; };
  ok("A5c Kişilik kapıları siyah (cbgGateP), Tasarım kapıları kırmızı (cbgGateD)", pGates.every((g) => gateFill(g) === "cbgGateP") && dGates.every((g) => gateFill(g) === "cbgGateD"), { p: pGates.map(gateFill), d: dGates.map(gateFill) });
  const twoTone = (g: number) => { const [x, y] = GP.get(g)!; const X = x.toFixed(2), T = (y - 6.2).toFixed(2), B = (y + 6.2).toFixed(2); return svg.includes(`d="M ${X} ${T} A 6.2 6.2 0 0 0 ${X} ${B} Z" fill="url(#cbgGateP)"`) && svg.includes(`d="M ${X} ${T} A 6.2 6.2 0 0 1 ${X} ${B} Z" fill="url(#cbgGateD)"`); };
  ok("A5d iki tarafta aktif kapılar iki renkli (sol yarı siyah, sağ yarı kırmızı)", both.length > 0 && both.every(twoTone), both.map((g) => [g, twoTone(g)]));
  const png = new Resvg(svg, { fitTo: { mode: "height", value: 1800 }, font: { loadSystemFonts: false, fontFiles: [join(ROOT, "public/fonts/Geist-Regular.ttf")], defaultFontFamily: "Geist" } }).render().asPng();
  const check = validateBodygraphPng(Buffer.from(png));
  ok("A6 premium oranlı PNG sunucu doğrulayıcısından geçer", check.ok, check.ok ? undefined : check.error);
}
const tampered = JSON.parse(JSON.stringify(chart));
tampered.channels = tampered.channels.slice(1);
ok("A7 kayıtlı kanal listesi tutarsız → premium üretilmez (pasif çiziciye düşer)", premiumStateFromChart(tampered) === null);
const tamperedC = JSON.parse(JSON.stringify(chart));
tamperedC.centers.defined = tamperedC.centers.defined.slice(1);
ok("A8 kayıtlı merkez listesi tutarsız → premium üretilmez", premiumStateFromChart(tamperedC) === null);

console.log("\n—— B. Bireysel görünüm");
const before = JSON.stringify(chart);
const view = renderToStaticMarkup(createElement(HdComputedChartView, { result: chart, roxyRender: payload }));
ok("B1 varsayılan çizici premium; Roxy bileşeni aktif değil", HD_INDIVIDUAL_BODYGRAPH === "premium" && view.includes('data-hd-renderer="premium"') && !view.includes("<roxy-bodygraph"));
ok("B2 9 merkez + 64 kapı + Türkçe renk açıklaması (siyah / kırmızı)", (view.match(/data-hd-cbg-center=/g) ?? []).length === 9 && (view.match(/data-hd-cbg-gate=/g) ?? []).length === 64 && view.includes("Kişilik (bilinçli)") && view.includes("Tasarım (bilinçsiz)") && view.includes("background:#22242c") && view.includes("background:#dc2626") && view.includes('data-hd-cbg-palette="individual"'));
ok("B3 Design 13 + Personality 13 sütunları korunur", [...view.matchAll(/data-hd-activation=/g)].length === 26);
ok("B4 görünüm kayıtlı veriyi değiştirmez", JSON.stringify(chart) === before);
ok("B5 bireysel grafikte kanal seçimi yüzeyi yok (salt görüntü)", !view.includes("data-hd-cbg-hit"));
const viewTampered = renderToStaticMarkup(createElement(HdComputedChartView, { result: tampered, roxyRender: payload }));
ok("B6 tutarsız kayıtta güvenli düşüş: pasif Roxy çizici", viewTampered.includes('data-hd-renderer="roxy-official"'));

console.log("\n—— C. Pasif eski yapılar korunur");
const roxyPassive = renderToStaticMarkup(createElement(HdRoxyBodygraph, { data: payload as Record<string, unknown> }));
ok("C1 Roxy resmî bireysel bileşen çalışır (pasif)", roxyPassive.includes("<roxy-bodygraph") && roxyPassive.includes("hide-readings"));
const legacySvg = renderToStaticMarkup(createElement(BodyGraph, { result: chart }));
ok("C2 eski Yaşam Sistemi bireysel çizimi çalışır (pasif)", (legacySvg.match(/<polygon/g) ?? []).length === 9);
ok("C3 eski Word yakalaması duruyor (captureRoxyBodygraphPng)", src("lib/human-design/reporting/bodygraphCapture.ts").includes("export async function captureRoxyBodygraphPng"));
const files = [
  "app/human-design/kayitli-haritalar/components/HdRoxyBodygraph.tsx",
  "app/human-design/harita/components/BodyGraph.tsx",
  "app/human-design/iliski-grup/components/RoxyConnectionChart.tsx",
  "app/human-design/iliski-grup/components/LegacyConnectionPanels.tsx",
  "app/human-design/iliski-grup/helpers/relationGraphicCapture.ts",
  "lib/human-design/relations/roxyConnectionChart.ts",
  "lib/human-design/relations/compositeScene.ts",
  "lib/human-design/relations/compositeLayout.ts",
  "public/vendor/roxy-ui/0.48.0/bodygraph.js",
  "public/vendor/roxy-ui/0.49.0/hd-connection.js",
];
const missing = files.filter((f) => !existsSync(join(ROOT, f)));
ok("C4 pasif dosyalar projede (silinmedi)", missing.length === 0, missing);
ok("C5 Connection varsayılanı premium; eski paneller seçilebilir", HD_CONNECTION_BODYGRAPH === "premium" && src("app/human-design/iliski-grup/components/RelationResultViews.tsx").includes("<LegacyRoxyCompositePanel") && src("app/human-design/iliski-grup/components/RelationResultViews.tsx").includes("<LegacySchematicCompositePanel"));
// Eski Connection panelleri gerçekten çizebiliyor mu (şematik: kaynak kapılarla)
const A = [10, 20, 57, 1, 8, 59, 37, 22, 41, 64, 4, 25, 18, 16, 13, 30, 36];
const B = [34, 48, 7, 31, 6, 40, 55, 61, 24, 60, 2, 14, 20, 39, 51, 33, 10];
const e = expectedConnection(A, B, [], []);
const r = { schema: "hd-connection-1", totalChannels: e.channels.length, channels: e.channels.map((c) => { const [a, b] = c.id.split("-").map(Number); return { ...c, gateA: a, gateB: b, name: c.id, nameLocalized: null, circuit: "x", circuitLocalized: null, centers: ["", ""] as [string, string], dynamicLocalized: null }; }), centers: e.centers.map((c) => ({ ...c, name: c.code, nameLocalized: null })), combinedDefinition: e.combinedDefinition, combinedDefinitionLocalized: null, summary: { electromagnetic: 0, dominance: 0, compromise: 0, companionship: 0 } } as HdConnectionResult;
const av = { id: "x", kind: "connection", memberCount: 2, relationType: null, createdAt: "2026-10-18T00:00:00Z", result: r, participants: [A, B].map((g, i) => ({ position: i, clientId: null, name: i ? "B" : "A", sourceChartId: null, status: "current", birthDate: null, birthTime: null, birthPlace: null, gates: g })) } as unknown as RelationAnalysisView;
const schem = renderToStaticMarkup(createElement(LegacySchematicCompositePanel, { a: av, r, notice: null, summary: null }));
ok("C6 pasif şematik Connection paneli çizer", schem.includes('data-hd-scene="composite"') && schem.includes('data-hd-composite="ok"'));
const roxyConn = renderToStaticMarkup(createElement(LegacyRoxyCompositePanel, { a: av, r, summary: null }));
const cm = buildCompositeModel(A, B, r);
if (cm.ok) {
  const csvg = connectionBodygraphSvg(buildConnectionBodygraphScene(cbgStateFromModel(cm.model)), { logoHref: null, fontFamily: "Geist" });
  const cBody = [...csvg.matchAll(/<polyline [^>]*stroke="(#[0-9a-f]{6})" stroke-width="9\.8"/g)].map((m) => m[1]);
  ok("C8 Connection renkleri değişmedi: A mavi, B turuncu; siyah / kırmızı yok", cBody.includes("#1f63e6") && cBody.includes("#ff7a0f") && !cBody.includes("#2a2c36") && !cBody.includes("#dc2626") && !/url\(#cbgGate[PD]\)/.test(csvg));
} else ok("C8 Connection modeli", false, cm.reason);
ok("C7 pasif Roxy Connection paneli yüklenir", roxyConn.includes("roxy-hd-connection"));

console.log("\n—— D. Sunucu PNG oranı");
const mk = (w: number, h: number) => Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/></svg>`).render().asPng());
const roxyOk = validateBodygraphPng(mk(1271, 1800));
const premOk = validateBodygraphPng(mk(1441, 1800));
const square = validateBodygraphPng(mk(1800, 1800));
ok("D1 Roxy oranı (pasif yol) kabul", roxyOk.ok);
ok("D2 premium oranı (aktif) kabul", premOk.ok);
ok("D3 kare → BAD_ASPECT", !square.ok && square.code === "BAD_ASPECT");

console.log(`\nPREMIUM BODYGRAPH: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
