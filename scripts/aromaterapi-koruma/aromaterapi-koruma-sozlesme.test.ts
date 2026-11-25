// ============================================================
// Aromaterapi — DAVRANIŞ + SÖZLEŞME koruma testi (I18N-F1-R3 önerisi; R5 A26 / Owner §25 ile repoya alındı)
// EK test: eski kapsam/diff harness'ları (c3d-*) SİLİNMEDİ / ZAYIFLATILMADI; bu test onların korumasını
// i18n değişikliğinden bağımsız biçimde sürdürür. Golden = i18n ÖNCESİ main tabanı (R3, C:\yasam-i18n-r4).
// R5 eki: blend.* sonuçlarına I18N `errorCode` alanı için AÇIK additif izin + anlamsal kilit (bkz. ADDITIVE_RESULT_FIELDS).
//
// Amaç: eski kapsam/diff denetimlerinin (c3d-b2b G01–G05, c3b S06, c3c S05, c3d-d SC05,
// c3d-a SC01–03, c3d-b1 H01/H02, c3d-b2a-writers) koruduğu riskleri — yazma motoru,
// kanonik değerler, hesaplamalar, güvenlik sözleşmeleri — DOSYA METNİNE değil
// DAVRANIŞA ve SÖZLEŞMEYE kilitler. Çeviri (UI metni, katalog) bu testi kırmaz;
// motor/kanonik/hesap/yetki değişikliği kırar.
//
// Bölümler:
//   K1  İstemci yazma motoru davranışı (fetch stub): URL, metot, başlık, gövde, sonuç eşlemesi
//   K2  Kanonik değerler: readLabels kod+sıra+TR, form seçenek değerleri/sırası, sabitler,
//       (varsa) messages/tr/aromatherapy.json enums ↔ readLabels birebir
//   K3  Hesaplamalar: damla/dağıtım/doluluk, collectSafetyWarnings kombinasyonları,
//       doğrulama kodları, makeBlendItem, note_hash kanonik kodlama, sunucu doğrulayıcıları
//   K4  API güvenlik sözleşmesi (TypeScript AST): her route/metot için guard sırası,
//       modül adı, demo kapısı, tablo/RPC/.eq kolonları, HTTP durum kümesi, hata kodları
//   K5  Sunucu mantık parmak izi (AST; yorum/boşluk/insan-metni hariç) + migration hash
//   K6  Hata kodu → HTTP durum (writeFail/readFail) ve TR mesaj tabloları (TR birebir)
//
// Koşum (repo kökünde):
//   npx tsx --tsconfig scripts/tsconfig.aromaterapi-tests.json scripts/aromaterapi-koruma/aromaterapi-koruma-sozlesme.test.ts
//   (--write-golden YALNIZ Owner onaylı bilinçli sözleşme değişikliğinde; PR diff'inde görünür)
//   Ortam: AROMA_GOLDEN=<golden.json yolu> (varsayılan: bu dosyanın yanındaki golden/aromaterapi-koruma.golden.json)
//          AROMA_ROOT=<repo kökü> (varsayılan: process.cwd())
// FAIL → exit 1.  DB/ağ/secret YOK.
// ============================================================
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(process.env.AROMA_ROOT ?? process.cwd());
const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(process.env.AROMA_GOLDEN ?? join(HERE, "golden", "aromaterapi-koruma.golden.json"));
const WRITE = process.argv.includes("--write-golden");
const req = createRequire(join(ROOT, "package.json"));
const ts = req("typescript") as typeof import("typescript");

let pass = 0;
let fail = 0;
let info = 0;
const failures: string[] = [];
function check(n: string, c: boolean, d?: string) {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
}
function note(n: string) { info++; console.log(`  INFO  ${n}`); }

const mod = async <T = Record<string, unknown>>(rel: string): Promise<T> =>
  (await import(pathToFileURL(join(ROOT, rel)).href)) as T;
const readRel = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
/** Kararlı JSON (anahtar sırası KORUNUR — sıra da sözleşmenin parçası). undefined/NaN/±Infinity/-0 görünür kodlanır. */
function enc(v: unknown): unknown {
  if (v === undefined) return "⟨undefined⟩";
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "⟨NaN⟩";
    if (!Number.isFinite(v)) return v > 0 ? "⟨+Inf⟩" : "⟨-Inf⟩";
    if (Object.is(v, -0)) return "⟨-0⟩";
    return v;
  }
  if (v instanceof RegExp) return `⟨re:${v.source}/${v.flags}⟩`;
  if (v instanceof Set) return { "⟨set⟩": [...v].map(enc) };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = enc(x);
    return o;
  }
  return v;
}

// Bölüm sonuçları golden'a yazılır.
const OUT: Record<string, Record<string, unknown>> = { K1: {}, K1S: {}, K2: {}, K3: {}, K4: {}, K5: {}, K6: {} };
const rec = (sec: keyof typeof OUT, key: string, val: unknown) => { OUT[sec][key] = enc(val); };

// ------------------------------------------------------------------
// Tarayıcı ortamı stub'ı (yalnız localStorage; document yok → header taşıması)
// ------------------------------------------------------------------
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
type Captured = { url: string; method: string; headers: Record<string, string>; body: unknown; hasSignal: boolean; cache?: string };
let captured: Captured[] = [];
type Scenario = { name: string; respond: () => Response | Promise<Response> };
let currentScenario: Scenario | null = null;
(globalThis as Record<string, unknown>).fetch = async (url: string, init: RequestInit = {}) => {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) h[k] = v;
  const sorted = Object.fromEntries(Object.entries(h).sort(([a], [b]) => a.localeCompare(b)));
  let body: unknown = init.body === undefined ? "⟨yok⟩" : init.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* ham */ } }
  captured.push({ url: String(url), method: init.method ?? "GET", headers: sorted, body, hasSignal: init.signal != null, ...(init.cache ? { cache: init.cache } : {}) });
  if (!currentScenario) throw new Error("senaryo yok");
  return currentScenario.respond();
};
const json = (status: number, b: unknown) => () => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const SCENARIOS: Scenario[] = [
  { name: "200_ok", respond: json(200, { ok: true, claim_id: "c-1", entity_id: "e-1", id: "g-1", updated_at: "2026-01-01T00:00:00Z", series_id: "s-1", revision_id: "r-1", warnings: [{ w: 1 }], blend: { id: "b-1" }, rows: [{ id: "b-1" }], demo: false }) },
  { name: "200_noop", respond: json(200, { ok: true, noop: true }) },
  { name: "200_ok_false", respond: json(200, { ok: false }) },
  { name: "400_code", respond: json(400, { ok: false, code: "AROMA_WRITE_INVALID_BODY", error: "x" }) },
  { name: "403_demo_write", respond: json(403, { ok: false, code: "AROMA_WRITE_DEMO_FORBIDDEN" }) },
  { name: "403_demo_claim", respond: json(403, { ok: false, code: "AROMA_DEMO_FORBIDDEN" }) },
  { name: "404_empty", respond: json(404, {}) },
  { name: "409_stale", respond: json(409, { ok: false, code: "AROMA_STALE" }) },
  { name: "409_stale_claim", respond: json(409, { ok: false, code: "AROMA_STALE_CLAIM" }) },
  { name: "409_rev_stale", respond: json(409, { ok: false, code: "AROMA_REVISION_STALE" }) },
  { name: "409_identity", respond: json(409, { ok: false, code: "AROMA_PREPARATION_IDENTITY_LOCKED" }) },
  { name: "409_referenced", respond: json(409, { ok: false, code: "AROMA_SOURCE_REFERENCED", references: { passages: 2, claim_sources: 1, method_series: -1, preparations: 3, claims: "x" } }) },
  { name: "409_stale_blend", respond: json(409, { ok: false, error: "AROMA_STALE_BLEND", stale: true }) },
  { name: "500_nonjson", respond: () => new Response("<html>err</html>", { status: 500 }) },
  { name: "net_error", respond: () => { throw new TypeError("fetch failed"); } },
  { name: "abort", respond: () => { throw new DOMException("aborted", "AbortError"); } },
];

const MC_FIXTURE = { plant_part_used: "çiçek", material_state: "dried", method_text: "Distilasyon|∅:3", equipment: "imbik", amount_ratio: "1:10", solvent_carrier: "su", duration_text: "2 sa", temperature_text: "100°C", steps: [{ order: 2, text: "b" }, { order: 1, text: "a|" }], filtration: "", resting: null, storage: "cam", quality_notes: "q", safety_notes: "Dikkat" };

async function main() {
  // ================================================================
  console.log("\n[K1] İstemci yazma motoru davranışı");
  // ================================================================
  const yu = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/auth/yasamUser.ts");
  const claimW = await mod<Record<string, (...a: unknown[]) => Promise<unknown>>>("lib/aromaterapi/claimWrite.ts");
  const catW = await mod<Record<string, (...a: unknown[]) => Promise<unknown>>>("lib/aromaterapi/catalogWrite.ts");
  const srcW = await mod<Record<string, (...a: unknown[]) => Promise<unknown>>>("lib/aromaterapi/sourceWrite.ts");
  const metW = await mod<Record<string, (...a: unknown[]) => Promise<unknown>>>("lib/aromaterapi/methodWrite.ts");
  const gloW = await mod<Record<string, (...a: unknown[]) => Promise<unknown>>>("lib/aromaterapi/glossaryWrite.ts");
  const delW = await mod<Record<string, unknown>>("lib/aromaterapi/contentDeleteClient.ts");
  const blend = await mod<Record<string, unknown>>("lib/aromaterapi/blendData.ts");
  const wv = await mod<Record<string, unknown>>("lib/aromaterapi/service/writeValidation.ts");

  const claimBody = {
    preparation_id: "11111111-1111-4111-8111-111111111111", claim_type: "safety", conclusion: "  Sonuç ğüşiöç  ",
    conclusion_provenance: "source_verbatim", evidence_layer: "traditional", rationale_status: "from_source",
    safety_topic: "photo_toxicity", routes: [{ route_code: "topical" }], populations: [{ population_code: "children", age_min: 2, age_max: 6 }],
    sources: [{ source_id: "s", source_role: "primary" }], passages: [], relations: [{ other_claim_id: "o", relation_type: "supports", explanation_tr: "açıklama" }],
    reason: null,
  };
  const updBody = { reason: "Gerekçe", expected_updated_at: "2026-01-01T00:00:00Z", patch: { conclusion: "Yeni", status: "under_review" }, routes: [] };
  const blendInput = {
    name: "  Lavanta Karışımı  ", notes: "not", carrier_oil_id: null, carrier_oil_name: "Badem", carrier_photosensitivity_status: undefined,
    carrier_contraindications: "", carrier_safety_notes: "", bottle_ml: 30, dilution_percent: 2, drops_per_ml: 0, total_drops: 12,
    items: [{ oil_id: "o1", oil_name: "Lavanta", latin_name: "L. a.", oil_type: "essential", drops: 12, photosensitivity_status: "no", is_photosensitive: false, contraindications: "", safety_notes: "" }],
    expected_updated_at: " 2026-01-01T00:00:00Z ", tenant_id: "SALDIRGAN-TENANT", id: "SALDIRGAN-ID",
  };
  const sig = new AbortController().signal;
  type Call = { name: string; run: () => Promise<unknown> };
  const CALLS: Call[] = [
    { name: "claim.create", run: () => claimW.createKnowledgeRecord(claimBody, sig) },
    { name: "claim.update", run: () => claimW.updateKnowledgeRecord("cid/../x", updBody) },
    { name: "catalog.createPlantTaxon", run: () => catW.createPlantTaxon({ scientific_name: "Lavandula", rank: "species" }, sig) },
    { name: "catalog.updatePlantTaxon", run: () => catW.updatePlantTaxon("t-1", { scientific_name: "L", expected_updated_at: "x", reason: "r" }) },
    { name: "catalog.createPreparation", run: () => catW.createPreparation({ taxon_id: "t-1", preparation_type: "essential_oil" }) },
    { name: "catalog.updatePreparation", run: () => catW.updatePreparation("p-1", { expected_updated_at: "x", reason: "r" }) },
    { name: "source.create", run: () => srcW.createSource({ title: "Kitap", source_type: "book" }) },
    { name: "source.update", run: () => srcW.updateSource("s-1", { title: "Kitap", source_type: "book", expected_updated_at: "x", reason: "r" }) },
    { name: "source.delete", run: () => srcW.deleteSource("s-1", { expected_updated_at: "x", reason: "r" }) },
    { name: "method.createSeries", run: () => metW.createMethodSeries("p-1", { method_kind: "editorial", method_lang: "tr", method_text: "metin", steps: [{ order: 1, text: "a" }] }) },
    { name: "method.appendRevision", run: () => metW.appendMethodRevision("s-1", { method_text: "m", expected_latest_revision_id: "r-0", reason: "r" }) },
    { name: "method.transition", run: () => metW.transitionRevisionStatus("s-1", "r-1", { target_status: "verified", expected_updated_at: "x", reason: "r" }) },
    { name: "glossary.create", run: () => gloW.createGlossaryTerm({ term_tr: "Terim" }) },
    { name: "glossary.update", run: () => gloW.updateGlossaryTerm("g-1", { term_tr: "Terim" }) },
    { name: "glossary.delete", run: () => gloW.deleteGlossaryTerm("g-1") },
    ...(["plant_taxon", "preparation", "claim"] as const).map((k) => ({
      name: `content.delete.${k}`,
      run: () => (delW.deleteContentRecord as (...a: unknown[]) => Promise<unknown>)(k, "id 1/ğ", { expected_updated_at: "x", reason: "r" }),
    })),
    { name: "blend.save", run: () => (blend.saveBlend as (i: unknown) => Promise<unknown>)(blendInput) },
    { name: "blend.update", run: () => (blend.updateBlend as (id: string, i: unknown) => Promise<unknown>)("b 1/ğ", blendInput) },
    { name: "blend.update.noVersion", run: () => (blend.updateBlend as (id: string, i: unknown) => Promise<unknown>)("b-1", { ...blendInput, expected_updated_at: "  " }) },
    { name: "blend.save.invalid", run: () => (blend.saveBlend as (i: unknown) => Promise<unknown>)({ ...blendInput, name: " " }) },
    { name: "blend.delete", run: () => (blend.deleteBlend as (id: string) => Promise<unknown>)("b-1") },
    { name: "blend.fetch", run: () => (blend.fetchBlends as () => Promise<unknown>)() },
  ];
  const AUTH_STATES = [
    { name: "oturum_var", setup: () => { store.clear(); yu.saveYasamUser({ id: "u-1", role: "expert", tenant_id: "T-YEREL" }); yu.saveSessionToken("tok-1"); } },
    { name: "oturum_yok", setup: () => { store.clear(); } },
  ];
  for (const auth of AUTH_STATES) {
    for (const c of CALLS) {
      const results: Record<string, unknown> = {};
      for (const s of SCENARIOS) {
        auth.setup();
        captured = [];
        currentScenario = s;
        let r: unknown;
        try { r = await c.run(); } catch (e) { r = { "⟨throw⟩": String(e) }; }
        results[s.name] = { result: r, requests: captured };
      }
      rec("K1", `${auth.name}:${c.name}`, results);
    }
  }
  // Canlı değişmezler (golden'dan bağımsız): istemci gövdesinde kimlik alanı YOK
  {
    const k1 = OUT.K1 as Record<string, Record<string, { requests: Captured[] }>>;
    const FORBIDDEN = /"(tenant_id|actor|actor_user_id|note_hash|canonical_name)"\s*:/;
    let leak = "";
    for (const [k, v] of Object.entries(k1)) for (const sv of Object.values(v)) for (const rq of sv.requests) {
      if (FORBIDDEN.test(JSON.stringify(rq.body))) leak += `${k} `;
      if (rq.headers && Object.keys(rq.headers).some((h) => /service[_-]?role|authorization/i.test(h))) leak += `${k}(hdr) `;
    }
    check("K1.inv istemci gövdesi/başlığı tenant/actor/note_hash/canonical/service_role TAŞIMAZ", leak === "", leak);
  }

  // ================================================================
  console.log("\n[K1S] Sunucu yazma motoru davranışı (sahte DB zinciri; RPC adı + parametre eşlemesi + hata sınıflaması)");
  // ================================================================
  // Girdi: Proxy — her alan "in.<alan>" döner; böylece hangi girdi alanının hangi RPC parametresine
  // gittiği imzadan bağımsız kilitlenir. Aktör/tenant: yalnız güvenilir actor bağlamından gelmeli.
  const inProxy = (tag: string) => new Proxy({}, { get: (_t, k) => (typeof k === "string" ? `${tag}.${k}` : undefined), has: () => true });
  const actor = { userId: "ACTOR-U", label: "ACTOR-L", tenantId: "ACTOR-T", actorUserId: "ACTOR-U", actorLabel: "ACTOR-L" };
  type DbCall = { path: string; args: unknown[] };
  let dbCalls: DbCall[] = [];
  let dbResult: { data: unknown; error: unknown } = { data: null, error: null };
  const makeDb = () => {
    const chain = (path: string): unknown => new Proxy(function () { /* çağrılabilir */ }, {
      get: (_t, k) => {
        if (k === "then") return (res: (v: unknown) => unknown) => res(dbResult);
        return (...args: unknown[]) => { dbCalls.push({ path: `${path}.${String(k)}`, args }); return chain(`${path}.${String(k)}`); };
      },
    });
    return chain("db");
  };
  const DB_RESULTS: [string, { data: unknown; error: unknown }][] = [
    ["ok", { data: { ok: true, claim_id: "c-1", entity_id: "e-1", id: "e-1", updated_at: "2026-01-01T00:00:00Z", series_id: "s-1", revision_id: "r-1", noop: false, warnings: [] }, error: null }],
    ["ok_array", { data: [{ ok: true, entity_id: "e-1" }], error: null }],
    ["err_23505", { data: null, error: { code: "23505", message: "dup" } }],
    ["err_23503", { data: null, error: { code: "23503", message: "fk", details: "Key (x)=(y)" } }],
    ["err_23514", { data: null, error: { code: "23514", message: "check" } }],
    ["err_40001", { data: null, error: { code: "40001", message: "ser" } }],
    ["err_42883", { data: null, error: { code: "42883", message: "function does not exist" } }],
    ["err_null", { data: null, error: null }],
  ];
  const svcClaim = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/aromaterapi/service/claimMutations.ts");
  const svcCat = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/aromaterapi/service/catalogMethodMutations.ts");
  const svcSrc = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/aromaterapi/service/sourceMutations.ts");
  const svcDel = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/aromaterapi/service/contentDeleteMutations.ts");
  const SVC_CALLS: [string, () => unknown][] = [
    ["claim.createClaim", () => svcClaim.createClaim(makeDb(), actor, inProxy("in"))],
    ["claim.updateClaim", () => svcClaim.updateClaim(makeDb(), actor, "CID", { reason: "R", patch: { a: 1 }, expectedUpdatedAt: "T", routes: [], sources: undefined })],
    ["cat.createPlantTaxon", () => svcCat.createPlantTaxon(makeDb(), actor, inProxy("in"))],
    ["cat.updatePlantTaxon", () => svcCat.updatePlantTaxon(makeDb(), actor, "TID", inProxy("in"))],
    ["cat.createPreparation", () => svcCat.createPreparation(makeDb(), actor, inProxy("in"))],
    ["cat.updatePreparation", () => svcCat.updatePreparation(makeDb(), actor, "PID", inProxy("in"))],
    ["cat.createMethodSeriesWithFirstRevision", () => svcCat.createMethodSeriesWithFirstRevision(makeDb(), actor, inProxy("series"), { ...MC_FIXTURE, reason: "R" })],
    ["cat.appendMethodRevision", () => svcCat.appendMethodRevision(makeDb(), actor, "SID", { ...MC_FIXTURE, reason: "R" }, 7)],
    ["cat.transitionMethodRevisionStatus", () => svcCat.transitionMethodRevisionStatus(makeDb(), actor, "SID", "RID", inProxy("in"))],
    ["src.createSource", () => svcSrc.createSource(makeDb(), actor, inProxy("in"))],
    ["src.updateSource", () => svcSrc.updateSource(makeDb(), actor, "SRCID", inProxy("in"))],
    ["src.deleteSource", () => svcSrc.deleteSource(makeDb(), actor, "SRCID", inProxy("in"))],
    ...(["plant_taxon", "preparation", "claim"] as const).map((k) => [`del.deleteContentRecord.${k}`, () => svcDel.deleteContentRecord(makeDb(), k, actor, "EID", inProxy("in"))] as [string, () => unknown]),
  ];
  const origErr = console.error;
  console.error = () => {};
  for (const [name, run] of SVC_CALLS) {
    const res: Record<string, unknown> = {};
    for (const [rn, rv] of DB_RESULTS) {
      dbCalls = []; dbResult = rv;
      let r: unknown;
      try { r = await run(); } catch (e) { r = { "⟨throw⟩": String(e) }; }
      res[rn] = { result: r, db: dbCalls };
    }
    rec("K1S", name, res);
  }
  console.error = origErr;
  // Hata sınıflandırıcılar + kod→HTTP tabloları
  const errMatrix: unknown[] = [null, undefined, {}, { code: "23505" }, { code: "23503" }, { code: "23514" }, { code: "23502" }, { code: "40001" }, { code: "P0001" }, { code: "PGRST116" }];
  const allSvcCodes = [...new Set(["claimMutations", "catalogMethodMutations", "sourceMutations", "contentDeleteMutations"].flatMap((f) => codesFromSource(readRel(`lib/aromaterapi/service/${f}.ts`))))];
  for (const c of allSvcCodes) errMatrix.push({ code: "P0001", message: c }, { code: "P0001", message: `x ${c} y`, details: c });
  rec("K1S", "classify", {
    claim: errMatrix.map((e) => svcClaim.classifyClaimRpcError(e)),
    catalog: errMatrix.map((e) => svcCat.classifyCatalogMethodRpcError(e)),
    source: errMatrix.map((e) => svcSrc.classifySourceRpcError(e)),
    contentDelete: (["plant_taxon", "preparation", "claim"] as const).map((k) => errMatrix.map((e) => svcDel.classifyContentDeleteError(k, e))),
  });
  rec("K1S", "http-tablolari", { claim: svcClaim.CLAIM_ERROR_HTTP, catalog: svcCat.CATALOG_METHOD_ERROR_HTTP, source: svcSrc.SOURCE_ERROR_HTTP, contentDelete: svcDel.CONTENT_DELETE_ERROR_HTTP });
  rec("K1S", "resolveActorLabel", [[undefined, "a@b.c"], [{ full_name: " Ad Soyad " }, "a@b.c"], [{ name: "N" }, ""], [{ full_name: "x".repeat(321) }, "a@b.c"], [{}, ""], [{}, "  "], [{}, "m".repeat(400)]].map(([p, e]) => [
    svcClaim.resolveActorLabel(p, e),
    (wv.resolveActorLabel as (p: unknown, e: unknown) => string)(p, e),
  ]));
  // Canlı değişmez: RPC'ye giden tenant/actor YALNIZ actor bağlamından (girdi proxy'sinden ASLA)
  {
    let leak = "";
    for (const [k, v] of Object.entries(OUT.K1S)) {
      if (!k.includes(".")) continue;
      for (const sv of Object.values(v as Record<string, { db?: DbCall[] }>)) for (const c of sv.db ?? []) {
        const s = JSON.stringify(c.args);
        if (/"p_tenant_id":"(?!ACTOR-T")/.test(s) || /"p_actor_user_id":"(?!ACTOR-U")/.test(s) || /"tenant_id","(?!ACTOR-T")/.test(s)) leak += `${k} `;
      }
    }
    check("K1S.inv RPC tenant/actor parametreleri yalnız doğrulanmış actor bağlamından", leak === "", leak);
  }

  // ================================================================
  console.log("\n[K2] Kanonik değerler");
  // ================================================================
  const labels = await mod<Record<string, unknown>>("lib/aromaterapi/readLabels.ts");
  const mapNames = Object.keys(labels).filter((k) => k.endsWith("_TR") && labels[k] && typeof labels[k] === "object").sort();
  for (const n of mapNames) rec("K2", `readLabels.${n}`, Object.entries(labels[n] as Record<string, string>));
  const lbl = (labels.tr as { label?: (m: Record<string, string>, c: unknown) => string } | undefined)?.label;
  if (lbl) {
    const probe = ["", null, undefined, "bilinmeyen_kod", "draft"];
    rec("K2", "readLabels.tr.label(probe)", mapNames.map((n) => probe.map((p) => lbl(labels[n] as Record<string, string>, p))));
  }
  const cfg = await mod<Record<string, unknown>>("lib/aromaterapi/claimFormConfig.ts");
  for (const k of Object.keys(cfg).sort()) if (typeof cfg[k] !== "function") rec("K2", `claimFormConfig.${k}`, cfg[k]);
  const CT = (cfg.CLAIM_TYPES as string[]) ?? [];
  const RS = (cfg.RATIONALE_STATUSES as string[]) ?? [];
  rec("K2", "claimFormConfig.kurallar", {
    safetyTopicRequired: CT.map((c) => (cfg.safetyTopicRequired as (x: string) => boolean)(c)),
    outcomeTypeRequired: CT.map((c) => (cfg.outcomeTypeRequired as (x: string) => boolean)(c)),
    rationaleRequired: RS.map((c) => (cfg.rationaleRequired as (x: string) => boolean)(c)),
  });
  const wt = await mod<Record<string, unknown>>("lib/aromaterapi/writeTypes.ts");
  for (const k of Object.keys(wt).sort()) rec("K2", `writeTypes.${k}`, wt[k]);
  const oil = await mod<Record<string, unknown>>("lib/aromaterapi/oilFields.ts");
  rec("K2", "oilFields.OIL_LIST_SELECT", oil.OIL_LIST_SELECT);
  rec("K2", "oilFields.OIL_COPY_FIELDS", oil.OIL_COPY_FIELDS);
  rec("K2", "contentDelete.REFERENCED_CODE", delW.REFERENCED_CODE);
  rec("K2", "blend.sabitler", { DEFAULT_DROPS_PER_ML: blend.DEFAULT_DROPS_PER_ML, BOTTLE_ML_PRESETS: blend.BOTTLE_ML_PRESETS, DILUTION_PERCENT_PRESETS: blend.DILUTION_PERCENT_PRESETS });
  rec("K2", "writeValidation.FORBIDDEN_IDENTITY_KEYS", [...(wv.FORBIDDEN_IDENTITY_KEYS as Set<string>)]);
  // Katalog ↔ readLabels (canlı; katalog yoksa SKIP)
  const catPath = join(ROOT, "messages/tr/aromatherapy.json");
  const enumsTr = existsSync(catPath) ? JSON.parse(readFileSync(catPath, "utf8"))?.aromatherapy?.enums : undefined;
  if (enumsTr) {
    let diff = "";
    for (const n of mapNames) {
      const base = n.slice(0, -3);
      const m = labels[n] as Record<string, string>;
      const c = enumsTr[base] as Record<string, string> | undefined;
      if (!c) { diff += `${base}:katalogda-yok `; continue; }
      if (JSON.stringify(Object.keys(m)) !== JSON.stringify(Object.keys(c))) diff += `${base}:kod/sıra `;
      for (const [k, v] of Object.entries(m)) if (c[k] !== v) diff += `${base}.${k}:TR≠ `;
    }
    check("K2.inv messages/tr enums ↔ readLabels (kod + sıra + TR değer) birebir", diff === "", diff);
    const enPath = join(ROOT, "messages/en/aromatherapy.json");
    if (existsSync(enPath)) {
      const en = JSON.parse(readFileSync(enPath, "utf8"))?.aromatherapy?.enums ?? {};
      let miss = "";
      for (const [b, m] of Object.entries(enumsTr as Record<string, Record<string, string>>)) {
        if (JSON.stringify(Object.keys(m)) !== JSON.stringify(Object.keys(en[b] ?? {}))) miss += `${b} `;
      }
      check("K2.inv messages/en enums kod kümesi + sıra = TR", miss === "", miss);
    }
  } else note("K2.inv messages/tr/aromatherapy.json enums yok (taban) — katalog eşitliği SKIP");

  // ================================================================
  console.log("\n[K3] Hesaplamalar");
  // ================================================================
  const calc = blend.calcTotalDrops as (b: number, d: number, p?: number) => number;
  const NUMS = [0, -0, -1, 0.5, 1, 2, 2.5, 3, 5, 10, 12.25, 30, 50, 100, 1000, NaN, Infinity, -Infinity];
  const grid: unknown[] = [];
  for (const b of NUMS) for (const d of NUMS) grid.push([b, d, calc(b, d), calc(b, d, 33), calc(b, d, 0)]);
  rec("K3", "calcTotalDrops", grid);
  const dist = blend.distributeEqually as (t: number, c: number) => number[];
  const dg: unknown[] = [];
  for (const t of [-5, 0, 1, 7, 12, 12.9, 100, 101, NaN]) for (const c of [-1, 0, 1, 2, 3, 7, 13]) dg.push([t, c, dist(t, c)]);
  rec("K3", "distributeEqually", dg);
  const sum = blend.sumDrops as (i: { drops: number }[]) => number;
  rec("K3", "sumDrops", [[], [1, 2, 3], [NaN, 5, Infinity, -2, 0.5]].map((a) => sum(a.map((d) => ({ drops: d })))));
  const fill = blend.fillStatus as (a: number, b: number) => string;
  const fg: unknown[] = [];
  for (const a of [-1, 0, 5, 12, 13]) for (const b of [-1, 0, 12]) fg.push([a, b, fill(a, b)]);
  rec("K3", "fillStatus", fg);
  // collectSafetyWarnings: tam kombinasyon matrisi
  const csw = blend.collectSafetyWarnings as (items: unknown[], carrier?: unknown) => { warnings: Record<string, unknown>[]; hasWarnings: boolean; summary: string };
  const PH = ["yes", "no", "unknown", undefined, null];
  const LEG = [true, false, undefined];
  const TXT = ["", "  ", " Hamilelikte kullanılmaz "];
  const item = (ps: unknown, leg: unknown, c: string, n: string, name = "Bergamot") => ({ oil_id: "o", oil_name: name, latin_name: "", oil_type: "essential", drops: 1, photosensitivity_status: ps, is_photosensitive: leg, contraindications: c, safety_notes: n });
  const CARRIERS = [null, undefined, { oil_name: "  ", photosensitivity_status: "yes", contraindications: "x", safety_notes: "y" }, { oil_name: " Badem ", photosensitivity_status: "unknown", contraindications: "Alerji", safety_notes: "" }, { oil_name: "Jojoba", photosensitivity_status: "yes", contraindications: " ", safety_notes: "Not" }];
  const sw: unknown[] = [];
  for (const ps of PH) for (const leg of LEG) for (const c of TXT) for (const n of TXT) for (const car of CARRIERS) {
    sw.push(csw([item(ps, leg, c, n)], car));
  }
  sw.push(csw([], null), csw([item("yes", false, "", ""), item("no", true, "A", "B", "Limon")], null));
  rec("K3", "collectSafetyWarnings", sw);
  const mk = blend.makeBlendItem as (s: unknown, d: number) => unknown;
  const mkIn = [
    [{ id: "o", name: "Lav", oil_type: "essential" }, 3.9],
    [{ id: null, name: "Ber", latin_name: null, oil_type: "essential", photosensitivity_status: "yes", is_photosensitive: false, contraindications: null, safety_notes: "n" }, -2],
    [{ id: "o", name: "X", oil_type: "carrier", photosensitivity_status: "garbage", is_photosensitive: true }, NaN],
    [{ id: "o", name: "Y", oil_type: "essential", photosensitivity_status: null, is_photosensitive: null }, 0],
  ];
  rec("K3", "makeBlendItem", mkIn.map(([s, d]) => mk(s, d as number)));
  const dps = oil.derivePhotosensitivity as (s: unknown) => unknown;
  const dpIn: unknown[] = [];
  for (const ps of ["yes", "no", "unknown", "YES", "", null, undefined, 5]) for (const leg of [true, false, null, undefined]) dpIn.push([ps, leg, dps({ photosensitivity_status: ps, is_photosensitive: leg })]);
  rec("K3", "derivePhotosensitivity", dpIn);
  const pick = oil.pickWritableOilFields as (r: unknown, o?: unknown) => unknown;
  const pickIn = [
    { name: " Lav ", latin_name: "L", tenant_id: "T", id: "I", photosensitivity_status: "yes", safety_notes: " n ", contraindications: null, is_photosensitive: "true", extra: 1 },
    {}, null, { name: "", photosensitivity_status: "bogus" }, { safety_notes: "" },
  ];
  rec("K3", "pickWritableOilFields", pickIn.flatMap((b) => [pick(b), pick(b, { partial: true })]));
  // Doğrulama: TR metin + (varsa) dil-bağımsız kod; null ⇔ null
  const vbi = blend.validateBlendInput as (i: unknown) => string | null;
  const bic = blend.blendInputErrorCode as ((i: unknown) => string | null) | undefined;
  const vIn: unknown[] = [];
  for (const name of ["", "  ", "A", " İı "]) for (const bm of [0, -1, NaN, 30]) for (const dp of [0, NaN, 2]) for (const items of [[], [{ drops: 1 }]]) {
    vIn.push({ name, bottle_ml: bm, dilution_percent: dp, items });
  }
  rec("K3", "validateBlendInput(TR)", vIn.map((i) => vbi(i)));
  if (bic) check("K3.inv blendInputErrorCode null ⇔ validateBlendInput null", vIn.every((i) => (bic(i) === null) === (vbi(i) === null)));
  const cn = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/aromaterapi/copyName.ts");
  const names = ["Lavanta", "lavanta (kopya)", "İstanbul", "ISPARTA", "Kopya"];
  const cIn = ["", "  ", "lavanta", "LAVANTA", "istanbul", "İSTANBUL", "ıspARTA", "Yeni", "Lavanta (Kopya)"];
  rec("K3", "copyName", {
    strip: cIn.map((x) => cn.stripCopySuffix(x)),
    suggest: [...cIn, ...names].map((x) => cn.suggestCopyName(x, names)),
    validateTR: cIn.map((x) => cn.validateCopyName(x, names)),
  });
  if (cn.copyNameErrorCode) check("K3.inv copyNameErrorCode null ⇔ validateCopyName null", cIn.every((x) => (cn.copyNameErrorCode(x, names) === null) === (cn.validateCopyName(x, names) === null)));
  // note_hash kanonik kodlama (DB'deki imza ile birebir olmalı)
  const mc = await mod<Record<string, (c: unknown) => string>>("lib/aromaterapi/service/methodCanonical.ts");
  const MC = [
    { plant_part_used: null, material_state: null, method_text: "", equipment: null, amount_ratio: null, solvent_carrier: null, duration_text: null, temperature_text: null, steps: null, filtration: null, resting: null, storage: null, quality_notes: null, safety_notes: null },
    MC_FIXTURE,
  ];
  rec("K3", "methodCanonical", MC.map((c) => [mc.canonicalMethodContent(c), mc.computeMethodNoteHash(c)]));
  // Sunucu doğrulayıcıları
  const reasons = [undefined, null, "", "  ", "a", " gerekçe ", "x".repeat(2000), "x".repeat(2001), 5, {}];
  rec("K3", "writeValidation", {
    isUuid: ["", "11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-11111111111Z", "11111111111141118111111111111111", 5].map((x) => (wv.isUuid as (v: unknown) => boolean)(x)),
    hasForbiddenIdentityKey: [{}, { tenant_id: 1 }, { actor: 1 }, { note_hash: 1 }, { name: 1 }, { id: 1 }].map((x) => (wv.hasForbiddenIdentityKey as (o: unknown) => boolean)(x)),
    createReason: reasons.map((x) => (wv.validateCreateReason as (v: unknown) => unknown)(x)),
    mandatoryReason: reasons.map((x) => (wv.validateMandatoryReason as (v: unknown) => unknown)(x)),
    expectedUpdatedAt: ["", "2026-01-01T00:00:00Z", "2026-01-01", "x", "2026-13-01T00:00:00Z"].map((x) => (wv.isValidExpectedUpdatedAt as (v: string) => boolean)(x)),
  });
  const rv = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/aromaterapi/service/readValidation.ts");
  const Q = ["", "lav", "Lav%_\\", "İĞÜŞÖÇ ığüşöç", "a,b(c)", "x".repeat(300)];
  rec("K3", "readValidation", {
    safeIlike: Q.map((q) => rv.safeIlikePattern(q)),
    orIlike: Q.map((q) => rv.buildOrIlike(["name", "latin_name"], q)),
    searchNorm: Q.map((q) => rv.buildSearchNormIlike(q)),
    identityNorm: Q.map((q) => rv.buildIdentityNormIlike(q)),
  });
  const sn = await mod<Record<string, (v: unknown) => string>>("lib/aromaterapi/searchNormalize.ts");
  rec("K3", "normalizeForSearch", ["", null, "İstanbul", "IŞIK ışık", "Çay Ağacı", "  Lavanta  "].map((x) => sn.normalizeForSearch(x)));
  const swf = await mod<Record<string, (...a: unknown[]) => unknown>>("lib/aromaterapi/sourceWriteFields.ts");
  rec("K3", "sourceWriteFields", {
    year: [{}, { publication_year: null }, { publication_year: "" }, { publication_year: 1999 }, { publication_year: "1999" }, { publication_year: 1999.5 }, { publication_year: -1 }, { publication_year: 3000 }].map((o) => swf.parseSourceYear(o)),
    type: ["book", "BOOK", "", "x"].map((v) => swf.isValidSourceType(v, ["book", "article"])),
  });
  rec("K3", "sourceRemovalMode", [{}, { passage_count: 1 }, { knowledge_record_count: 2 }, { passage_count: 0, knowledge_record_count: 0 }, { passage_count: null }].map((d) => (srcW.sourceRemovalMode as unknown as (d: unknown) => string)(d)));

  // ================================================================
  console.log("\n[K4] API güvenlik sözleşmesi (AST)");
  // ================================================================
  const routeFiles = walk(join(ROOT, "app/api/aromaterapi")).filter((f) => f.endsWith("route.ts")).map((f) => relative(ROOT, f).replace(/\\/g, "/")).sort();
  rec("K4", "route-dosyalari", routeFiles);
  for (const rf of routeFiles) rec("K4", rf, routeContract(readRel(rf), rf));

  // ================================================================
  console.log("\n[K5] Sunucu mantık parmak izi + migration");
  // ================================================================
  const svcDir = join(ROOT, "lib/aromaterapi/service");
  const svc = readdirSync(svcDir).filter((f) => f.endsWith(".ts")).sort();
  for (const f of svc) rec("K5", `service/${f}`, logicFingerprint(readFileSync(join(svcDir, f), "utf8"), f));
  const migDir = join(ROOT, "supabase/migrations");
  const migs = existsSync(migDir) ? readdirSync(migDir).filter((f) => /aroma/i.test(f)).sort() : [];
  rec("K5", "migration-listesi", migs);
  rec("K5", "migration-hash", Object.fromEntries(migs.map((f) => [f, sha(readFileSync(join(migDir, f), "utf8").replace(/\r\n/g, "\n"))])));

  // ================================================================
  console.log("\n[K6] Hata kodu → HTTP + TR mesaj tabloları");
  // ================================================================
  const we = await mod<Record<string, (...a: unknown[]) => Response>>("lib/aromaterapi/service/writeErrors.ts");
  const re = await mod<Record<string, (...a: unknown[]) => Response>>("lib/aromaterapi/service/readErrors.ts");
  const WCODES = codesFromSource(readRel("lib/aromaterapi/service/writeErrors.ts"));
  const RCODES = codesFromSource(readRel("lib/aromaterapi/service/readErrors.ts"));
  const wres: unknown[] = [];
  for (const c of [...WCODES, "BILINMEYEN"]) { const r = we.writeFail(c); wres.push([c, r.status, await r.json()]); }
  for (const [n, f] of [["writeForbiddenDemo", we.writeForbiddenDemo], ["writeNotFound", we.writeNotFound]] as const) { const r = f(); wres.push([n, r.status, await r.json()]); }
  rec("K6", "writeFail", wres);
  const rres: unknown[] = [];
  for (const c of [...RCODES, "BILINMEYEN"]) { const r = re.readFail(c); rres.push([c, r.status, await r.json()]); }
  { const r = re.readNotFound(); rres.push(["readNotFound", r.status, await r.json()]); }
  rec("K6", "readFail", rres);
  const ALL = [...new Set([...WCODES, ...RCODES, ...codesFromSource(readRel("lib/aromaterapi/claimWrite.ts")), ...codesFromSource(readRel("lib/aromaterapi/catalogWrite.ts")), ...codesFromSource(readRel("lib/aromaterapi/sourceWrite.ts")), ...codesFromSource(readRel("lib/aromaterapi/glossaryWrite.ts")), ...codesFromSource(readRel("lib/aromaterapi/contentDeleteClient.ts"))])].sort();
  const probe = [null, "", "BILINMEYEN", "HTTP_500", ...ALL];
  rec("K6", "mesaj.TR", {
    claim: probe.map((c) => (claimW.writeMessageForCode as unknown as (c: unknown) => string)(c)),
    catalog: probe.map((c) => (catW.writeMessageForCode as unknown as (c: unknown) => string)(c)),
    source: probe.map((c) => (srcW.sourceMessageForCode as unknown as (c: unknown) => string)(c)),
    glossary: probe.map((c) => (gloW.glossaryMessageForCode as unknown as (c: unknown) => string)(c)),
    contentDelete: probe.map((c) => (delW.contentDeleteMessageForCode as (c: unknown) => string)(c)),
    describeContent: (["plant_taxon", "preparation", "claim"] as const).flatMap((k) => [null, {}, { preparations: 2 }, { claims: 1, method_series: 3 }, { relations: -1 }, { x: 4 }].map((r) => (delW.describeContentReferences as (k: string, r: unknown) => string)(k, r))),
    describeSource: [null, { passages: 0, claimSources: 0, methodSeries: 0 }, { passages: 2, claimSources: 1, methodSeries: 3 }].map((r) => (srcW.describeSourceReferences as unknown as (r: unknown) => string)(r)),
    blendSabit: [blend.BLEND_MISSING_AUTH, blend.BLEND_STALE_MESSAGE, blend.BLEND_MISSING_VERSION_MESSAGE],
  });

  // ================================================================
  // Golden yaz / karşılaştır
  // ================================================================
  if (WRITE) {
    mkdirSync(dirname(GOLDEN), { recursive: true });
    if (existsSync(GOLDEN) && !process.argv.includes("--overwrite")) {
      console.log(`\nGolden zaten var (${GOLDEN}); üzerine yazmak için --overwrite.`);
      process.exit(2);
    }
    writeFileSync(GOLDEN, JSON.stringify({ meta: { root: ROOT, uretim: new Date().toISOString() }, ...OUT }, null, 1) + "\n", "utf8");
    console.log(`\nGolden yazıldı: ${GOLDEN}`);
    return;
  }
  if (!existsSync(GOLDEN)) { check("golden mevcut", false, GOLDEN); return; }
  const G = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Record<string, unknown>>;
  console.log("\n[KARŞILAŞTIRMA] golden ↔ güncel");
  for (const sec of Object.keys(OUT) as (keyof typeof OUT)[]) {
    const g = G[sec] ?? {};
    const cur = OUT[sec];
    for (const key of Object.keys(g)) {
      if (!(key in cur)) { check(`${sec} ${key}`, false, "güncelde YOK (silinmiş/yeniden adlandırılmış)"); continue; }
      const d = compare(sec, key, g[key], cur[key]);
      check(`${sec} ${key}`, d.length === 0, (process.env.AROMA_VERBOSE ? d : d.slice(0, 3)).join(" | "));
    }
    for (const key of Object.keys(cur)) if (!(key in g)) {
      if (sec === "K4" || sec === "K5") check(`${sec} ${key}`, false, "golden'da YOK (yeni route/servis/migration — bilinçli golden güncellemesi gerekir)");
      else note(`${sec} ${key} yeni (golden'da yok; additif)`);
    }
  }
}

// ------------------------------------------------------------------
// Karşılaştırma — additif izinler AÇIKÇA listelenir
// ------------------------------------------------------------------
/** collectSafetyWarnings uyarı nesnesine I18N için eklenebilen alanlar (yalnız bunlar). */
const ADDITIVE_WARNING_FIELDS = new Set(["carrier", "source_name"]);
let additiveWarningCount = 0;
/**
 * R5 (A26): karışım (blend.*) istemci sonuçlarına I18N için eklenen DİL-BAĞIMSIZ hata kodu alanı. Yalnız bu alan;
 * eski alanların (Türkçe `error` dahil) değeri/sırası golden ile BİREBİR kalmak zorunda. Anlamsal kilit:
 *   - değer null ya da AROMA_[A-Z0-9_]+ biçiminde kod
 *   - golden `error` null ⇒ güncel `errorCode` null (başarıda kod yok; kodsuz sunucu hatasında null serbest → genel metin)
 *   - sunucu yanıtı kod taşıyorsa (400_code / 403_demo_write) errorCode = o kod (ekranda yanlış metin seçilemez)
 */
const ADDITIVE_RESULT_FIELDS = new Set(["errorCode"]);
let additiveResultCount = 0;
const AROMA_CODE_RE = /^AROMA_[A-Z0-9_]+$/;
function compare(sec: string, key: string, g: unknown, c: unknown): string[] {
  const out: string[] = [];
  const walkCmp = (p: string, a: unknown, b: unknown) => {
    if (out.length > (process.env.AROMA_VERBOSE ? 100000 : 20)) return;
    // K4 hata kodları: golden ⊆ güncel (yeni kod eklemek serbest; kod kaldırmak FAIL)
    if (sec === "K4" && p.endsWith(".codes") && Array.isArray(a) && Array.isArray(b)) {
      const missing = (a as string[]).filter((x) => !(b as string[]).includes(x));
      if (missing.length) out.push(`${p}: kaldırılan kod ${missing.join(",")}`);
      const added = (b as string[]).filter((x) => !(a as string[]).includes(x));
      if (added.length) note(`${p}: additif yeni hata kodu ${added.join(",")}`);
      return;
    }
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) { out.push(`${p}: dizi uzunluğu ${Array.isArray(a) ? a.length : "?"}→${Array.isArray(b) ? b.length : typeof b}`); return; }
      a.forEach((x, i) => walkCmp(`${p}[${i}]`, x, b[i]));
      return;
    }
    if (a && typeof a === "object") {
      if (!b || typeof b !== "object" || Array.isArray(b)) { out.push(`${p}: nesne→${JSON.stringify(b)?.slice(0, 60)}`); return; }
      const ak = Object.keys(a as object);
      const bk = Object.keys(b as object);
      const isWarning = sec === "K3" && key === "collectSafetyWarnings" && "kind" in (a as object) && "oil_name" in (a as object);
      const isBlendResult = sec === "K1" && /:blend\./.test(key) && p.endsWith(".result");
      for (const k of ak) {
        if (!(k in (b as object))) { out.push(`${p}.${k}: silindi`); continue; }
        walkCmp(`${p}.${k}`, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
      }
      const extra = bk.filter((k) => !ak.includes(k));
      if (isWarning) {
        const bad = extra.filter((k) => !ADDITIVE_WARNING_FIELDS.has(k));
        if (bad.length) out.push(`${p}: izinsiz yeni alan ${bad.join(",")}`);
        const bw = b as Record<string, unknown>;
        if (extra.includes("carrier") && !(bw.carrier === true && bw.oil_name === `Taşıyıcı: ${bw.source_name}`)) out.push(`${p}: carrier/source_name tutarsız`);
        if (extra.length) additiveWarningCount++;
      } else if (isBlendResult && extra.length) {
        const bad = extra.filter((k) => !ADDITIVE_RESULT_FIELDS.has(k));
        if (bad.length) out.push(`${p}: izinsiz yeni alan ${bad.join(",")}`);
        const ar = a as Record<string, unknown>, br = b as Record<string, unknown>;
        const code = br.errorCode;
        if (!(code === null || (typeof code === "string" && AROMA_CODE_RE.test(code)))) out.push(`${p}.errorCode: kod biçimi değil ${JSON.stringify(code)}`);
        if (ar.error == null && code != null) out.push(`${p}.errorCode: başarılı sonuçta hata kodu (errorCode=${JSON.stringify(code)})`);
        const scen = p.split(".").slice(-2, -1)[0];
        const exp = scen === "400_code" ? "AROMA_WRITE_INVALID_BODY" : scen === "403_demo_write" ? "AROMA_WRITE_DEMO_FORBIDDEN" : null;
        if (exp && /oturum_var:/.test(key) && !/\.invalid|noVersion/.test(key) && code !== exp) out.push(`${p}.errorCode: sunucu kodu yansımadı (beklenen ${exp}, gelen ${JSON.stringify(code)})`);
        additiveResultCount++;
      } else if (extra.length) out.push(`${p}: yeni alan ${extra.join(",")}`);
      else if (JSON.stringify(ak) !== JSON.stringify(bk.filter((k) => ak.includes(k)))) out.push(`${p}: anahtar sırası değişti`);
      return;
    }
    if (a !== b) out.push(`${p}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`);
  };
  walkCmp(key, g, c);
  return out;
}

// ------------------------------------------------------------------
// AST yardımcıları
// ------------------------------------------------------------------
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const parse = (src: string, name: string) => ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function codesFromSource(src: string): string[] {
  return [...new Set(src.match(/\bAROMA_[A-Z0-9_]+\b/g) ?? [])].sort();
}
/** İnsan metni (çeviriye aday) mi? Türkçe harf VEYA (boşluk + noktalama ile biten cümle). Kodlar/kolon listeleri/sembolik değerler DEĞİL. */
function isHumanText(s: string): boolean {
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/.test(s)) return false;
  if (/[ÇĞİÖŞÜçğıöşü]/.test(s)) return true;
  return /\s/.test(s.trim()) && /[.!?:…]$/.test(s.trim());
}
const callName = (e: import("typescript").Expression): string =>
  ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "";
const GUARD_RE = /^(requireModuleAccess|requireAdmin\w*|verifyUserRequest|guard\w*|\w*Guard|checkRateLimit\w*|rateLimit\w*|enforce\w*|demoReadOnlyResponse|writeForbiddenDemo|readJsonBounded|hasForbiddenIdentityKey)$/;
const DATA_RE = /^(from|rpc)$/;
const SEC_IMPORT_RE = /(aromaterapi\/service\/|\/auth\/|supabase|usage|rateLimit|guard|moduleAccess|demo)/i;
function routeContract(src: string, name: string) {
  const sf = parse(src, name);
  const methods: Record<string, unknown> = {};
  const imports = new Map<string, string>();
  for (const st of sf.statements) if (ts.isImportDeclaration(st) && st.importClause) {
    const from = (st.moduleSpecifier as import("typescript").StringLiteral).text;
    if (st.importClause.name) imports.set(st.importClause.name.text, from);
    const nb = st.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) imports.set(el.name.text, from);
  }
  const handle = (mname: string, body: import("typescript").Node) => {
    const seq: string[] = [];
    const tables = new Set<string>(); const rpcs = new Set<string>(); const eqCols = new Set<string>();
    const statuses = new Set<number>(); const codes = new Set<string>(); const modules = new Set<string>(); const svcCalls = new Set<string>();
    let demo = false; let firstGuard = -1; let firstData = -1; let idx = 0;
    const visit = (n: import("typescript").Node) => {
      if (ts.isCallExpression(n)) {
        const cn = callName(n.expression);
        const a0 = n.arguments[0];
        const lit = a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0)) ? a0.text : undefined;
        if (GUARD_RE.test(cn)) { seq.push(cn); if (firstGuard < 0) firstGuard = idx; if (cn === "requireModuleAccess") { const a1 = n.arguments[1]; if (a1 && ts.isStringLiteral(a1)) modules.add(a1.text); } }
        if (DATA_RE.test(cn) && lit) { if (firstData < 0) firstData = idx; (cn === "from" ? tables : rpcs).add(lit); }
        if (/^(eq|match|in|is|neq)$/.test(cn) && lit) eqCols.add(`${cn}:${lit}`);
        // Güvenlik/veri katmanından içe aktarılan fonksiyon çağrıları (servis, auth, supabase, kullanım izleme) — delegasyon da sözleşmedir.
        if (ts.isIdentifier(n.expression) && !GUARD_RE.test(cn) && SEC_IMPORT_RE.test(imports.get(cn) ?? "")) svcCalls.add(cn);
        idx++;
      }
      if (ts.isPropertyAssignment(n) && n.name.getText(sf) === "status" && ts.isNumericLiteral(n.initializer)) statuses.add(Number(n.initializer.text));
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /^AROMA_[A-Z0-9_]+$/.test(n.text)) codes.add(n.text);
      if (ts.isIdentifier(n) && /^(is_demo_account|isDemo|isDemoAccount)$/.test(n.text)) demo = true;
      ts.forEachChild(n, visit);
    };
    visit(body);
    methods[mname] = {
      guards: seq, modules: [...modules].sort(), guardBeforeData: firstData < 0 || (firstGuard >= 0 && firstGuard < firstData),
      demoGate: demo, tables: [...tables].sort(), rpcs: [...rpcs].sort(), scopeCalls: [...eqCols].sort(),
      statuses: [...statuses].sort((a, b) => a - b), codes: [...codes].sort(), svcCalls: [...svcCalls].sort(),
    };
  };
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) {
      // Dosya-içi yardımcılar da tablo/RPC/guard taşıyabilir → "_yardimci" altında toplanır.
      if (ts.isFunctionDeclaration(st) && st.name && st.body) handle(`_fn:${st.name.text}`, st.body);
      continue;
    }
    if (ts.isFunctionDeclaration(st) && st.name && st.body) handle(st.name.text, st.body);
    else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) {
      if (/^(GET|POST|PATCH|PUT|DELETE|dynamic|runtime|maxDuration|revalidate)$/.test(d.name.text)) {
        if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) handle(d.name.text, d.initializer);
        else methods[`const:${d.name.text}`] = d.initializer.getText(sf);
      }
    }
  }
  return methods;
}
/** Mantık parmak izi: üst düzey bildirim başına, yorum/boşluk yok, insan metni ⟨TXT⟩. */
function logicFingerprint(src: string, name: string) {
  const sf = parse(src, name);
  const norm = (n: import("typescript").Node): string => {
    // JSDoc düğümleri (yorum) getChildren()'da görünür → parmak izine GİRMEZ.
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return "";
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return isHumanText(n.text) ? "⟨TXT⟩" : JSON.stringify(n.text);
    if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) return isHumanText(n.text) ? "⟨TXT⟩" : JSON.stringify(n.text);
    if (n.getChildCount(sf) === 0) return n.getText(sf);
    return n.getChildren(sf).map(norm).join(" ");
  };
  const out: Record<string, string> = {};
  sf.statements.forEach((st, i) => {
    let label = `#${i}`;
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) && st.name) label = st.name.text;
    else if (ts.isVariableStatement(st)) label = st.declarationList.declarations.map((d) => d.name.getText(sf)).join(",");
    else if (ts.isImportDeclaration(st)) label = `import:${(st.moduleSpecifier as import("typescript").StringLiteral).text}`;
    else if (ts.isExportDeclaration(st)) label = `export#${i}`;
    if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) label = `type:${label}`;
    out[label] = sha(norm(st)).slice(0, 16);
  });
  return out;
}

main().then(() => {
  if (additiveWarningCount) note(`K3 collectSafetyWarnings: ${additiveWarningCount} uyarıda izinli additif alan (carrier/source_name) doğrulandı`);
  if (additiveResultCount) note(`K1 blend.*: ${additiveResultCount} sonuçta izinli additif alan (errorCode; dil-bağımsız kod; başarıda kod yok; sunucu kodu birebir yansır) doğrulandı`);
  console.log(`\n──────────── AROMATERAPİ KORUMA SÖZLEŞMESİ: ${pass} PASS / ${fail} FAIL / ${info} INFO ────────────`);
  if (fail > 0) { console.log("Başarısız:\n  - " + failures.slice(0, 60).join("\n  - ")); process.exit(1); }
}).catch((e) => { console.error(e); process.exit(1); });
