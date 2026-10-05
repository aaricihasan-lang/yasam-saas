/**
 * HD satış öncesi UX / lokasyon / profesyonel harita harness'i.
 *
 * Çalıştırma:  npx tsx scripts/hd-roxy/ux-harness.ts
 * GERÇEK Roxy / DB çağrısı YOK (fixture + mock fetch + fakeDb).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseRoxyLocationResponse, searchRoxyLocations } from "../../lib/human-design/providers/roxy/location";
import { roxyCityToLocation, signLocationRef, verifyLocationRef } from "../../lib/human-design/api/hdLocationRef";
import { resolveHdBirthLocation } from "../../lib/human-design/api/hdBirthLocation";
import { computeRoxyChart, type RoxyServiceDeps } from "../../lib/human-design/api/roxyChartService";
import { resolveAutoCalcState } from "../../lib/human-design/chart/autoCalcState";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { GATE_ANCHORS } from "../../lib/human-design/bodygraph/layout";
import { BodyGraph } from "../../app/human-design/harita/components/BodyGraph";
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
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : "");
  }
}

// Doğrulanmış gerçek Roxy /location/search yanıt biçimi (2026-10-05, q="Selçuklu").
const LOC_SAMPLE = {
  total: 1, limit: 10, offset: 0,
  cities: [{ city: "Selcuklu", province: "Konya", country: "Turkey", iso2: "TR", latitude: 37.8842, longitude: 32.4922, timezone: "Europe/Istanbul", utcOffset: 3, population: 0 }],
};
const ENV = { HD_LOCATION_REF_SECRET: "test-secret-not-real" } as unknown as NodeJS.ProcessEnv;

const T_A = "11111111-1111-4111-8111-111111111111";
const T_B = "22222222-2222-4222-8222-222222222222";
const U_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C_A = "c0000000-0000-4000-8000-00000000000a";
const C_A2 = "c0000000-0000-4000-8000-0000000000a2";

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

async function main() {
  console.log("HD UX / lokasyon / profesyonel harita harness'i (mock)\n");
  process.env.HD_LOCATION_REF_SECRET = "test-secret-not-real";

  // ── Lokasyon: Roxy şeması ──
  const cities = parseRoxyLocationResponse(LOC_SAMPLE);
  ok("L1 gerçek /location/search biçimi ayrıştırılır", !!cities && cities.length === 1 && cities[0].timezone === "Europe/Istanbul");
  ok("L2 bozuk gövde → null", parseRoxyLocationResponse({ results: [] }) === null && parseRoxyLocationResponse(null) === null);
  ok("L3 geçersiz öğe atılır (tz/koordinat yok)", parseRoxyLocationResponse({ cities: [{ city: "X", country: "Y" }, LOC_SAMPLE.cities[0]] })!.length === 1);
  let seenUrl = "";
  let seenKey = "";
  const r = await searchRoxyLocations({ apiKey: "SECRET-K", baseUrl: "https://roxyapi.com/api/v2" }, "Selçuklu", {
    fetchImpl: async (u, init) => {
      seenUrl = u;
      seenKey = (init.headers as Record<string, string>)["X-API-Key"];
      return new Response(JSON.stringify(LOC_SAMPLE), { status: 200 });
    },
  });
  ok("L4 GET /location/search?q= + X-API-Key başlıkta", r.ok && seenUrl.startsWith("https://roxyapi.com/api/v2/location/search?q=Sel%C3%A7uklu") && seenKey === "SECRET-K" && !seenUrl.includes("SECRET"));
  const r429 = await searchRoxyLocations({ apiKey: "k", baseUrl: "https://x.test" }, "abc", { fetchImpl: async () => new Response("no", { status: 429 }) });
  ok("L5 429 → rate_limited (gövde aktarılmaz)", !r429.ok && r429.kind === "rate_limited");

  // ── İmzalı referans ──
  const loc = roxyCityToLocation(cities![0]);
  ok("R1 kararlı kimlik + etiket", loc.id === "rx-tr-konya-selcuklu" && loc.label === "Selcuklu, Konya, Turkey");
  const ref = signLocationRef(loc, ENV)!;
  ok("R2 imza üretildi (rx1.)", !!ref && ref.startsWith("rx1."));
  ok("R3 doğrulama → aynı tz/koordinat", JSON.stringify(verifyLocationRef(ref, ENV)) === JSON.stringify(loc));
  const [pre, payload, sig] = [ref.slice(0, 4), ref.slice(4, ref.lastIndexOf(".")), ref.slice(ref.lastIndexOf(".") + 1)];
  const tampered = Buffer.from(JSON.stringify([loc.id, loc.label, "Asia/Tokyo", loc.latitude, loc.longitude])).toString("base64url");
  ok("R4 oynanmış yük (tz değişti) → red", verifyLocationRef(`${pre}${tampered}.${sig}`, ENV) === null);
  ok("R5 yanlış sır → red", verifyLocationRef(ref, { HD_LOCATION_REF_SECRET: "other" } as unknown as NodeJS.ProcessEnv) === null);
  ok("R6 sır yok → imza/doğrulama kapalı (fail-closed)", signLocationRef(loc, {} as NodeJS.ProcessEnv) === null && verifyLocationRef(ref, {} as NodeJS.ProcessEnv) === null);
  ok("R7 resolveHdBirthLocation imzalı ref'i çözer", resolveHdBirthLocation(ref)?.timezone === "Europe/Istanbul");
  ok("R8 imzasız serbest 'rx1.' metni → null", resolveHdBirthLocation(`rx1.${payload}.deadbeef`) === null);

  // ── Servis: ilçe ref + chart: yeniden kullanım + idempotency ──
  {
    const f = createFakeDb({
      human_design_clients: [
        { id: C_A, tenant_id: T_A, name: "A", birth_date: "2018-07-20", birth_time: "19:00", birth_place: "Selcuklu, Konya, Turkey" },
        { id: C_A2, tenant_id: T_A, name: "A2", birth_date: "2018-07-20", birth_time: "19:00", birth_place: "x" },
      ],
      human_design_charts: [],
    });
    const calls: unknown[] = [];
    const ctx = { db: f.db, tenantId: T_A, userId: U_A, isDemo: false };
    const first = await computeRoxyChart(ctx, { client_id: C_A, location_id: ref }, deps(calls));
    ok("S1 ilçe (imzalı ref) ile hesap", first.body.ok && first.body.reused === false && calls.length === 1);
    ok("S2 Roxy'ye giden tz/koordinat imzadan", JSON.stringify(calls[0]) === JSON.stringify({ date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.8842, longitude: 32.4922, nodeType: "true" }));
    const row = f.tables.human_design_charts[0];
    ok("S3 kayıt: location_id kararlı, birth_place etiket", row.location_id === "rx-tr-konya-selcuklu" && row.birth_place === "Selcuklu, Konya, Turkey");
    const id = first.body.ok ? first.body.id : "";
    const again = await computeRoxyChart(ctx, { client_id: C_A, location_id: ref }, deps(calls));
    ok("S4 aynı ref tekrar → reused, Roxy çağrısı YOK", again.body.ok && again.body.reused && calls.length === 1);
    const reuse = await computeRoxyChart(ctx, { client_id: C_A, location_id: `chart:${id}` }, deps(calls));
    ok("S5 sayfa yenilendi (chart: yeniden kullanım) → aynı input_hash → reused, Roxy YOK", reuse.body.ok && reuse.body.reused && reuse.body.id === id && calls.length === 1);
    const other = await computeRoxyChart(ctx, { client_id: C_A2, location_id: `chart:${id}` }, deps(calls));
    ok("S6 başka danışanın haritası konum kaynağı olamaz → 422", other.status === 422 && calls.length === 1);
    const otherTenant = await computeRoxyChart({ ...ctx, tenantId: T_B }, { client_id: C_A, location_id: `chart:${id}` }, deps(calls));
    ok("S7 başka tenant → danışan 404, Roxy YOK", otherTenant.status === 404 && calls.length === 1);
    f.tables.human_design_clients[0].birth_time = "20:00";
    const changed = await computeRoxyChart(ctx, { client_id: C_A, location_id: `chart:${id}` }, deps(calls));
    ok("S8 doğum saati değişti → yeni hesap (aynı konum yeniden kullanılır)", changed.body.ok && changed.body.reused === false && calls.length === 2);
  }

  // ── Panel durum kararı ──
  {
    const rows = [
      { id: "r1", birth_date: "2018-07-20", birth_time: "19:00:00", birth_place: "Konya, Türkiye", timezone: "Europe/Istanbul", engine_version: "roxyapi:roxy-bodygraph-1", created_at: "2026-10-05T10:00:00Z" },
      { id: "legacy", birth_date: "2018-07-20", birth_time: "19:00", birth_place: "Konya, Türkiye", timezone: "Europe/Istanbul", engine_version: "astronomy-engine 2.1.19", created_at: "2026-09-01T10:00:00Z" },
    ];
    const konya = { id: "tr-42-konya", label: "Konya, Türkiye", tz: "Europe/Istanbul" };
    ok("P1 doğum saati yok → missing_birth", resolveAutoCalcState({ birthDate: "2018-07-20", birthTime: null, birthPlace: "Konya, Türkiye", picked: konya, rows }).kind === "missing_birth");
    ok("P2 yer seçilmemiş + önceki yok → need_location", resolveAutoCalcState({ birthDate: "2018-07-20", birthTime: "19:00", birthPlace: "Konya", picked: null, rows: [] }).kind === "need_location");
    const open = resolveAutoCalcState({ birthDate: "2018-07-20", birthTime: "19:00", birthPlace: "Konya, Türkiye", picked: konya, rows });
    ok("P3 aynı girdi → open (Profesyonel haritayı aç, Roxy yok)", open.kind === "open" && open.chartId === "r1");
    const reuse = resolveAutoCalcState({ birthDate: "2018-07-20", birthTime: "19:00:00", birthPlace: "Konya, Türkiye", picked: null, rows });
    ok("P4 sayfa yenilendi (seçim yok) → önceki Roxy konumu chart: ile → open", reuse.kind === "open" && reuse.location.id === "chart:r1");
    const changed = resolveAutoCalcState({ birthDate: "2018-07-20", birthTime: "19:30", birthPlace: "Konya, Türkiye", picked: konya, rows });
    ok("P5 saat değişti → changed (Yeniden hesapla)", changed.kind === "changed" && changed.previousId === "r1");
    ok("P6 hiç Roxy haritası yok (yalnız eski motor) → new", resolveAutoCalcState({ birthDate: "2018-07-20", birthTime: "19:00", birthPlace: "Konya, Türkiye", picked: konya, rows: [rows[1]] }).kind === "new");
  }

  // ── computed_result değişmedi + tam ekran yerleşim ──
  {
    const v = validateRoxyBodygraph(FIXTURE);
    if (!v.ok) throw new Error("fixture");
    const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
    if (!n.ok) throw new Error("norm");
    const before = JSON.stringify(n.chart);
    const view = renderToStaticMarkup(createElement(HdComputedChartView, { result: n.chart }));
    ok("V1 render computed_result'ı değiştirmez", JSON.stringify(n.chart) === before);
    const acts = [...view.matchAll(/data-hd-activation="([^"]+)"/g)].map((m) => m[1]);
    const expected = n.chart.activations.map((a) => `${a.side}:${a.body}:${a.gate}.${a.line}`);
    ok("V2 26 aktivasyon UI'da birebir", acts.length === 26 && expected.every((e) => acts.includes(e)));
    ok("V3 kanallar/merkezler birebir", (view.match(/data-hd-channel=/g) ?? []).length === 4 && (view.match(/data-hd-center="[a-z_]+:defined"/g) ?? []).length === 6);
    ok("V4 masaüstü: BodyGraph yüksekliği ekrana göre (Head→Root tek bakış)", view.includes("lg:h-[calc(100dvh-6.5rem)]") && /data-hd-stage[^>]*|lg:flex-1/.test(view) && view.includes("lg:[&amp;_svg]:h-full"));
    ok("V5 masaüstü 3 sütun: Design → BodyGraph → Personality", view.indexOf('data-hd-side="design"') < view.indexOf("<svg") && view.indexOf("<svg") < view.indexOf('data-hd-side="personality"'));
    ok("V6 mobil: BodyGraph önce (order-1), sütunlar sonra", /order-1 flex w-full/.test(view) && /order-2 w-\[calc\(50%-0\.375rem\)\]/.test(view));
    const svg = renderToStaticMarkup(createElement(BodyGraph, { result: n.chart }));
    ok("V7 BodyGraph topolojisi: 9 merkez, daire = aktif kapı", (svg.match(/<polygon/g) ?? []).length === 9 && (svg.match(/<circle/g) ?? []).length === new Set(n.chart.activations.map((a) => a.gate)).size);
    const radii = [...svg.matchAll(/<circle[^>]*\br="([\d.]+)"/g)].map((m) => Number(m[1]));
    const anchors = Object.values(GATE_ANCHORS) as { x: number; y: number }[];
    let minD = Infinity;
    for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) minD = Math.min(minD, Math.hypot(anchors[i].x - anchors[j].x, anchors[i].y - anchors[j].y));
    ok("V8 aktif kapı rozetleri komşuya değmez (2r + halka < en yakın anchor)", radii.length > 0 && Math.max(...radii) * 2 + 0.8 < minD, { r: Math.max(...radii), minD });
  }

  // ── Statik: manuel fallback / güvenlik / metin ──
  {
    const detail = src("app/human-design/danisanlar/[id]/HdDanisanDetayContent.tsx");
    ok("M1 manuel harita kaydı danışan detayından erişilebilir", detail.includes("/human-design/harita-kaydi?clientId=") && detail.includes("Manuel Harita"));
    ok("M2 harita görseli yükleme korunur (katlanır bölümde)", detail.includes("<HdChartImageUpload"));
    ok("M3 harita-kaydi sayfası duruyor", src("app/human-design/harita-kaydi/page.tsx").length > 0);
    const panel = src("app/human-design/danisanlar/components/HdAutoCalcPanel.tsx");
    ok("M4 panelde ikinci tarih/saat girişi YOK", !/type="date"|type="time"/.test(panel));
    const hub = src("app/human-design/page.tsx");
    ok("M5 hub: otomatik hesaplama ana yetenek, manuel fallback anılıyor", hub.includes("otomatik BodyGraph hesapla") && hub.includes("manuel harita kaydı"));
    const route = src("app/api/hd/location/search/route.ts");
    ok("M6 konum ucu: modül yetkisi + demo engeli + cache + limit", route.includes('requireModuleAccess(req, "human_design")') && route.includes("is_demo_account") && route.includes("cache.get") && route.includes("hitDbRateLimit"));
    const picker = src("app/human-design/components/HdBirthLocationPicker.tsx");
    ok("M7 seçici Roxy'yi yalnız açık eylemle çağırır (typeahead değil)", picker.includes("extendedSearch") && !/useEffect[\s\S]{0,400}\/api\/hd\/location\/search/.test(picker));
    ok("M8 istemci bileşenleri sunucu konum/Roxy modülü import etmez", !/providers\/roxy\/location|hdLocationRef/.test(picker + panel + detail));
  }

  console.log(`\n${passed} PASS / ${failed} FAIL`);
  if (failed) {
    console.log(" - " + fails.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
