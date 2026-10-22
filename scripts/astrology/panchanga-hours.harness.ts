/**
 * ATLAS YENİ TEKNİKLER (2026-10-22) — Janma Panchanga "Gezegen saatleri (Hora) + Choghadiya" SEÇENEĞİ harness'i.
 *   • golden (2 gerçek çağrı: İstanbul 2026-11-01, +3 — #498 ayrıntılı Panchanga ile AYNI gün/konum) ile projeksiyon
 *   • BAĞIMSIZ doğrulama: astronomy-engine gün doğumu/batımı → hora = gündüz/12, gece/12 (Kaldani sırası gün yöneticisinden);
 *     choghadiya = gündüz/8, gece/8 (7 günlük klasik sıra tablosu, burada ELLE yazılmış) — her sınır ±1 dk
 *   • fail-closed, kutup engeli (istek 0), plan (yeni istek sayısı), önbellek (2. çalıştırma 0 istek), kayıt + arşiv (0 istek),
 *     rapor (Word/PDF metin işaretleri), yetki (başka tenant / uzman 404; yorum kapısı), seçenek kapalıyken gövde/anahtar SABİT HASH
 * Gerçek sağlayıcı / gerçek DB YOK. Modüller ad alanıyla içe aktarılır (eski kodda testler çökmeden FAIL verir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/panchanga-hours.harness.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import * as RQ from "@/lib/astrology/providers/roxy/requests";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import * as UI from "@/app/admin/astroloji/_lib/techniques";
import * as SOON from "@/app/admin/astroloji/_lib/comingSoon";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const DIR = join(__dirname, "fixtures", "golden");
const has = (n: string) => existsSync(join(DIR, `${n}.json`));
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const FP = load("vedic-panchang");
const PD = has("vedic-panchang-detailed") ? load("vedic-panchang-detailed") : null;
const HO = has("vedic-panchang-hora") ? load("vedic-panchang-hora") : null;
const CH = has("vedic-panchang-choghadiya") ? load("vedic-panchang-choghadiya") : null;
const DATE = "2026-11-01";
/** Seçenek kapalıyken (ve yalnız Ayrıntılı Panchanga ile) birimlerin girdi özetleri — #498 tabanındaki değerler (sabit). */
const BASE_HASH = "521c3cc26831129707b4b341c4c27d7e90a7721f1681b00c7c33b151b2faef82";
const DETAIL_HASH = "8449f517e5ee94d600d2a022a5b10de6ee3475d628c305f327cf41e4a1429031";

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
async function mod(): Promise<J> {
  try {
    return await import("@/lib/astrology/providers/roxy/panchangaHours");
  } catch {
    return {};
  }
}
const fnOf = (o: J, k: string) => {
  assert.equal(typeof o?.[k], "function", `${k} dışa aktarılmamış (eski kod)`);
  return o[k];
};
const OPTS = { date: DATE, latitude: 41.0082, longitude: 28.9784, utcOffsetHours: 3, label: "İstanbul, Türkiye" };
const tamper = (raw: J, f: (r: J) => void) => {
  const r = structuredClone(raw);
  f(r);
  return r;
};
const ms = (s: string) => Date.parse(`${s}Z`);

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
async function profile(ctx: EngineCtx): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, (id) => (id === ISTANBUL.id ? ISTANBUL : null));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as J)[k])}`).join(",")}}`;
function roxy() {
  const calls: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-ph", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push(endpoint);
      const g = [FP, PD, HO, CH].filter(Boolean).find((x: J) => x.endpoint === endpoint && canon(x.body) === canon(body));
      return g ? { ok: true, raw: structuredClone(g.response), attempts: 1 } : { ok: false, kind: "bad_request", status: 400, attempts: 1 };
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

// ── Bağımsız referans: 7 günlük klasik choghadiya tablosu (Pazar → Cumartesi), sağlayıcıdan ve adaptörden BAĞIMSIZ yazıldı ──
const CHOG_DAY_TABLE = [
  ["udveg", "char", "labh", "amrit", "kaal", "shubh", "rog", "udveg"],
  ["amrit", "kaal", "shubh", "rog", "udveg", "char", "labh", "amrit"],
  ["rog", "udveg", "char", "labh", "amrit", "kaal", "shubh", "rog"],
  ["labh", "amrit", "kaal", "shubh", "rog", "udveg", "char", "labh"],
  ["shubh", "rog", "udveg", "char", "labh", "amrit", "kaal", "shubh"],
  ["char", "labh", "amrit", "kaal", "shubh", "rog", "udveg", "char"],
  ["kaal", "shubh", "rog", "udveg", "char", "labh", "amrit", "kaal"],
];
const CHOG_NIGHT_TABLE = [
  ["shubh", "amrit", "char", "rog", "kaal", "labh", "udveg", "shubh"],
  ["char", "rog", "kaal", "labh", "udveg", "shubh", "amrit", "char"],
  ["kaal", "labh", "udveg", "shubh", "amrit", "char", "rog", "kaal"],
  ["udveg", "shubh", "amrit", "char", "rog", "kaal", "labh", "udveg"],
  ["amrit", "char", "rog", "kaal", "labh", "udveg", "shubh", "amrit"],
  ["rog", "kaal", "labh", "udveg", "shubh", "amrit", "char", "rog"],
  ["labh", "udveg", "shubh", "amrit", "char", "rog", "kaal", "labh"],
];
const CHALDEAN = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"]; // yavaştan hızlıya (klasik Kaldani dizisi)
const WEEKDAY_LORD = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

async function main() {
  const H = await mod();
  const projH = (raw: J, o: Partial<typeof OPTS> = {}) => fnOf(H, "projectRoxyVedicHora")(raw, { ...OPTS, ...o });
  const projC = (raw: J, o: Partial<typeof OPTS> = {}) => fnOf(H, "projectRoxyVedicChoghadiya")(raw, { ...OPTS, ...o });

  await t("golden: hora + choghadiya fixture gövdesi = ürün gövdesi (Ayrıntılı Panchanga ile AYNI üretici: gün + konum + ofset); kişi/anahtar izi yok", () => {
    const h = need(HO, "hora golden");
    const c = need(CH, "choghadiya golden");
    assert.equal(h.endpoint, "/vedic-astrology/panchang/hora");
    assert.equal(c.endpoint, "/vedic-astrology/panchang/choghadiya");
    const body = RQ.vedicPanchangDetailedBody(DATE, { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude }, 3);
    assert.deepEqual(h.body, body);
    assert.deepEqual(c.body, body);
    assert.deepEqual(h.body, need(PD, "ayrıntılı golden").body, "gün/konum #498 ile aynı");
    for (const g of [h, c]) assert.ok(!/apiKey|x-api-key|Ali Örnek|1990-07-15/i.test(JSON.stringify(g)));
    assert.equal(fnOf(H, "projectRoxyVedicHora") && H.ROXY_VEDIC_HORA.endpoint, "/vedic-astrology/panchang/hora");
  });

  await t("projeksiyon hora: 12 + 12 dilim, gün yöneticisi Güneş (Pazar), 07:35 → 08:27 Güneş, gece 12. dilim 07:36 biter; eşlenmemiş alan yok", () => {
    const r = projH(need(HO, "golden").response);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const d = r.technical;
    assert.equal(d.schema, "astro.vedic.panchanga.hora.v1");
    assert.equal(d.dayLord, "sun");
    assert.equal(d.day.length, 12);
    assert.equal(d.night.length, 12);
    assert.deepEqual(d.day[0], { n: 1, lord: "sun", start: "2026-11-01T07:35:00", end: "2026-11-01T08:27:00" });
    assert.equal(d.night[11].end, "2026-11-02T07:36:00");
    assert.deepEqual(r.unmappedFields, []);
  });

  await t("projeksiyon choghadiya: 8 + 8 dilim, ad · yönetici · sağlayıcı sınıfı (olumlu/olumsuz) korunur", () => {
    const r = projC(need(CH, "golden").response);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const d = r.technical;
    assert.equal(d.day.length, 8);
    assert.equal(d.night.length, 8);
    assert.deepEqual(d.day[3], { n: 4, name: "amrit", lord: "moon", effect: "good", start: "2026-11-01T11:29:00", end: "2026-11-01T12:47:00" });
    assert.deepEqual(d.night.map((x: J) => x.effect), CH.response.nightChoghadiya.map((x: J) => (x.effect === "Good" ? "good" : "bad")));
    assert.deepEqual(r.unmappedFields, []);
  });

  await t("BAĞIMSIZ (astronomy-engine + klasik tablo): hora gündüz/12 · gece/12, Kaldani sırası gün yöneticisinden; choghadiya gündüz/8 · gece/8, 7 günlük tablo — her sınır ±1 dk", () => {
    const h = projH(need(HO, "golden").response).technical;
    const c = projC(need(CH, "golden").response).technical;
    const ob = new Astronomy.Observer(41.0082, 28.9784, 0);
    const local = (d: Date) => d.getTime() + 3 * 3600e3;
    const rise = local(Astronomy.SearchRiseSet(Astronomy.Body.Sun, ob, 1, new Date(Date.UTC(2026, 9, 31, 21, 0)), 1.5)!.date);
    const set = local(Astronomy.SearchRiseSet(Astronomy.Body.Sun, ob, -1, new Date(rise - 3 * 3600e3), 1)!.date);
    const rise2 = local(Astronomy.SearchRiseSet(Astronomy.Body.Sun, ob, 1, new Date(set - 3 * 3600e3), 1)!.date);
    const chk = (xs: J[], from: number, len: number, what: string) =>
      xs.forEach((x, i) => {
        assert.ok(Math.abs(ms(x.start) - (from + i * len)) <= 60_000, `${what} ${i + 1} başlangıç: ${x.start} ↔ ${new Date(from + i * len).toISOString()}`);
        assert.ok(Math.abs(ms(x.end) - (from + (i + 1) * len)) <= 60_000, `${what} ${i + 1} bitiş: ${x.end}`);
      });
    chk(h.day, rise, (set - rise) / 12, "gündüz hora");
    chk(h.night, set, (rise2 - set) / 12, "gece hora");
    chk(c.day, rise, (set - rise) / 8, "gündüz choghadiya");
    chk(c.night, set, (rise2 - set) / 8, "gece choghadiya");
    // Kaldani: her saat dizide bir SONRAKİ (hızlıya doğru) gezegen; 1. gündüz horası = haftanın günü yöneticisi.
    const wd = new Date(`${DATE}T00:00:00Z`).getUTCDay();
    const i0 = CHALDEAN.indexOf(WEEKDAY_LORD[wd]);
    [...h.day, ...h.night].forEach((x: J, k: number) => assert.equal(x.lord, CHALDEAN[(i0 + k) % 7], `hora ${k + 1}`));
    assert.deepEqual(c.day.map((x: J) => x.name), CHOG_DAY_TABLE[wd]);
    assert.deepEqual(c.night.map((x: J) => x.name), CHOG_NIGHT_TABLE[wd]);
    // Kaldani dizisinin 24 saatlik kayması: ertesi günün 1. horası = ertesi günün yöneticisi (Pazartesi = Ay).
    assert.equal(CHALDEAN[(i0 + 24) % 7], WEEKDAY_LORD[(wd + 1) % 7]);
    // Ayrıntılı Panchanga ile çapraz: gün doğumu / batımı birebir aynı dakika.
    assert.equal(h.day[0].start, need(PD, "ayrıntılı").response.sunrise);
    assert.equal(h.night[0].start, PD.response.sunset);
    assert.equal(c.day[0].start, PD.response.sunrise);
  });

  await t("fail-closed: kutup (dilim yok) · tarih yankısı · Kaldani dışı yönetici · 10 dk kayma · eksik/fazla dilim · ad↔yönetici · sınıf↔ad · boşluk → RED; bilinmeyen alan → yalnız raporlanır", () => {
    const h = need(HO, "golden").response;
    const c = need(CH, "golden").response;
    const polar = projH(tamper(h, (r) => ((r.dayHoras = []), (r.nightHoras = []))));
    assert.equal(polar.ok, false);
    assert.match(polar.errors[0], /kutup/);
    assert.match(projC(tamper(c, (r) => (r.dayChoghadiya = []))).errors[0], /kutup/);
    assert.equal(projH(h, { date: "2026-11-02" }).ok, false, "tarih");
    assert.equal(projH(tamper(h, (r) => (r.dayHoras[2].planet = "Mars"))).ok, false, "Kaldani");
    assert.equal(projH(tamper(h, (r) => (r.dayHoras[0].planet = "Rahu"))).ok, false, "Rahu");
    assert.equal(projH(tamper(h, (r) => ((r.dayHoras[5].end = "2026-11-01T13:20:00"), (r.dayHoras[6].start = "2026-11-01T13:20:00")))).ok, false, "10 dk");
    assert.equal(projH(tamper(h, (r) => r.nightHoras.pop())).ok, false, "eksik");
    assert.equal(projH(tamper(h, (r) => (r.dayHoras[3].number = 9))).ok, false, "numara");
    assert.equal(projH(tamper(h, (r) => (r.nightHoras[0].start = "2026-11-01T18:01:00"))).ok, false, "boşluk");
    assert.equal(projC(tamper(c, (r) => (r.dayChoghadiya[0].lord = "Moon"))).ok, false, "ad↔yönetici");
    assert.equal(projC(tamper(c, (r) => (r.dayChoghadiya[1].effect = "Bad"))).ok, false, "sınıf");
    assert.equal(projC(tamper(c, (r) => ((r.nightChoghadiya[0].name = "Amrit"), (r.nightChoghadiya[0].lord = "Moon")))).ok, false, "klasik gece sırası");
    assert.equal(projC(tamper(c, (r) => (r.nightChoghadiya[3].effect = "Neutral"))).ok, false, "bilinmeyen sınıf");
    const extra = projH(tamper(h, (r) => (r.dayHoras[0].quality = "x")));
    assert.equal(extra.ok, true);
    assert.deepEqual(extra.unmappedFields, ["dayHoras[].quality"]);
  });

  // ── Teknik ─────────────────────────────────────────────────────────────────────────────────────────
  const ctx0 = { birth: SYNTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null };
  await t("SABİT: seçenek kapalıyken normalize seçenek {ayanamsa}, TEK birim, gövde = temel golden, girdi özeti #498 ile aynı; yalnız Ayrıntılı → 2 birim, özet aynı", () => {
    const def = getTechnique("vedic.panchanga")!;
    const now = new Date();
    assert.deepEqual(def.parseOptions({ ayanamsa: "lahiri" }, now), { ayanamsa: "lahiri" });
    const u = def.units(ctx0, { ayanamsa: "lahiri" });
    assert.equal(u.length, 1);
    assert.deepEqual(u[0].body, FP.body);
    assert.equal(u[0].inputHash, BASE_HASH);
    const od = def.parseOptions({ ayanamsa: "lahiri", detail: true, detailDate: DATE }, now)!;
    assert.deepEqual(od, { ayanamsa: "lahiri", detail: true, detailDate: DATE, placeLocationId: null });
    assert.deepEqual(Object.keys(od), ["ayanamsa", "detail", "detailDate", "placeLocationId"]);
    const u2 = def.units(ctx0, { ...od, detailOffsetHours: 3 });
    assert.deepEqual(u2.map((x) => x.inputHash), [BASE_HASH, DETAIL_HASH]);
    assert.equal(def.parseOptions({ ayanamsa: "lahiri", hours: false }, now)!.hours, undefined, "hours:false eski nesne");
    assert.equal(def.noteContext!(od), "ayanamsa:lahiri");
  });

  await t("teknik: hours seçeneği → +2 birim (hora parça 2, choghadiya parça 3; aynı gövde, ayrı uç/anahtar); tek başına veya Ayrıntılı ile; geçersiz değer RED; Lahiri dışı → birim yok", () => {
    const def = getTechnique("vedic.panchanga")!;
    const now = new Date();
    const oh = def.parseOptions({ ayanamsa: "lahiri", hours: true, detailDate: DATE }, now)!;
    assert.deepEqual(oh, { ayanamsa: "lahiri", detailDate: DATE, placeLocationId: null, hours: true });
    const u = def.units(ctx0, { ...oh, detailOffsetHours: 3 });
    assert.deepEqual(u.map((x) => [x.endpoint, x.part]), [["/vedic-astrology/panchang/basic", 0], ["/vedic-astrology/panchang/hora", 2], ["/vedic-astrology/panchang/choghadiya", 3]]);
    assert.deepEqual(u[1].body, need(HO, "golden").body);
    assert.deepEqual(u[2].body, need(CH, "golden").body);
    assert.notEqual(u[1].inputHash, u[2].inputHash);
    assert.ok(u[1].timeDependent && u[2].timeDependent);
    const both = def.parseOptions({ ayanamsa: "lahiri", detail: true, hours: true, detailDate: DATE }, now)!;
    assert.deepEqual(both, { ayanamsa: "lahiri", detail: true, detailDate: DATE, placeLocationId: null, hours: true });
    assert.equal(def.units(ctx0, { ...both, detailOffsetHours: 3 }).length, 4);
    assert.equal(def.parseOptions({ ayanamsa: "lahiri", hours: "evet" }, now), null);
    assert.equal(def.parseOptions({ ayanamsa: "lahiri", hours: true, detailDate: "2026-02-30" }, now), null);
    assert.equal(def.units(ctx0, { ayanamsa: "raman", hours: true, detailDate: DATE, detailOffsetHours: 3 }).length, 0);
  });

  await t("seçici (istemci): kutu kapalıyken seçim nesnesi birebir eski; açıkken hours:true + aynı gün/yer; özet metni; eksik gün nedeni", () => {
    const base = { ...UI.defaultParams(new Date("2026-10-22T09:00:00Z")), vedicAyanamsa: "lahiri" };
    const sel = (p: J) => UI.buildSelections({ "vedic.panchanga": true }, p, { houseSystem: "placidus", nodeType: "true" } as J)[0]?.options;
    assert.deepEqual(sel(base), { ayanamsa: "lahiri" });
    assert.deepEqual(sel({ ...base, panchangaDetail: true, panchangaDate: DATE }), { ayanamsa: "lahiri", detail: true, detailDate: DATE, placeLocationId: null });
    assert.deepEqual(sel({ ...base, panchangaHours: true, panchangaDate: DATE }), { ayanamsa: "lahiri", detailDate: DATE, placeLocationId: null, hours: true });
    assert.deepEqual(sel({ ...base, panchangaDetail: true, panchangaHours: true, panchangaDate: DATE, panchangaPlace: { id: "tr-06-ankara", label: "Ankara" } }), { ayanamsa: "lahiri", detail: true, detailDate: DATE, placeLocationId: "tr-06-ankara", hours: true });
    assert.equal(UI.describeOptions("vedic.panchanga", { ayanamsa: "lahiri" }), "ayanamsa: Lahiri (sabit)");
    assert.equal(UI.describeOptions("vedic.panchanga", { ayanamsa: "lahiri", detail: true, detailDate: DATE }), "ayanamsa: Lahiri (sabit) · ayrıntılı: 01.11.2026");
    assert.equal(UI.describeOptions("vedic.panchanga", { ayanamsa: "lahiri", hours: true, detailDate: DATE, place: { label: "İstanbul" } }), "ayanamsa: Lahiri (sabit) · hora + choghadiya: 01.11.2026 · İstanbul");
    assert.equal(UI.dateInputReason("vedic.panchanga", { ...base, panchangaHours: true, panchangaDate: "0002-11-01" }), "hora / choghadiya gününü tamamlayın");
  });

  // ── Servis ─────────────────────────────────────────────────────────────────────────────────────────
  await t("servis: kutup dairesi ötesi (Tromsø) → PANCHANGA_POLAR (hora/choghadiya metni), ücretli istek 0; İstanbul → plan 3 yeni istek (temel + 2); Ayrıntılı ile 4", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const polar = (await planAstrology(ctx, { profileId: pid, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", hours: true, detailDate: DATE, placeLocationId: "gn-3133895" } }] })).body as J;
    assert.equal(polar.plan.selections[0].blocked?.code, "PANCHANGA_POLAR", JSON.stringify(polar.plan.selections[0]));
    assert.match(polar.plan.selections[0].blocked.error, /Gezegen saatleri \(hora\) ve Choghadiya/);
    assert.equal(polar.plan.newRequestCount, 0);
    const ok = (await planAstrology(ctx, { profileId: pid, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", hours: true, detailDate: DATE } }] })).body as J;
    assert.equal(ok.plan.selections[0].blocked ?? null, null);
    assert.equal(ok.plan.newRequestCount, 3);
    const all = (await planAstrology(ctx, { profileId: pid, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", detail: true, hours: true, detailDate: DATE } }] })).body as J;
    assert.equal(all.plan.newRequestCount, 4);
  });

  await t("uçtan uca: çalıştır (3 istek) → 2. çalıştırma 0 istek (önbellek) → kaydet → aç (0 istek) → Word + PDF: Hora / Choghadiya tabloları; yetki: başka tenant / uzman 404; yorum yetkisi yokken teknik görünür", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy();
    const sel = { technique: "vedic.panchanga", options: { ayanamsa: "lahiri", hours: true, detailDate: DATE, placeLocationId: null } };
    const r = await runAstrology(ctx, { profileId: pid, selections: [sel] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const it = (r.body as J).results[0];
    assert.equal(it.ok, true, JSON.stringify(it).slice(0, 300));
    assert.equal(it.partial, false);
    assert.deepEqual(rx.calls.sort(), ["/vedic-astrology/panchang/basic", "/vedic-astrology/panchang/choghadiya", "/vedic-astrology/panchang/hora"]);
    const hs = it.view.technical.hours;
    assert.equal(hs.hora.day.length, 12);
    assert.equal(hs.choghadiya.night.length, 8);
    assert.deepEqual(hs.missing, []);
    assert.equal(it.view.technical.detail, undefined, "Ayrıntılı seçilmedi");
    const n0 = rx.calls.length;
    const r2 = await runAstrology(ctx, { profileId: pid, selections: [sel] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal((r2.body as J).results[0].ok, true);
    assert.equal(rx.calls.length, n0, "2. çalıştırma istek yaptı");
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...sel, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const id = (sv.body as J).analysisId;
    const a = ((await getAnalysis(ctx, id, false)).body as J).analysis;
    assert.equal(rx.calls.length, n0, "açmak istek yaptı");
    assert.equal(a.technical.hours.hora.day[0].start, "2026-11-01T07:35:00");
    const rep = buildAstroReport(a as ReportAnalysisInput);
    const txt = reportTexts(rep).join("\n");
    for (const m of ["Gezegen saatleri (Hora) ve Choghadiya (seçilen gün)", "Gündüz 1", "Gece 12", "Amrit", "Udveg", "olumlu", "olumsuz", "07:35 – 08:27", "Kaldani", "hora + choghadiya: 01.11.2026"]) assert.ok(txt.includes(m), `rapor: "${m}" yok`);
    assert.ok(!txt.includes("Ayrıntılı Panchanga (seçilen gün)"));
    assert.ok(!/undefined|\[object Object\]|NaN|roxy/i.test(txt));
    const docx = await docxText(await renderAstroReportDocx(rep, null, symbolFontBuffers()));
    const pdf = await pdfText(Buffer.from(buildAstroReportPdf(rep, null, FONT_B64, symbolFontsBase64())));
    for (const m of ["Gezegen saatleri (Hora) ve Choghadiya", "Choghadiya", "Amrit", "olumlu"]) {
      assert.ok(docx.includes(m), `Word: "${m}" yok`);
      assert.ok(pdf.includes(m), `PDF: "${m}" yok`);
    }
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), id, false)).body as J).analysis;
    assert.ok(hidden.technical.hours.choghadiya, "teknik dilimler yetkisizde de görünür");
    assert.ok(!JSON.stringify(hidden).includes("Revati bireyleri") && !JSON.stringify(hidden.interpretation ?? null).includes("characteristics"), "yetkisizde yorum metni");
  });

  await t("kısmi: choghadiya yanıtı reddedilirse sonuç temel + hora ile döner, eksik bölüm AÇIKÇA işaretli (sahte dilim yok)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy();
    const orig = rx.deps.callProvider;
    rx.deps.callProvider = async (c, endpoint, body, o) => {
      const res = await orig(c, endpoint, body, o);
      if (endpoint === "/vedic-astrology/panchang/choghadiya" && res.ok) return { ...res, raw: tamper(res.raw, (r) => (r.dayChoghadiya[0].lord = "Moon")) };
      return res;
    };
    const r = await runAstrology(ctx, { profileId: pid, selections: [{ technique: "vedic.panchanga", options: { ayanamsa: "lahiri", hours: true, detailDate: DATE } }] }, rx.deps, { ownerPreviewHideInterp: false });
    const it = (r.body as J).results[0];
    assert.equal(it.ok, true);
    assert.equal(it.partial, true);
    assert.equal(it.view.technical.hours.choghadiya, null);
    assert.deepEqual(it.view.technical.hours.missing, ["choghadiya"]);
    const txt = reportTexts(buildAstroReport({ id: "x", title: "x", technique: "vedic.panchanga", analysisAt: "2026-10-22T00:00:00Z", technical: it.view.technical, params: it.view.options })).join("\n");
    assert.ok(txt.includes("Choghadiya dilimleri bu kayıtta yok"));
  });

  await t("statik: yeni kullanıcı metinlerinde sağlayıcı adı / 'golden' / 'fixture' / ham uç adı yok", () => {
    for (const f of ["app/admin/astroloji/_components/PanchangaHoursPanels.tsx", "lib/astrology/model/panchangaHours.ts", "app/admin/astroloji/_components/TechniqueSelector.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(/["`>]([^"`<\n]*(?:Hora|hora|Choghadiya)[^"`<\n]*)["`<]/g)) assert.ok(!/roxy|golden|fixture|\/panchang\//i.test(m[1]), `${f}: ${m[1]}`);
    }
  });

  await t("Yakında (owner 22.10): Hora / Choghadiya / Ayrıntılı Panchanga / Rahu Kaal bu sürümde listeden düşer; açılmamış teknik kalır", () => {
    const src = readFileSync(join(process.cwd(), "app/admin/astroloji/_components/atlas/ComingSoonPanel.tsx"), "utf8");
    const items = new Set([...src.slice(src.indexOf("COMING_SOON_SECTIONS"), src.indexOf("/** Yalnız henüz")).matchAll(/"([^"\n]+)"/g)].map((m) => m[1]));
    for (const k of Object.keys(SOON.COMING_SOON_AVAILABLE_AS)) assert.ok(items.has(k), `eşlemedeki madde panel listesinde yok: ${k}`);
    const sections = [
      { title: "Vedik Panchanga ve Zaman Hesaplamaları", items: ["Ayrıntılı Panchanga", "Rahu Kaal", "Yamaganda", "Gulika", "Hora (Gezegen Saatleri)", "Choghadiya"] },
      { title: "Vedik Dosha", items: ["Manglik Dosha", "Kalsarpa Dosha", "Sade Sati"] },
    ];
    const v = SOON.visibleComingSoonSections(sections, SOON.AVAILABLE_TECHNIQUES);
    assert.ok(SOON.AVAILABLE_TECHNIQUES.has("vedic.panchanga"));
    assert.equal(v.length, 1, "Panchanga bölümü tümüyle açık → bölüm düşer");
    assert.ok(v[0].items.includes("Kalsarpa Dosha"));
    // Henüz bu dalda olmayan teknik (ör. Sade Sati ayrı PR) kendi maddesini tutar; teknik eklenince düşer.
    const withSade = SOON.visibleComingSoonSections(sections, new Set([...SOON.AVAILABLE_TECHNIQUES, "vedic.sade_sati"]));
    assert.ok(!withSade[0].items.includes("Sade Sati"));
    assert.equal(v[0].items.includes("Sade Sati"), !SOON.AVAILABLE_TECHNIQUES.has("vedic.sade_sati"));
  });

  console.log(`\npanchanga-hours: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
