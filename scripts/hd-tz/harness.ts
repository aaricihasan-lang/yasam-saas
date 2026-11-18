/**
 * HD-TZ (18.11.2026) — Human Design IANA 2026f doğum/transit UTC'si + Roxy'ye doğrulanmış UTC gönderimi + bayat kayıt koruması.
 * Ağ / gerçek DB / ücretli Roxy YOK (bellek-içi sahte DB + isteğe tutarlı sahte sağlayıcı).
 *
 *   A. Doğum UTC çözümü — gece denetimi kabul vakaları (HD-UTC-FARKLARI) + boşluk/çakışma/geçersiz/LMT/tarih çizgisi/artık yıl.
 *   B. Roxy UTC parçaları — gün / ay / yıl geçişi, saniye korunur, koordinat değişmez.
 *   C. BodyGraph servisi — Roxy'ye UTC + "UTC"; kayıt yerel bilgiyi korur; bayat (eski IANA) kayıt yeniden KULLANILMAZ ve
 *      DEĞİŞMEZ; güncel kayıt aynı kimlikle yeniden kullanılır; Design anı denetimi korunur.
 *   D. Dört Ok — bayat kayıtlı analiz → 409 CHART_TIME_STALE, ücretli çağrı yok.
 *   E. Connection / Penta 3-4-5 — her katılımcı UTC; sıra korunur; bayat katılımcı → 409; eski ilişki kaydı yalnız aynı kaynak
 *      analizlerden üretilmişse yeniden kullanılır.
 *   F. Kişisel transit — bayat natal analiz → 409.
 *   G. Transit anı — Havana / Winnipeg / Casablanca yerel ↔ UTC, "Şimdi", çakışmada açık seçim, yanlış ofset reddi, boşluk.
 *   H. İç motor (engine/time.ts) + /api/hd/compute çekirdeği — sessiz DST seçimi yok, LMT saniyesi korunur, backzone.
 * Çalıştır: npx tsx scripts/hd-tz/harness.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { birthLocalTimeIssue, resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { checkChartBirthUtc, roxyUtcParts, toRoxyUtcMoment } from "../../lib/human-design/api/hdBirthUtc";
import { computeRoxyChart, roxyKeyedChartIdFor, roxyKeyedInputHash, type RoxyServiceDeps } from "../../lib/human-design/api/roxyChartService";
import { createRelationAnalysis, relationIdFor, relationInputHash, type RelationServiceDeps } from "../../lib/human-design/relations/relationService";
import { computeChartVariables } from "../../lib/human-design/variables/variablesService";
import { computePersonalTransit } from "../../lib/human-design/transit/personalTransitService";
import { localParts, nowTransitMoment, resolveTransitMoment } from "../../lib/human-design/transit/transitMoment";
import { HdLocalTimeError, localDateTimeToUtc } from "../../lib/human-design/engine/time";
import { handleCompute } from "../../lib/human-design/api/handleCompute";
import { ROXY_POLICY } from "../../lib/human-design/providers/roxy/config";
import type { RoxyBirthMoment } from "../../lib/human-design/providers/roxy/relationClient";
import { createFakeDb } from "../hd-roxy/fakeDb";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";
import { engineChart, fakeConnectionResponse, fakePentaResponse, type Moment } from "../hd-relations/fakeRelationRoxy";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ FAIL: ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 500)}` : ""}`); }
}
const section = (t: string) => console.log(`\n[${t}]`);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const FIXTURE_JSON = readFileSync(join(__dirname, "..", "hd-roxy", "fixtures", "roxy-bodygraph-2018-07-20.json"), "utf8");

const T = "11111111-1111-4111-8111-111111111111";
const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET = "hd-tz-harness-secret";
const cid = (n: number) => `c0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const hid = (n: number) => `d0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const LOC = {
  havana: { id: "gn-3553478", tz: "America/Havana", lat: 23.133, lon: -82.383 },
  winnipeg: { id: "gn-6183235", tz: "America/Winnipeg", lat: 49.8844, lon: -97.147 },
  casablanca: { id: "gn-2553604", tz: "Africa/Casablanca", lat: 33.5883, lon: -7.6114 },
  apia: { id: "gn-4035413", tz: "Pacific/Apia", lat: -13.8333, lon: -171.7667 },
  vancouver: { id: "gn-6173331", tz: "America/Vancouver", lat: 49.2497, lon: -123.1193 },
} as const;

async function main() {
  // ── A ───────────────────────────────────────────────────────────────────────────────────────────────
  section("A. Doğum UTC çözümü (ortak IANA 2026f çekirdeği + backzone)");
  const A: Array<[string, string, string, string, string | "gap" | "ambiguous" | "invalid"]> = [
    // [etiket, tarih, saat, bölge, beklenen UTC (IANA 2026f; gece denetimi HD-UTC-FARKLARI.csv) | sınıf]
    ["Havana 10.11.2026 12:00 → 16:00Z (UTC−4)", "2026-11-10", "12:00", "America/Havana", "2026-11-10T16:00:00.000Z"],
    ["Winnipeg 10.11.2026 12:00 → 17:00Z (UTC−5)", "2026-11-10", "12:00", "America/Winnipeg", "2026-11-10T17:00:00.000Z"],
    ["Casablanca 10.10.2026 12:00 → 12:00Z (UTC+0)", "2026-10-10", "12:00", "Africa/Casablanca", "2026-10-10T12:00:00.000Z"],
    ["Vancouver 15.12.2026 12:00 → 19:00Z", "2026-12-15", "12:00", "America/Vancouver", "2026-12-15T19:00:00.000Z"],
    ["Edmonton 15.12.2026 12:00 → 18:00Z", "2026-12-15", "12:00", "America/Edmonton", "2026-12-15T18:00:00.000Z"],
    ["El Aaiún 15.12.2026 12:00 → 12:00Z", "2026-12-15", "12:00", "Africa/El_Aaiun", "2026-12-15T12:00:00.000Z"],
    ["Tahran 26.05.1979 12:00 → 07:30Z", "1979-05-26", "12:00", "Asia/Tehran", "1979-05-26T07:30:00.000Z"],
    ["Bogota 02.05.1992 12:00 → 16:00Z", "1992-05-02", "12:00", "America/Bogota", "1992-05-02T16:00:00.000Z"],
    ["Dublin 25.09.1925 12:00 → 12:00Z", "1925-09-25", "12:00", "Europe/Dublin", "1925-09-25T12:00:00.000Z"],
    ["Kampala 13.04.1951 20:36 → 17:51Z (backzone +2:45)", "1951-04-13", "20:36", "Africa/Kampala", "1951-04-13T17:51:00.000Z"],
    ["Reykjavik 16.01.1955 20:52 → 21:52Z (backzone −1)", "1955-01-16", "20:52", "Atlantic/Reykjavik", "1955-01-16T21:52:00.000Z"],
    ["São Paulo 31.03.1965 23:30 → iki kez yaşandı → ret", "1965-03-31", "23:30", "America/Sao_Paulo", "ambiguous"],
    ["Brezilya (Manaus) 28.02.1966 23:30 → 01.03 02:30Z (2026f: yaz saati 1 Mart'ta bitti; tzcomp)", "1966-02-28", "23:30", "America/Manaus", "1966-03-01T02:30:00.000Z"],
    ["Havana 01.11.2026 00:30 → tek an (2026f) 04:30Z", "2026-11-01", "00:30", "America/Havana", "2026-11-01T04:30:00.000Z"],
    ["Casablanca 20.09.2026 01:30 → iki kez yaşandı → ret", "2026-09-20", "01:30", "Africa/Casablanca", "ambiguous"],
    ["Havana 12.03.2028 00:30 → hiç yaşanmadı → ret", "2028-03-12", "00:30", "America/Havana", "gap"],
    ["Londra 29.03.2026 01:30 → boşluk", "2026-03-29", "01:30", "Europe/London", "gap"],
    ["Londra 25.10.2026 01:30 → çakışma", "2026-10-25", "01:30", "Europe/London", "ambiguous"],
    ["İstanbul 15.01.1990 16:20 → 14:20Z (değişmedi)", "1990-01-15", "16:20", "Europe/Istanbul", "1990-01-15T14:20:00.000Z"],
    ["İstanbul 01.01.1900 12:00 LMT → 10:03:04Z (saniye)", "1900-01-01", "12:00", "Europe/Istanbul", "1900-01-01T10:03:04.000Z"],
    ["Konya (İstanbul tz) 05.05.2001 08:30 → 05:30Z", "2001-05-05", "08:30", "Europe/Istanbul", "2001-05-05T05:30:00.000Z"],
    ["Berlin 10.05.1890 12:00 LMT → 11:06:32Z", "1890-05-10", "12:00", "Europe/Berlin", "1890-05-10T11:06:32.000Z"],
    ["New York 15.12.2026 12:00 → 17:00Z", "2026-12-15", "12:00", "America/New_York", "2026-12-15T17:00:00.000Z"],
    ["Santiago 15.07.2026 12:00 → 16:00Z", "2026-07-15", "12:00", "America/Santiago", "2026-07-15T16:00:00.000Z"],
    ["Kathmandu 15.07.2026 12:00 → 06:15Z", "2026-07-15", "12:00", "Asia/Kathmandu", "2026-07-15T06:15:00.000Z"],
    ["Apia 15.07.2026 12:00 → 14.07 23:00Z (tarih çizgisi)", "2026-07-15", "12:00", "Pacific/Apia", "2026-07-14T23:00:00.000Z"],
    ["Apia 30.12.2011 (atlanan gün) → boşluk", "2011-12-30", "12:00", "Pacific/Apia", "gap"],
    ["Artık yıl 29.02.2024 23:59:59 İstanbul", "2024-02-29", "23:59:59", "Europe/Istanbul", "2024-02-29T20:59:59.000Z"],
    ["Gece yarısı 01.01.2026 00:00 Kiritimati → 31.12.2025 10:00Z", "2026-01-01", "00:00", "Pacific/Kiritimati", "2025-12-31T10:00:00.000Z"],
    ["Geçersiz tarih 30.02", "2026-02-30", "10:00", "Europe/Istanbul", "invalid"],
    ["Geçersiz saat 24:00", "2026-02-10", "24:00", "Europe/Istanbul", "invalid"],
    ["Geçersiz bölge", "2026-02-10", "10:00", "Mars/Olympus", "invalid"],
  ];
  for (const [label, d, t, z, exp] of A) {
    const r = resolveBirthLocalTime(d, t, z);
    ok(`A ${label}`, exp === "gap" || exp === "ambiguous" || exp === "invalid" ? r.kind === exp : r.kind === "ok" && r.utcIso === exp, r);
  }
  const iss = birthLocalTimeIssue("2026-09-20", "01:30", "Africa/Casablanca");
  ok("A çakışma mesajı iki ofseti açıkça yazar (UTC+00:00 ve UTC+01:00), tahmin yok", !!iss && iss.code === "BIRTH_TIME_AMBIGUOUS" && iss.message.includes("UTC+00:00") && iss.message.includes("UTC+01:00"), iss);

  // ── B ───────────────────────────────────────────────────────────────────────────────────────────────
  section("B. Roxy UTC parçaları");
  ok("B gün geri geçişi: 2026-07-14T23:00Z → 2026-07-14 / 23:00:00 / UTC", JSON.stringify(roxyUtcParts("2026-07-14T23:00:00.000Z")) === JSON.stringify({ date: "2026-07-14", time: "23:00:00", timezone: "UTC" }));
  ok("B yıl geçişi: 2025-12-31T10:00Z", JSON.stringify(roxyUtcParts("2025-12-31T10:00:00.000Z")) === JSON.stringify({ date: "2025-12-31", time: "10:00:00", timezone: "UTC" }));
  ok("B LMT saniyesi korunur: 10:03:04", roxyUtcParts("1900-01-01T10:03:04.000Z")?.time === "10:03:04");
  const m0 = { date: "2026-11-10", time: "12:00:00", timezone: "America/Havana", latitude: 23.133, longitude: -82.383, nodeType: "true" };
  const u0 = toRoxyUtcMoment(m0, "2026-11-10T16:00:00.000Z");
  ok("B yalnız tarih/saat/saat dilimi değişir; koordinat ve düğüm aynen", !!u0 && u0.latitude === 23.133 && u0.longitude === -82.383 && u0.nodeType === "true" && u0.time === "16:00:00" && u0.timezone === "UTC" && m0.timezone === "America/Havana", u0);
  ok("B geçersiz an → null", roxyUtcParts("x") === null && toRoxyUtcMoment(m0, "x") === null);

  // ── C ───────────────────────────────────────────────────────────────────────────────────────────────
  section("C. BodyGraph servisi (Roxy UTC + bayat kayıt koruması)");
  type Row = Record<string, unknown>;
  const client = (n: number, date: string, time: string, loc: { id: string; tz: string; lat: number; lon: number }) => ({
    id: cid(n), tenant_id: T, name: `Kişi ${n}`, birth_date: date, birth_time: time, birth_place: loc.id,
    birth_location_id: loc.id, birth_location_label: loc.id, birth_timezone: loc.tz, birth_latitude: loc.lat, birth_longitude: loc.lon,
  });
  const mkDeps = () => {
    const calls: Row[] = [];
    const deps: RoxyServiceDeps = {
      config: { apiKey: "zz-fake", baseUrl: "https://roxy.test" },
      callRoxy: async (_c, body) => { calls.push(clone(body) as unknown as Row); return { ok: true, raw: JSON.parse(consistentRoxyResponse(FIXTURE_JSON, JSON.stringify(body))) }; },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      sleep: async () => undefined,
      chartIdSecret: SECRET,
      log: () => undefined,
    };
    return { deps, calls };
  };
  const ctx = (db: unknown) => ({ db: db as never, tenantId: T, userId: U, isDemo: false });
  const v1Id = (n: number, date: string, time: string, loc: { tz: string; lat: number; lon: number }) =>
    roxyKeyedChartIdFor(T, roxyKeyedInputHash({ tenantId: T, clientId: cid(n), date, time, timezone: loc.tz, latitude: loc.lat, longitude: loc.lon, nodeType: ROXY_POLICY.nodeType, lang: ROXY_POLICY.lang }, SECRET));

  {
    const f = createFakeDb({ human_design_clients: [client(1, "2026-11-10", "12:00", LOC.havana)], human_design_charts: [] });
    const { deps, calls } = mkDeps();
    const r = await computeRoxyChart(ctx(f.db), { client_id: cid(1), location_id: "client" }, deps);
    const row = (f.tables.human_design_charts ?? [])[0] ?? {};
    ok("C1 Havana yeni hesap 200 (Design anı denetimi geçti)", r.status === 200 && r.body.ok === true && r.body.reused === false, r);
    ok("C1 Roxy'ye giden: 2026-11-10 16:00:00 UTC + Havana koordinatı + true node",
      JSON.stringify(calls[0]) === JSON.stringify({ date: "2026-11-10", time: "16:00:00", timezone: "UTC", latitude: 23.133, longitude: -82.383, nodeType: "true" }), calls[0]);
    ok("C1 kayıt yerel doğum bilgisini korur (12:00:00 America/Havana); UTC timing'de 16:00Z",
      row.birth_time === "12:00:00" && row.timezone === "America/Havana" && (row.input as Row).time === "12:00:00" && (row.input as Row).timezone === "America/Havana" &&
      ((row.computed_result as Row).timing as Row).birthUtcIso === "2026-11-10T16:00:00.000Z", { bt: row.birth_time, tz: row.timezone, input: row.input });
    ok("C1 yeni haritanın kimliği eski şema (değişmeyen kimlik formülü)", r.body.ok === true && r.body.id === v1Id(1, "2026-11-10", "12:00:00", LOC.havana));
    const r2 = await computeRoxyChart(ctx(f.db), { client_id: cid(1), location_id: "client" }, deps);
    ok("C2 aynı girdi yeniden → kayıtlı GÜNCEL sonuç (Roxy çağrısı yok)", r2.status === 200 && r2.body.ok === true && r2.body.reused === true && calls.length === 1, r2);
  }
  {
    // Eski (IANA 2026a) hesap: aynı kimlikte 17:00Z doğum anıyla kayıtlı analiz.
    const id1 = v1Id(2, "2026-11-10", "12:00:00", LOC.havana);
    const stale: Row = {
      id: id1, tenant_id: T, client_id: cid(2), client_name: "Kişi 2", source: "computed", provider: "roxyapi", engine_version: "roxyapi:roxy-bodygraph-1",
      birth_date: "2026-11-10", birth_time: "12:00:00", timezone: "America/Havana", input_hash: "eski",
      input: { date: "2026-11-10", time: "12:00:00", timezone: "America/Havana", latitude: 23.133, longitude: -82.383, nodeType: "true", lang: "tr" },
      computed_result: { timing: { birthUtcIso: "2026-11-10T17:00:00.000Z" }, activations: [] }, created_at: "2026-11-01T00:00:00Z",
    };
    const f = createFakeDb({ human_design_clients: [client(2, "2026-11-10", "12:00", LOC.havana)], human_design_charts: [stale] });
    const before = JSON.stringify(f.tables.human_design_charts[0]);
    const { deps, calls } = mkDeps();
    const r = await computeRoxyChart(ctx(f.db), { client_id: cid(2), location_id: "client" }, deps);
    ok("C3 eski IANA ile hesaplanmış kayıt yeni sonuç gibi DÖNMEZ → yeni hesap (1 çağrı), ayrı kimlik", r.status === 200 && r.body.ok === true && r.body.reused === false && r.body.id !== id1 && calls.length === 1, r);
    ok("C3 eski kayıt DEĞİŞMEDİ / SİLİNMEDİ", JSON.stringify(f.tables.human_design_charts.find((x) => x.id === id1)) === before && f.tables.human_design_charts.length === 2);
    const newRow = f.tables.human_design_charts.find((x) => x.id !== id1) ?? {};
    ok("C3 yeni kayıt doğru UTC (16:00Z) ile", ((newRow.computed_result as Row)?.timing as Row)?.birthUtcIso === "2026-11-10T16:00:00.000Z");
    const r2 = await computeRoxyChart(ctx(f.db), { client_id: cid(2), location_id: "client" }, deps);
    ok("C3b tekrar → yeni (güncel) kayıt yeniden kullanılır, çağrı yok", r2.body.ok === true && r.body.ok === true && r2.body.reused === true && r2.body.id === r.body.id && calls.length === 1, r2);
  }
  {
    // Değişmeyen bölge: güncel kayıt aynı kimlikle yeniden kullanılır (gereksiz yeniden hesap / engel YOK).
    const ist = { id: "x", tz: "Europe/Istanbul", lat: 41.0082, lon: 28.9784 };
    const id1 = v1Id(3, "1990-01-15", "16:20:00", ist);
    const cur: Row = {
      id: id1, tenant_id: T, client_id: cid(3), source: "computed", provider: "roxyapi", engine_version: "roxyapi:roxy-bodygraph-1",
      birth_date: "1990-01-15", birth_time: "16:20:00", timezone: "Europe/Istanbul", input: { date: "1990-01-15", time: "16:20:00", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784, nodeType: "true", lang: "tr" },
      computed_result: { timing: { birthUtcIso: "1990-01-15T14:20:00.000Z" } }, created_at: "2026-10-01T00:00:00Z",
    };
    const f = createFakeDb({ human_design_clients: [client(3, "1990-01-15", "16:20", { ...ist, id: "tr-34-istanbul" })], human_design_charts: [cur] });
    const { deps, calls } = mkDeps();
    const r = await computeRoxyChart(ctx(f.db), { client_id: cid(3), location_id: "client" }, deps);
    ok("C4 İstanbul (değişmeyen) güncel kayıt → aynı kimlik, yeniden kullanım, çağrı yok", r.body.ok === true && r.body.reused === true && r.body.id === id1 && calls.length === 0, r);
  }
  {
    const f = createFakeDb({ human_design_clients: [client(4, "2026-09-20", "01:30", LOC.casablanca), client(5, "2026-11-01", "00:30", LOC.havana)], human_design_charts: [] });
    const { deps, calls } = mkDeps();
    const amb = await computeRoxyChart(ctx(f.db), { client_id: cid(4), location_id: "client" }, deps);
    ok("C5 Casablanca 20.09.2026 01:30 (2026f çakışma) → 422 BIRTH_TIME_AMBIGUOUS, çağrı yok", amb.status === 422 && amb.body.ok === false && amb.body.code === "BIRTH_TIME_AMBIGUOUS" && calls.length === 0, amb);
    const one = await computeRoxyChart(ctx(f.db), { client_id: cid(5), location_id: "client" }, deps);
    ok("C5 Havana 01.11.2026 00:30 (2026f tek an) → kabul, Roxy'ye 04:30:00 UTC", one.status === 200 && calls.length === 1 && calls[0].time === "04:30:00" && calls[0].date === "2026-11-01" && calls[0].timezone === "UTC", { one, c: calls[0] });
  }
  {
    const f = createFakeDb({ human_design_clients: [client(6, "2026-07-15", "12:00", LOC.apia), client(7, "2027-01-01", "05:00", LOC.apia), client(8, "1900-01-01", "12:00", { id: "tr-34-istanbul", tz: "Europe/Istanbul", lat: 41.0082, lon: 28.9784 })], human_design_charts: [] });
    const { deps, calls } = mkDeps();
    await computeRoxyChart(ctx(f.db), { client_id: cid(6), location_id: "client" }, deps);
    ok("C6 Apia 15.07.2026 12:00 → Roxy'ye 2026-07-14 23:00:00 UTC (gün değişimi)", calls[0]?.date === "2026-07-14" && calls[0]?.time === "23:00:00" && calls[0]?.latitude === -13.8333, calls[0]);
    await computeRoxyChart(ctx(f.db), { client_id: cid(7), location_id: "client" }, deps);
    ok("C6 Apia 01.01.2027 05:00 → Roxy'ye 2026-12-31 16:00:00 UTC (yıl değişimi)", calls[1]?.date === "2026-12-31" && calls[1]?.time === "16:00:00", calls[1]);
    await computeRoxyChart(ctx(f.db), { client_id: cid(8), location_id: "client" }, deps);
    ok("C7 İstanbul 1900 LMT 12:00 → Roxy'ye 10:03:04 UTC (saniye kaybı yok)", calls[2]?.date === "1900-01-01" && calls[2]?.time === "10:03:04", calls[2]);
  }
  {
    // Design anı denetimi korunur: sağlayıcı ESKİ anla (17:00Z) hesaplasaydı → 502, kayıt yok.
    const f = createFakeDb({ human_design_clients: [client(9, "2026-11-10", "12:00", LOC.havana)], human_design_charts: [] });
    const { deps } = mkDeps();
    deps.callRoxy = async () => ({ ok: true, raw: JSON.parse(consistentRoxyResponse(FIXTURE_JSON, JSON.stringify({ date: "2026-11-10", time: "17:00:00", timezone: "UTC" }))) });
    const r = await computeRoxyChart(ctx(f.db), { client_id: cid(9), location_id: "client" }, deps);
    ok("C8 sağlayıcı yanlış (1 sa kayık) anla hesaplarsa → 502 PROVIDER_TIME_MISMATCH, kayıt yok", r.status === 502 && r.body.ok === false && r.body.code === "PROVIDER_TIME_MISMATCH" && f.tables.human_design_charts.length === 0, r);
  }

  // ── D / E / F ortak tohum: kayıtlı analizler ────────────────────────────────────────────────────────
  type P = { n: number; name: string; local: Moment; utc: string };
  const people: P[] = [
    { n: 11, name: "Havana Kişi", local: { date: "2026-11-10", time: "12:00:00", timezone: "America/Havana", latitude: 23.133, longitude: -82.383 }, utc: "2026-11-10T16:00:00.000Z" },
    { n: 12, name: "Winnipeg Kişi", local: { date: "2026-11-10", time: "12:00:00", timezone: "America/Winnipeg", latitude: 49.8844, longitude: -97.147 }, utc: "2026-11-10T17:00:00.000Z" },
    { n: 13, name: "Casablanca Kişi", local: { date: "2026-10-10", time: "12:00:00", timezone: "Africa/Casablanca", latitude: 33.5883, longitude: -7.6114 }, utc: "2026-10-10T12:00:00.000Z" },
    { n: 14, name: "İstanbul Kişi", local: { date: "1990-01-15", time: "16:20:00", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 }, utc: "1990-01-15T14:20:00.000Z" },
    { n: 15, name: "Apia Kişi", local: { date: "2026-07-15", time: "12:00:00", timezone: "Pacific/Apia", latitude: -13.8333, longitude: -171.7667 }, utc: "2026-07-14T23:00:00.000Z" },
  ];
  const utcMoment = (p: P): Moment => ({ ...p.local, ...roxyUtcParts(p.utc)! });
  const chartRow = (p: P, over: Row = {}): Row => ({
    id: hid(p.n), tenant_id: T, client_id: cid(p.n), source: "computed", provider: "roxyapi", input_hash: `ih-${p.n}`, birth_place: p.name, created_at: "2026-11-01T00:00:00Z",
    input: { ...p.local, nodeType: "true", lang: "tr" },
    computed_result: engineChart(utcMoment(p)), // doğru UTC ile hesaplanmış (timing.birthUtcIso = p.utc)
    ...over,
  });
  const staleOf = (p: P): Row => {
    const c = clone(engineChart(utcMoment(p))) as Row;
    (c.timing as Row).birthUtcIso = new Date(Date.parse(p.utc) + 3_600_000).toISOString(); // eski IANA: 1 sa kayık
    return chartRow(p, { computed_result: c });
  };
  const seedRel = (charts: Row[]) => createFakeDb({
    human_design_clients: people.map((p) => ({ id: cid(p.n), tenant_id: T, name: p.name, birth_date: p.local.date, birth_time: p.local.time.slice(0, 5) })),
    human_design_charts: charts, human_design_relation_analyses: [], human_design_relation_participants: [],
  });
  ok("D0 tohum: engine haritası doğru UTC'yi taşır (Havana 16:00Z)", ((engineChart(utcMoment(people[0])) as unknown as Row).timing as Row).birthUtcIso === "2026-11-10T16:00:00.000Z");
  ok("D0 checkChartBirthUtc: güncel / bayat / boşluk ayrımı",
    checkChartBirthUtc(people[0].local, chartRow(people[0]).computed_result).status === "current" &&
    checkChartBirthUtc(people[0].local, staleOf(people[0]).computed_result).status === "stale" &&
    (() => { const c = checkChartBirthUtc({ date: "2028-03-12", time: "00:30:00", timezone: "America/Havana" }, { timing: { birthUtcIso: "2028-03-12T05:30:00.000Z" } }); return c.status === "unresolved" && c.reason === "gap"; })());

  section("D. Dört Ok — bayat kayıtlı analiz");
  {
    const f = seedRel([staleOf(people[0])]);
    let n = 0;
    const r = await computeChartVariables({ db: f.db as never, tenantId: T, userId: U, isDemo: false }, { chart_id: hid(11) }, {
      config: { apiKey: "zz", baseUrl: "https://roxy.test" }, callVariables: async () => { n++; return { ok: false, kind: "server_error", status: 500 }; },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), log: () => undefined,
    });
    ok("D1 eski IANA doğum anlı analiz → 409 CHART_TIME_STALE; Dört Ok hesaplanmaz, ücretli çağrı yok", r.status === 409 && r.body.ok === false && r.body.code === "CHART_TIME_STALE" && n === 0, r);
  }

  section("E. Connection / Penta");
  const relDeps = (seen: { conn: Array<{ personA: RoxyBirthMoment; personB: RoxyBirthMoment }>; penta: Array<{ members: RoxyBirthMoment[] }> }): RelationServiceDeps => ({
    config: { apiKey: "zz", baseUrl: "https://roxy.test" },
    callConnection: async (_c, body) => { seen.conn.push(clone(body)); return { ok: true, raw: fakeConnectionResponse(body.personA as Moment, body.personB as Moment, { lang: "tr" }) }; },
    callPenta: async (_c, body) => { seen.penta.push(clone(body)); return { ok: true, raw: fakePentaResponse(body.members as Moment[]) }; },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), sleep: async () => undefined, idSecret: SECRET, log: () => undefined,
  });
  const rctx = (db: unknown) => ({ db: db as never, tenantId: T, userId: U, isDemo: false });
  const parts = (...ps: P[]) => ({ participants: ps.map((p) => ({ client_id: cid(p.n), chart_id: hid(p.n) })) });
  const expMoment = (p: P) => ({ ...roxyUtcParts(p.utc)!, latitude: p.local.latitude, longitude: p.local.longitude });
  const sameMoment = (m: RoxyBirthMoment, p: P) => { const e = expMoment(p); return m.date === e.date && m.time === e.time && m.timezone === "UTC" && m.latitude === e.latitude && m.longitude === e.longitude && m.nodeType === "true"; };
  {
    const f = seedRel(people.map((p) => chartRow(p)));
    const seen = { conn: [] as Array<{ personA: RoxyBirthMoment; personB: RoxyBirthMoment }>, penta: [] as Array<{ members: RoxyBirthMoment[] }> };
    const c = await createRelationAnalysis(rctx(f.db), parts(people[0], people[1]), relDeps(seen));
    ok("E1 Connection Havana × Winnipeg → 200", c.status === 200 && c.body.ok === true, c);
    ok("E1 her kişi kendi doğrulanmış UTC'siyle (16:00Z / 17:00Z) + 'UTC', koordinat aynı", seen.conn.length === 1 && sameMoment(seen.conn[0].personA, people[0]) && sameMoment(seen.conn[0].personB, people[1]), seen.conn[0]);
    const cSwap = await createRelationAnalysis(rctx(f.db), parts(people[1], people[0]), relDeps(seen));
    ok("E2 kişi sırası değişince aynı analiz (eşdeğerlik) → yeniden kullanım, çağrı yok", cSwap.body.ok === true && c.body.ok === true && cSwap.body.id === c.body.id && cSwap.body.reused === true && seen.conn.length === 1, cSwap);
    for (const k of [3, 4, 5] as const) {
      const sel = people.slice(0, k);
      const pr = await createRelationAnalysis(rctx(f.db), parts(...sel), relDeps(seen));
      const last = seen.penta[seen.penta.length - 1];
      ok(`E3 Penta ${k} kişi → 200; üyeler katılımcı sırasıyla, her biri kendi UTC'si`, pr.status === 200 && !!last && last.members.length === k && last.members.every((m, i) => sameMoment(m, sel[i])), { pr, last });
    }
    const swapped = [people[2], people[0], people[1]];
    const pr3b = await createRelationAnalysis(rctx(f.db), parts(...swapped), relDeps(seen));
    ok("E3b Penta 3 kişi farklı sıra → aynı analiz (yeniden kullanım)", pr3b.body.ok === true && pr3b.body.reused === true && seen.penta.length === 3, pr3b);
  }
  {
    const f = seedRel([chartRow(people[0]), staleOf(people[1])]);
    const seen = { conn: [] as Array<{ personA: RoxyBirthMoment; personB: RoxyBirthMoment }>, penta: [] as Array<{ members: RoxyBirthMoment[] }> };
    const r = await createRelationAnalysis(rctx(f.db), parts(people[0], people[1]), relDeps(seen));
    ok("E4 bayat katılımcı (Winnipeg eski UTC) → 409 CHART_TIME_STALE + katılımcı adı; ücretli çağrı yok; diğer kişiye bulaşmaz",
      r.status === 409 && r.body.ok === false && r.body.code === "CHART_TIME_STALE" && (r.body as { participant?: string }).participant === "Winnipeg Kişi" && seen.conn.length === 0, r);
  }
  {
    // Eski (yerel+IANA ile hesaplanmış) ilişki kaydı: AYNI kaynak analizlerden → yeniden kullanılır; farklı kaynak → yeni hesap.
    const p0 = people[3], p1 = { ...people[0], n: 16 }; // İstanbul (değişmeyen) + Havana
    const charts = [chartRow(p0), chartRow(p1)];
    const f = seedRel(charts);
    (f.tables.human_design_clients as Row[]).push({ id: cid(16), tenant_id: T, name: "Havana İki", birth_date: p1.local.date, birth_time: "12:00" });
    const members = [p0, p1].map((p) => ({ clientId: cid(p.n), moment: { ...p.local, nodeType: "true" } as RoxyBirthMoment }));
    const v1 = relationIdFor(T, relationInputHash("connection", T, ROXY_POLICY, members, SECRET));
    f.tables.human_design_relation_analyses.push({ id: v1, tenant_id: T, kind: "connection", member_count: 2, result: { eski: true } });
    f.tables.human_design_relation_participants.push(
      { analysis_id: v1, tenant_id: T, position: 0, client_id: cid(p0.n), source_chart_id: hid(p0.n) },
      { analysis_id: v1, tenant_id: T, position: 1, client_id: cid(p1.n), source_chart_id: hid(p1.n) },
    );
    const seen = { conn: [] as Array<{ personA: RoxyBirthMoment; personB: RoxyBirthMoment }>, penta: [] as Array<{ members: RoxyBirthMoment[] }> };
    const same = await createRelationAnalysis(rctx(f.db), parts(p0, p1), relDeps(seen));
    ok("E5 aynı (güncel) kaynak analizlerden üretilmiş kayıtlı ilişki → yeniden kullanım, çağrı yok", same.body.ok === true && same.body.id === v1 && same.body.reused === true && seen.conn.length === 0, same);
    // Havana kaynağı eski IANA analizinden yeniden oluşturulmuş gibi: kayıtlı ilişkinin kaynağı farklı analiz.
    (f.tables.human_design_relation_participants[1] as Row).source_chart_id = "d0000000-0000-4000-8000-0000000000ff";
    const before = JSON.stringify(f.tables.human_design_relation_analyses);
    const diff = await createRelationAnalysis(rctx(f.db), parts(p0, p1), relDeps(seen));
    ok("E6 kayıtlı ilişki BAŞKA kaynak analizden üretilmiş → yeniden KULLANILMAZ; yeni kimlikle yeni hesap; eski kayıt değişmez",
      diff.status === 200 && diff.body.ok === true && diff.body.id !== v1 && diff.body.reused === false && seen.conn.length === 1 &&
      JSON.stringify(f.tables.human_design_relation_analyses.filter((x) => x.id === v1)) === JSON.stringify(JSON.parse(before).filter((x: Row) => x.id === v1)), diff);
  }

  section("F. Kişisel transit — bayat natal analiz");
  {
    const f = seedRel([staleOf(people[2])]);
    let n = 0;
    const r = await computePersonalTransit({ db: f.db as never, tenantId: T, userId: U, isDemo: false }, { client_id: cid(13), chart_id: hid(13), date: "2026-11-18", time: "12:00", tz: "Europe/Istanbul" }, {
      resolveTransit: async () => { throw new Error("çağrılmamalı"); }, config: { apiKey: "zz", baseUrl: "https://roxy.test" },
      callTransit: async () => { n++; return { ok: false, kind: "server_error", status: 500 }; }, rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }), log: () => undefined,
    });
    ok("F1 eski IANA doğum anlı natal analiz → 409 CHART_TIME_STALE; ücretli çağrı yok", r.status === 409 && r.body.ok === false && r.body.code === "CHART_TIME_STALE" && n === 0, r);
  }

  // ── G ───────────────────────────────────────────────────────────────────────────────────────────────
  section("G. Transit anı (yerel ↔ UTC, 'Şimdi', çakışma seçimi)");
  for (const [tz, utc, local] of [["America/Havana", "2026-11-10T16:00:00Z", "12:00"], ["America/Winnipeg", "2026-11-10T17:00:00Z", "12:00"], ["Africa/Casablanca", "2026-10-10T12:00:00Z", "12:00"]] as const) {
    const lp = localParts(new Date(utc), tz);
    ok(`G1 ${tz}: ${utc} → yerel ${lp.localDate} ${lp.localTime}`, lp.localTime === local && lp.localDate === utc.slice(0, 10));
    const back = resolveTransitMoment(utc.slice(0, 10), local, tz);
    ok(`G1 ${tz}: yerel ${local} → ${utc}`, back.ok && back.moment.utcIso === new Date(utc).toISOString(), back);
    const now = nowTransitMoment(new Date(Date.parse(utc) + 30_000), tz);
    ok(`G2 'Şimdi' ${tz}: yerel saat ${local}, UTC ${utc}`, now.ok && now.moment.localTime === local && now.moment.utcIso === new Date(utc).toISOString(), now);
  }
  const amb = resolveTransitMoment("2027-11-07", "00:30", "America/Havana");
  ok("G3 Havana 07.11.2027 00:30 iki kez yaşandı → seçim istenir (−18000 / −14400)", !amb.ok && amb.code === "LOCAL_TIME_AMBIGUOUS" && JSON.stringify(amb.offsetsSeconds) === JSON.stringify([-18000, -14400]), amb);
  const c1 = resolveTransitMoment("2027-11-07", "00:30", "America/Havana", -14400);
  const c2 = resolveTransitMoment("2027-11-07", "00:30", "America/Havana", -18000);
  ok("G3 açık seçim: UTC−4 → 04:30Z, UTC−5 → 05:30Z", c1.ok && c1.moment.utcIso === "2027-11-07T04:30:00.000Z" && c2.ok && c2.moment.utcIso === "2027-11-07T05:30:00.000Z");
  const wrong = resolveTransitMoment("2027-11-07", "00:30", "America/Havana", 3600);
  ok("G4 geçersiz seçilmiş ofset → INVALID_OFFSET", !wrong.ok && wrong.code === "INVALID_OFFSET", wrong);
  const notAmb = resolveTransitMoment("2026-11-10", "12:00", "America/Havana", -18000);
  ok("G4 çakışma olmayan saatte eski (yanlış) ofset −5 reddedilir", !notAmb.ok && notAmb.code === "INVALID_OFFSET", notAmb);
  const gap = resolveTransitMoment("2028-03-12", "00:30", "America/Havana");
  ok("G5 Havana 12.03.2028 00:30 → LOCAL_TIME_GAP", !gap.ok && gap.code === "LOCAL_TIME_GAP", gap);
  const cas = resolveTransitMoment("2026-09-20", "01:30", "Africa/Casablanca");
  ok("G5 Casablanca 20.09.2026 01:30 → seçim istenir (0 / +3600)", !cas.ok && cas.code === "LOCAL_TIME_AMBIGUOUS" && JSON.stringify(cas.offsetsSeconds) === JSON.stringify([0, 3600]), cas);
  const nowAmb = nowTransitMoment(new Date("2027-11-07T05:30:20Z"), "America/Havana");
  ok("G6 'Şimdi' iki kez yaşanan saatte gerçek anın ofseti (05:30Z → UTC−5)", nowAmb.ok && nowAmb.moment.utcIso === "2027-11-07T05:30:00.000Z" && nowAmb.moment.offsetSeconds === -18000, nowAmb);
  const ist = resolveTransitMoment("2026-11-18", "09:00");
  ok("G7 varsayılan Türkiye (değişmedi): 09:00 → 06:00Z", ist.ok && ist.moment.utcIso === "2026-11-18T06:00:00.000Z" && ist.moment.timeZone === "Europe/Istanbul");

  // ── H ───────────────────────────────────────────────────────────────────────────────────────────────
  section("H. İç motor (engine/time.ts) + compute çekirdeği");
  const throwsKind = (fn: () => unknown, kind: string) => { try { fn(); return false; } catch (e) { return e instanceof HdLocalTimeError && e.kind === kind; } };
  ok("H1 boşluk (Londra 29.03.2026 01:30) → hata, sessiz kabul yok", throwsKind(() => localDateTimeToUtc({ date: "2026-03-29", time: "01:30", timezone: "Europe/London", location: { lat: 0, lon: 0 } }), "gap"));
  ok("H1 çakışma (Londra 25.10.2026 01:30) → hata, sessiz seçim yok", throwsKind(() => localDateTimeToUtc({ date: "2026-10-25", time: "01:30", timezone: "Europe/London", location: { lat: 0, lon: 0 } }), "ambiguous"));
  ok("H1 çakışma (New York 01.11.2026 01:30) → hata (eski: tutarsız 'önceki' seçim)", throwsKind(() => localDateTimeToUtc({ date: "2026-11-01", time: "01:30", timezone: "America/New_York", location: { lat: 0, lon: 0 } }), "ambiguous"));
  ok("H1 geçersiz bölge → hata", throwsKind(() => localDateTimeToUtc({ date: "2026-01-01", time: "10:00", timezone: "Mars/Olympus", location: { lat: 0, lon: 0 } }), "invalid"));
  ok("H2 LMT saniyesi korunur: İstanbul 1900 12:00 → 10:03:04Z (eski: dakikaya yuvarlanıyordu)", localDateTimeToUtc({ date: "1900-01-01", time: "12:00", timezone: "Europe/Istanbul", location: { lat: 0, lon: 0 } }).toISOString() === "1900-01-01T10:03:04.000Z");
  ok("H2 backzone: Kampala 13.04.1951 20:36 → 17:51Z", localDateTimeToUtc({ date: "1951-04-13", time: "20:36", timezone: "Africa/Kampala", location: { lat: 0, lon: 0 } }).toISOString() === "1951-04-13T17:51:00.000Z");
  ok("H2 Havana 10.11.2026 12:00 → 16:00Z", localDateTimeToUtc({ date: "2026-11-10", time: "12:00", timezone: "America/Havana", location: { lat: 0, lon: 0 } }).toISOString() === "2026-11-10T16:00:00.000Z");
  const hcGap = handleCompute({ date: "2026-03-29", time: "01:30", timezone: "Europe/London" });
  const hcAmb = handleCompute({ date: "2026-10-25", time: "01:30", timezone: "Europe/London" });
  const hcOk = handleCompute({ date: "2026-11-10", time: "12:00", timezone: "America/Havana" });
  ok("H3 /api/hd/compute çekirdeği: boşluk → 400 BIRTH_TIME_NONEXISTENT", hcGap.status === 400 && hcGap.body.ok === false && hcGap.body.code === "BIRTH_TIME_NONEXISTENT", hcGap);
  ok("H3 çakışma → 400 BIRTH_TIME_AMBIGUOUS", hcAmb.status === 400 && hcAmb.body.ok === false && hcAmb.body.code === "BIRTH_TIME_AMBIGUOUS", hcAmb);
  ok("H3 geçerli Havana → 200, birthUtc 16:00Z", hcOk.status === 200 && hcOk.body.ok === true && (hcOk.body.data as unknown as { timing: { birthUtcIso: string } }).timing.birthUtcIso === "2026-11-10T16:00:00.000Z");
  const hcBad = handleCompute({ date: "2026-02-10", time: "10:00", timezone: "Mars/Olympus" });
  ok("H3 geçersiz bölge → 400 INVALID_TIMEZONE", hcBad.status === 400 && hcBad.body.ok === false && hcBad.body.code === "INVALID_TIMEZONE", hcBad);

  console.log(`\nHD-TZ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:"); for (const f of fails) console.log(` - ${f}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
