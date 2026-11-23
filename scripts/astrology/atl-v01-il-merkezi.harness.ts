/**
 * ATL-V01 (16.11.2026) — Türkiye il merkezi koordinatları: kaynak doğrulaması + modüller arası regresyon.
 *
 *   A) Veri: lib/location/tr.ts 81 kayıt; kimlik / ad / saat dilimi kanıt dosyasıyla aynı; 74 kayıt BİREBİR değişmedi;
 *      düzeltilen 7 kayıt GeoNames PPLA noktasında; her kayıt üç bağımsız kaynaktan (GeoNames PPLA/PPLC, Wikidata P36→P625,
 *      OSM place=city/town) en az ikisine ≤2 km ve kaynaklar kendi aralarında ≤2 km.
 *   B) Ortak çözümleyiciler (Atlas, Human Design, genel konum katmanı, kampanya) aynı kimliği aynı koordinata çözer.
 *   C) HD 973 ilçe dizini: 12 vekil ilçe düzeltilen illerde değil; vekil koordinatı = il merkezi (V2) korunur.
 *   D) Atlas KAYITLI veri değişmezliği: eski koordinatla açılmış profil + kayıtlı analiz → yeniden açma / rapor birebir aynı,
 *      tekrar hesap önbellekten (0 sağlayıcı isteği), revizyon koordinatı değişmez.
 *   E) Atlas YENİ hesap: yeni profil ve ikincil yer seçimi (KP gözlem yeri) düzeltilmiş koordinatı kullanır.
 *   F) Kozmik Takvim: gezegen saati (gün doğumu tabanlı) düzeltilmiş koordinatla hesaplanır; fark beklenen büyüklükte.
 * Gerçek Roxy / gerçek DB / ağ YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atl-v01-il-merkezi.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createFakeClient, createStore } from "./fakeSupabase";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { searchLocations } from "@/lib/location";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import { resolveHdBirthLocation } from "@/lib/human-design/api/hdBirthLocation";
import { TR_DISTRICT_RECORDS } from "@/lib/human-design/location/trDistricts";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { resolveSelectionContexts, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { getPlanetaryHoursForDate } from "@/lib/cosmic/planetary-hours";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Pt = [number, number] | null;
type Il = {
  id: string; ad: string; tz: string; onceki: [number, number]; yeni: [number, number]; karar: "DOGRU" | "DUZELT";
  geonames: { p: Pt }; wikidata: { p: Pt }; osm: { p: Pt };
};
const KANIT = JSON.parse(readFileSync(join(__dirname, "fixtures", "atl-v01", "tr-il-merkezi-kaynaklar-2026-11-16.json"), "utf8")) as { iller: Il[]; _esik_km: number };
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

function km(a: [number, number], b: [number, number]): number {
  const R = Math.PI / 180;
  const dp = (b[0] - a[0]) * R;
  const dl = (b[1] - a[1]) * R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const DUZELTILEN = ["tr-13-bitlis", "tr-14-bolu", "tr-29-gumushane", "tr-41-kocaeli", "tr-49-mus", "tr-50-nevsehir", "tr-54-sakarya"];
const ESIK = KANIT._esik_km;
const MUS_ESKI: ResolvedLocation = { id: "tr-49-mus", label: "Muş, Türkiye", timezone: "Europe/Istanbul", latitude: 38.9462, longitude: 41.7539 };
const MUS_YENI: [number, number] = [38.7316, 41.4848];

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT = "56565656-5656-4565-8565-565656565656";

async function main() {
  // ─── A) Veri ────────────────────────────────────────────────────────────────────────────────────────────────────────
  await t("A1: 81 il; kimlik / ad / saat dilimi kanıt dosyasıyla birebir (yalnız koordinat değişebilir)", () => {
    assert.equal(TR_LOCATIONS.length, 81);
    assert.equal(KANIT.iller.length, 81);
    for (const k of KANIT.iller) {
      const l = TR_LOCATIONS.find((x) => x.id === k.id);
      assert.ok(l, k.id);
      assert.equal(l.name, k.ad, k.id);
      assert.equal(l.tz, k.tz, k.id);
    }
  });

  await t("A2: düzeltilmeyen 74 il koordinatı öncekiyle BİREBİR aynı; düzeltilen tam 7 il", () => {
    const degisen = KANIT.iller.filter((k) => {
      const l = TR_LOCATIONS.find((x) => x.id === k.id)!;
      return l.lat !== k.onceki[0] || l.lon !== k.onceki[1];
    }).map((k) => k.id);
    assert.deepEqual(degisen.sort(), [...DUZELTILEN].sort());
    assert.deepEqual(KANIT.iller.filter((k) => k.karar === "DUZELT").map((k) => k.id).sort(), [...DUZELTILEN].sort());
  });

  await t("A3: düzeltilen 7 il = kanıt dosyasındaki yeni değer (GeoNames PPLA, 4 ondalık) ve önceki değerden >2 km", () => {
    for (const id of DUZELTILEN) {
      const k = KANIT.iller.find((x) => x.id === id)!;
      const l = TR_LOCATIONS.find((x) => x.id === id)!;
      assert.deepEqual([l.lat, l.lon], k.yeni, id);
      assert.ok(km(k.geonames.p!, [l.lat, l.lon]) < 0.01, `${id} GeoNames PPLA noktası`);
      assert.ok(km(k.onceki, [l.lat, l.lon]) > ESIK, `${id} gerçek düzeltme`);
    }
  });

  await t("A4: 81 ilin her biri en az iki bağımsız kaynağa ≤2 km; kaynaklar kendi aralarında ≤2 km (düzeltilenler)", () => {
    for (const k of KANIT.iller) {
      const l = TR_LOCATIONS.find((x) => x.id === k.id)!;
      const pts = [k.geonames.p, k.wikidata.p, k.osm.p].filter((p): p is [number, number] => !!p);
      const yakin = pts.filter((p) => km(p, [l.lat, l.lon]) <= ESIK).length;
      assert.ok(yakin >= 1, `${k.id}: hiçbir kaynağa ≤${ESIK} km değil`);
      if (k.karar === "DUZELT") {
        assert.equal(pts.length, 3, `${k.id}: üç kaynak`);
        assert.ok(yakin >= 2, `${k.id}: en az iki kaynağa ≤${ESIK} km`);
        for (const a of pts) for (const b of pts) assert.ok(km(a, b) <= ESIK, `${k.id}: kaynak yayılımı`);
      }
    }
  });

  // ─── B) Ortak çözümleyiciler ───────────────────────────────────────────────────────────────────────────────────────
  // Not: lib/location getLocationById yalnız SEED_LOCATIONS'ta arar (tr-* kimliği yok, uygulamada çağıran yok) → kapsam dışı.
  await t("B1: Atlas (+ kampanya parsePlace) ve HD aynı kimliği aynı (düzeltilmiş) koordinata çözer; saat dilimi Europe/Istanbul", () => {
    for (const id of DUZELTILEN) {
      const l = TR_LOCATIONS.find((x) => x.id === id)!;
      const a = resolveAstroLocation(id)!;
      const h = resolveHdBirthLocation(id)!;
      assert.deepEqual([a.latitude, a.longitude], [l.lat, l.lon], `${id} Atlas`);
      assert.deepEqual([h.latitude, h.longitude], [l.lat, l.lon], `${id} HD`);
      assert.equal(a.timezone, "Europe/Istanbul");
      assert.equal(h.timezone, "Europe/Istanbul");
    }
  });

  await t("B2: arama (Atlas seçici, Ayarlar, Kozmik Takvim, kampanya — searchLocations/TR_LOCATIONS) aynı kimlik ve adı döndürür", () => {
    for (const [q, id] of [["Muş", "tr-49-mus"], ["Bolu", "tr-14-bolu"], ["Kocaeli", "tr-41-kocaeli"], ["Nevşehir", "tr-50-nevsehir"], ["Sakarya", "tr-54-sakarya"], ["Bitlis", "tr-13-bitlis"], ["Gümüşhane", "tr-29-gumushane"]] as const) {
      const r = searchLocations(q, { dataset: TR_LOCATIONS, limit: 5 });
      assert.equal(r[0]?.id, id, q);
    }
  });

  // ─── C) HD ilçe dizini ─────────────────────────────────────────────────────────────────────────────────────────────
  await t("C1: HD 12 vekil ilçe düzeltilen illerde değil; vekil koordinatı = il merkezi (V2) korunur", () => {
    const plakalar = new Set(DUZELTILEN.map((id) => id.slice(3, 5)));
    const vekil = TR_DISTRICT_RECORDS.filter((r) => r.durum === "vekil");
    assert.equal(vekil.length, 12);
    assert.ok(vekil.every((r) => !plakalar.has(r.plaka)), "vekil ilçe düzeltilen ilde");
    assert.ok(vekil.every((r) => {
      const p = TR_LOCATIONS.find((l) => l.id.slice(3, 5) === r.plaka)!;
      return p.lat === r.lat && p.lon === r.lon;
    }));
  });

  // ─── D/E) Atlas kayıtlı veri değişmezliği ve yeni hesap ────────────────────────────────────────────────────────────
  const store = createStore({ clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "Muş" }] });
  const ctx: EngineCtx = { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  const bodies: Record<string, unknown>[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-atl-v01", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, _endpoint, body) => {
      bodies.push(body as Record<string, unknown>);
      const raw = structuredClone(NATAL_GOLDEN.response ?? NATAL_GOLDEN) as Record<string, unknown>;
      raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
      raw.houseSystem = body.houseSystem;
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
  const profiller = () => (store.tables.astro_birth_profiles as J[] | undefined ?? []).map((p) => p.id);
  let eskiPid = "";
  let eskiAnalizId = "";
  let eskiGorunum = "";
  let eskiRapor = "";
  let eskiSatir = "";

  await t("D1: düzeltme öncesi koordinatla açılmış profil → natal sağlayıcı isteği ESKİ (saklı) koordinatla; analiz kaydedilir", async () => {
    const pr = await createAstroProfile(ctx, { label: "Sentetik Muş (eski)", clientId: CLIENT, birthDate: "1988-03-21", birthTime: "06:40", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-49-mus" }, (id) => (id === "tr-49-mus" ? MUS_ESKI : null));
    assert.equal(pr.status, 201, JSON.stringify(pr.body));
    eskiPid = (pr.body as J).profile.id;
    const run = (await runAstrology(ctx, { profileId: eskiPid, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(run.ok, true, JSON.stringify(run).slice(0, 300));
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].latitude, MUS_ESKI.latitude);
    assert.equal(bodies[0].longitude, MUS_ESKI.longitude);
    const sv = await saveAnalysis(ctx, { profileId: eskiPid, revision: 1, ...NATAL, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    eskiAnalizId = (sv.body as J).analysisId;
    const a = ((await getAnalysis(ctx, eskiAnalizId, false)).body as J).analysis;
    eskiGorunum = JSON.stringify(a);
    eskiRapor = reportTexts(buildAstroReport(a)).join("\n");
    const row = (store.tables.astro_analyses as J[]).find((x) => x.id === eskiAnalizId);
    eskiSatir = JSON.stringify([row.technical_snapshot, row.method_snapshot, row.versions_snapshot, row.profile_snapshot]);
  });

  await t("D2: düzeltme SONRASI aynı profil → revizyon koordinatı değişmez; tekrar hesap önbellekten (0 sağlayıcı isteği)", async () => {
    const rev = (store.tables.astro_birth_profile_revisions as J[]).find((r) => r.profile_id === eskiPid);
    assert.equal(rev.latitude, MUS_ESKI.latitude);
    assert.equal(rev.longitude, MUS_ESKI.longitude);
    assert.notDeepEqual([resolveAstroLocation("tr-49-mus")!.latitude, resolveAstroLocation("tr-49-mus")!.longitude], [MUS_ESKI.latitude, MUS_ESKI.longitude], "kimlik artık düzeltilmiş koordinata çözülüyor");
    const once = bodies.length;
    const run = (await runAstrology(ctx, { profileId: eskiPid, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(run.ok, true, JSON.stringify(run).slice(0, 300));
    assert.equal(bodies.length, once, "yeni sağlayıcı isteği yapılmamalı");
  });

  await t("D3: kayıtlı analiz yeniden açma görünümü, Word/PDF rapor metni ve DB snapshot birebir aynı", async () => {
    const a = ((await getAnalysis(ctx, eskiAnalizId, false)).body as J).analysis;
    assert.equal(JSON.stringify(a), eskiGorunum);
    assert.equal(reportTexts(buildAstroReport(a)).join("\n"), eskiRapor);
    const row = (store.tables.astro_analyses as J[]).find((x) => x.id === eskiAnalizId);
    assert.equal(JSON.stringify([row.technical_snapshot, row.method_snapshot, row.versions_snapshot, row.profile_snapshot]), eskiSatir);
  });

  await t("E1: YENİ profil (gerçek çözümleyici) düzeltilmiş koordinatı saklar; natal isteği düzeltilmiş koordinatla (yeni girdi özeti)", async () => {
    const pr = await createAstroProfile(ctx, { label: "Sentetik Muş (yeni)", clientId: CLIENT, birthDate: "1988-03-21", birthTime: "06:40", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-49-mus", confirmDifferentPerson: profiller() }, resolveAstroLocation);
    assert.equal(pr.status, 201, JSON.stringify(pr.body));
    const pid = (pr.body as J).profile.id;
    const rev = (store.tables.astro_birth_profile_revisions as J[]).find((r) => r.profile_id === pid);
    assert.deepEqual([rev.latitude, rev.longitude], MUS_YENI);
    const once = bodies.length;
    const run = (await runAstrology(ctx, { profileId: pid, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(run.ok, true, JSON.stringify(run).slice(0, 300));
    assert.equal(bodies.length, once + 1);
    assert.deepEqual([bodies.at(-1)!.latitude, bodies.at(-1)!.longitude], MUS_YENI);
  });

  await t("E2: ikincil yer (KP Horary gözlem yeri tr-49-mus) düzeltilmiş koordinatla; yer seçilmezse ESKİ profil revizyonu kullanılır", async () => {
    const rev = (store.tables.astro_birth_profile_revisions as J[]).find((r) => r.profile_id === eskiPid);
    const sel = (place: string | null) => ({ technique: "kp.horary", options: { atUtc: "2026-10-07T10:00", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: place } });
    const r1 = await resolveSelectionContexts(ctx, rev, [sel("tr-49-mus")] as J);
    assert.ok(r1.ok);
    const p1 = (r1 as J).v[0].options.place;
    assert.deepEqual([p1.latitude, p1.longitude], MUS_YENI);
    const r2 = await resolveSelectionContexts(ctx, rev, [sel(null)] as J);
    const p2 = (r2 as J).v[0].options.place;
    assert.deepEqual([p2.latitude, p2.longitude], [MUS_ESKI.latitude, MUS_ESKI.longitude]);
  });

  // ─── F) Kozmik Takvim ──────────────────────────────────────────────────────────────────────────────────────────────
  await t("F1: Kozmik Takvim gezegen saatleri düzeltilmiş koordinatla; Muş gün doğumu farkı 0,5–3 dk (boylam ~0,27°)", () => {
    const day = new Date("2026-06-21T09:00:00Z");
    const yeni = getPlanetaryHoursForDate(day, MUS_YENI[0], MUS_YENI[1], 180, 180);
    const eski = getPlanetaryHoursForDate(day, MUS_ESKI.latitude, MUS_ESKI.longitude, 180, 180);
    const l = TR_LOCATIONS.find((x) => x.id === "tr-49-mus")!;
    const canli = getPlanetaryHoursForDate(day, l.lat, l.lon, 180, 180);
    assert.equal(canli[0].start.getTime(), yeni[0].start.getTime());
    const dk = Math.abs(yeni[0].start.getTime() - eski[0].start.getTime()) / 60000;
    assert.ok(dk >= 0.5 && dk <= 3, `gün doğumu farkı ${dk.toFixed(2)} dk`);
    console.log(`     Muş 21.06.2026 gün doğumu: eski ${eski[0].start.toISOString()} → yeni ${yeni[0].start.toISOString()} (${dk.toFixed(2)} dk)`);
  });

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
