/**
 * ASTROLOJİ — EK NOKTALAR harness'i (2026-10-22): asteroitler · Hermetik lotlar · Kara Ay Lilith (ortalama + gerçek).
 *
 * Kaynak: 4 gerçek sağlayıcı yanıtı (fixtures/golden/extra-*.json; sentetik kişiler A = 1990-07-15 14:30 İstanbul, N = aynı gün
 * 23:30 gece doğumu; ortak defter C:/YasamSistemi-QA/ATLAS-YENI-TEKNIKLER-2026-10-22/roxy-ledger.json) + natal golden
 * (fixtures/roxy-natal-golden-2026-10-07.json) + BAĞIMSIZ referans (fixtures/extra-points-reference-swisseph.json; pyswisseph +
 * Swiss Ephemeris dosyaları). Bu harness gerçek sağlayıcıya ÇAĞRI YAPMAZ.
 *
 *   A) golden ↔ projeksiyon ↔ bağımsız referans (asteroit boylam/enlem/hız/ev; Lilith ortalama/gerçek; lot Paulus aritmetiği; sect)
 *   B) fail-closed (bozuk/eksik/tutarsız yanıt → PROVIDER_INVALID_RESPONSE; bilinmeyen alan yalnız yol)
 *   C) saat yok (lot istenmez; ev maskesi; lot yorumu gizli) · D) plan (yalnız seçilen bölüm istek açar) · E) önbellek (2. çalıştırma 0)
 *   F) natal bağlam katmanı + tutarlılık (ortalama Lilith = natal; Fortuna = natal PoF, sect aynı; Zafer yöntem farkı)
 *   G) kayıt + arşiv 0 istek · H) Word/PDF metin işaretleri · I) yetki (başka tenant/uzman 404; yorum kapısı + sızma)
 *   J) mevcut 27 tekniğin birim gövdesi/anahtarı DEĞİŞMEDİ (taban 93b16b06 sabit hash'leri) · K) UI yardımcıları · L) marka
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/extra-points.harness.ts
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS, TECHNIQUES } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { buildNatalRequestBody } from "@/lib/astrology/providers/roxy/natal";
import {
  asteroidsBody,
  extraExpectOf,
  EXTRA_POINTS_KNOWN,
  lilithBody,
  lotsBody,
  parseLotFormula,
  projectRoxyAsteroids,
  projectRoxyLilith,
  projectRoxyLots,
  ROXY_EXTRA_POINTS,
} from "@/lib/astrology/providers/roxy/extraPoints";
import { EXTRA_SECTIONS, extraSectionsOf, LOT_DAY_FORMULA, lotFormulaFor, n360, type ExtraPointsTechnical } from "@/lib/astrology/model/westernExtraPoints";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { interpretationKindOfSchema } from "@/lib/astrology/interpretationKind";
import { topicsForTechnique } from "@/lib/astrology/topics/index";
import { buildSelections, defaultParams, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const GDIR = join(__dirname, "fixtures", "golden");
const G: Record<string, { endpoint: string; query: { lang: string }; body: Record<string, unknown>; response: J }> = Object.fromEntries(
  ["extra-asteroids", "extra-lots", "extra-lilith", "extra-lots-night"].map((n) => [n, JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8"))]),
);
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const REF = JSON.parse(readFileSync(join(__dirname, "fixtures", "extra-points-reference-swisseph.json"), "utf8"));
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
const arc = (a: number, b: number) => Math.abs(n360(a - b + 180) - 180);

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
const TROMSO: ResolvedLocation = { id: "no-tromso", label: "Tromsø, Norveç", timezone: "Europe/Oslo", latitude: 69.6492, longitude: 18.9553 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : id === TROMSO.id ? TROMSO : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const BIRTH_A = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };

const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

type Call = { endpoint: string; body: Record<string, unknown> };
/** Sahte sağlayıcı: YALNIZ gerçek golden'ı olan BİREBİR gövde döner (natal: golden gövdesi); başka gövde → 400 (sonuç uydurulmaz). */
function roxy(opts: { mutate?: (endpoint: string, r: J) => void; loose?: (endpoint: string, body: Record<string, unknown>) => J | null } = {}) {
  const calls: Call[] = [];
  const natalBody = buildNatalRequestBody(BIRTH_A, { houseSystem: "placidus", nodeType: "true" });
  const deps: EngineDeps = {
    config: { apiKey: "k-test-extra", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      let r: J = null;
      if (endpoint === "/astrology/natal-chart" && canon(body) === canon(natalBody)) r = structuredClone(NATAL);
      else {
        const g = Object.values(G).find((x) => x.endpoint === endpoint && canon(x.body) === canon(body));
        r = g ? structuredClone(g.response) : (opts.loose?.(endpoint, body) ?? null);
      }
      if (!r) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      opts.mutate?.(endpoint, r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}

async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const ALL = ["asteroids", "lots", "lilith"];
const EP = (sections: string[] = ALL, houseSystem = "placidus") => ({ technique: "western.extra_points", options: { sections, houseSystem } });
const NATAL_SEL = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, extra: Record<string, unknown> = {}) => runAstrology(ctx, { profileId: pid, selections, ...extra }, deps, { ownerPreviewHideInterp: false });
const view = (body: J, technique = "western.extra_points") => body.results.find((x: J) => x.technique === technique)?.view;

const projAst = (mut?: (r: J) => void) => {
  const r = structuredClone(G["extra-asteroids"].response);
  mut?.(r);
  return projectRoxyAsteroids(r, extraExpectOf(G["extra-asteroids"].body, "asteroids"));
};
const projLil = (mut?: (r: J) => void) => {
  const r = structuredClone(G["extra-lilith"].response);
  mut?.(r);
  return projectRoxyLilith(r, extraExpectOf(G["extra-lilith"].body, "lilith"));
};
const projLots = (name = "extra-lots", mut?: (r: J) => void) => {
  const r = structuredClone(G[name].response);
  mut?.(r);
  return projectRoxyLots(r, extraExpectOf(G[name].body, "lots"));
};

/** Taban 93b16b06'da (bu iş öncesi) üretilen mevcut 27 tekniğin birim/anahtar özetleri — bkz. QA ham/ek-noktalar/mevcut-teknik-hash-taban-93b16b06.json. */
const BASE_HASHES: Record<string, string> = {
  "western.natal": "2ca8cb0c0ded0090", "western.transit": "6516862b76ffcdd3", "western.forecast": "998cd0b3115cba02", "western.progression": "14e3164183e949eb",
  "western.solar_arc": "50d0d04be273ca62", "western.solar_return": "7215a22370c69a43", "western.lunar_return": "31cdf4497c99a577", "western.synastry": "29f032bc6897474a",
  "western.composite": "a7b3d847ef613c2f", "western.astrocartography": "56bc472d83428c58", "western.relocation": "877bc8f567fc8b1d", "western.local_space": "33ef8dbde5350d81",
  "western.fixed_stars": "785baef278eb4d34", "western.profections": "a148e70e96a16169", "vedic.d1": "6540f87c254caa0d", "vedic.varga": "d967986ce01c640a",
  "vedic.dasha": "1882874c698ac383", "vedic.drishti": "fc73462fed102d79", "vedic.ashtakavarga": "48715c60104086a4", "vedic.shadbala": "7dcc4f860e0bbba3",
  "vedic.panchanga": "3ad375f04321e69f", "vedic.transit": "73f31f7d3718b636", "kp.chart": "d7f489a2fb5c3834", "kp.dasha": "0590c5bb22dbf1a1",
  "kp.ruling": "5b0fef1b478ae8c0", "kp.transit": "364b0fda655fc7a3", "kp.horary": "6d5ca9ec5b9b533b",
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
};

async function main() {
  // ═══ A) GOLDEN ↔ PROJEKSİYON ↔ BAĞIMSIZ REFERANS ════════════════════════════════
  await t("A: ürün gövdeleri golden gövdeleriyle BİREBİR (lang=tr; nodeType true; lotlarda ev sistemi her zaman Placidus)", () => {
    assert.equal(canon(asteroidsBody(BIRTH_A, "placidus")), canon(G["extra-asteroids"].body));
    assert.equal(canon(lilithBody(BIRTH_A, "placidus")), canon(G["extra-lilith"].body));
    assert.equal(canon(lotsBody(BIRTH_A)), canon(G["extra-lots"].body));
    assert.equal(canon(lotsBody({ ...BIRTH_A, birthTime: "23:30:00" })), canon(G["extra-lots-night"].body));
    for (const g of Object.values(G)) assert.equal(g.query.lang, "tr");
    assert.equal(lotsBody(BIRTH_A).houseSystem, "placidus");
    assert.equal(asteroidsBody(BIRTH_A, "whole-sign").houseSystem, "whole-sign");
  });

  await t("A: asteroitler — 4 cisim kanonik sırada; boylam/enlem/hız Swiss Ephemeris ile ≤0,001°, ev ve retro birebir; eşlenmemiş alan 0", () => {
    const p = projAst();
    assert.ok(p.ok, JSON.stringify(!p.ok && p.errors));
    if (!p.ok) return;
    const tt = p.technical as J;
    assert.deepEqual(tt.bodies.map((b: J) => b.id), ["ceres", "pallas", "juno", "vesta"]);
    for (const b of tt.bodies) {
      const r = REF.asteroids[b.id];
      assert.ok(arc(b.longitude, r.longitude) < 1e-3, `${b.id} boylam ${b.longitude} ≠ ${r.longitude}`);
      assert.ok(Math.abs(b.latitude - r.latitude) < 1e-3, `${b.id} enlem`);
      assert.ok(Math.abs(b.speed - r.speed) < 1e-3, `${b.id} hız`);
      assert.equal(b.house, r.house, `${b.id} ev`);
      assert.equal(b.retrograde, b.speed < 0);
    }
    assert.deepEqual(p.unmappedFields, []);
    assert.ok(!JSON.stringify(tt).includes("haritanızda"), "teknik katmanda sağlayıcı metni olmamalı");
    assert.equal((p.interpretation as J).asteroids.items.length, 4);
  });

  await t("A: Lilith — ortalama SE ile ≤0,001° ve natal golden Kara Ay Lilith ile BİREBİR; gerçek (osculating) SE ile ≤0,001°; iki değişken ayrı alan", () => {
    const p = projLil();
    assert.ok(p.ok, JSON.stringify(!p.ok && p.errors));
    if (!p.ok) return;
    const tt = p.technical as J;
    assert.equal(tt.mean.variant, "mean");
    assert.equal(tt.true.variant, "true");
    assert.ok(arc(tt.mean.longitude, REF.lilith.mean.longitude) < 1e-3);
    assert.ok(arc(tt.true.longitude, REF.lilith.true.longitude) < 1e-3);
    const natalLilith = NATAL.planets.find((x: J) => /lilith/i.test(x.name));
    assert.equal(tt.mean.longitude, natalLilith.longitude, "ortalama Lilith natal golden ile aynı olmalı");
    assert.equal(tt.mean.house, natalLilith.house);
    assert.ok(arc(tt.mean.longitude, tt.true.longitude) > 20, "golden'da ortalama ile gerçek ~26° farklı (karışmamalı)");
    assert.equal(tt.mean.retrograde, false);
    assert.deepEqual(p.unmappedFields, []);
  });

  await t("A: lotlar — gündüz (A) / gece (N) sect SE Güneş irtifasıyla aynı; formül Paulus ile (Zafer HARİÇ) birebir; değerler SE Paulus aritmetiğiyle ≤0,001°", () => {
    for (const [name, key] of [["extra-lots", "A"], ["extra-lots-night", "N"]] as const) {
      const p = projLots(name);
      assert.ok(p.ok, JSON.stringify(!p.ok && p.errors));
      if (!p.ok) return;
      const tt = p.technical as J;
      assert.equal(tt.sect, REF.lots[key].sect, `${name} sect`);
      assert.deepEqual(tt.lots.map((l: J) => l.id), ["fortune", "spirit", "eros", "necessity", "courage", "victory", "nemesis"]);
      for (const l of tt.lots) {
        const exp = lotFormulaFor(l.id, tt.sect);
        if (l.id === "victory") {
          assert.equal(l.traditional, false, "Zafer: sağlayıcı terimleri ters sırayla kullanıyor");
          assert.deepEqual([l.plus, l.minus], [exp.minus, exp.plus]);
          assert.ok(arc(l.longitude, REF.lots[key].paulus.victory) > 20, "Zafer değeri Paulus formülünden farklı (yöntem farkı belgelendi)");
        } else {
          assert.equal(l.traditional, true, `${name} ${l.id} gelenek`);
          assert.ok(arc(l.longitude, REF.lots[key].paulus[l.id]) < 1e-3, `${name} ${l.id} ${l.longitude} ≠ ${REF.lots[key].paulus[l.id]}`);
        }
      }
      assert.deepEqual(p.unmappedFields, []);
    }
    assert.equal(LOT_DAY_FORMULA.fortune.plus, "moon");
    assert.deepEqual(lotFormulaFor("fortune", "night"), { plus: "sun", minus: "moon" });
  });

  await t("A: Zafer (sağlayıcı) = Yükselen + Ruh − Jüpiter (gündüz) natal golden Yükselen/Jüpiter ile ≤0,001° → sağlayıcı kendi formülüyle tutarlı; Fortuna + Ruh ≡ 2·ASC", () => {
    const p = projLots();
    if (!p.ok) throw new Error(p.errors.join(";"));
    const L = Object.fromEntries((p.technical as J).lots.map((l: J) => [l.id, l.longitude]));
    const asc = NATAL.ascendant.longitude;
    const jup = NATAL.planets.find((x: J) => x.name === "Jupiter").longitude;
    assert.ok(arc(L.victory, n360(asc + L.spirit - jup)) < 1e-3);
    assert.ok(arc(n360((L.fortune + L.spirit) / 2), asc) < 1e-3 || arc(n360((L.fortune + L.spirit) / 2 + 180), asc) < 1e-3);
    assert.ok(arc(L.fortune, NATAL.partOfFortune.longitude) < 1e-3, "lot Fortuna = natal Şans Noktası");
    assert.equal(NATAL.partOfFortune.sect, "day");
  });

  await t("A: formül ayrıştırıcı — İngilizce sağlayıcı metni; tanınmayan / yerelleştirilmiş / aynı terim → null", () => {
    assert.deepEqual(parseLotFormula("Ascendant + Part of Spirit - Venus"), { plus: "spirit", minus: "venus" });
    assert.deepEqual(parseLotFormula("Ascendant + Moon - Sun"), { plus: "moon", minus: "sun" });
    for (const bad of ["Yükselen + Ay - Güneş", "Ascendant + Pluto - Sun", "Ascendant + Sun - Sun", "MC + Moon - Sun", 42, null]) assert.equal(parseLotFormula(bad), null, String(bad));
  });

  // ═══ B) FAIL-CLOSED ══════════════════════════════════════════════════════════════
  await t("B: asteroit — eksik/yinelenen cisim, burç-boylam tutarsızlığı, retro-hız çelişkisi, ev aralığı, yankı farkı, ev sistemi geri dönüşü → RET", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["eksik", (r) => r.asteroids.pop(), "dört asteroit yerine 3"],
      ["tekrar", (r) => (r.asteroids[1] = structuredClone(r.asteroids[0])), "tekrar"],
      ["burç", (r) => (r.asteroids[0].sign = "Virgo"), "eksik/geçersiz alan"],
      ["derece", (r) => (r.asteroids[0].degree = 3), "eksik/geçersiz alan"],
      ["retro", (r) => (r.asteroids[0].isRetrograde = true), "retro bayrağı"],
      ["ev", (r) => (r.asteroids[0].house = 13), "eksik/geçersiz alan"],
      ["isim", (r) => (r.asteroids[0].name = "Chiron"), "name bilinmiyor"],
      ["saat yankısı", (r) => (r.birthDetails.time = "14:31:00"), "birthDetails.time uyuşmuyor"],
      ["ev sistemi", (r) => (r.houseSystem = "whole-sign"), "houseSystem yankısı"],
      ["dizi yok", (r) => delete r.asteroids, "asteroids dizi değil"],
    ];
    for (const [n, m, e] of cases) {
      const p = projAst(m);
      assert.equal(p.ok, false, n);
      if (!p.ok) assert.ok(p.errors.some((x) => x.includes(e)), `${n}: ${p.errors.join("; ")}`);
    }
    assert.equal(projectRoxyAsteroids(null, extraExpectOf(G["extra-asteroids"].body, "asteroids")).ok, false);
    const extra = projAst((r) => (r.newField = 1));
    assert.ok(extra.ok && extra.unmappedFields.includes("newField"), "bilinmeyen alan yalnız yol olarak raporlanmalı");
  });

  await t("B: Lilith — tek değişken, iki ortalama, ortalama retro/negatif hız, gerçek retro-hız çelişkisi → RET (ortalama/gerçek karışamaz)", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["tek", (r) => r.lilith.pop(), "tam olarak bir ortalama + bir gerçek"],
      ["iki ortalama", (r) => (r.lilith[1].variant = "mean"), "tekrar"],
      ["ortalama retro", (r) => { r.lilith[0].isRetrograde = true; r.lilith[0].speed = -0.1; }, "ortalama apoje"],
      ["gerçek retro", (r) => (r.lilith[1].isRetrograde = true), "retro bayrağı"],
      ["bilinmeyen değişken", (r) => (r.lilith[1].variant = "osculating"), "variant bilinmiyor"],
    ];
    for (const [n, m, e] of cases) {
      const p = projLil(m);
      assert.equal(p.ok, false, n);
      if (!p.ok) assert.ok(p.errors.some((x) => x.includes(e)), `${n}: ${p.errors.join("; ")}`);
    }
  });

  await t("B: lotlar — sect yok, eksik lot, yabancı terim, Fortuna/Ruh sect'e ters formül, tanınmaz formül → RET; Zafer ters sırası KABUL (traditional=false)", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["sect", (r) => delete r.sect, "sect"],
      ["eksik", (r) => r.lots.pop(), "yedi lot yerine 6"],
      ["yabancı terim", (r) => (r.lots[2].formula = "Ascendant + Mars - Part of Spirit"), "bu lotun terimleri değil"],
      ["fortuna ters", (r) => (r.lots[0].formula = "Ascendant + Sun - Moon"), "sect ile tutarsız"],
      ["gece sect + gündüz formülleri", (r) => (r.sect = "night"), "sect ile tutarsız"],
      ["formül metni", (r) => (r.lots[3].formula = "Yükselen + Şans - Merkür"), "eksik/geçersiz alan"],
      ["id", (r) => (r.lots[6].id = "basis"), "id bilinmiyor"],
    ];
    for (const [n, m, e] of cases) {
      const p = projLots("extra-lots", m);
      assert.equal(p.ok, false, n);
      if (!p.ok) assert.ok(p.errors.some((x) => x.includes(e)), `${n}: ${p.errors.join("; ")}`);
    }
    const okv = projLots("extra-lots", (r) => (r.lots[5].formula = "Ascendant + Jupiter - Part of Spirit"));
    assert.ok(okv.ok && (okv.technical as J).lots[5].traditional === true, "sağlayıcı Zafer'i düzeltirse traditional=true");
  });

  await t("B: motor — bozuk yanıt → PROVIDER_INVALID_RESPONSE, sonuç ve kayıt yok; diğer bölüm etkilenmez (kısmi) ama kayıt eksik bölümle yapılamaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy({ mutate: (e, r) => { if (e === ROXY_EXTRA_POINTS.lilith.endpoint) r.lilith.pop(); } });
    const body = (await run(ctx, pa, [EP(["asteroids", "lilith"])], rx.deps)).body as J;
    assert.equal(body.ok, true);
    const v = view(body);
    assert.equal(body.results[0].partial, true);
    assert.equal(v.technical.lilith, null, "bozuk Lilith gösterilmemeli");
    assert.equal(v.technical.asteroids.bodies.length, 4);
    assert.equal(v.missingParts, 1);
    const all = (await run(ctx, pa, [EP(["lilith"])], rx.deps)).body as J;
    assert.equal(all.ok, false);
    assert.equal(all.code, "PROVIDER_INVALID_RESPONSE");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...EP(["asteroids", "lilith"]), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 409, "eksik bölümle kayıt yapılmamalı");
  });

  // ═══ C) SAAT YOK ════════════════════════════════════════════════════════════════
  await t("C: doğum saati bilinmiyor — lot İSTENMEZ (yalnız lot seçiliyse NO_UNIT + gerekçe); asteroit/Lilith 12:00 ile istenir, evler maskelenir", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, { birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const noon = (endpoint: string, body: Record<string, unknown>) => {
      const g = Object.values(G).find((x) => x.endpoint === endpoint && x.endpoint !== ROXY_EXTRA_POINTS.lots.endpoint);
      if (!g) return null;
      const r = structuredClone(g.response); // test: golden yapısı, yankı 12:00'ye çekilir (yalnız maske davranışını sınamak için)
      r.birthDetails.time = body.time;
      return r;
    };
    const rx = roxy({ loose: noon });
    const only = (await run(ctx, pa, [EP(["lots"])], rx.deps)).body as J;
    assert.equal(rx.calls.length, 0, "saat bilinmeden lot isteği gitti");
    assert.ok(JSON.stringify(only).includes("NO_UNIT") && JSON.stringify(only).includes("doğum saati"), JSON.stringify(only).slice(0, 300));
    const plan = (await planAstrology(ctx, { profileId: pa, selections: [EP()] })).body as J;
    assert.equal(plan.plan.newRequestCount, 2, "saat yokken yalnız asteroit + Lilith");
    assert.equal(plan.plan.selections[0].info.skippedSections[0].section, "lots");
    const body = (await run(ctx, pa, [EP()], rx.deps)).body as J;
    assert.ok(rx.calls.every((c) => c.endpoint !== ROXY_EXTRA_POINTS.lots.endpoint));
    assert.ok(rx.calls.every((c) => c.body.time === "12:00:00"));
    const v = view(body);
    assert.equal(v.timeUnknownMasked, true);
    assert.equal(v.technical.lots, null);
    assert.ok(v.technical.asteroids.bodies.every((b: J) => b.house === null));
    assert.equal(v.technical.lilith.mean.house, null);
    assert.equal(v.technical.lilith.true.house, null);
    assert.equal(v.technical.natalFrame, null);
    assert.ok(v.warnings.some((w: string) => w.includes("Hermetik lotlar")));
    assert.equal(v.interpretation.content.lots, null);
    const m = maskTechnical("western.extra_points", { schema: "astro.western.extra_points.v1", asteroids: null, lilith: null, lots: { lots: [] } }, { primary: false, partner: null });
    assert.equal((m.technical as J).lots, null);
  });

  // ═══ D/E) PLAN + ÖNBELLEK ═══════════════════════════════════════════════════════
  await t("D/E: yalnız seçilen bölüm istek açar (1/2/3); 2. çalıştırma 0 istek; lotlar ev sisteminden bağımsız (aynı anahtar); natal bağlamı plana girmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    for (const [secs, n] of [[["lilith"], 1], [["asteroids", "lilith"], 2], [ALL, 3]] as const) {
      const p = (await planAstrology(ctx, { profileId: pa, selections: [EP([...secs])] })).body as J;
      assert.equal(p.plan.newRequestCount, n, `${secs.join(",")}`);
      assert.ok(p.plan.units.every((u: J) => u.technique === "western.extra_points"), "natal bağlam birimi planda olmamalı");
    }
    const rx = roxy();
    const r1 = (await run(ctx, pa, [EP()], rx.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 400));
    assert.equal(rx.calls.length, 3);
    assert.deepEqual(rx.calls.map((c) => c.endpoint).sort(), ["/astrology/arabic-lots", "/astrology/asteroids", "/astrology/lilith"]);
    const p2 = (await planAstrology(ctx, { profileId: pa, selections: [EP(), EP(["lots"]), EP(["lilith", "asteroids"])] })).body as J;
    assert.equal(p2.plan.newRequestCount, 0);
    await run(ctx, pa, [EP()], rx.deps);
    assert.equal(rx.calls.length, 3, "2. çalıştırma yeni istek yaptı");
    const ws = (await planAstrology(ctx, { profileId: pa, selections: [EP(ALL, "whole-sign")] })).body as J;
    assert.equal(ws.plan.newRequestCount, 2, "Whole Sign: asteroit + Lilith yeni; lotlar (Placidus sect) önbellekten");
    assert.equal(getTechnique("western.extra_points")!.parseOptions({ sections: [] , houseSystem: "placidus" }, new Date()), null);
    assert.equal(getTechnique("western.extra_points")!.parseOptions({ sections: ["lots", "lots"] }, new Date()), null);
    assert.deepEqual(getTechnique("western.extra_points")!.parseOptions({ sections: ["lilith", "asteroids"] }, new Date()), { sections: ["asteroids", "lilith"], houseSystem: "placidus" });
    assert.deepEqual(extraSectionsOf(["lilith", "lots"]), ["lots", "lilith"]);
  });

  await t("D: kutup dairesi (Tromsø) + Placidus → asteroit/Lilith/lot İSTENMEZ (NO_UNIT, ev sistemi önerisi); Equal ile asteroit+Lilith istenir, lot istenmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pp = await profile(ctx, { locationId: TROMSO.id });
    const p = (await planAstrology(ctx, { profileId: pp, selections: [EP()] })).body as J;
    assert.equal(p.plan.newRequestCount, 0);
    assert.ok(JSON.stringify(p.plan.selections[0].blocked).includes("Whole Sign veya Equal"), JSON.stringify(p.plan.selections[0]));
    const e = (await planAstrology(ctx, { profileId: pp, selections: [EP(ALL, "equal")] })).body as J;
    assert.equal(e.plan.newRequestCount, 2);
    assert.equal(e.plan.selections[0].info.skippedSections[0].section, "lots");
  });

  // ═══ F) NATAL BAĞLAM KATMANI + TUTARLILIK ════════════════════════════════════════
  await t("F: natal yoksa çerçeve/denetim null (yeni istek yok); natal önbellekteyse natal çark çerçevesi + Lilith/Fortuna/lot denetimi UYUMLU; natal görünümü değişmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r0 = (await run(ctx, pa, [EP()], rx.deps)).body as J;
    assert.equal(view(r0).technical.natalFrame, null);
    assert.equal(view(r0).technical.natalCheck, null);
    assert.equal(rx.calls.filter((c) => c.endpoint === "/astrology/natal-chart").length, 0, "natal sağlayıcıya gönderildi");
    const rn = (await run(ctx, pa, [NATAL_SEL], rx.deps)).body as J;
    const natalView = view(rn, "western.natal");
    const before = rx.calls.length;
    const r1 = (await run(ctx, pa, [EP()], rx.deps)).body as J;
    assert.equal(rx.calls.length, before, "natal bağlamı / ek noktalar yeni istek yaptı");
    const v = view(r1).technical as ExtraPointsTechnical;
    assert.ok(v.natalFrame, "natal çerçeve eklenmeli");
    assert.equal(v.natalFrame!.houses.length, 12);
    assert.equal(v.natalFrame!.angles.ascendant.longitude, NATAL.ascendant.longitude);
    assert.equal(v.natalCheck!.meanLilith.status, "consistent");
    assert.equal(v.natalCheck!.meanLilith.diffDeg, 0);
    assert.equal(v.natalCheck!.fortune.status, "consistent");
    assert.equal(v.natalCheck!.fortune.lotSect, "day");
    assert.equal(v.natalCheck!.fortune.natalSect, "day");
    assert.ok(v.natalCheck!.fortune.diffDeg! < 0.001);
    assert.equal(v.natalCheck!.lotFormulas.status, "consistent", "sağlayıcı formülleriyle aritmetik (Zafer dahil)");
    assert.ok(v.natalCheck!.lotFormulas.maxDiffDeg! < 0.001);
    // Natal teknik görünümü ek noktalar eklenince AYNI (natal sonuç değişmez).
    const rn2 = (await run(ctx, pa, [NATAL_SEL], rx.deps)).body as J;
    assert.equal(canon(view(rn2, "western.natal").technical), canon(natalView.technical));
    assert.ok(!("asteroids" in natalView.technical) && natalView.technical.variants.lilith === "mean");
    // Aynı çalıştırmada natal + ek noktalar seçilirse bağlam aynı çalıştırmadan gelir.
    const store2 = seed();
    const ctx2 = ctxOf(store2);
    const pb = await profile(ctx2);
    const rx2 = roxy();
    const both = (await run(ctx2, pb, [NATAL_SEL, EP(["lots"])], rx2.deps)).body as J;
    assert.ok(view(both).technical.natalFrame, "aynı çalıştırmadaki natal bağlam");
    assert.equal(rx2.calls.length, 2);
  });

  await t("F: natal Şans Noktası farklıysa denetim UYUMSUZ (sessiz düzeltme yok, lot değeri aynen); ev sistemi farklı natal çerçeve OLARAK kullanılmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy({ mutate: (e, r) => { if (e === "/astrology/natal-chart") r.partOfFortune.longitude = n360(r.partOfFortune.longitude + 1); } });
    await run(ctx, pa, [NATAL_SEL], rx.deps);
    const v = view(((await run(ctx, pa, [EP(["lots"])], rx.deps)).body as J)).technical as ExtraPointsTechnical;
    assert.equal(v.natalCheck!.fortune.status, "inconsistent");
    assert.ok(Math.abs(v.natalCheck!.fortune.diffDeg! - 1) < 0.01);
    assert.ok(arc(v.lots!.lots[0].longitude, G["extra-lots"].response.lots[0].longitude) < 1e-9, "lot değeri değiştirilmemeli");
    const def = getTechnique("western.extra_points")!;
    const ctxU = { birth: BIRTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null };
    const cu = def.contextUnits!(ctxU, { sections: ALL, houseSystem: "whole-sign" });
    assert.ok(cu.every((u) => u.body.houseSystem === "whole-sign" && u.technique === "western.natal"), "bağlam natali yalnız AYNI ev sistemi");
  });

  // ═══ G) KAYIT + ARŞİV ═══════════════════════════════════════════════════════════
  await t("G: kaydet → aç 0 istek; snapshot üç bölüm + natal çerçeve + tutarlılık; Sistem Yorumu kayıtta; seçenek bölümleri", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [NATAL_SEL, EP()], rx.deps);
    const n = rx.calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...EP(), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.deepEqual(a.params.sections, ALL);
    assert.equal(a.technical.schema, "astro.western.extra_points.v1");
    assert.equal(a.technical.asteroids.bodies.length, 4);
    assert.equal(a.technical.lots.lots.length, 7);
    assert.ok(a.technical.lilith.mean && a.technical.lilith.true);
    assert.ok(a.technical.natalFrame && a.technical.natalCheck.fortune.status === "consistent");
    assert.equal(a.interpretation.visible, true);
    assert.equal(a.interpretation.content.schema, "astro.western.extra_points.interp.v1");
    assert.equal(a.interpretation.content.asteroids.items[0].text, G["extra-asteroids"].response.asteroids[0].interpretation);
    assert.equal(a.interpretation.content.lilith.items[1].note, G["extra-lilith"].response.lilith[1].note);
  });

  // ═══ H) RAPOR ═══════════════════════════════════════════════════════════════════
  await t("H: Word/PDF rapor modeli — üç bölüm tabloları, ortalama/gerçek ayrı satır, sect, formüller, Zafer yöntem notu, Fortuna tek kaynak, natal tutarlılık, Sistem Yorumu; yasak metin yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    await saveExpertNote(ctx, { profileId: pa, technique: "western.extra_points", noteContext: null, sectionKey: "overall", body: "Ek noktalar uzman notu", expectedRevision: null });
    const rx = roxy();
    await run(ctx, pa, [NATAL_SEL, EP()], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...EP(), saveRequestId: randomUUID() }, false);
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    const s = reportTexts(buildAstroReport(a)).join("\n");
    for (const want of [
      "Ek noktalar", "Asteroitler", "Ceres", "Pallas", "Juno", "Vesta", "Ortalama Kara Ay Lilith (ortalama apoje)", "Gerçek Kara Ay Lilith (osculating apoje)",
      "Hermetik lotlar", "Gündüz haritası (Güneş ufkun üstünde)", "Şans Noktası (Fortuna)", "Yükselen + Ay − Güneş", "Zafer Noktası (Victory)", "Yükselen + Ruh Noktası − Jüpiter",
      "Yöntem farkı *", "Paulus", "Şans Noktası tek kaynaktan gösterilir", "Natal harita ile tutarlılık", "Uyumlu", "Sistem Yorumu", "Ek noktalar uzman notu",
      "Aslan", G["extra-asteroids"].response.asteroids[0].interpretation, G["extra-lilith"].response.lilith[1].note,
    ])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of ["undefined", "NaN", "[object Object]", "Roxy", "roxy", "golden", "fixture", "/astrology/"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
    assert.equal(interpretationKindOfSchema("astro.western.extra_points.interp.v1"), "Sistem Yorumu");
    // Owner 22.10: Zafer (Victory) burcu/derecesi doğrulanana kadar Word/PDF'te YOK; diğer lotlar ve kayıtlı veri aynı.
    const vic = G["extra-lots"].response.lots.find((x: J) => x.id === "victory");
    assert.ok(s.includes("Yöntem doğrulanıyor"), "rapor: Zafer hücresi 'Yöntem doğrulanıyor' değil");
    assert.ok(!s.includes(vic.longitude.toFixed(4).replace(".", ",")), "rapor: Zafer boylamı yazılmış");
    assert.ok(!s.includes(vic.interpretation), "rapor: Zafer açıklaması (burç içerir) yazılmış");
    assert.ok(s.includes("burcu ve derecesi gösterilmez"), "rapor: gizleme notu yok");
    const nem = G["extra-lots"].response.lots.find((x: J) => x.id === "nemesis");
    assert.ok(s.includes(nem.longitude.toFixed(4).replace(".", ",")) && s.includes(nem.interpretation), "rapor: diğer lot (Nemesis) etkilenmemeli");
    const savedVic = (a.technical.lots.lots as J[]).find((x) => x.id === "victory");
    assert.ok(savedVic && Math.abs(savedVic.longitude - vic.longitude) < 1e-9, "kayıtlı teknik veri değişmemeli (yalnız gösterim gizlenir)");
  });

  // ═══ I) YETKİ + YORUM KAPISI ═══════════════════════════════════════════════════
  await t("I2 (akşam 22.10): yorum YETKİLİ kullanıcıda da Zafer'in burcunu söyleyen sağlayıcı cümlesi API yanıtında / kayıtta / arşivde YOK; diğer lot açıklamaları var", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const vicText = G["extra-lots"].response.lots.find((x: J) => x.id === "victory").interpretation;
    const nemText = G["extra-lots"].response.lots.find((x: J) => x.id === "nemesis").interpretation;
    const body = (await run(ctx, pa, [EP()], rx.deps)).body as J;
    const raw = JSON.stringify(body);
    assert.equal(view(body).interpretation.visible, true);
    assert.ok(!raw.includes(vicText), "çalıştırma yanıtında Zafer açıklaması var");
    assert.ok(raw.includes(nemText), "diğer lot açıklaması korunmalı");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...EP(), saveRequestId: randomUUID() }, false);
    const opened = JSON.stringify((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body);
    assert.ok(!opened.includes(vicText) && opened.includes(nemText), "arşivden açmada Zafer açıklaması yok, diğerleri var");
    const dbSnap = JSON.stringify(store.tables.astro_analyses ?? []);
    assert.ok(!dbSnap.includes(vicText), "kayıtlı yorum anlık görüntüsünde Zafer açıklaması yok");
  });

  await t("I: başka tenant / aynı tenant başka uzman → analiz ve çalıştırma 404; yorum yetkisi kapalı → sağlayıcı metni yanıtta YOK (sızma yok), teknik aynı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [EP()], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...EP(), saveRequestId: randomUUID() }, false);
    const id = (sv.body as J).analysisId;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [EP()], rx.deps)).status, 404);
    const ni = ctxOf(store, { entitlements: NO_INTERP });
    const body = (await run(ni, pa, [EP()], rx.deps)).body as J;
    const v = view(body);
    assert.equal(v.interpretation.visible, false);
    const js = JSON.stringify(body);
    for (const txt of [G["extra-asteroids"].response.asteroids[0].interpretation, G["extra-lots"].response.lots[0].interpretation, G["extra-lilith"].response.lilith[0].note, G["extra-lilith"].response.summary])
      assert.ok(!js.includes(String(txt).slice(0, 40)), "yetkisiz yanıtta sağlayıcı metni");
    assert.equal(v.technical.asteroids.bodies.length, 4);
    const a = ((await getAnalysis(ni, id, false)).body as J).analysis;
    assert.ok(!JSON.stringify(a).includes(String(G["extra-asteroids"].response.asteroids[0].interpretation).slice(0, 40)), "yetkisiz kayıt açılışında sağlayıcı metni");
    assert.ok(!JSON.stringify(v.technical).includes("haritanızda"), "teknik katmanda yorum metni");
  });

  // ═══ J) MEVCUT TEKNİKLER DEĞİŞMEDİ ══════════════════════════════════════════════
  await t("J: mevcut 27 tekniğin birim gövdesi + adaptör + input_hash + bağlam anahtarları taban (93b16b06) ile BİREBİR; natal gövdesine alan eklenmedi", () => {
    const partner = { birthDate: "1988-03-21", birthTime: "06:45:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 };
    const ctx = { birth: BIRTH_A, birthUtc: "1990-07-15T11:30:00.000Z", partner, places: { target: { latitude: 51.5072, longitude: -0.1276 }, reference: { latitude: 51.5072, longitude: -0.1276 } } };
    const now = new Date("2026-10-07T09:00:00Z");
    // Taban 27 kimliğe sabit (paralel PR'ların eklediği yeni teknikler bu denetimin kapsamı dışında).
    for (const id of Object.keys(BASE_HASHES) as (keyof typeof TECHNIQUES)[]) {
      const def = TECHNIQUES[id];
      let opt = HASH_OPTS[id] as Record<string, unknown> | undefined;
      if (!opt) opt = def.parseOptions({}, now) ?? def.parseOptions({ now: true, horaryNumber: 1 }, now) ?? undefined;
      assert.ok(opt, id);
      const us = def.units(ctx as never, opt!);
      const cu = def.contextUnits ? def.contextUnits(ctx as never, opt!) : [];
      const h = createHash("sha256").update(JSON.stringify([us.map((u) => [u.endpoint, u.adapterVersion, u.inputHash, u.body, u.query ?? null]), cu.map((u) => u.inputHash)])).digest("hex").slice(0, 16);
      assert.equal(h, BASE_HASHES[id], `${id} girdi özeti değişti`);
    }
    assert.equal(Object.keys(BASE_HASHES).length, 27);
    assert.deepEqual(Object.keys(buildNatalRequestBody(BIRTH_A, { houseSystem: "placidus", nodeType: "true" })).sort(), ["date", "houseSystem", "latitude", "longitude", "nodeType", "time", "timezone"]);
  });

  // ═══ K) UI / KB ═════════════════════════════════════════════════════════════════
  await t("K: UI — listede; varsayılan üç bölüm; bölüm yoksa plana alınmaz (neden); seçim yalnız {sections, houseSystem}; özet Türkçe; KB: genel not (konu eşlemesi K2)", async () => {
    assert.ok((UI_TECHNIQUES as readonly string[]).includes("western.extra_points"));
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes("western.extra_points"));
    assert.equal(TECHNIQUE_META["western.extra_points"].label, "Ek noktalar");
    assert.equal(TECHNIQUE_META["western.extra_points"].needsTime, false);
    const p = defaultParams(new Date("2026-10-22T09:00:00Z"));
    const method = { houseSystem: "koch" as const, nodeType: "true" as const };
    assert.deepEqual(buildSelections({ "western.extra_points": true }, p, method), [{ technique: "western.extra_points", options: { sections: ALL, houseSystem: "koch" } }]);
    assert.deepEqual(buildSelections({ "western.extra_points": true }, { ...p, extraSections: ["lilith"] }, method), [{ technique: "western.extra_points", options: { sections: ["lilith"], houseSystem: "koch" } }]);
    assert.deepEqual(buildSelections({ "western.extra_points": true }, { ...p, extraSections: [] }, method), []);
    assert.equal(missingReason("western.extra_points", { ...p, extraSections: [] }), "en az bir ek nokta bölümü seçin");
    assert.equal(missingReason("western.extra_points", p), null);
    assert.equal(describeOptions("western.extra_points", { sections: ALL }), "asteroitler · Hermetik lotlar · Lilith ortalama + gerçek");
    assert.deepEqual(topicsForTechnique("western.extra_points", {}), []);
    assert.deepEqual([...EXTRA_SECTIONS], ALL);
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const n = await saveExpertNote(ctx, { profileId: pa, technique: "western.extra_points", noteContext: null, sectionKey: "overall", body: "genel not", expectedRevision: null });
    assert.equal(n.status, 201, JSON.stringify(n.body));
  });

  await t("K2 (22.10): Bilgi Bankası — ek noktalar kendi bağlamında (asteroit / lot / ortalama + gerçek Lilith); Zafer konusu üretilmez; DB regex'i; natal konusu karışmaz; KB otomatik dolmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const body = (await run(ctx, pa, [EP()], rx.deps)).body as J;
    const tech = view(body).technical;
    const topics = topicsForTechnique("western.extra_points", tech);
    const keys = topics.map((x) => x.key);
    assert.equal(new Set(keys).size, keys.length, "tekil");
    for (const k of keys) assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$/.test(k), `DB topic_key regex: ${k}`);
    assert.equal(keys.filter((k) => k.startsWith("asteroid_in_sign:")).length, 4);
    assert.equal(keys.filter((k) => k.startsWith("lot_in_sign:")).length, 6, "7 lot − Zafer (doğrulanıyor)");
    assert.ok(!keys.some((k) => k.startsWith("lot_in_sign:victory")), "Zafer konusu üretilmez");
    assert.ok(keys.includes(`lilith_in_sign:mean:${tech.lilith.mean.sign}`) && keys.includes(`lilith_in_sign:true:${tech.lilith.true.sign}`), "ortalama ve gerçek Lilith ayrı");
    assert.ok(topics.every((x) => !/undefined|roxy/i.test(x.label)));
    const { isSectionKeyForTechnique, TECHNIQUE_TOPIC_CONTEXT, ALL_TOPIC_KINDS } = await import("@/lib/astrology/topics/index");
    assert.equal(TECHNIQUE_TOPIC_CONTEXT["western.extra_points"], "extra_points");
    for (const k of keys) assert.equal(isSectionKeyForTechnique("western.extra_points", k), true, k);
    assert.equal(isSectionKeyForTechnique("western.extra_points", "planet_in_sign:sun:cancer"), false, "natal konusu ek noktalara yazılamaz");
    assert.equal(isSectionKeyForTechnique("western.natal", keys[0]), false, "ek nokta konusu natal'e yazılamaz");
    const kinds = ALL_TOPIC_KINDS.filter((k) => k.context === "extra_points").map((k) => k.label);
    assert.equal(new Set(kinds).size, kinds.length, `konu seçicide tür adları ayırt edilebilir: ${kinds.join(" | ")}`);
    const note = await saveExpertNote(ctx, { profileId: pa, technique: "western.extra_points", noteContext: null, sectionKey: keys[0], body: "asteroit notu", expectedRevision: null });
    assert.equal(note.status, 201, JSON.stringify(note.body));
    assert.equal((store.tables.astro_kb_entries ?? []).length, 0, "KB'ye otomatik kayıt yok");
  });

  // ═══ L) MARKA / GÜVENLİK ════════════════════════════════════════════════════════
  await t("L: istemci bileşenleri sağlayıcı istemcisini / anahtarı içe aktarmaz; kullanıcı metninde sağlayıcı adı, iç uç adı, 'golden'/'fixture' yok", () => {
    for (const f of ["app/admin/astroloji/_components/ExtraPointsPanels.tsx", "lib/astrology/labels/extraPoints.ts", "lib/astrology/report/extraPointsReport.ts", "lib/astrology/model/westernExtraPoints.ts"]) {
      const src = readFileSync(join(__dirname, "..", "..", f), "utf8");
      assert.ok(!src.includes("providers/roxy/client") && !src.includes("ROXY_API_KEY") && !src.includes("process.env"), f);
      const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(!/roxy|golden|fixture|\/astrology\/(asteroids|arabic-lots|lilith)/i.test(code), `${f}: kullanıcıya görünebilir metinde yasak sözcük`);
    }
    const sel = readFileSync(join(__dirname, "..", "..", "app/admin/astroloji/_components/TechniqueSelector.tsx"), "utf8");
    assert.ok(sel.includes('data-testid="astro-extra-points-params"'));
  });

  console.log(`\nastrology extra-points harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("extra-points harness çöktü:", e);
  process.exit(1);
});
