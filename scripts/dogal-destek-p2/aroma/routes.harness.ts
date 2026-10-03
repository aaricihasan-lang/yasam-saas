/**
 * DOĞAL DESTEK P2 — AROMATERAPİ ROUTE + DB HARNESS
 * (gerçek Next route handler'ları + gerçek aroma migration'lı yerel PostgreSQL; PRODUCTION'A SIFIR TEMAS).
 *
 * Kapsam:
 *   AROMA-3  yağ PATCH iyimser kilit (taze token 200 + yeni updated_at; eski token 409 ve DB yeni
 *            değeri korur; token yok 400; başka tenant 404).
 *   AROMA-4  takson / preparat / bilgi kaydı sahip silme RPC'leri + DELETE route'ları (200 + audit/
 *            tombstone; başka tenant 404; stale 409; referanslı 409 + sayılar; claim alt kayıt
 *            cascade; ilişki → 409; gerekçe yok 400; demo 403; RPC yok 503; yetkiler; claim audit
 *            CHECK'leri; YH CDC DELETE trigger'ı; migration idempotent).
 * Çalıştır: npx tsx scripts/dogal-destek-p2/aroma/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY } from "../../anamnez/testEnv";
import { startAromaEnv, readMig, NEW_MIGRATION, DELETE_RPCS } from "./env";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Auth = { id?: string; token?: string };
type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function main(): Promise<void> {
  const A = await startAromaEnv({ port: 54611, dirName: "dd-p2-aroma-routes-pgdata" });
  const { env, seed } = A;
  process.env.NEXT_PUBLIC_SUPABASE_URL = A.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  console.log(`embedded-postgres + PostgREST shim + RPC köprüsü hazır (${A.url}); ${A.migrationsApplied.length} gerçek aroma migration'ı uygulandı.`);

  const q = async (sql: string, args: unknown[] = []) => (await env.su.query(sql, args)).rows;
  const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];

  try {
    const oilRoute = await import("../../../app/api/aromaterapi/oils/[id]/route");
    const taxonRoute = await import("../../../app/api/aromaterapi/plant-taxa/[id]/route");
    const prepRoute = await import("../../../app/api/aromaterapi/preparations/[id]/route");
    const claimRoute = await import("../../../app/api/aromaterapi/claims/[id]/route");

    const U = seed.users;
    const TA = seed.TA;
    const TB = seed.TB;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };
    const asDemo: Auth = { id: U.DEMO.id, token: U.DEMO.token };

    async function call(handler: unknown, method: string, params: Record<string, string>, auth: Auth, body?: unknown) {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest("http://localhost/api/test", { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
      let json: Json = {};
      try { json = (await res.clone().json()) as Json; } catch { json = {}; }
      return { status: res.status, json };
    }
    /** PostgREST'in döndürdüğü biçimde updated_at (to_json → ISO, ±HH:MM). */
    const tokenOf = async (table: string, id: string) =>
      (await q1(`select to_json(updated_at) #>> '{}' as t from public.${table} where id = $1`, [id]))?.t as string;

    // ── 0. Migration / yetki ──────────────────────────────────────────────────
    section("0. Migration + yetkiler");
    for (const fn of DELETE_RPCS) {
      const sig = `public.${fn}(uuid,uuid,text,uuid,timestamptz,text)`;
      const p = await q1(
        `select has_function_privilege('service_role', $1, 'EXECUTE') as svc,
                has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') as auth,
                (select prosecdef from pg_proc where oid = $1::regprocedure) as secdef,
                (select array_to_string(proconfig, ',') from pg_proc where oid = $1::regprocedure) as cfg`,
        [sig],
      );
      ok(p.svc === true && p.anon === false && p.auth === false, `${fn}: service_role EXECUTE var; anon/authenticated YOK`, p);
      ok(p.secdef === true && String(p.cfg).includes("search_path=pg_catalog, public"), `${fn}: SECURITY DEFINER + sabit search_path`, p);
    }
    let idemOk = true;
    try { await env.su.query(readMig(NEW_MIGRATION)); } catch (e) { idemOk = false; console.error(e); }
    ok(idemOk, "migration ikinci kez uygulanabilir (idempotent)");
    const opDef = (await q1(`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'aromatherapy_claim_audit_events_operation_chk'`)).d as string;
    ok(/'delete'/.test(opDef) && /'create'/.test(opDef) && /'update'/.test(opDef), "claim audit operation CHECK create/update/delete", opDef);
    const trg = await q1(`select count(*)::int as n from pg_trigger where tgname = 'trg_aromatherapy_claim_audit_events_immutable' and not tgisinternal`);
    ok(trg.n === 1, "claim audit append-only immutable trigger yerinde");

    // ── 1. AROMA-3 yağ iyimser kilit ──────────────────────────────────────────
    section("1. AROMA-3 — yağ PATCH iyimser kilit");
    const oilA = (await q1(
      `insert into public.aromatherapy_oils (tenant_id, name, notes, category) values ($1,'ZZ Lavanta','ilk not','çiçek') returning id`, [TA],
    )).id as string;
    const g = await call(oilRoute.GET, "GET", { id: oilA }, asA);
    const tok0 = (g.json.oil as Json)?.updated_at as string;
    ok(g.status === 200 && typeof tok0 === "string" && /T.*[+-]\d\d:\d\d$/.test(tok0), "GET detay updated_at PostgREST biçiminde", { status: g.status, tok0 });
    // Sekme B: notları kaydeder (taze token).
    await sleep(5);
    const pB = await call(oilRoute.PATCH, "PATCH", { id: oilA }, asA, { name: "ZZ Lavanta", notes: "B sekmesi notu", category: "çiçek", expected_updated_at: tok0 });
    const tok1 = pB.json.updated_at as string;
    ok(pB.status === 200 && pB.json.ok === true && typeof tok1 === "string" && tok1 !== tok0, "taze token → 200 + YENİ updated_at döner", pB.json);
    // Sekme A (eski token): kategori kaydı → 409, B'nin notu korunur.
    const pA = await call(oilRoute.PATCH, "PATCH", { id: oilA }, asA, { name: "ZZ Lavanta", notes: "ilk not", category: "odunsu", expected_updated_at: tok0 });
    ok(pA.status === 409 && pA.json.error === "AROMA_STALE_OIL" && pA.json.stale === true, "eski token → 409 AROMA_STALE_OIL (stale:true)", pA.json);
    const rowAfter = await q1(`select notes, category from public.aromatherapy_oils where id = $1`, [oilA]);
    ok(rowAfter.notes === "B sekmesi notu" && rowAfter.category === "çiçek", "409 sonrası DB yeni değeri korur (B notu ezilmedi)", rowAfter);
    // Aynı sekme dönen token ile devam edebilir.
    await sleep(5);
    const pB2 = await call(oilRoute.PATCH, "PATCH", { id: oilA }, asA, { category: "odunsu", expected_updated_at: tok1 });
    ok(pB2.status === 200 && typeof pB2.json.updated_at === "string" && pB2.json.updated_at !== tok1, "dönen token ile aynı sekme tekrar kaydedebilir (200)", pB2.json);
    const tok2 = pB2.json.updated_at as string;
    ok(String((await tokenOf("aromatherapy_oils", oilA))) === tok2, "dönen updated_at DB değeriyle birebir");
    const pMissing = await call(oilRoute.PATCH, "PATCH", { id: oilA }, asA, { notes: "x" });
    ok(pMissing.status === 400 && pMissing.json.error === "AROMA_MISSING_VERSION", "token yok → 400 AROMA_MISSING_VERSION", pMissing.json);
    const pBad = await call(oilRoute.PATCH, "PATCH", { id: oilA }, asA, { notes: "x", expected_updated_at: "dün" });
    ok(pBad.status === 400 && pBad.json.error === "AROMA_INVALID_VERSION", "biçimsiz token → 400 (DB'ye gitmez)", pBad.json);
    const pOther = await call(oilRoute.PATCH, "PATCH", { id: oilA }, asB, { notes: "B tenant", expected_updated_at: tok2 });
    ok(pOther.status === 404, "tenant B, A'nın yağını PATCH edemez → 404", pOther);
    ok((await q1(`select notes from public.aromatherapy_oils where id = $1`, [oilA])).notes === "B sekmesi notu", "B tenant denemesi sonrası satır değişmedi");
    const pGhost = await call(oilRoute.PATCH, "PATCH", { id: randomUUID() }, asA, { notes: "x", expected_updated_at: tok2 });
    ok(pGhost.status === 404, "olmayan yağ → 404");
    const pNull = await call(oilRoute.PATCH, "PATCH", { id: oilA }, asA, null);
    ok(pNull.status === 400, "null gövde → 400 (500 değil)", pNull);

    // ── Tohum: katalog + bilgi kaydı ─────────────────────────────────────────
    const mkTaxon = async (tenant: string, genus: string, species: string) =>
      (await q1(`insert into public.aromatherapy_plant_taxa (tenant_id, genus, species, taxon_rank, family) values ($1,$2,$3,'species','Lamiaceae') returning id`, [tenant, genus, species])).id as string;
    const mkPrep = async (tenant: string, taxon: string, type = "essential_oil", part = "flower") =>
      (await q1(`insert into public.aromatherapy_preparations (tenant_id, taxon_id, preparation_type, plant_part) values ($1,$2,$3,$4) returning id`, [tenant, taxon, type, part])).id as string;
    const mkClaim = async (tenant: string, prep: string, conclusion: string) =>
      (await q1(
        `insert into public.aromatherapy_claims (tenant_id, preparation_id, claim_type, conclusion, conclusion_provenance, evidence_layer, rationale_status)
         values ($1,$2,'use',$3,'source_original','traditional','source_gives_no_rationale') returning id`, [tenant, prep, conclusion],
      )).id as string;
    const del = (route: { DELETE: unknown }, id: string, auth: Auth, body: unknown) => call(route.DELETE, "DELETE", { id }, auth, body);

    // ── 2. AROMA-4 — takson ──────────────────────────────────────────────────
    section("2. AROMA-4 — bitki (takson) silme");
    const taxFree = await mkTaxon(TA, "Zzfree", "alpha");
    const taxUsed = await mkTaxon(TA, "Zzused", "beta");
    await mkPrep(TA, taxUsed); // taxUsed'i referanslı yapar
    const taxB = await mkTaxon(TB, "Zzbtenant", "gamma");
    let t = await tokenOf("aromatherapy_plant_taxa", taxFree);

    let r = await del(taxonRoute, taxFree, asB, { expected_updated_at: t, reason: "B dener" });
    ok(r.status === 404 && r.json.code === "AROMA_TAXON_NOT_FOUND", "başka tenant → 404 AROMA_TAXON_NOT_FOUND", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_plant_taxa where id = $1`, [taxFree])).n === 1, "başka tenant denemesi sonrası satır duruyor");
    r = await del(taxonRoute, taxFree, asA, { expected_updated_at: t });
    ok(r.status === 400 && r.json.code === "AROMA_WRITE_REASON_INVALID", "gerekçe yok → 400", r.json);
    r = await del(taxonRoute, taxFree, asA, { expected_updated_at: t, reason: "   " });
    ok(r.status === 400, "boş gerekçe → 400");
    r = await del(taxonRoute, taxFree, asA, { reason: "x" });
    ok(r.status === 400 && r.json.code === "AROMA_WRITE_INVALID_TIMESTAMP", "token yok → 400", r.json);
    r = await del(taxonRoute, taxFree, asA, { expected_updated_at: t, reason: "x", tenant_id: TB });
    ok(r.status === 400 && r.json.code === "AROMA_WRITE_FORBIDDEN_FIELD", "allowlist dışı anahtar (tenant_id) → 400", r.json);
    r = await del(taxonRoute, "not-a-uuid", asA, { expected_updated_at: t, reason: "x" });
    ok(r.status === 400 && r.json.code === "AROMA_WRITE_INVALID_UUID", "geçersiz UUID → 400", r.json);
    r = await del(taxonRoute, taxFree, asDemo, { expected_updated_at: t, reason: "demo" });
    ok(r.status === 403 && r.json.code === "AROMA_WRITE_DEMO_FORBIDDEN", "demo hesap → 403", r.json);
    r = await del(taxonRoute, taxFree, {}, { expected_updated_at: t, reason: "anon" });
    ok(r.status === 401 || r.status === 403, "kimliksiz → 401/403", r.status);
    // Stale: satır bu arada güncellendi.
    await env.su.query(`update public.aromatherapy_plant_taxa set primary_common_name_tr = 'Güncel' where id = $1`, [taxFree]);
    r = await del(taxonRoute, taxFree, asA, { expected_updated_at: t, reason: "eski sürüm" });
    ok(r.status === 409 && r.json.code === "AROMA_STALE" && r.json.stale === true, "eski sürüm → 409 AROMA_STALE", r.json);
    t = await tokenOf("aromatherapy_plant_taxa", taxFree);
    // Referanslı takson.
    const tu = await tokenOf("aromatherapy_plant_taxa", taxUsed);
    r = await del(taxonRoute, taxUsed, asA, { expected_updated_at: tu, reason: "kullanılan" });
    ok(r.status === 409 && r.json.code === "AROMA_TAXON_REFERENCED" && (r.json.references as Json)?.preparations === 1, "preparata bağlı takson → 409 + references.preparations=1", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_plant_taxa where id = $1`, [taxUsed])).n === 1, "referanslı takson silinmedi");
    ok(!JSON.stringify(r.json).includes("DETAIL") && !JSON.stringify(r.json).includes("violates"), "ham DB metni yanıtta yok");
    // RPC henüz uygulanmamış.
    A.bridge.missingRpc.add("aromatherapy_delete_plant_taxon_with_audit");
    r = await del(taxonRoute, taxFree, asA, { expected_updated_at: t, reason: "rpc yok" });
    A.bridge.missingRpc.clear();
    ok(r.status === 503 && r.json.code === "AROMA_DELETE_UNAVAILABLE", "RPC yok (PGRST202) → 503 AROMA_DELETE_UNAVAILABLE", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_plant_taxa where id = $1`, [taxFree])).n === 1, "RPC yokken veri etkilenmedi");
    // Sahip silmesi.
    r = await del(taxonRoute, taxFree, asA, { expected_updated_at: t, reason: "  yanlış kayıt  " });
    ok(r.status === 200 && r.json.ok === true && r.json.deleted === true && r.json.entity_id === taxFree, "sahip silmesi → 200", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_plant_taxa where id = $1`, [taxFree])).n === 0, "takson satırı silindi");
    const aud = await q1(`select * from public.aromatherapy_content_audit_events where entity_id = $1`, [taxFree]);
    ok(aud?.entity_type === "plant_taxon" && aud?.operation === "delete" && aud?.reason === "yanlış kayıt" && aud?.tenant_id === TA && aud?.actor_user_id === U.A.id
      && /^[0-9a-f]{64}$/.test(aud?.previous_content_hash) && aud?.previous_summary?.canonical_name === "Zzfree alpha" && aud?.new_summary === null,
      "content audit 'delete' (bounded özet + sha256, gerekçe trim)", aud);
    const tomb = await q1(`select * from public.aromatherapy_content_delete_tombstones where entity_id = $1`, [taxFree]);
    ok(tomb?.entity_type === "plant_taxon" && tomb?.deletion_mode === "single" && tomb?.content_hash === aud?.previous_content_hash && tomb?.identity_summary?.canonical_name === "Zzfree alpha",
      "tombstone 'single' + aynı hash", tomb);
    r = await del(taxonRoute, taxFree, asA, { expected_updated_at: t, reason: "ikinci" });
    ok(r.status === 404, "silinmiş kayda tekrar → 404");
    ok((await q1(`select count(*)::int as n from public.aromatherapy_plant_taxa where id = $1`, [taxB])).n === 1, "tenant B taksonu etkilenmedi");
    if (A.cdcApplied) {
      await env.su.query(`select public.yh_source_activation_set('aromaterapi:plant-taxa', true)`);
      const taxCdc = await mkTaxon(TA, "Zzcdc", "delta");
      const tc = await tokenOf("aromatherapy_plant_taxa", taxCdc);
      r = await del(taxonRoute, taxCdc, asA, { expected_updated_at: tc, reason: "cdc" });
      const ob = await q1(`select operation, tenant_id from public.yasam_hafizasi_outbox where source_key = 'aromaterapi:plant-taxa' and source_id = $1`, [taxCdc]);
      ok(r.status === 200 && ob?.operation === "delete" && ob?.tenant_id === TA, "YH CDC trigger'ı DELETE'te çalışır ('delete' olayı, OLD tenant)", { r: r.json, ob });
      await env.su.query(`select public.yh_source_deactivate('aromaterapi:plant-taxa')`);
    } else {
      ok(false, "YH CDC test şeması kurulamadı (bkz. uyarı)");
    }

    // ── 3. AROMA-4 — preparat ────────────────────────────────────────────────
    section("3. AROMA-4 — preparat silme");
    const taxP = await mkTaxon(TA, "Zzprep", "epsilon");
    const prepFree = await mkPrep(TA, taxP, "hydrosol", "leaf");
    const prepClaim = await mkPrep(TA, taxP, "essential_oil", "leaf");
    const prepMethod = await mkPrep(TA, taxP, "tincture", "leaf");
    await mkClaim(TA, prepClaim, "Preparat referans claim");
    await env.su.query(`insert into public.aromatherapy_preparation_method_series (tenant_id, preparation_id, method_kind, method_lang) values ($1,$2,'expert','tr')`, [TA, prepMethod]);
    let tp = await tokenOf("aromatherapy_preparations", prepClaim);
    r = await del(prepRoute, prepClaim, asA, { expected_updated_at: tp, reason: "claim var" });
    ok(r.status === 409 && r.json.code === "AROMA_PREPARATION_REFERENCED" && (r.json.references as Json)?.claims === 1 && (r.json.references as Json)?.method_series === 0,
      "bilgi kaydı bağlı preparat → 409 {claims:1, method_series:0}", r.json);
    tp = await tokenOf("aromatherapy_preparations", prepMethod);
    r = await del(prepRoute, prepMethod, asA, { expected_updated_at: tp, reason: "yöntem var" });
    ok(r.status === 409 && (r.json.references as Json)?.claims === 0 && (r.json.references as Json)?.method_series === 1,
      "üretim yöntemi bağlı preparat → 409 {claims:0, method_series:1}", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_preparations where id = any($1::uuid[])`, [[prepClaim, prepMethod]])).n === 2, "referanslı preparatlar silinmedi");
    tp = await tokenOf("aromatherapy_preparations", prepFree);
    r = await del(prepRoute, prepFree, asB, { expected_updated_at: tp, reason: "B" });
    ok(r.status === 404 && r.json.code === "AROMA_PREPARATION_NOT_FOUND", "başka tenant → 404", r.json);
    r = await del(prepRoute, prepFree, asDemo, { expected_updated_at: tp, reason: "demo" });
    ok(r.status === 403, "demo → 403");
    r = await del(prepRoute, prepFree, asA, { expected_updated_at: tp });
    ok(r.status === 400, "gerekçe yok → 400");
    await env.su.query(`update public.aromatherapy_preparations set status = 'verified' where id = $1`, [prepFree]);
    r = await del(prepRoute, prepFree, asA, { expected_updated_at: tp, reason: "stale" });
    ok(r.status === 409 && r.json.code === "AROMA_STALE", "eski sürüm → 409 AROMA_STALE", r.json);
    tp = await tokenOf("aromatherapy_preparations", prepFree);
    r = await del(prepRoute, prepFree, asA, { expected_updated_at: tp, reason: "gereksiz preparat" });
    ok(r.status === 200 && r.json.deleted === true, "sahip silmesi → 200", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_preparations where id = $1`, [prepFree])).n === 0, "preparat satırı silindi");
    const audP = await q1(`select * from public.aromatherapy_content_audit_events where entity_id = $1 and operation = 'delete'`, [prepFree]);
    const tombP = await q1(`select * from public.aromatherapy_content_delete_tombstones where entity_id = $1`, [prepFree]);
    ok(audP?.entity_type === "preparation" && audP?.previous_summary?.preparation_type === "hydrosol" && tombP?.entity_type === "preparation" && tombP?.content_hash === audP?.previous_content_hash,
      "preparat audit 'delete' + tombstone", { audP, tombP });
    // Takson artık hâlâ referanslı (2 preparat) → sayı doğru.
    const tt = await tokenOf("aromatherapy_plant_taxa", taxP);
    r = await del(taxonRoute, taxP, asA, { expected_updated_at: tt, reason: "x" });
    ok(r.status === 409 && (r.json.references as Json)?.preparations === 2, "takson referans sayısı güncel (2)", r.json);

    // ── 4. AROMA-4 — bilgi kaydı (claim) ─────────────────────────────────────
    section("4. AROMA-4 — bilgi kaydı (claim) silme");
    const taxC = await mkTaxon(TA, "Zzclaim", "zeta");
    const prepC = await mkPrep(TA, taxC);
    const cMain = await mkClaim(TA, prepC, "Ana kayıt (alt kayıtlı)");
    const cX = await mkClaim(TA, prepC, "İlişkili kayıt X");
    const cY = await mkClaim(TA, prepC, "İlişkili kayıt Y");
    const src = (await q1(`insert into public.aromatherapy_sources (tenant_id, source_type, title) values ($1,'book','ZZ Kaynak') returning id`, [TA])).id as string;
    const pas = (await q1(
      `insert into public.aromatherapy_source_passages (tenant_id, source_id, locator_label, original_lang, passage_kind, original_text, content_hash, rights_status)
       values ($1,$2,'s.12','tr','excerpt','Alıntı metni',$3,'unknown') returning id`, [TA, src, "a".repeat(64)],
    )).id as string;
    await env.su.query(`insert into public.aromatherapy_claim_routes (tenant_id, claim_id, route_code) values ($1,$2,'topical'),($1,$2,'inhalation')`, [TA, cMain]);
    await env.su.query(`insert into public.aromatherapy_claim_populations (tenant_id, claim_id, population_code) values ($1,$2,'adult')`, [TA, cMain]);
    await env.su.query(`insert into public.aromatherapy_claim_sources (tenant_id, claim_id, source_id, source_role) values ($1,$2,$3,'primary_support')`, [TA, cMain, src]);
    await env.su.query(`insert into public.aromatherapy_claim_passages (tenant_id, claim_id, passage_id, passage_kind, evidence_relation) values ($1,$2,$3,'excerpt','supports')`, [TA, cMain, pas]);
    const [a, b] = [cX, cY].sort();
    await env.su.query(`insert into public.aromatherapy_claim_relations (tenant_id, a_claim_id, b_claim_id, relation_type, explanation_tr) values ($1,$2,$3,'complementary','editöryal')`, [TA, a, b]);

    let tc = await tokenOf("aromatherapy_claims", cX);
    r = await del(claimRoute, cX, asA, { expected_updated_at: tc, reason: "ilişkili" });
    ok(r.status === 409 && r.json.code === "AROMA_CLAIM_REFERENCED" && (r.json.references as Json)?.relations === 1, "başka kayıtla ilişkili claim → 409 {relations:1}", r.json);
    tc = await tokenOf("aromatherapy_claims", cY);
    r = await del(claimRoute, cY, asA, { expected_updated_at: tc, reason: "ilişkili (diğer uç)" });
    ok(r.status === 409 && r.json.code === "AROMA_CLAIM_REFERENCED", "ilişkinin diğer ucu da → 409 (simetrik)", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_claim_relations where tenant_id = $1`, [TA])).n === 1, "ilişki satırı korunuyor (sessiz cascade YOK)");
    tc = await tokenOf("aromatherapy_claims", cMain);
    r = await del(claimRoute, cMain, asB, { expected_updated_at: tc, reason: "B" });
    ok(r.status === 404 && r.json.code === "AROMA_CLAIM_NOT_FOUND", "başka tenant → 404", r.json);
    r = await del(claimRoute, cMain, asDemo, { expected_updated_at: tc, reason: "demo" });
    ok(r.status === 403 && r.json.code === "AROMA_WRITE_DEMO_FORBIDDEN", "demo → 403", r.json);
    r = await del(claimRoute, cMain, asA, { expected_updated_at: tc, reason: "" });
    ok(r.status === 400, "boş gerekçe → 400");
    await env.su.query(`update public.aromatherapy_claims set status = 'under_review' where id = $1`, [cMain]);
    r = await del(claimRoute, cMain, asA, { expected_updated_at: tc, reason: "stale" });
    ok(r.status === 409 && r.json.code === "AROMA_STALE", "eski sürüm → 409 AROMA_STALE", r.json);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_claims where id = $1`, [cMain])).n === 1, "ret durumlarında claim duruyor");
    tc = await tokenOf("aromatherapy_claims", cMain);
    r = await del(claimRoute, cMain, asA, { expected_updated_at: tc, reason: "mükerrer kayıt" });
    ok(r.status === 200 && r.json.deleted === true, "sahip silmesi → 200", r.json);
    const left = await q1(
      `select (select count(*) from public.aromatherapy_claims where id = $1)::int as c,
              (select count(*) from public.aromatherapy_claim_routes where claim_id = $1)::int as r,
              (select count(*) from public.aromatherapy_claim_populations where claim_id = $1)::int as p,
              (select count(*) from public.aromatherapy_claim_sources where claim_id = $1)::int as s,
              (select count(*) from public.aromatherapy_claim_passages where claim_id = $1)::int as g`, [cMain],
    );
    ok(left.c === 0 && left.r === 0 && left.p === 0 && left.s === 0 && left.g === 0, "claim + kendi alt kayıtları (rota/popülasyon/kaynak/pasaj) cascade silindi", left);
    ok((await q1(`select count(*)::int as n from public.aromatherapy_sources where id = $1`, [src])).n === 1
      && (await q1(`select count(*)::int as n from public.aromatherapy_source_passages where id = $1`, [pas])).n === 1, "paylaşılan kaynak/pasaj satırları korunur");
    ok((await q1(`select count(*)::int as n from public.aromatherapy_claims where id = any($1::uuid[])`, [[cX, cY]])).n === 2, "diğer claim'ler etkilenmedi");
    const ca = await q1(`select * from public.aromatherapy_claim_audit_events where claim_id = $1`, [cMain]);
    ok(ca?.operation === "delete" && ca?.reason === "mükerrer kayıt" && ca?.new_state?.deleted === true
      && ca?.previous_state?.claim?.conclusion === "Ana kayıt (alt kayıtlı)" && ca?.previous_state?.routes?.length === 2
      && ca?.previous_state?.sources?.length === 1 && ca?.previous_state?.passages?.length === 1 && ca?.actor_user_id === U.A.id,
      "claim audit 'delete' (silme öncesi tam snapshot + new_state {deleted:true})", ca);

    // ── 5. Claim audit CHECK'leri hâlâ zorlanıyor ────────────────────────────
    section("5. Claim audit CHECK sözleşmesi");
    const tryIns = async (op: string, prev: unknown, reason: string | null, nw: unknown) => {
      try {
        await env.su.query(
          `insert into public.aromatherapy_claim_audit_events (tenant_id, claim_id, actor_user_id, actor_label_snapshot, operation, reason, previous_state, new_state)
           values ($1,$2,$3,'ZZ',$4,$5,$6,$7)`, [TA, randomUUID(), U.A.id, op, reason, prev === null ? null : JSON.stringify(prev), JSON.stringify(nw)],
        );
        return "ok";
      } catch (e) { return (e as { code?: string }).code ?? "err"; }
    };
    ok(await tryIns("create", null, null, { a: 1 }) === "ok", "create (prev NULL) kabul");
    ok(await tryIns("create", { x: 1 }, null, { a: 1 }) === "23514", "create + prev dolu → CHECK ihlali");
    ok(await tryIns("update", { x: 1 }, null, { a: 1 }) === "23514", "update + gerekçe yok → CHECK ihlali");
    ok(await tryIns("update", { x: 1 }, "neden", { a: 1 }) === "ok", "update (prev + gerekçe) kabul");
    ok(await tryIns("delete", { x: 1 }, "neden", { deleted: true }) === "ok", "delete (prev + gerekçe + {deleted:true}) kabul");
    ok(await tryIns("delete", null, "neden", { deleted: true }) === "23514", "delete + prev NULL → CHECK ihlali");
    ok(await tryIns("delete", { x: 1 }, null, { deleted: true }) === "23514", "delete + gerekçe yok → CHECK ihlali");
    ok(await tryIns("delete", { x: 1 }, "neden", { a: 1 }) === "23514", "delete + new_state farklı → CHECK ihlali");
    ok(await tryIns("purge", { x: 1 }, "neden", { deleted: true }) === "23514", "bilinmeyen operation → CHECK ihlali");
    let immut = "";
    try { await env.su.query(`update public.aromatherapy_claim_audit_events set reason = 'x' where claim_id = $1`, [cMain]); }
    catch (e) { immut = (e as Error).message; }
    ok(immut.includes("AROMA_AUDIT_IMMUTABLE"), "claim audit satırı değiştirilemez (append-only)", immut);
    let svcIns = "";
    try {
      await env.su.query("set role service_role");
      await env.su.query(`insert into public.aromatherapy_claim_audit_events (tenant_id, claim_id, actor_user_id, actor_label_snapshot, operation, reason, previous_state, new_state) values ($1,$2,$3,'x','delete','x','{}','{"deleted":true}')`, [TA, randomUUID(), U.A.id]);
      svcIns = "ok";
    } catch (e) { svcIns = (e as { code?: string }).code ?? "err"; }
    finally { await env.su.query("reset role"); }
    ok(svcIns === "42501", "service_role claim audit'e doğrudan INSERT edemez (yalnız RPC)", svcIns);
    let svcDel = "";
    try {
      await env.su.query("set role service_role");
      await env.su.query(`delete from public.aromatherapy_plant_taxa where id = $1`, [taxUsed]);
      svcDel = "ok";
    } catch (e) { svcDel = (e as { code?: string }).code ?? "err"; }
    finally { await env.su.query("reset role"); }
    ok(svcDel === "42501", "service_role takson tablosunda doğrudan DELETE yetkisi yok (write-gate korunur)", svcDel);
    let anonExec = "";
    try {
      await env.su.query("set role anon");
      await env.su.query(`select public.aromatherapy_delete_claim_with_audit($1,$2,'x',$3,now(),'x')`, [TA, U.A.id, cX]);
      anonExec = "ok";
    } catch (e) { anonExec = (e as { code?: string }).code ?? "err"; }
    finally { await env.su.query("reset role"); }
    ok(anonExec === "42501", "anon rolü silme RPC'sini çalıştıramaz (42501)", anonExec);
  } finally {
    await A.stop();
  }

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error("Başarısız:", failures);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
