/**
 * HD — Türkiye 973 ilçe konum dizini · harness (gerçek Roxy / gerçek DB YOK).
 *
 *   D) veri kapsamı + lisans + istemci dizininde koordinat yok
 *   N) zorunlu ilçe senaryoları (Karesi/Altıeylül, Çumra, Kadıköy, Kartal/Sincan/Avcılar, Kale/Şahinbey/Yeşilyurt)
 *   V) vekil (12) — hesap koordinatı il merkezi, ekranda koordinat yerine açıklama
 *   S) sunucu güvenliği — Cey (TR etiketli, Asia/Baghdad) reddi; yurt dışı sonuç korunur; istemci koordinatı yok
 *   A) kayıtlı analiz durum kararı (eski kimlik ↔ yeni ilçe eşdeğerliği)
 *   R) kayıtlı analiz yeniden kullanımı (computeRoxyChart + FakeDb + reuse koruması) — Roxy çağrı sayısı
 *
 * Çalıştır: npm run hd:tr-districts:harness
 */

process.env.HD_LOCATION_REF_SECRET = "harness-only-location-ref-secret";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TR_LOCATIONS } from "../../../lib/location/tr";
import { TR_DISTRICT_RECORDS } from "../../../lib/human-design/location/trDistricts";
import {
  TR_DISTRICT_PROXY_NOTE,
  isTrDistrictProxy,
  sameHdLocationId,
  searchTrDistricts,
} from "../../../lib/human-design/location/trDistrictIndex";
import { TR_DISTRICT_ROWS } from "../../../lib/human-design/location/trDistrictIndex.generated";
import { toHdSearchResults } from "../../../lib/human-design/location/hdSearchResults";
import { LOCATION_MISMATCH_CODE, guardReusedChartLocation } from "../../../lib/human-design/location/reuseLocationGuard";
import { resolveHdBirthLocation, type HdBirthLocation } from "../../../lib/human-design/api/hdBirthLocation";
import { signLocationRef, verifyLocationRef } from "../../../lib/human-design/api/hdLocationRef";
import { computeRoxyChart, type RoxyServiceDeps } from "../../../lib/human-design/api/roxyChartService";
import { resolveAutoCalcState, type AutoCalcRow } from "../../../lib/human-design/chart/autoCalcState";
import { buildChartSubjectInfo } from "../../../lib/human-design/chart/chartSubjectInfo";
import { createFakeDb } from "../../hd-roxy/fakeDb";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: unknown): void {
  if (cond) passed++;
  else {
    failed++;
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : "");
  }
}
const section = (t: string) => console.log(`\n${t}`);

function km(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const rec = (ilce: string, il: string) => TR_DISTRICT_RECORDS.find((r) => r.ilce === ilce && r.il === il);

async function main(): Promise<void> {
  console.log("HD Türkiye 973 ilçe konum dizini — harness (mock; gerçek Roxy/DB YOK)");

  section("D) Kapsam, kimlik, lisans");
  {
    ok("D1 973 ilçe", TR_DISTRICT_RECORDS.length === 973, TR_DISTRICT_RECORDS.length);
    ok("D2 81 il", new Set(TR_DISTRICT_RECORDS.map((r) => r.il)).size === 81);
    ok("D3 her il 81-il listesinde", TR_DISTRICT_RECORDS.every((r) => TR_LOCATIONS.some((l) => l.name === r.il && l.id.slice(3, 5) === r.plaka)));
    ok("D4 kimlikler benzersiz", new Set(TR_DISTRICT_RECORDS.map((r) => r.id)).size === 973);
    ok("D5 hesap koordinatları benzersiz", new Set(TR_DISTRICT_RECORDS.map((r) => `${r.lat},${r.lon}`)).size === 973);
    ok("D6 tümü Europe/Istanbul", TR_DISTRICT_RECORDS.every((r) => r.tz === "Europe/Istanbul"));
    ok("D7 koordinatlar Türkiye sınırında", TR_DISTRICT_RECORDS.every((r) => r.lat > 35.8 && r.lat < 42.2 && r.lon > 25.6 && r.lon < 44.9));
    ok("D8 4 ondalık", TR_DISTRICT_RECORDS.every((r) => Math.round(r.lat * 1e4) / 1e4 === r.lat && Math.round(r.lon * 1e4) / 1e4 === r.lon));
    ok("D9 961 doğrulanmış + 12 vekil", TR_DISTRICT_RECORDS.filter((r) => r.durum === "dogrulandi").length === 961 && TR_DISTRICT_RECORDS.filter((r) => r.durum === "vekil").length === 12);
    ok("D10 kaynak yalnız GeoNames/Wikidata/il-merkezi", TR_DISTRICT_RECORDS.every((r) => /^(geonames:\d+|wikidata:Q\d+#P(36|625)|il-merkezi-vekil:tr-\d{2}-[a-z]+)$/.test(r.kaynak)));
    const json = JSON.parse(readFileSync(join(ROOT, "lib/human-design/location/trDistricts.generated.json"), "utf8")) as Record<string, unknown>;
    ok("D11 lisans/atıf başlığı (GeoNames CC BY 4.0 + Wikidata CC0)", String(json._lisans).includes("CC BY 4.0") && String(json._lisans).includes("CC0"));
    ok("D12 veri setinde Roxy kaynağı yok", TR_DISTRICT_RECORDS.every((r) => !/roxy/i.test(r.kaynak)));
    // Her ilçe seçilebilir: sunucu çözer + yerel aramada bulunur.
    const unresolved = TR_DISTRICT_RECORDS.filter((r) => {
      const l = resolveHdBirthLocation(r.id);
      return !l || l.timezone !== "Europe/Istanbul" || l.latitude !== r.lat || l.longitude !== r.lon || l.label !== r.label;
    });
    ok("D13 973 ilçenin tamamı sunucuda çözülür", unresolved.length === 0, unresolved.slice(0, 5).map((r) => r.id));
    const unsearchable = TR_DISTRICT_RECORDS.filter((r) => !searchTrDistricts(`${r.ilce} ${r.il}`).some((x) => x.id === r.id));
    ok("D14 973 ilçenin tamamı yerel aramada seçilebilir", unsearchable.length === 0, unsearchable.slice(0, 5).map((r) => r.id));
    ok("D15 istemci dizini satırında koordinat yok", TR_DISTRICT_ROWS.every((row) => row.length === 5 && (row[3] === 0 || row[3] === 1)));
    const clientTs = readFileSync(join(ROOT, "lib/human-design/location/trDistrictIndex.generated.ts"), "utf8");
    ok("D16 istemci dizin dosyasında enlem/boylam yok", !/\d{2}\.\d{4}/.test(clientTs) && !/"lat"|"lon"/.test(clientTs));
    ok("D17 bilinmeyen trd kimliği reddedilir", resolveHdBirthLocation("trd-99-yok") === null && resolveHdBirthLocation("trd-10-karesi;drop") === null);
  }

  section("N) Zorunlu ilçe senaryoları");
  {
    const karesi = rec("Karesi", "Balıkesir");
    const alti = rec("Altıeylül", "Balıkesir");
    ok("N1 Karesi ve Altıeylül ayrı kayıt", !!karesi && !!alti && karesi.id !== alti.id && `${karesi.lat},${karesi.lon}` !== `${alti.lat},${alti.lon}`);
    ok("N2 'Karesi' araması → Karesi, Balıkesir (ilk sonuç)", searchTrDistricts("Karesi")[0]?.id === "trd-10-karesi");
    ok("N3 'altieylul' (ASCII) → Altıeylül", searchTrDistricts("altieylul")[0]?.id === "trd-10-altieylul");
    const cumra = rec("Çumra", "Konya");
    ok("N4 Çumra → Konya, ilçe merkezi (≤3 km 37.573,32.774)", !!cumra && km([cumra.lat, cumra.lon], [37.573, 32.774]) <= 3, cumra);
    ok("N5 'cumra' → Çumra, Konya", searchTrDistricts("cumra")[0]?.label === "Çumra, Konya, Türkiye");
    const kad = rec("Kadıköy", "İstanbul");
    ok("N6 Kadıköy → İstanbul, ilçe merkezi (≤3 km 40.990,29.029)", !!kad && km([kad.lat, kad.lon], [40.99, 29.029]) <= 3, kad);
    ok("N7 Kadıköy yerel kaydı Roxy'deki köy kimliğine bağlı değil", !!kad && kad.aliases.length === 0);
    for (const [ilce, il] of [["Kartal", "İstanbul"], ["Sincan", "Ankara"], ["Avcılar", "İstanbul"]] as const) {
      ok(`N8 ${ilce} → ${il}`, !!rec(ilce, il) && searchTrDistricts(ilce)[0]?.il === il);
    }
    const seats: [string, string, [number, number]][] = [
      ["Kale", "Malatya", [38.4, 38.752]],
      ["Kale", "Denizli", [37.44, 28.845]],
      ["Şahinbey", "Gaziantep", [37.062, 37.38]],
      ["Yeşilyurt", "Malatya", [38.296, 38.248]],
      ["Yeşilyurt", "Tokat", [40.002, 36.222]],
    ];
    for (const [ilce, il, seat] of seats) {
      const r = rec(ilce, il);
      ok(`N9 ${ilce}/${il} doğru yerleşim merkezi (≤5 km)`, !!r && km([r.lat, r.lon], seat) <= 5, r);
    }
    ok("N10 Kale/Malatya, Şahinbey, Yeşilyurt/Tokat belirsiz eski kimlik takma adı taşımaz",
      [rec("Kale", "Malatya"), rec("Şahinbey", "Gaziantep"), rec("Yeşilyurt", "Tokat")].every((r) => r && r.aliases.length === 0));
    ok("N11 'kale' araması iki ili de listeler", ["Malatya", "Denizli"].every((il) => searchTrDistricts("kale").some((x) => x.il === il && x.ilce === "Kale")));
  }

  section("V) Vekil ilçeler");
  {
    const proxies = TR_DISTRICT_RECORDS.filter((r) => r.durum === "vekil");
    const names = proxies.map((r) => r.ilce).sort((a, b) => a.localeCompare(b, "tr"));
    ok("V1 12 vekil ilçe (owner onaylı liste)", JSON.stringify(names) === JSON.stringify(
      ["Defne", "Ergene", "Güneysınır", "Haliliye", "Midyat", "Muratpaşa", "Onikişubat", "Pamukkale", "Pendik", "Tuşba", "Yenişehir", "Yunusemre"]), names);
    ok("V2 vekil koordinatı = il merkezi (81-il listesi)", proxies.every((r) => {
      const p = TR_LOCATIONS.find((l) => l.id.slice(3, 5) === r.plaka)!;
      return p.lat === r.lat && p.lon === r.lon && r.kaynak === `il-merkezi-vekil:${p.id}`;
    }));
    ok("V3 vekil resmî ilçe adını ve etiketini korur", proxies.every((r) => r.label === `${r.ilce}, ${r.il}, Türkiye`));
    ok("V4 isTrDistrictProxy 12 vekilde doğru, doğrulanmışta yanlış",
      proxies.every((r) => isTrDistrictProxy(r.id)) && !isTrDistrictProxy("trd-10-karesi") && !isTrDistrictProxy("tr-07-antalya") && !isTrDistrictProxy(null));
    ok("V5 açıklama metni", TR_DISTRICT_PROXY_NOTE ===
      "İlçe merkezi koordinatı doğrulanamadı; hesapta il merkezi koordinatı kullanıldı. Saat dilimi aynı olduğundan Human Design sonucu etkilenmez.");
    const base = { birthDate: "2018-07-20", birthTime: "19:00", timezone: "Europe/Istanbul", latitude: 36.8969, longitude: 30.7133 };
    const today = { y: 2026, m: 10, d: 9 };
    ok("V6 bilgi panelinde vekil ilçe koordinatı GÖSTERİLMEZ (açıklama gösterilir)",
      buildChartSubjectInfo({ ...base, locationId: "trd-07-muratpasa" }, today).coordinates === TR_DISTRICT_PROXY_NOTE);
    ok("V7 il merkezi kaydı (aynı koordinat) koordinatla gösterilir",
      buildChartSubjectInfo({ ...base, locationId: "tr-07-antalya" }, today).coordinates === "36,8969° K · 30,7133° D");
    ok("V8 doğrulanmış ilçe koordinatla gösterilir",
      buildChartSubjectInfo({ ...base, latitude: 39.6492, longitude: 27.8861, locationId: "trd-10-karesi" }, today).coordinates === "39,6492° K · 27,8861° D");
  }

  section("S) Sunucu güvenliği (Cey, yurt dışı, imza)");
  {
    const cey: HdBirthLocation = { id: "rx-tr-hakkari-cey", label: "Cey, Hakkari, Türkiye", timezone: "Asia/Baghdad", latitude: 37.2, longitude: 43.6 };
    const ceyRef = signLocationRef(cey);
    ok("S1 Cey imzalı referansı (TR + Asia/Baghdad) reddedilir", !!ceyRef && verifyLocationRef(ceyRef) === null && resolveHdBirthLocation(ceyRef) === null);
    const berlin: HdBirthLocation = { id: "rx-de-berlin-berlin", label: "Berlin, Germany", timezone: "Europe/Berlin", latitude: 52.52, longitude: 13.405 };
    ok("S2 yurt dışı (Berlin, Europe/Berlin) imzalı referansı geçerli", verifyLocationRef(signLocationRef(berlin))?.timezone === "Europe/Berlin");
    const cumraRoxy: HdBirthLocation = { id: "rx-tr-konya-cumra", label: "Cumra, Konya, Türkiye", timezone: "Europe/Istanbul", latitude: 37.5733, longitude: 32.7744 };
    const village: HdBirthLocation = { id: "rx-tr-konya-kucukkoy", label: "Kucukkoy, Konya, Türkiye", timezone: "Europe/Istanbul", latitude: 37.9, longitude: 32.6 };
    const res = toHdSearchResults([cey, cumraRoxy, { ...cumraRoxy }, berlin, village], (l) => signLocationRef(l));
    ok("S3 arama: Cey atılır", !!res && !res.some((r) => r.id.includes("cey")));
    ok("S4 arama: Roxy Çumra → yerel ilçe kimliği (tekrarsız)", !!res && res.filter((r) => r.id === "trd-42-cumra").length === 1 && res.find((r) => r.id === "trd-42-cumra")?.ref === "trd-42-cumra");
    ok("S5 arama: yurt dışı + köy sonucu imzalı referansla korunur", !!res && res.some((r) => r.id === berlin.id && r.ref.startsWith("rx1.")) && res.some((r) => r.id === village.id && r.ref.startsWith("rx1.")));
    ok("S6 arama: imza sırrı yoksa null (fail-closed)", toHdSearchResults([berlin], () => null) === null);
    const resolved = resolveHdBirthLocation("trd-42-cumra")!;
    ok("S7 hesap koordinatı yalnız sunucu verisinden (istemci değeri yok)", resolved.latitude === rec("Çumra", "Konya")!.lat && resolved.timezone === "Europe/Istanbul");
    const tampered = (signLocationRef(berlin) ?? "").replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    ok("S8 oynanmış imza reddedilir", verifyLocationRef(tampered) === null);
  }

  section("A) Kayıtlı analiz durum kararı (eşdeğer kimlik)");
  {
    const row = (o: Partial<AutoCalcRow>): AutoCalcRow => ({
      id: "r1", birth_date: "2018-07-20", birth_time: "19:00:00", birth_place: "Cumra, Konya, Türkiye",
      timezone: "Europe/Istanbul", location_id: "rx-tr-konya-cumra", engine_version: "roxyapi-bodygraph-1", created_at: "2026-10-01T00:00:00Z", ...o,
    });
    const picked = (id: string, label: string) => ({ id, label, tz: "Europe/Istanbul" });
    const st = (rows: AutoCalcRow[], p: ReturnType<typeof picked>, time = "19:00") =>
      resolveAutoCalcState({ birthDate: "2018-07-20", birthTime: time, birthPlace: null, picked: p, rows });
    ok("A1 eski Roxy kimliği ↔ yeni ilçe (aynı yer, aynı tarih/saat) → kayıtlı analiz açılır", st([row({})], picked("trd-42-cumra", "Çumra, Konya, Türkiye")).kind === "open");
    ok("A2 farklı doğum saati → yeniden hesap (eski analiz AÇILMAZ)", st([row({})], picked("trd-42-cumra", "Çumra, Konya, Türkiye"), "19:30").kind === "changed");
    ok("A3 kardeş ilçe (Karesi kaydı, Altıeylül seçimi) → aynı analiz SAYILMAZ",
      st([row({ location_id: "trd-10-karesi", birth_place: "Karesi, Balıkesir, Türkiye" })], picked("trd-10-altieylul", "Altıeylül, Balıkesir, Türkiye")).kind === "changed");
    ok("A4 vekil Muratpaşa ≠ il merkezi Antalya kaydı",
      st([row({ location_id: "tr-07-antalya", birth_place: "Antalya, Türkiye" })], picked("trd-07-muratpasa", "Muratpaşa, Antalya, Türkiye")).kind === "changed");
    ok("A5 il merkezi kimliği ↔ Merkez ilçesi eşdeğer", sameHdLocationId("tr-02-adiyaman", "trd-02-merkez") && !sameHdLocationId("tr-07-antalya", "trd-07-muratpasa"));
    ok("A6 aynı yeni kimlik → açılır", st([row({ location_id: "trd-10-karesi", birth_place: "Karesi, Balıkesir, Türkiye" })], picked("trd-10-karesi", "Karesi, Balıkesir, Türkiye")).kind === "open");
  }

  section("R) Kayıtlı analizi yeniden kullanma + konum koruması (FakeDb, sahte Roxy)");
  {
    const T = "11111111-1111-4111-8111-111111111111";
    const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const C1 = "c0000000-0000-4000-8000-00000000000a";
    const C2 = "c0000000-0000-4000-8000-00000000000b";
    const fake = createFakeDb({
      human_design_clients: [
        { id: C1, tenant_id: T, name: "Danışan 1", birth_date: "2018-07-20", birth_time: "19:00", birth_place: null, birth_location_id: null },
        { id: C2, tenant_id: T, name: "Danışan 2", birth_date: "2018-07-20", birth_time: "19:00", birth_place: null, birth_location_id: null },
      ],
      human_design_charts: [],
    });
    const db = fake.db;
    let roxyCalls = 0;
    const deps: RoxyServiceDeps = {
      config: { apiKey: "harness-key", baseUrl: "https://roxy.invalid/api/v2" },
      callRoxy: async () => { roxyCalls++; return { ok: true, raw: JSON.parse(JSON.stringify(FIXTURE)) }; },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      sleep: async () => undefined,
      log: () => undefined,
    };
    const ctx = { db, tenantId: T, userId: U, isDemo: false };
    // Route ile aynı sıra: servis → (reused ise) konum koruması.
    async function post(body: Record<string, unknown>) {
      const r = await computeRoxyChart(ctx, body, deps);
      if (r.body.ok && r.body.reused) {
        const g = await guardReusedChartLocation(db, T, body, r.body.id);
        if (!g.ok) return { status: g.status, body: g.body as Record<string, unknown> };
      }
      return { status: r.status, body: r.body as Record<string, unknown> };
    }
    const charts = () => (fake.tables.human_design_charts ?? []) as Record<string, unknown>[];

    const a = await post({ client_id: C1, location_id: "tr-07-antalya" });
    ok("R1 ilk hesap (Antalya) → yeni kayıt, Roxy 1", a.status === 200 && a.body.reused === false && roxyCalls === 1, a);
    const a2 = await post({ client_id: C1, location_id: "tr-07-antalya" });
    ok("R2 aynı danışan + aynı doğum bilgisi → kayıtlı analiz açılır, Roxy çağrısı yok", a2.body.reused === true && a2.body.id === a.body.id && roxyCalls === 1);
    const before = JSON.stringify(charts());
    const m = await post({ client_id: C1, location_id: "trd-07-muratpasa" });
    ok("R3 aynı hesap koordinatı + FARKLI yer (vekil Muratpaşa) → 409, yanlış etiketli analiz açılmaz", m.status === 409 && m.body.code === LOCATION_MISMATCH_CODE && m.body.existingId === a.body.id, m);
    ok("R4 409'da Roxy çağrısı yok ve kayıt değişmez", roxyCalls === 1 && JSON.stringify(charts()) === before);
    ok("R5 409 mesajında kota/kredi/maliyet/Roxy ifadesi yok", !/kota|kredi|maliyet|ücret|roxy/i.test(String(m.body.error)));

    const k = await post({ client_id: C1, location_id: "trd-10-karesi" });
    const al = await post({ client_id: C1, location_id: "trd-10-altieylul" });
    ok("R6 kardeş ilçeler (Karesi/Altıeylül) ayrı analiz", k.body.reused === false && al.body.reused === false && k.body.id !== al.body.id && roxyCalls === 3);

    // Eski Roxy seçimi (imzalı ref) — yeni ilçe ile aynı hesap koordinatı → takma ad eşdeğer → açılır.
    const cumra = rec("Çumra", "Konya")!;
    const legacyRef = signLocationRef({ id: "rx-tr-konya-cumra", label: "Cumra, Konya, Türkiye", timezone: "Europe/Istanbul", latitude: cumra.lat, longitude: cumra.lon })!;
    const lc = await post({ client_id: C1, location_id: legacyRef });
    const nc = await post({ client_id: C1, location_id: "trd-42-cumra" });
    ok("R7 eski Roxy kimliğiyle kayıtlı analiz yeni ilçe seçimiyle açılır (Roxy yok)", lc.body.reused === false && nc.status === 200 && nc.body.reused === true && nc.body.id === lc.body.id && roxyCalls === 4, nc);
    const lcRow = charts().find((r) => r.id === lc.body.id)!;
    ok("R8 eski kayıt (location_id / etiket / input_hash) DEĞİŞMEZ", lcRow.location_id === "rx-tr-konya-cumra" && lcRow.birth_place === "Cumra, Konya, Türkiye");

    const other = await post({ client_id: C2, location_id: "tr-07-antalya" });
    ok("R9 farklı danışan aynı doğum bilgisi → kendi analizi (karışmaz)", other.body.reused === false && other.body.id !== a.body.id && roxyCalls === 5);

    fake.tables.human_design_clients.find((c) => c.id === C1)!.birth_time = "19:30";
    const t2 = await post({ client_id: C1, location_id: "tr-07-antalya" });
    ok("R10 farklı doğum saati → yeni analiz (eski analiz açılmaz)", t2.body.reused === false && t2.body.id !== a.body.id && roxyCalls === 6);

    // "client" yolu: danışanın kayıtlı konumu ile koruma.
    fake.tables.human_design_clients.find((c) => c.id === C1)!.birth_time = "19:00";
    fake.tables.human_design_clients.find((c) => c.id === C1)!.birth_location_id = "trd-07-muratpasa";
    Object.assign(fake.tables.human_design_clients.find((c) => c.id === C1)!, {
      birth_location_label: "Muratpaşa, Antalya, Türkiye", birth_timezone: "Europe/Istanbul", birth_latitude: 36.8969, birth_longitude: 30.7133,
    });
    const viaClient = await post({ client_id: C1, location_id: "client" });
    ok("R11 kayıtlı danışan konumu (vekil) + aynı koordinatlı başka yer kaydı → 409", viaClient.status === 409 && roxyCalls === 6, viaClient);
    const viaChart = await post({ client_id: C1, location_id: `chart:${a.body.id}` });
    ok("R12 'chart:' (aynı analizin konumu) → kayıtlı analiz açılır", viaChart.status === 200 && viaChart.body.reused === true && roxyCalls === 6, viaChart);
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} geçti, ${failed} başarısız`);
  if (failed) process.exit(1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
