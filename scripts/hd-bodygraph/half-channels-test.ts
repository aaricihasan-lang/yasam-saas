/**
 * BİREYSEL BODYGRAPH — YARIM KANAL OKUNABİLİRLİĞİ regresyon testi (gerçek Chromium, self-host @roxyapi/ui 0.48.0).
 * Ağ yok, Roxy çağrısı yok: KAYITLI fixture (2018-07-20) render yüküyle çizilir.
 *
 *   H0 Topoloji (salt okuma): 36 arka plan kanalı resmî kapı çiftleri; 7-31/1-8/10-20/13-33/21-45 kesişmez
 *   H1 İşaretlenen parçaların hepsi TANIMLI OLMAYAN kanala ait
 *   H2 Beklenen yarım kanal kümesi (tek kapısı aktif kanallar) = işaretlenen küme (birebir)
 *   H3 Tanımlı kanal parçaları işaretlenmez ve kesikli değildir; Roxy .stripe örtüsü (kendi deseni) dokunulmaz
 *   H4 İşaretli parçalar hesaplanmış stilde kesikli (stroke-dasharray ≠ none)
 *   H5 Geometri değişmez (tüm path d / line uçları önce = sonra); renkler değişmez
 *   H6 İdempotent (ikinci çağrı aynı sayı, tek stil düğümü); null kök → -1
 *   H7 Word yakalaması (bodygraphCapture) çıktısında kesikli stil satır içine yazılmış
 * Çalıştır: npx tsx scripts/hd-bodygraph/half-channels-test.ts [--png <dosya.png>]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { CHANNELS } from "../../lib/human-design/engine/channels";
import { HD_CHANNEL_PAIRS, HD_HALF_ONLY_CLASS, definedChannelIdsFromRender, markRoxyHalfOnlyChannels } from "../../lib/human-design/bodygraph/roxyHalfChannels";

const PNG = process.argv.includes("--png") ? process.argv[process.argv.indexOf("--png") + 1] : null;
const BUNDLE = readFileSync(path.join(process.cwd(), "public/vendor/roxy-ui/0.48.0/bodygraph.js"), "utf8");
const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); } };

async function main() {
  const payload = buildRoxyRenderPayload(FIXTURE)!;
  const defined = definedChannelIdsFromRender(payload as Record<string, unknown>);
  const active = new Set<number>((FIXTURE.gates as Array<{ gate: number }>).map((g) => g.gate));
  const expectedHalf = CHANNELS.filter((c) => active.has(c.gateA) !== active.has(c.gateB)).map((c) => c.id).sort();
  const expectedFull = CHANNELS.filter((c) => active.has(c.gateA) && active.has(c.gateB)).map((c) => c.id).sort();
  console.log(`Fixture: tanımlı ${defined.join(" ")} · beklenen yarım kanal ${expectedHalf.length}`);
  ok(defined.slice().sort().join() === expectedFull.join(), `kayıtlı tanımlı kanallar = iki kapısı aktif kanallar (${expectedFull.join(" ")})`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await page.route("**/*", (r) => (r.request().url().startsWith("data:") || r.request().url() === "about:blank" ? r.continue() : r.abort()));
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div id="host" style="width:432px"></div></body></html>`);
  await page.addScriptTag({ content: BUNDLE });
  await page.addScriptTag({ content: `var __name = (f) => f; window.__mark = ${markRoxyHalfOnlyChannels.toString()};` });
  await page.evaluate(async (data) => {
    await customElements.whenDefined("roxy-bodygraph");
    const el = document.createElement("roxy-bodygraph") as HTMLElement & { data?: unknown; updateComplete?: Promise<unknown> };
    el.className = "hd-fit";
    el.setAttribute("hide-readings", "");
    el.setAttribute("hide-sections", "header,details,legend,themes,facts");
    el.setAttribute("lang", "tr");
    el.data = data;
    document.getElementById("host")!.appendChild(el);
    if (el.updateComplete) await el.updateComplete;
  }, payload);
  await page.waitForTimeout(500);

  // Önce: geometri + renk anlık görüntüsü; H0 topoloji
  const snap = () => page.evaluate(() => {
    const root = document.querySelector("roxy-bodygraph")!.shadowRoot!;
    return [...root.querySelectorAll("svg path, svg line, svg polyline")].map((p) => [p.getAttribute("d") ?? "", p.getAttribute("x1") ?? "", p.getAttribute("y2") ?? "", getComputedStyle(p).stroke].join("|"));
  });
  const before = await snap();
  const topo = await page.evaluate(() => {
    const root = document.querySelector("roxy-bodygraph")!.shadowRoot!;
    const pos = new Map<number, { x: number; y: number }>();
    for (const t of root.querySelectorAll("svg text")) {
      const n = Number((t.textContent ?? "").trim());
      if (Number.isInteger(n) && n >= 1 && n <= 64 && !pos.has(n)) { const b = (t as SVGGraphicsElement).getBBox(); pos.set(n, { x: b.x + b.width / 2, y: b.y + b.height / 2 }); }
    }
    const pairs: string[] = [];
    for (const p of root.querySelectorAll("svg path, svg line")) {
      const g = p as SVGGeometryElement; let L = 0;
      try { L = g.getTotalLength(); } catch { continue; }
      if (!(L > 3)) continue;
      const s = g.getPointAtLength(0), e = g.getPointAtLength(L);
      const near = (q: DOMPoint) => [...pos].map(([n, v]) => ({ n, d: Math.hypot(q.x - v.x, q.y - v.y) })).sort((a, b) => a.d - b.d)[0];
      const a = near(s), b = near(e);
      if (a.d <= 12 && b.d <= 12 && a.n !== b.n) pairs.push(`${Math.min(a.n, b.n)}-${Math.max(a.n, b.n)}`);
    }
    return { gates: pos.size, pairs: [...new Set(pairs)], pos: [...pos] };
  });
  const official = new Set(CHANNELS.map((c) => c.id));
  ok(topo.gates === 64, `H0 64/64 kapı numarası çizili (${topo.gates})`);
  ok(topo.pairs.length === 36 && topo.pairs.every((p) => official.has(p)), `H0 arka plan kanalları = resmî 36 çift (${topo.pairs.length}; resmî olmayan: ${JSON.stringify(topo.pairs.filter((p) => !official.has(p)))})`);
  const gp = new Map(topo.pos);
  const seg = (id: string) => id.split("-").map((n) => gp.get(Number(n))!);
  const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
    const o = (p: typeof a, q: typeof a, r: typeof a) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (const id of ["7-31", "1-8", "10-20", "13-33", "21-45"]) {
    const [a, b] = seg(id);
    const x = [...official].filter((o) => o !== id && (() => { const [c, d] = seg(o); return cross(a, b, c, d); })());
    ok(x.length === 0, `H0 ${id} başka kanalla kesişmez ${x.length ? JSON.stringify(x) : ""}`);
  }

  // İşaretle
  const r1 = await page.evaluate(({ d, pairs }) => (window as unknown as { __mark: (r: ShadowRoot | null, d: string[], p: Array<[number, number]>) => number }).__mark(document.querySelector("roxy-bodygraph")!.shadowRoot, d, pairs), { d: defined, pairs: HD_CHANNEL_PAIRS as Array<[number, number]> });
  const marks = await page.evaluate((cls) => {
    const root = document.querySelector("roxy-bodygraph")!.shadowRoot!;
    const marked = [...root.querySelectorAll(`.${cls}`)].map((e) => ({ id: e.getAttribute("data-hd-half-only")!, dash: getComputedStyle(e).strokeDasharray }));
    const unmarkedHalfDash = [...root.querySelectorAll(".bg-half")].filter((e) => !e.classList.contains(cls)).map((e) => getComputedStyle(e).strokeDasharray + "@" + e.getAttribute("class") + "@" + (() => { try { return (e as SVGGeometryElement).getTotalLength().toFixed(1); } catch { return "?"; } })());
    return { marked, unmarkedHalfDash, styles: root.querySelectorAll("#hd-half-only-style").length };
  }, HD_HALF_ONLY_CLASS);
  const markedIds = [...new Set(marks.marked.map((m) => m.id))].sort();
  console.log(`İşaretlenen parça ${r1} · kanal ${markedIds.join(" ")}`);
  ok(r1 > 0, `H1 en az bir yarım parça işaretlendi (${r1})`);
  ok(markedIds.every((id) => !defined.includes(id)), "H1 işaretlenenlerin hiçbiri tanımlı kanal değil");
  ok(markedIds.join() === expectedHalf.join(), `H2 işaretlenen küme = beklenen yarım kanal kümesi (eksik ${JSON.stringify(expectedHalf.filter((x) => !markedIds.includes(x)))}, fazla ${JSON.stringify(markedIds.filter((x) => !expectedHalf.includes(x)))})`);
  for (const id of ["7-31", "1-8", "10-20", "13-33", "21-45"]) {
    if (expectedHalf.includes(id)) ok(markedIds.includes(id), `H2 kritik yarım kanal ${id} kesikli`);
    else ok(!markedIds.includes(id), `H2 kritik kanal ${id} (yarım değil) işaretlenmedi`);
  }
  const plain = marks.unmarkedHalfDash.filter((d) => !/stripe/.test(d));
  const stripes = marks.unmarkedHalfDash.filter((d) => /stripe/.test(d));
  ok(plain.every((d) => d.startsWith("none@")), `H3 işaretlenmemiş (tanımlı kanal) düz parçalar düz kalır (${plain.length} parça)`);
  ok(stripes.every((d) => d.startsWith("7px, 7px@")), `H3 Roxy çizgili (Design+Personality) örtüsü kendi deseninde, dokunulmadı (${stripes.length} parça)`);
  ok(marks.marked.length > 0 && marks.marked.every((m) => m.dash !== "none" && m.dash !== ""), "H4 işaretli parçalar hesaplanmış stilde kesikli");
  const after = await snap();
  const geomSame = before.length === after.length && before.every((b, i) => b === after[i]);
  ok(geomSame, "H5 geometri ve renkler değişmedi (d / uç noktalar / stroke)");
  const r2 = await page.evaluate(({ d, pairs }) => (window as unknown as { __mark: (r: ShadowRoot | null, d: string[], p: Array<[number, number]>) => number }).__mark(document.querySelector("roxy-bodygraph")!.shadowRoot, d, pairs), { d: defined, pairs: HD_CHANNEL_PAIRS as Array<[number, number]> });
  const styles2 = await page.evaluate(() => document.querySelector("roxy-bodygraph")!.shadowRoot!.querySelectorAll("#hd-half-only-style").length);
  ok(r2 === r1 && styles2 === 1 && marks.styles === 1, `H6 idempotent (${r1}→${r2}; stil düğümü ${styles2})`);
  ok(markRoxyHalfOnlyChannels(null, defined, HD_CHANNEL_PAIRS) === -1, "H6 null kök → -1 (dokunmaz)");
  if (PNG) await page.locator("roxy-bodygraph").screenshot({ path: PNG });
  await browser.close();

  // H7 Word yakalaması: kaynakta işaretleme çağrısı clone'dan ÖNCE ve dasharray satır içi listede
  const cap = readFileSync(path.join(process.cwd(), "lib/human-design/reporting/bodygraphCapture.ts"), "utf8");
  const iMark = cap.indexOf("markRoxyHalfOnlyChannels(el.shadowRoot");
  const iClone = cap.indexOf("svg.cloneNode(true)");
  ok(iMark > 0 && iMark < iClone && /"stroke-dasharray"/.test(cap), "H7 Word yakalaması işaretlemeyi klondan önce uygular; stroke-dasharray satır içine yazılır");
  const comp = readFileSync(path.join(process.cwd(), "app/human-design/kayitli-haritalar/components/HdRoxyBodygraph.tsx"), "utf8");
  ok(/markRoxyHalfOnlyChannels\(el\.shadowRoot/.test(comp) && /observer\?\.disconnect\(\)/.test(comp), "H7 ekran bileşeni işaretler ve yeniden çizimde tekrar uygular (observer temizlenir)");

  console.log(`\nBİREYSEL BODYGRAPH YARIM KANAL: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
