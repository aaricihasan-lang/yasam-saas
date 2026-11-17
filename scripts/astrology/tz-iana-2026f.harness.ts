/**
 * ASTROLOJİ — IANA 2026f SAAT DİLİMİ TABLOSU harness'i (ATL-TZ-2026F — 2026-11-17).
 *
 * Kök neden: ofsetler çalışma ortamının ICU/Intl verisinden alınıyordu (Node 24.15 = tz 2026a). IANA 2026f'de Küba
 * 2026-11-01'de geri almıyor (2027-11-07'ye kadar UTC−4) → Havana 10.11.2026 Atlas UTC−5, doğrusu UTC−4. Düzeltme:
 * sürümü sabitlenmiş IANA tablosu (tzIana.generated.ts; scripts/astrology/tz/gen-tz-table.py) + TZif kalıcı kuralı.
 * Beklenen değerler BAĞIMSIZ kaynaktan: Python zoneinfo + PyPI tzdata 2026.6 (= IANA 2026f) — fikstür ve aşağıdaki matris.
 * Gerçek sağlayıcı / DB YOK.
 *
 *   A) Havana 2026f matrisi: 31.10 / 01.11 (eski kuralda geri alma) / 02.11 / 10.11 / 31.12.2026, 2027 ayları,
 *      07.11.2027 geri alma (çakışma) ve 12.03.2028 ileri alma (boşluk); earlier/later seçimi.
 *   B) Fikstür: her tablo bölgesinde 2025–2029 her geçiş ±1 sn + 1550–2600 örnekleri → zoneinfo ofsetiyle birebir.
 *   C) Türkiye 1980/1990/2000/2015 (boşluk + çakışma)/2016/2026 + İstanbul LMT 1900 (7016 sn); temsilî bölgeler.
 *   D) 2026a→2026f değişen diğer bölgeler (Winnipeg, Vancouver, Edmonton, Casablanca, El Aaiún, Brezilya 1965/66,
 *      Bogota 1992, Tahran 1979, Dublin 1925) + Apia 2011 tarih çizgisi, Katmandu 1986, artık gün, gece yarısı.
 *   E) Gidiş-dönüş: yerel → UTC → yerel (wallClockAt) tutarlı; tablo dışı ad Intl yoluna düşer; tablo, Intl'e başvurmadan
 *      çalışır (Intl.formatToParts devre dışıyken uygulama bölgeleri aynı sonucu verir).
 *   F) Tablo başlığı: sürüm 2026f, kaynak SHA-256, sayılar; tüm uygulama bölgeleri (81 il, 973 ilçe, dünya, GeoNames) tabloda.
 *   G) Kayıt değişmezliği (sentetik): eski Havana revizyonu (UTC−5 saklı) aynı gövdeyle hesaplanır, kayıtlı analiz ve
 *      Word/PDF modeli değişmez; yeni profil UTC−4; profil düzenlenince YENİ revizyon 2026f ile, eski revizyon aynen.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/tz-iana-2026f.harness.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeClient, createStore } from "./fakeSupabase";
import { resolveAstroBirthTime, wallClockAt, type AstroTimeResolution } from "@/lib/astrology/birth/timeResolution";
import { TZ_BACKZONE_OVERLAY } from "@/lib/astrology/birth/tzBackzoneOverlay.generated";
import { TZ_IANA_LINKS, TZ_IANA_META, TZ_IANA_ZONES } from "@/lib/astrology/birth/tzIana.generated";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { appendAstroRevision, createAstroProfile, getAstroProfileDetail } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { staleTimezoneOffset } from "@/lib/astrology/legacyMethod";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { returnTimes } from "@/lib/astrology/report/model";
import { formatInZone, dayKeyInZone, isIanaZone, momentLabel } from "@/lib/astrology/transitDetail";
import { toLocalStamp } from "@/lib/astrology/transits/display";
import { formatZoned, formatZonedParts } from "@/lib/astrology/birth/zonedFormat";
import { isValidIanaTimeZone, utcOffsetSecondsAt } from "@/lib/astrology/birth/timeResolution";
import { localAt } from "@/app/admin/astroloji/_lib/horaryWesternLabels";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const ROOT = join(__dirname, "..", "..");
const REF = JSON.parse(readFileSync(join(__dirname, "fixtures", "tz-iana-2026f-ref.json"), "utf8")) as { meta: Record<string, unknown>; cases: [string, number, number][] };
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

async function docxText(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
async function pdfText(buf: Uint8Array): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return String(text).replace(/\s+/g, " ");
}
/** Kayıtlı analizin Word + PDF metni (gerçek üretim yolu: buildAnalysisReport). */
async function wordPdf(ctx: EngineCtx, id: string): Promise<{ docx: string; pdf: string }> {
  const dx = await buildAnalysisReport(ctx, id, "docx", false);
  const px = await buildAnalysisReport(ctx, id, "pdf", false);
  assert.ok(dx.ok && px.ok, "rapor üretilemedi");
  if (!dx.ok || !px.ok) throw new Error("rapor");
  const out = { docx: await docxText(dx.bytes), pdf: await pdfText(px.bytes) };
  for (const bad of ["undefined", "NaN", "[object Object]"]) assert.ok(!out.docx.includes(bad) && !out.pdf.includes(bad), bad);
  return out;
}

function sig(r: AstroTimeResolution): string {
  if (r.kind === "gap") return "gap";
  if (r.kind === "ok") return `ok ${r.utcIso.replace(".000Z", "Z")} ${r.offsetSeconds}`;
  if (r.kind === "ambiguous") return `amb ${r.options.map((o) => `${o.utcIso.replace(".000Z", "Z")} ${o.offsetSeconds}`).join(" ")}`;
  return `invalid:${r.reason}`;
}
const offsetAt = (z: string, utcSec: number) => {
  const w = wallClockAt(utcSec * 1000, z)!;
  return Date.parse(`${w.date}T${w.time}Z`) / 1000 - utcSec;
};
/** "Bölge YYYY-AA-GGTSS:DD beklenen" satırları — beklenen: Python zoneinfo + tzdata 2026.6 (IANA 2026f). */
function matrix(rows: string) {
  for (const line of rows.trim().split("\n")) {
    const [z, local, ...exp] = line.trim().split(/\s+/);
    const [d, tm] = local.split("T");
    assert.equal(sig(resolveAstroBirthTime(d, tm, z)), exp.join(" "), `${z} ${local}`);
  }
}

async function main() {
  await t("A: Havana — IANA 2026f: 01.11.2026 geri alma YOK, 07.11.2027'ye kadar UTC−4; 2027-11-07 çakışma, 2028-03-12 boşluk", () => {
    matrix(`
      America/Havana 2026-10-31T12:00 ok 2026-10-31T16:00:00Z -14400
      America/Havana 2026-11-01T00:30 ok 2026-11-01T04:30:00Z -14400
      America/Havana 2026-11-01T01:30 ok 2026-11-01T05:30:00Z -14400
      America/Havana 2026-11-02T12:00 ok 2026-11-02T16:00:00Z -14400
      America/Havana 2026-11-10T12:00 ok 2026-11-10T16:00:00Z -14400
      America/Havana 2026-12-31T23:59 ok 2027-01-01T03:59:00Z -14400
      America/Havana 2027-01-15T12:00 ok 2027-01-15T16:00:00Z -14400
      America/Havana 2027-03-14T00:30 ok 2027-03-14T04:30:00Z -14400
      America/Havana 2027-06-01T12:00 ok 2027-06-01T16:00:00Z -14400
      America/Havana 2027-11-06T12:00 ok 2027-11-06T16:00:00Z -14400
      America/Havana 2027-11-07T00:30 amb 2027-11-07T04:30:00Z -14400 2027-11-07T05:30:00Z -18000
      America/Havana 2027-11-07T01:30 ok 2027-11-07T06:30:00Z -18000
      America/Havana 2027-11-10T12:00 ok 2027-11-10T17:00:00Z -18000
      America/Havana 2028-03-12T00:30 gap
      America/Havana 2028-03-12T01:30 ok 2028-03-12T05:30:00Z -14400`);
    const e = resolveAstroBirthTime("2027-11-07", "00:30", "America/Havana", "earlier");
    const l = resolveAstroBirthTime("2027-11-07", "00:30", "America/Havana", "later");
    assert.equal(sig(e), "ok 2027-11-07T04:30:00Z -14400");
    assert.equal(sig(l), "ok 2027-11-07T05:30:00Z -18000");
    assert.ok(e.kind === "ok" && e.ambiguousResolved && l.kind === "ok" && l.ambiguousResolved);
    // UTC → yerel: 2026-11-01 05:30Z (eski kuralda 00:30 CST) artık 01:30 CDT
    assert.deepEqual(wallClockAt(Date.parse("2026-11-01T05:30:00Z"), "America/Havana"), { date: "2026-11-01", time: "01:30:00" });
    assert.deepEqual(wallClockAt(Date.parse("2026-11-10T16:00:00Z"), "America/Havana"), { date: "2026-11-10", time: "12:00:00" });
  });

  await t("B: fikstür — tablo bölgelerinde 2025–2029 her geçiş ±1 sn + 1550–2600 örnekleri zoneinfo 2026f ile birebir", () => {
    let n = 0;
    let skipped = 0;
    for (const [z, u, o] of REF.cases) {
      const bz = TZ_BACKZONE_OVERLAY[z];
      if (bz && u < bz.cutoff) {
        skipped += 1; // 1970 öncesi backzone tablosu önceliklidir (tz01 harness'ı)
        continue;
      }
      assert.equal(offsetAt(z, u), o, `${z} ${new Date(u * 1000).toISOString()}`);
      n += 1;
    }
    assert.ok(n > 3500, `vaka ${n}`);
    console.log(`     ${n} vaka (backzone öncesi atlanan ${skipped})`);
  });

  await t("C: Türkiye 1980/1990/2000/2015/2016/2026 + LMT 1900; temsilî bölgeler yaz/kış", () => {
    matrix(`
      Europe/Istanbul 1900-01-01T12:00 ok 1900-01-01T10:03:04Z 7016
      Europe/Istanbul 1980-07-01T12:00 ok 1980-07-01T09:00:00Z 10800
      Europe/Istanbul 1990-01-15T16:20 ok 1990-01-15T14:20:00Z 7200
      Europe/Istanbul 2000-07-01T12:00 ok 2000-07-01T09:00:00Z 10800
      Europe/Istanbul 2015-03-29T03:30 gap
      Europe/Istanbul 2015-11-08T03:30 amb 2015-11-08T00:30:00Z 10800 2015-11-08T01:30:00Z 7200
      Europe/Istanbul 2016-07-01T12:00 ok 2016-07-01T09:00:00Z 10800
      Europe/Istanbul 2016-12-01T12:00 ok 2016-12-01T09:00:00Z 10800
      Europe/Istanbul 2026-11-10T12:00 ok 2026-11-10T09:00:00Z 10800
      Europe/London 2026-07-15T12:00 ok 2026-07-15T11:00:00Z 3600
      Europe/London 2026-12-15T12:00 ok 2026-12-15T12:00:00Z 0
      Europe/Berlin 2026-07-15T12:00 ok 2026-07-15T10:00:00Z 7200
      Europe/Berlin 2026-12-15T12:00 ok 2026-12-15T11:00:00Z 3600
      America/New_York 2026-07-15T12:00 ok 2026-07-15T16:00:00Z -14400
      America/New_York 2026-12-15T12:00 ok 2026-12-15T17:00:00Z -18000
      America/Los_Angeles 2026-07-15T12:00 ok 2026-07-15T19:00:00Z -25200
      America/Los_Angeles 2026-12-15T12:00 ok 2026-12-15T20:00:00Z -28800
      America/Santiago 2026-07-15T12:00 ok 2026-07-15T16:00:00Z -14400
      America/Santiago 2026-12-15T12:00 ok 2026-12-15T15:00:00Z -10800
      America/Coyhaique 2026-07-15T12:00 ok 2026-07-15T15:00:00Z -10800
      America/Coyhaique 2026-12-15T12:00 ok 2026-12-15T15:00:00Z -10800
      Pacific/Apia 2026-07-15T12:00 ok 2026-07-14T23:00:00Z 46800
      Asia/Kathmandu 2026-07-15T12:00 ok 2026-07-15T06:15:00Z 20700
      Australia/Sydney 2026-07-15T12:00 ok 2026-07-15T02:00:00Z 36000
      Australia/Sydney 2026-12-15T12:00 ok 2026-12-15T01:00:00Z 39600`);
  });

  await t("D: 2026a→2026f değişen bölgeler + tarih çizgisi, Katmandu 1986, DST boşluk/çakışma, artık gün, gece yarısı", () => {
    matrix(`
      America/Winnipeg 2026-12-15T12:00 ok 2026-12-15T17:00:00Z -18000
      America/Winnipeg 2026-11-01T01:30 ok 2026-11-01T06:30:00Z -18000
      America/Winnipeg 2027-03-14T02:30 ok 2027-03-14T07:30:00Z -18000
      America/Vancouver 2026-12-15T12:00 ok 2026-12-15T19:00:00Z -25200
      America/Edmonton 2026-12-15T12:00 ok 2026-12-15T18:00:00Z -21600
      Africa/Casablanca 2026-10-15T12:00 ok 2026-10-15T12:00:00Z 0
      Africa/Casablanca 2026-12-15T12:00 ok 2026-12-15T12:00:00Z 0
      Africa/Casablanca 2027-02-20T12:00 ok 2027-02-20T12:00:00Z 0
      Africa/El_Aaiun 2026-12-15T12:00 ok 2026-12-15T12:00:00Z 0
      America/Sao_Paulo 1965-03-31T23:30 amb 1965-04-01T01:30:00Z -7200 1965-04-01T02:30:00Z -10800
      America/Sao_Paulo 1966-03-01T00:30 amb 1966-03-01T02:30:00Z -7200 1966-03-01T03:30:00Z -10800
      America/Bogota 1992-05-02T12:00 ok 1992-05-02T16:00:00Z -14400
      Asia/Tehran 1979-05-26T12:00 ok 1979-05-26T07:30:00Z 16200
      Europe/Dublin 1925-09-25T12:00 ok 1925-09-25T12:00:00Z 0
      Europe/Dublin 2026-12-15T12:00 ok 2026-12-15T12:00:00Z 0
      Pacific/Apia 2011-12-29T23:59 ok 2011-12-30T09:59:00Z -36000
      Pacific/Apia 2011-12-30T12:00 gap
      Pacific/Apia 2011-12-31T00:00 ok 2011-12-30T10:00:00Z 50400
      Asia/Kathmandu 1985-12-31T23:59 ok 1985-12-31T18:29:00Z 19800
      Asia/Kathmandu 1986-01-01T00:10 gap
      Asia/Kathmandu 1986-01-01T00:20 ok 1985-12-31T18:35:00Z 20700
      America/Santiago 2026-09-06T00:30 gap
      America/Santiago 2026-04-04T23:30 amb 2026-04-05T02:30:00Z -10800 2026-04-05T03:30:00Z -14400
      Australia/Sydney 2026-10-04T02:30 gap
      Australia/Sydney 2026-04-05T02:30 amb 2026-04-04T15:30:00Z 39600 2026-04-04T16:30:00Z 36000
      Europe/London 2026-03-29T01:30 gap
      Europe/London 2026-10-25T01:30 amb 2026-10-25T00:30:00Z 3600 2026-10-25T01:30:00Z 0
      America/New_York 2024-02-29T23:30 ok 2024-03-01T04:30:00Z -18000`);
    // Gece yarısı / gün değişimi (UTC → yerel): İstanbul 21:30Z = ertesi gün 00:30; Apia 2011-12-30 hiç yaşanmadı.
    assert.deepEqual(wallClockAt(Date.parse("2026-02-28T21:30:00Z"), "Europe/Istanbul"), { date: "2026-03-01", time: "00:30:00" });
    assert.deepEqual(wallClockAt(Date.parse("2028-02-28T21:30:00Z"), "Europe/Istanbul"), { date: "2028-02-29", time: "00:30:00" });
    assert.deepEqual(wallClockAt(Date.parse("2011-12-30T10:00:00Z"), "Pacific/Apia"), { date: "2011-12-31", time: "00:00:00" });
  });

  await t("E: gidiş-dönüş yerel → UTC → yerel tutarlı; tablo Intl'e başvurmaz; tablo dışı ad Intl yoluna düşer", () => {
    const zones = ["America/Havana", "Europe/Istanbul", "America/Winnipeg", "Africa/Casablanca", "Australia/Lord_Howe", "Europe/Dublin", "America/Godthab", "Asia/Gaza"];
    let n = 0;
    for (const z of zones) {
      for (let ms = Date.UTC(1970, 0, 1, 0, 17); ms < Date.UTC(2101, 0, 1); ms += 11 * 86_400_000 + 3_600_000 * 7 + 60_000 * 11) {
        const w = wallClockAt(ms, z)!;
        const r = resolveAstroBirthTime(w.date, w.time, z, "earlier");
        const r2 = resolveAstroBirthTime(w.date, w.time, z, "later");
        assert.ok(r.kind === "ok" && r2.kind === "ok", `${z} ${w.date} ${w.time}`);
        assert.ok(r.utcIso === new Date(ms).toISOString() || r2.utcIso === new Date(ms).toISOString(), `${z} ${new Date(ms).toISOString()} gidiş-dönüş`);
        n += 1;
      }
    }
    // Intl.formatToParts devre dışı: tablo bölgeleri yine çözülür (ortamın ICU sürümünden bağımsız).
    const orig = Intl.DateTimeFormat.prototype.formatToParts;
    Intl.DateTimeFormat.prototype.formatToParts = () => {
      throw new Error("Intl tz verisi kullanılmamalı");
    };
    try {
      assert.equal(sig(resolveAstroBirthTime("2026-11-10", "12:00", "America/Havana")), "ok 2026-11-10T16:00:00Z -14400");
      assert.equal(sig(resolveAstroBirthTime("1990-01-15", "16:20", "Europe/Istanbul")), "ok 1990-01-15T14:20:00Z 7200");
      assert.equal(sig(resolveAstroBirthTime("2026-11-10", "12:00", "Europe/Istanbul")), "ok 2026-11-10T09:00:00Z 10800");
    } finally {
      Intl.DateTimeFormat.prototype.formatToParts = orig;
    }
    // Tabloda olmayan ama Intl'in tanıdığı ad (büyük/küçük harf farkı) → Intl yolu (eski davranış).
    assert.equal(TZ_IANA_ZONES["europe/istanbul"], undefined);
    assert.equal(sig(resolveAstroBirthTime("2026-11-10", "12:00", "europe/istanbul")), "ok 2026-11-10T09:00:00Z 10800");
    console.log(`     ${n} gidiş-dönüş`);
  });

  await t("F: tablo başlığı — IANA 2026f, kaynak SHA-256, sayılar; tüm uygulama bölgeleri tabloda", () => {
    assert.equal(TZ_IANA_META.tzdataVersion, "2026f");
    assert.equal(TZ_IANA_META.tarballSha256, "01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d");
    assert.equal(Object.keys(TZ_IANA_ZONES).length, TZ_IANA_META.zoneCount);
    assert.equal(Object.keys(TZ_IANA_LINKS).length, TZ_IANA_META.linkCount);
    assert.equal(Object.values(TZ_IANA_ZONES).reduce((s, v) => s + v[1].length - 1, 0), TZ_IANA_META.transitionCount);
    for (const [a, b] of Object.entries(TZ_IANA_LINKS)) assert.ok(TZ_IANA_ZONES[b] && !TZ_IANA_ZONES[a], `${a} → ${b}`);
    assert.deepEqual(REF.meta, { ...TZ_IANA_META }, "referans fikstürü aynı üretimden");
    const tr = [...readFileSync(join(ROOT, "lib/location/tr.ts"), "utf8").matchAll(/tz:\s*"([^"]+)"/g)].map((m) => m[1]);
    const districts = JSON.stringify(JSON.parse(readFileSync(join(ROOT, "lib/human-design/location/trDistricts.generated.json"), "utf8")));
    const distTz = [...districts.matchAll(/"(?:tz|timezone)":"([^"]+)"/g)].map((m) => m[1]);
    const world = [...readFileSync(join(ROOT, "lib/location/world.ts"), "utf8").matchAll(/tz:\s*"([^"]+)"/g)].map((m) => m[1]);
    const g = JSON.parse(readFileSync(join(ROOT, "lib/location/server-data/global-cities.json"), "utf8")) as { locations: { tz: string }[] };
    const all = [...new Set([...tr, ...distTz, ...world, ...g.locations.map((x) => x.tz), "UTC", "Europe/Istanbul", "Asia/Dubai"])];
    const missing = all.filter((z) => !TZ_IANA_ZONES[z] && !TZ_IANA_LINKS[z]);
    assert.deepEqual(missing, [], "tablo dışı uygulama bölgesi");
    console.log(`     ${all.length} uygulama bölgesi tabloda`);
  });

  // ─── G) Kayıt değişmezliği (sentetik; gerçek DB/Roxy yok) ───────────────────────────────────────────────────────────
  const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
  const CLIENT = "55555555-5555-4555-8555-555555555555";
  const HAV: ResolvedLocation = { id: "gn-3553478", label: "Havana, Küba", timezone: "America/Havana", latitude: 23.13302, longitude: -82.38304 };
  const resolveLoc = (id: unknown) => (id === HAV.id ? HAV : null);
  const store = createStore({ clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "Havana" }] });
  const ctx: EngineCtx = { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
  const bodies: Record<string, unknown>[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-tz2026f", baseUrl: "https://roxy-fake.local/api/v2" },
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
  const revRows = () => store.tables.astro_birth_profile_revisions as J[];

  await t("G: eski Havana revizyonu (UTC−5 saklı) aynı gövdeyle; kayıtlı analiz + Word/PDF modeli değişmez; yeni profil UTC−4; düzenleme = yeni revizyon", async () => {
    // A/B — eski profil: düzeltme öncesi sunucunun yazacağı değerler (ofset −18000, UTC 17:00Z) saklı.
    const old = await createAstroProfile(ctx, { label: "Sentetik Havana eski", clientId: CLIENT, birthDate: "2026-11-10", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: HAV.id }, resolveLoc);
    assert.equal(old.status, 201, JSON.stringify(old.body));
    const oldPid = (old.body as J).profile.id as string;
    const oldRev = revRows().find((r) => r.profile_id === oldPid);
    assert.equal(oldRev.utc_offset_seconds, -14400, "yeni kayıt 2026f");
    oldRev.utc_offset_seconds = -18000;
    oldRev.birth_utc = "2026-11-10T17:00:00.000Z";
    const oldSnap = JSON.stringify(oldRev);
    assert.equal(staleTimezoneOffset({ birthDate: "2026-11-10", birthTime: "12:00:00", timeKnown: true, timezone: "America/Havana", dstChoice: "auto", utcOffsetSeconds: -18000 }), null, "backzone dışı: engel/uyarı yok (davranış değişmedi)");
    // C — eski revizyonla hesap: sağlayıcı gövdesi SAKLI ofsetle (−5) aynı.
    const run = (await runAstrology(ctx, { profileId: oldPid, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(run.ok, true, JSON.stringify(run).slice(0, 300));
    assert.deepEqual([bodies.at(-1)!.date, bodies.at(-1)!.time, bodies.at(-1)!.timezone], ["2026-11-10", "12:00:00", -5]);
    const sv = await saveAnalysis(ctx, { profileId: oldPid, revision: 1, ...NATAL, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const aid = (sv.body as J).analysisId;
    const row = (store.tables.astro_analyses as J[]).find((x) => x.id === aid);
    const snapBefore = JSON.stringify([row.technical_snapshot, row.method_snapshot, row.versions_snapshot, row.profile_snapshot]);
    // D — yeniden açma + Word/PDF modeli iki kez aynı; DB snapshot ve revizyon değişmez.
    const a1 = ((await getAnalysis(ctx, aid, false)).body as J).analysis;
    const rep1 = reportTexts(buildAstroReport(a1)).join("\n");
    const a2 = ((await getAnalysis(ctx, aid, false)).body as J).analysis;
    assert.equal(reportTexts(buildAstroReport(a2)).join("\n"), rep1);
    assert.ok(rep1.includes("America/Havana") && rep1.includes("12:00"), "raporda yerel doğum bilgisi");
    assert.match(JSON.stringify(row.profile_snapshot), /-18000/, "kayıtlı analiz eski (saklı) ofseti taşır");
    assert.equal(JSON.stringify([row.technical_snapshot, row.method_snapshot, row.versions_snapshot, row.profile_snapshot]), snapBefore, "DB snapshot değişmez");
    assert.equal(JSON.stringify(oldRev), oldSnap, "eski revizyon değişmez");
    const oldFiles = await wordPdf(ctx, aid); // arşivden açma → Word/PDF (eski kayıt)
    assert.ok(oldFiles.docx.includes("America/Havana") && oldFiles.pdf.includes("America/Havana"));
    // E/F — yeni Havana profili 2026f: UTC−4, 16:00Z; sağlayıcı gövdesi −4.
    const neu = await createAstroProfile(ctx, { label: "Sentetik Havana yeni", clientId: CLIENT, birthDate: "2026-11-10", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: HAV.id, confirmDifferentPerson: [oldPid] }, resolveLoc);
    assert.equal(neu.status, 201, JSON.stringify(neu.body));
    const newPid = (neu.body as J).profile.id as string;
    const newRev = revRows().find((r) => r.profile_id === newPid);
    assert.equal(newRev.utc_offset_seconds, -14400);
    assert.equal(new Date(newRev.birth_utc).toISOString(), "2026-11-10T16:00:00.000Z");
    await runAstrology(ctx, { profileId: newPid, selections: [NATAL] }, deps, { ownerPreviewHideInterp: false });
    assert.deepEqual([bodies.at(-1)!.date, bodies.at(-1)!.time, bodies.at(-1)!.timezone], ["2026-11-10", "12:00:00", -4]);
    const sv2 = await saveAnalysis(ctx, { profileId: newPid, revision: 1, ...NATAL, saveRequestId: randomUUID() }, false);
    assert.equal(sv2.status, 201, JSON.stringify(sv2.body));
    const newRow = (store.tables.astro_analyses as J[]).find((x) => x.id === (sv2.body as J).analysisId);
    assert.match(JSON.stringify(newRow.profile_snapshot), /-14400/, "yeni kayıt güncel ofset");
    const newFiles = await wordPdf(ctx, (sv2.body as J).analysisId); // yeni kayıt → güncel UTC → Word/PDF
    assert.ok(newFiles.docx.includes("America/Havana") && newFiles.pdf.includes("America/Havana"));
    // G — aynı yerel saat, beklenen 1 saatlik UTC farkı.
    assert.equal(Date.parse(oldRev.birth_utc) - Date.parse(newRev.birth_utc), 3_600_000);
    // Düzenleme: eski profil açıkça yeniden kaydedilirse YENİ revizyon 2026f ile; rev 1 aynen kalır.
    const ap = await appendAstroRevision(ctx, oldPid, { expectedRevision: 1, birthDate: "2026-11-10", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: HAV.id, changeNote: "2026f", confirmDifferentPerson: [newPid] }, resolveLoc);
    assert.equal(ap.status, 200, JSON.stringify(ap.body).slice(0, 300));
    const revs = revRows().filter((r) => r.profile_id === oldPid).sort((x, y) => x.revision - y.revision);
    assert.deepEqual(revs.map((r) => [r.revision, r.utc_offset_seconds]), [[1, -18000], [2, -14400]]);
    assert.equal(JSON.stringify(revs[0]), oldSnap, "rev 1 değişmez");
    const detail = ((await getAstroProfileDetail(ctx, oldPid)).body as J).profile;
    assert.deepEqual(detail.revisions.map((r: J) => [r.revision, r.utcOffsetSeconds]).sort(), [[1, -18000], [2, -14400]], "profil detayı iki revizyon");
    const again = ((await getAnalysis(ctx, aid, false)).body as J).analysis;
    assert.equal(reportTexts(buildAstroReport(again)).join("\n"), rep1, "yeni revizyon eski analizi değiştirmez");
    const oldFiles2 = await wordPdf(ctx, aid);
    assert.equal(oldFiles2.docx, oldFiles.docx, "eski kaydın Word metni düzenleme sonrası aynı");
    assert.equal(oldFiles2.pdf, oldFiles.pdf, "eski kaydın PDF metni düzenleme sonrası aynı");
  });

  await t("H: gösterim = hesap — formatInZone / momentLabel / gün anahtarı / transit damgası / dönüş yerel saati / Horary etiketi aynı IANA tablosundan", () => {
    // [bölge, UTC, beklenen yerel (GG.AA.YYYY SS:DD), ofset sn] — beklenen: Python zoneinfo 2026f (Kampala: IANA backzone).
    const cases: [string, string, string, number][] = [
      ["America/Havana", "2026-11-10T16:00:00Z", "10.11.2026 12:00", -14400],
      ["America/Havana", "2026-11-01T05:30:00Z", "01.11.2026 01:30", -14400],
      ["America/Havana", "2027-11-10T17:00:00Z", "10.11.2027 12:00", -18000],
      ["America/Winnipeg", "2026-12-15T17:00:00Z", "15.12.2026 12:00", -18000],
      ["America/Vancouver", "2026-12-15T19:00:00Z", "15.12.2026 12:00", -25200],
      ["America/Edmonton", "2026-12-15T18:00:00Z", "15.12.2026 12:00", -21600],
      ["Africa/Casablanca", "2026-10-15T12:00:00Z", "15.10.2026 12:00", 0],
      ["America/Sao_Paulo", "1965-04-01T02:00:00Z", "31.03.1965 23:00", -10800],
      ["America/Bogota", "1992-05-02T16:00:00Z", "02.05.1992 12:00", -14400],
      ["Asia/Tehran", "1979-05-26T07:30:00Z", "26.05.1979 12:00", 16200],
      ["Europe/Dublin", "1925-09-25T12:00:00Z", "25.09.1925 12:00", 0],
      ["Africa/Kampala", "1951-04-13T17:51:00Z", "13.04.1951 20:36", 9900],
      ["Europe/Istanbul", "2026-11-10T09:00:00Z", "10.11.2026 12:00", 10800],
    ];
    for (const [z, iso, local, off] of cases) {
      const ms = Date.parse(iso);
      assert.equal(utcOffsetSecondsAt(ms, z), off, `${z} ${iso} ofset`);
      const w = wallClockAt(ms, z)!;
      assert.equal(`${w.date.slice(8, 10)}.${w.date.slice(5, 7)}.${w.date.slice(0, 4)} ${w.time.slice(0, 5)}`, local, `${z} ${iso} wallClockAt`);
      const f = formatInZone(iso, z)!;
      assert.equal(f.text, local, `${z} ${iso} formatInZone`);
      const sgn = off < 0 ? "-" : "+";
      const a = Math.abs(off);
      const short = `GMT${sgn}${Math.floor(a / 3600)}${a % 3600 ? `:${String((a % 3600) / 60).padStart(2, "0")}` : ""}`;
      assert.ok(f.zone === short || (off === 0 && /^GMT(\+0)?$/.test(f.zone)), `${z} ${iso} kısaltma ${f.zone} ≠ ${short}`);
      assert.ok(momentLabel(iso, z).startsWith(`${local} (${f.zone}, ${z})`), `${z} momentLabel`);
      assert.equal(dayKeyInZone(iso, z), w.date, `${z} gün anahtarı`);
      const st = toLocalStamp(ms, z)!;
      assert.equal(st.local, `${w.date} ${w.time}`, `${z} transit damgası`);
      const long = off === 0 ? ["+00:00"] : [`${sgn}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String((a % 3600) / 60).padStart(2, "0")}`];
      assert.ok(long.includes(st.offset), `${z} transit ofseti ${st.offset}`);
      const hl = localAt(iso, z);
      assert.equal(hl, formatZoned("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, ms, z));
      assert.ok(hl.includes(local.slice(11)), `${z} Horary etiketi ${hl}`);
      const dp = Object.fromEntries(formatZonedParts("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, ms, z).map((p) => [p.type, p.value]));
      assert.equal(`${dp.day}.${dp.month}.${dp.year} ${dp.hour}:${dp.minute}`, local, `${z} formatZonedParts`);
    }
    // Dönüş anı yerel saati (Word/PDF): doğum yerinde hesaplanan dönüş → IANA ile gerçek yerel saat.
    const rt = returnTimes({ returnLocal: "2026-11-10T11:00:00", returnOffsetHours: -5 }, "America/Havana", false);
    assert.equal(rt.utc, "2026-11-10T16:00:00.000Z");
    assert.match(rt.local ?? "", /^10\.11\.2026 12:00 \(GMT-4, America\/Havana\)$/, rt.local ?? "");
    // Ofset Intl ile aynı olan anlarda çıktı Intl'in kendi çıktısıyla BAYT BAYT aynı (eski gösterim korunur).
    let same = 0;
    for (const z of ["Europe/Istanbul", "Europe/London", "America/New_York", "Asia/Kathmandu", "Australia/Lord_Howe", "America/Havana", "Africa/Casablanca"]) {
      for (let ms = Date.UTC(1990, 0, 1, 3, 17); ms < Date.UTC(2026, 8, 1); ms += 41 * 86_400_000 + 3_600_000 * 5) {
        const o: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" };
        assert.equal(formatZoned("tr-TR", o, ms, z), new Intl.DateTimeFormat("tr-TR", { ...o, timeZone: z }).format(new Date(ms)), `${z} ${new Date(ms).toISOString()}`);
        same += 1;
      }
    }
    console.log(`     ${cases.length} bölge/an × 7 gösterim yolu; ${same} anda Intl ile bayt bayt aynı`);
  });

  await t("I: IANA kimliği — tablodaki her ad (eski Intl tanımasa da) kabul; geçersiz adlar ret; gösterim Intl'siz çalışır", () => {
    const names = [...Object.keys(TZ_IANA_ZONES), ...Object.keys(TZ_IANA_LINKS)];
    for (const z of names) assert.ok(isValidIanaTimeZone(z) && isIanaZone(z), z);
    const bad = ["", "Mars/Olympus_Mons", "America/Havana/", "America/Hav ana", "../etc/passwd", "America/../Havana", "__proto__", "constructor", "Europe/__proto__", "Etc/GMT+15", "America/Havana\n", "x".repeat(65), "Havana", "EST5EDT", "+03:00"];
    for (const z of bad) assert.equal(isValidIanaTimeZone(z), false, `geçersiz kabul edildi: ${JSON.stringify(z)}`);
    assert.equal(resolveAstroBirthTime("2026-11-10", "12:00", "Mars/Olympus_Mons").kind, "invalid");
    assert.equal(wallClockAt(0, "__proto__"), null);
    // Eski ICU'yu taklit: Intl bu adları TANIMIYOR → doğrulama, çözüm ve gösterim yine tablodan.
    const unknown = new Set(["America/Coyhaique", "Europe/Kyiv", "America/Ciudad_Juarez"]);
    const Orig = Intl.DateTimeFormat;
    const Fake = function (locale?: string | string[], o?: Intl.DateTimeFormatOptions) {
      if (o?.timeZone && unknown.has(o.timeZone)) throw new RangeError(`Invalid time zone specified: ${o.timeZone}`);
      return new Orig(locale, o);
    } as unknown as typeof Intl.DateTimeFormat;
    Object.assign(Fake, Orig);
    (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Fake;
    try {
      for (const z of unknown) assert.ok(isValidIanaTimeZone(z) && isIanaZone(z), `${z} reddedildi`);
      assert.equal(sig(resolveAstroBirthTime("2026-07-15", "12:00", "America/Coyhaique")), "ok 2026-07-15T15:00:00Z -10800");
      assert.deepEqual(formatInZone("2026-07-15T15:00:00Z", "America/Coyhaique"), { text: "15.07.2026 12:00", zone: "GMT-3" });
      assert.equal(toLocalStamp(Date.parse("2026-07-15T09:00:00Z"), "Europe/Kyiv")!.local, "2026-07-15 12:00:00");
      assert.equal(sig(resolveAstroBirthTime("2026-11-10", "12:00", "Mars/Olympus_Mons")), "invalid:timezone");
    } finally {
      (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Orig;
    }
    console.log(`     ${names.length} tablo adı kabul; ${bad.length} geçersiz ad ret`);
  });

  console.log(`\nastrology tz-iana-2026f harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
