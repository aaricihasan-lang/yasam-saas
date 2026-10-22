/**
 * ATLAS ROXY KALAN (2026-10-22 gece) — VEDİK EŞLEŞTİRME 2: Güney Hint On Porutham (vedic.dashakoot) + Papasamyam
 * (vedic.papasamyam) harness'i.
 *
 * Kaynak: 4 GERÇEK sağlayıcı yanıtı (fixtures/golden/vedic-dashakoot · vedic-papasamyam; sentetik kişiler A = 1990-07-15 14:30
 * İstanbul +3 = person1 / 1. rol (damat), B = 1988-03-21 06:45 Ankara +2 = person2 / 2. rol (gelin)) + ROL TAKASLI 2 GERÇEK yanıt
 * (fixtures/golden/vedic-dashakoot-swap · vedic-papasamyam-swap; person1 = B, person2 = A; 22.10.2026 21:38Z, owner onaylı gerçek
 * doğrulama turu). Bu harness sağlayıcıya ÇAĞRI YAPMAZ.
 *
 *   A) golden ↔ OpenAPI şeması ↔ projeksiyon (teknik katmanda hüküm yok) · B) BAĞIMSIZ On Porutham: Ay konumu
 *   (astronomy-engine + Lahiri) + klasik kurallar; ekol farkları; rol takası kural beklentisi · C) BAĞIMSIZ Papasamyam: A D1
 *   golden'ından, B astronomy-engine'den (Lagna / Ay / Venüs / malefikler); toplamlar · D) fail-closed · E) motor: plan / gövde /
 *   önbellek / rol takası / Gun Milan'dan ayrı anahtar / Ay bağlamı · F) saat yok · G) kaydet → aç 0 istek · H) Word/PDF ·
 *   I) yorum kapısı + sızma · J) tenant / uzman 404 · K) Gun Milan + 16 mevcut teknik girdi özeti SABİT · L) not / KB ·
 *   M) UI yardımcıları + Yakında · N) golden klasörü.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/vedik-eslesme-2.harness.ts
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as AE from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { projectRoxyVedicDashakoot, projectRoxyVedicPapasamyam, ROXY_VEDIC_DASHAKOOT, ROXY_VEDIC_PAPASAMYAM } from "@/lib/astrology/providers/roxy/vedicPorutham";
import { vedicCompatibilityBody } from "@/lib/astrology/providers/roxy/vedicMatchRequests";
import { ROXY_VEDIC_COMPATIBILITY } from "@/lib/astrology/providers/roxy/vedicMatch";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, buildCombinedAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { hasNoProviderInterpretation } from "@/lib/astrology/noProviderInterp";
import { isSectionKeyForTechnique, topicsForTechnique, TECHNIQUE_TOPIC_CONTEXT } from "@/lib/astrology/topics/index";
import { parseVedicTopicKey, VEDIC_CONTEXTS } from "@/lib/astrology/topics/vedic";
import { NAKSHATRAS } from "@/lib/astrology/model/vedic";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_LORDS } from "@/lib/astrology/model/kp";
import { nakshatraIdOf, PORUTHAM_IDS } from "@/lib/astrology/model/vedicPorutham";
import { buildSelections, defaultParams, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import { AVAILABLE_TECHNIQUES, COMING_SOON_AVAILABLE_AS, visibleComingSoonSections } from "@/app/admin/astroloji/_lib/comingSoon";
import { SYNTH_A, SYNTH_B } from "./golden/phase3-golden-calls";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const ROOT = join(__dirname, "..", "..");
const GDIR = join(__dirname, "fixtures", "golden");
const G = (n: string) => JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")) as { endpoint: string; body: Record<string, unknown>; fetchedAt?: string; response: J };
const DK = G("vedic-dashakoot");
const PS = G("vedic-papasamyam");
/** Rol takaslı gerçek yanıtlar (gövde: vedicCompatibilityBody(SYNTH_B, SYNTH_A, "lahiri")). */
const DKS = G("vedic-dashakoot-swap");
const PSS = G("vedic-papasamyam-swap");
const GM = G("vedic-gun-milan");
const D1 = G("vedic-d1");
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

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

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const USER_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const ANKARA: ResolvedLocation = { id: "tr-06-ankara", label: "Ankara, Türkiye", timezone: "Europe/Istanbul", latitude: 39.9334, longitude: 32.8597 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : id === ANKARA.id ? ANKARA : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = resolveAstrologyEntitlements({ isOwner: false, role: "expert", flags: { astrology: true, astrology_provider_interp: false } });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

/** Sahte sağlayıcı: YALNIZ gerçek golden'ı olan BİREBİR gövde + uca o yanıtı döner; başka → 400 (sonuç uydurulmaz). */
const FIXTURES = [DK, PS, DKS, PSS, GM, D1];
function roxy(mutate?: (endpoint: string, r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-ve2", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      const hit = FIXTURES.find((f) => f.endpoint === endpoint && canon(f.body) === canon(body));
      if (!hit) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(hit.response);
      mutate?.(endpoint, r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profileA(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
async function profileB(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik B", birthDate: "1988-03-21", birthTime: "06:45", timeKnown: true, timeAccuracy: "exact_record", locationId: ANKARA.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const DSEL = (partnerProfileId: string, extra: Record<string, unknown> = {}) => ({ technique: "vedic.dashakoot", options: { partnerProfileId, ayanamsa: "lahiri", ...extra } });
const PSEL = (partnerProfileId: string, extra: Record<string, unknown> = {}) => ({ technique: "vedic.papasamyam", options: { partnerProfileId, ayanamsa: "lahiri", ...extra } });
const D1SEL = { technique: "vedic.d1", options: { ayanamsa: "lahiri" } };
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, hide = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: hide });
/** Sağlayıcının hüküm / öneri / açıklama cümleleri (yorum katmanı) — sızma testinde aranır. */
const PROVIDER_TEXT: string[] = [
  ...[DK, DKS].flatMap((d) => [d.response.recommendation, d.response.rajju.reason, d.response.vedha.reason, ...(d.response.breakdown as J[]).map((b) => b.note)]),
  PS.response.recommendation,
  PSS.response.recommendation,
];

// ═══ Bağımsız klasik kurallar (yalnız test; ürün kodunda DEĞİL) ═══════════════════════════════════════════════
const NAK_SPAN = 360 / 27;
/** Lahiri (Chitrapaksha) yaklaşık: J2000'de 23°51′11″ + 50,2788″/yıl. */
const lahiri = (tm: AE.AstroTime) => 23.85305 + (tm.ut / 365.25) * (50.2788 / 3600);
/** Bağımsız sidereal harita: Lagna (klasik yükselen formülü), Ay, Venüs, Güneş, Mars, Satürn, Rahu (ortalama düğüm). */
function indepChart(iso: string, lat: number, lon: number) {
  const tm = AE.MakeTime(new Date(iso));
  const ay = lahiri(tm);
  const sid = (b: AE.Body) => (AE.Ecliptic(AE.GeoVector(b, tm, true)).elon - ay + 720) % 360;
  const T = tm.tt / 36525;
  const rahu = ((((125.04452 - 1934.136261 * T) % 360) + 360 - ay + 720) % 360) % 360;
  const lst = (((AE.SiderealTime(tm) * 15 + lon) % 360) + 360) % 360;
  const eps = 23.4392911 - 0.0130042 * T;
  const r = Math.PI / 180;
  const asc = (Math.atan2(Math.cos(lst * r), -(Math.sin(lst * r) * Math.cos(eps * r) + Math.tan(lat * r) * Math.sin(eps * r))) / r + 360) % 360;
  return { ay, lagna: (asc - ay + 360) % 360, moon: sid(AE.Body.Moon), venus: sid(AE.Body.Venus), sun: sid(AE.Body.Sun), mars: sid(AE.Body.Mars), saturn: sid(AE.Body.Saturn), rahu };
}
const signIdx = (lon: number) => Math.floor(lon / 30) % 12;
/** Kaynak: Steve Hora (2020) / findyourfate 10 porutham — Dina: gelinden damada sayım 2,4,6,8,9,11,13,15,18,20,24,26 uygun. */
const DINA_GOOD = [2, 4, 6, 8, 9, 11, 13, 15, 18, 20, 24, 26];
/** Mahendra: gelinden damada 4,7,10,13,16,19,22,25 (findyourfate 19'u atlar; Steve Hora yönü damattan geline yazar). */
const MAHENDRA = [4, 7, 10, 13, 16, 19, 22, 25];
const GANA_DEVA = [0, 4, 6, 7, 12, 14, 16, 21, 26];
const GANA_MANUSHYA = [1, 3, 5, 10, 11, 19, 20, 24, 25];
const ganaOf = (n: number) => (GANA_DEVA.includes(n) ? "deva" : GANA_MANUSHYA.includes(n) ? "manushya" : "rakshasa");
const YONI = ["horse", "elephant", "sheep", "serpent", "serpent", "dog", "cat", "sheep", "cat", "rat", "rat", "cow", "buffalo", "tiger", "buffalo", "tiger", "deer", "deer", "dog", "monkey", "mongoose", "monkey", "lion", "horse", "lion", "cow", "elephant"];
const YONI_ENEMY = [["horse", "buffalo"], ["elephant", "lion"], ["sheep", "monkey"], ["serpent", "mongoose"], ["dog", "deer"], ["cat", "rat"], ["cow", "tiger"]];
/** Rajju: dokuzlu döngü Paada, Kati, Udara, Kantha, Siro, Kantha, Udara, Kati, Paada. */
const RAJJU_CYCLE = ["paada", "kati", "udara", "kantha", "siro", "kantha", "udara", "kati", "paada"];
const rajjuOf = (n: number) => RAJJU_CYCLE[n % 9];
/** Vedha çiftleri (13; Chitra yok). */
const VEDHA: [string, string][] = [["ashwini", "jyeshtha"], ["bharani", "anuradha"], ["krittika", "vishakha"], ["rohini", "swati"], ["ardra", "shravana"], ["punarvasu", "uttara_ashadha"], ["pushya", "purva_ashadha"], ["ashlesha", "mula"], ["magha", "revati"], ["purva_phalguni", "uttara_bhadrapada"], ["uttara_phalguni", "purva_bhadrapada"], ["hasta", "shatabhisha"], ["mrigashira", "dhanishta"]];
/** Vasya (Güney Hint tablosu; findyourfate): burç → çektiği burçlar. */
const VASYA: Record<SignId, SignId[]> = { aries: ["leo", "scorpio"], taurus: ["cancer", "libra"], gemini: ["virgo"], cancer: ["scorpio", "sagittarius"], leo: ["libra"], virgo: ["pisces", "gemini"], libra: ["virgo", "capricorn"], scorpio: ["cancer"], sagittarius: ["pisces"], capricorn: ["aries", "aquarius"], aquarius: ["aries"], pisces: ["capricorn"] };
const FRIENDS: Record<string, { f: string[]; e: string[] }> = {
  sun: { f: ["moon", "mars", "jupiter"], e: ["venus", "saturn"] },
  moon: { f: ["sun", "mercury"], e: [] },
  mars: { f: ["sun", "moon", "jupiter"], e: ["mercury"] },
  mercury: { f: ["sun", "venus"], e: ["moon"] },
  jupiter: { f: ["sun", "moon", "mars"], e: ["mercury", "venus"] },
  venus: { f: ["mercury", "saturn"], e: ["sun", "moon"] },
  saturn: { f: ["mercury", "venus"], e: ["sun", "moon", "mars"] },
};
const cnt = (from: number, to: number, n: number) => ((to - from + n) % n) + 1;
/** Bağımsız 10 porutham (groom = damat, bride = gelin; nakshatra dizini 0–26, burç 0–11). Sağlayıcı ekolüne göre (aşağıda belgeli). */
function poruthams(groomN: number, brideN: number, groomS: number, brideS: number) {
  const c = cnt(brideN, groomN, 27);
  const rc = cnt(brideS, groomS, 12);
  const gG = ganaOf(groomN);
  const gB = ganaOf(brideN);
  const lG = SIGN_LORDS[SIGN_IDS[groomS]];
  const lB = SIGN_LORDS[SIGN_IDS[brideS]];
  const yG = YONI[groomN];
  const yB = YONI[brideN];
  const nG = NAKSHATRAS[groomN];
  const nB = NAKSHATRAS[brideN];
  return {
    count: c,
    rasiCount: rc,
    dina: DINA_GOOD.includes(c),
    gana: gG === gB || (gG !== "rakshasa" && gB !== "rakshasa"),
    mahendra: MAHENDRA.includes(c),
    stree_deergha: c > 13,
    yoni: !YONI_ENEMY.some(([a, b]) => (a === yG && b === yB) || (a === yB && b === yG)),
    // Sağlayıcı ekolü: gelinden damada 6., 8. ve 12. sayım karşılanmaz, diğerleri karşılanır (sağlayıcının kendi satır notu: "Rasi
    // kuralının reddettiği 6., 8. ve 12. konumlar"; iki gerçek yanıt: varsayılan sıra 12 → 0, rol takası 2 → 1). findyourfate 2 ve 4'ü de
    // karşılanmamış sayar → ekol farkı (E), aşağıda belgelenir. (İlk sürümdeki Bhakoot tipi 2/12·6/8·5/9 varsayımı takaslı gerçek
    // yanıtla ÇÜRÜDÜ: 2. sayım sağlayıcıda karşılanıyor.)
    rasi: ![6, 8, 12].includes(rc),
    rasyadhipati: lG === lB || (FRIENDS[lG].f.includes(lB) && FRIENDS[lB].f.includes(lG)),
    vasya: VASYA[SIGN_IDS[brideS]].includes(SIGN_IDS[groomS]) || VASYA[SIGN_IDS[groomS]].includes(SIGN_IDS[brideS]),
    rajju: rajjuOf(groomN) !== rajjuOf(brideN),
    vedha: !VEDHA.some(([a, b]) => (a === nG && b === nB) || (a === nB && b === nG)),
  };
}

async function main() {
  // ═══ A) GOLDEN ↔ ŞEMA ↔ PROJEKSİYON ═════════════════════════════════════════════
  await t("A: golden gövdeler ürün üreticisiyle BİREBİR (person1 = A / damat rolü, person2 = B / gelin rolü; lahiri; ofsetler açık); uçlar", () => {
    const body = vedicCompatibilityBody(SYNTH_A, SYNTH_B, "lahiri");
    assert.equal(canon(DK.body), canon(body));
    assert.equal(canon(PS.body), canon(body));
    assert.equal(canon(DK.body), canon(GM.body), "Gun Milan ile AYNI iki kişi gövdesi (yalnız uç farklı)");
    assert.deepEqual([DK.endpoint, PS.endpoint], [ROXY_VEDIC_DASHAKOOT.endpoint, ROXY_VEDIC_PAPASAMYAM.endpoint]);
    assert.equal((DK.body as J).person2.timezone, 2);
  });

  await t("A: gerçek yanıt ↔ OpenAPI 2.0.0 şeması — zorunlu alanların tamamı var, şemada olmayan alan yok, enum değerleri şemada (FARK YOK)", () => {
    // OpenAPI DashakootResponse / PapasamyamResponse (C:/YasamSistemi-QA/ATLAS-ROXY-KALAN-2026-10-22/ham/openapi-guncel.json) — alan listeleri.
    const D_TOP = ["frame", "total", "maxTotal", "verdict", "recommendation", "rajju", "vedha", "breakdown"];
    const D_ROW = ["name", "points", "maxPoints", "verdict", "person1", "person2", "note"];
    const P_TOP = ["frame", "person1", "person2", "verdict", "recommendation"];
    assert.deepEqual(Object.keys(DK.response).sort(), [...D_TOP].sort());
    for (const r of DK.response.breakdown as J[]) assert.deepEqual(Object.keys(r).sort(), [...D_ROW].sort());
    assert.deepEqual(Object.keys(DK.response.rajju).sort(), ["active", "reason"]);
    assert.deepEqual(Object.keys(DK.response.frame).sort(), ["ayanamsa", "ayanamsaDegrees"]);
    assert.deepEqual((DK.response.breakdown as J[]).map((b) => b.name), ["Dina", "Gana", "Mahendra", "Stree Deergha", "Yoni", "Rasi", "Rasyadhipati", "Vasya", "Rajju", "Vedha"]);
    assert.ok(["recommended", "marginal", "rejected"].includes(DK.response.verdict));
    assert.deepEqual(Object.keys(PS.response).sort(), [...P_TOP].sort());
    for (const p of [PS.response.person1, PS.response.person2]) {
      assert.deepEqual(Object.keys(p).sort(), ["byReference", "total"]);
      assert.deepEqual(p.byReference.map((x: J) => [x.reference, x.weight]), [["Lagna", 1], ["Moon", 0.5], ["Venus", 0.25]]);
      for (const x of p.byReference) for (const a of x.afflictions) assert.deepEqual(Object.keys(a).sort(), ["graha", "house"]);
    }
    assert.ok(["balanced", "unbalanced"].includes(PS.response.verdict));
  });

  await t("A: Dashakoot golden → 7/10, 10 kriter Tamil sırasında, Rajju (Paada / Kati) ve Vedha etkin değil; türetilmiş sayım 26 / Rasi 12; bilinmeyen alan 0", () => {
    const r = projectRoxyVedicDashakoot(DK.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    const x = r.technical;
    assert.equal(x.total, 7);
    assert.equal(x.maxTotal, 10);
    assert.deepEqual(x.rows.map((k) => k.id), [...PORUTHAM_IDS]);
    assert.deepEqual(x.rows.map((k) => k.points), [1, 1, 0, 1, 1, 0, 1, 0, 1, 1]);
    assert.deepEqual(x.rajju, { active: false, person1: "paada", person2: "kati" });
    assert.deepEqual(x.vedha, { active: false, person1: "Revati", person2: "Bharani" });
    assert.deepEqual(x.rows.filter((k) => k.count !== undefined).map((k) => [k.id, k.count]), [["dina", 26], ["mahendra", 26], ["stree_deergha", 26], ["rasi", 12]]);
    assert.equal(x.rows.find((k) => k.id === "yoni")!.person1.label, "Fil");
    assert.equal(x.rows.find((k) => k.id === "rasi")!.person1.label, "Balık");
    assert.equal(x.rows.find((k) => k.id === "rasyadhipati")!.person2.label, "Mars (Mangala)");
    assert.equal(x.rows.find((k) => k.id === "rajju")!.person1.label, "Paada (ayak)");
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(r.droppedValues, []);
    // Sağlayıcı notundaki sayımlar (26 / 12) türetilmiş sayımla aynı (not metni teknik katmana girmez, yalnız burada karşılaştırılır).
    assert.ok(DK.response.breakdown[0].note.includes("26") && DK.response.breakdown[5].note.includes("12"));
  });

  await t("A: hüküm dili yalnız yorum katmanında — teknik katmanda verdict / recommendation / 'tavsiye' / satır notu / kısıt cümlesi YOK", () => {
    const r = projectRoxyVedicDashakoot(DK.response, { ayanamsa: "lahiri" });
    const p = projectRoxyVedicPapasamyam(PS.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok && p.ok);
    if (!r.ok || !p.ok) return;
    const s = JSON.stringify([r.technical, p.technical]);
    for (const bad of ["tavsiye", "recommend", "verdict", "rejected", "balanced", "reddedil", ...PROVIDER_TEXT]) assert.ok(!s.includes(bad), `teknik katmanda: ${String(bad).slice(0, 50)}`);
    assert.equal(r.interpretation?.verdict, "recommended");
    assert.equal(r.interpretation?.recommendation, DK.response.recommendation);
    assert.equal(r.interpretation?.notes.length, 10);
    assert.equal(r.interpretation?.rajjuReason, DK.response.rajju.reason);
    assert.deepEqual(p.interpretation, { schema: "astro.vedic.papasamyam.interp.v1", verdict: "balanced", recommendation: PS.response.recommendation });
  });

  await t("A: Papasamyam golden → 1. rol 3,75 / 2. rol 2,75; referans katkıları; karşılaştırma 'within', fark 1; bilinmeyen alan 0", () => {
    const r = projectRoxyVedicPapasamyam(PS.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    const x = r.technical;
    assert.deepEqual([x.person1.total, x.person2.total, x.comparison, x.difference], [3.75, 2.75, "within", 1]);
    assert.deepEqual(x.person1.byReference.map((b) => [b.reference, b.weight, b.afflictions.map((a) => `${a.graha}${a.house}`).join(","), b.points]), [
      ["lagna", 1, "mars7,rahu4", 2],
      ["moon", 0.5, "mars2,sun4", 1],
      ["venus", 0.25, "saturn7,sun1,rahu8", 0.75],
    ]);
    assert.deepEqual(x.person2.byReference.map((b) => b.points), [2, 0.5, 0.25]);
    assert.deepEqual(r.unmappedFields, []);
  });

  await t("A: ROL TAKASLI gerçek golden'lar — gövde ürün üreticisinin takaslı gövdesiyle BİREBİR (person1 = B, person2 = A); şema alanları aynı; varsayılan golden'larla aynı DEĞİL", () => {
    const sw = vedicCompatibilityBody(SYNTH_B, SYNTH_A, "lahiri");
    assert.equal(canon(DKS.body), canon(sw));
    assert.equal(canon(PSS.body), canon(sw));
    assert.notEqual(canon(DKS.body), canon(DK.body));
    assert.deepEqual([DKS.endpoint, PSS.endpoint], [ROXY_VEDIC_DASHAKOOT.endpoint, ROXY_VEDIC_PAPASAMYAM.endpoint]);
    assert.deepEqual(Object.keys(DKS.response).sort(), Object.keys(DK.response).sort());
    assert.deepEqual(Object.keys(PSS.response).sort(), Object.keys(PS.response).sort());
    assert.deepEqual((DKS.response.breakdown as J[]).map((b) => b.name), (DK.response.breakdown as J[]).map((b) => b.name));
    // Çerçeve ayanamsası person1'in doğum anına göre (B 1988 → 23,693°; A 1990 → 23,729°) — istenen ayanamsa her ikisinde lahiri.
    assert.equal(DKS.response.frame.ayanamsa, "lahiri");
    assert.ok(DKS.response.frame.ayanamsaDegrees < DK.response.frame.ayanamsaDegrees);
  });

  await t("A: Dashakoot TAKAS golden → 6/10; satırlar [0,1,0,0,1,1,1,0,1,1]; sayım 3 / Rasi 2; Rajju (Kati / Paada) ve Vedha etkin değil; bilinmeyen alan 0", () => {
    const r = projectRoxyVedicDashakoot(DKS.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    const x = r.technical;
    assert.equal(x.total, 6);
    assert.deepEqual(x.rows.map((k) => k.points), [0, 1, 0, 0, 1, 1, 1, 0, 1, 1]);
    assert.deepEqual(x.rows.filter((k) => k.count !== undefined).map((k) => [k.id, k.count]), [["dina", 3], ["mahendra", 3], ["stree_deergha", 3], ["rasi", 2]]);
    assert.deepEqual(x.rajju, { active: false, person1: "kati", person2: "paada" });
    assert.deepEqual(x.vedha, { active: false, person1: "Bharani", person2: "Revati" });
    assert.equal(x.rows.find((k) => k.id === "rasi")!.person1.label, "Koç");
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(r.droppedValues, []);
    assert.equal(r.interpretation?.verdict, "recommended");
    // Sağlayıcı notundaki sayımlar (3 / 2) türetilmiş sayımla aynı; Rasi notu sağlayıcının kuralını kendisi belirtir (6, 8, 12).
    assert.ok(DKS.response.breakdown[0].note.includes("3") && DKS.response.breakdown[5].note.includes("2"));
    assert.ok(/6\., 8\. ve 12\./.test(DKS.response.breakdown[5].note), "sağlayıcı Rasi kuralı: 6., 8. ve 12. konum");
    // Varsayılan sıra ile fark yalnız yönlü kriterlerde: Dina, Stree Deergha (1 → 0) ve Rasi (0 → 1); Mahendra / Vasya iki yönde de 0.
    const d = projectRoxyVedicDashakoot(DK.response, { ayanamsa: "lahiri" });
    assert.ok(d.ok);
    if (!d.ok) return;
    const diff = x.rows.filter((k, i) => k.points !== d.technical.rows[i].points).map((k) => k.id);
    assert.deepEqual(diff, ["dina", "stree_deergha", "rasi"]);
  });

  await t("A: Papasamyam TAKAS golden → 1. rol (B) 2,75 / 2. rol (A) 3,75; karşılaştırma 'exceeds', fark −1; hüküm 'unbalanced' (yorum katmanında); kişi toplamları kişiye bağlı", () => {
    const r = projectRoxyVedicPapasamyam(PSS.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    const x = r.technical;
    assert.deepEqual([x.person1.total, x.person2.total, x.comparison, x.difference], [2.75, 3.75, "exceeds", -1]);
    assert.deepEqual(r.unmappedFields, []);
    assert.equal(r.interpretation?.verdict, "unbalanced");
    // Kişi katkıları rol değişince değişmez: takasta person1 = varsayılandaki person2, person2 = varsayılandaki person1.
    assert.equal(canon(PSS.response.person1), canon(PS.response.person2));
    assert.equal(canon(PSS.response.person2), canon(PS.response.person1));
  });

  // ═══ B) BAĞIMSIZ ON PORUTHAM ══════════════════════════════════════════════════
  const A = indepChart(SYNTH_A.utc, 41.0082, 28.9784);
  const B = indepChart(SYNTH_B.utc, 39.9334, 32.8597);
  const nA = Math.floor(A.moon / NAK_SPAN);
  const nB = Math.floor(B.moon / NAK_SPAN);
  const sA = signIdx(A.moon);
  const sB = signIdx(B.moon);
  await t("B: bağımsız Ay — A Revati 4 (Balık 29,24°), B Bharani 2 (Koç 19,0°); ayanamsa sağlayıcıyla ±0,02°; sınır payı > 0,5°", () => {
    assert.deepEqual([NAKSHATRAS[nA], NAKSHATRAS[nB], SIGN_IDS[sA], SIGN_IDS[sB]], ["revati", "bharani", "pisces", "aries"]);
    assert.equal(Math.floor((A.moon % NAK_SPAN) / (NAK_SPAN / 4)) + 1, 4);
    assert.equal(Math.floor((B.moon % NAK_SPAN) / (NAK_SPAN / 4)) + 1, 2);
    assert.ok(Math.abs(A.ay - DK.response.frame.ayanamsaDegrees) < 0.02);
    assert.ok(360 - A.moon > 0.5 && B.moon - NAK_SPAN > 0.5 && 2 * NAK_SPAN - B.moon > 0.5, "nakshatra sınırına yakın değil");
    assert.equal(nakshatraIdOf(DK.response.breakdown[0].person1, NAKSHATRAS), "revati");
  });

  await t("B: 10 porutham bağımsız klasik kurallarla ↔ sağlayıcı — 10/10 kriter sonucu ve sınıflamalar BİREBİR (toplam 7)", () => {
    const ind = poruthams(nA, nB, sA, sB);
    const bd = Object.fromEntries((DK.response.breakdown as J[]).map((b) => [b.name, b]));
    const map: [string, keyof typeof ind][] = [["Dina", "dina"], ["Gana", "gana"], ["Mahendra", "mahendra"], ["Stree Deergha", "stree_deergha"], ["Yoni", "yoni"], ["Rasi", "rasi"], ["Rasyadhipati", "rasyadhipati"], ["Vasya", "vasya"], ["Rajju", "rajju"], ["Vedha", "vedha"]];
    for (const [name, k] of map) assert.equal(ind[k] ? 1 : 0, bd[name].points, `${name}: bağımsız ${ind[k]} ↔ sağlayıcı ${bd[name].points}`);
    assert.equal(map.filter(([, k]) => ind[k]).length, DK.response.total);
    assert.deepEqual([ind.count, ind.rasiCount], [26, 12]);
    assert.deepEqual([ganaOf(nA), ganaOf(nB)], ["deva", "manushya"]);
    assert.deepEqual([bd.Gana.person1, bd.Gana.person2].map((x: string) => x.toLowerCase()), ["deva", "manushya"]);
    assert.deepEqual([YONI[nA], YONI[nB]], ["elephant", "elephant"]);
    assert.deepEqual([rajjuOf(nA), rajjuOf(nB)], ["paada", "kati"]);
    assert.deepEqual([bd.Rajju.person1, bd.Rajju.person2].map((x: string) => x.toLowerCase()), ["paada", "kati"]);
    assert.deepEqual([SIGN_LORDS[SIGN_IDS[sA]], SIGN_LORDS[SIGN_IDS[sB]]], ["jupiter", "mars"]);
    // Rajju döngüsü klasik gruplarla aynı (Revati / Ashwini / Magha / Mula / Ashlesha / Jyeshtha = Paada; Mrigashira / Chitra / Dhanishta = Siro).
    for (const n of ["ashwini", "ashlesha", "magha", "jyeshtha", "mula", "revati"]) assert.equal(rajjuOf(NAKSHATRAS.indexOf(n as never)), "paada", n);
    for (const n of ["mrigashira", "chitra", "dhanishta"]) assert.equal(rajjuOf(NAKSHATRAS.indexOf(n as never)), "siro", n);
    assert.equal(new Set(VEDHA.flat()).size, 26, "13 vedha çifti, Chitra hiçbirinde yok");
    assert.ok(!VEDHA.flat().includes("chitra"));
  });

  await t("B: EKOL FARKLARI belgelenir — Rasi 12 (bir kaynak 1,7,8,9,10,12'yi uygun sayar → 8/10), Gana Deva damat–Manushya gelin (findyourfate yalnız gelin Deva–damat Manushya'yı ikincil uygun sayar → 6/10), Mahendra yönü (iki yönde de karşılanmıyor); takasta Rasi 2 (fyf karşılanmaz → 5/10, sağlayıcı karşılanır → gerçek 6/10)", () => {
    const bd = Object.fromEntries((DK.response.breakdown as J[]).map((b) => [b.name, b]));
    const rc = cnt(sB, sA, 12);
    assert.equal(rc, 12);
    const RASI_ALT_GOOD = [1, 7, 8, 9, 10, 12]; // astromitra porutham hesaplayıcı özeti
    const RASI_FYF_BAD = [2, 4, 6, 8, 12]; // findyourfate / "What is Star Matching"
    assert.equal(bd.Rasi.points, 0);
    assert.equal(RASI_FYF_BAD.includes(rc), true, "findyourfate kuralı sağlayıcıyla aynı (12 uygun değil)");
    assert.equal(RASI_ALT_GOOD.includes(rc), true, "alternatif kural farklı (12 uygun) → toplam 8 olurdu");
    // Gana: sağlayıcı Deva–Manushya'yı yönsüz uygun sayıyor; findyourfate yalnız "gelin Deva, damat Manushya"yı ikincil uygun sayar.
    assert.deepEqual([ganaOf(nA), ganaOf(nB)], ["deva", "manushya"]);
    assert.equal(bd.Gana.points, 1);
    // Mahendra: sağlayıcı/fyf gelinden damada (26), Steve Hora damattan geline (3) — ikisi de listede değil → fark yok.
    assert.equal(MAHENDRA.includes(cnt(nB, nA, 27)) || MAHENDRA.includes(cnt(nA, nB, 27)), false);
    assert.equal(bd.Mahendra.points, 0);
    // Stree Deergha eşiği: >13 (fyf, Steve Hora) — bazı kaynaklar >9 madhyama der; 26 her iki eşikte de karşılanır.
    assert.equal(bd["Stree Deergha"].points, 1);
    // Rasi ekolü (takaslı gerçek yanıtla netleşti): sağlayıcı yalnız 6 / 8 / 12'yi karşılanmamış sayar; fyf 2 ve 4'ü de → 2. sayımda ayrışır.
    const sbd = Object.fromEntries((DKS.response.breakdown as J[]).map((b) => [b.name, b]));
    assert.equal(cnt(sA, sB, 12), 2);
    assert.deepEqual([sbd.Rasi.points, RASI_FYF_BAD.includes(2) ? 0 : 1], [1, 0], "takasta Rasi: sağlayıcı 1, fyf 0 — ekol farkı (E), sağlayıcı hatası değil");
  });

  await t("B: ROL TAKASI bağımsız kurallar ↔ GERÇEK takaslı yanıt — B damat / A gelin: sayım 3, Rasi 2 → 10/10 kriter BİREBİR, toplam 6/10 (önceki kural beklentisi 5/10 idi; fark yalnız Rasi = ekol farkı, sağlayıcı 2. sayımı karşılanmış sayar)", () => {
    const sw = poruthams(nB, nA, sB, sA);
    assert.deepEqual([sw.count, sw.rasiCount], [3, 2]);
    assert.deepEqual([sw.dina, sw.mahendra, sw.stree_deergha, sw.vasya], [false, false, false, false]);
    assert.deepEqual([sw.gana, sw.yoni, sw.rasi, sw.rasyadhipati, sw.rajju, sw.vedha], [true, true, true, true, true, true]);
    const bd = Object.fromEntries((DKS.response.breakdown as J[]).map((b) => [b.name, b]));
    const map: [string, keyof typeof sw][] = [["Dina", "dina"], ["Gana", "gana"], ["Mahendra", "mahendra"], ["Stree Deergha", "stree_deergha"], ["Yoni", "yoni"], ["Rasi", "rasi"], ["Rasyadhipati", "rasyadhipati"], ["Vasya", "vasya"], ["Rajju", "rajju"], ["Vedha", "vedha"]];
    for (const [name, k] of map) assert.equal(sw[k] ? 1 : 0, bd[name].points, `takas ${name}: bağımsız ${sw[k]} ↔ sağlayıcı ${bd[name].points}`);
    const total = map.filter(([, k]) => sw[k]).length;
    assert.equal(total, 6);
    assert.equal(total, DKS.response.total, "takasta gerçek toplam 6 (varsayılan sırada 7) — yönlü kriterler gerçekten sıraya duyarlı");
    // Ekol notu: findyourfate kuralıyla (2, 4, 6, 8, 12 karşılanmaz) Rasi 0 → 5/10 olurdu; ilk sürümdeki 5/10 beklentisi bu kuraldandı.
    const RASI_FYF_BAD = [2, 4, 6, 8, 12];
    assert.equal(RASI_FYF_BAD.includes(sw.rasiCount), true);
    assert.equal(bd.Rasi.points, 1, "sağlayıcı 2. sayımı karşılanmış sayar (kendi notu: yalnız 6., 8. ve 12. konum reddedilir)");
    assert.equal(total - 1, 5, "findyourfate ekolüyle 5/10");
    // Simetrik kriterlerin sınıflamaları rol değişince yer değiştirir (Rajju Kati / Paada; Gana Manushya / Deva).
    assert.deepEqual([bd.Rajju.person1, bd.Rajju.person2].map((x: string) => x.toLowerCase()), ["kati", "paada"]);
    assert.deepEqual([bd.Gana.person1, bd.Gana.person2].map((x: string) => x.toLowerCase()), ["manushya", "deva"]);
    // Papasamyam takası: kişi toplamları kişiye bağlı (3,75 / 2,75) → takasta 2. rol 3,75 > 1. rol 2,75 → karşılaştırma kuralı sağlanmaz (gerçek yanıtla aynı).
    assert.ok(PS.response.person1.total > PS.response.person2.total);
    assert.deepEqual([PSS.response.person1.total, PSS.response.person2.total, PSS.response.verdict], [2.75, 3.75, "unbalanced"]);
  });

  // ═══ C) BAĞIMSIZ PAPASAMYAM ═══════════════════════════════════════════════════
  type Ch = { lagna: number; moon: number; venus: number; sun: number; mars: number; saturn: number; rahu: number };
  const papa = (c: Ch) => {
    const out: Record<string, string[]> = { lagna: [], moon: [], venus: [] };
    let total = 0;
    for (const [ref, w] of [["lagna", 1], ["moon", 0.5], ["venus", 0.25]] as const)
      for (const g of ["mars", "saturn", "sun", "rahu"] as const) {
        const h = cnt(signIdx(c[ref]), signIdx(c[g]), 12);
        if ([1, 2, 4, 7, 8, 12].includes(h)) {
          out[ref].push(`${g}${h}`);
          total += w;
        }
      }
    return { out, total };
  };
  const provSet = (p: J) => Object.fromEntries(p.byReference.map((x: J) => [x.reference.toLowerCase(), x.afflictions.map((a: J) => `${a.graha.toLowerCase()}${a.house}`).sort()]));
  await t("C: Papasamyam A — D1 golden (aynı kişi A) burçlarından bağımsız sayım: Lagna Terazi, Ay Balık, Venüs İkizler → 3,75 ve katkılar BİREBİR", () => {
    const planets = (Object.values(D1.response) as J[]).flatMap((x) => (x && Array.isArray(x.signs) ? x.signs : []));
    const lon = (n: string) => planets.find((g: J) => g.graha === n).longitude as number;
    const mars = planets.find((g: J) => g.graha === "Mars");
    const lagnaSign = (signIdx(lon("Mars")) - (mars.house - 1) + 12) % 12; // D1 bütün-burç evi → Lagna burcu
    assert.equal(SIGN_IDS[lagnaSign], "libra");
    const c: Ch = { lagna: lagnaSign * 30 + 15, moon: lon("Moon"), venus: lon("Venus"), sun: lon("Sun"), mars: lon("Mars"), saturn: lon("Saturn"), rahu: lon("Rahu") };
    const r = papa(c);
    assert.equal(r.total, 3.75);
    assert.equal(r.total, PS.response.person1.total);
    const ps = provSet(PS.response.person1);
    for (const k of ["lagna", "moon", "venus"]) assert.deepEqual(r.out[k].sort(), ps[k], k);
    // astronomy-engine ile de aynı burçlar (Venüs İkizler 0,67° — sınıra yakın; belgelenir).
    for (const k of ["lagna", "moon", "venus", "sun", "mars", "saturn", "rahu"] as const) assert.equal(signIdx(A[k]), k === "lagna" ? lagnaSign : signIdx(c[k]), `A ${k}`);
    assert.ok(A.venus % 30 < 1, "Venüs İkizler'in ilk derecesinde — ayanamsa farkı 0,67°'yi aşarsa Venüs referanslı katkılar değişir");
  });

  await t("C: Papasamyam B — astronomy-engine + Lahiri bağımsız harita (Lagna Balık, Ay Koç, Venüs Koç; Mars / Satürn Yay, Rahu Kova) → 2,75 ve katkılar BİREBİR", () => {
    assert.deepEqual(["lagna", "moon", "venus", "sun", "mars", "saturn", "rahu"].map((k) => SIGN_IDS[signIdx(B[k as keyof Ch])]), ["pisces", "aries", "aries", "pisces", "sagittarius", "sagittarius", "aquarius"]);
    const r = papa(B);
    assert.equal(r.total, 2.75);
    assert.equal(r.total, PS.response.person2.total);
    const ps = provSet(PS.response.person2);
    for (const k of ["lagna", "moon", "venus"]) assert.deepEqual(r.out[k].sort(), ps[k], k);
    // Sınır payları: Lagna Balık 28,2° (1,8°), Rahu (ortalama düğüm) Kova 29,2° (0,8°) — gerçek düğümle Balık'a geçerse Lagna'dan 12 → 1 olur, toplam değişmez.
    assert.ok(30 - (B.lagna % 30) > 1.5 && 30 - (B.rahu % 30) > 0.5);
    assert.ok(r.total <= papa(A as Ch).total, "karşılaştırma: 2. rol ≤ 1. rol (astronomy-engine A ile de)");
  });

  // ═══ D) FAIL-CLOSED ═══════════════════════════════════════════════════════════
  await t("D: Dashakoot bozuk yanıtlar REDDEDİLİR (≥ 12 vaka: puan, sıra, toplam, maxTotal, sonuç tutarsızlığı, Rajju / Vedha / hüküm tutarlılığı, burç, yönetici, satırlar arası nakshatra, gana, uzuv, çerçeve)", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["puan 2", (r) => (r.breakdown[0].points = 2), "dina: puan"],
      ["sıra", (r) => ([r.breakdown[0], r.breakdown[1]] = [r.breakdown[1], r.breakdown[0]]), "breakdown[0]: sıra / ad (dina)"],
      ["9 kriter", (r) => r.breakdown.pop(), "breakdown: 10 porutham değil"],
      ["toplam", (r) => (r.total = 8), "total porutham toplamı değil"],
      ["maxTotal", (r) => (r.maxTotal = 36), "maxTotal 10 değil"],
      ["sonuç ↔ puan", (r) => (r.breakdown[2].verdict = "matched"), "mahendra: sonuç puanla tutarsız"],
      ["rajju üst düzey", (r) => (r.rajju.active = true), "rajju: üst düzey kısıt satırla tutarsız"],
      ["vedha üst düzey", (r) => (r.vedha.active = true), "vedha: üst düzey kısıt satırla tutarsız"],
      ["rajju aynı uzuv", (r) => (r.breakdown[8].person2 = "Paada"), "rajju: sonuç uzuvlarla tutarsız"],
      ["hüküm ↔ kısıt", (r) => (r.verdict = "rejected"), "verdict: kısıtlarla tutarsız"],
      ["burç", (r) => (r.breakdown[5].person1 = "Ophiuchus"), "rasi.person1: burç değil"],
      ["yönetici", (r) => (r.breakdown[6].person1 = "Venus"), "rasyadhipati: Ay burcu yöneticisi değil"],
      ["nakshatra satırları", (r) => (r.breakdown[2].person1 = "Ashwini"), "nakshatra: satırlar arası sınıflama tutarsız"],
      ["gana", (r) => (r.breakdown[1].person1 = "Asura"), "gana.person1: gana değil"],
      ["uzuv", (r) => (r.breakdown[8].person1 = "Kol"), "rajju.person1: Rajju uzvu değil"],
      ["çerçeve", (r) => (r.frame.ayanamsa = "raman"), "frame: istenen ayanamsa değil"],
      ["hüküm enum", (r) => (r.verdict = "maybe"), "verdict"],
      ["sınıflama metni", (r) => (r.breakdown[4].person1 = "<script>"), "yoni.person1: sınıflama"],
    ];
    for (const [n, m, e] of cases) {
      const raw = structuredClone(DK.response);
      m(raw);
      const r = projectRoxyVedicDashakoot(raw, { ayanamsa: "lahiri" });
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    for (const bad of [null, [], "x", 1]) assert.equal(projectRoxyVedicDashakoot(bad, { ayanamsa: "lahiri" }).ok, false);
    const extra = structuredClone(DK.response);
    extra.newField = 1;
    const ok = projectRoxyVedicDashakoot(extra, { ayanamsa: "lahiri" });
    assert.ok(ok.ok && ok.unmappedFields.includes("newField"), "bilinmeyen alan raporlanmalı");
    const unk = structuredClone(DK.response);
    for (const i of [0, 2, 3, 9]) unk.breakdown[i].person1 = "Abhijit";
    const u = projectRoxyVedicDashakoot(unk, { ayanamsa: "lahiri" });
    assert.ok(u.ok && u.droppedValues.includes("breakdown.dina.person1") && u.technical.rows[0].count === undefined, "tanınmayan nakshatra ham gösterilir, sayım yapılmaz");
    // Rajju etkin + hüküm rejected tutarlı vaka kabul edilir.
    const rj = structuredClone(DK.response);
    Object.assign(rj.breakdown[8], { person2: "Paada", points: 0, verdict: "unmatched" });
    Object.assign(rj, { total: 6, verdict: "rejected" });
    rj.rajju.active = true;
    const rjr = projectRoxyVedicDashakoot(rj, { ayanamsa: "lahiri" });
    assert.ok(rjr.ok && rjr.technical.rajju.active === true, !rjr.ok ? rjr.errors.join("; ") : "");
  });

  await t("D: Papasamyam bozuk yanıtlar REDDEDİLİR (≥ 9 vaka: toplam, ağırlık, referans sırası, malefik, ev, tekrar, hüküm ↔ karşılaştırma, çerçeve, eksik kişi)", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["toplam", (r) => (r.person1.total = 4), "person1.total katkı toplamı değil"],
      ["ağırlık", (r) => (r.person2.byReference[1].weight = 1), "person2.moon: ağırlık belgelenen değer değil"],
      ["sıra", (r) => r.person1.byReference.reverse(), "person1.byReference[0]: sıra / referans (lagna)"],
      ["malefik", (r) => (r.person1.byReference[0].afflictions[0].graha = "Jupiter"), "person1.lagna: malefik değil"],
      ["ev", (r) => (r.person2.byReference[0].afflictions[0].house = 3), "person2.lagna: etki evi değil"],
      ["tekrar", (r) => r.person2.byReference[2].afflictions.push({ graha: "Sun", house: 12 }), "person2.venus: tekrarlanan malefik"],
      ["hüküm", (r) => (r.verdict = "unbalanced"), "verdict: karşılaştırma kuralıyla tutarsız"],
      ["çerçeve", (r) => (r.frame.ayanamsa = "kp-old"), "frame: istenen ayanamsa değil"],
      ["eksik kişi", (r) => delete r.person2, "person2: nesne"],
      ["toplam > 7", (r) => (r.person1.total = 9), "person1.total"],
    ];
    for (const [n, m, e] of cases) {
      const raw = structuredClone(PS.response);
      m(raw);
      const r = projectRoxyVedicPapasamyam(raw, { ayanamsa: "lahiri" });
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    for (const bad of [null, [], "x"]) assert.equal(projectRoxyVedicPapasamyam(bad, { ayanamsa: "lahiri" }).ok, false);
    const unb = structuredClone(PS.response);
    [unb.person1, unb.person2] = [unb.person2, unb.person1];
    unb.verdict = "unbalanced";
    const u = projectRoxyVedicPapasamyam(unb, { ayanamsa: "lahiri" });
    assert.ok(u.ok && u.technical.comparison === "exceeds" && u.technical.difference === -1, "tutarlı 'dengesiz' vaka kabul");
  });

  // ═══ E) MOTOR ═════════════════════════════════════════════════════════════════
  await t("E: kayıt defteri + UI; iki kişili; saat gerektirir; Gun Milan'dan AYRI kimlik; yorum katmanı var; ayanamsa / rol seçeneği Gun Milan sözleşmesiyle", () => {
    for (const id of ["vedic.dashakoot", "vedic.papasamyam"] as const) {
      assert.ok((TECHNIQUE_IDS as readonly string[]).includes(id));
      assert.ok((UI_TECHNIQUES as readonly string[]).includes(id));
      const def = getTechnique(id)!;
      assert.equal(def.requiresPartner, true);
      assert.equal(def.requiresKnownTime, true);
      assert.equal(TECHNIQUE_META[id].needsPartner, true);
      assert.equal(TECHNIQUE_META[id].needsTime, true);
      assert.equal(hasNoProviderInterpretation(id), false);
      const pid = randomUUID();
      assert.equal(def.parseOptions({ ayanamsa: "lahiri" }, new Date()), null, "karşı taraf zorunlu");
      assert.deepEqual(Object.keys(def.parseOptions({ partnerProfileId: pid, ayanamsa: "lahiri" }, new Date())!).sort(), ["ayanamsa", "partnerProfileId", "partnerRevision"], "varsayılanda rol alanı YOK");
      assert.equal((def.parseOptions({ partnerProfileId: pid, order: "partner_first" }, new Date()) as J).order, "partner_first");
      assert.equal(def.parseOptions({ partnerProfileId: pid, order: "groom_first" }, new Date()), null);
      assert.equal(def.parseOptions({ partnerProfileId: pid, ayanamsa: "tropical" }, new Date()), null);
    }
    assert.equal(TECHNIQUE_IDS.filter((x) => x === "vedic.dashakoot" || x === "vedic.papasamyam").length, 2);
  });

  const def0 = () => getTechnique("vedic.dashakoot")!;
  const ctxU = {
    birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 },
    birthUtc: "1990-07-15T11:30:00Z",
    partner: { birthDate: "1988-03-21", birthTime: "06:45:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 },
  };
  await t("E: birim — gövde Gun Milan ile aynı ama ANAHTAR farklı (ayrı uç + adaptör); rol takası gövdeyi GERÇEKTEN takaslar ve anahtarı değiştirir", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    const pid = "00000000-0000-4000-8000-00000000abcd";
    const gm = getTechnique("vedic.gun_milan")!;
    const gmU = gm.units(ctxU, gm.parseOptions({ partnerProfileId: pid, ayanamsa: "lahiri" }, now)!)[0];
    const keys = new Set<string>([gmU.inputHash]);
    for (const id of ["vedic.dashakoot", "vedic.papasamyam"]) {
      const def = getTechnique(id)!;
      const u = def.units(ctxU, def.parseOptions({ partnerProfileId: pid, ayanamsa: "lahiri" }, now)!);
      const s = def.units(ctxU, def.parseOptions({ partnerProfileId: pid, ayanamsa: "lahiri", order: "partner_first" }, now)!);
      assert.equal(u.length, 1);
      assert.equal(canon(u[0].body), canon(gmU.body), "aynı iki kişi gövdesi");
      assert.equal(canon(u[0].body), canon(DK.body), "golden gövdesi");
      assert.equal(canon(s[0].body), canon(vedicCompatibilityBody(SYNTH_B, SYNTH_A, "lahiri")), "takas: person1 = karşı taraf");
      keys.add(u[0].inputHash);
      keys.add(s[0].inputHash);
    }
    assert.equal(keys.size, 5, "Gun Milan / Dashakoot / Papasamyam ve takaslı sürümleri ayrı anahtar");
    assert.equal(def0().contextUnits!(ctxU, { ayanamsa: "lahiri" })[0].inputHash, getTechnique("vedic.d1")!.units(ctxU, { ayanamsa: "lahiri" })[0].inputHash, "Dashakoot Ay bağlamı = vedic.d1 birimi");
  });

  await t("E: A + B Dashakoot + Papasamyam → plan 2 istek, çalıştırma 2 istek (gövde golden ile BİREBİR); tekrar 0 istek; plan 0", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    const plan = (await planAstrology(ctx, { profileId: pa, selections: [DSEL(pb), PSEL(pb)] })).body as J;
    assert.equal(plan.plan.newRequestCount, 2, JSON.stringify(plan.plan).slice(0, 400));
    const r1 = (await run(ctx, pa, [DSEL(pb), PSEL(pb)], rx.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 500));
    assert.deepEqual(rx.calls.map((c) => c.endpoint), [ROXY_VEDIC_DASHAKOOT.endpoint, ROXY_VEDIC_PAPASAMYAM.endpoint]);
    for (const c of rx.calls) assert.equal(canon(c.body), canon(DK.body));
    const [vd, vp] = r1.results.map((x: J) => x.view);
    assert.equal(vd.technical.schema, "astro.vedic.dashakoot.v1");
    assert.equal(vd.technical.total, 7);
    assert.equal(vd.technical.order, undefined, "varsayılanda rol alanı yazılmaz");
    assert.equal(vp.technical.schema, "astro.vedic.papasamyam.v1");
    assert.equal(vp.technical.comparison, "within");
    assert.equal(vd.interpretation.visible, true);
    assert.equal(vd.interpretation.content.schema, "astro.vedic.dashakoot.interp.v1");
    assert.equal(vp.interpretation.content.verdict, "balanced");
    assert.equal(vd.options.partnerRevision, 1);
    await run(ctx, pa, [DSEL(pb), PSEL(pb)], rx.deps);
    assert.equal(rx.calls.length, 2, "önbellekten gelmeli");
    assert.equal(((await planAstrology(ctx, { profileId: pa, selections: [DSEL(pb), PSEL(pb)] })).body as J).plan.newRequestCount, 0);
    // Gun Milan önbelleği bu tekniklerle paylaşılmaz (aynı gövde, farklı anahtar).
    const pg = (await planAstrology(ctx, { profileId: pa, selections: [{ technique: "vedic.gun_milan", options: { partnerProfileId: pb, ayanamsa: "lahiri" } }] })).body as J;
    assert.equal(pg.plan.units.filter((u: J) => !u.cached && u.endpoint === ROXY_VEDIC_COMPATIBILITY.endpoint).length, 1);
  });

  await t("E: rol takası (karşı taraf 1. rol) — plan 1 yeni istek, gövde takaslı (person1 = B); GERÇEK takaslı yanıt → 6/10 ve 'exceeds' gösterilir; ayrı anahtar + ayrı kayıt (varsayılan 7/10 kaydı ve önbelleği etkilenmez); kaydet → aç 0 istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [DSEL(pb), PSEL(pb)], rx.deps);
    const sDef = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DSEL(pb), saveRequestId: randomUUID() }, false);
    assert.equal(sDef.status, 201, JSON.stringify(sDef.body));
    const SW = { order: "partner_first" };
    const p = (await planAstrology(ctx, { profileId: pa, selections: [DSEL(pb, SW), PSEL(pb, SW)] })).body as J;
    assert.equal(p.plan.newRequestCount, 2, "takaslı iki teknik: 2 yeni istek (varsayılan önbellekle paylaşılmaz)");
    const r = (await run(ctx, pa, [DSEL(pb, SW), PSEL(pb, SW)], rx.deps)).body as J;
    assert.equal(rx.calls.length, 4);
    for (const c of rx.calls.slice(2)) assert.equal(canon(c.body), canon(vedicCompatibilityBody(SYNTH_B, SYNTH_A, "lahiri")));
    assert.deepEqual(rx.calls.slice(2).map((c) => c.endpoint), [ROXY_VEDIC_DASHAKOOT.endpoint, ROXY_VEDIC_PAPASAMYAM.endpoint]);
    assert.equal(r.results[0].ok, true, JSON.stringify(r.results[0]).slice(0, 300));
    assert.equal(r.results[1].ok, true, JSON.stringify(r.results[1]).slice(0, 300));
    const [vd, vp] = r.results.map((x: J) => x.view);
    assert.equal(vd.technical.total, 6, "takaslı gerçek toplam 6/10");
    assert.equal(vd.technical.order, "partner_first", "takaslı teknik veride rol işareti");
    assert.equal(vd.technical.rows.find((k: J) => k.id === "rasi").points, 1);
    assert.equal(vd.technical.rows.find((k: J) => k.id === "rasi").count, 2);
    assert.deepEqual([vp.technical.person1.total, vp.technical.person2.total, vp.technical.comparison, vp.technical.order], [2.75, 3.75, "exceeds", "partner_first"]);
    assert.equal(vp.interpretation.content.verdict, "unbalanced");
    // Ayrı kayıt: takaslı analiz ayrı kimlikle kaydedilir; açmak 0 istek; varsayılan kayıt 7/10 olarak kalır.
    const sSw = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DSEL(pb, SW), saveRequestId: randomUUID() }, false);
    assert.equal(sSw.status, 201, JSON.stringify(sSw.body));
    assert.notEqual((sSw.body as J).analysisId, (sDef.body as J).analysisId);
    const n = rx.calls.length;
    const aSw = ((await getAnalysis(ctx, (sSw.body as J).analysisId, false)).body as J).analysis;
    const aDef = ((await getAnalysis(ctx, (sDef.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizleri açmak sağlayıcı çağırmaz");
    assert.deepEqual([aSw.technical.total, aSw.technical.order, aDef.technical.total, aDef.technical.order], [6, "partner_first", 7, undefined]);
    const rep = reportTexts(buildAstroReport(aSw)).join("\n");
    for (const want of ["6 / 10", "1. rol (geleneksel: damat)", "Rasi"]) assert.ok(rep.includes(want), `takaslı rapor: "${want}" yok`);
    for (const bad of ["undefined", "NaN", "Roxy", "golden", "fixture"]) assert.ok(!rep.includes(bad), `takaslı rapor: "${bad}"`);
    // Önbellek: varsayılan ve takaslı ikinci çalıştırma 0 istek.
    await run(ctx, pa, [DSEL(pb), PSEL(pb), DSEL(pb, SW), PSEL(pb, SW)], rx.deps);
    assert.equal(rx.calls.length, n, "dört sonuç da önbellekten");
    assert.equal(((await planAstrology(ctx, { profileId: pa, selections: [DSEL(pb, SW), PSEL(pb, SW)] })).body as J).plan.newRequestCount, 0);
    // Kural düzeyinde: takaslı teknik veriye rol işareti eklenir (combine).
    assert.deepEqual((def0().combineTechnical!([{ schema: "x" }], { order: "partner_first" }) as J).order, "partner_first");
    assert.equal((def0().combineTechnical!([{ schema: "x" }], {}) as J).order, undefined);
  });

  await t("E: Vedik D1 kaydı varsa Dashakoot'a iki rolün Ay bilgisi bağlamdan eklenir (0 ek istek); bozuk yanıt → PROVIDER_INVALID_RESPONSE", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [D1SEL], rx.deps);
    const n = rx.calls.length;
    const r = (await run(ctx, pa, [DSEL(pb)], rx.deps)).body as J;
    assert.equal(rx.calls.length, n + 1);
    assert.deepEqual(r.results[0].view.technical.moons, { person1: { rashi: "pisces", nakshatra: "revati", pada: 4 }, person2: null });
    const bad = roxy((ep, raw) => {
      if (ep === ROXY_VEDIC_PAPASAMYAM.endpoint) raw.person1.total = 6;
    });
    const s2 = seed();
    const c2 = ctxOf(s2);
    const a2 = await profileA(c2);
    const b2 = await profileB(c2);
    const res2 = (await run(c2, a2, [PSEL(b2)], bad.deps)).body as J;
    assert.equal(res2.results[0].ok, false);
    assert.equal(res2.results[0].code, "PROVIDER_INVALID_RESPONSE");
  });

  // ═══ F) SAAT YOK ═══════════════════════════════════════════════════════════════
  await t("F: saat bilinmiyor (danışan / karşı taraf) → TIME_REQUIRED, sağlayıcıya GİDİLMEZ; görünüm maskesi", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const pa0 = await profileA(ctx, { label: "A saatsiz", birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const pb0 = await profileB(ctx, { label: "B saatsiz", birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const rx = roxy();
    const r1 = (await run(ctx, pa0, [DSEL(pb), PSEL(pb)], rx.deps)).body as J;
    const r2 = (await run(ctx, pa, [DSEL(pb0), PSEL(pb0)], rx.deps)).body as J;
    assert.equal(rx.calls.length, 0);
    assert.deepEqual(r1.results.map((x: J) => x.code), ["TIME_REQUIRED", "TIME_REQUIRED"]);
    assert.deepEqual(r2.results.map((x: J) => x.code), ["TIME_REQUIRED", "TIME_REQUIRED"]);
    assert.ok(r2.results[0].error.includes("karşı tarafın doğum saati"), r2.results[0].error);
    assert.ok(r1.results[1].error.includes("Lagna"), r1.results[1].error);
    assert.equal(maskTechnical("vedic.dashakoot", { a: 1 }, { primary: true, partner: false }).technical, null);
    assert.equal(maskTechnical("vedic.papasamyam", { a: 1 }, { primary: false, partner: true }).technical, null);
  });

  // ═══ G) KAYDET → AÇ ═══════════════════════════════════════════════════════════
  await t("G: kaydet → aç 0 istek (iki teknik); snapshot teknik veri + karşı taraf; yorum yetkiyle saklanır; hesaplanmamış sonuç kaydedilemez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [DSEL(pb), PSEL(pb)], rx.deps);
    const n = rx.calls.length;
    const s1 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DSEL(pb), saveRequestId: randomUUID() }, false);
    const s2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PSEL(pb), saveRequestId: randomUUID() }, false);
    assert.equal(s1.status, 201, JSON.stringify(s1.body));
    assert.equal(s2.status, 201, JSON.stringify(s2.body));
    const a1 = ((await getAnalysis(ctx, (s1.body as J).analysisId, false)).body as J).analysis;
    const a2 = ((await getAnalysis(ctx, (s2.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a1.technical.total, 7);
    assert.equal(a1.profile.partner.label, "Sentetik B");
    assert.equal(a1.interpretation.content.verdict, "recommended");
    assert.equal(a2.technical.person2.total, 2.75);
    const unsaved = await saveAnalysis(ctx, { profileId: pb, revision: 1, ...DSEL(pa), saveRequestId: randomUUID() }, false);
    assert.equal(unsaved.status, 409);
  });

  // ═══ H) RAPOR ═══════════════════════════════════════════════════════════════════
  await t("H: Word/PDF rapor modeli — Dashakoot: kriter tablosu, 7 / 10, roller, kısıtlar (nötr), sayım, yöntem; Papasamyam: toplamlar, referans tabloları, karşılaştırma; hüküm cümlesi yalnız yorum bölümünde", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    await saveExpertNote(ctx, { profileId: pa, technique: "vedic.dashakoot", contextKey: pb, sectionKey: "overall", body: "Uzman notu porutham", expectedRevision: null });
    await run(ctx, pa, [DSEL(pb), PSEL(pb)], roxy().deps);
    const s1 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DSEL(pb), saveRequestId: randomUUID() }, false);
    const s2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PSEL(pb), saveRequestId: randomUUID() }, false);
    const a1 = ((await getAnalysis(ctx, (s1.body as J).analysisId, false)).body as J).analysis;
    const a2 = ((await getAnalysis(ctx, (s2.body as J).analysisId, false)).body as J).analysis;
    const all1 = reportTexts(buildAstroReport(a1));
    const r1 = all1.join("\n");
    for (const want of ["On Porutham (Dashakoot)", "On Porutham (Dashakoot) — teknik değerlendirme", "7 / 10", "1. rol (geleneksel: damat)", "2. rol (geleneksel: gelin)", "Sentetik A", "Sentetik B", "Dina (Dinam)", "Rasyadhipati (Rasi Athipathi)", "Stree Deergha", "karşılandı · 1", "karşılanmadı · 0", "Rajju kısıtı", "Paada (ayak)", "Kati (bel / kalça)", "Vedha kısıtı etkin değil", "26", "Sayım sütunu", "Yöntem: Güney Hint On Porutham", "Rasi kriterinde gelinden damada 6., 8. ve 12. sayımlar", "Gun Milan'dan (36 puan) ayrıdır", "Hesaplama rolleri: geleneksel porutham", "Uzman notu porutham", "Otomatik Yorum", DK.response.recommendation, "hüküm dili içerebilir"])
      assert.ok(r1.includes(want), `rapor 1: "${want}" yok`);
    const iTech = all1.indexOf("Teknik hesaplama sonuçları");
    const iInterp = all1.indexOf("Otomatik Yorum");
    const iRec = all1.indexOf(DK.response.recommendation);
    assert.ok(iTech >= 0 && iInterp > iTech && iRec > iInterp, `sıra: ${iTech} ${iInterp} ${iRec}`);
    const r2 = reportTexts(buildAstroReport(a2)).join("\n");
    for (const want of ["Papasamyam — teknik değerlendirme", "3,75", "2,75", "Karşılaştırma kuralı (2. rol toplamı ≤ 1. rol toplamı)", "sağlanıyor", "Lagna'dan", "Ay'dan (Chandra Lagna)", "Venüs'ten", "Mars (Mangala) — 7. ev", "Rahu — 8. ev", "2 × 1 = 2", "3 × 0,25 = 0,75", "Yöntem: Papasamyam", PS.response.recommendation])
      assert.ok(r2.includes(want), `rapor 2: "${want}" yok`);
    for (const s of [r1, r2]) for (const bad of ["undefined", "NaN", "[object Object]", "Roxy", "roxy", "golden", "fixture", "/vedic-astrology", "Ashtakoot Gun Milan — teknik"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
  });

  // ═══ I) YORUM KAPISI + SIZMA ════════════════════════════════════════════════════
  await t("I: yorum yetkisi kapalı uzman — görünüm / plan / kayıt / rapor / toplu rapor hiçbir yerde sağlayıcı hüküm / öneri / açıklama metni YOK", async () => {
    const store = seed();
    const ctx = ctxOf(store, { entitlements: NO_INTERP });
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    const r = await run(ctx, pa, [DSEL(pb), PSEL(pb)], rx.deps);
    const body = JSON.stringify(r.body);
    for (const x of PROVIDER_TEXT) assert.ok(!body.includes(x), `yanıtta sızma: ${x.slice(0, 40)}`);
    assert.ok(!/tavsiye|recommended|"balanced"/.test(body));
    assert.deepEqual((r.body as J).results.map((x: J) => x.view.interpretation), [{ visible: false, reason: "not_entitled" }, { visible: false, reason: "not_entitled" }]);
    const plan = JSON.stringify((await planAstrology(ctx, { profileId: pa, selections: [DSEL(pb), PSEL(pb, { order: "partner_first" })] })).body);
    for (const x of PROVIDER_TEXT) assert.ok(!plan.includes(x));
    const s1 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DSEL(pb), saveRequestId: randomUUID() }, false);
    const s2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PSEL(pb), saveRequestId: randomUUID() }, false);
    const items = await Promise.all([s1, s2].map(async (sv) => ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis));
    for (const a of items) {
      const txt = JSON.stringify(a) + reportTexts(buildAstroReport(a)).join("\n");
      for (const x of PROVIDER_TEXT) assert.ok(!txt.includes(x), `kayıt/rapor sızma: ${x.slice(0, 40)}`);
      assert.ok(!txt.includes("tavsiye") && !txt.includes("reddedil"));
    }
    const combined = JSON.stringify(buildCombinedAstroReport(items, "all", "2026-10-22"));
    for (const x of PROVIDER_TEXT) assert.ok(!combined.includes(x), `toplu raporda sızma: ${x.slice(0, 40)}`);
    assert.ok(combined.includes("On Porutham (Dashakoot)") && combined.includes("Papasamyam — teknik"), "toplu rapor gerçekten iki analizi içeriyor");
    // Owner "yorumu kapalı uzman görünümü" önizlemesi de aynı kapıdan geçer.
    const hid = await run(ctxOf(store), pa, [DSEL(pb)], rx.deps, true);
    assert.ok(!JSON.stringify(hid.body).includes(DK.response.recommendation));
  });

  // ═══ J) TENANT / UZMAN ══════════════════════════════════════════════════════════
  await t("J: başka tenant / aynı tenant'ta başka uzman analizi açamaz ve çalıştıramaz (404); karşı taraf başka tenant'tan seçilemez; aynı profil reddedilir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [DSEL(pb), PSEL(pb)], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...PSEL(pb), saveRequestId: randomUUID() }, false);
    const id = (sv.body as J).analysisId;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [DSEL(pb)], rx.deps)).status, 404);
    assert.equal((await run(ctxOf(store, { userId: USER_A2 }), pa, [PSEL(pb)], rx.deps)).status, 404);
    const cb = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    const foreignA = await profileA(cb, { clientId: undefined });
    assert.equal(((await run(cb, foreignA, [DSEL(pb)], rx.deps)).body as J).results[0].code, "PARTNER_NOT_FOUND");
    assert.equal(((await run(ctx, pa, [PSEL(pa)], rx.deps)).body as J).results[0].code, "PARTNER_SAME_PROFILE");
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "vedic.dashakoot", contextKey: pb, sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });

  // ═══ K) MEVCUT TEKNİKLER DEĞİŞMEDİ ═════════════════════════════════════════════
  await t("K: Gun Milan (varsayılan + rol takası) + Sade Sati + 16 temsili mevcut teknik birim özeti SABİT — taban 40f31195 ile aynı hash", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    const sels: [string, Record<string, unknown>][] = [
      ["western.natal", { houseSystem: "placidus", nodeType: "true" }],
      ["western.transit", { atUtc: "2026-10-22T09:00", nodeType: "true" }],
      ["western.synastry", { partnerProfileId: "00000000-0000-4000-8000-00000000abcd", houseSystem: "placidus", nodeType: "true" }],
      ["western.composite", { partnerProfileId: "00000000-0000-4000-8000-00000000abcd", houseSystem: "placidus", nodeType: "true" }],
      ["western.progression", { targetDate: "2026-10-22", nodeType: "true" }],
      ["western.profections", { age: 36 }],
      ["vedic.d1", { ayanamsa: "lahiri" }],
      ["vedic.varga", { ayanamsa: "lahiri", division: 9 }],
      ["vedic.dasha", { ayanamsa: "lahiri" }],
      ["vedic.drishti", { ayanamsa: "lahiri" }],
      ["vedic.ashtakavarga", { ayanamsa: "lahiri" }],
      ["vedic.shadbala", { ayanamsa: "lahiri" }],
      ["vedic.panchanga", { ayanamsa: "lahiri" }],
      ["vedic.transit", { ayanamsa: "lahiri", atUtc: "2026-10-22T09:00" }],
      ["kp.chart", { ayanamsa: "kp-newcomb", nodeType: "mean" }],
      ["kp.dasha", { ayanamsa: "kp-newcomb", nodeType: "mean" }],
    ];
    const digestOf = (list: [string, Record<string, unknown>][]) => {
      const got: Record<string, string> = {};
      for (const [id, raw] of list) {
        const def = getTechnique(id)!;
        const opt = def.parseOptions(raw, now)!;
        assert.ok(opt, id);
        got[id + JSON.stringify(raw)] = def.units(ctxU, opt).map((u) => `${u.endpoint}#${u.inputHash}`).join(",");
      }
      return sha(canon(got));
    };
    const pid = "00000000-0000-4000-8000-00000000abcd";
    const vm = digestOf([
      ["vedic.gun_milan", { partnerProfileId: pid, ayanamsa: "lahiri" }],
      ["vedic.gun_milan", { partnerProfileId: pid, ayanamsa: "lahiri", order: "partner_first" }],
      ["vedic.gun_milan", { partnerProfileId: pid, ayanamsa: "raman" }],
      ["vedic.sade_sati", { ayanamsa: "lahiri" }],
    ]);
    const ex = digestOf(sels);
    console.log(`     Gun Milan + Sade Sati özeti: ${vm}\n     16 mevcut teknik özeti: ${ex}`);
    assert.equal(vm, GUN_MILAN_DIGEST_BASE, "Gun Milan / Sade Sati gövde veya anahtarı değişti");
    assert.equal(ex, EXISTING_DIGEST_BASE, "mevcut tekniklerin gövde veya anahtarı değişti");
    // Gun Milan seçenek ayrıştırması değişmedi.
    assert.deepEqual(getTechnique("vedic.gun_milan")!.parseOptions({ partnerProfileId: pid }, now), { partnerProfileId: pid, partnerRevision: null, ayanamsa: "lahiri" });
  });

  // ═══ L) NOT / KB ═════════════════════════════════════════════════════════════════
  await t("L: Bilgi Bankası — On Porutham 'vedic_porutham', Papasamyam 'vedic_papasamyam' bağlamında (Ashtakoot konularıyla karışmaz); DB regex; tekil; notlar karşı tarafa göre; KB otomatik doldurulmaz", async () => {
    const d = projectRoxyVedicDashakoot(DK.response, { ayanamsa: "lahiri" });
    const p = projectRoxyVedicPapasamyam(PS.response, { ayanamsa: "lahiri" });
    assert.ok(d.ok && p.ok);
    if (!d.ok || !p.ok) return;
    const dk = topicsForTechnique("vedic.dashakoot", d.technical).map((x) => x.key);
    const pk = topicsForTechnique("vedic.papasamyam", p.technical).map((x) => x.key);
    for (const k of [...dk, ...pk]) assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$/.test(k), `DB topic_key regex: ${k}`);
    assert.equal(dk.length, 10, "10 kriter, etkin kısıt yok");
    assert.ok(dk.includes("porutham_result:stree_deergha:matched") && dk.includes("porutham_result:rasi:unmatched"));
    const rj = { ...d.technical, rajju: { ...d.technical.rajju, active: true } };
    assert.ok(topicsForTechnique("vedic.dashakoot", rj).some((x) => x.key === "porutham_constraint:rajju"));
    assert.equal(new Set(pk).size, pk.length);
    assert.ok(pk.includes("papa_affliction:lagna:mars:7") && pk.includes("papa_affliction:venus:sun:12") && pk.includes("papa_comparison:within"), pk.join(","));
    assert.equal(pk.length, 7 + 4 + 1, "A 7 katkı + B 4 katkı (Ay'dan ve Venüs'ten Güneş 12: referans farklı → ayrı anahtar) + karşılaştırma");
    assert.deepEqual([TECHNIQUE_TOPIC_CONTEXT["vedic.dashakoot"], TECHNIQUE_TOPIC_CONTEXT["vedic.papasamyam"]], ["vedic_porutham", "vedic_papasamyam"]);
    assert.ok((VEDIC_CONTEXTS as readonly string[]).includes("vedic_porutham"));
    assert.equal(isSectionKeyForTechnique("vedic.dashakoot", "porutham_result:dina:matched"), true);
    assert.equal(isSectionKeyForTechnique("vedic.dashakoot", "match_koota_score:nadi:full"), false, "Ashtakoot konusu porutham'a yazılamaz");
    assert.equal(isSectionKeyForTechnique("vedic.gun_milan", "porutham_result:dina:matched"), false, "porutham konusu Gun Milan'a yazılamaz");
    assert.equal(isSectionKeyForTechnique("vedic.papasamyam", "porutham_result:dina:matched"), false);
    assert.equal(parseVedicTopicKey("papa_affliction:lagna:jupiter:7"), null, "malefik olmayan graha");
    assert.equal(parseVedicTopicKey("papa_affliction:lagna:mars:3"), null, "etki evi olmayan ev");
    for (const k of [...dk, ...pk]) assert.ok(!/roxy|undefined|tavsiye/i.test(parseVedicTopicKey(k)!.label));
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.dashakoot", contextKey: pb, sectionKey: "porutham_result:rasi:unmatched", body: "rasi notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.papasamyam", contextKey: pb, sectionKey: "papa_comparison:within", body: "denge notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.papasamyam", sectionKey: "overall", body: "bağlamsız", expectedRevision: null })).status, 400);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.dashakoot", contextKey: pb, sectionKey: "manglik:moderate", body: "x", expectedRevision: null })).status, 400);
    assert.equal((store.tables.astro_kb_entries ?? []).length, 0);
  });

  // ═══ M) UI YARDIMCILARI ══════════════════════════════════════════════════════════
  await t("M: UI — karşı taraf yoksa plana girmez; seçimler (rol yalnız takasta yazılır); özet Türkçe; Yakında listesinden Dashakoot / Papasamyam düşer; panel metninde sağlayıcı adı / hüküm dili yok", () => {
    const p = defaultParams(new Date("2026-10-22T09:00:00Z"));
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    assert.equal(missingReason("vedic.dashakoot", p), "karşı taraf seçin");
    assert.equal(missingReason("vedic.papasamyam", p), "karşı taraf seçin");
    const pid = randomUUID();
    assert.deepEqual(buildSelections({ "vedic.dashakoot": true, "vedic.papasamyam": true }, { ...p, partnerProfileId: pid }, method), [
      { technique: "vedic.dashakoot", options: { partnerProfileId: pid, ayanamsa: "lahiri" } },
      { technique: "vedic.papasamyam", options: { partnerProfileId: pid, ayanamsa: "lahiri" } },
    ]);
    assert.deepEqual(buildSelections({ "vedic.dashakoot": true }, { ...p, partnerProfileId: pid, dashakootOrder: "partner_first" }, method), [{ technique: "vedic.dashakoot", options: { partnerProfileId: pid, ayanamsa: "lahiri", order: "partner_first" } }]);
    assert.deepEqual(buildSelections({ "vedic.gun_milan": true }, { ...p, partnerProfileId: pid, dashakootOrder: "partner_first" }, method), [{ technique: "vedic.gun_milan", options: { partnerProfileId: pid, ayanamsa: "lahiri" } }], "Gun Milan rolü bağımsız");
    assert.equal(describeOptions("vedic.dashakoot", { partnerProfileId: pid, partnerRevision: 2, ayanamsa: "lahiri", order: "partner_first" }, () => "Sentetik B"), "Sentetik B (karşı taraf rev 2) · 1. rol (damat): karşı taraf · ayanamsa: Lahiri (Chitrapaksha)");
    assert.equal(describeOptions("vedic.papasamyam", { partnerProfileId: pid, ayanamsa: "raman" }, () => "Sentetik B"), "Sentetik B · 1. rol (damat): danışan · ayanamsa: B.V. Raman");
    for (const id of ["vedic.dashakoot", "vedic.papasamyam"] as const) assert.ok(!/roxy/i.test(TECHNIQUE_META[id].label + TECHNIQUE_META[id].hint));
    assert.deepEqual([COMING_SOON_AVAILABLE_AS.Dashakoot, COMING_SOON_AVAILABLE_AS.Papasamyam], ["vedic.dashakoot", "vedic.papasamyam"]);
    const v = visibleComingSoonSections([{ items: ["Kalsarpa Dosha", "Dashakoot", "Papasamyam"] }], AVAILABLE_TECHNIQUES);
    assert.deepEqual(v[0].items, ["Kalsarpa Dosha"]);
    const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["app/admin/astroloji/_components/VedicPoruthamPanels.tsx", "lib/astrology/model/vedicPorutham.ts", "lib/astrology/report/vedicPoruthamReport.ts"]) {
      const src = strip(readFileSync(join(ROOT, f), "utf8"));
      assert.ok(!/Roxy|golden|fixture|\/vedic-astrology/.test(src), `${f}: iç jargon`);
      assert.ok(!/(uygun değil|uyumlu değil|evlenmeli|evlenmemeli|tavsiye edilir)/i.test(src), `${f}: hüküm dili`);
    }
    const sel = readFileSync(join(ROOT, "app/admin/astroloji/_components/TechniqueSelector.tsx"), "utf8");
    assert.ok(sel.includes("1. rol (geleneksel: damat) / 2. rol (geleneksel: gelin)"), "seçicide rol başlığı");
  });

  // ═══ N) GOLDEN KLASÖRÜ ════════════════════════════════════════════════════════════
  await t("N: golden dosyalarında kişisel veri yok (yalnız sentetik A/B); anahtar metni yok; çağrı defteri betiği onaysız çağrı yapmaz", () => {
    for (const f of ["vedic-dashakoot.json", "vedic-papasamyam.json", "vedic-dashakoot-swap.json", "vedic-papasamyam-swap.json"]) {
      const s = readFileSync(join(GDIR, f), "utf8");
      assert.ok(!/apiKey|x-api-key|Bearer/i.test(s), f);
      assert.ok(s.includes("1990-07-15") && s.includes("1988-03-21"), f);
    }
    const g = readFileSync(join(__dirname, "golden", "vedik-eslesme-2-golden-calls.ts"), "utf8");
    assert.ok(g.includes('process.env.RUN_VEDIK_ESLESME2_GOLDEN !== "EVET"') && g.includes("existsSync(out)") && g.includes("maxRetries: 0"));
  });

  console.log(`\nvedik-eslesme-2 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

/** Taban 40f31195'te (bu paketten ÖNCE) aynı seçimlerin birim özetleri — RAPOR.md "önce" kanıtı ile üretildi. */
const GUN_MILAN_DIGEST_BASE = "b561742f88a45471e618c82874cac89a3ff40787df91c07df76bb2448bb3072e";
const EXISTING_DIGEST_BASE = "831218d585d179c63fdcf40602f74f1638e2686a913dd22d38cfe541cddb3304";

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
