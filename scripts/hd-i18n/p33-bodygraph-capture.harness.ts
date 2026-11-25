/**
 * I18N-F1-R5 HD-B — P33 BodyGraph yakalama (Word'e gömülen PNG) dil kontrolü. DB / ağ / tarayıcı YOK.
 *
 * Premium yakalama, ekrandaki çizimle AYNI merkez başlığı eşlemesini (useLocalizedCenterText) alır:
 *   - TR: sahne AYNEN → SVG bayt-eşit (bugünkü PNG girdisi değişmez).
 *   - EN: yalnız role=center metinleri değişir; geometri / kapı / kanal primitifleri aynı; Türkçe merkez metni 0.
 * Yakalama hata KODLARI katalogda (tr+en) ve TR metinleri lib'deki eski metinle birebir.
 * Sunucu PNG doğrulama kodları hd.apiErrors.bodygraphPng (tr+en).
 *
 * Çalıştır: npx tsx scripts/hd-i18n/p33-bodygraph-capture.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "./intlRender";
import { useLocalizedCenterText } from "../../app/human-design/_i18n/bodygraphCenterText";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { premiumStateFromChart } from "../../lib/human-design/bodygraph/premiumChartState";
import { buildConnectionBodygraphScene, connectionBodygraphSvg, type CbgPrim } from "../../lib/human-design/relations/connectionBodygraphScene";
import type { BodygraphCaptureErrorCode } from "../../lib/human-design/reporting/bodygraphCapture";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const RAW = JSON.parse(readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));
const v = validateRoxyBodygraph(RAW);
if (!v.ok) throw new Error("fixture");
const n = normalizeRoxyBodygraph(v.value, {
  date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48,
  nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z",
});
if (!n.ok) throw new Error("normalize");
const state = premiumStateFromChart(n.chart as never);
if (!state) throw new Error("premium state");
const scene = buildConnectionBodygraphScene(state);

/** Hook'u gerçek next-intl sağlayıcısında çalıştırıp eşlenmiş sahneyi döndürür. */
function mapped(locale: "tr" | "en"): CbgPrim[] {
  let out: CbgPrim[] = [];
  function Probe(): ReactElement {
    out = useLocalizedCenterText()(scene);
    return createElement("i");
  }
  renderToStaticMarkup(createElement(Probe), locale);
  return out;
}

console.log("\n—— A. Premium sahne: TR aynen, EN yalnız merkez metni");
const tr = mapped("tr");
const en = mapped("en");
const svg = (p: CbgPrim[]) => connectionBodygraphSvg(p, { logoHref: null, fontFamily: "Geist" });
ok("TR: eşleme kimlik (aynı dizi nesnesi)", tr === scene);
ok("TR: SVG bayt-eşit", svg(tr) === svg(scene));
const centerTexts = (p: CbgPrim[]) => p.filter((x) => x.k === "text" && (x as { role?: string }).role === "center").map((x) => (x as { text: string }).text);
const enCenters = centerTexts(en);
ok("EN: merkez metni sayısı TR ile aynı", enCenters.length === centerTexts(scene).length && enCenters.length > 0, `${enCenters.length}`);
ok("EN: merkez metninde Türkçe harf 0", !enCenters.some((s) => /[çğıöşüÇĞİÖŞÜ]/.test(s)), enCenters.join(","));
ok("EN: TR merkez sözcükleri yok (BAŞ/BOĞAZ/KÖK/KALP/DALAK/PLEKSUS)", !enCenters.some((s) => /^(BAŞ|BOĞAZ|KÖK|KALP|DALAK|PLEKSUS)$/.test(s)), enCenters.join(","));
const nonText = (p: CbgPrim[]) => JSON.stringify(p.filter((x) => !(x.k === "text" && (x as { role?: string }).role === "center")));
ok("EN: geometri / kapı / kanal primitifleri TR ile aynı", nonText(en) === nonText(scene));

console.log("\n—— B. Yakalama hata kodları (istemci) ve sunucu PNG kodları katalogda");
const trRec = JSON.parse(readFileSync(path.join(ROOT, "messages/tr/hd.records.json"), "utf8")).hd.records.report.capture as Record<string, string>;
const enRec = JSON.parse(readFileSync(path.join(ROOT, "messages/en/hd.records.json"), "utf8")).hd.records.report.capture as Record<string, string>;
const codes: BodygraphCaptureErrorCode[] = ["NO_BROWSER", "RENDERER_LOAD", "NOT_DRAWN", "MISMATCH", "VIEWBOX", "RASTER"];
const libSrc = readFileSync(path.join(ROOT, "lib/human-design/reporting/bodygraphCapture.ts"), "utf8") + readFileSync(path.join(ROOT, "lib/human-design/reporting/premiumBodygraphCapture.ts"), "utf8");
for (const c of codes) {
  ok(`capture.${c}: tr+en var`, !!trRec[c] && !!enRec[c]);
  ok(`capture.${c}: TR katalog = lib'deki eski metin (code: "${c}", error: "…")`, libSrc.includes(`code: "${c}", error: ${JSON.stringify(trRec[c])}`));
  ok(`capture.${c}: EN'de Türkçe harf yok`, !/[çğıöşüÇĞİÖŞÜ]/.test(enRec[c] ?? ""));
}
const btn = readFileSync(path.join(ROOT, "app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx"), "utf8");
ok("düğme: hata kodu katalogdan (capture.<kod>)", btn.includes("t(`capture.${cap.code}`)"));
ok("düğme: premium yakalamaya ekran eşlemesi, Roxy yakalamaya ekran dili", btn.includes("chartId, localizeCenters)") && btn.includes("chartId, locale)"));
const trApi = JSON.parse(readFileSync(path.join(ROOT, "messages/tr/hd.apiErrors.json"), "utf8")).hd.apiErrors.bodygraphPng as Record<string, string>;
const enApi = JSON.parse(readFileSync(path.join(ROOT, "messages/en/hd.apiErrors.json"), "utf8")).hd.apiErrors.bodygraphPng as Record<string, string>;
const pngSrc = readFileSync(path.join(ROOT, "lib/human-design/reporting/bodygraphPng.ts"), "utf8");
for (const c of ["EMPTY", "TOO_LARGE", "NOT_PNG", "CORRUPT", "UNSUPPORTED_FORMAT", "TOO_SMALL", "TOO_BIG_DIMENSIONS", "BAD_ASPECT"]) {
  ok(`bodygraphPng.${c}: tr+en`, !!trApi[c] && !!enApi[c]);
  const trText = (trApi[c] ?? "").replace("{min}", "${HD_BODYGRAPH_PNG_MIN_HEIGHT}");
  ok(`bodygraphPng.${c}: TR = doğrulayıcı metni`, pngSrc.includes(`fail("${c}", ${c === "TOO_SMALL" ? "`" + trText + "`" : JSON.stringify(trText)})`));
}
const route = readFileSync(path.join(ROOT, "app/api/hd/reports/professional/route.ts"), "utf8");
ok("route: TR'de doğrulayıcının ayrıntılı metni aynen (check.error)", route.includes('resolveOutputLocale(req).locale === "tr"') && route.includes("? check.error"));

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
