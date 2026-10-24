/**
 * ASTROLOJİ — ATL-P2-07 ALMAN YASAL SAATİ (1893 → devir) harness'i (2026-10-21). METODOLOJİ ONAYI BEKLİYOR.
 *
 * 1893-04-01 (RGBl. 1893 S. 93) → devir arası KESİN Alman yönetimindeki, bugün başka IANA bölgesindeki şehirlerde (GeoNames
 * kimliği + beklenen IANA bölgesi) doğum anı Alman yasal saatiyle (Europe/Berlin kuralları) çözülür. Gerçek sağlayıcı / DB YOK.
 *
 *   A) Örnek vakalar (Breslau, Danzig, Stettin, Posen, Straßburg, Metz, Mülhausen, Eupen, Hadersleben, Memel) → MEZ/MESZ;
 *      konum kimliği verilmezse ofset ESKİSİYLE aynı.
 *   B) Tablodaki 221 konumun her biri, her kesin aralığın içinde (12 örnek gün) Europe/Berlin çözümüyle birebir; aralık dışı
 *      (1893 öncesi, devir sonrası, plebisit / işgal boşlukları) konum kimliksiz çözümle birebir.
 *   C) Değişmezlik: 81 il + veri setindeki tablo dışı tüm konumlar (örneklem) 1850–2026 kimlikli = kimliksiz; kimlik + bölge
 *      uyuşmazsa uygulanmaz.
 *   D) Sınırlar −1 / 0 / +1 dk: 1893-04-01 yürürlük (Breslau belirsiz pencere, Straßburg boşluk), Posen 1918-12-27, Straßburg
 *      1918-11-11, Breslau 1945-01-01 (süreklilik), Opole plebisit boşluğu, Mülhausen 1914-08.
 *   E) #480 etkileşimi: düzeltme ÖNCESİ saklı ofsetli (IANA +1:24) revizyon staleTimezoneOffset ile işaretlenir → planda
 *      TIMEZONE_REVISION_STALE (sağlayıcı çağrısı 0), KP Horary engellenmez; yeni revizyon MEZ ile açılır, uyarı/engel yok;
 *      kayıtlı eski analizin snapshot'ı DEĞİŞMEZ, okuma notu (historical_timezone) gösterilir.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/tzde1893.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ASTRO_TIME_METHOD_VERSION, resolveAstroBirthTime, type AstroTimeResolution } from "@/lib/astrology/birth/timeResolution";
import { GERMAN_LEGAL_TIME_LOCATIONS, GERMAN_LEGAL_TIME_WINDOWS } from "@/lib/astrology/birth/germanLegalTime";
import { representativeLmtNotice } from "@/lib/astrology/birth/representativeLmt";
import { STALE_TIMEZONE_BLOCK_CODE, legacyMethodNotes, staleTimezoneOffset } from "@/lib/astrology/legacyMethod";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { createFakeClient, createStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile, getAstroProfileDetail } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const ROOT = join(__dirname, "..", "..");
const CITIES = (JSON.parse(readFileSync(join(ROOT, "lib", "location", "server-data", "global-cities.json"), "utf8")) as { locations: { id: string; tz: string; lat: number; lon: number; name: string }[] }).locations;
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

const off = (r: AstroTimeResolution) => (r.kind === "ok" ? r.offsetSeconds : r.kind);
const R = (d: string, tm: string, tz: string, id?: string | null, ch: "auto" | "earlier" | "later" = "auto") => resolveAstroBirthTime(d, tm, tz, ch, id);
const same = (a: AstroTimeResolution, b: AstroTimeResolution) => JSON.stringify(a) === JSON.stringify(b);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  await t("0: metodoloji sürümü 2; tablo 221 konum, tümü veri setinde aynı IANA bölgesiyle", () => {
    assert.equal(ASTRO_TIME_METHOD_VERSION, 2);
    assert.equal(GERMAN_LEGAL_TIME_LOCATIONS.size, 221);
    const byId = new Map(CITIES.map((c) => [c.id, c] as const));
    for (const [id, e] of GERMAN_LEGAL_TIME_LOCATIONS) {
      const c = byId.get(id);
      assert.ok(c, `${id} veri setinde yok`);
      assert.equal(c!.tz, e.timezone, id);
    }
  });

  await t("A: örnek vakalar → Alman yasal saati; kimliksiz çözüm ESKİSİYLE aynı", () => {
    const cases: [string, string, string, string, number, number][] = [
      // id, tz, tarih, saat, beklenen (yasal), kimliksiz (IANA)
      ["gn-3081368", "Europe/Warsaw", "1900-06-15", "12:00", 3600, 5040], // Breslau WMT → MEZ
      ["gn-3099434", "Europe/Warsaw", "1910-06-15", "12:00", 3600, 5040], // Danzig
      ["gn-3083829", "Europe/Warsaw", "1900-06-15", "12:00", 3600, 5040], // Stettin
      ["gn-3081368", "Europe/Warsaw", "1917-07-01", "12:00", 7200, 7200], // Breslau MESZ = IANA C-Eur (fark yok)
      ["gn-3081368", "Europe/Warsaw", "1920-03-01", "12:00", 3600, 7200], // Breslau 1920 MEZ ↔ IANA EET
      ["gn-3081368", "Europe/Warsaw", "1940-05-01", "12:00", 7200, 3600], // Breslau 1940 MESZ ↔ IANA Polonya MEZ
      ["gn-3088171", "Europe/Warsaw", "1918-10-01", "12:00", 3600, 7200], // Posen 1918 ekim
      ["gn-2973783", "Europe/Paris", "1900-06-15", "12:00", 3600, 561], // Straßburg PMT → MEZ
      ["gn-2973783", "Europe/Paris", "1912-03-10", "12:00", 3600, 0], // Straßburg WET → MEZ
      ["gn-2973783", "Europe/Paris", "1917-07-01", "12:00", 7200, 3600], // Straßburg MESZ ↔ Fransa yaz saati
      ["gn-2994160", "Europe/Paris", "1905-01-15", "08:00", 3600, 561], // Metz
      ["gn-2991214", "Europe/Paris", "1910-06-15", "12:00", 3600, 561], // Mülhausen PMT → MEZ
      ["gn-2991214", "Europe/Paris", "1913-06-15", "12:00", 3600, 0], // Mülhausen WET → MEZ
      ["gn-2798573", "Europe/Brussels", "1900-06-15", "12:00", 3600, 0], // Eupen WET → MEZ
      ["gn-2620964", "Europe/Copenhagen", "1893-06-15", "12:00", 3600, 3020], // Hadersleben CMT (backzone) → MEZ
      ["gn-2620964", "Europe/Copenhagen", "1917-07-01", "12:00", 7200, 3600], // Hadersleben MESZ ↔ Danimarka MEZ
      ["gn-598098", "Europe/Vilnius", "1900-06-15", "12:00", 3600, 5040], // Memel WMT → MEZ
      ["gn-598098", "Europe/Vilnius", "1918-01-15", "12:00", 3600, 5736], // Memel KMT → MEZ
    ];
    for (const [id, tz, d, tm, exp, iana] of cases) {
      assert.equal(off(R(d, tm, tz, id)), exp, `${id} ${d}`);
      assert.equal(off(R(d, tm, tz)), iana, `${id} ${d} kimliksiz`);
      assert.equal(off(R(d, tm, tz, null)), iana);
    }
    // Kendi bölgesi doğru olanlar tabloda yok → aynen.
    assert.equal(off(R("1900-06-15", "12:00", "Europe/Kaliningrad", "gn-554234")), 3600);
    assert.equal(off(R("1895-06-15", "12:00", "Europe/Berlin", "gn-2867714")), 3600);
  });

  await t("B: 221 konum × kesin aralık içi (12 gün) = Europe/Berlin; aralık dışı = kimliksiz çözüm", () => {
    let inside = 0;
    let outside = 0;
    for (const [id, e] of GERMAN_LEGAL_TIME_LOCATIONS) {
      const ws = GERMAN_LEGAL_TIME_WINDOWS[e.cls];
      for (const [a, b] of ws) {
        const span = (Date.parse(b) - Date.parse(a)) / 86_400_000;
        for (let k = 1; k <= 12; k++) {
          const d = addDays(a, Math.floor((span * k) / 13));
          for (const tm of ["03:00", "12:00", "21:30"]) {
            const r = R(d, tm, e.timezone, id);
            const berlin = R(d, tm, "Europe/Berlin");
            assert.ok(same(r, berlin), `${id} ${d} ${tm}: ${JSON.stringify(r)} ≠ ${JSON.stringify(berlin)}`);
            inside++;
          }
        }
      }
      // Aralık dışı örnekler: 1880, 1893-03-15, son aralık bitişinden +40 gün, 1950, 1990, aralıklar arası boşluk ortası.
      const outs = ["1880-06-15", "1893-03-15", addDays(ws[ws.length - 1][1], 40), "1950-06-15", "1990-01-15"];
      if (ws.length > 1) outs.push(addDays(ws[0][1], Math.floor((Date.parse(ws[1][0]) - Date.parse(ws[0][1])) / 172_800_000)));
      for (const d of outs) {
        for (const tm of ["03:00", "12:00"]) {
          assert.ok(same(R(d, tm, e.timezone, id), R(d, tm, e.timezone)), `${id} ${d} ${tm} aralık dışı değişmemeli`);
          outside++;
        }
      }
    }
    assert.ok(inside > 8000 && outside > 2000, `${inside} / ${outside}`);
  });

  await t("C: değişmezlik — 81 il, veri setindeki tablo dışı konumlar (her 7. kayıt) 1850–2026; kimlik + bölge uyuşmazlığı", () => {
    const years = [1850, 1880, 1893, 1900, 1916, 1920, 1935, 1942, 1955, 1975, 1999, 2026];
    let n = 0;
    for (const l of TR_LOCATIONS) for (const y of years) for (const tm of ["00:30", "12:00"]) {
      assert.ok(same(R(`${y}-06-15`, tm, l.tz, l.id), R(`${y}-06-15`, tm, l.tz)), `${l.id} ${y}`);
      n++;
    }
    for (let i = 0; i < CITIES.length; i += 7) {
      const c = CITIES[i];
      if (GERMAN_LEGAL_TIME_LOCATIONS.has(c.id)) continue;
      const y = years[i % years.length];
      assert.ok(same(R(`${y}-03-10`, "12:00", c.tz, c.id), R(`${y}-03-10`, "12:00", c.tz)), `${c.id} ${y}`);
      n++;
    }
    assert.ok(n > 6000, String(n));
    // Tablodaki kimlik ama farklı bölge (istemci tz'sine güvenilmez; bölge sunucudan) → uygulanmaz.
    assert.equal(off(R("1900-06-15", "12:00", "Europe/Berlin", "gn-3081368")), 3600);
    assert.equal(off(R("1900-06-15", "12:00", "Europe/Prague", "gn-3081368")), 3600);
    assert.equal(off(R("1900-06-15", "12:00", "Europe/Istanbul", "gn-3081368")), off(R("1900-06-15", "12:00", "Europe/Istanbul")));
  });

  await t("D: sınırlar −1 / 0 / +1 dk", () => {
    const W = "Europe/Warsaw";
    // Breslau 1893-04-01: IANA WMT (+1:24) → MEZ: yerel 00:00–00:23:59 iki kez → otomatikte seçim istenir.
    assert.equal(off(R("1893-03-31", "23:59", W, "gn-3081368")), 5040);
    assert.equal(R("1893-04-01", "00:00", W, "gn-3081368").kind, "ambiguous");
    assert.equal(off(R("1893-04-01", "00:00", W, "gn-3081368", "later")), 3600);
    assert.equal(off(R("1893-04-01", "00:23", W, "gn-3081368", "later")), 3600);
    assert.equal(off(R("1893-04-01", "00:24", W, "gn-3081368")), 3600);
    assert.equal(off(R("1893-04-01", "00:25", W, "gn-3081368")), 3600);
    // Straßburg 1893-04-01: PMT (+0:09:21) → MEZ ileri: 1893-03-31 23:09:21–23:59:59 yaşanmadı.
    assert.equal(off(R("1893-03-31", "23:09", "Europe/Paris", "gn-2973783")), 561);
    assert.equal(R("1893-03-31", "23:10", "Europe/Paris", "gn-2973783").kind, "gap");
    assert.equal(R("1893-03-31", "23:59", "Europe/Paris", "gn-2973783").kind, "gap");
    assert.equal(off(R("1893-04-01", "00:00", "Europe/Paris", "gn-2973783")), 3600);
    assert.equal(off(R("1893-04-01", "00:01", "Europe/Paris", "gn-2973783")), 3600);
    // Posen 1918-12-27 00:00 MEZ → IANA EET: 00:00–00:59 boşluk (model sınırı).
    assert.equal(off(R("1918-12-26", "23:59", W, "gn-3088171")), 3600);
    assert.equal(R("1918-12-27", "00:00", W, "gn-3088171").kind, "gap");
    assert.equal(R("1918-12-27", "00:59", W, "gn-3088171").kind, "gap");
    assert.equal(off(R("1918-12-27", "01:00", W, "gn-3088171")), 7200);
    // Straßburg 1918-11-11 00:00 MEZ → IANA WET: 1918-11-10 23:00–23:59 iki kez.
    assert.equal(off(R("1918-11-10", "22:59", "Europe/Paris", "gn-2973783")), 3600);
    assert.equal(R("1918-11-10", "23:00", "Europe/Paris", "gn-2973783").kind, "ambiguous");
    assert.equal(off(R("1918-11-10", "23:59", "Europe/Paris", "gn-2973783", "earlier")), 3600);
    assert.equal(off(R("1918-11-11", "00:00", "Europe/Paris", "gn-2973783")), 0);
    // Breslau 1945-01-01: Berlin MEZ = IANA Polonya MEZ → süreklilik (boşluk / çift yok).
    for (const [d, tm] of [["1944-12-31", "23:59"], ["1945-01-01", "00:00"], ["1945-01-01", "00:01"]]) assert.equal(off(R(d, tm, W, "gn-3081368")), 3600, `${d} ${tm}`);
    // Opole plebisit boşluğu 1920-01-10 → IANA EET; 1922-07-11 dönüş (IANA MEZ = Berlin MEZ, süreklilik).
    assert.equal(off(R("1920-01-09", "23:59", W, "gn-3090048")), 3600);
    assert.equal(R("1920-01-10", "00:30", W, "gn-3090048").kind, "gap");
    assert.equal(off(R("1921-06-01", "12:00", W, "gn-3090048")), off(R("1921-06-01", "12:00", W)));
    for (const tm of ["23:59"]) assert.equal(off(R("1922-07-10", tm, W, "gn-3090048")), 3600);
    assert.equal(off(R("1922-07-11", "00:00", W, "gn-3090048")), 3600);
    // Mülhausen 1914-08-07 → kısa Fransız işgali (IANA WET) → 08-26 tekrar MEZ.
    assert.equal(off(R("1914-08-06", "22:59", "Europe/Paris", "gn-2991214")), 3600);
    assert.equal(R("1914-08-06", "23:00", "Europe/Paris", "gn-2991214").kind, "ambiguous");
    assert.equal(R("1914-08-25", "23:30", "Europe/Paris", "gn-2991214").kind, "gap");
    assert.equal(off(R("1914-08-15", "12:00", "Europe/Paris", "gn-2991214")), off(R("1914-08-15", "12:00", "Europe/Paris")));
    assert.equal(off(R("1914-08-26", "01:00", "Europe/Paris", "gn-2991214")), 3600);
  });

  // ─── E: #480 etkileşimi ─────────────────────────────────────────────────────────────────────────────────────────────
  const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
  const CLIENT = "55555555-5555-4555-8555-555555555555";
  const BR: ResolvedLocation = { id: "gn-3081368", label: "Wrocław, Lower Silesia, Polonya", timezone: "Europe/Warsaw", latitude: 51.1029, longitude: 17.0301 };
  const store = createStore({ clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "Breslau" }] });
  const ctx: EngineCtx = { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  const calls: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-de1893", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push(endpoint);
      const raw = structuredClone(NATAL_GOLDEN.response ?? NATAL_GOLDEN) as Record<string, unknown>;
      raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
      raw.houseSystem = body.houseSystem;
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  const NATAL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
  const HORARY = { technique: "kp.horary", options: { atUtc: "2026-10-07T10:00", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean" } };

  await t("E1: staleTimezoneOffset — düzeltme öncesi saklı +1:24 (5040) → {5040, 3600}; kimliksiz / eşit / saat yok → null", () => {
    const rev = (utcOffsetSeconds: number, extra: Record<string, unknown> = {}) => ({ birthDate: "1900-06-15", birthTime: "12:00:00", timeKnown: true, timezone: "Europe/Warsaw", dstChoice: "auto", utcOffsetSeconds, locationId: BR.id, ...extra });
    assert.deepEqual(staleTimezoneOffset(rev(5040)), { stored: 5040, current: 3600 });
    assert.equal(staleTimezoneOffset(rev(3600)), null);
    assert.equal(staleTimezoneOffset(rev(5040, { locationId: null })), null, "konum kimliği yoksa tablo uygulanmaz");
    assert.equal(staleTimezoneOffset(rev(5040, { timeKnown: false })), null);
    assert.equal(staleTimezoneOffset(rev(5040, { birthDate: "1880-06-15" })), null, "1893 öncesi tablo dışı");
    // Varşova'nın kendisi (Rus Polonyası) tabloda yok.
    assert.equal(staleTimezoneOffset(rev(5040, { locationId: "gn-756135" })), null);
  });

  await t("E2: yeni revizyon MEZ ile açılır (uyarı / engel yok); eski ofsetli revizyon → TIMEZONE_REVISION_STALE, 0 sağlayıcı çağrısı; KP Horary engellenmez; kayıtlı eski analiz DEĞİŞMEZ", async () => {
    const pr = await createAstroProfile(ctx, { label: "Sentetik Breslau 1900", clientId: CLIENT, birthDate: "1900-06-15", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: BR.id }, (id) => (id === BR.id ? BR : null));
    assert.equal(pr.status, 201, JSON.stringify(pr.body));
    const pid = (pr.body as J).profile.id as string;
    const row = (store.tables.astro_birth_profile_revisions as J[]).find((r) => r.profile_id === pid);
    assert.equal(row.utc_offset_seconds, 3600, "yeni revizyon Alman yasal saati");
    assert.equal(row.birth_utc.slice(0, 19), "1900-06-15T11:00:00");
    const d0 = ((await getAstroProfileDetail(ctx, pid)).body as J).profile.revisions[0];
    assert.equal(d0.staleTimezone, undefined);
    assert.equal(d0.lmtNotice, undefined, "yasal saatle uyumlu → uyarı yok");
    // Düzeltme öncesi kaydedilmiş analizi taklit et: önce çalıştırıp kaydet, sonra revizyonu ve snapshot'ı eski ofsete (IANA +1:24) çek.
    const run0 = (await runAstrology(ctx, { profileId: pid, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(run0.ok, true, JSON.stringify(run0).slice(0, 300));
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...NATAL, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const arow = (store.tables.astro_analyses as J[]).find((x) => x.id === (sv.body as J).analysisId);
    row.utc_offset_seconds = 5040;
    row.birth_utc = "1900-06-15T10:36:00+00:00";
    arow.profile_snapshot.revision.utcOffsetSeconds = 5040;
    const before = JSON.stringify([arow.technical_snapshot, arow.method_snapshot, arow.versions_snapshot, arow.profile_snapshot]);
    const d1 = ((await getAstroProfileDetail(ctx, pid)).body as J).profile.revisions[0];
    assert.deepEqual({ s: d1.staleTimezone.storedOffsetSeconds, c: d1.staleTimezone.currentOffsetSeconds }, { s: 5040, c: 3600 });
    assert.equal(d1.lmtNotice.legalOffsetSeconds, 3600, "eski revizyonda yasal MEZ uyarısı");
    const plan = (await planAstrology(ctx, { profileId: pid, selections: [NATAL, HORARY] })).body as J;
    assert.deepEqual(plan.plan.selections.map((s: J) => s.blocked?.code ?? null), [STALE_TIMEZONE_BLOCK_CODE, null]);
    assert.match(plan.plan.selections[0].blocked.error, /kayıtlı UTC\+01:24, doğrusu UTC\+01:00/);
    const n0 = calls.length;
    const run = (await runAstrology(ctx, { profileId: pid, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(calls.length, n0, "sağlayıcı çağrılmadı");
    assert.match(JSON.stringify(run), new RegExp(STALE_TIMEZONE_BLOCK_CODE));
    const a = ((await getAnalysis(ctx, arow.id, false)).body as J).analysis;
    assert.ok(a.legacyNotes.some((n: J) => n.code === "historical_timezone"), "eski analizde okuma notu");
    assert.equal(JSON.stringify([arow.technical_snapshot, arow.method_snapshot, arow.versions_snapshot, arow.profile_snapshot]), before, "snapshot değişmedi");
    assert.ok(legacyMethodNotes({ technique: "western.natal", adapterVersion: "x", houseSystem: "placidus", revisions: [{ who: "danışanın", revision: a.profile?.revision ?? arow.profile_snapshot.revision }] }).length >= 1);
    assert.equal(representativeLmtNotice({ ...d0, utcOffsetSeconds: 3600 }), null);
  });

  console.log(`\nastrology tzde1893 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main().catch((e) => {
  console.error("tzde1893 harness çöktü:", e);
  process.exit(1);
});
