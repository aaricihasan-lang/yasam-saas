/**
 * ASTROLOJİ — SABİT YILDIZLAR harness'i (2026-10-14).
 *
 *   A) Gerçek golden (sentetik kişiler; 5 gerçek Roxy çağrısı, defter: fixtures/golden/roxy-call-ledger-2026-10-14.jsonl)
 *      → adaptör: 43/43 yıldız, bilinmeyen/düşürülen alan 0, teknik/yorum ayrımı, düz↔iç içe tutarlılık.
 *   B) Orb filtresi = sağlayıcı orb sorgusu (orb=1 gerçek yanıtı ≡ orb=3 yanıtının ≤1° süzgeci) · tekrar üretilebilirlik.
 *   C) Bağımsız astronomi: 43 yıldız boylamı ← SIMBAD/Swiss Ephemeris kataloğu + öz hareket + presesyon + nütasyon +
 *      yıllık aberasyon (astronomy-engine) · Natal ↔ sabit yıldız nokta boylamları aynı doğum verisiyle tutarlı.
 *   D) Motor: plan/önbellek (orb ve rapor kataloğu seçeneği anahtarı DEĞİŞTİRMEZ → 0 yeni istek), yorum kapısı,
 *      saat bilinmiyor maskesi, sağlayıcı hatasında kayıt yok, yanlış yankı → kayıt yok, tenant/uzman izolasyonu.
 *   E) Kayıt → aç = 0 istek; Word/PDF rapor modeli (orb, katalog eki, yorum süzgeci, "undefined" yok).
 *   F) Görünüm yardımcıları (arama/süzgeç/sıralama; varsayılan 43/43) · Bilgi Bankası konuları.
 * Gerçek Roxy / gerçek DB YOK (golden dosyaları bir kez gerçek çağrıyla alındı).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/fixedstars.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Astronomy from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A } from "./golden/phase3-golden-calls";
import { goldenPlanFixedStars, SYNTH_C } from "./golden/fixedstars-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique } from "@/lib/astrology/topics/index";
import { parseStarNature, projectRoxyFixedStars, ROXY_FIXED_STARS, type FixedStarsExpect } from "@/lib/astrology/providers/roxy/fixedStars";
import { fixedStarsBody } from "@/lib/astrology/providers/roxy/requests";
import { buildTechniqueView, maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport } from "@/lib/astrology/report/model";
import { FIXED_STAR_CATALOG, FIXED_STAR_IDS, STAR_KEYWORD_TR, fixedStarName } from "@/lib/astrology/labels/fixedStars";
import { contactsWithinOrb, FIXED_STAR_ORB_QUERY, type FixedStarsInterpretation, type FixedStarsTechnical } from "@/lib/astrology/model/westernFixedStars";
import { DEFAULT_STAR_FILTER, filterStars, foldText } from "@/app/admin/astroloji/_lib/fixedStarsView";
import { buildSelections, defaultParams, describeOptions, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const DIR = join(__dirname, "fixtures", "golden");
type Golden = { endpoint: string; query: Record<string, string>; body: Record<string, unknown>; response: J };
const G: Record<string, Golden> = {};
for (const n of ["fixed-stars", "fixed-stars-orb1", "fixed-stars-mean", "fixed-stars-repeat", "fixed-stars-lilith"]) G[n] = JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const REF = JSON.parse(readFileSync(join(__dirname, "fixtures", "fixed-stars-reference-sefstars.json"), "utf8")).stars as Record<string, { raDeg: number; decDeg: number; pmRa: number; pmDec: number; mag: number }>;

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
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };

const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

type Call = { endpoint: string; body: Record<string, unknown>; query?: Record<string, string> };
function roxy(opts: { failWhen?: (c: Call) => boolean; mutate?: (r: J) => void } = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-fs", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body, o) => {
      const c = { endpoint, body, query: o.query };
      calls.push(c);
      if (opts.failWhen?.(c)) return { ok: false, kind: "server_error", status: 500, attempts: 1 };
      let r: J;
      if (endpoint === "/astrology/natal-chart") r = structuredClone(NATAL_GOLDEN);
      else if (endpoint === "/astrology/fixed-stars") r = structuredClone((body.nodeType === "mean" ? G["fixed-stars-mean"] : G["fixed-stars"]).response);
      else return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      opts.mutate?.(r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: (m, d) => logs.push(`${m} ${JSON.stringify(d ?? {})}`),
  };
  return { calls, deps, logs };
}

async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, extra: Record<string, unknown> = {}, preview = false) =>
  runAstrology(ctx, { profileId: pid, selections, ...extra }, deps, { ownerPreviewHideInterp: preview });
const FS = (o: Record<string, unknown> = {}) => ({ technique: "western.fixed_stars", options: { nodeType: "true", orb: 1, ...o } });

const expectOf = (g: Golden): FixedStarsExpect => ({
  date: String(g.body.date),
  time: String(g.body.time),
  latitude: Number(g.body.latitude),
  longitude: Number(g.body.longitude),
  timezone: Number(g.body.timezone),
  nodeType: g.body.nodeType as "true" | "mean",
  orbQueried: Number(g.query.orb),
});
const project = (n: string, mutate?: (r: J) => void) => {
  const raw = structuredClone(G[n].response);
  mutate?.(raw);
  return projectRoxyFixedStars(raw, expectOf(G[n]));
};
const ok = (n: string) => {
  const p = project(n);
  assert.equal(p.ok, true, JSON.stringify(!p.ok && p.errors));
  if (!p.ok) throw new Error("x");
  return p as { ok: true; technical: FixedStarsTechnical; interpretation: FixedStarsInterpretation; unmappedFields: string[]; droppedValues: string[] };
};

/** Bağımsız görünür tropikal boylam: ICRS J2000 + öz hareket → (EQJ) + yıllık aberasyon → tarihin gerçek ekliptiği. */
function refLongitude(id: string, utcIso: string): { lon: number; lat: number } {
  const st = REF[id];
  const time = Astronomy.MakeTime(new Date(utcIso));
  const yrs = time.tt / 365.25;
  const d2r = Math.PI / 180;
  const dec = st.decDeg + (st.pmDec / 3.6e6) * yrs;
  const ra = st.raDeg + (st.pmRa / 3.6e6) * yrs / Math.cos(st.decDeg * d2r);
  const u = [Math.cos(dec * d2r) * Math.cos(ra * d2r), Math.cos(dec * d2r) * Math.sin(ra * d2r), Math.sin(dec * d2r)];
  const ev = Astronomy.BaryState(Astronomy.Body.Earth, time);
  const C = 173.1446326846693; // AU/gün
  const v = new Astronomy.Vector(u[0] + ev.vx / C, u[1] + ev.vy / C, u[2] + ev.vz / C, time);
  const s = Astronomy.SphereFromVector(Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECT(time), v));
  return { lon: (s.lon + 360) % 360, lat: s.lat };
}
const arcmin = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) * 60;

async function main() {
  // ═══ A) ADAPTÖR + GOLDEN ═══════════════════════════════════════════════════════
  await t("golden: 5 gerçek yanıt, hepsi 43 yıldız; plan gövdeleri ürünün kendi üreticisiyle aynı", () => {
    for (const g of goldenPlanFixedStars()) {
      assert.deepEqual(G[g.name].body, JSON.parse(JSON.stringify(g.body)), `${g.name}: gövde ürün üreticisinden farklı`);
      assert.equal(G[g.name].response.stars.length, 43, g.name);
    }
    assert.deepEqual(G["fixed-stars"].body, JSON.parse(JSON.stringify(fixedStarsBody(SYNTH_A, "true"))));
  });

  await t("adaptör: 43/43 yıldız işlenir, HİÇBİRİ atılmaz (kavuşumsuzlar dahil), bilinmeyen/düşürülen alan 0", () => {
    const p = ok("fixed-stars");
    assert.equal(p.technical.stars.length, 43);
    assert.deepEqual(p.technical.stars.map((s) => s.id), G["fixed-stars"].response.stars.map((s: J) => s.id));
    assert.equal(p.unmappedFields.length, 0, p.unmappedFields.join(","));
    assert.equal(p.droppedValues.length, 0, p.droppedValues.join(","));
    const withoutContact = p.technical.stars.filter((s) => !p.technical.contacts.some((c) => c.star === s.id));
    assert.ok(withoutContact.length >= 30, "kavuşumsuz yıldızlar korunmalı");
    for (const s of p.technical.stars) {
      assert.ok(s.nature && s.nature.length > 0, `${s.id}: doğa ayrıştırılamadı`);
      assert.ok(s.longitude >= 0 && s.longitude < 360);
    }
  });

  await t("katalog: Roxy'nin 43 kimliğinin TAMAMI Yaşam kataloğunda (ad, Bayer, takımyıldız, enlem); fazla/eksik yok", () => {
    const ids = G["fixed-stars"].response.stars.map((s: J) => s.id).sort();
    assert.deepEqual([...FIXED_STAR_IDS].sort(), ids);
    for (const s of G["fixed-stars"].response.stars as J[]) {
      const c = FIXED_STAR_CATALOG[s.id];
      assert.equal(c.name, s.name, `${s.id}: ad`);
      assert.ok(c.bayer && c.constellation, s.id);
      assert.equal(fixedStarName(s.id), s.name);
    }
    assert.equal(Object.values(FIXED_STAR_CATALOG).filter((c) => c.royal).length, 4);
    assert.equal(fixedStarName("yeni-yildiz"), "Yeni Yildiz", "bilinmeyen kimlik atılmamalı, türetilmiş adla görünmeli");
  });

  await t("katalog enlemleri bağımsız referansla uyumlu (J2000 ekliptik enlem, ±0,06°)", () => {
    for (const id of FIXED_STAR_IDS) {
      const r = refLongitude(id, "2000-01-01T12:00:00Z");
      assert.ok(Math.abs(r.lat - FIXED_STAR_CATALOG[id].latJ2000) <= 0.06, `${id}: ${r.lat.toFixed(2)} ≠ ${FIXED_STAR_CATALOG[id].latJ2000}`);
    }
  });

  await t("anahtar kelime sözlüğü: golden'daki 105 sözcüğün tamamı Türkçeleştirilir (uydurma yok: sözlük dışı sözcük aynen kalır)", () => {
    const all = new Set<string>();
    for (const s of G["fixed-stars"].response.stars as J[]) for (const k of s.keywords) all.add(k);
    const missing = [...all].filter((k) => !(k.toLowerCase() in STAR_KEYWORD_TR));
    assert.deepEqual(missing, []);
    assert.equal(all.size, 105);
  });

  await t("teknik/yorum ayrımı: teknik katmanda sağlayıcı serbest metni (yorum, anahtar kelime, ad) YOK", () => {
    const p = ok("fixed-stars");
    const tech = JSON.stringify(p.technical);
    for (const c of G["fixed-stars"].response.conjunctions as J[]) assert.ok(!tech.includes(c.interpretation.slice(0, 40)), "anlatı teknik katmana sızdı");
    assert.ok(!tech.includes("misfortune") && !tech.includes("Algol\""), "anahtar kelime/ad teknik katmanda");
    assert.equal(p.interpretation.contacts.length, 12);
    assert.equal(p.interpretation.stars.length, 43);
    assert.ok(p.interpretation.summary?.includes("12 kavuşum"));
  });

  await t("temaslar: düz liste ile yıldız listesi birebir; en sıkı önce; nokta eşlemesi (ASC/MC/Lilith/Güney Düğüm)", () => {
    const a = ok("fixed-stars").technical;
    assert.equal(a.contacts.length, 12);
    for (let i = 1; i < a.contacts.length; i++) assert.ok(a.contacts[i - 1].orb <= a.contacts[i].orb);
    assert.deepEqual(a.contacts[0], { star: "zuben-elgenubi", point: "pluto", pointLongitude: a.contacts[0].pointLongitude, orb: 0.0429 });
    const c = ok("fixed-stars-lilith").technical;
    const pts = new Set(c.contacts.map((x) => x.point));
    for (const p of ["lilith", "midheaven", "ascendant", "south_node", "moon"]) assert.ok(pts.has(p as never), `nokta yok: ${p}`);
    assert.ok(c.contacts.some((x) => x.star === "regulus" && x.point === "lilith" && x.orb < 0.2), "tasarlanan Regulus–Lilith kavuşumu yok");
  });

  await t("fail-closed: yanlış doğum yankısı / orb yankısı / tutarsız düz liste / geçersiz kimlik → sonuç YOK", () => {
    const bad = (m: (r: J) => void) => assert.equal(project("fixed-stars", m).ok, false);
    bad((r) => (r.birthDetails.date = "1990-07-16"));
    bad((r) => (r.birthDetails.time = "15:30:00"));
    bad((r) => (r.birthDetails.timezone = 2));
    bad((r) => (r.birthDetails.latitude = 40.0));
    bad((r) => (r.orb = 1));
    bad((r) => r.conjunctions.pop());
    bad((r) => (r.conjunctions[0].orb = 0.5));
    bad((r) => (r.stars[0].id = "Bad Id"));
    bad((r) => (r.stars = []));
    bad((r) => (r.conjunctions[0].star = "Bilinmeyen"));
    const u = project("fixed-stars", (r) => ((r.yeniAlan = 1), (r.stars[0].yeniYildizAlani = "x")));
    assert.equal(u.ok, true);
    if (u.ok) assert.deepEqual(u.unmappedFields, ["stars[].yeniYildizAlani", "yeniAlan"]);
  });

  await t("doğa ayrıştırma: 'Saturn and Jupiter' → [saturn, jupiter]; tanınmayan sözcük → null (uydurma yok)", () => {
    assert.deepEqual(parseStarNature("Saturn and Jupiter"), ["saturn", "jupiter"]);
    assert.deepEqual(parseStarNature("Venus"), ["venus"]);
    assert.equal(parseStarNature("Saturn and Pluto"), null);
    assert.equal(parseStarNature(""), null);
  });

  // ═══ B) ORB + TEKRAR ÜRETİLEBİLİRLİK ═══════════════════════════════════════════
  await t("orb filtresi ≡ sağlayıcı orb sorgusu: orb=1 gerçek yanıtı = orb=3 yanıtının ≤1° süzgeci (temas, orb, anlatı, yıldız konumları)", () => {
    const a = ok("fixed-stars");
    const one = ok("fixed-stars-orb1");
    const key = (c: { star: string; point: string; orb: number }) => `${c.star}|${c.point}|${c.orb}`;
    assert.deepEqual(contactsWithinOrb(a.technical.contacts, 1).map(key), one.technical.contacts.map(key));
    assert.deepEqual(a.technical.stars, one.technical.stars);
    for (const c of one.interpretation.contacts) assert.equal(a.interpretation.contacts.find((x) => x.star === c.star && x.point === c.point)?.text, c.text);
    assert.equal(contactsWithinOrb(a.technical.contacts, 0.5).length, 2);
    assert.equal(contactsWithinOrb(a.technical.contacts, 3).length, 12);
  });

  await t("tekrar üretilebilirlik: aynı girdiyle ikinci gerçek çağrı byte düzeyinde aynı", () => {
    assert.deepEqual(G["fixed-stars-repeat"].response, G["fixed-stars"].response);
  });

  await t("düğüm türü: mean/true istek gövdesine ve yankıya girer; bu haritada düğüm teması olmadığından temaslar aynı", () => {
    assert.equal(G["fixed-stars-mean"].response.birthDetails.nodeType, "mean");
    assert.deepEqual(ok("fixed-stars-mean").technical.contacts, ok("fixed-stars").technical.contacts);
    assert.notEqual(getTechnique("western.fixed_stars")!.units({ birth: SYNTH_A, birthUtc: "", partner: null }, { nodeType: "mean", orb: 1, reportCatalog: false })[0].inputHash,
      getTechnique("western.fixed_stars")!.units({ birth: SYNTH_A, birthUtc: "", partner: null }, { nodeType: "true", orb: 1, reportCatalog: false })[0].inputHash);
  });

  // ═══ C) BAĞIMSIZ ASTRONOMİ ════════════════════════════════════════════════════
  await t("bağımsız: 43 yıldızın Roxy boylamı = SIMBAD/Swiss Ephemeris kataloğu + presesyon/nütasyon/aberasyon (≤ 0,05′) · 3 tarih", () => {
    const cases: [string, string][] = [
      ["fixed-stars", "1990-07-15T11:30:00Z"],
      ["fixed-stars-lilith", "1997-03-18T10:00:00Z"],
    ];
    let max = 0;
    for (const [n, utc] of cases) {
      for (const s of G[n].response.stars as J[]) {
        const d = arcmin(s.longitude, refLongitude(s.id, utc).lon);
        max = Math.max(max, d);
        assert.ok(d <= 0.05, `${n} ${s.id}: Δ=${d.toFixed(3)}′`);
      }
    }
    assert.ok(max > 0, "referans hiç fark üretmedi (test zayıf)");
  });

  await t("presesyon: aynı yıldızın 1990 → 1997 boylam farkı ≈ 50,3″/yıl (genel presesyon) ± nütasyon/aberasyon", () => {
    const a = new Map((G["fixed-stars"].response.stars as J[]).map((s) => [s.id, s.longitude]));
    for (const s of G["fixed-stars-lilith"].response.stars as J[]) {
      if (Math.abs(FIXED_STAR_CATALOG[s.id].latJ2000) > 30) continue; // yüksek enlemde aberasyon/öz hareket baskın
      const dYr = (Date.parse("1997-03-18T10:00:00Z") - Date.parse("1990-07-15T11:30:00Z")) / 3.15576e10;
      const rate = (((s.longitude - a.get(s.id)! + 540) % 360) - 180) * 3600 / dYr;
      assert.ok(rate > 35 && rate < 65, `${s.id}: ${rate.toFixed(1)}″/yıl`);
    }
  });

  await t("natal ↔ sabit yıldız tutarlılığı: temas noktası boylamları aynı doğum verisinin natal golden'ı ile ≤0,001°", () => {
    const natal = NATAL_GOLDEN.response ?? NATAL_GOLDEN;
    const map = new Map<string, number>();
    for (const p of natal.planets as J[]) map.set(p.name, p.longitude);
    map.set("ASC", natal.ascendant.longitude);
    map.set("MC", natal.midheaven.longitude);
    let n = 0;
    for (const s of G["fixed-stars"].response.stars as J[])
      for (const c of s.conjunctions as J[]) {
        const nl = map.get(c.point);
        assert.ok(nl !== undefined, `natal nokta yok: ${c.point}`);
        assert.ok(Math.abs(((c.pointLongitude - nl! + 540) % 360) - 180) <= 1e-3, `${s.id}-${c.point}: ${c.pointLongitude} ≠ ${nl}`);
        n++;
      }
    assert.equal(n, 12);
  });

  // ═══ D) MOTOR ═════════════════════════════════════════════════════════════════
  await t("seçenek: orb (0,5–3) + rapor kataloğu gövdeye/sorguya GİRMEZ → aynı önbellek anahtarı; geçersiz orb → ret", () => {
    const def = getTechnique("western.fixed_stars")!;
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes("western.fixed_stars"));
    assert.ok((UI_TECHNIQUES as readonly string[]).includes("western.fixed_stars"));
    const p1 = def.parseOptions({ nodeType: "true", orb: 1 }, new Date())!;
    const p2 = def.parseOptions({ nodeType: "true", orb: 2.5, reportCatalog: true }, new Date())!;
    assert.deepEqual(p1, { nodeType: "true", orb: 1, reportCatalog: false });
    assert.deepEqual(def.parseOptions({}, new Date()), { nodeType: "true", orb: 1, reportCatalog: false });
    const ctx = { birth: SYNTH_A, birthUtc: "", partner: null };
    const [u1] = def.units(ctx, p1);
    const [u2] = def.units(ctx, p2);
    assert.equal(u1.inputHash, u2.inputHash);
    assert.deepEqual(u1.query, { orb: String(FIXED_STAR_ORB_QUERY) });
    assert.equal(u1.endpoint, ROXY_FIXED_STARS.endpoint);
    assert.ok(!("orb" in u1.body));
    for (const bad of [{ orb: 4 }, { orb: 0.7 }, { orb: "x" }, { nodeType: "x" }, { reportCatalog: "evet" }]) assert.equal(def.parseOptions(bad, new Date()), null, JSON.stringify(bad));
    const sel = buildSelections({ "western.fixed_stars": true }, { ...defaultParams(new Date()), fixedStarsOrb: 2, fixedStarsCatalog: true }, { houseSystem: "placidus", nodeType: "true" });
    assert.deepEqual(sel, [{ technique: "western.fixed_stars", options: { nodeType: "true", orb: 2, reportCatalog: true } }]);
    assert.ok(describeOptions("western.fixed_stars", { orb: 1.5, reportCatalog: true }).includes("1,5°"));
  });

  await t("motor: ilk çalıştırma 1 istek (orb=3 sorgusu); orb/katalog değişince 0 yeni istek (plan + run)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r1 = (await run(ctx, pa, [FS()], rx.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.equal(rx.calls.length, 1);
    assert.deepEqual(rx.calls[0].query, { orb: "3" });
    assert.equal(rx.calls[0].body.timezone, 3);
    const plan = (await planAstrology(ctx, { profileId: pa, selections: [FS({ orb: 3, reportCatalog: true }), FS({ orb: 0.5 })] })).body as J;
    assert.equal(plan.plan.newRequestCount, 0, JSON.stringify(plan.plan));
    await run(ctx, pa, [FS({ orb: 2 }), FS({ orb: 0.5, reportCatalog: true })], rx.deps);
    assert.equal(rx.calls.length, 1, "orb değişikliği yeni sağlayıcı isteği yaptı");
    const view = r1.results[0].view;
    assert.equal(view.technical.stars.length, 43);
    assert.equal(view.technical.contacts.length, 12);
    assert.equal(view.interpretation.visible, true);
    assert.equal(view.method.zodiac, "tropical");
  });

  await t("yorum kapısı: yetkisiz uzmanda yanıtta anlatı/anahtar kelime YOK; teknik 43 yıldız aynı", async () => {
    const store = seed();
    const ctx = ctxOf(store, { entitlements: NO_INTERP });
    const pa = await profile(ctx);
    const rx = roxy();
    const body = (await run(ctx, pa, [FS()], rx.deps)).body as J;
    const s = JSON.stringify(body);
    for (const c of G["fixed-stars"].response.conjunctions as J[]) assert.ok(!s.includes(c.interpretation.slice(0, 40)), "yetkisiz yanıtta anlatı");
    assert.ok(!s.includes("misfortune") && !s.includes("notoriety"), "yetkisiz yanıtta anahtar kelime");
    assert.equal(body.results[0].view.interpretation.visible, false);
    assert.equal(body.results[0].view.technical.stars.length, 43);
    const prev = (await run(ctxOf(store), pa, [FS()], rx.deps, {}, true)).body as J;
    assert.equal(prev.results[0].view.interpretation.visible, false, "owner önizlemesi yorumu gizlemeli");
  });

  await t("saat bilinmiyor: ASC/MC/Ay temasları + anlatıları + sağlayıcı özeti gösterilmez; yıldızlar 43 kalır; uyarı", async () => {
    const tech = ok("fixed-stars-lilith").technical;
    const interp = ok("fixed-stars-lilith").interpretation;
    const m = maskTechnical("western.fixed_stars", tech, { primary: false, partner: null });
    const mt = m.technical as FixedStarsTechnical;
    assert.equal(m.masked, true);
    assert.equal(mt.stars.length, 43);
    assert.ok(mt.contacts.length < tech.contacts.length);
    assert.ok(!mt.contacts.some((c) => ["ascendant", "midheaven", "moon"].includes(c.point)));
    assert.ok(mt.contacts.some((c) => c.point === "lilith"));
    assert.ok(m.warnings[0].includes("Yükselen, MC ve Ay"));
    const v = buildTechniqueView({
      technique: "western.fixed_stars",
      rows: [{ id: "r", technique: "western.fixed_stars", provider: "roxy", provider_api_version: "v2", adapter_version: "a", projection_version: "p", technical: tech as unknown as Record<string, unknown>, created_at: "2026-10-14T00:00:00Z" }],
      combined: tech,
      options: { nodeType: "true", orb: 1, reportCatalog: false },
      timeKnowledge: { primary: false, partner: null },
      visibility: { visible: true },
      interpretations: [{ provider: "roxy", lang: "tr", content: interp as unknown as Record<string, unknown> }],
    } as J);
    const vi = (v.interpretation as J).content as FixedStarsInterpretation;
    assert.equal(vi.summary, null);
    assert.ok(!vi.contacts.some((c) => ["ascendant", "midheaven", "moon"].includes(c.point)));
    // Saati bilinen profilde maske YOK.
    assert.equal(maskTechnical("western.fixed_stars", tech, { primary: true, partner: null }).masked, false);
  });

  await t("saat bilinmiyor (motor): istek 12:00 gönderir, sonuç maskeli döner (TIME_REQUIRED DEĞİL)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, { birthTime: null, timeKnown: false, timeAccuracy: "unknown" });
    const rx = roxy({ mutate: (r) => (r.birthDetails.time = "12:00:00") });
    const body = (await run(ctx, pa, [FS()], rx.deps)).body as J;
    assert.equal(rx.calls[0].body.time, "12:00:00");
    assert.equal(body.results[0].ok, true, JSON.stringify(body.results[0]));
    assert.equal(body.results[0].view.timeUnknownMasked, true);
  });

  await t("sağlayıcı hatası / yanlış yankı: sonuç KAYDEDİLMEZ, başarı mesajı yok; düzelince tekrar dener", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const failing = roxy({ failWhen: () => true });
    const b1 = (await run(ctx, pa, [FS()], failing.deps)).body as J;
    assert.equal(b1.results[0].ok, false);
    assert.equal((store.tables.astro_provider_results ?? []).length, 0, "başarısız çağrı kaydedildi");
    const wrong = roxy({ mutate: (r) => (r.birthDetails.date = "1991-01-01") });
    const b2 = (await run(ctx, pa, [FS()], wrong.deps)).body as J;
    assert.equal(b2.results[0].ok, false, "yanlış danışan verisi kabul edildi");
    assert.equal((store.tables.astro_provider_results ?? []).length, 0, "yanlış yankı kaydedildi");
  });

  await t("izolasyon: başka tenant ve AYNI tenant'taki başka uzman sabit yıldız analizini açamaz; önbellek paylaşılmaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [FS()], rx.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...FS(), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const id = (sv.body as J).analysisId;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [FS()], rx.deps)).status, 404);
  });

  // ═══ E) KAYIT + RAPOR ═════════════════════════════════════════════════════════
  await t("kaydet → aç: 0 sağlayıcı isteği; snapshot 43 yıldız + seçenek orbu; Bilgi Bankası konuları ayrı bağlamda", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [FS({ orb: 1.5, reportCatalog: true })], rx.deps);
    const n = rx.calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...FS({ orb: 1.5, reportCatalog: true }), saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(rx.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a.technical.stars.length, 43);
    assert.equal(a.params.orb, 1.5);
    assert.equal(a.params.reportCatalog, true);
    assert.equal(a.interpretation.visible, true);
    assert.ok(a.topics.some((x: J) => x.key === "fixed_star_contact:zuben-elgenubi:pluto"));
    for (const x of a.topics) {
      assert.ok(parseAnyTopicKey("western", x.key), x.key);
      assert.ok(isSectionKeyForTechnique("western.fixed_stars", x.key), x.key);
      assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$/.test(x.key), `DB biçim kısıtı: ${x.key}`);
      assert.ok(!isSectionKeyForTechnique("western.natal", x.key));
    }
    const hidden = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(hidden.interpretation.visible, false);
    assert.ok(!JSON.stringify(hidden).includes("misfortune"));
  });

  await t("rapor modeli: yöntem metni, orb içi temaslar, uzak enlem uyarısı, isteğe bağlı 43'lük katalog, yorum orb süzgeci; 'undefined' yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, [FS()], rx.deps);
    const mk = async (o: Record<string, unknown>, c = ctx) => {
      const sv = await saveAnalysis(c, { profileId: pa, revision: 1, ...FS(o), saveRequestId: randomUUID() }, false);
      return ((await getAnalysis(c, (sv.body as J).analysisId, false)).body as J).analysis;
    };
    const flat = (r: ReturnType<typeof buildAstroReport>) => JSON.stringify(r.blocks);
    const r1 = buildAstroReport(await mk({ orb: 1 }));
    const s1 = flat(r1);
    assert.ok(s1.includes("Ekliptik boylam kavuşumu (paran değildir)"));
    assert.ok(s1.includes("Önemli sabit yıldız kavuşumları (orb ≤ 1,00°)"));
    assert.ok(s1.includes("Zuben Elgenubi") && s1.includes("Pollux"));
    assert.ok(!s1.includes("Vega"), "orb dışı (2,28°) Vega–Neptün rapora girmemeli");
    assert.ok(!s1.includes("Ek: Sabit yıldız kataloğu"), "katalog varsayılan olarak eklenmemeli");
    assert.ok(s1.includes("Roxy otomatik yorumu"));
    assert.ok(s1.includes("cesaret (courage)") && s1.includes("engel (obstruction)"), "anahtar kelime Türkçe karşılığı + özgün sözcük");
    assert.ok(!s1.includes("yazı (writing)") || s1.includes("Castor"), "orb dışı yıldızın anahtar kelimesi");
    const r3 = buildAstroReport(await mk({ orb: 3, reportCatalog: true }));
    const s3 = flat(r3);
    assert.ok(s3.includes("Vega"));
    assert.ok(s3.includes("Ek: Sabit yıldız kataloğu (43 yıldız"));
    const catTable = r3.blocks.find((b) => b.kind === "table" && b.table.columns[1] === "Bayer") as J;
    assert.equal(catTable.table.rows.length, 43, "katalog 43 satır olmalı");
    assert.ok(s3.includes("* Ekliptik enlemi ±30°"), "Vega (+62°) için izdüşüm uyarısı");
    for (const r of [r1, r3]) {
      const s = flat(r);
      for (const bad of ["undefined", "null", "[object Object]", "NaN"]) assert.ok(!s.includes(bad), `rapor: ${bad}`);
    }
    // Yetkisiz uzman raporu: yorum bölümü yok.
    const hiddenA = ((await getAnalysis(ctxOf(store, { entitlements: NO_INTERP }), ((await saveAnalysis(ctx, { profileId: pa, revision: 1, ...FS(), saveRequestId: randomUUID() }, false)).body as J).analysisId, false)).body as J).analysis;
    assert.ok(!flat(buildAstroReport(hiddenA)).includes("Roxy otomatik yorumu"));
  });

  // ═══ F) GÖRÜNÜM ═══════════════════════════════════════════════════════════════
  await t("görünüm: varsayılan süzgeç 43/43; arama (Türkçe ad/Bayer/takımyıldız, aksan duyarsız); süzgeç ve sıralama", () => {
    const a = ok("fixed-stars").technical;
    assert.equal(filterStars(a.stars, a.contacts, 1, DEFAULT_STAR_FILTER).length, 43);
    const q = (query: string) => filterStars(a.stars, a.contacts, 3, { ...DEFAULT_STAR_FILTER, query }).map((s) => s.id);
    assert.deepEqual(q("kalb-ül-esed"), ["regulus"]);
    assert.deepEqual(q("KALB UL ESED"), ["regulus"]);
    assert.deepEqual(q("akyıldız"), ["sirius"]);
    assert.deepEqual(q("α Leonis"), ["regulus"]);
    assert.ok(q("kanatlı at").length === 3);
    assert.ok(q("demirkazik").includes("polaris"));
    assert.equal(foldText("İSTANBUL Şı"), "istanbul si");
    const f = (o: Partial<typeof DEFAULT_STAR_FILTER>, orb = 3) => filterStars(a.stars, a.contacts, orb, { ...DEFAULT_STAR_FILTER, ...o });
    assert.equal(f({ onlyContacts: true }).length, new Set(a.contacts.map((c) => c.star)).size);
    assert.equal(f({ onlyContacts: true }, 0.5).length, 2);
    assert.equal(f({ group: "royal" }).length, 4);
    assert.equal(f({ group: "far" }).length, 15); // |β| > 30°: Achernar, Polaris, Mirfak, Rigel, Canopus, Sirius, Acrux, Arcturus, Hadar, Toliman, Alphecca, Rasalhague, Vega, Deneb, Scheat
    assert.ok(f({ maxMagnitude: 0.5 }).every((s) => s.magnitude <= 0.5));
    assert.ok(f({ nature: "saturn" }).every((s) => s.nature?.includes("saturn")));
    assert.ok(f({ sign: "leo" }).every((s) => s.sign === "leo"));
    const br = f({ sort: "brightness" });
    assert.equal(br[0].id, "sirius");
    const z = f({});
    for (let i = 1; i < z.length; i++) assert.ok(z[i - 1].longitude <= z[i].longitude);
    assert.equal(f({ sort: "orb" })[0].id, "zuben-elgenubi");
  });

  console.log(`\nastrology fixed stars harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("fixed stars harness çöktü:", e);
  process.exit(1);
});
