/**
 * ATLAS YENİ TEKNİKLER (2026-10-22) — KP Ruling Planets ZAMAN ARALIĞI TARAMASI (`kp.ruling_interval`) harness'i.
 *   • golden (2 gerçek çağrı, İstanbul +3, 10 dk adım): A = 07.10.2026 11:30–12:30 (mevcut kp.ruling golden anı 12:00 içinde),
 *     B = 01.11.2026 07:00–08:00 (gün doğumu 07:35 içinde → gün lordu Satürn → Güneş)
 *   • BAĞIMSIZ doğrulama: aynı anda mevcut kp.ruling golden'ı ile birebir (gün lordu, Ay + Lagna sign/star/sub/sub-sub, küme);
 *     gün lordu = astronomy-engine gün doğumu; Ay lordları = astronomy-engine Ay − KP-Newcomb (golden'a sabitli) → KP tablosu;
 *     Lagna lordları = astronomy-engine RAMC'den Asc − KP-Newcomb → KP tablosu (sınıra yakın noktada komşu dilim kabul)
 *   • fail-closed, KP lord zinciri (bölünmüş sub dahil), plan / önbellek / kayıt + arşiv (0 istek) / rapor (Word/PDF) / yetki,
 *     kutup + yaz saati engeli (istek 0), saat bilinmeyen profilde çalışır, mevcut kp.ruling girdi özeti SABİT
 * Gerçek sağlayıcı / gerçek DB YOK. Yeni modüller dinamik içe aktarılır (eski kodda testler çökmeden FAIL verir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/kp-ruling-interval.harness.ts
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
import { kpNewcombApprox, siderealLon } from "./syntheticKpTiming";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { kpLordCandidates, kpTable } from "@/lib/astrology/verify/kpSub";
import { SIGN_LORDS } from "@/lib/astrology/model/kp";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { TECHNIQUE_TOPIC_CONTEXT, topicsForTechnique } from "@/lib/astrology/topics";
import * as UI from "@/app/admin/astroloji/_lib/techniques";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const DIR = join(__dirname, "fixtures", "golden");
const has = (n: string) => existsSync(join(DIR, `${n}.json`));
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const GA = has("kp-ruling-interval-a") ? load("kp-ruling-interval-a") : null;
const GB = has("kp-ruling-interval-b") ? load("kp-ruling-interval-b") : null;
const RP = load("kp-ruling-planets");
/** Mevcut kp.ruling biriminin girdi özeti (93b16b06 tabanı; doğum yeri, 2026-10-07 09:00 UTC, mean) — SABİT. */
const KP_RULING_HASH = "3b6c38d487fcfc4aa022779c5ca5e169f34855c7f42864144b8e77788933f3ef";

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
const n360 = (x: number) => ((x % 360) + 360) % 360;
const D2R = Math.PI / 180;

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
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as J)[k])}`).join(",")}}`;
function roxy() {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-ri", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const g = [GA, GB, RP].filter(Boolean).find((x: J) => x.endpoint === endpoint && canon(x.body) === canon(body));
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

const SEL_A = { technique: "kp.ruling_interval", options: { atUtc: "2026-10-07T08:30", durationMinutes: 60, intervalMinutes: 10, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } };
const SEL_B = { technique: "kp.ruling_interval", options: { atUtc: "2026-11-01T04:00", durationMinutes: 60, intervalMinutes: 10, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } };
const PLACE = { latitude: 41.0082, longitude: 28.9784 };

async function main() {
  const A = await imp("@/lib/astrology/providers/roxy/kpRulingInterval");
  const BODY = await imp("@/lib/astrology/providers/roxy/kpRulingIntervalBody");
  const CH = await imp("@/lib/astrology/verify/kpLordChain");
  const M = await imp("@/lib/astrology/model/kpRulingInterval");
  const optsA = { startLocal: "2026-10-07T11:30:00", endLocal: "2026-10-07T12:30:00", intervalMinutes: 10, utcOffsetHours: 3, place: { ...PLACE, label: "İstanbul, Türkiye" }, ayanamsa: "kp-newcomb", nodeType: "mean", startUtc: "2026-10-07T08:30", durationMinutes: 60 };
  const optsB = { ...optsA, startLocal: "2026-11-01T07:00:00", endLocal: "2026-11-01T08:00:00", startUtc: "2026-11-01T04:00" };
  const proj = (raw: J, o: J = optsA) => fnOf(A, "projectRoxyKpRulingInterval")(raw, o);

  await t("golden: 2 fixture gövdesi = ürün gövdesi (yerel başlangıç/bitiş, adım, gözlem yeri, ofset, KP ayanamsa, düğüm); doğum verisi / anahtar YOK", () => {
    for (const [g, s] of [[need(GA, "golden A"), SEL_A], [need(GB, "golden B"), SEL_B]] as const) {
      assert.equal(g.endpoint, "/vedic-astrology/kp/ruling-planets-interval");
      assert.deepEqual(g.body, fnOf(BODY, "kpRulingIntervalBody")(s.options.atUtc, 60, 10, PLACE, 3, "kp-newcomb", "mean"));
      assert.ok(!("birthDate" in g.body) && !("birthTime" in g.body));
      assert.ok(!/apiKey|x-api-key|Ali Örnek|1990-07-15/i.test(JSON.stringify(g)));
    }
  });

  await t("projeksiyon A/B: 7 an, yerel + UTC; lord zinciri, küme, significator'lar, Ay 4 düzey; eşlenmemiş alan yok; KP numarası YOK (uydurulmaz)", () => {
    const a = proj(need(GA, "A").response);
    assert.equal(a.ok, true, JSON.stringify(a.errors));
    const tA = a.technical;
    assert.equal(tA.schema, "astro.kp.ruling_interval.v1");
    assert.equal(tA.method, "moment_chart");
    assert.equal(tA.rows.length, 7);
    assert.deepEqual([tA.rows[0].local, tA.rows[0].utc], ["2026-10-07T11:30", "2026-10-07T08:30"]);
    assert.deepEqual(tA.window, { startUtc: "2026-10-07T08:30", endUtc: "2026-10-07T09:30", startLocal: "2026-10-07T11:30", endLocal: "2026-10-07T12:30", utcOffsetHours: 3, durationMinutes: 60, intervalMinutes: 10 });
    assert.deepEqual(a.unmappedFields, []);
    assert.ok(!JSON.stringify(tA).includes("kpNumber"));
    assert.ok(a.interpretation.houseThemes.length === 12, "ev temaları yalnız yorum katmanında");
    const b = proj(need(GB, "B").response, optsB);
    assert.equal(b.ok, true, JSON.stringify(b.errors));
    assert.deepEqual(b.technical.rows.map((r: J) => r.dayLord), ["saturn", "saturn", "saturn", "saturn", "sun", "sun", "sun"]);
    const ch = fnOf(M, "kpIntervalChanges")(b.technical.rows);
    assert.ok(ch[4].includes("dayLord") && ch[4].includes("rulingPlanets"), JSON.stringify(ch[4]));
    assert.deepEqual(ch[0], []);
  });

  await t("BAĞIMSIZ 1 — aynı an + yer: tarama 12:00 satırı = mevcut kp.ruling golden'ı (gün lordu, Ay + Lagna sign/star/sub/sub-sub, ruling planets kümesi); significator'lar FARKLI (anın haritası ≠ natal) → ayrı teknik kanıtı", () => {
    const row = proj(need(GA, "A").response).technical.rows.find((r: J) => r.local === "2026-10-07T12:00");
    const g = RP.response;
    assert.deepEqual(RP.body.datetime, "2026-10-07T12:00:00");
    assert.equal(row.dayLord, g.dayLord.toLowerCase());
    assert.deepEqual(row.moon, { sign: g.moonSignLord.toLowerCase(), star: g.moonStarLord.toLowerCase(), sub: g.moonSublord.toLowerCase(), subSub: g.moonSubSublord.toLowerCase() });
    assert.deepEqual(row.lagna, { sign: g.lagnaSignLord.toLowerCase(), star: g.lagnaStarLord.toLowerCase(), sub: g.lagnaSublord.toLowerCase(), subSub: g.lagnaSubSublord.toLowerCase() });
    assert.deepEqual([...row.rulingPlanets].sort(), g.rulingPlanets.map((x: string) => x.toLowerCase()).sort());
    const natalMerc = g.significators.find((x: J) => x.planet === "Mercury").signifies;
    const momentMerc = row.significators.find((x: J) => x.id === "mercury").houses;
    assert.notDeepEqual(momentMerc, natalMerc, "anın haritası significator'ı natal ile aynı çıkmamalı (yöntem farkı)");
  });

  await t("BAĞIMSIZ 2 — astronomy-engine: gün lordu yerel gün doğumuna göre (B: 07:35 öncesi Cumartesi/Satürn, sonrası Pazar/Güneş); A: Çarşamba/Merkür", () => {
    const ob = new Astronomy.Observer(PLACE.latitude, PLACE.longitude, 0);
    const lordAt = (utcMs: number) => {
      const localDay = new Date(utcMs + 3 * 3600e3).toISOString().slice(0, 10);
      const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, ob, 1, new Date(Date.parse(`${localDay}T00:00:00Z`) - 3 * 3600e3), 1)!.date.getTime();
      const wd = new Date(`${localDay}T00:00:00Z`).getUTCDay();
      return ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"][utcMs >= rise ? wd : (wd + 6) % 7];
    };
    for (const [g, o] of [[GA, optsA], [GB, optsB]] as const) for (const r of proj(need(g, "golden").response, o).technical.rows) assert.equal(r.dayLord, lordAt(Date.parse(`${r.utc}:00Z`)), r.local);
  });

  await t("BAĞIMSIZ 3 — Ay ve Lagna lordları: astronomy-engine (Ay görünür boylamı; RAMC → Asc) − KP-Newcomb → KP tablosu; 14/14 an (yaklaşık ayanamsa için ±0,005° içinde komşu dilim kabul)", () => {
    for (const [g, o] of [[GA, optsA], [GB, optsB]] as const) {
      for (const r of proj(need(g, "golden").response, o).technical.rows) {
        const ms = Date.parse(`${r.utc}:00Z`);
        const moon = siderealLon("moon", ms);
        const mc = kpLordCandidates(moon, 0.005);
        assert.ok(mc.some((c) => c.star === r.moon.star && c.sub === r.moon.sub && c.subSub === r.moon.subSub), `Ay ${r.local}: bağımsız ${JSON.stringify(mc)} ↔ ${JSON.stringify(r.moon)}`);
        assert.equal(SIGN_LORDS[SIGN_IDS[Math.floor(moon / 30)]], r.moon.sign);
        const tm = Astronomy.MakeTime(new Date(ms));
        const ramc = n360(Astronomy.SiderealTime(tm) * 15 + PLACE.longitude) * D2R;
        const eps = Astronomy.e_tilt(tm).tobl * D2R;
        const ascT = n360(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(PLACE.latitude * D2R) * Math.sin(eps))) / D2R);
        const asc = n360(ascT - kpNewcombApprox(ms));
        const lc = kpLordCandidates(asc, 0.005);
        assert.ok(lc.some((c) => c.star === r.lagna.star && c.sub === r.lagna.sub && c.subSub === r.lagna.subSub), `Lagna ${r.local}: bağımsız ${JSON.stringify(lc)} ↔ ${JSON.stringify(r.lagna)}`);
        assert.equal(SIGN_LORDS[SIGN_IDS[Math.floor(asc / 30)]], r.lagna.sign);
      }
    }
  });

  await t("KP lord zinciri (verify/kpLordChain): golden'daki 28 zincir var; olmayan dörtlü (Venüs burcu + Ketu yıldızı) yok; burç sınırında BÖLÜNMÜŞ sub her iki burç lorduyla geçerli", () => {
    const ex = fnOf(CH, "kpLordChainExists");
    for (const [g, o] of [[GA, optsA], [GB, optsB]] as const) for (const r of proj(need(g, "golden").response, o).technical.rows) for (const c of [r.moon, r.lagna]) assert.ok(ex(c.sign, c.star, c.sub, c.subSub));
    assert.equal(ex("venus", "ketu", "ketu", "ketu"), false);
    const tbl = kpTable();
    const i = tbl.findIndex((x, k) => k + 1 < tbl.length && tbl[k + 1].star === x.star && tbl[k + 1].sub === x.sub);
    const a = tbl[i];
    const b = tbl[i + 1];
    const sa = SIGN_LORDS[SIGN_IDS[Math.floor(a.start / 30)]];
    const sb = SIGN_LORDS[SIGN_IDS[Math.floor(b.start / 30)]];
    assert.notEqual(sa, sb);
    const last = kpLordCandidates(a.end - 1e-4)[0].subSub;
    const first = kpLordCandidates(b.start + 1e-4)[0].subSub;
    assert.ok(ex(sa, a.star, a.sub, last) && ex(sb, b.star, b.sub, first), `bölünmüş sub ${a.kp}/${b.kp}`);
  });

  await t("fail-closed: küme dışı ruling planet · olmayan lord zinciri · adım kayması · eksik an · konum/ofset yankısı · gün lordu geri gidiş · significator kümesi · 13. ev → RED; bilinmeyen alan → yalnız raporlanır", () => {
    const g = need(GA, "A").response;
    const no = (raw: J, what: string, o: J = optsA) => assert.equal(proj(raw, o).ok, false, what);
    no(tamper(g, (r) => r.intervals[0].rulingPlanets.push("Venus")), "küme");
    // Krittika (Güneş yıldızı) Koç'ta yalnız ilk 3°20′: Koç (Mars) + Krittika + Satürn sub'ı ZODYAKTA YOK. Küme/significator tutarlı
    // tutulur → yalnız lord zinciri denetimi yakalar.
    const fake = tamper(g, (r) => {
      const it = r.intervals[1];
      Object.assign(it, { lagnaSignLord: "Mars", lagnaStarLord: "Sun", lagnaSublord: "Saturn", lagnaSubSublord: "Saturn" });
      const set = [...new Set([it.dayLord, it.moonSignLord, it.moonStarLord, "Mars", "Sun"])];
      it.rulingPlanets = set;
      it.significators = set.map((p: string) => it.significators.find((s: J) => s.planet === p) ?? { planet: p, signifies: [1] });
    });
    const fr = proj(fake);
    assert.equal(fr.ok, false, "zincir (Lagna sub)");
    assert.ok(fr.errors.every((e: string) => /lord zinciri/.test(e)), JSON.stringify(fr.errors));
    assert.equal(proj(tamper(fake, (r) => (r.intervals[1].lagnaSublord = "Moon"))).ok, true, "aynı dörtlü Ay sub'ıyla geçerli (Krittika'nın Koç parçası)");
    no(tamper(g, (r) => (r.intervals[2].lagnaStarLord = "Venus")), "zincir (Lagna star)");
    no(tamper(g, (r) => (r.intervals[3].datetime = "2026-10-07T12:01:00")), "adım");
    no(tamper(g, (r) => (r.intervals.pop(), (r.totalIntervals = 6))), "eksik an");
    no(g, "ofset", { ...optsA, utcOffsetHours: 2 });
    no(g, "konum", { ...optsA, place: { ...optsA.place, latitude: 39.9 } });
    no(tamper(GB.response, (r) => (r.intervals[6].dayLord = "Saturn")), "gün lordu geri", optsB);
    no(tamper(g, (r) => r.intervals[0].significators.pop()), "significator kümesi");
    no(tamper(g, (r) => (r.intervals[0].moonSignifies.L1 = [13])), "13. ev");
    const extra = proj(tamper(g, (r) => (r.intervals[0].moonSignLordScore = 3)));
    assert.equal(extra.ok, true);
    assert.deepEqual(extra.unmappedFields, ["intervals[].moonSignLordScore"]);
  });

  // ── Teknik ─────────────────────────────────────────────────────────────────────────────────────────
  await t("teknik: kp.ruling'den AYRI kimlik; doğum saati gerekmez; seçenek normalizasyonu ve sınırlar (adım listesi, ≤ 24 sa, ≤ 121 an, 1900–2100, yalnız KP ayanamsa); not bağlamı ayanamsa|düğüm", () => {
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes("kp.ruling_interval"));
    const def = need(getTechnique("kp.ruling_interval"), "teknik");
    assert.equal(def.requiresKnownTime, false);
    assert.equal(def.family, "kp");
    const now = new Date("2026-10-22T10:37:00Z");
    assert.deepEqual(def.parseOptions(SEL_A.options, now), SEL_A.options);
    assert.deepEqual(def.parseOptions({ now: true, durationMinutes: 120, intervalMinutes: 10 }, now), { atUtc: "2026-10-22T10:00", durationMinutes: 120, intervalMinutes: 10, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null });
    assert.equal(def.parseOptions({ ...SEL_A.options, intervalMinutes: 7 }, now), null);
    assert.equal(def.parseOptions({ ...SEL_A.options, durationMinutes: 1500, intervalMinutes: 60 }, now), null);
    assert.equal(def.parseOptions({ ...SEL_A.options, durationMinutes: 240, intervalMinutes: 1 }, now), null, "241 an");
    assert.ok(def.parseOptions({ ...SEL_A.options, durationMinutes: 120, intervalMinutes: 1 }, now), "121 an sınırda");
    assert.equal(def.parseOptions({ ...SEL_A.options, durationMinutes: 65 }, now), null, "adımın katı değil");
    assert.equal(def.parseOptions({ ...SEL_A.options, atUtc: "1850-01-01T00:00" }, now), null);
    assert.equal(def.parseOptions({ ...SEL_A.options, ayanamsa: "lahiri" }, now), null);
    assert.equal(def.noteContext!(SEL_A.options), "ayanamsa:kp-newcomb|nodeType:mean");
    const ctx0 = { birth: SYNTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null };
    assert.equal(def.units(ctx0, SEL_A.options).length, 0, "ofset çözülmeden birim yok");
    const u = def.units(ctx0, { ...SEL_A.options, offsetHours: 3 });
    assert.deepEqual(u[0].body, GA.body);
    assert.ok(u[0].timeDependent);
  });

  await t("SABİT: mevcut kp.ruling değişmedi — seçenek nesnesi, gövde (golden), girdi özeti #487/#497 tabanıyla aynı; KP numarası yok sayan yeni işlev eklenmedi", () => {
    const def = getTechnique("kp.ruling")!;
    const o = def.parseOptions({ atUtc: "2026-10-07T09:00", nodeType: "mean", placeLocationId: null }, new Date());
    assert.deepEqual(o, { atUtc: "2026-10-07T09:00", nodeType: "mean", placeLocationId: null });
    const u = def.units({ birth: SYNTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null }, o!);
    assert.deepEqual(u[0].body, RP.body);
    assert.equal(u[0].inputHash, KP_RULING_HASH);
    assert.equal(def.requiresKnownTime, true);
  });

  await t("seçici (istemci): gözlem yeri seçilmeden plana alınmaz; doğum yeri → placeLocationId null; özet metni; pencere/başlangıç nedenleri", () => {
    const base = { ...UI.defaultParams(new Date("2026-10-08T12:00:00Z")), kpMomentMode: "custom" as const, kpDate: "2026-10-07", kpTime: "11:30", kpTz: "Europe/Istanbul" };
    const m = { houseSystem: "placidus", nodeType: "true" } as J;
    assert.equal(UI.buildSelections({ "kp.ruling_interval": true } as J, base, m).length, 0);
    assert.equal(UI.missingReason("kp.ruling_interval" as J, base), "gözlem yeri seçin");
    const sel = UI.buildSelections({ "kp.ruling_interval": true } as J, { ...base, kpPlaceMode: "birth", kpRiDuration: 60, kpRiInterval: 10 } as J, m)[0];
    assert.deepEqual(sel.options, { date: "2026-10-07", time: "11:30", timezone: "Europe/Istanbul", durationMinutes: 60, intervalMinutes: 10, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null });
    assert.deepEqual(getTechnique("kp.ruling_interval")!.parseOptions(sel.options, new Date()), SEL_A.options, "istemci seçimi = golden A seçenekleri");
    assert.equal(UI.dateInputReason("kp.ruling_interval" as J, { ...base, kpRiDuration: 240, kpRiInterval: 1 } as J), "tarama süresi / adımı geçersiz (en çok 24 saat, en çok 121 an)");
    assert.equal(UI.describeOptions("kp.ruling_interval", { ...SEL_A.options, place: { label: "İstanbul" } }), "başlangıç 07.10.2026 08:30 UTC · 1 sa / 10 dk adım (7 an) · KP-Newcomb · İstanbul");
    assert.ok((UI.UI_TECHNIQUES as readonly string[]).includes("kp.ruling_interval"));
  });

  await t("konular + maske: kp_ruling_planet konuları (taramadaki gezegenler; mevcut konu türü), bağlam kp_ruling; saat bilinmese de görünüm maskelenmez (doğum verisi yok)", () => {
    const tA = proj(need(GA, "A").response).technical;
    const keys = topicsForTechnique("kp.ruling_interval", tA).map((x) => x.key).sort();
    assert.deepEqual(keys, ["kp_ruling_planet:ketu", "kp_ruling_planet:mars", "kp_ruling_planet:mercury", "kp_ruling_planet:saturn", "kp_ruling_planet:sun"]);
    assert.deepEqual(TECHNIQUE_TOPIC_CONTEXT["kp.ruling_interval"], ["kp_ruling", "kp_principle"]);
    assert.equal(maskTechnical("kp.ruling_interval", tA, { primary: false } as J).masked, false);
  });

  // ── Servis ─────────────────────────────────────────────────────────────────────────────────────────
  await t("servis: doğum yeri → 1 yeni istek; kutup (Tromsø) → HOUSE_SYSTEM_POLAR, istek 0; Berlin yaz/kış saati geçişini kesen pencere → KP_INTERVAL_OFFSET_CHANGE, istek 0", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const plan = async (o: J) => ((await planAstrology(ctx, { profileId: pid, selections: [{ technique: "kp.ruling_interval", options: o }] })).body as J).plan;
    const ok = await plan(SEL_A.options);
    assert.equal(ok.selections[0].blocked ?? null, null, JSON.stringify(ok.selections[0]));
    assert.equal(ok.newRequestCount, 1);
    const polar = await plan({ ...SEL_A.options, placeLocationId: "gn-3133895" });
    assert.equal(polar.selections[0].blocked?.code, "HOUSE_SYSTEM_POLAR");
    assert.equal(polar.newRequestCount, 0);
    const dst = await plan({ ...SEL_A.options, atUtc: "2026-10-25T00:00", durationMinutes: 180, intervalMinutes: 30, placeLocationId: "de-berlin" });
    assert.equal(dst.selections[0].blocked?.code, "KP_INTERVAL_OFFSET_CHANGE", JSON.stringify(dst.selections[0]));
    assert.equal(dst.newRequestCount, 0);
    const berlinOk = await plan({ ...SEL_A.options, atUtc: "2026-10-25T02:00", durationMinutes: 180, intervalMinutes: 30, placeLocationId: "de-berlin" });
    assert.equal(berlinOk.selections[0].blocked ?? null, null, "geçişten sonra tek ofset (+1)");
  });

  await t("uçtan uca: çalıştır (1 istek; doğum verisi gövdede yok) → 2. çalıştırma 0 istek → kaydet → aç (0 istek) → Word + PDF (yöntem uyarısı, değişim anları, tablo); başka tenant / uzman 404; yorum yetkisi yokken ev temaları gizli, tablo görünür", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx);
    const rx = roxy();
    const r = await runAstrology(ctx, { profileId: pid, selections: [SEL_B] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    const it = (r.body as J).results[0];
    assert.equal(it.ok, true, JSON.stringify(it).slice(0, 300));
    assert.equal(rx.calls.length, 1);
    assert.ok(!("birthDate" in rx.calls[0].body));
    assert.equal(it.view.technical.rows.length, 7);
    assert.equal(it.view.options.offsetHours, 3);
    await runAstrology(ctx, { profileId: pid, selections: [SEL_B] }, rx.deps, { ownerPreviewHideInterp: false });
    assert.equal(rx.calls.length, 1, "2. çalıştırma istek yaptı");
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...SEL_B, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const id = (sv.body as J).analysisId;
    const a = ((await getAnalysis(ctx, id, false)).body as J).analysis;
    assert.equal(rx.calls.length, 1, "açmak istek yaptı");
    assert.equal(a.technical.rows[4].dayLord, "sun");
    const rep = buildAstroReport(a as ReportAnalysisInput);
    const txt = reportTexts(rep).join("\n");
    for (const m of ["Zaman aralığı taraması", "natal", "Değişim anları", "gün lordu", "Tarama tablosu", "Ay zinciri 4 düzey", "o anın haritası", "KP numarası (1–249) verilmez", "01.11.2026 07:40", "1 sa / 10 dk adım (7 an)"]) assert.ok(txt.includes(m), `rapor: "${m}" yok`);
    assert.ok(!/undefined|\[object Object\]|NaN|roxy/i.test(txt));
    const docx = await docxText(await renderAstroReportDocx(rep, null, symbolFontBuffers()));
    const pdf = await pdfText(Buffer.from(buildAstroReportPdf(rep, null, FONT_B64, symbolFontsBase64())));
    for (const m of ["Değişim anları", "Tarama tablosu", "Zaman aralığı taraması"]) {
      assert.ok(docx.includes(m), `Word: "${m}" yok`);
      assert.ok(pdf.includes(m), `PDF: "${m}" yok`);
    }
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), id, false)).body as J).analysis;
    assert.ok(hidden.technical.rows.length === 7, "tablo yetkisizde de görünür");
    assert.ok(!JSON.stringify(hidden).includes("kardeşler"), "yetkisizde ev teması (yorum) sızdı");
    assert.ok(JSON.stringify(a).includes("kardeşler"), "yetkili kayıtta ev temaları var");
  });

  await t("saat bilinmeyen profil: tarama yine çalışır (TIME_REQUIRED yok; doğum verisi kullanılmaz); mevcut kp.ruling aynı profilde TIME_REQUIRED kalır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pid = await profile(ctx, false);
    const p = ((await planAstrology(ctx, { profileId: pid, selections: [SEL_A, { technique: "kp.ruling", options: { atUtc: "2026-10-07T09:00", nodeType: "mean", placeLocationId: null } }] })).body as J).plan;
    assert.equal(p.selections[0].blocked ?? null, null, JSON.stringify(p.selections[0]));
    assert.equal(p.selections[1].blocked?.code, "TIME_REQUIRED");
    const rx = roxy();
    const r = await runAstrology(ctx, { profileId: pid, selections: [SEL_A] }, rx.deps, { ownerPreviewHideInterp: false });
    const it = (r.body as J).results[0];
    assert.equal(it.ok, true, JSON.stringify(it).slice(0, 200));
    assert.equal(it.view.technical.rows.length, 7);
  });

  await t("statik: yeni kullanıcı metinlerinde sağlayıcı adı / 'golden' / 'fixture' / ham uç adı yok", () => {
    for (const f of ["app/admin/astroloji/_components/KpRulingIntervalPanel.tsx", "app/admin/astroloji/_components/KpRulingIntervalFields.tsx", "lib/astrology/model/kpRulingInterval.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(/["`>]([^"`<\n]{8,})["`<]/g)) assert.ok(!/\broxy\b|golden|fixture|ruling-planets-interval/i.test(m[1]), `${f}: ${m[1]}`);
    }
  });

  console.log(`\nkp-ruling-interval: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
