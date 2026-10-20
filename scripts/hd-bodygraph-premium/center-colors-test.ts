/**
 * HD BodyGraph — TANIMLI MERKEZ İÇ RENKLERİ testi (SAF; ağ / DB / Roxy çağrısı YOK).
 *   1) Kanonik eşleme (merkez → renk ailesi) = kullandığımız sağlayıcının resmî BodyGraph bileşenindeki eşleme
 *      (public/vendor/roxy-ui/0.48.0/bodygraph.js — dosyadan çalışma anında okunur; BAĞIMSIZ kaynak).
 *   2) Okunaklılık: her ailede merkez adı WCAG kontrastı degradenin iki ucunda ≥ 4,5.
 *   3) 20 GERÇEK kayıtlı analiz (prod, Roxy; scripts/hd-stage2/golden-roxy-20.txt — Generator, Manifesting Generator,
 *      Manifestor, Projector, Reflector; 0–8 tanımlı merkez): bireysel premium durum kayıtlı verilerle birebir; her tanımlı
 *      merkez KENDİ ailesinin rengiyle, her açık merkez beyaz (açık stil); merkez tanımlı/tanımsız verisi DEĞİŞMEDİ;
 *      merkez dışındaki TÜM çizim öğeleri (kanallar, kapılar, sayılar, silüet, logo) eski tek tip modla BİREBİR aynı.
 *   4) Günün transiti, kişisel transit (natal + transit) ve Connection durumları aynı eşlemeyi kullanır.
 *   5) Word / dışa aktarım SVG'si (sunucu resvg) degradeleri ve doğru dolguları içerir.
 * Çalıştır: npx tsx scripts/hd-bodygraph-premium/center-colors-test.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { CENTERS, CHANNELS, getDefinedCenters } from "../../lib/human-design/engine/channels";
import { CENTER_COLOR_FAMILY, CENTER_FAMILY_STYLE, HD_CENTER_FILL_MODE, type CenterColorFamily } from "../../lib/human-design/bodygraph/centerColors";
import { premiumStateFromChart } from "../../lib/human-design/bodygraph/premiumChartState";
import { buildConnectionBodygraphScene, cbgElements, connectionBodygraphSvg, type CbgState } from "../../lib/human-design/relations/connectionBodygraphScene";
import { overlaySceneState, transitSceneState } from "../../lib/human-design/transit/transitScene";
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import type { HdComputedChart } from "../../lib/human-design/chart/computedChart";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = path.resolve(__dirname, "../..");
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const INK = "#1e2a78";
const gradOf = (f: CenterColorFamily) => `url(#cbgCenter${f[0].toUpperCase()}${f.slice(1)})`;

/** Sahne → yalnız merkez poligonları + merkez adları (ve diğer öğeler ayrı). */
function render(state: CbgState) {
  const prims = buildConnectionBodygraphScene(state);
  const centers: Record<string, { fill: string; labels: string[] }> = {};
  const others: unknown[] = [];
  let lastCenter = "";
  for (const p of prims) {
    if (p.k === "center") {
      lastCenter = p.engine;
      centers[p.engine] = { fill: String(cbgElements(p, null)[0].attrs.fill), labels: [] };
      continue;
    }
    if (p.k === "text" && p.role === "center") {
      centers[lastCenter].labels.push(String(cbgElements(p, null)[0].attrs.fill));
      continue;
    }
    others.push(cbgElements(p, null));
  }
  return { centers, others: JSON.stringify(others) };
}

/** Beklenen: tanımlı → kendi ailesi + aile etiket rengi; açık → açık stil + mürekkep. Eksik / fazla boyama sayılır. */
function checkCenters(state: CbgState, defined: Set<string>) {
  const r = render(state);
  const wrong: string[] = [];
  for (const c of CENTERS) {
    const got = r.centers[c];
    if (!got) { wrong.push(`${c}: çizilmedi`); continue; }
    if (defined.has(c)) {
      const fam = CENTER_COLOR_FAMILY[c];
      if (got.fill !== gradOf(fam)) wrong.push(`${c}: dolgu ${got.fill} ≠ ${gradOf(fam)}`);
      if (got.labels.some((l) => l !== CENTER_FAMILY_STYLE[fam].label)) wrong.push(`${c}: etiket ${got.labels.join(",")}`);
    } else {
      if (got.fill !== "url(#cbgCenterOpen)") wrong.push(`${c}: açık merkez boyandı (${got.fill})`);
      if (got.labels.some((l) => l !== INK)) wrong.push(`${c}: açık merkez etiketi ${got.labels.join(",")}`);
    }
  }
  return { wrong, r };
}

function main() {
  section("1. Kanonik eşleme = sağlayıcının resmî BodyGraph bileşeni (bağımsız kaynak)");
  const vendor = src("public/vendor/roxy-ui/0.48.0/bodygraph.js");
  const vendorMap = new Map([...vendor.matchAll(/\{id:"([a-z-]+)"[^}]{0,400}?color:"([a-z]+)"/g)].map((m) => [m[1], m[2]]));
  const ROXY_ID: Record<string, string> = { Head: "head", Ajna: "ajna", Throat: "throat", G: "g", Heart: "heart", Spleen: "spleen", SolarPlexus: "solar-plexus", Sacral: "sacral", Root: "root" };
  const diffs = CENTERS.filter((c) => vendorMap.get(ROXY_ID[c]) !== CENTER_COLOR_FAMILY[c]);
  ok(vendorMap.size === 9 && diffs.length === 0, "9 merkezin renk ailesi sağlayıcı bileşeniyle birebir: Baş/G altın · Ajna yeşil · Kalp/Sakral kırmızı · Boğaz/Dalak/Solar Pleksus/Kök kahverengi", { vendor: Object.fromEntries(vendorMap), diffs });
  const vendorHex: Record<string, string> = {};
  for (const m of vendor.matchAll(/--center-(gold|green|red|brown):(#[0-9a-f]{6})/gi)) vendorHex[m[1]] = m[2].toLowerCase();
  ok((Object.keys(CENTER_FAMILY_STYLE) as CenterColorFamily[]).every((f) => CENTER_FAMILY_STYLE[f].reference === vendorHex[f]), "aile referans renkleri sağlayıcı bileşenindeki değerlerle aynı (#e0a200 / #2f8f00 / #c41f1f / #76502f)", vendorHex);
  ok(HD_CENTER_FILL_MODE === "canonical", "merkezi anahtar: canonical (merkez kimliğine göre sabit renk)");

  section("2. Okunaklılık (WCAG kontrastı)");
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const cr = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const f of Object.keys(CENTER_FAMILY_STYLE) as CenterColorFamily[]) {
    const s = CENTER_FAMILY_STYLE[f];
    const a = cr(s.label, s.top);
    const b = cr(s.label, s.bottom);
    ok(a >= 4.5 && b >= 4.5, `${f}: merkez adı kontrastı üst ${a.toFixed(2)} / alt ${b.toFixed(2)} (≥ 4,5)`);
    ok(cr(s.bottom, "#ffffff") >= 1.8, `${f}: tanımlı merkez açık (beyaz) merkezden net ayrılır (kontrast ${cr(s.bottom, "#ffffff").toFixed(2)})`);
  }

  section("3. 20 gerçek kayıtlı analiz — bireysel premium BodyGraph");
  const BODY_ORDER = ["Sun", "Earth", "Moon", "NorthNode", "SouthNode", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
  const lines = src("scripts/hd-stage2/golden-roxy-20.txt").split(/\r?\n/).filter((l) => l.startsWith("P"));
  const types = new Map<string, number>();
  const counts = new Set<number>();
  for (const l of lines) {
    const f = l.split("~");
    const [id, type, cent, ch, acts] = [f[0], f[4], f[14], f[15], f[16]];
    const storedCenters = cent ? cent.split(",") : [];
    const storedChannels = ch ? ch.split(",") : [];
    const activations = acts.split(/\s+/).filter(Boolean).map((t, i) => {
      const [g, ln] = t.split(".").map(Number);
      return { side: i < 13 ? "personality" : "design", planet: BODY_ORDER[i % 13], gate: g, line: ln };
    });
    const chart = { activations, channels: storedChannels.map((x) => ({ id: x })), centers: { defined: storedCenters } } as unknown as HdComputedChart;
    const st = premiumStateFromChart(chart);
    if (!st) { ok(false, `${id} ${type}: premium durum üretilemedi (kayıtlı veriyle uyuşmadı)`); continue; }
    const defined = new Set(storedCenters);
    const sameData = [...st.definedCenters].sort().join() === [...defined].sort().join()
      && getDefinedCenters(CHANNELS.filter((c) => storedChannels.includes(c.id))).slice().sort().join() === [...defined].sort().join();
    const { wrong, r } = checkCenters(st, defined);
    const old = render({ ...st, centerFill: "uniform" });
    const oldCentersUniform = CENTERS.every((c) => old.centers[c].fill === (defined.has(c) ? "url(#cbgCenterDef)" : "url(#cbgCenterOpen)") && old.centers[c].labels.every((x) => x === INK));
    ok(sameData && wrong.length === 0, `${id} ${type}: ${defined.size} tanımlı merkez kendi rengiyle (${[...defined].map((c) => `${c}=${CENTER_COLOR_FAMILY[c]}`).join(" ") || "hiçbiri — tümü açık"}), ${9 - defined.size} açık merkez beyaz; tanımlı/tanımsız verisi aynen`, wrong);
    ok(r.others === old.others && oldCentersUniform, `${id}: merkez dışındaki tüm çizim (kanal, kapı, sayı, silüet, logo) eski görünümle BİREBİR; eski mod = tek tip lavanta (geri dönüş anahtarı çalışır)`);
    types.set(type, (types.get(type) ?? 0) + 1);
    counts.add(defined.size);
  }
  ok(lines.length >= 10 && ["Generator", "Manifesting Generator", "Manifestor", "Projector", "Reflector"].every((t) => types.has(t)), `≥10 gerçek analiz (${lines.length}); tüm tipler: ${[...types].map(([t, n]) => `${t} ${n}`).join(", ")}`);
  ok(counts.has(0) && counts.has(2) && counts.has(8), `tanımlı merkez sayısı çeşitliliği: ${[...counts].sort((a, b) => a - b).join(", ")} (0 = Reflector, 2 = en az tanımlı — HD'de tek merkez tanımlanamaz, her kanal iki merkezi bağlar)`);

  section("4. Transit ve Connection görünümleri");
  const gt = computeGeneralTransit(new Date("2026-10-20T09:00:00Z"));
  const ts = transitSceneState(gt);
  ok(checkCenters(ts, new Set(gt.definedCenters)).wrong.length === 0, `Günün transiti (20.10.2026 12:00 TR): ${gt.definedCenters.join(", ") || "—"} kendi renkleriyle, diğerleri açık`);
  const natal = [1, 8, 13, 33, 7, 31, 20, 57];
  const os = overlaySceneState(natal, gt.activeGates);
  ok(checkCenters(os, os.definedCenters).wrong.length === 0 && os.definedCenters.size > 0, `Kişisel transit (natal + transit): ${[...os.definedCenters].join(", ")} kendi renkleriyle`);
  const connGates = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [i + 1, i + 1 === 1 || i + 1 === 59 ? "A" : i + 1 === 8 || i + 1 === 6 ? "B" : null])) as CbgState["gates"];
  const connChannels = Object.fromEntries(CHANNELS.map((c) => [c.id, c.id === "1-8" || c.id === "6-59" ? { id: c.id, state: "defined" as const, holderA: connGates[Math.min(c.gateA, c.gateB)]!, holderB: connGates[Math.max(c.gateA, c.gateB)]! } : { id: c.id, state: "none" as const }]));
  const conn: CbgState = { gates: connGates, channels: connChannels, definedCenters: new Set(["G", "Throat", "Sacral", "SolarPlexus"]), full: true, palette: "connection" };
  ok(checkCenters(conn, conn.definedCenters).wrong.length === 0, "Connection paleti: tanımlı merkezler aynı kanonik renklerle (kişi renkleri A/B yalnız kapı ve kanallarda)");

  section("5. Word / dışa aktarım SVG'si (sunucu resvg ile aynı sahne)");
  const p02 = lines.find((l) => l.startsWith("P02~"))!.split("~");
  const st2 = premiumStateFromChart({
    activations: p02[16].split(/\s+/).filter(Boolean).map((t, i) => ({ side: i < 13 ? "personality" : "design", planet: BODY_ORDER[i % 13], gate: Number(t.split(".")[0]), line: Number(t.split(".")[1]) })),
    channels: p02[15].split(",").map((id) => ({ id })),
    centers: { defined: p02[14].split(",") },
  } as unknown as HdComputedChart)!;
  const svg = connectionBodygraphSvg(buildConnectionBodygraphScene(st2), { logoHref: null, fontFamily: "Geist" });
  const ids = ["cbgCenterGold", "cbgCenterGreen", "cbgCenterRed", "cbgCenterBrown"];
  ok(ids.every((i) => svg.includes(`id="${i}"`)) && svg.includes('fill="url(#cbgCenterRed)"') && svg.includes('fill="url(#cbgCenterBrown)"') && svg.includes('fill="url(#cbgCenterGreen)"') && !svg.includes('fill="url(#cbgCenterDef)"'),
    "P02 (8 tanımlı merkez) SVG: dört degrade tanımlı; kırmızı / kahverengi / yeşil dolgular var; eski tek tip dolgu yok");

  console.log(`\nHD TANIMLI MERKEZ RENKLERİ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main();
