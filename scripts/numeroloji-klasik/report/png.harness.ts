/**
 * Klasik Numeroloji · görsel (PNG) rapor harness'i (ağ / DB / sağlayıcı çağrısı YOK).
 *
 *   (1) Sentetik fikstür + varyasyonlar (usta sayı, karmik borç, kontrol farkı, günün sayısı, kısmi, yalnız Kalde,
 *       uzun ad, XSS denemesi) → SVG metin denetimi + gerçek PNG üretimi.
 *   (2) PNG doğrulaması: imza, IHDR genişlik 2400 / yükseklik ölçek ×2, boyut sınırı, yazı tipi dosyası depo içi.
 *   (3) Okunabilirlik: SVG'deki en küçük yazı ≥ 14 px (PNG'de ≥ 28 px), metin tuval dışına taşmıyor.
 *   (4) QA ham yanıtları varsa gerçekçi kayıt (normalize edilmiş gerçek sağlayıcı yanıtları) — klasör yoksa SKIP.
 *   (5) Owner incelemesi için örnek PNG'ler QA klasörüne yazılır (yalnız sentetik + normalize gerçekçi kayıt).
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/report/png.harness.ts
 */
import Module from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(cond: unknown, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
  }
}

const QA_DIR = process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
const OUT_DIR = path.join(QA_DIR, "png-ornek");
const BRAND_RE = /roxy|astrologer|numerologyapi|https?:\/\//i;

function pngInfo(b: Buffer): { sig: boolean; width: number; height: number } {
  const sig = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { sig, width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function svgTexts(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
}

async function main(): Promise<void> {
  const { buildClassicPngSvg, xmlText, wrapText, PNG_REPORT_WIDTH } = await import("../../../lib/numeroloji-klasik/report/pngSvg");
  const { renderClassicPng, CLASSIC_PNG_FONT_PATH, CLASSIC_PNG_SCALE } = await import("../../../lib/numeroloji-klasik/report/png");
  const F = await import("./fixtures");
  const { normalizeEndpointResponse } = await import("../../../lib/numeroloji-klasik/normalize");
  type Rec = typeof F.PERSON_RECORD;
  const at = new Date(F.GEN_AT);

  console.log("\n[yardımcılar]");
  check(xmlText("<script>&\"'") === "&lt;script&gt;&amp;&quot;&apos;", "xmlText: XML kaçış");
  check(xmlText("a\u202Eb\u200Bc\u0007") === "abc", "xmlText: yön/görünmez/kontrol karakterleri ayıklanır");
  check([...xmlText("x".repeat(900), 50)].length <= 50, "xmlText: uzunluk sınırı");
  const w = wrapText("Bir iki üç dört beş altı yedi sekiz dokuz on on bir on iki", 200, 20, 2);
  check(w.length === 2 && w[1].endsWith("…"), "wrapText: satır sınırı + üç nokta", w);

  console.log("\n[içerik — sentetik kişi]");
  const base = buildClassicPngSvg(F.PERSON_RECORD, { generatedAt: at, expertName: "Uzman Örnek" });
  check(!!base, "kişi kaydı → SVG");
  if (base) {
    const t = svgTexts(base.svg).join(" | ");
    for (const must of ["Klasik Numeroloji Raporu", "Ekol: Klasik Numeroloji", "Pisagor (Batı)", "Kalde (Cheiro)", "Temel Sayılar", "Yaşam Yolu", "İfade (Kader)", "Ruh Güdüsü", "Kişilik", "Doğum Günü", "Olgunluk", "Karmik Bilgiler", "Karmik dersler", "Karmik borçlar", "Dönemsel Bilgiler", "Kişisel Yıl", "Kişisel Gün", "Kalde (Cheiro) İsim Analizi", "İki sistem", "Hazırlayan: Uzman Örnek", "kişisel farkındalık"]) {
      check(t.includes(must), `metin: "${must}"`);
    }
    check(t.includes("Ayşe Örnek Işıl"), "Türkçe ad bozulmadan (Ş, Ö, I, ı)");
    check(t.includes("29.11.1988") && t.includes("29.10.2026"), "doğum + hedef tarih GG.AA.YYYY");
    check(!BRAND_RE.test(base.svg.replace('xmlns="http://www.w3.org/2000/svg"', "")), "sağlayıcı adı / URL YOK (SVG ad alanı hariç)");
    check(!/<script|onload=|javascript:/i.test(base.svg), "betik / olay özniteliği YOK");
    check(base.sections.join(",") === "core,karmic,timing,chaldean,dual", "bölümler", base.sections);
    const sizes = [...base.svg.matchAll(/font-size="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]));
    check(Math.min(...sizes) >= 14, `okunabilirlik: en küçük yazı ${Math.min(...sizes)} px (PNG'de ×${CLASSIC_PNG_SCALE})`);
    const xs = [...base.svg.matchAll(/<text x="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]));
    check(xs.every((x) => x >= 0 && x <= PNG_REPORT_WIDTH), "metin tuval içinde (x)");
  }

  console.log("\n[içerik — usta / karmik / kontrol farkı / günün sayısı]");
  const chart = F.PERSON_RECORD.result.chart as Record<string, unknown>;
  const core = chart.core as Record<string, Record<string, unknown>>;
  const tweaked: Rec = {
    ...F.PERSON_RECORD,
    result: {
      ...F.PERSON_RECORD.result,
      chart: {
        ...chart,
        core: {
          ...core,
          lifePath: { ...core.lifePath, value: 11, type: "master" },
          expression: { ...core.expression, value: 7, type: "single", karmicDebt: 16, verification: { status: "mismatch", oracleValue: 8 } },
        },
        karmicDebt: { ...(chart.karmicDebt as Record<string, unknown>), hasKarmicDebt: true, debtNumbers: [16] },
      },
      daily: { date: "2026-10-29", seed: null, seedMode: "person", dailyMessage: "Sentetik günlük mesaj.", number: { ...core.lifePath, value: 22, type: "master", meaning: { title: "Usta İnşacı", keywords: [], description: "", strengths: [], challenges: [], career: null, relationships: null, spirituality: null } } },
    },
  };
  const tw = buildClassicPngSvg(tweaked, { generatedAt: at });
  const tt = tw ? svgTexts(tw.svg).join(" | ") : "";
  check(tt.includes("Usta sayı"), "usta sayı rozeti (11)");
  check(tt.includes("Karmik borç 16"), "karmik borç rozeti (16)");
  check(tt.includes("Kontrol farkı"), "bağımsız kontrol farkı rozeti (kesin sonuç gibi sunulmaz)");
  const triple = buildClassicPngSvg({ ...tweaked, result: { ...tweaked.result, chart: { ...(tweaked.result.chart as object), core: { ...core, expression: { ...core.expression, value: 22, type: "master", karmicDebt: 13, verification: { status: "mismatch", oracleValue: 4 } } } } } }, { generatedAt: at });
  const trT = triple ? svgTexts(triple.svg).join(" | ") : "";
  check(trT.includes("Kontrol farkı") && trT.includes("Usta sayı") && trT.includes("Karmik borç 13"), "üç rozet aynı kartta — hiçbiri düşmez");
  const cautionWrong = buildClassicPngSvg({ ...F.PERSON_RECORD, result: { chaldean: { ...F.CHALDEAN, caution: true, destiny: { ...F.CHALDEAN.destiny, root: 5 } } } }, { generatedAt: at });
  check(!!cautionWrong && !svgTexts(cautionWrong.svg).join(" ").includes("Klasik ekol notu"), "kök 4/8 değilken dikkat notu gösterilmez");
  const cautionOk = buildClassicPngSvg({ ...F.PERSON_RECORD, result: { chaldean: { ...F.CHALDEAN, caution: true, destiny: { ...F.CHALDEAN.destiny, root: 8 } } } }, { generatedAt: at });
  check(!!cautionOk && svgTexts(cautionOk.svg).join(" ").includes("Kader kökü 8"), "kök 8 → dikkat notu");
  check(tt.includes("Günün sayısı (sembolik)") && tt.includes("Kişisel Gün değildir"), "günün sayısı ayrı ve sembolik etiketli");
  check(!tt.includes("Hazırlayan"), "uzman adı yoksa satır yok");

  console.log("\n[sınır durumları]");
  check(buildClassicPngSvg({ ...F.PERSON_RECORD, kind: "relationship" }, { generatedAt: at }) === null, "ilişki kaydı → null (yalnız kişi)");
  check(buildClassicPngSvg({ ...F.PERSON_RECORD, result: { bridge: F.BRIDGE } }, { generatedAt: at }) === null, "harita + Kalde yok → null");
  const kaldeOnly = buildClassicPngSvg({ ...F.PERSON_RECORD, result: { chaldean: F.CHALDEAN } }, { generatedAt: at });
  check(!!kaldeOnly && kaldeOnly.sections.join(",") === "chaldean", "yalnız Kalde → yalnız Kalde bölümü", kaldeOnly?.sections);
  const partial = buildClassicPngSvg({ ...F.PERSON_RECORD, status: "partial" }, { generatedAt: at });
  check(!!partial && svgTexts(partial.svg).join(" ").includes("Kısmi analiz"), "kısmi kayıt notu");
  const evil = buildClassicPngSvg({ ...F.PERSON_RECORD, input: { ...(F.PERSON_RECORD.input as object), fullName: `<img src=x onerror=alert(1)> ${"Çok".repeat(80)}` } }, { generatedAt: at });
  check(!!evil && !/<img/.test(evil.svg) && evil.svg.includes("&lt;img"), "ad içindeki etiket kaçışlı (yalnız metin; öğe oluşmaz)");
  const evilT = evil ? svgTexts(evil.svg) : [];
  check(evilT.every((s) => s.length < 400), "uzun ad kırpılır");

  console.log("\n[PNG üretimi]");
  check(existsSync(CLASSIC_PNG_FONT_PATH) && CLASSIC_PNG_FONT_PATH.replace(/\\/g, "/").endsWith("public/fonts/Geist-Regular.ttf"), "yazı tipi depo içi Geist TTF");
  const samples: Array<[string, Rec]> = [["sentetik-kisi", F.PERSON_RECORD], ["sentetik-usta-karmik-gunluk", tweaked], ["sentetik-yalniz-kalde", { ...F.PERSON_RECORD, result: { chaldean: F.CHALDEAN } }]];

  // Gerçekçi kayıt (QA ham yanıtları → normalize)
  const RAW_DIR = path.join(QA_DIR, "raw");
  const RAW: Array<[string, "chart" | "bridge" | "personal_day" | "chaldean" | "dual" | "daily", string]> = [
    ["chart", "chart", "l01-chart-lp11-tr"],
    ["personal_day", "personal_day", "m02-pd-default"],
    ["chaldean", "chaldean", "l01-chaldean-helen"],
    ["dual", "dual", "l01-dual-deniz"],
    ["daily", "daily", "m02-daily-a-1"],
  ];
  if (RAW.every(([, , f]) => existsSync(path.join(RAW_DIR, `${f}.json`)))) {
    const norm: Record<string, unknown> = {};
    for (const [label, ep, f] of RAW) {
      const r = normalizeEndpointResponse(ep, JSON.parse(readFileSync(path.join(RAW_DIR, `${f}.json`), "utf8")).body);
      check(r.ok, `gerçekçi: ${f} normalize`);
      if (r.ok) norm[label] = label === "daily" ? { ...(r.data as object), seed: null, seedMode: "person" } : r.data;
    }
    samples.push(["gercekci-normalize", {
      kind: "person", title: "Gerçekçi kayıt", input: { fullName: "Deneme Kişi", birth: { year: 1960, month: 2, day: 2 }, targetDate: "2026-10-29" },
      techniques: ["core", "personal_day", "daily", "chaldean", "dual"], status: "complete", result: norm,
      methodologyVersion: "numk-method-1", apiSchemaVersion: "numerology-openapi-2.0.0", referenceDate: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z",
    }]);
  } else {
    console.log("  SKIP (gerçekçi kısım) — QA ham yanıtları yok");
  }

  const write = existsSync(QA_DIR);
  if (write) mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, rec] of samples) {
    const t0 = Date.now();
    const out = renderClassicPng(rec, { generatedAt: at, expertName: "Uzman Örnek" });
    const ms = Date.now() - t0;
    check(out.ok, `${name}: PNG üretildi (${ms} ms)`);
    if (!out.ok) continue;
    const info = pngInfo(out.png);
    const svg = buildClassicPngSvg(rec, { generatedAt: at, expertName: "Uzman Örnek" })!;
    check(info.sig, `${name}: PNG imzası`);
    check(info.width === PNG_REPORT_WIDTH * CLASSIC_PNG_SCALE && info.height === svg.height * CLASSIC_PNG_SCALE, `${name}: ${info.width}×${info.height} (tasarım ×${CLASSIC_PNG_SCALE})`, info);
    check(out.png.length > 40_000 && out.png.length < 6_000_000, `${name}: dosya boyutu ${(out.png.length / 1024).toFixed(0)} KB (40 KB – 6 MB)`);
    check(!BRAND_RE.test(out.png.toString("latin1")), `${name}: PNG baytlarında sağlayıcı adı / URL yok`);
    if (write) writeFileSync(path.join(OUT_DIR, `${name}.png`), out.png);
  }
  const det1 = renderClassicPng(F.PERSON_RECORD, { generatedAt: at });
  const det2 = renderClassicPng(F.PERSON_RECORD, { generatedAt: at });
  check(det1.ok && det2.ok && det1.png.equals(det2.png), "aynı kayıt + tarih → bayt-bayt aynı PNG (deterministik)");
  check(renderClassicPng({ ...F.PERSON_RECORD, kind: "business" }, { generatedAt: at }).ok === false, "işletme kaydı → PNG yok (not_person)");
  if (write) console.log(`  örnekler: ${OUT_DIR}`);

  console.log(`\n${pass} ✓ / ${fail} ✗`);
  if (fail) console.log(`BAŞARISIZ:\n  - ${failures.join("\n  - ")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("harness hatası:", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
