/**
 * I18N-F1-R5 HD-B — Dört Ok/PHS paneli, Profesyonel Rapor Özeti penceresi, eski Rapor Oluştur ekranı (+ eksik bilgi
 * şeridi): TR çizim TABAN sürümle BAYT-BAYT aynı, EN çizimde Türkçe sistem metni yok, TR katalog değerleri taban
 * kaynak metinden.
 *
 * Yöntem: taban (BASE) ve güncel bileşen kaynakları geçici bir klasöre kopyalanır; yalnız TEST için durum enjeksiyonu
 * (useState başlangıcı globalThis'ten) ve ArrowCard export'u eklenir — ürün kodu değişmez. Ağ / DB yok.
 * Çalıştırma: npx tsx scripts/hd-i18n/ui-b-en-smoke.ts [BASE_SHA]
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "./intlRender";
import * as VL from "../../lib/human-design/variables/variablesLabels";
import type { VariablesArrowDto, VariablesDto } from "../../lib/human-design/variables/variablesContract";
import type { HdProfessionalReportSummary } from "../../lib/human-design/reporting/reportSummary";
import trVariables from "../../messages/tr/hd.variables.json";
import enVariables from "../../messages/en/hd.variables.json";
import trSummary from "../../messages/tr/hd.proSummary.json";
import enSummary from "../../messages/en/hd.proSummary.json";
import trBuilder from "../../messages/tr/hd.reportBuilder.json";
import enBuilder from "../../messages/en/hd.reportBuilder.json";

const ROOT = process.cwd();
const BASE = process.argv[2] || "1825fc937";
const TMP = join(ROOT, "scripts/hd-i18n/.ui-b-tmp");

let pass = 0;
let fail = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else {
    fail++;
    fails.push(name);
  }
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond || info === undefined ? "" : ` — ${JSON.stringify(info).slice(0, 600)}`}`);
};
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const BRAND = /Yaşam Sistemi/g;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/⟦[^⟧]*⟧/g, " ");
const g = globalThis as unknown as Record<string, unknown>;

const leaves = (o: unknown, p = "", out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (v && typeof v === "object") leaves(v, p ? `${p}.${k}` : k, out);
    else out[p ? `${p}.${k}` : k] = String(v);
  }
  return out;
};
const gitShow = (f: string) => execSync(`git show ${BASE}:${f}`, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString().replace(/\r\n/g, "\n");

// ── Geçici kopyalar (taban + güncel), yalnız test enjeksiyonuyla ──────────────────────────────────────────────
type Patch = [RegExp | string, string];
function stage(rel: string, tag: "base" | "cur", patches: Patch[]): string {
  let src = tag === "base" ? gitShow(rel) : readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
  // Geçici kopya scripts/ altında klasik JSX dönüşümüyle derlenir → React kapsamda olmalı (yalnız test kopyası).
  src = src.replace(/^"use client";\n/, '"use client";\nimport React from "react";\nvoid React;\n');
  src = src.replace(/from "\.\.\/\.\.\/components\//g, 'from "@/app/human-design/components/');
  for (const [a, b] of patches) {
    const before = src;
    src = typeof a === "string" ? src.split(a).join(b) : src.replace(a, b);
    if (before === src) throw new Error(`yama uygulanamadı (${tag} ${rel}): ${String(a)}`);
  }
  const out = join(TMP, tag, rel.split("/").pop()!);
  mkdirSync(join(TMP, tag), { recursive: true });
  writeFileSync(out, src);
  return out;
}

const VAR = "app/human-design/kayitli-haritalar/components/HdVariablesPanel.tsx";
const SUM = "app/human-design/kayitli-raporlar/components/HdProfessionalSummaryModal.tsx";
const BAN = "app/human-design/rapor-olustur/components/HdMissingChartInfoBanner.tsx";
const varPatches: Patch[] = [
  ["useState<VariablesDto | null>(() => sessionMemo.get(memoKey(chartId)) ?? null)", "useState<VariablesDto | null>(() => (globalThis as unknown as { __HDV?: VariablesDto }).__HDV ?? null)"],
  ["function ArrowCard(", "export function ArrowCard("],
];
const sumPatches: Patch[] = [
  ["useState<HdProfessionalReportSummary | null>(null)", "useState<HdProfessionalReportSummary | null>((globalThis as unknown as { __HDS?: HdProfessionalReportSummary }).__HDS ?? null)"],
  ["useState<string | null>(null)", "useState<string | null>((globalThis as unknown as { __HDSE?: string }).__HDSE ?? null)"],
];

function arrow(key: VariablesArrowDto["key"], side: VariablesArrowDto["side"], o: Partial<VariablesArrowDto>): VariablesArrowDto {
  return {
    key, position: "x", side, planet: "Sun", color: 4, tone: 2, base: 3, direction: "left", confident: true, baseCertain: true,
    name: "n", layer: "l", colorLabel: "c", directionLabel: "d", baseName: "b",
    text: {
      name: `⟦ad ${key}⟧`, layer: "⟦katman⟧", position: "⟦konum⟧", planet: "⟦gezegen⟧", colorLabel: "⟦Renk Etiketi⟧", directionLabel: "⟦Yön Etiketi⟧",
      baseName: "⟦Base adı⟧", description: "⟦açıklama⟧", layerDescription: "⟦katman açıklaması⟧", colorMeaning: "⟦renk anlamı⟧",
      toneMeaning: "⟦ton anlamı⟧", directionMeaning: "⟦yön anlamı⟧",
    },
    cognition: key === "determination" ? { label: "smell", labelText: "⟦Koku⟧", description: "⟦bilişsel açıklama⟧" } : null,
    ...o,
  };
}
const DATA_SURE: VariablesDto = {
  confident: true, confidenceMarginDeg: 0.01, baseDescription: "⟦base açıklaması⟧", historicalOffset: false,
  arrows: [
    arrow("determination", "design", {}),
    arrow("environment", "design", { direction: "right", tone: 5 }),
    arrow("motivation", "personality", {}),
    arrow("perspective", "personality", { direction: "right", tone: 6, baseCertain: false }),
  ],
};
const DATA_UNSURE: VariablesDto = {
  ...DATA_SURE, confident: false, historicalOffset: true,
  arrows: [
    arrow("determination", "design", { confident: false }),
    arrow("environment", "design", { direction: "right", tone: 5, confident: false }),
    arrow("motivation", "personality", {}),
    arrow("perspective", "personality", { direction: "right", tone: 6 }),
  ],
};
const SUMMARY: HdProfessionalReportSummary = {
  title: "⟦Rapor başlığı⟧", generatedAt: "2026-11-25T09:30:00.000Z",
  client: { name: "⟦Ayşe Örnek⟧", birthDate: "1990-07-15", birthTime: "⟦14:30⟧", birthPlace: "⟦İzmir⟧" },
  chart: { profile: "⟦3/5⟧", definition: "⟦Tekli⟧", definedCenters: ["⟦Sakral⟧", "⟦Kök⟧"] },
  type: "⟦Jeneratör⟧", authority: "⟦Sakral⟧", channels: ["⟦34-57⟧"], gates: ["⟦Kapı 34⟧"], hangingGates: ["⟦Kapı 1⟧"],
  omittedCount: 2, hasChartImage: true,
};

async function main() {
  rmSync(TMP, { recursive: true, force: true });
  try {
    const mod = async (p: string) => (await import(pathToFileURL(p).href)) as Record<string, ComponentType<Record<string, unknown>>>;
    const vB = await mod(stage(VAR, "base", varPatches));
    const vC = await mod(stage(VAR, "cur", varPatches));
    const sB = await mod(stage(SUM, "base", sumPatches));
    const sC = await mod(stage(SUM, "cur", sumPatches));
    const bB = await mod(stage(BAN, "base", []));
    const bC = await mod(stage(BAN, "cur", []));

    console.log("── Dört Ok / PHS paneli ──");
    const states: Array<[string, VariablesDto | undefined]> = [["boş (kontrol ediliyor)", undefined], ["kesin", DATA_SURE], ["olası + tarihsel ofset", DATA_UNSURE]];
    for (const [label, d] of states) {
      g.__HDV = d;
      const b = renderToStaticMarkup(createElement(vB.HdVariablesPanel!, { chartId: "c1" }), "tr");
      const c = renderToStaticMarkup(createElement(vC.HdVariablesPanel!, { chartId: "c1" }), "tr");
      ok(`TR panel (${label}) = taban HTML bayt-eşit`, b === c, b === c ? undefined : { b: b.slice(0, 300), c: c.slice(0, 300) });
      const e = renderToStaticMarkup(createElement(vC.HdVariablesPanel!, { chartId: "c1" }), "en");
      const leak = text(e).replace(BRAND, "").match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g);
      ok(`EN panel (${label}): Türkçe sistem metni yok (sağlayıcı ⟦…⟧ hariç)`, !leak, leak);
    }
    for (const a of DATA_UNSURE.arrows) {
      const b = renderToStaticMarkup(createElement(vB.ArrowCard!, { a }), "tr");
      const c = renderToStaticMarkup(createElement(vC.ArrowCard!, { a }), "tr");
      ok(`TR ok kartı ${a.key} (${a.confident ? "kesin" : "olası"}) = taban`, b === c);
    }
    g.__HDV = DATA_SURE;
    const en = renderToStaticMarkup(createElement(vC.HdVariablesPanel!, { chartId: "c1" }), "en");
    ok("EN panel: resmî terimler (Determination, Environment, Motivation, Perspective, Cognition)", ["Determination (Digestion / PHS)", "Environment", "Motivation", "Perspective (View)", "Cognition"].every((s) => en.includes(s)));
    ok("EN panel: kanonik veri öznitelikleri TR ile aynı", (() => {
      const tr = renderToStaticMarkup(createElement(vC.HdVariablesPanel!, { chartId: "c1" }), "tr");
      const attrs = (h: string) => (h.match(/data-hd-var-[a-z-]+="[^"]*"/g) ?? []).join("|");
      return attrs(tr) === attrs(en);
    })());
    g.__HDV = undefined;

    console.log("── Profesyonel Rapor Özeti ──");
    for (const [label, s, err, android] of [["yükleniyor", undefined, undefined, false], ["özet (masaüstü)", SUMMARY, undefined, false], ["özet (Android)", SUMMARY, undefined, true], ["hata", undefined, "⟦sunucu hatası⟧", false]] as const) {
      g.__HDS = s;
      g.__HDSE = err;
      const props = { reportId: "r1", isAndroid: android, onClose: () => {} };
      const b = renderToStaticMarkup(createElement(sB.HdProfessionalSummaryModal!, props), "tr");
      const c = renderToStaticMarkup(createElement(sC.HdProfessionalSummaryModal!, props), "tr");
      ok(`TR özet (${label}) = taban HTML bayt-eşit`, b === c, b === c ? undefined : { b: b.slice(0, 300), c: c.slice(0, 300) });
      const e = renderToStaticMarkup(createElement(sC.HdProfessionalSummaryModal!, props), "en");
      const leak = text(e).match(/\S*[çğıöşüÇĞİÖŞÜ]\S*/g);
      ok(`EN özet (${label}): Türkçe sistem metni yok`, !leak, leak);
      if (s) ok(`EN özet (${label}): en-GB tarih`, e.includes("15 July 1990") && e.includes("2 sections were not included"));
    }
    g.__HDS = undefined;
    g.__HDSE = undefined;

    console.log("── Eksik harita bilgisi şeridi ──");
    const missing = ["Tip", "Otorite", "Profil", "Tanım", "Merkezler", "Kanallar", "Kapılar"];
    const bp = { missing, onComplete: () => {}, onContinue: () => {} };
    const bb = renderToStaticMarkup(createElement(bB.HdMissingChartInfoBanner!, bp), "tr");
    const bc = renderToStaticMarkup(createElement(bC.HdMissingChartInfoBanner!, bp), "tr");
    ok("TR şerit = taban HTML bayt-eşit", bb === bc, bb === bc ? undefined : { b: bb.slice(0, 300), c: bc.slice(0, 300) });
    const be = renderToStaticMarkup(createElement(bC.HdMissingChartInfoBanner!, bp), "en");
    ok("EN şerit: Türkçe yok + alan adları İngilizce", !TR_CHARS.test(text(be)) && ["Type", "Authority", "Profile", "Definition", "Centers", "Channels", "Gates"].every((s) => be.includes(s)), text(be));
    const det = (await import("../../app/human-design/rapor-olustur/components/HdMissingChartInfoBanner")) as { HD_MISSING_FIELD_ORDER: readonly string[] };
    ok("Alan kimlikleri (HD_MISSING_FIELD_ORDER) DEĞİŞMEDİ", det.HD_MISSING_FIELD_ORDER.join() === missing.join());
  } finally {
    rmSync(TMP, { recursive: true, force: true });
  }

  console.log("── Katalog: TR değerleri taban kaynaktan, EN Türkçesiz ──");
  // TR değerleri (yer tutucular joker) taban kaynak metinde birebir bulunmalı (JSX boşluk daraltması + &apos;).
  const norm = (s: string) => s.replace(/&apos;/g, "'").replace(/\s*\n\s*/g, " ");
  const baseSrc = (files: string[]) => norm(files.map(gitShow).join("\n"));
  const check = (ns: string, tr: unknown, en: unknown, files: string[], extra: Record<string, string> = {}) => {
    const T = leaves(tr);
    const E = leaves(en);
    ok(`${ns}: TR/EN anahtar kümesi eşit (${Object.keys(T).length})`, Object.keys(T).sort().join() === Object.keys(E).sort().join());
    const src = baseSrc(files);
    const missingTr = Object.entries(T).filter(([k, v]) => {
      if (k in extra) return extra[k] !== v;
      const re = new RegExp(v.split(/\{\w+(?:, plural[^}]*\})?\}/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".{1,60}?"));
      return !re.test(src);
    });
    ok(`${ns}: her TR değeri taban kaynak metinden (bayt-eşit)`, missingTr.length === 0, missingTr);
    const leak = Object.entries(E).filter(([, v]) => TR_CHARS.test(v.replace(BRAND, "")));
    ok(`${ns}: EN değerlerinde Türkçe yok (marka hariç)`, leak.length === 0, leak);
  };
  const VT = (trVariables as { hd: { variables: Record<string, unknown> } }).hd.variables;
  const libTr: Record<string, string> = {
    title: VL.VARIABLES_TITLE, subtitle: VL.VARIABLES_SUBTITLE, intro: VL.VARIABLES_INTRO, precisionNote: VL.VARIABLES_PRECISION_NOTE,
    baseNote: VL.VARIABLES_BASE_NOTE, healthNote: VL.VARIABLES_HEALTH_NOTE, uncertainNote: VL.VARIABLES_UNCERTAIN_NOTE,
    uncertainAdvice: VL.VARIABLES_UNCERTAIN_ADVICE, historicalOffsetNote: VL.VARIABLES_HISTORICAL_OFFSET_NOTE,
    baseUncertain: VL.VARIABLES_BASE_UNCERTAIN, allUncertainNote: VL.VARIABLES_ALL_UNCERTAIN_NOTE, sourceNote: VL.VARIABLES_SOURCE_NOTE,
    cognitionTitle: VL.COGNITION_TITLE, "direction.left": VL.DIRECTION_TR.left, "direction.right": VL.DIRECTION_TR.right,
    "directionLower.left": VL.DIRECTION_TR.left.toLocaleLowerCase("tr"), "directionLower.right": VL.DIRECTION_TR.right.toLocaleLowerCase("tr"),
    "certainty.certain.term": VL.VARIABLES_CERTAINTY_EXPLAINER[0]!.term, "certainty.certain.text": VL.VARIABLES_CERTAINTY_EXPLAINER[0]!.text,
    "certainty.possible.term": VL.VARIABLES_CERTAINTY_EXPLAINER[1]!.term, "certainty.possible.text": VL.VARIABLES_CERTAINTY_EXPLAINER[1]!.text,
  };
  for (const k of Object.keys(VL.ARROW_TITLE_TR) as Array<keyof typeof VL.ARROW_TITLE_TR>) {
    libTr[`arrowTitle.${k}`] = VL.ARROW_TITLE_TR[k];
    libTr[`arrowPlace.${k}`] = VL.ARROW_PLACE_TR[k];
  }
  const VTL = leaves(VT);
  ok("hd.variables: lib sabitleri = TR katalog (bayt-bayt)", Object.entries(libTr).every(([k, v]) => VTL[k] === v), Object.entries(libTr).filter(([k, v]) => VTL[k] !== v));
  check("hd.variables", VT, (enVariables as { hd: { variables: unknown } }).hd.variables, [VAR], libTr);
  check("hd.proSummary", (trSummary as { hd: { proSummary: unknown } }).hd.proSummary, (enSummary as { hd: { proSummary: unknown } }).hd.proSummary, [SUM]);
  check("hd.reportBuilder", (trBuilder as { hd: { reportBuilder: unknown } }).hd.reportBuilder, (enBuilder as { hd: { reportBuilder: unknown } }).hd.reportBuilder, [
    "app/human-design/rapor-olustur/page.tsx",
    "app/human-design/rapor-olustur/components/HdRaporContent.tsx",
    BAN,
    "app/human-design/rapor-olustur/helpers/hdRapor.ts",
    "app/human-design/rapor-olustur/helpers/exportHdReportDocx.ts",
    "lib/docx/reportDisclaimer.ts",
  ]);

  console.log(`\nHD-B UI EN SMOKE: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.log(" - " + fails.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  rmSync(TMP, { recursive: true, force: true });
  console.error(e);
  process.exit(1);
});
