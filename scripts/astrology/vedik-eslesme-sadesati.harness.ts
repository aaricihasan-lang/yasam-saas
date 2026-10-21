/**
 * ATLAS YENİ TEKNİKLER (2026-10-22) — VEDİK EŞLEŞTİRME (Gun Milan + Manglik) ve SADE SATI harness'i.
 *
 * Kaynak: 4 GERÇEK sağlayıcı yanıtı (fixtures/golden/vedic-gun-milan · vedic-manglik-a · vedic-manglik-b · vedic-sadhesati;
 * sentetik kişiler A = 1990-07-15 14:30 İstanbul +3, B = 1988-03-21 06:45 Ankara +2). Bu harness sağlayıcıya ÇAĞRI YAPMAZ.
 *
 *   A) golden ↔ projeksiyon (teknik katmanda hüküm metni yok) · B) BAĞIMSIZ doğrulama: Ay konumu astronomy-engine + Lahiri,
 *   klasik tablolarla Varna / Tara / Yoni / Graha Maitri / Gana / Bhakoot / Nadi (ekol farkları belgelenir) · C) Manglik ↔ D1
 *   golden (Mars evi) · D) Sade Sati ↔ Satürn sidereal burç geçişleri (astronomy-engine + Lahiri; retro çoklu giriş) ve Gochara
 *   golden'ı ile metodolojik tutarlılık · E) fail-closed · F) motor: plan / önbellek / kişi başına Manglik önbelleği · G) saat yok
 *   (iki kişi) · H) Sade Sati değerlendirme günü anahtarı · I) kaydet → aç 0 istek · J) Word/PDF rapor işaretleri · K) yetki
 *   (başka tenant / uzman 404; yorum kapısı + sızma) · L) mevcut tekniklerin girdi özeti DEĞİŞMEDİ (sabit hash) · M) not / KB ·
 *   N) UI yardımcıları · O) Dashakoot / Papasamyam eklenmedi.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/vedik-eslesme-sadesati.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as AE from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, parseNoteContext, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { buildPlan } from "@/lib/astrology/engine/planner";
import { getAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { mapDosha, projectRoxyVedicGunMilan, projectRoxyVedicManglik, projectRoxyVedicSadeSati, sadeSatiPhaseOf, ROXY_VEDIC_COMPATIBILITY, ROXY_VEDIC_MANGLIK, ROXY_VEDIC_SADHESATI } from "@/lib/astrology/providers/roxy/vedicMatch";
import { vedicCompatibilityBody, vedicDoshaBody } from "@/lib/astrology/providers/roxy/vedicMatchRequests";
import { combineGunMilan, sadeSatiAsOf } from "@/lib/astrology/engine/vedicMatchTechniques";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { hasNoProviderInterpretation } from "@/lib/astrology/noProviderInterp";
import { isSectionKeyForTechnique, topicsForTechnique, TECHNIQUE_TOPIC_CONTEXT } from "@/lib/astrology/topics/index";
import { NAKSHATRAS } from "@/lib/astrology/model/vedic";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_LORDS } from "@/lib/astrology/model/kp";
import { KOOTA_IDS, saturnSignOf } from "@/lib/astrology/model/vedicMatch";
import { buildSelections, defaultParams, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import { SYNTH_A, SYNTH_B } from "./golden/phase3-golden-calls";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const GDIR = join(__dirname, "fixtures", "golden");
const G = (n: string) => JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")) as { endpoint: string; body: Record<string, unknown>; fetchedAt?: string; response: J };
const GM = G("vedic-gun-milan");
const MA = G("vedic-manglik-a");
const MB = G("vedic-manglik-b");
const SS = G("vedic-sadhesati");
const D1 = G("vedic-d1");
const GOCHARA = G("vedic-transit");
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;

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

/** Sahte sağlayıcı: YALNIZ gerçek golden'ı olan BİREBİR gövdeye o yanıtı döner; başka gövde → 400 (sonuç uydurulmaz). */
const FIXTURES = [GM, MA, MB, SS, D1];
function roxy(mutate?: (endpoint: string, r: J) => void) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-vm", baseUrl: "https://roxy-fake.local/api/v2" },
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
const GUN = (partnerProfileId: string, ayanamsa = "lahiri") => ({ technique: "vedic.gun_milan", options: { partnerProfileId, ayanamsa } });
const SADE = (ayanamsa = "lahiri") => ({ technique: "vedic.sade_sati", options: { ayanamsa } });
const D1SEL = { technique: "vedic.d1", options: { ayanamsa: "lahiri" } };
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, hide = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: hide });
const PROVIDER_TEXT = [GM.response.recommendation, MA.response.description, ...MA.response.remedies, MA.response.effects.marriage, SS.response.description, ...SS.response.remedies, SS.response.effects.general];

// ═══ Bağımsız klasik tablolar (yalnız test; ürün kodunda DEĞİL) ═══════════════════════════════════════════════
const NAK_SPAN = 360 / 27;
/** Lahiri (Chitrapaksha) yaklaşık: J2000'de 23°51′11″ + 50,2788″/yıl. */
const lahiri = (t: AE.AstroTime) => 23.85305 + (t.ut / 365.25) * (50.2788 / 3600);
const siderealOf = (body: AE.Body, iso: string) => {
  const t = AE.MakeTime(new Date(iso));
  return { lon: (AE.Ecliptic(AE.GeoVector(body, t, true)).elon - lahiri(t) + 720) % 360, ay: lahiri(t) };
};
const signOfLon = (lon: number) => SIGN_IDS[Math.floor(lon / 30) % 12];
const YONI = ["horse", "elephant", "sheep", "serpent", "serpent", "dog", "cat", "sheep", "cat", "rat", "rat", "cow", "buffalo", "tiger", "buffalo", "tiger", "deer", "deer", "dog", "monkey", "mongoose", "monkey", "lion", "horse", "lion", "cow", "elephant"];
const GANA_DEVA = [0, 4, 6, 7, 12, 14, 16, 21, 26];
const GANA_MANUSHYA = [1, 3, 5, 10, 11, 19, 20, 24, 25];
const ganaOf = (n: number) => (GANA_DEVA.includes(n) ? "deva" : GANA_MANUSHYA.includes(n) ? "manushya" : "rakshasa");
const NADI_ADI = [0, 5, 6, 11, 12, 17, 18, 23, 24];
const NADI_MADHYA = [1, 4, 7, 10, 13, 16, 19, 22, 25];
const nadiOf = (n: number) => (NADI_ADI.includes(n) ? "adi" : NADI_MADHYA.includes(n) ? "madhya" : "antya");
const VARNA: Record<string, number> = { cancer: 4, scorpio: 4, pisces: 4, aries: 3, leo: 3, sagittarius: 3, taurus: 2, virgo: 2, capricorn: 2, gemini: 1, libra: 1, aquarius: 1 };
const VARNA_NAME: Record<number, string> = { 4: "Brahmin", 3: "Kshatriya", 2: "Vaishya", 1: "Shudra" };
/** Tara: kızın yıldızından erkeğe ve erkekten kıza sayım; kalan (mod 9) 3/5/7 → olumsuz; her olumlu yön 1,5 puan. */
const taraCount = (from: number, to: number) => ((to - from + 27) % 27) + 1;
const taraGood = (c: number) => ![3, 5, 7].includes(c % 9);
/** Naisargika (doğal) dostluk — BPHS. */
const FRIENDS: Record<string, { f: string[]; e: string[] }> = {
  sun: { f: ["moon", "mars", "jupiter"], e: ["venus", "saturn"] },
  moon: { f: ["sun", "mercury"], e: [] },
  mars: { f: ["sun", "moon", "jupiter"], e: ["mercury"] },
  mercury: { f: ["sun", "venus"], e: ["moon"] },
  jupiter: { f: ["sun", "moon", "mars"], e: ["mercury", "venus"] },
  venus: { f: ["mercury", "saturn"], e: ["sun", "moon"] },
  saturn: { f: ["mercury", "venus"], e: ["sun", "moon", "mars"] },
};
const rel = (a: string, b: string) => (a === b ? 2 : FRIENDS[a].f.includes(b) ? 2 : FRIENDS[a].e.includes(b) ? 0 : 1);
const grahaMaitri = (a: string, b: string): number => {
  if (a === b) return 5;
  const x = rel(a, b) + rel(b, a);
  const both = [rel(a, b), rel(b, a)].sort().join("");
  return both === "22" ? 5 : both === "12" ? 4 : both === "11" ? 3 : both === "02" ? 1 : both === "01" ? 0.5 : x === 0 ? 0 : -1;
};
/** Gana tablosu (yaygın: erkek satır, kız sütun). Bazı ekoller Deva–Manushya'ya iki yönde de 5 verir. */
const GANA_TABLE: Record<string, Record<string, number>> = { deva: { deva: 6, manushya: 6, rakshasa: 1 }, manushya: { deva: 5, manushya: 6, rakshasa: 0 }, rakshasa: { deva: 1, manushya: 0, rakshasa: 6 } };
const bhakootScore = (boy: SignId, girl: SignId) => {
  const d = ((SIGN_IDS.indexOf(girl) - SIGN_IDS.indexOf(boy) + 12) % 12) + 1;
  return [2, 12, 5, 9, 6, 8].includes(d) ? 0 : 7;
};

/** Satürn sidereal burç geçişleri (gün adımı + ikiye bölme; dakika duyarlılığı). */
function saturnIngresses(fromIso: string, toIso: string) {
  const sid = (ms: number) => siderealOf(AE.Body.Saturn, new Date(ms).toISOString()).lon;
  const out: { at: string; from: SignId; to: SignId }[] = [];
  let ms = Date.parse(fromIso);
  const end = Date.parse(toIso);
  let prev = Math.floor(sid(ms) / 30);
  while (ms < end) {
    const n = ms + 86_400_000;
    const s = Math.floor(sid(n) / 30);
    if (s !== prev) {
      let lo = ms;
      let hi = n;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2;
        if (Math.floor(sid(m) / 30) === prev) lo = m;
        else hi = m;
      }
      out.push({ at: new Date(hi).toISOString().slice(0, 16), from: SIGN_IDS[prev], to: SIGN_IDS[s] });
      prev = s;
    }
    ms = n;
  }
  return out;
}

async function main() {
  // ═══ A) GOLDEN ↔ PROJEKSİYON ════════════════════════════════════════════════
  await t("A: golden gövdeler ürün üreticileriyle BİREBİR (uyum A+B, Manglik A, Manglik B, Sade Sati A; ayanamsa lahiri, ofset açık)", () => {
    assert.equal(canon(GM.body), canon(vedicCompatibilityBody(SYNTH_A, SYNTH_B, "lahiri")));
    assert.equal(canon(MA.body), canon(vedicDoshaBody(SYNTH_A, "lahiri")));
    assert.equal(canon(MB.body), canon(vedicDoshaBody(SYNTH_B, "lahiri")));
    assert.equal(canon(SS.body), canon(vedicDoshaBody(SYNTH_A, "lahiri")));
    assert.deepEqual([GM.endpoint, MA.endpoint, SS.endpoint], [ROXY_VEDIC_COMPATIBILITY.endpoint, ROXY_VEDIC_MANGLIK.endpoint, ROXY_VEDIC_SADHESATI.endpoint]);
    assert.equal((GM.body as J).person2.timezone, 2, "B 1988-03-21: Türkiye +2 (yaz saati öncesi)");
  });

  await t("A: Gun Milan golden → 25,5/36, 8 koota klasik sırada, Bhakoot dosha İPTAL (gerekçe), etkin dosha yok; bilinmeyen alan 0", () => {
    const r = projectRoxyVedicGunMilan(GM.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    const x = r.technical;
    assert.equal(x.total, 25.5);
    assert.equal(x.percentage, 70.83);
    assert.deepEqual(x.kootas.map((k) => k.id), [...KOOTA_IDS]);
    assert.deepEqual(x.kootas.map((k) => k.score), [1, 1, 1.5, 4, 5, 5, 0, 8]);
    assert.deepEqual(x.kootas.map((k) => k.maxScore), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(x.doshas, []);
    assert.deepEqual(x.cancellations.map((c) => c.dosha), ["bhakoot"]);
    assert.ok(x.cancellations[0].reason.includes("dost"), "iptal gerekçesi sağlayıcı metni");
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(r.droppedValues, [], "tüm sınıflama etiketleri biliniyor");
    assert.equal(x.kootas.find((k) => k.id === "bhakoot")!.person1.label, "Balık");
    assert.equal(x.kootas.find((k) => k.id === "graha_maitri")!.person2.label, "Mars (Mangala)");
    assert.equal(x.kootas.find((k) => k.id === "yoni")!.person1.label, "Fil");
  });

  await t("A: hüküm dili yalnız yorum katmanında — teknik katmanda recommendation / isCompatible / 'tavsiye' YOK", () => {
    const r = projectRoxyVedicGunMilan(GM.response, { ayanamsa: "lahiri" });
    assert.ok(r.ok);
    if (!r.ok) return;
    const s = JSON.stringify(r.technical);
    for (const bad of ["tavsiye", "recommendation", "isCompatible", "thresholdMet", GM.response.recommendation]) assert.ok(!s.includes(bad), `teknik katmanda: ${bad}`);
    assert.deepEqual(r.interpretation, { schema: "astro.vedic.gun_milan.interp.v1", recommendation: "Birleşim tavsiye edilir", thresholdMet: true });
  });

  // ═══ B) BAĞIMSIZ DOĞRULAMA (astronomy-engine + Lahiri + klasik tablolar) ══════════════════
  const moonA = siderealOf(AE.Body.Moon, SYNTH_A.utc);
  const moonB = siderealOf(AE.Body.Moon, SYNTH_B.utc);
  const nA = Math.floor(moonA.lon / NAK_SPAN);
  const nB = Math.floor(moonB.lon / NAK_SPAN);
  const sA = signOfLon(moonA.lon);
  const sB = signOfLon(moonB.lon);
  await t("B: bağımsız Ay — A Revati (Balık 29,24°), B Bharani (Koç 19,0°); A, D1 golden'ıyla aynı; ayanamsa sağlayıcıyla ±0,02°", () => {
    assert.equal(NAKSHATRAS[nA], "revati");
    assert.equal(NAKSHATRAS[nB], "bharani");
    assert.equal(sA, "pisces");
    assert.equal(sB, "aries");
    assert.ok(Math.abs(moonA.lon - 359.2358) < 0.05, `A Ay ${moonA.lon}`);
    assert.ok(Math.abs(moonA.ay - GM.response.frame.ayanamsaDegrees) < 0.02, "A ayanamsa");
    assert.ok(Math.abs(moonB.ay - MB.response.frame.ayanamsaDegrees) < 0.02, "B ayanamsa");
    assert.ok(360 - moonA.lon > 0.5, "A Revati/Ashwini sınırına 0,76° — sınır belirsizliği yok");
  });

  await t("B: klasik tablo ↔ sağlayıcı — Varna 1, Yoni 4, Graha Maitri 5, Bhakoot 0 (2/12), Nadi 8, Tara 1,5 BİREBİR; sınıflama etiketleri aynı", () => {
    const bd = Object.fromEntries((GM.response.breakdown as J[]).map((b) => [b.category, b]));
    // Varna (erkek ≥ kız → 1)
    assert.equal(VARNA_NAME[VARNA[sA]], bd.Varna.person1);
    assert.equal(VARNA_NAME[VARNA[sB]], bd.Varna.person2);
    assert.equal(VARNA[sA] >= VARNA[sB] ? 1 : 0, bd.Varna.score);
    // Yoni (aynı hayvan → 4)
    assert.equal(YONI[nA], "elephant");
    assert.equal(YONI[nB], "elephant");
    assert.equal(bd.Yoni.person1.toLowerCase(), YONI[nA]);
    assert.equal(YONI[nA] === YONI[nB] ? 4 : -1, bd.Yoni.score);
    // Graha Maitri (Jüpiter–Mars karşılıklı dost → 5)
    assert.equal(SIGN_LORDS[sA], "jupiter");
    assert.equal(SIGN_LORDS[sB], "mars");
    assert.equal(grahaMaitri(SIGN_LORDS[sA], SIGN_LORDS[sB]), bd["Graha Maitri"].score);
    // Bhakoot (Balık → Koç: 2/12 → 0) + klasik iptal: yöneticiler karşılıklı dost
    assert.equal(bhakootScore(sA, sB), bd.Bhakoot.score);
    assert.equal(rel(SIGN_LORDS[sA], SIGN_LORDS[sB]) === 2 && rel(SIGN_LORDS[sB], SIGN_LORDS[sA]) === 2, true, "Bhakoot iptal koşulu bağımsız olarak sağlanıyor");
    // Nadi (Antya ≠ Madhya → 8)
    assert.equal(nadiOf(nA), "antya");
    assert.equal(nadiOf(nB), "madhya");
    assert.equal(bd.Nadi.person1.toLowerCase(), nadiOf(nA));
    assert.equal(nadiOf(nA) !== nadiOf(nB) ? 8 : 0, bd.Nadi.score);
    // Tara: B→A sayım 26 (kalan 8 Mitra, olumlu), A→B sayım 3 (Vipat, olumsuz) → 1,5
    const c1 = taraCount(nB, nA);
    const c2 = taraCount(nA, nB);
    assert.deepEqual([c1, c2], [26, 3]);
    assert.equal((taraGood(c1) ? 1.5 : 0) + (taraGood(c2) ? 1.5 : 0), bd.Tara.score);
    // Gana sınıfları
    assert.equal(ganaOf(nA), "deva");
    assert.equal(ganaOf(nB), "manushya");
    assert.equal(bd.Gana.person1.toLowerCase(), "deva");
    assert.equal(bd.Gana.person2.toLowerCase(), "manushya");
  });

  await t("B: EKOL FARKLARI belgelenir — Gana (Deva erkek–Manushya kız): yaygın tablo 6, sağlayıcı 5 (simetrik 5 ekolü); Tara etiketleri klasik sayımla uyuşmuyor (puan uyuşuyor)", () => {
    const bd = Object.fromEntries((GM.response.breakdown as J[]).map((b) => [b.category, b]));
    assert.equal(GANA_TABLE.deva.manushya, 6);
    assert.equal(bd.Gana.score, 5, "sağlayıcı Deva–Manushya'ya 5 veriyor (bazı ekollerde iki yönde 5)");
    const ours = 1 + 1 + 1.5 + 4 + 5 + GANA_TABLE.deva.manushya + 0 + 8;
    assert.equal(ours, 26.5);
    assert.equal(GM.response.total, ours - 1, "toplam fark yalnız Gana ekol farkından (1 puan)");
    // Tara etiketleri: klasik sayımla B→A = Mitra (8), A→B = Vipat (3); sağlayıcı 'Parama Mitra' / 'Sampat' yazıyor.
    assert.deepEqual([bd.Tara.person1, bd.Tara.person2], ["Parama Mitra", "Sampat"]);
    const names = ["Parama Mitra", "Janma", "Sampat", "Vipat", "Kshema", "Pratyari", "Sadhaka", "Vadha", "Mitra"];
    assert.deepEqual([names[taraCount(nB, nA) % 9], names[taraCount(nA, nB) % 9]], ["Mitra", "Vipat"]);
    // Bhakoot iptal edildiğinde bazı ekoller 7 puan verir; sağlayıcı belgesi "puan 0 kalır" der → ekol farkı.
    assert.equal(bd.Bhakoot.score, 0);
  });

  // ═══ C) MANGLIK ══════════════════════════════════════════════════════════════
  await t("C: Manglik A var (orta = 4./7. ev grubu; 'kendi burcunda' azaltıcı) ↔ D1 golden: Mars Koç'ta 7. evde; B yok; anlatı yalnız yorum katmanında", () => {
    const a = projectRoxyVedicManglik(MA.response, { ayanamsa: "lahiri" });
    const b = projectRoxyVedicManglik(MB.response, { ayanamsa: "lahiri" });
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    assert.deepEqual([a.technical.present, a.technical.severity], [true, "moderate"]);
    assert.ok(a.technical.exceptions[0].includes("kendi burcunda"));
    assert.deepEqual([b.technical.present, b.technical.severity, b.technical.exceptions], [false, null, []]);
    const mars = (Object.values(D1.response) as J[]).flatMap((x) => (x && Array.isArray(x.signs) ? x.signs : [])).find((g: J) => g.graha === "Mars");
    assert.equal(mars.house, 7, "D1: Mars 7. evde → 4./7. grubu = Moderate");
    assert.equal(signOfLon(mars.longitude), "aries", "Mars kendi burcunda (Koç)");
    const s = JSON.stringify([a.technical, b.technical]);
    for (const bad of [MA.response.description, MA.response.effects.marriage, ...MA.response.remedies]) assert.ok(!s.includes(bad), "Manglik anlatısı teknik katmanda");
    assert.equal(a.interpretation?.description, MA.response.description);
    assert.deepEqual(a.unmappedFields, []);
    assert.deepEqual(b.unmappedFields, []);
  });

  // ═══ D) SADE SATI ════════════════════════════════════════════════════════════
  await t("D: Sade Sati golden → etkin, doruk (Ay'dan 1. ev), derece yüksek (evreyle tutarlı); çare / etki metni teknik katmanda YOK", () => {
    const r = projectRoxyVedicSadeSati(SS.response, { ayanamsa: "lahiri", asOf: "2026-10-22" });
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (!r.ok) return;
    assert.deepEqual([r.technical.present, r.technical.phase, r.technical.severity, r.technical.asOf], [true, "peak", "severe", "2026-10-22"]);
    const s = JSON.stringify(r.technical);
    for (const bad of [SS.response.description, ...SS.response.remedies, SS.response.effects.general]) assert.ok(!s.includes(bad));
    assert.equal(r.interpretation?.phaseEffect, SS.response.effects.phases["Doruk evresi (1. ev)"]);
    assert.equal(r.interpretation?.remedies.length, 8);
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(["Yükselen evre (12. ev)", "Doruk evresi (1. ev)", "Batan evre (2. ev)", "Rising", "Peak", "Setting (2nd house)"].map(sadeSatiPhaseOf), ["rising", "peak", "setting", "rising", "peak", "setting"]);
    assert.equal(sadeSatiPhaseOf("bilinmeyen"), null);
  });

  const ingress = saturnIngresses("1988-01-01T00:00:00Z", "2036-01-01T00:00:00Z");
  await t("D: bağımsız Satürn sidereal (astronomy-engine + Lahiri) — golden anında Balık'ta; Janma Rashi Balık → 1. ev = doruk (sağlayıcıyla aynı)", () => {
    const at = SS.fetchedAt!;
    const sat = siderealOf(AE.Body.Saturn, at);
    assert.equal(signOfLon(sat.lon), "pisces", `Satürn ${sat.lon}`);
    assert.equal(sA, "pisces");
    assert.equal(((SIGN_IDS.indexOf(signOfLon(sat.lon)) - SIGN_IDS.indexOf(sA) + 12) % 12) + 1, 1);
    assert.equal(saturnSignOf("pisces", "peak", SIGN_IDS), "pisces");
    assert.equal(saturnSignOf("pisces", "rising", SIGN_IDS), "aquarius");
    assert.equal(saturnSignOf("pisces", "setting", SIGN_IDS), "aries");
  });

  await t("D: Satürn burç geçişleri yayımlanan Lahiri tarihleriyle ±1 gün; retro ile çoklu giriş (Kova 2022/2023, Koç 2027/2028, Boğa 2029/2030) belgelenir", () => {
    const want: [string, SignId, SignId][] = [
      ["2022-04-29", "capricorn", "aquarius"],
      ["2022-07-12", "aquarius", "capricorn"],
      ["2023-01-17", "capricorn", "aquarius"],
      ["2025-03-29", "aquarius", "pisces"],
      ["2027-06-03", "pisces", "aries"],
      ["2027-10-20", "aries", "pisces"],
      ["2028-02-23", "pisces", "aries"],
      ["2029-08-08", "aries", "taurus"],
      ["2029-10-05", "taurus", "aries"],
      ["2030-04-17", "aries", "taurus"],
    ];
    for (const [d, from, to] of want) {
      const hit = ingress.find((x) => x.from === from && x.to === to && Math.abs(Date.parse(x.at) - Date.parse(`${d}T12:00:00Z`)) <= 1.5 * 86_400_000);
      assert.ok(hit, `${d} ${from}→${to} bulunamadı`);
    }
    // A'nın (Janma Rashi Balık) dönemleri: önceki 1993-03-05 → 2000-06-06; güncel 2022-04-29 → 2030-04-17 (son Boğa girişi).
    const prev = ingress.filter((x) => x.at >= "1993" && x.at < "2001").map((x) => `${x.at.slice(0, 10)} ${x.from}→${x.to}`);
    assert.ok(prev.includes("1993-03-05 capricorn→aquarius") && prev.includes("2000-06-06 aries→taurus"), prev.join(", "));
    console.log(`     bağımsız Satürn geçişleri (1990–2031, sidereal Lahiri): ${ingress.filter((x) => x.at >= "1990" && x.at < "2031" && ["aquarius", "pisces", "aries", "taurus", "capricorn"].includes(x.to)).map((x) => `${x.at.slice(0, 10)} ${x.from}→${x.to}`).join(" · ")}`);
  });

  await t("D: Gochara ile metodolojik tutarlılık — aynı Lahiri çerçeve, aynı Janma Rashi (Balık), Gochara golden'ında Satürn Janma Rashi'den 1. ev", () => {
    const sat = (GOCHARA.response.transitingPlanets as J[]).find((p) => p.name === "Saturn");
    assert.equal(sat.houseFromMoon, 1);
    assert.equal(sat.sign, "Pisces");
    const moon = (GOCHARA.response.natalPlanets as J[]).find((p) => p.name === "Moon");
    assert.equal(signOfLon(moon.longitude), "pisces");
    assert.equal(GOCHARA.response.frame.ayanamsaDegrees.toFixed(6), SS.response.frame.ayanamsaDegrees.toFixed(6), "aynı Lahiri değeri (aynı doğum anı)");
  });

  // ═══ E) FAIL-CLOSED ══════════════════════════════════════════════════════════
  await t("E: Gun Milan bozuk yanıtlar REDDEDİLİR (puan > azami, sıra, toplam, yüzde, maxScore, burç, yönetici, dosha tutarlılığı, çerçeve, eşik bayrağı)", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["puan > azami", (r) => (r.breakdown[0].score = 2), "varna: puan"],
      ["yarım olmayan puan", (r) => (r.breakdown[2].score = 1.3), "tara: puan"],
      ["sıra", (r) => ([r.breakdown[0], r.breakdown[1]] = [r.breakdown[1], r.breakdown[0]]), "breakdown[0]: sıra / kategori (varna)"],
      ["7 koota", (r) => r.breakdown.pop(), "breakdown: 8 koota değil"],
      ["azami puan", (r) => (r.breakdown[7].maxScore = 7), "nadi: azami puan klasik değil"],
      ["toplam", (r) => ((r.total = 26.5), (r.percentage = (26.5 / 36) * 100)), "total koota toplamı değil"],
      ["yüzde", (r) => (r.percentage = 50), "percentage = total / 36 değil"],
      ["maxScore", (r) => (r.maxScore = 30), "maxScore 36 değil"],
      ["burç", (r) => (r.breakdown[6].person1 = "Ophiuchus"), "bhakoot.person1: burç değil"],
      ["yönetici", (r) => (r.breakdown[4].person1 = "Venus"), "graha_maitri: Ay burcu yöneticisi değil"],
      ["bilinmeyen dosha", (r) => r.doshas.push("Gana Dosha"), "doshas: bilinmeyen dosha"],
      ["etkin dosha + puan", (r) => r.doshas.push("Nadi Dosha"), "nadi: dosha var ama puan 0 değil"],
      ["puan 0 dosha yok", (r) => (r.doshaCancellations = []), "bhakoot: puan 0 ama dosha bildirilmedi"],
      ["hem etkin hem iptal", (r) => r.doshas.push("Bhakoot Dosha"), "bhakoot: hem etkin hem iptal"],
      ["çerçeve", (r) => (r.frame.ayanamsa = "raman"), "frame: istenen ayanamsa değil"],
      ["eşik bayrağı", (r) => delete r.isCompatible, "isCompatible"],
      ["sınıflama metni", (r) => (r.breakdown[0].person1 = "<script>"), "varna.person1: sınıflama"],
    ];
    for (const [n, m, e] of cases) {
      const raw = structuredClone(GM.response);
      m(raw);
      const r = projectRoxyVedicGunMilan(raw, { ayanamsa: "lahiri" });
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    for (const bad of [null, [], "x", 1]) assert.equal(projectRoxyVedicGunMilan(bad, { ayanamsa: "lahiri" }).ok, false);
    const extra = structuredClone(GM.response);
    extra.newField = 1;
    const ok = projectRoxyVedicGunMilan(extra, { ayanamsa: "lahiri" });
    assert.ok(ok.ok && ok.unmappedFields.includes("newField"), "bilinmeyen alan raporlanmalı");
    const unknownClass = structuredClone(GM.response);
    unknownClass.breakdown[1].person1 = "Dvipada";
    const uc = projectRoxyVedicGunMilan(unknownClass, { ayanamsa: "lahiri" });
    assert.ok(uc.ok && uc.droppedValues.includes("breakdown.vashya.person1") && uc.technical.kootas[1].person1.label === "Dvipada", "bilinmeyen sınıflama ham gösterilir + denetime yazılır");
    assert.deepEqual([mapDosha("Nadi Dosha"), mapDosha("Bhakoot Dosha"), mapDosha("Bhakut Dosha"), mapDosha("Gana Dosha")], ["nadi", "bhakoot", "bhakoot", null]);
  });

  await t("E: Manglik / Sade Sati bozuk yanıtlar REDDEDİLİR", () => {
    const m: [string, J, (r: J) => void, string][] = [
      ["present+severity yok", MA.response, (r) => delete r.severity, "present ama severity yok"],
      ["present yok+severity", MB.response, (r) => (r.severity = "Mild"), "present değil ama severity var"],
      ["severity", MA.response, (r) => (r.severity = "Extreme"), "severity"],
      ["description", MB.response, (r) => delete r.description, "description"],
      ["present", MB.response, (r) => (r.present = "no"), "present"],
      ["çerçeve", MA.response, (r) => (r.frame.ayanamsa = "kp-old"), "frame: istenen ayanamsa değil"],
    ];
    for (const [n, src, mut, e] of m) {
      const raw = structuredClone(src);
      mut(raw);
      const r = projectRoxyVedicManglik(raw, { ayanamsa: "lahiri" });
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    const s: [string, (r: J) => void, string][] = [
      ["evre çözülemez", (r) => (r.type = "Bilinmeyen"), "present ama evre çözülemedi"],
      ["derece tutarsız", (r) => (r.severity = "Moderate"), "severity evreyle tutarsız"],
      ["present", (r) => delete r.present, "present"],
      ["present yok + derece", (r) => (r.present = false), "present değil ama severity var"],
      ["çerçeve", (r) => (r.frame.ayanamsa = "raman"), "frame: istenen ayanamsa değil"],
    ];
    for (const [n, mut, e] of s) {
      const raw = structuredClone(SS.response);
      mut(raw);
      const r = projectRoxyVedicSadeSati(raw, { ayanamsa: "lahiri", asOf: "2026-10-22" });
      assert.equal(r.ok, false, n);
      if (!r.ok) assert.ok(r.errors.includes(e), `${n}: ${r.errors.join("; ")}`);
    }
    const notActive = { frame: SS.response.frame, present: false, description: "Sadhesati etkin değil." };
    const na = projectRoxyVedicSadeSati(notActive, { ayanamsa: "lahiri", asOf: "2026-10-22" });
    assert.ok(na.ok && na.technical.present === false && na.technical.phase === null, "etkin olmayan durum kabul");
  });

  // ═══ F) MOTOR ════════════════════════════════════════════════════════════════
  await t("F: kayıt defteri + UI listesi; iki kişili; saat gerektirir; ayanamsa seçenekleri; Dashakoot / Papasamyam EKLENMEDİ", () => {
    for (const id of ["vedic.gun_milan", "vedic.sade_sati"]) {
      assert.ok((TECHNIQUE_IDS as readonly string[]).includes(id));
      assert.ok((UI_TECHNIQUES as readonly string[]).includes(id));
      assert.equal(getTechnique(id)!.requiresKnownTime, true);
      assert.equal(TECHNIQUE_META[id as "vedic.gun_milan"].needsTime, true);
      assert.equal(hasNoProviderInterpretation(id), false);
    }
    assert.equal(getTechnique("vedic.gun_milan")!.requiresPartner, true);
    assert.equal(TECHNIQUE_META["vedic.gun_milan"].needsPartner, true);
    assert.equal(getTechnique("vedic.sade_sati")!.requiresPartner, false);
    const def = getTechnique("vedic.gun_milan")!;
    assert.equal(def.parseOptions({ ayanamsa: "lahiri" }, new Date()), null, "karşı taraf zorunlu");
    assert.equal(def.parseOptions({ partnerProfileId: randomUUID(), ayanamsa: "tropical" }, new Date()), null);
    assert.equal(TECHNIQUE_IDS.length, 29);
    assert.ok(!TECHNIQUE_IDS.some((x) => /dashakoot|papasamyam|porutham/.test(x)));
    const src = ["lib/astrology/providers/roxy/vedicMatch.ts", "lib/astrology/engine/vedicMatchTechniques.ts", "lib/astrology/providers/roxy/vedicMatchRequests.ts"].map((p) => readFileSync(join(__dirname, "..", "..", p), "utf8")).join("\n");
    assert.ok(!/compatibility\/dashakoot|compatibility\/papasamyam/.test(src), "değerlendirildi; owner listesinde yok → eklenmedi");
  });

  await t("F: A + B Gun Milan → 3 istek (uyum + Manglik A + Manglik B; gövdeler golden ile BİREBİR); tekrar 0 istek; plan 0", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    const plan = (await planAstrology(ctx, { profileId: pa, selections: [GUN(pb)] })).body as J;
    assert.equal(plan.plan.newRequestCount, 3, JSON.stringify(plan.plan));
    const r1 = (await run(ctx, pa, [GUN(pb)], rx.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 500));
    assert.equal(rx.calls.length, 3);
    assert.equal(canon(rx.calls[0].body), canon(GM.body));
    assert.equal(canon(rx.calls[1].body), canon(MA.body));
    assert.equal(canon(rx.calls[2].body), canon(MB.body));
    const v = r1.results[0].view;
    assert.equal(v.technical.schema, "astro.vedic.gun_milan.v1");
    assert.equal(v.technical.total, 25.5);
    assert.deepEqual([v.technical.manglik.person1.present, v.technical.manglik.person1.severity, v.technical.manglik.person2.present], [true, "moderate", false]);
    assert.equal(v.method.zodiac, "sidereal");
    assert.equal(v.options.partnerRevision, 1);
    assert.equal(v.interpretation.visible, true);
    assert.equal(v.interpretation.content.schema, "astro.vedic.gun_milan.interp.v1", "yorum yalnız zorunlu (uyum) parçadan");
    assert.ok(!JSON.stringify(v.technical).includes("tavsiye"));
    await run(ctx, pa, [GUN(pb)], rx.deps);
    assert.equal(rx.calls.length, 3, "önbellekten gelmeli");
    const p2 = (await planAstrology(ctx, { profileId: pa, selections: [GUN(pb)] })).body as J;
    assert.equal(p2.plan.newRequestCount, 0);
  });

  await t("F: Manglik önbelleği KİŞİ BAŞINA — ters eşleştirmede (B analiz, A karşı taraf) yalnız uyum yeni istek; Manglik A/B önbellekten", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [GUN(pb)], rx.deps);
    const p = (await planAstrology(ctx, { profileId: pb, selections: [GUN(pa)] })).body as J;
    assert.equal(p.plan.newRequestCount, 1, JSON.stringify(p.plan));
    assert.equal(p.plan.cachedCount, 2);
    const u = p.plan.units.filter((x: J) => !x.cached);
    assert.equal(u[0].endpoint, ROXY_VEDIC_COMPATIBILITY.endpoint);
  });

  await t("F: Vedik D1 kaydı varsa Ay bilgisi bağlamdan eklenir (0 ek istek); D1 bağlam anahtarı vedic.d1 birimiyle aynı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [D1SEL], rx.deps);
    const n = rx.calls.length;
    const r = (await run(ctx, pa, [GUN(pb)], rx.deps)).body as J;
    assert.equal(rx.calls.length, n + 3, "bağlam birimi plana girmemeli");
    assert.deepEqual(r.results[0].view.technical.moons, { person1: { rashi: "pisces", nakshatra: "revati", pada: 4 }, person2: null });
    const gm = getTechnique("vedic.gun_milan")!;
    const d1 = getTechnique("vedic.d1")!;
    const ctxU = { birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "1990-07-15T11:30:00Z", partner: { birthDate: "1988-03-21", birthTime: "06:45:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 } };
    assert.equal(gm.contextUnits!(ctxU, { ayanamsa: "lahiri" })[0].inputHash, d1.units(ctxU, { ayanamsa: "lahiri" })[0].inputHash);
  });

  await t("F: Manglik parçası eksikse Manglik gösterilmez (yanlış kişiye atama yok); uyum parçası zorunlu", async () => {
    assert.equal(combineGunMilan([{ schema: "astro.vedic.manglik.v1" }]), null);
    const base = projectRoxyVedicGunMilan(GM.response, { ayanamsa: "lahiri" });
    const mb = projectRoxyVedicManglik(MB.response, { ayanamsa: "lahiri" });
    assert.ok(base.ok && mb.ok);
    if (!base.ok || !mb.ok) return;
    assert.equal(combineGunMilan([base.technical, mb.technical])!.manglik, null);
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy((ep, r) => {
      if (ep === ROXY_VEDIC_MANGLIK.endpoint && r.present === true) delete r.severity;
    });
    const res = (await run(ctx, pa, [GUN(pb)], rx.deps)).body as J;
    assert.equal(res.results[0].ok, true);
    assert.equal(res.results[0].partial, true);
    assert.equal(res.results[0].view.technical.manglik, null);
    const bad = roxy((ep, r) => {
      if (ep === ROXY_VEDIC_COMPATIBILITY.endpoint) r.total = 99;
    });
    const store2 = seed();
    const c2 = ctxOf(store2);
    const a2 = await profileA(c2);
    const b2 = await profileB(c2);
    const res2 = (await run(c2, a2, [GUN(b2)], bad.deps)).body as J;
    assert.equal(res2.results[0].ok, false);
    assert.equal(res2.results[0].code, "PROVIDER_INVALID_RESPONSE");
  });

  // ═══ G) SAAT YOK ═════════════════════════════════════════════════════════════
  await t("G: saat bilinmiyor (analiz edilen kişi / karşı taraf) → TIME_REQUIRED, sağlayıcıya GİDİLMEZ; Sade Sati da; görünüm maskesi", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const pa0 = await profileA(ctx, { label: "A saatsiz", birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const pb0 = await profileB(ctx, { label: "B saatsiz", birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const rx = roxy();
    const r1 = (await run(ctx, pa0, [GUN(pb), SADE()], rx.deps)).body as J;
    const r2 = (await run(ctx, pa, [GUN(pb0)], rx.deps)).body as J;
    assert.equal(rx.calls.length, 0, "saat bilinmeden sağlayıcı çağrıldı");
    assert.deepEqual(r1.results.map((x: J) => x.code), ["TIME_REQUIRED", "TIME_REQUIRED"]);
    assert.equal(r2.results[0].code, "TIME_REQUIRED");
    assert.ok(r2.results[0].error.includes("karşı tarafın doğum saati"), r2.results[0].error);
    assert.ok(r1.results[1].error.includes("Janma Rashi"));
    assert.equal(maskTechnical("vedic.gun_milan", { a: 1 }, { primary: true, partner: false }).technical, null);
    assert.equal(maskTechnical("vedic.sade_sati", { a: 1 }, { primary: false, partner: null }).technical, null);
    // Mevcut ikili teknikler etkilenmez: sinastri saatsiz karşı tarafla engellenmez (yeni dal yalnız saat gerektiren ikili teknikte).
    const syn = (await planAstrology(ctx, { profileId: pa, selections: [{ technique: "western.synastry", options: { partnerProfileId: pb0, houseSystem: "placidus", nodeType: "true" } }] })).body as J;
    assert.equal(syn.plan.selections[0].blocked, null, JSON.stringify(syn.plan.selections[0]));
  });

  // ═══ H) SADE SATI DEĞERLENDİRME GÜNÜ ════════════════════════════════════════
  await t("H: Sade Sati — gövdede tarih YOK (golden ile BİREBİR); değerlendirme günü anahtarda: aynı gün 0 istek, ertesi gün 1 yeni istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    const r = (await run(ctx, pa, [SADE()], rx.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    assert.equal(rx.calls.length, 1);
    assert.equal(canon(rx.calls[0].body), canon(SS.body));
    const today = sadeSatiAsOf(new Date())!;
    const v = r.results[0].view;
    assert.deepEqual([v.technical.present, v.technical.phase, v.technical.asOf], [true, "peak", today]);
    assert.equal(v.options.asOf, today);
    await run(ctx, pa, [SADE()], rx.deps);
    assert.equal(rx.calls.length, 1, "aynı gün önbellek");
    const tomorrow = new Date(Date.now() + 86_400_000);
    const p = (await planAstrology(ctx, { profileId: pa, selections: [SADE()] }, tomorrow)).body as J;
    assert.equal(p.plan.newRequestCount, 1, "ertesi gün yeni değerlendirme");
    const def = getTechnique("vedic.sade_sati")!;
    assert.deepEqual(def.parseOptions({ ayanamsa: "lahiri", asOf: "2000-01-01" }, new Date("2026-10-22T10:00:00Z")), { ayanamsa: "lahiri", asOf: "2026-10-22" }, "istemci tarihi kabul edilmez");
    const ctxU = { birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "", partner: null };
    const u1 = def.units(ctxU, { ayanamsa: "lahiri", asOf: "2026-10-22" })[0];
    const u2 = def.units(ctxU, { ayanamsa: "lahiri", asOf: "2026-10-23" })[0];
    assert.notEqual(u1.inputHash, u2.inputHash);
    assert.equal(canon(u1.body), canon(u2.body));
    assert.equal("evaluationDateUtc" in u1.body, false, "değerlendirme günü sağlayıcıya gönderilmez");
  });

  await t("H: Sade Sati + D1 önbellekteyse Janma Rashi eklenir (Balık · Revati 4); Bilgi Bankası konusu mevcut Gochara türü", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    await run(ctx, pa, [D1SEL], rx.deps);
    const r = (await run(ctx, pa, [SADE()], rx.deps)).body as J;
    assert.deepEqual(r.results[0].view.technical.janma, { rashi: "pisces", nakshatra: "revati", pada: 4 });
    assert.deepEqual(topicsForTechnique("vedic.sade_sati", r.results[0].view.technical).map((x) => x.key), ["gochara_from_moon:saturn:1"]);
    assert.equal(TECHNIQUE_TOPIC_CONTEXT["vedic.sade_sati"], "vedic_gochara");
    assert.equal(isSectionKeyForTechnique("vedic.sade_sati", "gochara_from_moon:saturn:12"), true);
    assert.deepEqual(topicsForTechnique("vedic.gun_milan", {}), []);
    assert.deepEqual(topicsForTechnique("vedic.sade_sati", { present: false, phase: null }), []);
  });

  // ═══ I) KAYDET → AÇ ══════════════════════════════════════════════════════════
  await t("I: kaydet → aç 0 istek (Gun Milan iki kişi + Sade Sati); snapshot teknik veri + karşı taraf; yorum yetkiyle saklanır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [GUN(pb), SADE()], rx.deps);
    const n = rx.calls.length;
    const s1 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...GUN(pb), saveRequestId: randomUUID() }, false);
    const s2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SADE(), saveRequestId: randomUUID() }, false);
    assert.equal(s1.status, 201, JSON.stringify(s1.body));
    assert.equal(s2.status, 201, JSON.stringify(s2.body));
    const a1 = ((await getAnalysis(ctx, (s1.body as J).analysisId, false)).body as J).analysis;
    const a2 = ((await getAnalysis(ctx, (s2.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a1.technical.total, 25.5);
    assert.equal(a1.technical.manglik.person1.present, true);
    assert.equal(a1.profile.partner.label, "Sentetik B");
    assert.equal(a1.interpretation.visible, true);
    assert.equal(a1.interpretation.content.recommendation, "Birleşim tavsiye edilir");
    assert.equal(a2.technical.phase, "peak");
    assert.equal(a2.interpretation.content.remedies.length, 8);
    const unsaved = await saveAnalysis(ctx, { profileId: pb, revision: 1, ...GUN(pa), saveRequestId: randomUUID() }, false);
    assert.equal(unsaved.status, 409, "hesaplanmamış sonuç kaydedilemez");
  });

  // ═══ J) RAPOR ════════════════════════════════════════════════════════════════
  await t("J: Word/PDF rapor modeli — Gun Milan: koota tablosu, toplam, dosha iptali, Manglik iki kişi, yöntem / yön notu; sağlayıcı adı / 'undefined' yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    await saveExpertNote(ctx, { profileId: pa, technique: "vedic.gun_milan", contextKey: pb, sectionKey: "overall", body: "Uzman notu eşleştirme", expectedRevision: null });
    await run(ctx, pa, [GUN(pb)], roxy().deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...GUN(pb), saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    const rep = buildAstroReport(a);
    const all = reportTexts(rep);
    const s = all.join("\n");
    for (const want of ["Gun Milan (Ashtakoot)", "Ashtakoot Gun Milan — teknik değerlendirme", "25,5 / 36 (%70,8)", "Varna", "Tara (Dina)", "Bhakoot (Rashi)", "Nadi", "1,5 / 3", "Bhakoot Dosha — iptal", "Manglik (Kuja dosha) — iki kişi", "4. / 7. ev grubu", "kendi burcunda", "Yöntem: Ashtakoot", "Yön: 1. kişi analiz edilen danışan", "Sentetik B", "Uzman notu eşleştirme", "Otomatik Yorum", "Birleşim tavsiye edilir", "hüküm dili içerebilir"])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of ["undefined", "NaN", "[object Object]", "Roxy", "roxy", "golden", "fixture", "/vedic-astrology"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
    // Hüküm cümlesi YALNIZ yorum bölümünde (teknik bölümden sonra).
    const iTech = all.indexOf("Teknik hesaplama sonuçları");
    const iInterp = all.indexOf("Otomatik Yorum");
    const iRec = all.indexOf("Birleşim tavsiye edilir");
    assert.ok(iTech >= 0 && iInterp > iTech && iRec > iInterp, `sıra: ${iTech} ${iInterp} ${iRec}`);
    assert.equal(rep.hasInterpretation, true);
  });

  await t("J: Word/PDF rapor modeli — Sade Sati: değerlendirme günü, evre, evre tablosu, kapsam notu (tarih üretilmez); yorum bölümünde çare listesi", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const rx = roxy();
    await run(ctx, pa, [D1SEL, SADE()], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SADE(), saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    const s = reportTexts(buildAstroReport(a)).join("\n");
    const today = sadeSatiAsOf(new Date())!;
    for (const want of [`Sade Sati — değerlendirme günü ${today.slice(8, 10)}.${today.slice(5, 7)}.${today.slice(0, 4)}`, "Sade Sati etkin", "Doruk evresi (Ay'dan 1. ev)", "Janma Rashi (Vedik D1 kaydından)", "Balık · Revati 4. pada", "Yükselen evre", "Batan evre", "Kova", "Koç", "Satürn bu evrede", "Kapsam: Hesaplama servisi yalnız değerlendirme günündeki durumu", "Geleneksel uygulamalar (servis metni; öneri değildir)", SS.response.remedies[0]])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of ["undefined", "NaN", "[object Object]", "Roxy", "golden"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
  });

  // ═══ K) YETKİ + YORUM KAPISI + SIZMA ═══════════════════════════════════════════
  await t("K: yorum yetkisi kapalı uzman — görünüm / kayıt / rapor hiçbir yerde sağlayıcı hüküm / çare metni YOK (sızma testi)", async () => {
    const store = seed();
    const ctx = ctxOf(store, { entitlements: NO_INTERP });
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    const r = await run(ctx, pa, [GUN(pb), SADE()], rx.deps);
    const body = JSON.stringify(r.body);
    for (const x of PROVIDER_TEXT) assert.ok(!body.includes(x), `yanıtta sızma: ${String(x).slice(0, 40)}`);
    assert.deepEqual((r.body as J).results.map((x: J) => x.view.interpretation), [{ visible: false, reason: "not_entitled" }, { visible: false, reason: "not_entitled" }]);
    const s1 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...GUN(pb), saveRequestId: randomUUID() }, false);
    const s2 = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...SADE(), saveRequestId: randomUUID() }, false);
    for (const sv of [s1, s2]) {
      const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
      const txt = JSON.stringify(a) + reportTexts(buildAstroReport(a)).join("\n");
      for (const x of PROVIDER_TEXT) assert.ok(!txt.includes(x), `kayıt/rapor sızma: ${String(x).slice(0, 40)}`);
      assert.ok(!txt.includes("tavsiye"));
    }
    // Owner önizleme "yorumu kapalı uzman görünümü" de aynı kapıdan geçer.
    const o = ctxOf(store);
    const hid = await run(o, pa, [GUN(pb)], rx.deps, true);
    assert.ok(!JSON.stringify(hid.body).includes(GM.response.recommendation));
  });

  await t("K: başka tenant ve aynı tenant'taki başka uzman Gun Milan / Sade Sati analizini açamaz / çalıştıramaz; karşı taraf başka tenant'tan seçilemez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    const rx = roxy();
    await run(ctx, pa, [GUN(pb), SADE()], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...GUN(pb), saveRequestId: randomUUID() }, false);
    const id = (sv.body as J).analysisId;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [SADE()], rx.deps)).status, 404);
    const cb = ctxOf(store, { tenantId: TENANT_B, userId: USER_B });
    const foreignA = await profileA(cb, { clientId: undefined });
    const cross = (await run(cb, foreignA, [GUN(pb)], rx.deps)).body as J;
    assert.equal(cross.results[0].code, "PARTNER_NOT_FOUND");
    const same = (await run(ctx, pa, [GUN(pa)], rx.deps)).body as J;
    assert.equal(same.results[0].code, "PARTNER_SAME_PROFILE");
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "vedic.sade_sati", noteContext: "ayanamsa:lahiri", sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });

  // ═══ L) MEVCUT TEKNİKLER DEĞİŞMEDİ ════════════════════════════════════════════
  await t("L: 16 temsili mevcut teknik seçiminin girdi özeti (gövde + anahtar) SABİT — taban 93b16b06 ile aynı hash", () => {
    const b = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };
    const p = { birthDate: "1988-03-21", birthTime: "06:45:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 };
    const ctxU = { birth: b, birthUtc: "1990-07-15T11:30:00Z", partner: p };
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
    const got: Record<string, string> = {};
    for (const [id, raw] of sels) {
      const def = getTechnique(id)!;
      const opt = def.parseOptions(raw, now)!;
      assert.ok(opt, id);
      got[id] = def.units(ctxU, opt).map((u) => `${u.endpoint}#${u.inputHash.slice(0, 16)}`).join(",");
    }
    const digest = canon(got);
    // Bu özet, TABAN (93b16b06) kodunda aynı betikle üretildi (RAPOR.md "önce" kanıtı).
    assert.equal(digest.length > 0, true);
    console.log(`     mevcut teknik özet: ${require("node:crypto").createHash("sha256").update(digest).digest("hex")}`);
    assert.equal(require("node:crypto").createHash("sha256").update(digest).digest("hex"), EXISTING_DIGEST);
    // Planlayıcı: yeni teknik eklenince mevcut seçimlerin plan sayıları değişmez.
    const plan = buildPlan([{ technique: "vedic.d1", options: { ayanamsa: "lahiri" }, ctx: ctxU, blocked: null }], () => false);
    assert.equal(plan.newRequestCount, 1);
  });

  // ═══ M) NOT / KB ══════════════════════════════════════════════════════════════
  await t("M: notlar — Gun Milan karşı tarafa göre (kimlik bağlamı), Sade Sati ayanamsaya göre; geçersiz bağlam 400; KB otomatik doldurulmaz", async () => {
    const def = getTechnique("vedic.sade_sati")!;
    assert.deepEqual(parseNoteContext(def, "ayanamsa:lahiri"), { ayanamsa: "lahiri" });
    assert.equal(parseNoteContext(def, "ayanamsa:tropical"), null);
    assert.equal(parseNoteContext(def, "ayanamsa:lahiri|asOf:2026-10-22"), null);
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profileA(ctx);
    const pb = await profileB(ctx);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.gun_milan", contextKey: pb, sectionKey: "overall", body: "eşleşme notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.gun_milan", sectionKey: "overall", body: "bağlamsız", expectedRevision: null })).status, 400);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.sade_sati", noteContext: "ayanamsa:lahiri", sectionKey: "gochara_from_moon:saturn:1", body: "doruk notu", expectedRevision: null })).status, 201);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "vedic.sade_sati", noteContext: "ayanamsa:lahiri", sectionKey: "graha_in_rashi:moon:pisces", body: "x", expectedRevision: null })).status, 400, "D1 bölümü Sade Sati'ye yazılamaz");
    assert.equal((store.tables.astro_kb_entries ?? []).length, 0, "KB'ye otomatik kayıt yok");
  });

  // ═══ N) UI YARDIMCILARI ═══════════════════════════════════════════════════════
  await t("N: UI — karşı taraf yoksa Gun Milan plana girmez (neden: karşı taraf seçin); seçenekler; özet Türkçe; sağlayıcı adı yok", () => {
    const p = defaultParams(new Date("2026-10-22T09:00:00Z"));
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    assert.equal(missingReason("vedic.gun_milan", p), "karşı taraf seçin");
    const pid = randomUUID();
    const sel = buildSelections({ "vedic.gun_milan": true, "vedic.sade_sati": true }, { ...p, partnerProfileId: pid }, method);
    assert.deepEqual(sel, [
      { technique: "vedic.gun_milan", options: { partnerProfileId: pid, ayanamsa: "lahiri" } },
      { technique: "vedic.sade_sati", options: { ayanamsa: "lahiri" } },
    ]);
    assert.equal(describeOptions("vedic.gun_milan", { partnerProfileId: pid, partnerRevision: 2, ayanamsa: "lahiri" }, () => "Sentetik B"), "Sentetik B (karşı taraf rev 2) · ayanamsa: Lahiri (Chitrapaksha)");
    assert.equal(describeOptions("vedic.sade_sati", { ayanamsa: "raman", asOf: "2026-10-22" }), "değerlendirme günü 22.10.2026 · ayanamsa: B.V. Raman");
    for (const id of ["vedic.gun_milan", "vedic.sade_sati"] as const) assert.ok(!/roxy/i.test(TECHNIQUE_META[id].label + TECHNIQUE_META[id].hint));
    const panel = readFileSync(join(__dirname, "..", "..", "app/admin/astroloji/_components/VedicMatchPanels.tsx"), "utf8");
    assert.ok(!/Roxy|golden|fixture/.test(panel.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "panel metninde iç jargon");
    assert.ok(!/(uygun değil|uyumlu değil|evlenmeli|evlenmemeli)/i.test(panel), "panelde hüküm dili");
  });

  // ═══ O) GOLDEN KLASÖRÜ ═════════════════════════════════════════════════════════
  await t("O: golden dosyalarında kişisel veri yok (yalnız sentetik A/B); anahtar metni yok", () => {
    const files = readdirSync(GDIR).filter((f) => /^vedic-(gun-milan|manglik-a|manglik-b|sadhesati)\.json$/.test(f));
    assert.equal(files.length, 4);
    for (const f of files) {
      const s = readFileSync(join(GDIR, f), "utf8");
      assert.ok(!/apiKey|x-api-key|Bearer/i.test(s), f);
      assert.ok(s.includes("1990-07-15") || s.includes("1988-03-21"), f);
    }
  });

  console.log(`\nvedik-eslesme-sadesati harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

/** Taban 93b16b06'da aynı 16 mevcut teknik seçiminin birim özetinin sha256'sı (RAPOR.md "önce" kanıtı ile üretildi). */
const EXISTING_DIGEST = "2a83256f72a7f43e8fe660bfdf97a6d7afc33e9cb8f32c2c4e78e5d616703046";

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
