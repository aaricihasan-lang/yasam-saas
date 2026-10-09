/**
 * HD AŞAMA 1 — profesyonel Danışan + Harita bilgi bloğu harness'i.
 *
 * Çalıştırma:  npx tsx scripts/hd-roxy/info-panel-harness.ts
 * GERÇEK Roxy / DB çağrısı YOK (fixture + mock callRoxy + fakeDb).
 *
 * Uçtan uca: hesap (mock Roxy, 1 çağrı) → kayıt (fakeDb) → GET detay (getComputedChart) →
 * bilgi bloğu (buildChartSubjectInfo) → render (HdComputedChartView). Görüntüleme yolunda
 * Roxy çağrı sayısı ARTMAZ; computed_result tek bir değeri dahi değişmez.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { computeRoxyChart, type RoxyServiceDeps } from "../../lib/human-design/api/roxyChartService";
import { getComputedChart } from "../../lib/human-design/api/chartPersistence";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { roxyCityToLocation, signLocationRef } from "../../lib/human-design/api/hdLocationRef";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import {
  ageOn,
  buildChartSubjectInfo,
  formatUtcIso,
  formatUtcOffset,
  utcOffsetMinutes,
} from "../../lib/human-design/chart/chartSubjectInfo";
import type { HdComputedChart } from "../../lib/human-design/chart/computedChart";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { createFakeDb } from "./fakeDb";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FIXTURE = JSON.parse(readFileSync(join(HERE, "fixtures", "roxy-bodygraph-2018-07-20.json"), "utf8"));
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : "");
  }
}

const T_A = "11111111-1111-4111-8111-111111111111";
const U_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C_A = "c0000000-0000-4000-8000-00000000000a";
const ENV = { HD_LOCATION_REF_SECRET: "test-secret-not-real" } as unknown as NodeJS.ProcessEnv;
const TODAY = { y: 2026, m: 10, d: 7 };

function deps(calls: unknown[]): RoxyServiceDeps {
  return {
    config: { apiKey: "k", baseUrl: "https://roxyapi.com/api/v2" },
    callRoxy: async (_c, body) => {
      calls.push(body);
      return { ok: true, raw: clone(FIXTURE) };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    sleep: async () => undefined,
    log: () => undefined,
  };
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

async function main() {
  console.log("HD AŞAMA 1 — bilgi bloğu harness'i (mock)\n");
  process.env.HD_LOCATION_REF_SECRET = "test-secret-not-real";

  // ── A) Saf yardımcılar: UTC / ofset / yaş ──
  ok("A1 UTC biçimi (saat dilimsiz, kayıtlı ISO'dan)", formatUtcIso("2018-07-20T16:00:00.000Z") === "20.07.2018 16:00 UTC");
  ok("A2 geçersiz ISO → null", formatUtcIso("x") === null && formatUtcIso(null) === null);
  const cases: [string, string, string, string][] = [
    ["2018-07-20", "19:00:00", "Europe/Istanbul", "UTC+03:00"],
    ["2018-01-15", "10:00:00", "America/New_York", "UTC−05:00"],
    ["2018-07-15", "10:00:00", "America/New_York", "UTC−04:00"],
    ["2018-03-25", "03:30:00", "Europe/Berlin", "UTC+02:00"],
    ["1990-05-01", "12:00:00", "Asia/Kolkata", "UTC+05:30"],
    ["2000-01-01", "00:30:00", "Asia/Kathmandu", "UTC+05:45"],
    ["1985-06-10", "08:00:00", "Europe/Istanbul", "UTC+03:00"],
    ["1985-12-10", "08:00:00", "Europe/Istanbul", "UTC+02:00"],
    ["2018-07-20", "01:00:00", "Europe/Istanbul", "UTC+03:00"],
  ];
  for (const [d, t, tz, want] of cases) {
    const r = resolveBirthLocalTime(d, t, tz);
    const iso = r.kind === "ok" ? r.utcIso : null;
    const off = utcOffsetMinutes(d, t, iso);
    ok(`A3 ofset ${tz} ${d} ${t} → ${want} (sunucu DST çözümleyicisiyle tutarlı)`, r.kind === "ok" && off != null && formatUtcOffset(off) === want && off * 60 === r.offsetSeconds, { off, r });
  }
  ok("A4 gün sınırı: yerel 20.07 01:00 İstanbul → UTC 19.07 22:00", formatUtcIso(resolveBirthLocalTime("2018-07-20", "01:00:00", "Europe/Istanbul").kind === "ok" ? (resolveBirthLocalTime("2018-07-20", "01:00:00", "Europe/Istanbul") as { utcIso: string }).utcIso : null) === "19.07.2018 22:00 UTC");
  ok("A5 tutarsız UTC (ofset aralık dışı) → null", utcOffsetMinutes("2018-07-20", "19:00", "2018-07-25T16:00:00.000Z") === null);
  ok("A6 yaş: doğum günü geçti", ageOn("2018-07-20", TODAY) === 8);
  ok("A7 yaş: doğum günü henüz gelmedi → bir eksik", ageOn("2018-10-08", TODAY) === 7);
  ok("A8 yaş: doğum günü bugün", ageOn("2018-10-07", TODAY) === 8);
  ok("A9 yaş: 29 Şubat doğumlu, artık olmayan yıl 28 Şubat → henüz dolmadı", ageOn("2000-02-29", { y: 2026, m: 2, d: 28 }) === 25 && ageOn("2000-02-29", { y: 2026, m: 3, d: 1 }) === 26);
  ok("A10 yaş: tarih yok/bozuk → null (tahmin yok)", ageOn(null, TODAY) === null && ageOn("abc", TODAY) === null);
  const legacy = buildChartSubjectInfo({ clientName: "X", birthDate: "1990-01-01", birthTime: null, birthPlace: null, timezone: "Europe/Istanbul" }, TODAY);
  ok("A11 eksik alan TAHMİN EDİLMEZ (koordinat/UTC/yer yok → null)", legacy.coordinates === null && legacy.utcDateTime === null && legacy.place === null && legacy.localDateTime === "01.01.1990" && legacy.zoneLabel === "Europe/Istanbul");
  const south = buildChartSubjectInfo({ latitude: -33.8688, longitude: -70.6693 }, TODAY);
  ok("A12 koordinat yönü: güney/batı", south.coordinates === "33,8688° G · 70,6693° B");

  // ── B) Uçtan uca: hesap → kayıt → GET → bilgi bloğu → render ──
  const calls: unknown[] = [];
  const fatih = roxyCityToLocation({ city: "Fatih", province: "Istanbul", country: "Turkey", iso2: "TR", latitude: 41.0225, longitude: 28.9408, timezone: "Europe/Istanbul" });
  const ref = signLocationRef(fatih, ENV)!;
  const f = createFakeDb({
    human_design_clients: [{ id: C_A, tenant_id: T_A, name: "Ayşe Yılmaz", birth_date: "2018-07-20", birth_time: "19:00", birth_place: "Fatih, İstanbul, Türkiye" }],
    human_design_charts: [],
  });
  const ctx = { db: f.db, tenantId: T_A, userId: U_A, isDemo: false };
  const first = await computeRoxyChart(ctx, { client_id: C_A, location_id: ref }, deps(calls));
  ok("B1 yeni hesap: tam 1 Roxy çağrısı", first.body.ok && first.body.reused === false && calls.length === 1);
  const id = first.body.ok ? first.body.id : "";
  const stored = clone(f.tables.human_design_charts[0].computed_result) as HdComputedChart;

  // Görüntüleme yolu (harita açma + sayfa yenileme ×3) → getComputedChart; Roxy çağrısı ARTMAZ.
  let g = await getComputedChart(f.db, T_A, id);
  for (let i = 0; i < 2; i++) g = await getComputedChart(f.db, T_A, id);
  ok("B2 harita açma / yenileme: 0 yeni Roxy çağrısı", calls.length === 1 && !!g.row);
  const row = g.row as Record<string, unknown>;
  ok("B3 detay yanıtı ham sağlayıcı yanıtını taşımaz", !("provider_raw" in row));
  const result = row.computed_result as HdComputedChart;
  const input = row.input as { latitude: number; longitude: number };
  const subject = buildChartSubjectInfo(
    {
      clientName: row.client_name as string,
      birthDate: row.birth_date as string,
      birthTime: row.birth_time as string,
      birthPlace: row.birth_place as string,
      timezone: row.timezone as string,
      latitude: input.latitude,
      longitude: input.longitude,
      birthUtcIso: result.timing.birthUtcIso,
    },
    TODAY,
  );
  ok("B4 ad soyad", subject.name === "Ayşe Yılmaz");
  ok("B5 yerel tarih/saat", subject.localDateTime === "20.07.2018 19:00");
  ok("B6 saat dilimi + ofset", subject.zoneLabel === "Europe/Istanbul · UTC+03:00");
  ok("B7 UTC (kayıtlı, sunucu DST-güvenli)", subject.utcDateTime === "20.07.2018 16:00 UTC" && result.timing.birthUtcIso === "2018-07-20T16:00:00.000Z");
  ok("B8 doğum yeri: ilçe + il + ülke", subject.place === "Fatih, İstanbul, Türkiye");
  ok("B9 koordinatlar (hesapta kullanılan)", subject.coordinates === "41,0225° K · 28,9408° D" && input.latitude === 41.0225 && input.longitude === 28.9408);
  ok("B10 yaş", subject.age === 8);

  const before = JSON.stringify(result);
  const html = renderToStaticMarkup(createElement(HdComputedChartView, { result, roxyRender: buildRoxyRenderPayload(FIXTURE), subject }));
  ok("B11 render computed_result'ı değiştirmez (kayıtla birebir)", JSON.stringify(result) === before && before === JSON.stringify(stored));

  // Referans (normalize edilmiş fixture) ile kalıcı değerler birebir
  const v = validateRoxyBodygraph(FIXTURE);
  if (!v.ok) throw new Error("fixture");
  const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 41.0225, longitude: 28.9408, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
  if (!n.ok) throw new Error("norm");
  const ref2 = n.chart;
  ok("B12 Type/Strategy/Authority/Profile/Definition/Cross/Signature/Not-Self kayıtla birebir",
    result.type === ref2.type && result.strategy === ref2.strategy && result.authority === ref2.authority && result.profile === ref2.profile &&
    result.definition.kind === ref2.definition.kind && JSON.stringify(result.incarnationCross) === JSON.stringify(ref2.incarnationCross) &&
    result.signature === ref2.signature && result.notSelf === ref2.notSelf);
  ok("B13 Gates/Channels/Centers kayıtla birebir", JSON.stringify(result.channels) === JSON.stringify(ref2.channels) && JSON.stringify(result.centers) === JSON.stringify(ref2.centers) && JSON.stringify(result.activations) === JSON.stringify(ref2.activations));

  // ── C) Ekran: bilgi bloğu içeriği ──
  const info = html.slice(html.indexOf("data-hd-info"), html.indexOf("data-hd-stage"));
  const field = (k: string) => {
    const m = new RegExp(`data-hd-info-field="${k}"[^>]*>([\\s\\S]*?)</div>`).exec(info);
    return m ? m[1].replace(/<[^>]+>/g, "|").replace(/\|+/g, "|") : "";
  };
  ok("C1 Ad Soyad", field("name").includes("Ayşe Yılmaz"));
  ok("C2 Doğum Tarihi = doğum yerinin YEREL saati + tz/ofset (etiket sade)", field("local").includes("|Doğum Tarihi|") && field("local").includes("20.07.2018 19:00") && field("local").includes("Europe/Istanbul · UTC+03:00"));
  ok("C3 UTC künyede ayrı satır DEĞİL; UTC verisi korunur (kayıt + bilgi modeli)", !info.includes("(UTC)") && !info.includes("16:00 UTC") && !info.includes("(Yerel)") && subject.utcDateTime === "20.07.2018 16:00 UTC" && result.timing.birthUtcIso === "2018-07-20T16:00:00.000Z");
  ok("C4 Doğum yeri", field("place").includes("Fatih, İstanbul, Türkiye"));
  ok("C5 Koordinatlar", field("coords").includes("41,0225° K · 28,9408° D"));
  ok("C6 Yaş", /\|8\|/.test(field("age")));
  ok("C7 Tip (Türkçe uygulama etiketi)", field("type").includes("Generator"));
  ok("C8 UAT: solda yalnız teknik künye (10 alan, sıra sabit)", [...info.matchAll(/data-hd-info-field="([a-z]+)"/g)].map((m) => m[1]).join(",") === "name,local,place,coords,age,type,profile,definition,cross,authority");
  ok("C9 İç Otorite", field("authority").includes("Sacral Otorite"));
  ok("C10 Profil", field("profile").includes("2/4 — Münzevi / Fırsatçı"), field("profile"));
  ok("C11 Tanım", field("definition").includes("İkili Tanım (Split)"), field("definition"));
  ok("C12 Enkarnasyon Haçı + kapılar", field("cross").includes("Right Angle Cross of Laws 2") && field("cross").includes(`${ref2.incarnationCross.gates[0]}/${ref2.incarnationCross.gates[1]} | ${ref2.incarnationCross.gates[2]}/${ref2.incarnationCross.gates[3]}`));
  ok("C13 UAT: Strateji / İmza / Benlik-dışı solda YOK", !/data-hd-info-field="(strategy|signature|notself)"/.test(info) && !info.includes("Strateji") && !info.includes("İmza") && !info.includes("Benlik-dışı") && !info.includes("Yanıt vermek için beklemek") && !info.includes("Tatmin"));
  ok("C14 UAT: kanal / merkez / kapı / Bilgi Bankası solda YOK", !info.includes("Kanal") && !info.includes("Merkez") && !info.includes("Kapı") && !info.includes("data-hd-info-group=\"channels\"") && !info.includes("Bilgi Bankası"));
  const lower = html.slice(html.indexOf("data-hd-stage"));
  ok("C15 alt bölümler korunur: Tanımlı Kanallar (Türkçe ad) + Merkezler + Aktif Kapılar", n.codes.channels.every((c) => lower.includes(`data-hd-channel="${c}"`)) && lower.includes("Tanımlı Kanallar") && lower.includes("Merkezler") && lower.includes("Aktif Kapılar"));
  ok("C16 Design 13 + Personality 13", count(html, /data-hd-activation="design:/g) === 13 && count(html, /data-hd-activation="personality:/g) === 13);
  const acts = [...html.matchAll(/data-hd-activation="([^"]+)"/g)].map((m) => m[1]);
  ok("C17 26 aktivasyon gate.line kayıtla birebir", ref2.activations.every((a) => acts.includes(`${a.side}:${a.body}:${a.gate}.${a.line}`)));
  ok("C18 alt bölüm: kanallar/merkezler/kapılar korunur", count(html, /data-hd-channel=/g) === n.codes.channels.length && count(html, /data-hd-center=/g) === 9 && count(html, /data-hd-gate=/g) === n.codes.gates.length);

  // ── D) Yerleşim / tekrar / marka ──
  ok("D1 HD alanları sayfada tek yerde (tekrar yok)", count(html, />Enkarnasyon Haçı</g) === 1 && count(html, />Tip</g) === 1 && count(html, />Strateji</g) === 0);
  ok("D2 DOM sırası: bilgi → Design → BodyGraph → Personality (mobilde bilgi en üstte)", html.indexOf("data-hd-info") < html.indexOf('data-hd-side="design"') && html.indexOf('data-hd-side="design"') < html.indexOf("<roxy-bodygraph") && html.indexOf("<roxy-bodygraph") < html.indexOf('data-hd-side="personality"'));
  ok("D3 geniş masaüstü: [Bilgi][Design][BodyGraph][Personality] TEK kart (bilgi kartsız, iç kaydırma YOK)", html.includes("hdwide:flex-row") && html.includes("hdwide:w-[252px]") && html.includes("hdwide:border-0 hdwide:border-r") && html.includes("hdwide:bg-transparent") && !info.includes("overflow-y-auto") && !info.includes("overflow-auto") && !info.includes("sticky") && html.includes("hdwide:rounded-2xl hdwide:border hdwide:border-indigo-200/70") && html.includes("hdwide:bg-none hdwide:shadow-none"));
  ok("D4 BodyGraph yükseklik-öncelikli yerleşim korunur", html.includes("lg:h-[calc(100dvh-5.25rem)]") && html.includes('data-hd-renderer="roxy-official"') && html.includes("lg:h-full lg:w-auto"));
  ok("D5 Design/Personality sütun genişliği DEĞİŞMEDİ", count(html, /lg:w-\[clamp\(190px,17vw,280px\)\]/g) === 2);
  ok("D6 logo: şeffaf PNG, panelin altında, sahnede DEĞİL; alan adı ayrıca metin olarak YOK", info.includes('src="/assets/yasam-sistemi-chart-logo.png"') && info.includes('alt="Yaşam Sistemi — yasamsistemi.com"') && info.indexOf("data-hd-brand") > info.indexOf('data-hd-info-field="authority"') && !lower.includes("yasam-sistemi-chart-logo") && !info.replace(/alt="[^"]*"/g, "").includes("yasamsistemi.com") && !info.includes("Bütüncül"));
  ok("D7 Roxy / Genetic Matrix markası eklenmedi", !/genetic\s*matrix/i.test(html) && !/roxy/i.test(info));
  ok("D8 mobil: metin kesilmez (truncate yalnız lg şeritte)", !/class="[^"]*(?<!lg:)\btruncate\b[^"]*text-\[13px\]/.test(info) && info.includes("break-words"));
  const tw = src("tailwind.config.js");
  ok("D9 hdwide varyantı: ≥1280px + en-boy ≥ 16:10, özgüllükle (sıra bağımsız)", tw.includes('addVariant("hdwide", "@media (min-width: 1280px) and (min-aspect-ratio: 8/5) { html & }")'));
  ok("D9b screens'e nesne eklenmedi (min-[…]/max-* varyantları bozulmaz)", !/screens\s*:/.test(tw));

  const noSubject = renderToStaticMarkup(createElement(HdComputedChartView, { result }));
  ok("D10 subject yoksa yalnız HD bilgileri (danışan alanı uydurulmaz)", !noSubject.includes('data-hd-info-group="subject"') && noSubject.includes('data-hd-info-group="chart"'));
  const panelSrc = src("app/human-design/kayitli-haritalar/components/HdChartInfoPanel.tsx");
  ok("D11 logo kırpılmaz: geniş kolonda KALAN alana oranı korunarak sığar (abs + max-h/max-w + object-contain, sabit vh boyu YOK)", panelSrc.includes("hdwide:relative hdwide:block hdwide:min-h-[60px] hdwide:flex-1") && panelSrc.includes("hdwide:absolute hdwide:inset-x-0 hdwide:bottom-0 hdwide:top-3") && panelSrc.includes("hdwide:max-h-[min(150px,calc(100%-0.75rem))] hdwide:max-w-[200px]") && panelSrc.includes("object-contain") && !panelSrc.includes("hdwide:w-[clamp(144px,20vh"));
  ok("D12 sakin tipografi: değerler bold değil, etiketler ikincil", panelSrc.includes("font-medium leading-snug text-slate-800") && panelSrc.includes("text-slate-400") && !panelSrc.includes("font-black"));

  // ── E) Statik: görüntüleme yolu Roxy çağırmaz; anahtar istemciye girmez ──
  const uiFiles = [
    "app/human-design/kayitli-haritalar/components/HdChartInfoPanel.tsx",
    "app/human-design/kayitli-haritalar/components/HdComputedChartView.tsx",
    "app/human-design/kayitli-haritalar/components/HdComputedChartModal.tsx",
    "lib/human-design/chart/chartSubjectInfo.ts",
  ].map(src).join("\n");
  ok("E1 bilgi bloğu / görünüm / modal: Roxy çağrısı veya hesap ucu YOK", !/callRoxy|computeRoxyChart|providers\/roxy\/client|\/api\/hd\/charts\/roxy|fetch\(/.test(uiFiles));
  ok("E2 ROXY_API_KEY istemci dosyalarında YOK", !uiFiles.includes("ROXY_API_KEY"));
  ok("E3 tarayıcı saat dilimine güvenilmez (getTimezoneOffset / toLocale* UTC için yok)", !/getTimezoneOffset|toLocaleTimeString|Intl\.DateTimeFormat/.test(src("lib/human-design/chart/chartSubjectInfo.ts")));
  const png = readFileSync(join(ROOT, "public/assets/yasam-sistemi-chart-logo.png"));
  // PNG IHDR: genişlik/yükseklik (16..24), renk tipi 6 = RGBA (şeffaflık korunur)
  ok("E4 logo varlığı: PNG, RGBA (şeffaf), 520×390", png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) === 520 && png.readUInt32BE(20) === 390 && png[25] === 6);

  console.log(`\n${passed} PASS / ${failed} FAIL`);
  if (failed) {
    for (const x of fails) console.log(" -", x);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
