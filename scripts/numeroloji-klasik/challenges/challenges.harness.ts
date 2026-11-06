/**
 * D3 (05.11.2026) — Klasik Numeroloji zorluk SUNUMU regresyon kalkanı (ağ / DB / sağlayıcı çağrısı YOK; dosya YAZMAZ).
 *
 *   • lib/numeroloji-klasik/challenges.ts: ana (3.) zorluk tespiti, dönemsel zorluk seçimi, yaş etiketi.
 *   • QA ham sağlayıcı yanıtları (salt okunur): her chart için 0–100 yaş taramasında seçilen dönemsel zorluk,
 *     sağlayıcının kendi yaş sınırlarından bağımsız beklenen kuralla aynı; 3. zorluk asla "şu an" seçilmez;
 *     4. zorluk 4. zirveyle başlar. Sayılar ve yaşlar sağlayıcı yanıtından DEĞİŞTİRİLMEDEN okunur.
 *   • Owner örneği 24.02.1960 (3. zorluk 3, 4. zorluk 5): ileri yaşta dönemsel = 4. zorluk 5, ana zorluk 3.
 *   • Ekran (TimingPanel) ve PNG (buildClassicPngSvg) çıktıları; Word rapor kodu değiştirilmez.
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/challenges/challenges.harness.ts
 */
import Module from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { challengeAgeLabel, currentPeriodicChallenge, isMainChallenge, mainChallenge, periodicChallenges } from "../../../lib/numeroloji-klasik/challenges";
import { normalizeEndpointResponse } from "../../../lib/numeroloji-klasik/normalize";
import { buildClassicPngSvg } from "../../../lib/numeroloji-klasik/report/pngSvg";
import type { ChartResult, Period } from "../../../lib/numeroloji-klasik/model";
import type { ClassicReportRecord } from "../../../lib/numeroloji-klasik/report/types";
import type { PersonData } from "../../../app/numeroloji-klasik/_ui/result/person";

// next/font yalnız Next derleyicisinde çalışır → bu test sürecinde boş yazı tipi nesnesiyle taklit edilir.
{
  const M = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
  const orig = M._load;
  const font = () => ({ className: "", variable: "", style: {} });
  M._load = function (req: string, ...rest: unknown[]) {
    if (req === "next/font/google" || req === "next/font/local") return new Proxy({}, { get: () => font });
    if (/\.css$/.test(req)) return {};
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`  ✗ ${label}${detail !== undefined ? `  → ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  }
}

const P = (position: number, number: number, startAge: number, endAge: number | null) => ({ position, number, startAge, endAge });
const ROXY_LIKE = [P(1, 4, 0, 30), P(2, 1, 31, 39), P(3, 3, 0, null), P(4, 5, 49, null)];

// ── 1) saf yardımcı ─────────────────────────────────────────────────────────────────────────
ok(isMainChallenge(ROXY_LIKE[2]) && !isMainChallenge(ROXY_LIKE[3]) && !isMainChallenge(ROXY_LIKE[0]), "ana zorluk: yalnız 3. konum, 0 yaştan, bitişsiz");
ok(mainChallenge(ROXY_LIKE)?.number === 3, "mainChallenge → 3. zorluk");
ok(periodicChallenges(ROXY_LIKE).map((p) => p.position).join(",") === "1,2,4", "dönemsel zorluklar 1,2,4 (sıra korunur)");
const pick = (age: number | null) => currentPeriodicChallenge(ROXY_LIKE, age)?.position ?? null;
ok(pick(0) === 1 && pick(30) === 1, "0–30 yaş → 1. zorluk");
ok(pick(31) === 2 && pick(39) === 2, "31–39 yaş → 2. zorluk");
ok(pick(40) === null && pick(48) === null, "40–48 yaş (3. zirve dönemi) → dönemsel zorluk yok (ana geçerli)");
ok(pick(49) === 4 && pick(66) === 4 && pick(100) === 4, "49+ yaş → 4. zorluk (eski hata: hep 3.)");
ok(pick(null) === null && pick(Number.NaN) === null, "yaş yok → seçim yok");
ok(challengeAgeLabel(ROXY_LIKE[2]) === "tüm yaşam" && challengeAgeLabel(ROXY_LIKE[0]) === "0–30" && challengeAgeLabel(ROXY_LIKE[3]) === "49+", "yaş etiketi");
// İşaretsiz / beklenmeyen yanıt → eski davranış (liste olduğu gibi dönemsel)
const NO_MAIN = [P(1, 1, 0, 28), P(2, 2, 29, 37), P(3, 3, 38, 46), P(4, 4, 47, null)];
ok(mainChallenge(NO_MAIN) === null && periodicChallenges(NO_MAIN).length === 4 && currentPeriodicChallenge(NO_MAIN, 40)?.position === 3, "ana işareti yoksa eski davranış (3. dönem 38–46)");
const TWO_MAINS = [P(3, 3, 0, null), P(3, 4, 0, null)];
ok(mainChallenge(TWO_MAINS) === null && periodicChallenges(TWO_MAINS).length === 2, "belirsiz (iki ana) → ana seçilmez, liste korunur");
ok(currentPeriodicChallenge(null, 30) === null && mainChallenge(undefined) === null && periodicChallenges(null).length === 0, "boş liste güvenli");
const frozen = Object.freeze(ROXY_LIKE.map((x) => Object.freeze({ ...x })));
currentPeriodicChallenge(frozen, 66);
ok(JSON.stringify(frozen) === JSON.stringify(ROXY_LIKE), "girdi değiştirilmez");

// ── 2) QA ham sağlayıcı yanıtları (salt okunur) ────────────────────────────────────────────
const QA_DIR = process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
const RAW_DIR = path.join(QA_DIR, "raw");
let lp6: ChartResult | null = null;
if (existsSync(RAW_DIR)) {
  let charts = 0;
  for (const f of readdirSync(RAW_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const raw = JSON.parse(readFileSync(path.join(RAW_DIR, f), "utf8")) as { body?: { additionalInsights?: { challenges?: unknown } } };
    if (!raw.body?.additionalInsights?.challenges) continue;
    const n = normalizeEndpointResponse("chart", raw.body);
    if (!n.ok) continue;
    const chart = n.data as ChartResult;
    const ch = chart.challenges as Period[];
    const pins = chart.pinnacles as Period[];
    if (ch.length !== 4 || pins.length !== 4) continue;
    charts++;
    if (f === "l01-chart-lp6-tr.json") lp6 = chart;
    const main = mainChallenge(ch);
    ok(main?.position === 3, `${f}: ana zorluk 3. konum`, ch);
    const c1 = ch[0];
    const c2 = ch[1];
    const c4 = ch[3];
    ok(c1.endAge === pins[0].endAge && c2.endAge === pins[1].endAge && c4.startAge === pins[3].startAge, `${f}: dönemsel zorluklar zirve sınırlarıyla hizalı`, { ch, pins: pins.map((p) => [p.startAge, p.endAge]) });
    let bad = 0;
    for (let age = 0; age <= 100; age++) {
      const exp = age <= (c1.endAge ?? -1) ? 1 : age <= (c2.endAge ?? -1) ? 2 : age >= c4.startAge ? 4 : null;
      const got = currentPeriodicChallenge(ch, age);
      if ((got?.position ?? null) !== exp || got?.position === 3) bad++;
    }
    ok(bad === 0, `${f}: 0–100 yaş dönemsel seçim beklenenle aynı, 3. asla "şu an" değil`, { bad });
  }
  ok(charts >= 30, `QA ham chart yanıtı taranan: ${charts}`, charts);
  console.log(`  QA ham chart yanıtı: ${charts}`);
} else {
  console.log("  SKIP (QA ham yanıtları yok)");
}

// ── 3) Owner örneği 24.02.1960 — ekran + PNG ───────────────────────────────────────────────
async function screenAndPng(): Promise<void> {
if (lp6) {
  const { TimingPanel } = await import("../../../app/numeroloji-klasik/_ui/result/person");
  const ch = lp6.challenges as Period[];
  ok(ch.map((p) => `${p.position}:${p.number}`).join(",") === "1:4,2:1,3:3,4:5", "24.02.1960: sağlayıcı sayıları 4/1/3/5 (değiştirilmedi)", ch);
  ok(currentPeriodicChallenge(ch, 66)?.number === 5 && currentPeriodicChallenge(ch, 66)?.position === 4, "24.02.1960 · 66 yaş → dönemsel 4. zorluk 5");
  ok(mainChallenge(ch)?.number === 3, "24.02.1960 → ana zorluk 3");
  const oldFirstMatch = ch.find((p) => 66 >= p.startAge && (p.endAge === null || 66 <= p.endAge));
  ok(oldFirstMatch?.position === 3, "eski ilk-eşleşme kuralı 3. zorluğu seçiyordu (hata kanıtı)");

  const d: PersonData = { chart: lp6, bridge: null, personalDay: null, daily: null, chaldean: null, dual: null, referenceDate: "2026-11-05", birth: { year: 1960, month: 2, day: 24 } };
  const html = renderToStaticMarkup(createElement(TimingPanel, { d }));
  const nowSeg = /<div class="nk-tl-seg nk-c nk-now"[^>]*><b>(\d+)<\/b><small>([^<]*)<\/small>/.exec(html);
  ok(!!nowSeg && nowSeg[1] === "5" && /^4\. zorluk · 49\+ yaş · şu an$/.test(nowSeg[2]), "ekran: şu an = 4. zorluk 5 (49+ yaş)", nowSeg?.slice(1));
  ok(/data-testid="main-challenge"[\s\S]*?<b>3<\/b><small>3\. zorluk · Ana zorluk · tüm yaşam boyunca<\/small>/.test(html), "ekran: ana zorluk 3 ayrı, tüm yaşam boyunca");
  ok(!html.includes("0+ yaş") && !/3\. zorluk · 0/.test(html), "ekran: yanıltıcı '0+ yaş' / 3. zorluk dönemi yok");
  ok((html.match(/· şu an/g) ?? []).length === 2, "ekran: tam bir zirve + bir zorluk 'şu an'");
  ok(html.includes("3. zorluk ana zorluktur ve tüm yaşam boyunca geçerlidir"), "ekran: açıklama metni ana zorluğu belirtir");
  ok(html.includes("· Ana zorluk (tüm yaşam)"), "ekran: dönem ayrıntılarında 3. zorluk 'Ana zorluk' etiketli");
  // 3. zirve dönemi (40–48 yaş): dönemsel yok, ana geçerli notu
  const d44: PersonData = { ...d, referenceDate: "2004-06-01" };
  const html44 = renderToStaticMarkup(createElement(TimingPanel, { d: d44 }));
  ok(html44.includes('data-testid="no-periodic-challenge"') && !/nk-tl-seg nk-c nk-now/.test(html44), "ekran 44 yaş: dönemsel zorluk yok notu, zorlukta 'şu an' yok");

  const record: ClassicReportRecord = {
    kind: "person", title: "D3 örnek", input: { fullName: "Deneme Kişi", birth: { year: 1960, month: 2, day: 24 }, targetDate: "2026-11-05" },
    techniques: ["core"], status: "complete", result: { chart: lp6 }, methodologyVersion: "numk-method-1", apiSchemaVersion: "numerology-openapi-2.0.0",
    referenceDate: "2026-11-05", createdAt: "2026-11-05T09:00:00.000Z",
  } as unknown as ClassicReportRecord;
  const svg = buildClassicPngSvg(record, { generatedAt: new Date("2026-11-05T09:00:00.000Z") });
  const texts = svg ? [...svg.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]) : [];
  const line = texts.find((t) => t.includes("zorluk")) ?? "";
  ok(/4\. zorluk: 5/.test(line) && /ana zorluk: 3/.test(line) && !/3\. zorluk:/.test(line), "PNG: '4. zorluk: 5 · ana zorluk: 3' (3. dönemsel seçilmez)", line);
} else {
  ok(false, "Owner örneği l01-chart-lp6-tr.json bulunamadı (QA ham yanıtı)");
}
}

// ── 4) statik kurallar ─────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "../../..");
const person = readFileSync(path.join(ROOT, "app/numeroloji-klasik/_ui/result/person.tsx"), "utf8");
const png = readFileSync(path.join(ROOT, "lib/numeroloji-klasik/report/pngSvg.ts"), "utf8");
ok(!/currentPeriod\(c\.challenges/.test(person) && /currentPeriodicChallenge\(c\.challenges, age\)/.test(person), "ekran: zorlukta eski ilk-eşleşme yok");
ok(!/currentPeriod\(chart\?\.challenges/.test(png) && /currentPeriodicChallenge\(chart\?\.challenges, age\)/.test(png), "PNG: zorlukta eski ilk-eşleşme yok");
const lib = readFileSync(path.join(ROOT, "lib/numeroloji-klasik/challenges.ts"), "utf8");
ok(!/fetch\(|normalize|oracle/.test(lib.replace(/\/\*[\s\S]*?\*\//g, "")), "yardımcı saf: sağlayıcı / hesap çağrısı yok");

void screenAndPng().then(
  () => {
    console.log(`\nD3 zorluk sunumu harness: ${pass} geçti, ${fail} kaldı`);
    if (failures.length) console.log(failures.join("\n"));
    process.exit(fail ? 1 : 0);
  },
  (e) => {
    console.log("HATA", e);
    process.exit(1);
  },
);
