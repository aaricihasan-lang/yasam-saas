/**
 * ATLAS ROXY KALAN (2026-10-22) — VEDİK AYLIK ZAMANLAMA (`vedic.monthly`) harness'i.
 *   Beş uç = beş isteğe bağlı bölüm: burç girişleri (transit/monthly) · gezegenler arası açılar (aspects/monthly) · Ay açıları
 *   (aspects/lunar) · aylık deklinasyon paralelleri (parallels/monthly) · doğum anı deklinasyonları (parallels).
 *   • A–I: `fixtures/schema/` altındaki ŞEMA-ÖRNEKLERİ (`_kaynak: openapi-schema-example`; değerler Swiss Ephemeris ile tutarlı)
 *     — fail-closed / biçim / akış testleri için korunur.
 *   • R (23.10.2026): beş GERÇEK sağlayıcı yanıtı `fixtures/golden/vedic-monthly-*-2026-02.json` + `vedic-natal-parallels-a.json`;
 *     EK TUR: Mart + Aralık 2026 burç girişleri `fixtures/golden/vedic-monthly-ingress-2026-03.json` / `-12.json` (Berlin DST + Rahu/Ketu)
 *     (`_kaynak: gercek-saglayici-yaniti-2026-10-23`; bu harness çağrı yapmaz) — projeksiyon, sayımlar, açı adları, Rahu/Ketu,
 *     orb, natal yerel datetime, `*Localized` sızmazlığı, ayanamsa tutarlılığı ve bağımsız denetim alt kümesi.
 *   • BAĞIMSIZ doğrulama: astronomy-engine (görünür tropikal − Lahiri; Lahiri ortalama = Swiss Ephemeris çapaları + AE nütasyonu;
 *     ortalama düğüm Meeus) ile burç giriş anları, ay başı boylamları, açı kesinleşme anları, deklinasyonlar.
 *   • fail-closed (bölüm başına ≥5 bozuk vaka), plan / önbellek / kayıt + arşiv (0 istek) / Word + PDF / tenant + uzman 404,
 *     saat bilinmeyen profil, DST (olay başına yerel ofset), astronomik açı ↔ graha drishti AYRIMI, mevcut 36 tekniğin SABİT özeti.
 * Gerçek sağlayıcı / gerçek DB YOK. Yeni modüller dinamik içe aktarılır (tabanda testler çökmeden FAIL verir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/vedik-aylik.harness.ts
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as A from "astronomy-engine";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS, TECHNIQUES } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { TECHNIQUE_TOPIC_CONTEXT, topicsForTechnique } from "@/lib/astrology/topics";
import { formatInZone } from "@/lib/astrology/transitDetail";
import * as UI from "@/app/admin/astroloji/_lib/techniques";
import * as SOON from "@/app/admin/astroloji/_lib/comingSoon";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const DIR = join(__dirname, "fixtures", "schema");
const load = (n: string) => (existsSync(join(DIR, `${n}.json`)) ? JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8")) : null);
const F = {
  ingress: load("vedic-monthly-ingress-2026-02"),
  ingressMar: load("vedic-monthly-ingress-2026-03"),
  ingressDec: load("vedic-monthly-ingress-2026-12"),
  aspects: load("vedic-monthly-aspects-2026-02"),
  lunar: load("vedic-monthly-lunar-2026-02"),
  parallels: load("vedic-monthly-parallels-2026-02"),
  natal: load("vedic-natal-parallels-a"),
};
const OPENAPI = load("vedic-monthly-openapi");
// GERÇEK sağlayıcı yanıtları (23.10.2026; 5 çağrı orkestratörce alındı, bu harness çağrı YAPMAZ). Gövdeler şema örnekleriyle aynı;
// sahte arka uç golden'a ÖNCE baktığı için ekranda artık bu yanıtlar döner. EK TUR (23.10.2026): Mart ve Aralık 2026 burç girişleri de
// GERÇEK yanıt (gövdeler şema örnekleriyle aynı) — DST (Berlin) ve Rahu/Ketu girişi testleri artık gerçek veriyle çalışır.
const GDIR = join(__dirname, "fixtures", "golden");
const loadG = (n: string) => (existsSync(join(GDIR, `${n}.json`)) ? JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")) : null);
const G = {
  ingress: loadG("vedic-monthly-ingress-2026-02"),
  aspects: loadG("vedic-monthly-aspects-2026-02"),
  lunar: loadG("vedic-monthly-lunar-2026-02"),
  parallels: loadG("vedic-monthly-parallels-2026-02"),
  natal: loadG("vedic-natal-parallels-a"),
  ingressMar: loadG("vedic-monthly-ingress-2026-03"),
  ingressDec: loadG("vedic-monthly-ingress-2026-12"),
};
const REAL_ASPECT_NAMES = ["conjunction", "opposition", "trine", "square", "sextile", "quintile", "bi-quintile", "semi-quintile", "semi-sextile", "semi-square", "sesqui-square", "quincunx", "septile", "biseptile", "triseptile", "novile", "binovile", "quadranovile", "undecile", "vigintile", "tredecile", "centile"];

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message.split("\n")[0].slice(0, 400)}`);
  }
}
const need = <T>(v: T | null | undefined, what: string): T => {
  assert.ok(v !== null && v !== undefined, `${what} yok`);
  return v as T;
};
async function imp(p: string): Promise<J> {
  try {
    return await import(p);
  } catch {
    return {};
  }
}
const fnOf = (o: J, k: string) => {
  assert.equal(typeof o?.[k], "function", `${k} dışa aktarılmamış (eski kod)`);
  return o[k];
};
const tamper = (raw: J, f: (r: J) => void) => {
  const r = structuredClone(raw);
  f(r);
  return r;
};
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as J)[k])}`).join(",")}}`;
const n360 = (x: number) => ((x % 360) + 360) % 360;
const sep = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ── Bağımsız efemeris: astronomy-engine ────────────────────────────────────────────────────────────
// Lahiri ORTALAMA ayanamsa çapaları (Swiss Ephemeris swe_get_ayanamsa_ut, SIDM_LAHIRI): ara değer doğrusal; gerçek = + AE nütasyonu.
const ANCH: [number, number][] = [
  [Date.parse("1990-07-15T11:30:00Z"), 23.72488235],
  [Date.parse("2026-01-01T00:00:00Z"), 24.22030398],
  [Date.parse("2027-01-01T00:00:00Z"), 24.23426492],
];
const lahiriMean = (ms: number) => {
  const [a, b] = ms < ANCH[1][0] ? [ANCH[0], ANCH[1]] : [ANCH[1], ANCH[2]];
  return a[1] + ((ms - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
};
const BODY: Record<string, A.Body> = { sun: A.Body.Sun, moon: A.Body.Moon, mars: A.Body.Mars, mercury: A.Body.Mercury, jupiter: A.Body.Jupiter, venus: A.Body.Venus, saturn: A.Body.Saturn };
function aeSid(p: string, ms: number): number {
  const tt = A.MakeTime(new Date(ms));
  if (p === "rahu" || p === "ketu") {
    const T = tt.tt / 36525;
    const node = n360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T ** 3 / 467441 - T ** 4 / 60616000);
    return n360(node + (p === "ketu" ? 180 : 0) - lahiriMean(ms));
  }
  const lon = p === "moon" ? A.EclipticGeoMoon(tt).lon : A.Ecliptic(A.GeoVector(BODY[p], tt, true)).elon;
  return n360(lon - lahiriMean(ms) - A.e_tilt(tt).dpsi / 3600);
}
function aeDec(p: string, ms: number): { dec: number; ra: number } {
  const tt = A.MakeTime(new Date(ms));
  const v = A.RotateVector(A.Rotation_EQJ_EQD(tt), A.GeoVector(BODY[p], tt, true));
  const e = A.EquatorFromVector(v);
  return { dec: e.dec, ra: e.ra * 15 };
}
const speed = (p: string, ms: number) => {
  const d = aeSid(p, ms + 3600e3) - aeSid(p, ms - 3600e3);
  return (((d + 540) % 360) - 180) * 12; // °/gün
};
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];

// ── Ürün bağlamı ───────────────────────────────────────────────────────────────────────────────────
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const USER_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });
async function profile(ctx: EngineCtx, timeKnown = true): Promise<string> {
  const r = await createAstroProfile(
    ctx,
    { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: timeKnown ? "14:30" : null, timeKnown, timeAccuracy: timeKnown ? "exact_record" : "unknown", locationId: ISTANBUL.id } as J,
    (id) => (id === ISTANBUL.id ? ISTANBUL : null),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
function roxy(mutate?: (endpoint: string, r: J) => void, src: Record<string, J> = F) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-vm", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const g = Object.values(src).filter(Boolean).find((x: J) => x.endpoint === endpoint && canon(x.body) === canon(body));
      if (!g) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const raw = structuredClone(g.response);
      mutate?.(endpoint, raw);
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => {},
  };
  return { calls, deps };
}
async function pdfText(buf: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return (text as string).replace(/\s+/g, " ");
}
async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}
const FONT_B64 = readFileSync(join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");

const MONTHLY4 = ["ingress", "aspects", "lunar", "parallels"];
const ALL5 = [...MONTHLY4, "natal_parallels"];
const SEL = (sections: string[] = MONTHLY4, over: Record<string, unknown> = {}) => ({ technique: "vedic.monthly", options: { year: 2026, month: 2, sections, ayanamsa: "lahiri", displayTz: "Europe/Istanbul", ...over } });
const BIRTH_A = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };

/** Mevcut 36 tekniğin birim gövdesi + adaptör + anahtar + bağlam anahtarı özeti — taban 40f31195'te ölçüldü (bu dalda SABİT). */
const BASE_HASHES: Record<string, string> = {
  "western.natal": "2ca8cb0c0ded0090", "western.transit": "6516862b76ffcdd3", "western.forecast": "998cd0b3115cba02", "western.progression": "14e3164183e949eb",
  "western.solar_arc": "50d0d04be273ca62", "western.solar_return": "7215a22370c69a43", "western.lunar_return": "31cdf4497c99a577", "western.synastry": "29f032bc6897474a",
  "western.composite": "a7b3d847ef613c2f", "western.astrocartography": "56bc472d83428c58", "western.relocation": "877bc8f567fc8b1d", "western.local_space": "33ef8dbde5350d81",
  "western.fixed_stars": "785baef278eb4d34", "western.profections": "a148e70e96a16169", "western.extra_points": "14ec3b390c3f38aa", "western.planetary_return": "4b8270f994f45dee",
  "vedic.d1": "6540f87c254caa0d", "vedic.varga": "d967986ce01c640a", "vedic.dasha": "1882874c698ac383", "vedic.drishti": "fc73462fed102d79",
  "vedic.ashtakavarga": "48715c60104086a4", "vedic.shadbala": "7dcc4f860e0bbba3", "vedic.panchanga": "3ad375f04321e69f", "vedic.transit": "73f31f7d3718b636",
  "vedic.bhav_chalit": "194e2fbdde8667e0", "vedic.chara_karaka": "c13f95d7a8d17678", "vedic.arudha": "7d5aa48ba6985695", "vedic.bhava_bala": "6dce4b50e13178de",
  "kp.chart": "d7f489a2fb5c3834", "kp.dasha": "0590c5bb22dbf1a1", "kp.ruling": "5b0fef1b478ae8c0", "kp.transit": "364b0fda655fc7a3",
  "kp.horary": "6d5ca9ec5b9b533b", "kp.ruling_interval": "135fdaa3f82f6f51", "vedic.gun_milan": "2a38c668ff2e9835", "vedic.sade_sati": "b003587cd90af3ff",
};
const HASH_OPTS: Record<string, unknown> = {
  "western.natal": { houseSystem: "placidus", nodeType: "true" },
  "western.transit": { atUtc: "2026-10-07T09:00", nodeType: "true" },
  "western.forecast": { startDate: "2026-10-01", days: 90 },
  "western.progression": { targetDate: "2026-10-07", nodeType: "true" },
  "western.solar_arc": { targetDate: "2026-10-07", nodeType: "true" },
  "western.solar_return": { returnYear: 2026, houseSystem: "placidus", returnLocationId: null },
  "western.lunar_return": { month: "2026-10", sequence: 1, houseSystem: "placidus", returnLocationId: null },
  "western.synastry": { partnerProfileId: "00000000-0000-4000-8000-000000000002", partnerRevision: 1, houseSystem: "placidus", nodeType: "true" },
  "western.composite": { partnerProfileId: "00000000-0000-4000-8000-000000000002", partnerRevision: 1, houseSystem: "placidus", nodeType: "true" },
  "western.astrocartography": {},
  "western.relocation": { targetLocationId: "gb-london", houseSystem: "placidus" },
  "western.local_space": { referenceLocationId: null },
  "western.fixed_stars": { nodeType: "true", orb: 1, reportCatalog: false },
  "western.profections": { age: 36 },
  "western.extra_points": { sections: ["asteroids", "lots", "lilith"], houseSystem: "placidus" },
  "western.planetary_return": { planet: "saturn", approxDate: "2019-12-01", crossing: 1, houseSystem: "placidus", returnLocationId: null },
  "kp.ruling_interval": { atUtc: "2026-10-07T08:30", durationMinutes: 60, intervalMinutes: 10, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null },
  "vedic.gun_milan": { partnerProfileId: "00000000-0000-4000-8000-000000000002", ayanamsa: "lahiri" },
};
/** KP transit ARALIK kipi (Rasi geçişleri — bu teknikle en yakın mevcut özellik) taban özeti. */
const KP_RANGE_HASH = "5762cd43ba23eeb4";

function techniqueHash(id: string, opts?: unknown): string {
  const def = (TECHNIQUES as J)[id];
  const now = new Date("2026-10-07T09:00:00Z");
  const partner = { birthDate: "1988-03-21", birthTime: "06:45:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 };
  const ctx = { birth: BIRTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner, places: { target: { latitude: 51.5072, longitude: -0.1276 }, reference: { latitude: 51.5072, longitude: -0.1276 } } };
  let opt = (opts !== undefined ? def.parseOptions(opts, now) : null) ?? def.parseOptions({}, now) ?? def.parseOptions({ now: true, horaryNumber: 1 }, now);
  if (id === "kp.ruling_interval") opt = { ...opt, offsetHours: 3 };
  const us = def.units(ctx, opt);
  const cu = def.contextUnits ? def.contextUnits(ctx, opt) : [];
  return createHash("sha256")
    .update(JSON.stringify([us.map((u: J) => [u.endpoint, u.adapterVersion, u.inputHash, u.body, u.query ?? null]), cu.map((u: J) => u.inputHash)]))
    .digest("hex")
    .slice(0, 16);
}

async function main() {
  const P = await imp("@/lib/astrology/providers/roxy/vedicMonthly");
  const M = await imp("@/lib/astrology/model/vedicMonthly");
  const E = await imp("@/lib/astrology/engine/vedicMonthlyTechnique");
  const proj = (section: string, raw: J, body?: J) => fnOf(P, "projectRoxyVedicMonthlySection")(section, raw, body ?? (section === "natal_parallels" ? F.natal.body : F[section as "ingress"].body));

  // ═══ A) ŞEMA-ÖRNEĞİ ↔ OPENAPI ↔ ÜRÜN GÖVDESİ ════════════════════════════════════════════════════
  await t("A: şema-örneği fixture'lar işaretli (_kaynak openapi-schema-example; gerçek golden klasöründe DEĞİL); ürün gövdesi = fixture gövdesi; doğum verisi yalnız doğum anı bölümünde", () => {
    for (const [k, g] of Object.entries(F)) {
      assert.ok(g, `${k} fixture yok`);
      assert.equal(g._kaynak, "openapi-schema-example", k);
      assert.ok(/Gerçek yanıt doğrulaması BLOKE/.test(g._not), k);
      assert.ok(!existsSync(join(__dirname, "fixtures", "golden", `${k}.json`)));
    }
    const body = fnOf(P, "vedicMonthlyBody");
    assert.deepEqual(body("ingress", 2026, 2), F.ingress.body);
    assert.deepEqual(body("aspects", 2026, 2), F.aspects.body);
    assert.deepEqual(body("lunar", 2026, 2), F.lunar.body);
    assert.deepEqual(body("parallels", 2026, 2), F.parallels.body);
    assert.deepEqual(body("ingress", 2026, 3), F.ingressMar.body);
    assert.deepEqual(fnOf(P, "vedicNatalParallelsBody")(BIRTH_A), F.natal.body);
    for (const k of ["ingress", "aspects", "lunar", "parallels"] as const) assert.ok(!/1990|birth|latitude/.test(JSON.stringify(F[k].body)), `${k}: aylık gövdede doğum verisi`);
    assert.equal(F.ingress.body.timezone, 0, "UTC gönderilir (sağlayıcının tek ofset davranışı devre dışı)");
    assert.equal(F.ingress.body.coordinateSystem, "sidereal");
  });

  await t("A: OpenAPI 2.0.0 — ürün gövdesi yalnız şemadaki alanları taşır (zorunlular dahil); fixture yanıtı tüm zorunlu alanları içerir; tip ve enum uyar", () => {
    const o = need(OPENAPI, "OpenAPI özeti");
    assert.equal(o.info, "2.0.0");
    const check = (schema: J, v: J, path: string) => {
      if (schema.type === "object") {
        assert.ok(v && typeof v === "object" && !Array.isArray(v), `${path}: nesne değil`);
        for (const r of schema.required ?? []) assert.ok(r in v, `${path}.${r} zorunlu alan yok`);
        for (const [k, s] of Object.entries(schema.properties ?? {})) if (k in v) check(s, v[k], `${path}.${k}`);
      } else if (schema.type === "array") {
        assert.ok(Array.isArray(v), `${path}: dizi değil`);
        for (const x of v) check(schema.items, x, `${path}[]`);
      } else if (schema.type === "number" || schema.type === "integer") assert.equal(typeof v, "number", path);
      else if (schema.type === "string") {
        assert.equal(typeof v, "string", path);
        if (schema.enum) assert.ok(schema.enum.includes(v), `${path}: enum`);
      } else if (schema.type === "boolean") assert.equal(typeof v, "boolean", path);
    };
    for (const g of Object.values(F)) {
      const s = o.paths[g.endpoint];
      assert.ok(s, g.endpoint);
      check(s.response, g.response, g.endpoint);
      for (const k of Object.keys(g.body)) assert.ok(k in s.request.properties, `${g.endpoint}: gövde alanı ${k} şemada yok`);
      for (const r of s.request.required ?? []) assert.ok(r in g.body, `${g.endpoint}: zorunlu ${r}`);
    }
  });

  // ═══ B) PROJEKSİYON ═════════════════════════════════════════════════════════════════════════════
  await t("B: projeksiyon — 4 aylık bölüm + doğum anı; olaylar UTC dakika; 9 graha ay başı konumu; eşlenmemiş alan 0 (yerelleştirilmiş adlar bilinen alan, projekte edilmez); yorum katmanı YOK", () => {
    const i = proj("ingress", F.ingress.response);
    assert.equal(i.ok, true, JSON.stringify(i.errors));
    assert.equal(i.technical.start.length, 9);
    assert.equal(i.technical.events.length, F.ingress.response.transitEvents.length);
    assert.deepEqual(i.technical.events.find((e: J) => e.planet === "mars"), { atUtc: "2026-02-23T06:20", planet: "mars", from: "capricorn", to: "aquarius", retrograde: false });
    assert.deepEqual(i.unmappedFields, []);
    assert.equal(i.interpretation, null);
    assert.ok(!JSON.stringify(i.technical).includes("Localized") && !JSON.stringify(i.technical).includes("Güneş"));
    const a = proj("aspects", F.aspects.response);
    assert.equal(a.ok, true, JSON.stringify(a.errors));
    assert.equal(a.technical.events.length, 58);
    assert.ok(a.technical.events.every((e: J) => e.a !== "moon" && e.b !== "moon"));
    assert.ok(a.technical.events.some((e: J) => e.aspect === "semi_sextile") && a.technical.events.some((e: J) => e.aspect === "sesqui_square"));
    const l = proj("lunar", F.lunar.response);
    assert.equal(l.ok, true, JSON.stringify(l.errors));
    assert.equal(l.technical.events.length, 332);
    const p = proj("parallels", F.parallels.response);
    assert.equal(p.ok, true, JSON.stringify(p.errors));
    assert.equal(p.technical.events.length, 15);
    const n = proj("natal_parallels", F.natal.response);
    assert.equal(n.ok, true, JSON.stringify(n.errors));
    assert.equal(n.technical.atLocal, "1990-07-15T14:30:00");
    assert.equal(n.technical.planets.length, 7);
    assert.equal(n.technical.parallels.length, 9);
    for (const x of [a, l, p, n]) assert.deepEqual(x.unmappedFields, []);
    const dec = proj("ingress", need(G.ingressDec, "golden Aralık").response, G.ingressDec.body); // GERÇEK yanıt (EK TUR)
    assert.equal(dec.ok, true, JSON.stringify(dec.errors));
    const rk = dec.technical.events.filter((e: J) => e.planet === "rahu" || e.planet === "ketu");
    assert.deepEqual(rk.map((e: J) => [e.planet, e.from, e.to, e.retrograde]), [["rahu", "aquarius", "capricorn", true], ["ketu", "leo", "cancer", true]]);
  });

  // ═══ C) BAĞIMSIZ DOĞRULAMA (astronomy-engine) ════════════════════════════════════════════════════
  await t("C1 BAĞIMSIZ: ay başı (01.02.2026 00:00 UTC) 9 graha sidereal boylamı astronomy-engine ile ≤0,005° (Satürn dahil); Ketu = Rahu + 180°", () => {
    const ms = Date.parse("2026-02-01T00:00:00Z");
    for (const s of F.ingress.response.startingPositions) {
      const id = s.planet.toLowerCase();
      const d = sep(aeSid(id, ms), s.longitude);
      assert.ok(d <= 0.005, `${id}: Δ ${d.toFixed(5)}°`);
    }
  });

  await t("C2 BAĞIMSIZ (GERÇEK yanıtlar): burç giriş anları — 3 ay (Şubat, Mart, Aralık) tüm olaylar: an ± kayma içinde boylam sınırı geçer, önce çıkış burcu / sonra giriş burcu; geri hareket bayrağı AE hız işaretiyle aynı", () => {
    let n = 0;
    for (const g of [G.ingress, G.ingressMar, G.ingressDec]) {
      for (const e of need(g, "golden burç girişi").response.transitEvents) {
        const id = e.planet.toLowerCase();
        const ms = Date.parse(`${e.datetime}Z`);
        const v = speed(id, ms);
        const dt = Math.max(5 * 60e3, ((0.02 / Math.abs(v)) * 86400e3) | 0);
        assert.equal(SIGNS[Math.floor(aeSid(id, ms - dt) / 30)], e.fromSign.toLowerCase(), `${id} ${e.datetime} öncesi`);
        assert.equal(SIGNS[Math.floor(aeSid(id, ms + dt) / 30)], e.toSign.toLowerCase(), `${id} ${e.datetime} sonrası`);
        assert.equal(v < 0, e.isRetrograde, `${id} hız işareti`);
        n++;
      }
    }
    assert.ok(n >= 50, `olay sayısı ${n}`);
  });

  await t("C3 BAĞIMSIZ: açı kesinleşmeleri (58 gezegen + 332 Ay) — AE ayrımı olay anında |ayrım − açı| ≤ orb + göreli hız × 1 dk + 0,01°; mesafe = AE ayrımı ±0,01°", () => {
    const ang = Object.fromEntries((M.MONTHLY_ASPECTS ?? []).map((x: J) => [x.id, x.angle]));
    assert.equal(Object.keys(ang).length, 22, "22 açı türü");
    const key = (s: string) => s.replace(/-/g, "_");
    for (const [g, k1, k2] of [[F.aspects, "planet1", "planet2"], [F.lunar, null, "planet"]] as const) {
      for (const e of g.response.events) {
        const a = k1 ? e[k1].toLowerCase() : "moon";
        const b = e[k2].toLowerCase();
        const ms = Date.parse(`${e.datetime}Z`);
        const s = sep(aeSid(a, ms), aeSid(b, ms));
        const rel = Math.abs(speed(a, ms) - speed(b, ms)) / 1440;
        assert.ok(Math.abs(s - e.distance) <= 0.01 + rel, `${a}-${b} ${e.aspect} ${e.datetime}: mesafe AE ${s.toFixed(4)} ↔ ${e.distance}`);
        assert.ok(Math.abs(Math.abs(s - ang[key(e.aspect)]) - e.orb) <= 0.01 + rel, `${a}-${b} ${e.aspect} ${e.datetime}: orb`);
      }
    }
  });

  await t("C4 BAĞIMSIZ: deklinasyon — aylık paralel olaylarında dec1/dec2 AE (yer merkezli, tarihin ekvatoru) ±0,01°; doğum anı 7 gezegen deklinasyon ±0,01° ve sağ açıklık ±0,01°", () => {
    for (const e of F.parallels.response.events) {
      const ms = Date.parse(`${e.datetime}Z`);
      for (const [p, d] of [[e.planet1, e.dec1], [e.planet2, e.dec2]]) assert.ok(Math.abs(aeDec(p.toLowerCase(), ms).dec - d) <= 0.01, `${p} ${e.datetime}`);
    }
    const ms = Date.parse("1990-07-15T11:30:00Z");
    for (const p of F.natal.response.planets) {
      const x = aeDec(p.name.toLowerCase(), ms);
      assert.ok(Math.abs(x.dec - p.declination) <= 0.01, `${p.name} dec`);
      assert.ok(sep(x.ra, p.rightAscension) <= 0.01, `${p.name} RA`);
    }
  });

  await t("C5 şema örneklerindeki tarihler: Güneş 01.02.2026 Oğlak (örnek 286,45°; AE 287,90° — burç tutarlı, değer temsili); Mars 14.02.2026 İkizler→Yengeç örneği AE ile TUTARSIZ (Mars Oğlak'ta) → örnek değerler temsili, fixture'da kullanılmadı", () => {
    const sun = aeSid("sun", Date.parse("2026-02-01T00:00:00Z"));
    assert.equal(SIGNS[Math.floor(sun / 30)], "capricorn");
    assert.ok(Math.abs(sun - 286.45) > 1, "örnek değer temsili");
    const mars = aeSid("mars", Date.parse("2026-02-14T09:02:00Z"));
    assert.equal(SIGNS[Math.floor(mars / 30)], "capricorn");
    assert.ok(!F.ingress.response.transitEvents.some((e: J) => e.planet === "Mars" && e.toSign === "Cancer"));
  });

  // ═══ D) FAIL-CLOSED ═════════════════════════════════════════════════════════════════════════════
  await t("D1 fail-closed burç girişi: yıl yankısı · timezone yankısı · ay dışı an · date/datetime uyuşmazlığı · komşu olmayan geçiş · Güneş geri · zincir kopukluğu · Rahu/Ketu eşleşmesi · 8 graha · burç↔boylam → RED; dış gezegen → yalnız atlanır + raporlanır; bilinmeyen alan → yalnız raporlanır", () => {
    const g = F.ingress.response;
    const no = (raw: J, what: string) => assert.equal(proj("ingress", raw).ok, false, what);
    no(tamper(g, (r) => (r.year = 2025)), "yıl");
    no(tamper(g, (r) => (r.timezone = 3)), "tz");
    no(tamper(g, (r) => Object.assign(r.transitEvents[0], { datetime: "2026-03-01T00:00:00", date: "2026-03-01", time: "00:00" })), "ay dışı");
    no(tamper(g, (r) => (r.transitEvents[0].time = "23:59")), "date/time");
    no(tamper(g, (r) => (r.transitEvents.find((e: J) => e.planet === "Mars").toSign = "Pisces")), "komşu değil");
    no(tamper(g, (r) => {
      const e = r.transitEvents.find((x: J) => x.planet === "Sun");
      Object.assign(e, { isRetrograde: true, fromSign: "Aquarius", toSign: "Capricorn" });
    }), "Güneş geri");
    no(tamper(g, (r) => r.transitEvents.splice(r.transitEvents.findIndex((e: J) => e.planet === "Moon"), 1)), "zincir (Ay girişi atlandı)");
    no(tamper(need(G.ingressDec, "golden Aralık").response, (r) => (r.transitEvents.find((e: J) => e.planet === "Ketu").toSign = "Leo")), "Rahu/Ketu");
    no(tamper(g, (r) => r.startingPositions.pop()), "8 graha");
    no(tamper(g, (r) => (r.startingPositions[0].longitude = 310)), "burç↔boylam");
    const outer = proj("ingress", tamper(g, (r) => r.transitEvents.push({ planet: "Uranus", fromSign: "Taurus", toSign: "Gemini", date: "2026-02-10", time: "10:00", datetime: "2026-02-10T10:00:00", isRetrograde: false })));
    assert.equal(outer.ok, true);
    assert.ok(outer.droppedValues.some((x: string) => /uranus/.test(x)));
    const extra = proj("ingress", tamper(g, (r) => (r.transitEvents[0].nakshatra = "x")));
    assert.equal(extra.ok, true);
    assert.deepEqual(extra.unmappedFields, ["transitEvents[].nakshatra"]);
  });

  await t("D2 fail-closed açılar: bilinmeyen açı adı · mesafe ≠ boylam ayrımı · orb ≠ |mesafe − açı| · aylık uçta Ay · aynı gezegen · yinelenen olay · orb sınır dışı → RED; Ay açılarında Ay–Ay / orb hatası → RED", () => {
    const g = F.aspects.response;
    const no = (raw: J, what: string) => assert.equal(proj("aspects", raw).ok, false, what);
    no(tamper(g, (r) => (r.events[0].aspect = "sesquiquintile")), "bilinmeyen açı");
    no(tamper(g, (r) => (r.events[0].distance += 1)), "mesafe");
    no(tamper(g, (r) => (r.events[0].orb = 0.5)), "orb");
    no(tamper(g, (r) => (r.events[0].planet1 = "Moon")), "Ay");
    no(tamper(g, (r) => (r.events[0].planet2 = r.events[0].planet1)), "aynı gezegen");
    no(tamper(g, (r) => r.events.push(structuredClone(r.events[0]))), "yinelenen");
    no(tamper(g, (r) => (r.events[0].orb = 12)), "orb sınırı");
    const l = F.lunar.response;
    assert.equal(proj("lunar", tamper(l, (r) => (r.events[0].planet = "Moon"))).ok, false, "Ay–Ay");
    assert.equal(proj("lunar", tamper(l, (r) => (r.events[3].orb += 0.3))).ok, false, "Ay orb");
    assert.equal(proj("lunar", tamper(l, (r) => (r.events[3].moonLongitude = (r.events[3].moonLongitude + 2) % 360))).ok, false, "Ay boylamı");
  });

  await t("D3 fail-closed deklinasyon: paralel orb ≠ |d1−d2| · kontraparalel orb ≠ |d1+d2| · tür enum · deklinasyon > 35° · Rahu (aylık kapsam dışı) · doğum anında eksik çift (tamlık) · dec1 tabloyla uyuşmaz · datetime yankısı · orb > istenen → RED", () => {
    const g = F.parallels.response;
    const no = (raw: J, what: string, s = "parallels") => assert.equal(proj(s, raw).ok, false, what);
    no(tamper(g, (r) => (r.events.find((e: J) => e.type === "parallel").orb += 0.2)), "paralel orb");
    const ci = g.events.findIndex((e: J) => e.type === "contraparallel");
    if (ci >= 0) no(tamper(g, (r) => (r.events[ci].type = "parallel")), "kontraparalel → paralel");
    no(tamper(g, (r) => (r.events[0].type = "antiscia")), "tür");
    no(tamper(g, (r) => ((r.events[0].dec1 = 40), (r.events[0].orb = Math.abs(40 - r.events[0].dec2)))), "deklinasyon");
    no(tamper(g, (r) => (r.events[0].planet2 = "Rahu")), "Rahu");
    const n = F.natal.response;
    no(tamper(n, (r) => r.parallels.splice(1, 1)), "tamlık (eksik çift)", "natal_parallels");
    no(tamper(n, (r) => (r.parallels[0].dec1 += 0.3)), "dec1 tablo", "natal_parallels");
    no(tamper(n, (r) => (r.datetime = "1990-07-15T12:00:00")), "datetime yankısı", "natal_parallels");
    no(tamper(n, (r) => r.parallels.push({ planet1: "Moon", planet2: "Mars", type: "parallel", orb: 3.4553, dec1: 13.6613, dec2: 10.2061 })), "orb > istenen", "natal_parallels");
  });

  // ═══ E) TEKNİK TANIMI ═══════════════════════════════════════════════════════════════════════════
  await t("E: teknik — ayrı kimlik vedic.monthly; doğum saati gerekmez; seçenekler (yıl 1600–2600, ay 1–12, bölümler kanonik / boş / yinelenen / bilinmeyen RED, yalnız Lahiri, displayTz IANA); bölüm başına 1 birim; displayTz anahtara GİRMEZ", () => {
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes("vedic.monthly"));
    const def = need(getTechnique("vedic.monthly"), "teknik");
    assert.equal(def.requiresKnownTime, false);
    assert.equal(def.family, "vedic");
    assert.equal(def.label, "Vedik aylık zamanlama");
    const now = new Date();
    assert.deepEqual(def.parseOptions(SEL().options, now), SEL().options);
    assert.deepEqual(def.parseOptions({ year: 2026, month: 2, sections: ["parallels", "ingress"] }, now), { year: 2026, month: 2, sections: ["ingress", "parallels"], ayanamsa: "lahiri" });
    for (const bad of [{ sections: [] }, { sections: ["ingress", "ingress"] }, { sections: ["eclipse"] }, { month: 13 }, { month: 0 }, { year: 1500 }, { year: 2026.5 }, { ayanamsa: "raman" }, { displayTz: "Mars/Olympus" }])
      assert.equal(def.parseOptions({ ...SEL().options, ...bad }, now), null, JSON.stringify(bad));
    const ctx = { birth: BIRTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null };
    const us = def.units(ctx, def.parseOptions(SEL(ALL5).options, now)!);
    assert.deepEqual(us.map((u) => u.endpoint), ["/vedic-astrology/transit/monthly", "/vedic-astrology/aspects/monthly", "/vedic-astrology/aspects/lunar", "/vedic-astrology/parallels/monthly", "/vedic-astrology/parallels"]);
    assert.deepEqual(us.map((u) => u.part), [0, 1, 2, 3, 4]);
    assert.deepEqual(us[4].body, F.natal.body);
    const other = def.units({ ...ctx, birth: { ...BIRTH_A, birthDate: "1975-01-01" } }, def.parseOptions(SEL(MONTHLY4).options, now)!);
    assert.deepEqual(other.map((u) => u.inputHash), us.slice(0, 4).map((u) => u.inputHash), "aylık bölüm anahtarı danışandan bağımsız");
    const utc = def.units(ctx, def.parseOptions(SEL(MONTHLY4, { displayTz: "UTC" }).options, now)!);
    assert.deepEqual(utc.map((u) => u.inputHash), us.slice(0, 4).map((u) => u.inputHash), "gösterim saat dilimi anahtara girmemeli");
    assert.equal(def.noteContext!(SEL().options), "ayanamsa:lahiri");
    const noTime = def.units({ ...ctx, birth: { ...BIRTH_A, birthTime: null } }, def.parseOptions(SEL(ALL5).options, now)!);
    assert.equal(noTime.length, 4, "saat yokken doğum anı bölümü istenmez");
    assert.equal(fnOf(E, "vedicMonthlySkipReason")({ birth: BIRTH_A }, "natal_parallels"), null);
    assert.equal(fnOf(E, "vedicMonthlySkipReason")({ birth: { ...BIRTH_A, birthTime: null } }, "ingress"), null, "aylık bölüm saatten bağımsız");
    assert.ok(/doğum saati/.test(def.noUnitsReason!({ ...ctx, birth: { ...BIRTH_A, birthTime: null } }, def.parseOptions(SEL(["natal_parallels"]).options, now)!) ?? ""));
  });

  await t("E SABİT: mevcut 36 tekniğin birim gövdesi + adaptör + girdi özeti + bağlam anahtarı taban 40f31195 ile BİREBİR; KP transit aralık (Rasi) kipi de aynı; Gochara / Graha Drishti tanımı değişmedi", () => {
    for (const id of Object.keys(BASE_HASHES)) assert.equal(techniqueHash(id, HASH_OPTS[id]), BASE_HASHES[id], `${id} girdi özeti değişti`);
    assert.equal(Object.keys(BASE_HASHES).length, 36);
    const kpRange = { range: { startDate: "2026-02-01", days: 28, planets: ["sun", "moon", "mars"], kinds: ["rasi"] }, ayanamsa: "kp-newcomb", nodeType: "mean" };
    assert.equal(techniqueHash("kp.transit", kpRange), KP_RANGE_HASH);
    assert.equal(getTechnique("vedic.transit")!.requiresKnownTime, true);
    assert.equal(getTechnique("vedic.drishti")!.label.includes("Drishti"), true);
  });

  // ═══ F) PLAN + ÖNBELLEK + SAAT YOK ══════════════════════════════════════════════════════════════
  await t("F: plan — yalnız seçilen bölüm istek açar (1/2/4/5); çalıştır → 2. çalıştırma 0 istek; başka danışan aynı ay 0 istek (aylık bölümler); gösterim saat dilimi değişince 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    for (const [secs, n] of [[["lunar"], 1], [["ingress", "parallels"], 2], [MONTHLY4, 4], [ALL5, 5]] as const) {
      const p = ((await planAstrology(ctx, { profileId: pid, selections: [SEL([...secs])] })).body as J).plan;
      assert.equal(p.newRequestCount, n, secs.join(","));
      assert.equal(p.selections[0].blocked ?? null, null);
    }
    const rx = roxy();
    const r = (await runAstrology(ctx, { profileId: pid, selections: [SEL(ALL5)] }, rx.deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(r.results[0].ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(rx.calls.length, 5);
    await runAstrology(ctx, { profileId: pid, selections: [SEL(ALL5)] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(rx.calls.length, 5, "2. çalıştırma istek yaptı");
    const p2 = ((await planAstrology(ctx, { profileId: pid, selections: [SEL(MONTHLY4, { displayTz: "Europe/Berlin" })] })).body as J).plan;
    assert.equal(p2.newRequestCount, 0, "saat dilimi değişimi yeni istek açmamalı");
    const other = await createAstroProfile(ctx, { label: "Sentetik B", clientId: CLIENT_X, birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id } as J, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
    const p3 = ((await planAstrology(ctx, { profileId: (other.body as J).profile.id, selections: [SEL(MONTHLY4)] })).body as J).plan;
    assert.equal(p3.newRequestCount, 0, "aylık bölümler danışandan bağımsız önbellekte");
  });

  await t("F: saat bilinmeyen profil — aylık bölümler çalışır (TIME_REQUIRED yok); doğum anı bölümü İSTENMEZ (plan bilgisi + gerekçe); yalnız doğum anı seçiliyse NO_UNIT; mevcut Gochara aynı profilde TIME_REQUIRED", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx, false);
    const p = ((await planAstrology(ctx, { profileId: pid, selections: [SEL(ALL5), { technique: "vedic.transit", options: { ayanamsa: "lahiri", atUtc: "2026-02-10T12:00" } }] })).body as J).plan;
    assert.equal(p.selections[0].blocked ?? null, null, JSON.stringify(p.selections[0]));
    assert.equal(p.newRequestCount, 4);
    assert.equal(p.selections[0].info.skippedSections[0].section, "natal_parallels");
    assert.equal(p.selections[1].blocked?.code, "TIME_REQUIRED");
    const only = ((await planAstrology(ctx, { profileId: pid, selections: [SEL(["natal_parallels"])] })).body as J).plan;
    assert.ok(JSON.stringify(only).includes("NO_UNIT"));
    const rx = roxy();
    const r = (await runAstrology(ctx, { profileId: pid, selections: [SEL(ALL5)] }, rx.deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(rx.calls.length, 4);
    assert.ok(rx.calls.every((c) => c.endpoint !== "/vedic-astrology/parallels"));
    const v = r.results[0].view;
    assert.equal(v.technical.natalParallels, null);
    assert.deepEqual(v.technical.missing, ["natal_parallels"]);
    assert.equal(v.technical.ingress.events.length, 16);
    const m = maskTechnical("vedic.monthly", { ...v.technical, natalParallels: { atLocal: "x", orb: 1.5, planets: [], parallels: [] } }, { primary: false, partner: null });
    assert.equal((m.technical as J).natalParallels, null, "saat bilinmiyorsa kayıtlı doğum anı bölümü gösterilmez");
    assert.equal((m.technical as J).ingress.events.length, 16, "aylık bölümler maskelenmez");
  });

  await t("F: bozuk bölüm — PROVIDER_INVALID_RESPONSE yalnız o bölümü düşürür (kısmi görünüm + eksik bölüm listesi); kayıt eksik bölümle yapılamaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy((e, r) => {
      if (e === "/vedic-astrology/aspects/lunar") r.events[0].orb = 5;
    });
    const r = (await runAstrology(ctx, { profileId: pid, selections: [SEL(MONTHLY4)] }, rx.deps, { ownerPreviewHideInterp: false })).body as J;
    const it = r.results[0];
    assert.equal(it.ok, true);
    assert.equal(it.partial, true);
    assert.equal(it.view.technical.lunar, null);
    assert.deepEqual(it.view.technical.missing, ["lunar"]);
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...SEL(MONTHLY4), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 409, "eksik bölümle kayıt yapılmamalı");
  });

  // ═══ G) KAYIT + ARŞİV + RAPOR + YETKİ ════════════════════════════════════════════════════════════
  await t("G: uçtan uca — çalıştır → kaydet → aç (0 istek) → Word + PDF (yöntem, UTC pencere, açı ↔ drishti ayrımı, deklinasyon alanı, özet, tablolar); başka tenant / uzman 404; yorum yetkisi kapalıyken teknik aynı (sağlayıcı yorumu yok)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    await saveExpertNote(ctx, { profileId: pid, technique: "vedic.monthly", noteContext: "ayanamsa:lahiri", sectionKey: "overall", body: "Aylık zamanlama uzman notu", expectedRevision: null });
    const rx = roxy();
    await runAstrology(ctx, { profileId: pid, selections: [SEL(ALL5)] }, rx.deps, { ownerPreviewHideInterp: false });
    const n = rx.calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...SEL(ALL5), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const id = (sv.body as J).analysisId;
    const a = ((await getAnalysis(ctx, id, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a.technical.schema, "astro.vedic.monthly.v1");
    assert.deepEqual(a.params.sections, ALL5);
    assert.equal(a.params.displayTz, "Europe/Istanbul");
    assert.equal(a.technical.aspects.events.length, 58);
    assert.equal(a.technical.natalParallels.parallels.length, 9);
    const rep = buildAstroReport(a as ReportAnalysisInput);
    const txt = reportTexts(rep).join("\n");
    for (const m of [
      "Vedik aylık zamanlama",
      "Şubat 2026",
      "Pencere UTC takvim ayıdır",
      "ASTRONOMİK açılardır",
      "graha drishti",
      "Deklinasyon paralelleri ekliptik boylam açılarından AYRI",
      "Aylık özet",
      "Ay başı konumları",
      "Gezegen burç girişleri",
      "Gezegenler arası açı kesinleşmeleri",
      "Ay açıları",
      "Deklinasyon paralelleri (aylık)",
      "Doğum anı deklinasyonları",
      "Mars Kova (23.02.2026 06:20 UTC)",
      "Oğlak → Kova",
      "23.02.2026 09:20",
      "istasyon",
    ])
      assert.ok(txt.includes(m), `rapor: "${m}" yok`);
    assert.ok(!/undefined|\[object Object\]|NaN|roxy|golden|fixture|vedic-astrology/i.test(txt), "yasak metin");
    const docx = await docxText(await renderAstroReportDocx(rep, null, symbolFontBuffers()));
    const pdf = await pdfText(Buffer.from(buildAstroReportPdf(rep, null, FONT_B64, symbolFontsBase64())));
    for (const m of ["Aylık özet", "Gezegen burç girişleri", "Ay açıları", "Doğum anı deklinasyonları"]) {
      assert.ok(docx.includes(m), `Word: "${m}" yok`);
      assert.ok(pdf.includes(m), `PDF: "${m}" yok`);
    }
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await runAstrology(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), { profileId: pid, selections: [SEL()] }, rx.deps, { ownerPreviewHideInterp: false })).status, 404);
    const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), id, false)).body as J).analysis;
    assert.equal(hidden.technical.ingress.events.length, 16, "teknik yetkisizde de görünür");
    assert.ok(!hidden.interpretation || hidden.interpretation.visible === false || hidden.interpretation.content == null);
  });

  // ═══ H) GÖSTERİM: zaman çizelgesi, filtre, özet, DST ═══════════════════════════════════════════
  await t("H: zaman çizelgesi kronolojik (4 bölüm birleşik); gezegen filtresi (olayın gezegenlerinden biri); tür + yalnız majör filtresi; aylık özet sayıları", () => {
    const def = getTechnique("vedic.monthly")!;
    const parts = [proj("ingress", F.ingress.response), proj("aspects", F.aspects.response), proj("lunar", F.lunar.response), proj("parallels", F.parallels.response)].map((x: J) => x.technical);
    const tech = def.combineTechnical!(parts, SEL().options) as J;
    assert.deepEqual(tech.missing, []);
    assert.deepEqual(tech.window, { year: 2026, month: 2, startUtc: "2026-02-01T00:00", endUtc: "2026-03-01T00:00" });
    const tl = fnOf(M, "monthlyTimeline")(tech);
    assert.equal(tl.length, 16 + 58 + 332 + 15);
    for (let i = 1; i < tl.length; i++) assert.ok(tl[i - 1].atUtc <= tl[i].atUtc, "kronolojik");
    const mars = fnOf(M, "filterTimeline")(tl, { planets: ["mars"], kinds: null, majorOnly: false });
    assert.ok(mars.length > 0 && mars.every((x: J) => x.planets.includes("mars")));
    const major = fnOf(M, "filterTimeline")(tl, { planets: null, kinds: ["aspect", "lunar"], majorOnly: true });
    assert.ok(major.every((x: J) => x.major === true));
    const s = fnOf(M, "monthlySummary")(tech);
    assert.deepEqual(s.counts, { ingress: 16, aspect: 58, lunar: 332, parallel: 15 });
    assert.deepEqual(s.keyIngresses.map((e: J) => e.planet), ["mercury", "venus", "sun", "mars"]);
    assert.equal(s.majorAspects + s.minorAspects, 58);
    assert.equal(s.majorAspects, 9, "Şubat 2026: 4 kavuşum + 3 karşıt + 2 üçgen");
  });

  await t("H DST (GERÇEK Mart 2026 yanıtı): Europe/Berlin — 29.03 01:00 UTC öncesi olay GMT+1, sonrası GMT+2 (olay başına ofset); sağlayıcının tek-ofset (IANA ay başında bir kez) davranışı geçiş sonrası olaylarda 1 saat yanlış olurdu → UTC gönderimi gerekçesi", () => {
    const ev = need(G.ingressMar, "golden Mart").response.transitEvents;
    const before = ev.filter((e: J) => e.datetime < "2026-03-29T01:00:00");
    const after = ev.filter((e: J) => e.datetime >= "2026-03-29T01:00:00");
    assert.ok(before.length > 0 && after.length > 0);
    for (const e of before) assert.equal(formatInZone(e.datetime.slice(0, 16), "Europe/Berlin")!.zone, "GMT+1");
    for (const e of after) {
      const z = formatInZone(e.datetime.slice(0, 16), "Europe/Berlin")!;
      assert.equal(z.zone, "GMT+2");
      const single = new Date(Date.parse(`${e.datetime}Z`) + 3600e3).toISOString();
      assert.notEqual(`${single.slice(8, 10)}.${single.slice(5, 7)}.${single.slice(0, 4)} ${single.slice(11, 16)}`, z.text, "tek ofset doğru çıkmamalı");
    }
    const venus = ev.find((e: J) => e.planet === "Venus" && e.toSign === "Aries");
    assert.equal(formatInZone(venus.datetime.slice(0, 16), "Europe/Istanbul")!.text, "26.03.2026 02:39");
  });

  // ═══ I) AYRIM + KB + UI ═════════════════════════════════════════════════════════════════════════
  await t("I: astronomik açı ≠ graha drishti — yöntem metni ayrımı açıkça yazar; KB bağlamı vedic_monthly (drishti bağlamı vedic_drishti DEĞİL); konu anahtarları DB regex'ine uyar; deklinasyon ayrı konu türü; KB otomatik dolmaz", () => {
    assert.ok(/ASTRONOMİK/.test(M.ASPECT_VS_DRISHTI_TEXT) && /graha drishti/.test(M.ASPECT_VS_DRISHTI_TEXT) && /AYRI/.test(M.ASPECT_VS_DRISHTI_TEXT));
    assert.ok(/AYRI/.test(M.DECLINATION_TEXT) && /deklinasyon/i.test(M.DECLINATION_TEXT));
    assert.equal(TECHNIQUE_TOPIC_CONTEXT["vedic.monthly"], "vedic_monthly");
    assert.notEqual(TECHNIQUE_TOPIC_CONTEXT["vedic.monthly"], TECHNIQUE_TOPIC_CONTEXT["vedic.drishti"]);
    const def = getTechnique("vedic.monthly")!;
    const parts = [proj("ingress", F.ingress.response), proj("aspects", F.aspects.response), proj("parallels", F.parallels.response)].map((x: J) => x.technical);
    const tech = def.combineTechnical!(parts, SEL(["ingress", "aspects", "parallels"]).options);
    const keys = topicsForTechnique("vedic.monthly", tech).map((x) => x.key);
    assert.ok(keys.includes("monthly_ingress:mars:aquarius"), keys.slice(0, 8).join());
    assert.ok(keys.includes("monthly_aspect:conjunction"));
    assert.ok(keys.includes("monthly_declination:parallel"));
    assert.ok(!keys.some((k) => k.startsWith("drishti")), "drishti konusu üretilmemeli");
    for (const k of keys) assert.match(k, /^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$/);
    assert.equal(new Set(keys).size, keys.length);
  });

  await t("I: UI — listede; varsayılan ay = bu ay (İstanbul), 4 aylık bölüm, displayTz; bölüm yoksa plana alınmaz (neden); özet Türkçe; Yakında maddeleri (Aylık Vedik Transitler / Aylık Gezegen Açıları / Ay Açıları / Deklinasyon Paralelleri) düşer", () => {
    assert.ok((UI.UI_TECHNIQUES as readonly string[]).includes("vedic.monthly"));
    assert.equal(UI.TECHNIQUE_META["vedic.monthly" as UI.UiTechniqueId].needsTime, false);
    const p = UI.defaultParams(new Date("2026-02-10T09:00:00Z"));
    const m = { houseSystem: "placidus", nodeType: "true" } as J;
    assert.deepEqual(UI.buildSelections({ "vedic.monthly": true } as J, p, m), [{ technique: "vedic.monthly", options: { year: 2026, month: 2, sections: MONTHLY4, ayanamsa: "lahiri", displayTz: "Europe/Istanbul" } }]);
    assert.deepEqual(UI.buildSelections({ "vedic.monthly": true } as J, { ...p, vedicMonthlySections: [] } as J, m), []);
    assert.equal(UI.missingReason("vedic.monthly" as UI.UiTechniqueId, { ...p, vedicMonthlySections: [] } as J), "en az bir aylık takvim bölümü seçin");
    assert.equal(UI.dateInputReason("vedic.monthly" as UI.UiTechniqueId, { ...p, vedicMonthlyYear: 1500 } as J), "takvim ayını tamamlayın (1600–2600)");
    assert.equal(UI.describeOptions("vedic.monthly", SEL(ALL5).options), "Şubat 2026 (UTC ayı) · burç girişleri · açılar · Ay açıları · deklinasyon · doğum anı deklinasyonları · Lahiri · Europe/Istanbul");
    assert.deepEqual(getTechnique("vedic.monthly")!.parseOptions(UI.buildSelections({ "vedic.monthly": true } as J, p, m)[0].options, new Date()), SEL().options);
    for (const k of ["Aylık Vedik Transitler", "Aylık Gezegen Açıları", "Ay Açıları"]) assert.equal(SOON.COMING_SOON_AVAILABLE_AS[k], "vedic.monthly", k);
    // "Deklinasyon Paralelleri" (Batı + Vedik bölümünde aynı ad): Batı aylık paralel tekniği (#526) de varsa ona eşlenir; madde her durumda düşer.
    assert.ok(["vedic.monthly", "western.declination_parallels"].includes(String(SOON.COMING_SOON_AVAILABLE_AS["Deklinasyon Paralelleri"])), "Deklinasyon Paralelleri");
    const v = SOON.visibleComingSoonSections([{ title: "Vedik Transit", items: ["Sidereal Gezegen Efemerisleri", "Aylık Vedik Transitler", "Ay Açıları", "Ekliptik Geçişleri"] }], SOON.AVAILABLE_TECHNIQUES);
    assert.deepEqual(v[0].items, ["Sidereal Gezegen Efemerisleri", "Ekliptik Geçişleri"]);
  });

  await t("statik: yeni kullanıcı metinlerinde sağlayıcı adı / 'golden' / 'fixture' / ham uç adı yok; istemci bileşeni sağlayıcı istemcisini içe aktarmaz", () => {
    for (const f of ["app/admin/astroloji/_components/VedicMonthlyPanel.tsx", "app/admin/astroloji/_components/VedicMonthlyFields.tsx", "lib/astrology/model/vedicMonthly.ts", "lib/astrology/report/vedicMonthlyReport.ts"]) {
      assert.ok(existsSync(join(process.cwd(), f)), `${f} yok`);
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(/["`>]([^"`<\n]{8,})["`<]/g)) assert.ok(!/\broxy\b|golden|fixture|vedic-astrology\/|aspects\/lunar|parallels\/monthly/i.test(m[1]), `${f}: ${m[1]}`);
      if (f.startsWith("app/")) assert.ok(!/providers\/roxy|lib\/roxy/.test(src), `${f}: sağlayıcı içe aktarımı`);
    }
  });

  // ═══ R) GERÇEK SAĞLAYICI YANITI (golden, 23.10.2026) ═════════════════════════════════════════════════
  const projG = (section: string, g: J) => fnOf(P, "projectRoxyVedicMonthlySection")(section, g.response, g.body);
  const SECT_OF: Record<string, string> = { ingress: "ingress", aspects: "aspects", lunar: "lunar", parallels: "parallels", natal: "natal_parallels", ingressMar: "ingress", ingressDec: "ingress" };

  await t("R0: 7 gerçek yanıt golden klasöründe (Şubat 5 + EK TUR Mart / Aralık burç girişleri); dev-fake-backend okuyucu alanları (endpoint, query=null, body, response) var; gövde = ürün gövdesi = şema örneği gövdesi (golden önce eşleşir); anahtar / gizli bilgi yok", () => {
    const body = fnOf(P, "vedicMonthlyBody");
    const ROX = need(P.ROXY_VEDIC_MONTHLY, "ROXY_VEDIC_MONTHLY");
    for (const [k, g] of Object.entries(G)) {
      need(g, `golden ${k}`);
      assert.equal(g._kaynak, "gercek-saglayici-yaniti-2026-10-23", k);
      assert.ok(typeof g.endpoint === "string" && g.query === null && g.body && g.response, `${k}: okuyucu alanları`);
      assert.equal(g.endpoint, ROX[SECT_OF[k]].endpoint, k);
      assert.equal(canon(g.body), canon(F[k as keyof typeof F].body), `${k}: şema örneği ile aynı gövde`);
      assert.ok(!/apiKey|x-api-key|Bearer/i.test(JSON.stringify(g)), `${k}: gizli bilgi`);
    }
    for (const k of ["ingress", "aspects", "lunar", "parallels"] as const) assert.deepEqual(G[k].body, body(k, 2026, 2), k);
    assert.deepEqual(G.natal.body, fnOf(P, "vedicNatalParallelsBody")(BIRTH_A));
    assert.deepEqual(G.ingressMar.body, body("ingress", 2026, 3), "Mart");
    assert.deepEqual(G.ingressDec.body, body("ingress", 2026, 12), "Aralık");
  });

  await t("R1 projeksiyon: 5 bölüm (+ EK TUR Mart / Aralık burç girişleri) ok, eşlenmemiş alan 0, atlanan değer 0; sayımlar 16 giriş · 58 açı · 332 Ay açısı · 27 paralel (15 paralel + 12 kontraparalel) · doğum anı 7 gezegen / 9 temas; ay başı 9 graha (Rahu 316,3061 · Ketu 136,3061)", () => {
    const r = Object.fromEntries(Object.entries(G).map(([k, g]) => [k, projG(SECT_OF[k], g)]));
    for (const [k, x] of Object.entries(r)) {
      assert.equal(x.ok, true, `${k}: ${String(JSON.stringify(x.errors ?? null)).slice(0, 300)}`);
      assert.deepEqual(x.unmappedFields, [], k);
      assert.deepEqual(x.droppedValues ?? [], [], k);
      assert.equal(x.interpretation, null, k);
    }
    assert.equal(r.ingress.technical.events.length, 16);
    assert.equal(r.ingress.technical.start.length, 9);
    assert.deepEqual(r.ingress.technical.start.filter((s: J) => s.planet === "rahu" || s.planet === "ketu").map((s: J) => [s.planet, s.sign, s.longitude]), [["rahu", "aquarius", 316.3061], ["ketu", "leo", 136.3061]]);
    assert.deepEqual(r.ingress.technical.events.find((e: J) => e.planet === "mars"), { atUtc: "2026-02-23T06:20", planet: "mars", from: "capricorn", to: "aquarius", retrograde: false });
    assert.equal(r.aspects.technical.events.length, 58);
    assert.equal(r.lunar.technical.events.length, 332);
    assert.equal(r.parallels.technical.events.length, 27);
    assert.equal(r.parallels.technical.events.filter((e: J) => e.type === "parallel").length, 15);
    assert.equal(r.parallels.technical.events.filter((e: J) => e.type === "contraparallel").length, 12);
    assert.deepEqual(r.parallels.technical.events.find((e: J) => e.a === "mercury" && e.b === "saturn"), { atUtc: "2026-02-22T17:37", a: "mercury", b: "saturn", type: "parallel", orb: 0, decA: G.parallels.response.events[24].dec1, decB: G.parallels.response.events[24].dec2 });
    assert.equal(r.natal.technical.planets.length, 7);
    assert.equal(r.natal.technical.parallels.length, 9);
    assert.ok(r.parallels.technical.events.every((e: J) => !["rahu", "ketu"].includes(e.a) && !["rahu", "ketu"].includes(e.b)), "aylık paralel kapsamı 7 görünür gezegen");
  });

  await t("R2 açı adları + orb + Rahu/Ketu: gerçek 22 açı adı (kısa çizgili İngilizce; lang=tr'de aspect alanı yerelleşmez) adaptör listesiyle birebir; tüm olaylarda orb 0 (tam kesinleşme); Rahu/Ketu gezegen açılarında 20, Ay açılarında 90 olay — projeksiyonda korunur", () => {
    const raw = [...G.aspects.response.events, ...G.lunar.response.events];
    assert.deepEqual([...new Set(raw.map((e: J) => e.aspect))].sort(), [...REAL_ASPECT_NAMES].sort());
    assert.deepEqual(REAL_ASPECT_NAMES.map((n) => n.replace(/-/g, "_")).sort(), [...M.MONTHLY_ASPECT_IDS].sort(), "22 ad ↔ 22 kimlik");
    assert.ok(raw.every((e: J) => !("aspectLocalized" in e)), "açı adı yerelleştirilmiyor");
    assert.ok(raw.every((e: J) => e.orb === 0), "orb 0");
    const rk = (p: string) => p === "rahu" || p === "ketu";
    const a = projG("aspects", G.aspects).technical.events;
    const l = projG("lunar", G.lunar).technical.events;
    assert.equal(a.filter((e: J) => rk(e.a) || rk(e.b)).length, 20);
    assert.equal(l.filter((e: J) => rk(e.planet)).length, 90);
    assert.ok(a.every((e: J) => e.orb === 0) && l.every((e: J) => e.orb === 0));
    assert.equal(new Set(a.map((e: J) => e.aspect)).size, 16, "Şubat 2026 gezegenler arası 16 farklı açı türü");
    assert.equal(new Set(l.map((e: J) => e.aspect)).size, 22, "Ay açılarında 22 türün hepsi");
  });

  await t("R3 *Localized sızmaz: ham yanıtta yerelleştirilmiş adlar var (ör. 'Kuzey Düğümü' / 'Güney Düğümü'); teknik veride, zaman çizelgesinde ve Word/PDF metin modelinde YOK (Türkçe etiketler Yaşam sözlüğünden: Rahu / Ketu)", () => {
    const rawTxt = JSON.stringify([G.ingress, G.aspects, G.lunar, G.parallels].map((g) => g.response));
    assert.ok(rawTxt.includes("Localized") && rawTxt.includes("Kuzey Düğümü") && rawTxt.includes("Güney Düğümü"));
    const def = getTechnique("vedic.monthly")!;
    const parts = (["ingress", "aspects", "lunar", "parallels"] as const).map((k) => projG(k, G[k]).technical);
    const tech = def.combineTechnical!(parts, SEL().options) as J;
    const techTxt = JSON.stringify(tech);
    assert.ok(!/Localized|Düğümü/.test(techTxt), "teknik veri");
    const tl = fnOf(M, "monthlyTimeline")(tech);
    assert.ok(!tl.some((x: J) => /Düğümü/.test(x.text)) && tl.some((x: J) => /Ketu/.test(x.text)) && tl.some((x: J) => /Rahu/.test(x.text)), "zaman çizelgesi");
  });

  await t("R4 natal: datetime YEREL ('1990-07-15T14:30:00' = istek saati, +3); AE deklinasyonları 11:30 UTC'de ≤0,002° (14:30 UTC varsayımında Ay > 0,1° sapar); orb 2 ondalık = |d1∓d2| ±0,005; 7 görünür gezegen, Rahu/Ketu yok", () => {
    const n = G.natal.response;
    assert.equal(n.datetime, "1990-07-15T14:30:00");
    assert.equal(projG("natal_parallels", G.natal).technical.atLocal, "1990-07-15T14:30:00");
    const local = Date.parse("1990-07-15T11:30:00Z");
    for (const p of n.planets) assert.ok(Math.abs(aeDec(p.name.toLowerCase(), local).dec - p.declination) <= 0.002, `${p.name} dec`);
    const moon = n.planets.find((p: J) => p.name === "Moon");
    assert.ok(Math.abs(aeDec("moon", Date.parse("1990-07-15T14:30:00Z")).dec - moon.declination) > 0.1, "UTC varsayımı tutmamalı");
    for (const x of n.parallels) assert.ok(Math.abs((x.type === "parallel" ? Math.abs(x.dec1 - x.dec2) : Math.abs(x.dec1 + x.dec2)) - x.orb) <= 0.005, `${x.planet1}-${x.planet2}`);
    assert.deepEqual(n.planets.map((p: J) => p.name).sort(), ["Jupiter", "Mars", "Mercury", "Moon", "Saturn", "Sun", "Venus"]);
  });

  // Bağımsız denetim alt kümesi (sağlayıcı verisi DEĞİŞTİRİLMEZ). Ayanamsa: ay başı 7 görünür gezegenden türetilir (AE gerçek tropikal −
  // sağlayıcı sidereal); ay içindeki değişim Lahiri (ortalama çapalar + nütasyon) farkıyla taşınır.
  const lahiriTrue = (ms: number) => lahiriMean(ms) + A.e_tilt(A.MakeTime(new Date(ms))).dpsi / 3600;
  const tropOf = (p: string, ms: number) => n360(aeSid(p, ms) + lahiriTrue(ms));
  const MS0 = Date.parse("2026-02-01T00:00:00Z");
  const ayDerived = () => {
    const v = G.ingress.response.startingPositions.filter((s: J) => BODY[s.planet.toLowerCase()]).map((s: J) => n360(tropOf(s.planet.toLowerCase(), MS0) - s.longitude)).sort((x: number, y: number) => x - y);
    return { med: v[(v.length - 1) >> 1], spread: v[v.length - 1] - v[0], n: v.length };
  };
  const sidR = (p: string, ms: number, ay0: number) => (p === "rahu" || p === "ketu" ? NaN : n360(tropOf(p, ms) - (ay0 + lahiriTrue(ms) - lahiriTrue(MS0))));

  await t("R5 BAĞIMSIZ ayanamsa tutarlılığı: ay başı 7 görünür gezegenden türetilen ayanamsa medyanı 24,2237° ±0,002, yayılım ≤0,005°; Lahiri (gerçek) ile fark ≤0,005°", () => {
    const d = ayDerived();
    assert.equal(d.n, 7);
    assert.ok(Math.abs(d.med - 24.2237) <= 0.002, `medyan ${d.med.toFixed(4)}`);
    assert.ok(d.spread <= 0.005, `yayılım ${d.spread.toFixed(4)}`);
    assert.ok(Math.abs(d.med - lahiriTrue(MS0)) <= 0.005, `Lahiri ${lahiriTrue(MS0).toFixed(4)}`);
  });

  await t("R6 BAĞIMSIZ burç girişleri: 16/16 olayda sınır geçişi (ikiye bölme) sağlayıcı anından ≤2 dk; önce/sonra burç ve hareket yönü tutarlı", () => {
    const ay0 = ayDerived().med;
    let worst = 0;
    for (const e of G.ingress.response.transitEvents) {
      const id = e.planet.toLowerCase();
      const ms = Date.parse(`${e.datetime}Z`);
      const bound = SIGNS.indexOf(e.isRetrograde ? e.fromSign.toLowerCase() : e.toSign.toLowerCase()) * 30;
      const f = (x: number) => ((((sidR(id, x, ay0) - bound) % 360) + 540) % 360) - 180;
      let lo = ms - 3 * 3600e3;
      let hi = ms + 3 * 3600e3;
      assert.ok(Math.sign(f(lo)) !== Math.sign(f(hi)), `${id} ${e.datetime}: aralıkta geçiş yok`);
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid;
        else hi = mid;
      }
      const dm = Math.abs(lo - ms) / 60e3;
      worst = Math.max(worst, dm);
      assert.ok(dm <= 2, `${id} ${e.datetime}: ${dm.toFixed(2)} dk`);
    }
    assert.ok(worst <= 2);
  });

  await t("R7 BAĞIMSIZ açılar (Rahu/Ketu hariç: gezegenler arası 38, Ay 242): olay anında boylamlar ≤0,01°, |ayrım − açı| ≤ 0,01° + göreli hız × 1 dk; Rahu/Ketu olayları (20 + 90) bağımsız doğrulanmadı — yalnız iç tutarlılık (adaptör)", () => {
    const ay0 = ayDerived().med;
    const ang = Object.fromEntries((M.MONTHLY_ASPECTS ?? []).map((x: J) => [x.id, x.angle]));
    const rk = (p: string) => p === "rahu" || p === "ketu";
    let nA = 0;
    let nL = 0;
    let skipped = 0;
    for (const [g, k1, k2, l1, l2] of [[G.aspects, "planet1", "planet2", "planet1Longitude", "planet2Longitude"], [G.lunar, null, "planet", "moonLongitude", "planetLongitude"]] as const) {
      for (const e of g.response.events) {
        const a = k1 ? e[k1].toLowerCase() : "moon";
        const b = e[k2].toLowerCase();
        if (rk(a) || rk(b)) {
          skipped++;
          continue;
        }
        const ms = Date.parse(`${e.datetime}Z`);
        const la = sidR(a, ms, ay0);
        const lb = sidR(b, ms, ay0);
        assert.ok(sep(la, e[l1]) <= 0.01 && sep(lb, e[l2]) <= 0.01, `${a}-${b} ${e.datetime}: boylam ${la.toFixed(4)}/${e[l1]} ${lb.toFixed(4)}/${e[l2]}`);
        const rel = Math.abs(speed(a, ms) - speed(b, ms)) / 1440;
        assert.ok(Math.abs(sep(la, lb) - ang[e.aspect.replace(/-/g, "_")]) <= 0.01 + rel, `${a}-${b} ${e.aspect} ${e.datetime}`);
        if (k1) nA++;
        else nL++;
      }
    }
    assert.deepEqual([nA, nL, skipped], [38, 242, 110]);
  });

  await t("R8 BAĞIMSIZ deklinasyon paralelleri: 27/27 olayda dec1/dec2 AE ±0,005°; olay anında |d1∓d2| ≤ 0,005° + göreli deklinasyon hızı × 3 dk (dakika hassasiyetinde kesinleşme; günlük örnekleme DEĞİL) → ekran metni bunu söyler", () => {
    for (const e of G.parallels.response.events) {
      const ms = Date.parse(`${e.datetime}Z`);
      const p1 = e.planet1.toLowerCase();
      const p2 = e.planet2.toLowerCase();
      const d1 = aeDec(p1, ms).dec;
      const d2 = aeDec(p2, ms).dec;
      assert.ok(Math.abs(d1 - e.dec1) <= 0.005 && Math.abs(d2 - e.dec2) <= 0.005, `${p1}-${p2} ${e.datetime}: dec`);
      const v = (p: string) => Math.abs(aeDec(p, ms + 3600e3).dec - aeDec(p, ms - 3600e3).dec) / 120; // °/dk
      const miss = e.type === "parallel" ? Math.abs(d1 - d2) : Math.abs(d1 + d2);
      assert.ok(miss <= 0.005 + (v(p1) + v(p2)) * 3, `${p1}-${p2} ${e.datetime}: |d1∓d2| ${miss.toFixed(4)}`);
    }
    assert.ok(!/günlük|12:00 UTC|gün hassasiyetinde/.test(M.PARALLELS_SAMPLING_TEXT) && /dakika hassasiyetindeki/.test(M.PARALLELS_SAMPLING_TEXT), "ekran / rapor metni gerçek davranışla uyumlu");
  });

  await t("R9 uçtan uca GERÇEK yanıtlarla: 5 istek → 2. çalıştırma 0; kaydet → aç 0 istek; özet 16 / 58 (majör 9 · minör 49) / 332 / 27 (paralel 15 · kontraparalel 12); zaman çizelgesi 433; Word/PDF + rapor metninde yerelleştirilmiş ad / sağlayıcı adı yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy(undefined, G);
    const r = (await runAstrology(ctx, { profileId: pid, selections: [SEL(ALL5)] }, rx.deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(r.results[0].ok, true, JSON.stringify(r).slice(0, 400));
    assert.ok(!r.results[0].partial, "kısmi olmamalı");
    assert.equal(rx.calls.length, 5);
    await runAstrology(ctx, { profileId: pid, selections: [SEL(ALL5)] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(rx.calls.length, 5, "2. çalıştırma istek yaptı");
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...SEL(ALL5), includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, 5, "kayıtlı analizi açmak sağlayıcı çağırdı");
    const s = fnOf(M, "monthlySummary")(a.technical);
    assert.deepEqual(s.counts, { ingress: 16, aspect: 58, lunar: 332, parallel: 27 });
    assert.deepEqual([s.majorAspects, s.minorAspects, s.parallels, s.contraparallels, s.moonIngresses], [9, 49, 15, 12, 12]);
    assert.deepEqual(s.keyIngresses.map((e: J) => e.planet), ["mercury", "venus", "sun", "mars"]);
    assert.equal(fnOf(M, "monthlyTimeline")(a.technical).length, 433);
    const rep = buildAstroReport(a as ReportAnalysisInput);
    const txt = reportTexts(rep).join("\n");
    for (const m of ["Deklinasyon olayı", "27 (paralel 15 · kontraparalel 12)", "58 (majör 9 · minör 49)", "22.02.2026 17:37", "Merkür – Satürn", "dakika hassasiyetindeki", "Ketu", "Mars Kova (23.02.2026 06:20 UTC)"])
      assert.ok(txt.includes(m), `rapor: "${m}" yok`);
    assert.ok(!/Düğümü|Localized|undefined|NaN|roxy|golden|fixture|vedic-astrology|12:00 UTC örneklemesi/i.test(txt), "yasak metin");
    const docx = await docxText(await renderAstroReportDocx(rep, null, symbolFontBuffers()));
    const pdf = await pdfText(Buffer.from(buildAstroReportPdf(rep, null, FONT_B64, symbolFontsBase64())));
    for (const m of ["27 (paralel 15 · kontraparalel 12)", "Doğum anı deklinasyonları"]) {
      assert.ok(docx.includes(m), `Word: "${m}" yok`);
      assert.ok(pdf.includes(m), `PDF: "${m}" yok`);
    }
    assert.ok(!/Düğümü/.test(docx) && !/Düğümü/.test(pdf));
  });

  // ═══ R10) EK TUR — Mart + Aralık 2026 burç girişleri (GERÇEK yanıt, 23.10.2026) ═════════════════════════════
  await t("R10 EK TUR gerçek Mart / Aralık 2026 burç girişleri: projeksiyon ok (eşlenmemiş 0); Mart 17 olay (Rahu/Ketu 0), Aralık 19 olay (Rahu/Ketu 2: 05.12.2026 17:02 UTC Kova→Oğlak / Aslan→Yengeç, geri); şema örneğinden tek an farkı Ay Oğlak→Kova 16.03 12:44 (şema 12:45); BAĞIMSIZ: ay başı ayanamsa yayılımı ≤0,005°, Rahu/Ketu dışı 34 olayda sınır geçişi ≤2 dk", () => {
    const mar = need(G.ingressMar, "golden Mart");
    const dec = need(G.ingressDec, "golden Aralık");
    const rk = (p: string) => p === "rahu" || p === "ketu";
    const pm = projG("ingress", mar);
    const pd = projG("ingress", dec);
    for (const [k, x] of [["Mart", pm], ["Aralık", pd]] as const) {
      assert.equal(x.ok, true, `${k}: ${String(JSON.stringify(x.errors ?? null)).slice(0, 300)}`);
      assert.deepEqual(x.unmappedFields, [], k);
      assert.deepEqual(x.droppedValues ?? [], [], k);
      assert.equal(x.technical.start.length, 9, k);
    }
    assert.equal(pm.technical.events.length, 17);
    assert.equal(pm.technical.events.filter((e: J) => rk(e.planet)).length, 0);
    assert.equal(pd.technical.events.length, 19);
    assert.deepEqual(pd.technical.events.filter((e: J) => rk(e.planet)), [
      { atUtc: "2026-12-05T17:02", planet: "rahu", from: "aquarius", to: "capricorn", retrograde: true },
      { atUtc: "2026-12-05T17:02", planet: "ketu", from: "leo", to: "cancer", retrograde: true },
    ]);
    // Şema örneğiyle karşılaştırma (gerçek veri esas): olay listesi aynı; tek dakika farkı Ay 16.03.
    const diff = mar.response.transitEvents.map((e: J, i: number) => [e, F.ingressMar.response.transitEvents[i]]).filter(([a, b]: J) => a.datetime !== b.datetime || a.planet !== b.planet);
    assert.deepEqual(diff.map(([a, b]: J) => [a.planet, a.datetime, b.datetime]), [["Moon", "2026-03-16T12:44:00", "2026-03-16T12:45:00"]]);
    assert.deepEqual(dec.response.transitEvents.map((e: J) => `${e.planet} ${e.datetime}`), F.ingressDec.response.transitEvents.map((e: J) => `${e.planet} ${e.datetime}`));
    // Bağımsız: ay başı ayanamsa (7 görünür gezegen) + sınır geçişi (ikiye bölme). Rahu/Ketu bağımsız doğrulanmaz (düğüm modeli farkı).
    let checked = 0;
    for (const [g, y, m] of [[mar, 2026, 3], [dec, 2026, 12]] as const) {
      const ms0 = Date.UTC(y, m - 1, 1);
      const v = g.response.startingPositions.filter((s: J) => BODY[s.planet.toLowerCase()]).map((s: J) => n360(tropOf(s.planet.toLowerCase(), ms0) - s.longitude)).sort((a: number, b: number) => a - b);
      const ay0 = v[(v.length - 1) >> 1];
      assert.equal(v.length, 7, `${m}: görünür gezegen`);
      assert.ok(v[v.length - 1] - v[0] <= 0.005, `${m}: ayanamsa yayılımı ${(v[v.length - 1] - v[0]).toFixed(4)}`);
      assert.ok(Math.abs(ay0 - lahiriTrue(ms0)) <= 0.005, `${m}: Lahiri farkı ${(ay0 - lahiriTrue(ms0)).toFixed(4)}`);
      const sidM = (p: string, ms: number) => n360(tropOf(p, ms) - (ay0 + lahiriTrue(ms) - lahiriTrue(ms0)));
      for (const e of g.response.transitEvents) {
        const id = e.planet.toLowerCase();
        if (rk(id)) continue;
        const ms = Date.parse(`${e.datetime}Z`);
        const bound = SIGNS.indexOf(e.isRetrograde ? e.fromSign.toLowerCase() : e.toSign.toLowerCase()) * 30;
        const f = (x: number) => ((((sidM(id, x) - bound) % 360) + 540) % 360) - 180;
        let lo = ms - 3 * 3600e3;
        let hi = ms + 3 * 3600e3;
        assert.ok(Math.sign(f(lo)) !== Math.sign(f(hi)), `${id} ${e.datetime}: aralıkta geçiş yok`);
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid;
          else hi = mid;
        }
        assert.ok(Math.abs(lo - ms) / 60e3 <= 2, `${id} ${e.datetime}: ${(Math.abs(lo - ms) / 60e3).toFixed(2)} dk`);
        checked++;
      }
    }
    assert.equal(checked, 34, "17 Mart + 17 Aralık (Rahu/Ketu hariç)");
  });

  console.log(`\nvedik-aylik: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
