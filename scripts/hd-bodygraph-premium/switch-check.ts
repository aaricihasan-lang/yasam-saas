/**
 * Geri dönüş anahtarı kontrolü — rendererConfig'te seçili çizicinin ekranda ve Word'de gerçekten kullanıldığını doğrular.
 * Beklenen değerler ortam değişkeniyle verilir (anahtarı değiştiren betik dosyayı geçici çevirir, sonra geri koyar):
 *   EXPECT_INDIVIDUAL=premium|roxy-official  EXPECT_CONNECTION=premium|legacy-roxy|legacy-schematic
 * Çalıştırma: npx tsx scripts/hd-bodygraph-premium/switch-check.ts
 */
import Module from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
{
  // "server-only" yalnız Next derlemesinde anlamlı → test sürecinde boş modül (pro-harness ile aynı yöntem).
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { HD_CONNECTION_BODYGRAPH, HD_INDIVIDUAL_BODYGRAPH } from "../../lib/human-design/bodygraph/rendererConfig";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { ConnectionResultView } from "../../app/human-design/iliski-grup/components/RelationResultViews";
import { expectedConnection, type HdConnectionResult } from "../../lib/human-design/relations/connection";
import type { RelationAnalysisView } from "../../lib/human-design/relations/relationService";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d === undefined ? "" : ` — ${JSON.stringify(d)}`}`); } };

const expI = process.env.EXPECT_INDIVIDUAL ?? "premium";
const expC = process.env.EXPECT_CONNECTION ?? "premium";
ok(`anahtar değerleri (${HD_INDIVIDUAL_BODYGRAPH} / ${HD_CONNECTION_BODYGRAPH})`, HD_INDIVIDUAL_BODYGRAPH === expI && HD_CONNECTION_BODYGRAPH === expC);

const FX = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));
const v = validateRoxyBodygraph(FX);
if (!v.ok) throw new Error("fixture");
const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
if (!n.ok) throw new Error("normalize");
const payload = buildRoxyRenderPayload(FX)!;
const withRoxy = renderToStaticMarkup(createElement(HdComputedChartView, { result: n.chart, roxyRender: payload }));
const engineRec = renderToStaticMarkup(createElement(HdComputedChartView, { result: n.chart }));
if (expI === "premium") {
  ok("bireysel: premium (Roxy kaydı + eski motor kaydı)", withRoxy.includes('data-hd-renderer="premium"') && engineRec.includes('data-hd-renderer="premium"') && withRoxy.includes('data-hd-cbg-palette="individual"'));
} else {
  ok("bireysel geri dönüş: Roxy kaydı → Roxy resmî bileşeni", withRoxy.includes('data-hd-renderer="roxy-official"') && withRoxy.includes("<roxy-bodygraph"));
  ok("bireysel geri dönüş: eski motor kaydı → eski Yaşam Sistemi çizimi", engineRec.includes('data-hd-renderer="legacy"'));
}

const A = [10, 20, 57, 1, 8, 59, 37, 22, 41, 64, 4, 25, 18, 16, 13, 30, 36];
const B = [34, 48, 7, 31, 6, 40, 55, 61, 24, 60, 2, 14, 20, 39, 51, 33, 10];
const e = expectedConnection(A, B, [], []);
const r = { schema: "hd-connection-1", totalChannels: e.channels.length, channels: e.channels.map((c) => { const [a, b] = c.id.split("-").map(Number); return { ...c, gateA: a, gateB: b, name: c.id, nameLocalized: null, circuit: "x", circuitLocalized: null, centers: ["", ""] as [string, string], dynamicLocalized: null }; }), centers: e.centers.map((c) => ({ ...c, name: c.code, nameLocalized: null })), combinedDefinition: e.combinedDefinition, combinedDefinitionLocalized: null, summary: { electromagnetic: 0, dominance: 0, compromise: 0, companionship: 0 } } as HdConnectionResult;
const av = { id: "x", kind: "connection", memberCount: 2, relationType: null, createdAt: "2026-10-18T00:00:00Z", result: r, participants: [A, B].map((g, i) => ({ position: i, clientId: null, name: i ? "B" : "A", sourceChartId: null, status: "current", birthDate: null, birthTime: null, birthPlace: null, gates: g })) } as unknown as RelationAnalysisView;
const conn = renderToStaticMarkup(createElement(ConnectionResultView, { a: av }));
if (expC === "premium") ok("Connection: premium (mavi / turuncu)", conn.includes("data-hd-cbg=") && conn.includes('data-hd-cbg-palette="connection"'));
else if (expC === "legacy-roxy") ok("Connection geri dönüş: Roxy bileşeni", conn.includes("roxy-hd-connection") && !conn.includes("data-hd-cbg="));
else ok("Connection geri dönüş: şematik çizim", conn.includes('data-hd-scene="composite"') && !conn.includes("data-hd-cbg="));

(async () => {
  const { renderRelationImage } = await import("../../lib/human-design/relations/relationImages");
  const png = renderRelationImage(av, 600, null);
  ok(`Connection Word görseli üretilir (${expC})`, !!png && png.png.subarray(1, 4).toString() === "PNG" && (expC === "premium" ? Math.abs(png.width / png.height - 602 / 752) < 0.01 : Math.abs(png.width / png.height - 400 / 660) < 0.01), png && [png.width, png.height]);
  console.log(`\nANAHTAR KONTROLÜ (${expI} / ${expC}): ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
})();
