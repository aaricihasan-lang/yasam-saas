/**
 * I18N-F1-R5 (HD) — Hesaplanmış harita görünümü EN/TR çizim harness'ı. Ağ / DB / sağlayıcı çağrısı YOK.
 *
 *   E1–E4  EN çizimde görünür metin + erişilebilirlik öznitelikleri (aria-label / title / SVG <title>/<desc>) Türkçe harf
 *          içermez (marka "Yaşam Sistemi" hariç); beklenen EN başlıklar var.
 *   K1–K4  Dil değişimi KANONİK veriyi değiştirmez: aynı kayıtlı sonuçtan TR ve EN çizimin aktivasyon / merkez durumu /
 *          kanal / kapı veri öznitelikleri birebir aynı; çizim computed_result'ı değiştirmez.
 *   S1–S3  Premium BodyGraph SVG merkez başlıkları: TR'de geometri satırları AYNEN (BOĞAZ, SOLAR/PLEKSUS), EN'de İngilizce;
 *          satır sayısı (SOLAR / PLEXUS) korunur.
 *   R1–R2  Sistem Yorumu panelinin kabuk metinleri EN'de İngilizce (sağlayıcı anlatısı A6 kapsamındadır).
 * Çalıştırma: npx tsx scripts/hd-i18n/chart-en-render.harness.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { extractSystemReading } from "../../lib/human-design/providers/roxy/systemReading";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { HdSystemReadingView } from "../../app/human-design/kayitli-haritalar/components/HdSystemReadingPanel";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let pass = 0;
let fail = 0;
const failed: string[] = [];
function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failed.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const BRAND = /Yaşam Sistemi/g;
const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** Görünür metin düğümleri + kullanıcıya görünen öznitelik değerleri (aria-label, title). */
function visibleTexts(html: string): string[] {
  const attrs = [...html.matchAll(/\s(?:aria-label|title)="([^"]*)"/g)].map((m) => decode(m[1]));
  const text = decode(html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, "\n"))
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...attrs, ...text];
}
const turkishLeft = (html: string) => visibleTexts(html).filter((s) => TR_CHARS.test(s.replace(BRAND, "")));
const dataAttrs = (html: string, attr: string) => [...html.matchAll(new RegExp(`${attr}="([^"]*)"`, "g"))].map((m) => m[1]).join("|");

const FIXTURE = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;
const v = validateRoxyBodygraph(FIXTURE);
if (!v.ok) throw new Error("fixture");
const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
if (!n.ok) throw new Error("norm");
const chart = n.chart;
const before = JSON.stringify(chart);
const roxyRender = buildRoxyRenderPayload(FIXTURE);

console.log("HD I18N — harita görünümü EN/TR çizimi");
const tr = renderToStaticMarkup(createElement(HdComputedChartView, { result: chart, roxyRender }), "tr");
const en = renderToStaticMarkup(createElement(HdComputedChartView, { result: chart, roxyRender }), "en");

// E — EN metinler
const left = turkishLeft(en);
ok("E1 EN harita görünümünde Türkçe görünür metin / aria / title yok (marka hariç)", left.length === 0, left.slice(0, 8).join(" ¦ "));
ok("E2 EN başlıklar: Centers / Defined Channels / Active Gates / Additional Human Design Details", ["Centers", "Defined Channels (", "Active Gates (", "Additional Human Design Details"].every((s) => en.includes(s)));
ok("E3 EN gezegen sütunu: Unconscious / Conscious + EN gezegen adı aria'sı", en.includes("Unconscious") && en.includes("Conscious") && /aria-label="Sun: gate \d+, line \d"/.test(en));
ok("E4 EN bilgi paneli başlıkları (Type / Profile / Definition / Inner Authority / Incarnation Cross)", ["Type", "Profile", "Definition", "Inner Authority", "Incarnation Cross"].every((s) => en.includes(`>${s}<`)));

// K — kanonik değişmezlik
ok("K1 aktivasyon öznitelikleri TR = EN", dataAttrs(tr, "data-hd-activation") === dataAttrs(en, "data-hd-activation") && dataAttrs(tr, "data-hd-activation").length > 0);
ok("K2 merkez durumu öznitelikleri TR = EN", dataAttrs(tr, "data-hd-center") === dataAttrs(en, "data-hd-center") && dataAttrs(tr, "data-hd-center").split("|").length === 9);
ok("K3 kanal + kapı öznitelikleri TR = EN", dataAttrs(tr, "data-hd-channel") === dataAttrs(en, "data-hd-channel") && dataAttrs(tr, "data-hd-gate") === dataAttrs(en, "data-hd-gate"));
ok("K4 çizim (TR + EN) computed_result'ı değiştirmez", JSON.stringify(chart) === before);

// S — premium SVG merkez başlıkları
const svgTexts = (html: string) => [...html.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => decode(m[1]));
const trSvg = svgTexts(tr);
const enSvg = svgTexts(en);
ok("S1 TR SVG merkez başlıkları geometriyle aynı (BAŞ, BOĞAZ, SOLAR, PLEKSUS, KÖK)", ["BAŞ", "BOĞAZ", "SOLAR", "PLEKSUS", "KÖK"].every((s) => trSvg.includes(s)));
ok("S2 EN SVG merkez başlıkları İngilizce (HEAD, THROAT, SOLAR, PLEXUS, ROOT) ve Türkçe başlık yok", ["HEAD", "THROAT", "SOLAR", "PLEXUS", "ROOT"].every((s) => enSvg.includes(s)) && !enSvg.some((s) => TR_CHARS.test(s)));
ok("S3 SVG metin primitif sayısı TR = EN (satır sayısı / yerleşim korunur)", trSvg.length === enSvg.length && trSvg.length > 0);

// R — Sistem Yorumu kabuğu
const dto = extractSystemReading(FIXTURE);
if (dto) {
  const srEn = renderToStaticMarkup(createElement(HdSystemReadingView, { data: dto }), "en");
  const srTr = renderToStaticMarkup(createElement(HdSystemReadingView, { data: dto }), "tr");
  ok("R1 EN Sistem Yorumu kabuk başlıkları (General / Centers ( / Activations ()", ["General", "Centers (", "Activations ("].every((s) => srEn.includes(s)) && !srEn.includes(">Genel<"));
  ok("R2 TR Sistem Yorumu kabuk başlıkları aynen (Genel / Merkezler ( / Aktivasyonlar ()", [">Genel<", "Merkezler (", "Aktivasyonlar ("].every((s) => srTr.includes(s)));
} else {
  ok("R0 fixture'dan sistem yorumu DTO'su üretildi", false);
}

console.log(`\nHD I18N HARİTA EN/TR ÇİZİM: ${pass} PASS / ${fail} FAIL`);
if (fail) {
  for (const f of failed) console.log(` - ${f}`);
  process.exit(1);
}
