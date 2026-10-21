/**
 * ASTROLOJİ — ALAN TAMAMLAMA harness'i (AŞAMA 2, 2026-10-21). Gerçek Roxy / gerçek DB YOK.
 *
 * Kaynak: sentetik golden yanıtlar (scripts/astrology/fixtures/golden) + ATLAS-1000 gerçek yanıtlarından çıkarılmış YALNIZ
 * anonim yapılar (fixtures/field-completion-structures.json: suppressedBy taşıyan yoga doğrulamaları, gezegen savaşı
 * çiftleri — doğum verisi / kişi YOK). Bu yapılar sentetik golden D1 yanıtına enjekte edilir.
 *
 *   A) Vedik D1 `yogas[].suppressedBy` ve `planetaryWar[].distance`: adaptör → model (bilinmeyen alan 0) → ekran → kayıt → Word/PDF.
 *   B) Sinastri `interAspects[].isApplying`: adaptör → model → ekran tablosu → kayıt → rapor.
 *   C) Sürüm: adaptör sürümü (önbellek anahtarı) DEĞİŞMEZ, projeksiyon sürümü yükselir; girdi özeti main ile birebir.
 *   D) Eski önbellek satırı (eski projeksiyon) 0 sağlayıcı çağrısıyla aynen kullanılır; eski kayıt açılır, snapshot değişmez.
 *   E) Rapor: natal örüntü sıkılık / burç dışı; D1 nakshatra kalan / Abhijit; kompozit yorum anahtar kelimeleri YALNIZ
 *      yorum görünürken (yorum yetkisi kapısı korunur).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/field-completion.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { SYNTH_A, SYNTH_B } from "./golden/phase3-golden-calls";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { calcInputHash } from "@/lib/astrology/engine/inputHash";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { projectRoxyVedicD1, ROXY_VEDIC_D1 } from "@/lib/astrology/providers/roxy/vedic";
import { projectRoxyComposite, projectRoxySynastry, ROXY_SYNASTRY } from "@/lib/astrology/providers/roxy/timing";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { buildAstroReport, reportTexts, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { VedicD1Panel } from "@/app/admin/astroloji/_components/VedicPanels";
import { SynastryPanel } from "@/app/admin/astroloji/_components/TimingPanels";
import type { VedicD1Technical } from "@/lib/astrology/model/vedic";
import type { SynastryTechnical } from "@/lib/astrology/model/westernTiming";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const FX = join(__dirname, "fixtures");
const load = (p: string) => JSON.parse(readFileSync(join(FX, p), "utf8"));
const D1 = load("golden/vedic-d1.json");
const SYN = load("golden/synastry.json");
const COMP = load("golden/composite.json");
const NATAL = load("roxy-natal-golden-2026-10-07.json");
const ST = load("field-completion-structures.json") as { provenance: J; suppressedYogas: J[]; planetaryWars: J[] };

/** main 98a15205 üzerinde (değişiklikten ÖNCE) hesaplanan girdi özetleri — projeksiyon sürümü yükselince DEĞİŞMEMELİ. */
const MAIN_INPUT_HASH = {
  d1: "489c70ab345bee750966197d1143280a6cabcb0872268d236df538c67a513c86",
  synastry: "8f87b467acf4ddc85f2d5410b0eea25447b658865f46448e0c7725ff6d560290",
};

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
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const NO_INTERP = { ...FULL, providerInterpretations: false };
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const texts = (a: ReportAnalysisInput) => reportTexts(buildAstroReport(a)).join("\n");
const tableOf = (a: ReportAnalysisInput, heading: string) => {
  const blocks = buildAstroReport(a).blocks as J[];
  const i = blocks.findIndex((b) => b.kind === "heading" && b.text === heading);
  if (i < 0) return null;
  const tb = blocks.slice(i + 1).find((b) => b.kind === "table");
  return tb ? (tb.table as { columns: string[]; rows: string[][] }) : null;
};

/** Golden D1 + ATLAS-1000 yapıları: aynı kimlikli yoga yerine bastırılmış doğrulama, savaş listesi verilen çiftler. */
function d1With(yoga: J | null, wars: J[]): J {
  const r = structuredClone(D1.response);
  if (yoga) {
    const i = r.yogas.findIndex((y: J) => y.id === yoga.id);
    assert.ok(i >= 0, `golden D1'de ${yoga.id} yok`);
    r.yogas[i] = { ...r.yogas[i], ...yoga };
  }
  r.planetaryWar = wars;
  return r;
}
const d1Ok = (raw: J) => {
  const p = projectRoxyVedicD1(raw, { ayanamsa: "lahiri" }) as J;
  assert.ok(p.ok, JSON.stringify(p.errors));
  return p;
};

function roxy(mutateD1?: (r: J) => void) {
  const calls: string[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-fc", baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_c, endpoint) => {
      calls.push(endpoint);
      if (endpoint !== "/vedic-astrology/birth-chart") return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = d1With(ST.suppressedYogas.find((y) => y.id === "kedara" && y.suppressedBy === "akriti")!, [ST.planetaryWars[0]]);
      mutateD1?.(r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profile(ctx: EngineCtx): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const D1SEL = { technique: "vedic.d1", options: { ayanamsa: "lahiri" } };
const run = (ctx: EngineCtx, pid: string, deps: EngineDeps) => runAstrology(ctx, { profileId: pid, selections: [D1SEL] }, deps, { ownerPreviewHideInterp: false });

async function main() {
  // ═══ A) Vedik D1 ═════════════════════════════════════════════════════════════
  await t("A1 kanıt: ATLAS-1000 yapı özeti (29 bastırılmış yoga · 69 yanıtta 72 savaş çifti) — fixture'da kişi/doğum verisi yok", () => {
    assert.equal(ST.provenance.vedicD1Responses, 1036);
    assert.equal(ST.provenance.yogasWithSuppressedBy, 29);
    assert.equal(ST.provenance.responsesWithPlanetaryWar, 69);
    assert.equal(ST.planetaryWars.length, 72);
    assert.ok(ST.suppressedYogas.length >= 5);
    const s = JSON.stringify(ST);
    for (const bad of ["date", "time", "latitude", "longitude", "hash", "birth"]) assert.ok(!s.includes(`"${bad}"`), `fixture'da ${bad}`);
  });

  await t("A2 adaptör: her gerçek bastırılmış yoga → suppressedBy alınır; bilinmeyen/düşürülen alan 0; present=false korunur", () => {
    for (const y of ST.suppressedYogas) {
      const p = d1Ok(d1With(y, []));
      assert.deepEqual(p.unmappedFields, [], `${y.id}/${y.suppressedBy}: bilinmeyen alan ${p.unmappedFields.join(",")}`);
      assert.deepEqual(p.droppedValues, []);
      const got = (p.technical as VedicD1Technical).yogas.find((x) => x.id === y.id)!;
      assert.equal(got.present, false);
      assert.equal(got.suppressedBy, y.suppressedBy, `${y.id}: suppressedBy`);
    }
    // Bastırılmamış yogalar: alan yok → null (kural gerçekten sağlanmadı / oluşuyor).
    const plain = d1Ok(structuredClone(D1.response));
    assert.ok((plain.technical as VedicD1Technical).yogas.every((y) => y.suppressedBy === null));
  });

  await t("A3 adaptör: 72 gerçek savaş çifti → distance alınır (bilinmeyen alan 0); geçersiz değer düşürülür, kazanan korunur", () => {
    for (const w of ST.planetaryWars) {
      const p = d1Ok(d1With(null, [w]));
      assert.deepEqual(p.unmappedFields, [], `bilinmeyen alan ${p.unmappedFields.join(",")}`);
      const pw = (p.technical as VedicD1Technical).planetaryWar[0];
      assert.equal(pw.distance, w.distance);
      assert.equal(pw.winner, w.winner.toLowerCase());
    }
    const bad = d1Ok(d1With({ id: "kedara", present: false, suppressedBy: "xyz" }, [{ ...ST.planetaryWars[0], distance: "0.5" }]));
    assert.ok(bad.droppedValues.includes("yogas[].suppressedBy") && bad.droppedValues.includes("planetaryWar[].distance"), JSON.stringify(bad.droppedValues));
    const tb = bad.technical as VedicD1Technical;
    assert.equal(tb.yogas.find((y) => y.id === "kedara")!.suppressedBy, null);
    assert.equal(tb.planetaryWar[0].distance, null);
    assert.equal(tb.planetaryWar.length, 1);
  });

  const yK = ST.suppressedYogas.find((y) => y.id === "kedara" && y.suppressedBy === "akriti")!;
  const newD1 = d1Ok(d1With(yK, [ST.planetaryWars[0]])).technical as VedicD1Technical;
  const legacyD1 = (() => {
    const x = structuredClone(newD1) as J;
    for (const y of x.yogas) delete y.suppressedBy;
    for (const w of x.planetaryWar) delete w.distance;
    return x as VedicD1Technical;
  })();

  await t("A4 ekran: bastırılan yoga + bastıran aile + savaş uzaklığı görünür; eski (alansız) teknik çökmeden açılır", () => {
    const h = html(createElement(VedicD1Panel, { t: newD1, kbLookup: null }));
    assert.ok(h.includes('data-testid="astro-vedic-suppressed-yogas"'), "bastırılan yoga bölümü yok");
    assert.ok(h.includes("Kedara Yoga") && h.includes("Akriti (Nabhasa)"), "bastıran aile yok");
    assert.ok(h.includes('data-testid="astro-vedic-war"'), "savaş bölümü yok");
    assert.ok(h.includes(`${ST.planetaryWars[0].distance.toFixed(2).replace(".", ",")}°`), "savaş uzaklığı yok");
    const old = html(createElement(VedicD1Panel, { t: legacyD1, kbLookup: null }));
    assert.ok(old.includes('data-testid="astro-vedic-war"') && !old.includes("Akriti (Nabhasa)"), "eski kayıtta uydurma bastırma");
    assert.ok(!old.includes("undefined") && !old.includes("NaN"));
  });

  await t("A5 rapor (Word/PDF modeli): savaş tablosunda Uzaklık; bastırılan yogalar tablosu; nakshatra Kalan + Abhijit sütunları", () => {
    const a: ReportAnalysisInput = { id: "x", title: "D1", technique: "vedic.d1", analysisAt: "2026-10-21T10:00:00Z", technical: newD1 };
    const war = tableOf(a, "Gezegen savaşı (graha yuddha)")!;
    assert.deepEqual(war.columns, ["Graha 1", "Graha 2", "Uzaklık", "Kazanan"]);
    assert.equal(war.rows[0][2], `${ST.planetaryWars[0].distance.toFixed(2).replace(".", ",")}°`);
    const sup = tableOf(a, "Bastırılan yogalar")!;
    assert.ok(sup, "bastırılan yogalar tablosu yok");
    assert.deepEqual(sup.columns, ["Yoga", "Aile", "Bastıran aile", "Kanıt"]);
    assert.equal(sup.rows.length, 1);
    assert.equal(sup.rows[0][2], "Akriti (Nabhasa)");
    const nk = tableOf(a, "Nakshatra ilerlemesi")!;
    assert.ok(nk, "nakshatra tablosu yok");
    assert.deepEqual(nk.columns, ["Nokta", "Nakshatra", "Pada", "Katedilen", "Kalan", "Abhijit"]);
    assert.equal(nk.rows.length, 10);
    // Eski kayıt: tablo kurulur, uydurma değer yok.
    const old: ReportAnalysisInput = { ...a, technical: legacyD1 };
    assert.equal(tableOf(old, "Gezegen savaşı (graha yuddha)")!.rows[0][2], "—");
    assert.equal(tableOf(old, "Bastırılan yogalar"), null, "eski kayıtta bastırılan yoga uyduruldu");
    assert.ok(!texts(old).includes("undefined"));
  });

  // ═══ C/D) Sürüm + önbellek + kayıt ═══════════════════════════════════════════
  await t("C1 sürüm: D1 adaptör astro-roxy-vedic-d1-1 (aynı), projeksiyon vedic-d1-proj-2; girdi özeti main ile birebir", () => {
    assert.equal(ROXY_VEDIC_D1.adapter, "astro-roxy-vedic-d1-1");
    assert.equal(ROXY_VEDIC_D1.projection, "vedic-d1-proj-2");
    const u = getTechnique("vedic.d1")!.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: null }, { ayanamsa: "lahiri" })[0];
    assert.equal(u.inputHash, MAIN_INPUT_HASH.d1);
    assert.equal(calcInputHash({ provider: u.provider, providerApiVersion: u.providerApiVersion, adapterVersion: u.adapterVersion, endpoint: u.endpoint, lang: u.lang, body: u.body }), MAIN_INPUT_HASH.d1);
  });

  await t("C2 sürüm: sinastri adaptör astro-roxy-synastry-1 (aynı), projeksiyon synastry-proj-2; girdi özeti main ile birebir", () => {
    assert.equal(ROXY_SYNASTRY.adapter, "astro-roxy-synastry-1");
    assert.equal(ROXY_SYNASTRY.projection, "synastry-proj-2");
    const u = getTechnique("western.synastry")!.units({ birth: SYNTH_A, birthUtc: SYNTH_A.utc, partner: SYNTH_B }, { partnerProfileId: "x", houseSystem: "placidus", nodeType: "true" })[0];
    assert.equal(u.inputHash, MAIN_INPUT_HASH.synastry);
  });

  await t("D1 motor: yeni hesap → yeni projeksiyon satırı; görünüm + kayıt + açılan analiz + rapor zinciri suppressedBy/distance taşır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    const r = await run(ctx, pa, rx.deps);
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
    assert.equal(rx.calls.length, 1);
    const view = (r.body as J).results[0].view;
    assert.equal(view.projectionVersion, "vedic-d1-proj-2");
    assert.equal(view.technical.yogas.find((y: J) => y.id === "kedara").suppressedBy, "akriti");
    assert.equal(view.technical.planetaryWar[0].distance, ST.planetaryWars[0].distance);
    assert.equal(store.tables.astro_provider_results[0].projection_version, "vedic-d1-proj-2");
    assert.deepEqual(store.tables.astro_provider_results[0].unmapped_fields, []);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...D1SEL, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(a.technical.yogas.find((y: J) => y.id === "kedara").suppressedBy, "akriti");
    assert.equal(a.technical.planetaryWar[0].distance, ST.planetaryWars[0].distance);
    assert.equal(a.versions.adapterVersion, "astro-roxy-vedic-d1-1");
    assert.equal(tableOf(a, "Bastırılan yogalar")!.rows[0][2], "Akriti (Nabhasa)");
    assert.equal(rx.calls.length, 1, "kayıt/açma sağlayıcı çağırdı");
  });

  await t("D2 eski önbellek: eski projeksiyon satırı (vedic-d1-proj-1, alansız) 0 sağlayıcı çağrısıyla AYNEN kullanılır; eski snapshot değişmez; eski kayıt açılır", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const rx = roxy();
    await run(ctx, pa, rx.deps);
    assert.equal(rx.calls.length, 1);
    // Eski (main) projeksiyonun ürettiği satır: aynı input_hash, eski projeksiyon sürümü, yeni alanlar yok.
    const row = store.tables.astro_provider_results[0] as J;
    row.projection_version = "vedic-d1-proj-1";
    for (const y of row.technical.yogas) delete y.suppressedBy;
    for (const w of row.technical.planetaryWar) delete w.distance;
    const interp = store.tables.astro_provider_interpretations?.[0] as J;
    if (interp) interp.projection_version = "vedic-d1-proj-1";
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...D1SEL, includeProviderInterp: true, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const legacyId = (sv.body as J).analysisId;
    const snap = JSON.stringify(store.tables.astro_analyses.find((x: J) => x.id === legacyId));
    const again = await run(ctx, pa, rx.deps);
    assert.equal(again.status, 200);
    assert.equal(rx.calls.length, 1, "eski önbellek satırı varken sağlayıcı çağrıldı");
    const v = (again.body as J).results[0].view;
    assert.equal(v.projectionVersion, "vedic-d1-proj-1", "eski satır yeniden projekte edilmemeli (ham yanıt okunmaz)");
    assert.equal(v.interpretation.visible, true, "eski projeksiyon sürümlü yorum bulunamadı");
    assert.ok(v.technical.yogas.every((y: J) => y.suppressedBy === undefined));
    assert.equal(store.tables.astro_provider_results.length, 1, "yeni satır yazıldı");
    assert.equal(JSON.stringify(store.tables.astro_analyses.find((x: J) => x.id === legacyId)), snap, "eski analiz snapshot'ı değişti");
    const a = ((await getAnalysis(ctx, legacyId, false)).body as J).analysis;
    assert.ok(a.technical && Array.isArray(a.technical.yogas));
    const h = html(createElement(VedicD1Panel, { t: a.technical, kbLookup: null }));
    assert.ok(h.includes('data-testid="astro-vedic-d1-panel"'));
    assert.equal(tableOf(a, "Bastırılan yogalar"), null);
    assert.equal(rx.calls.length, 1);
  });

  // ═══ B) Sinastri isApplying ═══════════════════════════════════════════════════
  const synP = projectRoxySynastry(structuredClone(SYN.response), { houseSystem: "placidus", nodeType: "true" }) as J;
  await t("B1 adaptör: 94/94 gerçek (golden) sinastri açısında applying = isApplying; bilinmeyen alan 0", () => {
    assert.ok(synP.ok, JSON.stringify(synP.errors));
    assert.deepEqual(synP.unmappedFields, []);
    const tt = synP.technical as SynastryTechnical;
    assert.equal(tt.aspects.length, SYN.response.interAspects.length);
    tt.aspects.forEach((a, i) => assert.equal(a.applying, SYN.response.interAspects[i].isApplying, `açı ${i}`));
    assert.ok(tt.aspects.some((a) => a.applying === true) && tt.aspects.some((a) => a.applying === false));
    const missing = structuredClone(SYN.response);
    delete missing.interAspects[0].isApplying;
    missing.interAspects[1].isApplying = "yes";
    const m = projectRoxySynastry(missing, { houseSystem: "placidus", nodeType: "true" }) as J;
    assert.ok(m.ok);
    assert.equal(m.technical.aspects[0].applying, null);
    assert.equal(m.technical.aspects[1].applying, null);
    assert.ok(m.droppedValues.includes("interAspects[].isApplying"));
  });

  await t("B2 ekran + rapor: sinastri tablosunda seyir sütunu; rapor 'Durum' Yaklaşan/Ayrılan; eski kayıt (alansız) '—'", () => {
    const tt = synP.technical as SynastryTechnical;
    const h = html(createElement(SynastryPanel, { t: tt, names: ["Sentetik A", "Sentetik B"] }));
    assert.ok(h.includes(">Seyir<"), "seyir sütunu yok");
    assert.ok(h.includes("yaklaşıyor") && h.includes("ayrılıyor"));
    const legacy = structuredClone(tt) as J;
    for (const a of legacy.aspects) delete a.applying;
    const ho = html(createElement(SynastryPanel, { t: legacy, names: ["Sentetik A", "Sentetik B"] }));
    assert.ok(!ho.includes("yaklaşıyor") && !ho.includes("ayrılıyor") && !ho.includes("undefined"));
    const a: ReportAnalysisInput = { id: "s", title: "S", technique: "western.synastry", analysisAt: "2026-10-21T10:00:00Z", technical: tt };
    const tb = tableOf(a, "Sinastri açıları")!;
    assert.equal(tb.columns[5], "Durum");
    assert.ok(tb.rows.some((r) => r[5] === "Yaklaşan") && tb.rows.some((r) => r[5] === "Ayrılan"));
    const tbo = tableOf({ ...a, technical: legacy }, "Sinastri açıları")!;
    assert.ok(tbo.rows.every((r) => r[5] === ""), "eski kayıtta seyir uyduruldu");
  });

  // ═══ E) Rapora eklenen alanlar ════════════════════════════════════════════════
  await t("E1 natal rapor: açı kalıplarında nitelik, sıkılık ve burç dışı (ekranla aynı)", () => {
    const p = projectRoxyNatal(structuredClone(NATAL), { houseSystem: "placidus", nodeType: "true" }) as J;
    assert.ok(p.ok, JSON.stringify(p.errors));
    const tech = p.value.technical;
    assert.ok(tech.patterns.length > 0 && tech.patterns.some((x: J) => x.tightness !== null));
    tech.patterns[0].outOfSign = true;
    const tb = tableOf({ id: "n", title: "N", technique: "western.natal", analysisAt: "2026-10-21T10:00:00Z", technical: tech }, "Açı kalıpları")!;
    assert.deepEqual(tb.columns, ["Kalıp", "Gezegenler", "Tepe", "Element", "Nitelik", "Sıkılık", "Burç dışı"]);
    assert.equal(tb.rows[0][5], `%${Math.round(tech.patterns[0].tightness)}`);
    assert.equal(tb.rows[0][6], "Evet");
  });

  await t("E2 kompozit yorum anahtar kelimeleri: yorum GÖRÜNÜRKEN raporda; görünmezken (yetki kapısı) hiçbir yerde yok", () => {
    const p = projectRoxyComposite(structuredClone(COMP.response), { houseSystem: "placidus", nodeType: "true" }) as J;
    assert.ok(p.ok, JSON.stringify(p.errors));
    const kws: string[] = p.interpretation.bodies.flatMap((b: J) => b.keywords);
    assert.ok(kws.length > 0, "golden kompozitte anahtar kelime yok");
    const base: ReportAnalysisInput = { id: "c", title: "C", technique: "western.composite", analysisAt: "2026-10-21T10:00:00Z", technical: p.technical };
    const vis = texts({ ...base, interpretation: { visible: true, content: p.interpretation } });
    assert.ok(vis.includes(`Anahtar kelimeler: ${p.interpretation.bodies.find((b: J) => b.keywords.length).keywords.join(", ")}`), "görünür yorumda anahtar kelime yok");
    const none = texts(base);
    assert.ok(!none.includes("Anahtar kelimeler:"));
    // Yorum görünmezken (yetki yok / sahip önizlemesi; içerik görünüme hiç konmaz) rapor, yorumsuz raporla BİREBİR aynı.
    for (const it of [{ visible: false, reason: "not_entitled" }, { visible: false, reason: "owner_preview_hidden" }]) {
      const hid = texts({ ...base, interpretation: it });
      assert.equal(hid, none, "yetkisizde rapor yorum izi taşıyor");
    }
    // Savunma: içerik bir hatayla visible=false iken taşınsa bile anahtar kelime satırı çıkmaz.
    const leaked = texts({ ...base, interpretation: { visible: false, content: p.interpretation } });
    assert.equal(leaked, none, "visible=false içerik rapora girdi");
  });

  await t("E3 yetki kapısı (motor): yorum yetkisi kapalı uzmanın D1 kaydında yorum içeriği yok; teknik alanlar (suppressedBy) var", async () => {
    const store = seed();
    const ctx = ctxOf(store, { entitlements: NO_INTERP });
    const pa = await profile(ctxOf(store));
    const rx = roxy();
    const r = await run(ctx, pa, rx.deps);
    const v = (r.body as J).results[0].view;
    assert.equal(v.interpretation.visible, false);
    assert.equal(v.technical.yogas.find((y: J) => y.id === "kedara").suppressedBy, "akriti");
  });

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
