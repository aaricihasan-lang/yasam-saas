/**
 * Doğaltaş Kütüphanesi F1 — VERİTABANI + GÜVENLİK TEMELİ testi.
 * İzole embedded-postgres + PostgREST shim + migration 20271201000000 + GERÇEK uzman route'ları.
 * Prod/Preview'a SIFIR temas. Tüm taş/kaynak verisi SENTETİK (ZZ_*); lisanslı sağlayıcı içeriği YOK.
 * Dış ağ (Roxy dahil) kilitli: her dış fetch reddedilir ve sayılır (beklenen 0).
 * Çalıştır: npx tsx scripts/stone-library/f1-harness.ts   (STONE_LIBRARY_PG_PORT, varsayılan 54571)
 */
import "../hd-analysis-word-flow/env"; // server-only stub + sahte sağlayıcı anahtarı (gerçek anahtar ASLA)
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { foldStoneLibraryText } from "../../lib/stone-library/fold";
import { findStoneLibraryLeaks, parseStoneLibrarySearch, toExpertStoneDoc } from "../../lib/stone-library/expertDto";
import { STONE_LIBRARY_HEALTH_NOTICE_TR } from "../../lib/stone-library/contract";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

const MIGRATION_FILE = "20271201000000_stone_library_core.sql";
const MIGRATION = readFileSync(path.join(process.cwd(), "supabase/migrations", MIGRATION_FILE), "utf8");

// Mevcut Doğaltaş / danışan / stok tablolarının minimal kopyası (migration'ın bunlara DOKUNMADIĞI kanıtlanır).
const LEGACY_SQL = `
create table public.stones (id uuid primary key, tenant_id uuid, stone_name text, chakras jsonb, assignments jsonb, entries_text text);
create table public.stone_sources (id uuid primary key, tenant_id uuid, stone_id uuid references public.stones(id), source_name text);
create table public.stone_entries (id uuid primary key, tenant_id uuid, stone_id uuid references public.stones(id), field_key text, content text);
create table public.minerals (id uuid primary key, tenant_id uuid, name text);
create table public.combinations (id uuid primary key, tenant_id uuid, issue text, stones_text text);
create table public.client_stones (id uuid primary key, tenant_id uuid, stone_name text);
create table public.dogaltas_inventory (id uuid primary key, tenant_id uuid, name text, adet int);
create table public.yasam_hafizasi_index (id uuid primary key, tenant_id uuid, title text);
create table public.yasam_hafizasi_flags (tenant_id uuid primary key, flags jsonb);
create or replace function public.zz_legacy_touch() returns trigger language plpgsql as $f$ begin return new; end $f$;
create trigger zz_legacy_trg before update on public.stones for each row execute function public.zz_legacy_touch();
insert into public.stones values ('00000000-0000-4000-8000-0000000000b1', null, 'ZZ AMETİST', '["Taç Çakra"]', '{"Burçlar":[["Balık"]]}', 'Genel / Kaynak: ZZ / metin');
insert into public.stone_sources values ('00000000-0000-4000-8000-0000000000b2', null, '00000000-0000-4000-8000-0000000000b1', 'ZZ Kitap');
insert into public.stone_entries values ('00000000-0000-4000-8000-0000000000b3', null, '00000000-0000-4000-8000-0000000000b1', 'general_info', 'ZZ eski metin');
insert into public.minerals values ('00000000-0000-4000-8000-0000000000b4', null, 'ZZ SİLİSYUM');
insert into public.combinations values ('00000000-0000-4000-8000-0000000000b5', null, 'ZZ Uyku', 'ZZ AMETİST');
insert into public.client_stones values ('00000000-0000-4000-8000-0000000000b6', null, 'ZZ AMETİST');
insert into public.dogaltas_inventory values ('00000000-0000-4000-8000-0000000000b7', null, 'ZZ AMETİST', 3);
insert into public.yasam_hafizasi_index values ('00000000-0000-4000-8000-0000000000b8', null, 'ZZ');
insert into public.yasam_hafizasi_flags values ('00000000-0000-4000-8000-0000000000b9', '{"yh_enabled":false}');
`;
const LEGACY_TABLES = ["users", "user_sessions", "tenants", "clients", "client_notes", "stones", "stone_sources", "stone_entries", "minerals",
  "combinations", "client_stones", "dogaltas_inventory", "yasam_hafizasi_index", "yasam_hafizasi_flags"];

const TABLES = ["stone_library_settings", "stone_library_sources", "stone_library_source_documents", "stone_library_vocab",
  "stone_library_stones", "stone_library_names", "stone_library_external_ids", "stone_library_import_batches",
  "stone_library_import_events", "stone_library_raw", "stone_library_records", "stone_library_facets", "stone_library_reviews",
  "stone_library_history", "stone_library_delete_ops", "stone_library_access_grants", "stone_library_published"];

const EXPERT_RPCS = ["stone_library_viewer_allowed", "stone_library_expert_search", "stone_library_expert_stone"];
const OWNER_RPCS = ["stone_library_source_save", "stone_library_document_add", "stone_library_stone_save", "stone_library_stone_set_status",
  "stone_library_name_add", "stone_library_external_id_link", "stone_library_record_add", "stone_library_record_set_current",
  "stone_library_facet_add", "stone_library_review", "stone_library_settings_save", "stone_library_delete", "stone_library_restore",
  "stone_library_batch_open", "stone_library_batch_set_status", "stone_library_batch_reserve_call", "stone_library_batch_log",
  "stone_library_batch_quota", "stone_library_raw_put", "stone_library_batch_rollback", "stone_library_grant_access",
  "stone_library_revoke_access", "stone_library_owner_stone", "stone_library_owner_overview"];
const INTERNAL_FNS = ["stone_library_refresh_stone", "stone_library_refresh_all", "stone_library_refresh_with_dependents",
  "stone_library_actor_is_owner", "stone_library_assert_owner", "stone_library_soft_delete_rows", "stone_library_user_eligible",
  "stone_library_assert_batch_writable", "stone_library_assert_name_free", "stone_library_review_log", "stone_library_source_label"];

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; cache: string | null };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(h: Handler, auth: { id?: string; token?: string } | null, o: { query?: string; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (auth?.id) headers["x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  const req = new NextRequest(`http://localhost/api/dogaltas/kutuphane${o.query ?? ""}`, { method: "GET", headers });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const body = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(body) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body, json, cache: res.headers.get("cache-control") };
}

async function main() {
  const external: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;

  const dirName = `stone-library-f1-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const env: TestEnv = await startAnamnezTestEnv({
    port: Number(process.env.STONE_LIBRARY_PG_PORT ?? 54571), dirName, rpcAllow: [...EXPERT_RPCS, ...OWNER_RPCS, ...INTERNAL_FNS], extraSql: [LEGACY_SQL],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  delete process.env.STONE_LIBRARY_ENABLED; // varsayılan KAPALI
  const su = env.su;
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => (await su.query(sql, params)).rows as T[];
  const one = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const r = await su.query(sql, params);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    return row ? Object.values(row)[0] : undefined;
  };
  const errCode = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try { await su.query(sql, params); return null; } catch (e) { return (e as { code?: string }).code ?? "?"; }
  };
  const hashTables = async (tables: string[]) => {
    const out: Record<string, string> = {};
    for (const t of tables) {
      const rows = await q(`select to_jsonb(x) j from public.${t} x order by 1::text`);
      out[t] = createHash("sha256").update(JSON.stringify(rows.map((r) => r.j).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest("hex");
    }
    return out;
  };
  const objectInventory = async () => {
    const rels = await q<{ n: string }>(`select c.relkind::text || ':' || c.relname n from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='public' and not exists (select 1 from pg_depend d where d.objid=c.oid and d.deptype='e') order by 1`);
    const procs = await q<{ n: string }>(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' n from pg_proc p join pg_namespace s on s.oid=p.pronamespace
      where s.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by 1`);
    const trigs = await q<{ n: string }>(`select c.relname || '.' || t.tgname n from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal order by 1`);
    const pols = await q<{ n: string }>(`select tablename || '.' || policyname n from pg_policies order by 1`);
    const privs = await q<{ n: string }>(`select table_name || ':' || grantee || ':' || privilege_type n from information_schema.role_table_grants where table_schema='public' order by 1`);
    return { rels: rels.map((r) => r.n), procs: procs.map((r) => r.n), trigs: trigs.map((r) => r.n), pols: pols.map((r) => r.n), privs: privs.map((r) => r.n) };
  };

  try {
    // ── 1) Bağımsızlık: migration mevcut tabloları / nesneleri DEĞİŞTİRMEZ ─────────────────────
    section("1. Bağımsızlık ve mevcut veri korunumu");
    const before = await hashTables(LEGACY_TABLES);
    const invBefore = await objectInventory();
    await su.query(MIGRATION);
    await su.query(MIGRATION); // idempotent ikinci uygulama
    const after = await hashTables(LEGACY_TABLES);
    const invAfter = await objectInventory();
    ok(JSON.stringify(before) === JSON.stringify(after), "mevcut 14 tablonun içerik hash'i birebir aynı (2 kez uygulama sonrası)");
    const isNew = (n: string) => /stone_library_/.test(n);
    const removed = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
    ok(removed(invBefore.rels, invAfter.rels).length === 0, "silinen/yeniden adlanan ilişki yok");
    ok(removed(invAfter.rels, invBefore.rels).every(isNew), "eklenen her ilişki stone_library_* ad alanında", removed(invAfter.rels, invBefore.rels).filter((x) => !isNew(x)));
    ok(removed(invBefore.procs, invAfter.procs).length === 0, "mevcut fonksiyon silinmedi/değişmedi (imza)");
    ok(removed(invAfter.procs, invBefore.procs).every(isNew), "eklenen her fonksiyon stone_library_*", removed(invAfter.procs, invBefore.procs).filter((x) => !isNew(x)));
    ok(removed(invBefore.trigs, invAfter.trigs).length === 0 && removed(invAfter.trigs, invBefore.trigs).every(isNew), "tetikleyiciler: yalnız stone_library_* tablolarına eklendi");
    ok(removed(invBefore.privs, invAfter.privs).length === 0, "mevcut tablo ayrıcalıkları değişmedi");
    ok(JSON.stringify(invBefore.pols) === JSON.stringify(invAfter.pols), "mevcut RLS policy'leri değişmedi (yeni policy de yok)");
    const fks = await q<{ n: string }>(`select conrelid::regclass::text || '->' || confrelid::regclass::text n from pg_constraint where contype='f' and conrelid::regclass::text like 'stone_library_%'`);
    ok(fks.every((r) => /->(stone_library_|users$)/.test(r.n)), "yeni tabloların FK'leri yalnız stone_library_* ve users'a", fks.filter((r) => !/->(stone_library_|users$)/.test(r.n)));
    ok(!fks.some((r) => /->(stones|stone_sources|stone_entries|minerals|combinations|client_stones|dogaltas_inventory)$/.test(r.n)), "mevcut Doğaltaş/danışan/stok tablolarına FK YOK");

    // ── 2) RLS + ayrıcalık kilidi ──────────────────────────────────────────────────────────────
    section("2. RLS ve doğrudan tablo erişimi");
    const rls = await q<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname = any($1)`, [TABLES]);
    ok(rls.length === 17 && rls.every((r) => r.relrowsecurity), "17 tablonun hepsinde RLS AÇIK", rls.filter((r) => !r.relrowsecurity));
    ok(invAfter.pols.filter((p) => p.startsWith("stone_library")).length === 0, "stone_library_* tablolarında policy YOK (varsayılan red)");
    const privRows = await q<{ t: string; r: string; p: boolean }>(
      `select t, r, has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') p
         from unnest($1::text[]) t, unnest(array['anon','authenticated','service_role']) r`, [TABLES]);
    ok(privRows.every((r) => !r.p), "anon / authenticated / service_role: 17 tabloda HİÇBİR ayrıcalık yok (SELECT dahil)", privRows.filter((r) => r.p));
    // Gerçek HTTP (PostgREST shim = service_role) üzerinden doğrudan tablo okuma/yazma
    for (const t of ["stone_library_sources", "stone_library_raw", "stone_library_published", "stone_library_access_grants"]) {
      const g = await realFetch(`${env.url}/rest/v1/${t}?select=*`, { headers: { apikey: SERVICE_KEY } });
      ok(g.status === 403, `service_role REST GET ${t} → 403 (izin yok)`, g.status);
    }
    const ins = await realFetch(`${env.url}/rest/v1/stone_library_stones`, { method: "POST", headers: { apikey: SERVICE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ slug: "zz-sizinti", name_tr: "ZZ Sızıntı" }) });
    ok(ins.status === 403, "service_role REST INSERT stone_library_stones → 403", ins.status);
    const fnPriv = await q<{ f: string; r: string; p: boolean }>(
      `select p.oid::regprocedure::text f, r, has_function_privilege(r, p.oid, 'EXECUTE') p
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace, unnest(array['anon','authenticated','service_role']) r
        where n.nspname='public' and p.proname like 'stone\\_library\\_%' and p.proname <> 'stone_library_fold'`);
    ok(fnPriv.filter((x) => x.r !== "service_role").every((x) => !x.p), "anon / authenticated hiçbir stone_library RPC'sini çalıştıramaz");
    const svc = (name: string) => fnPriv.filter((x) => x.r === "service_role" && x.f.startsWith(`stone_library_${name.replace(/^stone_library_/, "")}(`));
    ok([...EXPERT_RPCS, ...OWNER_RPCS].every((n) => svc(n).length === 1 && svc(n)[0].p), "service_role: yalnız sözleşmedeki RPC'ler çalıştırılabilir");
    ok(INTERNAL_FNS.every((n) => svc(n).every((x) => !x.p)), "service_role: iç yardımcılar (refresh / owner kontrolü / silme) çalıştırılamaz", INTERNAL_FNS.filter((n) => svc(n).some((x) => x.p)));
    const viaShim = await realFetch(`${env.url}/rest/v1/rpc/stone_library_refresh_all`, { method: "POST", headers: { apikey: SERVICE_KEY, "content-type": "application/json" }, body: "{}" });
    ok(viaShim.status >= 400, "service_role REST rpc/stone_library_refresh_all → reddedildi", viaShim.status);

    // ── 3) Kullanıcılar (sentetik) ─────────────────────────────────────────────────────────────
    const T = [randomUUID(), randomUUID(), randomUUID()];
    for (const [i, t] of T.entries()) await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [t, `ZZ_SL_T${i}`]);
    let seq = 0;
    const mk = async (label: string, o: { role?: string; tenant?: string; active?: boolean; approval?: string; stones?: boolean; pkg?: string; demo?: boolean; superAdmin?: boolean } = {}): Promise<Who> => {
      const id = randomUUID();
      const token = `zz-sl-tok-${++seq}-${id.slice(0, 8)}`;
      const role = o.role ?? "expert";
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12)`,
        [id, `ZZ_SL_${label}`, `zz.sl.${label.toLowerCase()}@example.test`, role, o.active ?? true, o.approval ?? "approved",
          JSON.stringify(role === "expert" ? { stones: o.stones ?? true, clients: true } : {}), o.pkg ?? "premium", o.tenant ?? T[0],
          o.demo === true, o.superAdmin === true, role === "admin" ? "owner" : null],
      );
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin" }); // admin_level 'owner' ama super değil
    const DEMO_OWNER = await mk("DEMOOWNER", { role: "admin", superAdmin: true, demo: true });
    const E1 = await mk("E1");
    const E2 = await mk("E2", { tenant: T[1] });
    const E3 = await mk("E3", { tenant: T[2] });
    const NOSTONES = await mk("NOSTONES", { stones: false });
    const DEMO = await mk("DEMO", { demo: true });
    const PENDING = await mk("PENDING", { approval: "pending" });
    const TRIAL_EXPIRED = await mk("NOPKG", { pkg: "none" });
    const E_OTHERS: Who[] = [];
    for (let i = 0; i < 30; i++) E_OTHERS.push(await mk(`EX${i}`, { tenant: T[i % 3] }));

    // ── 4) Owner kimliği DB'de yeniden doğrulanır ─────────────────────────────────────────────
    section("4. Owner yetkileri (DB kilidi)");
    const srcData = { source_key: "zz-api", kind: "api", real_name: "RoxyAPI (ZZ sentetik test kaynağı)", provider_code: "roxy" };
    for (const [label, who] of [["uzman", E1], ["owner olmayan admin", ADMIN], ["demo owner", DEMO_OWNER]] as const) {
      ok((await errCode(`select public.stone_library_source_save($1, null, $2)`, [who.id, JSON.stringify(srcData)])) === "SL001", `${label} kaynak oluşturamaz (SL001)`);
      ok((await errCode(`select public.stone_library_stone_save($1, null, $2)`, [who.id, JSON.stringify({ slug: "zz-x", name_tr: "ZZ X" })])) === "SL001", `${label} taş oluşturamaz (SL001)`);
      ok((await errCode(`select public.stone_library_grant_access($1, $2)`, [who.id, E1.id])) === "SL001", `${label} yetki veremez (SL001)`);
      ok((await errCode(`select public.stone_library_owner_overview($1)`, [who.id])) === "SL001", `${label} owner verisini okuyamaz (SL001)`);
    }
    ok((await errCode(`select public.stone_library_source_save(null, null, $1)`, [JSON.stringify(srcData)])) === "SL001", "aktörsüz çağrı reddedilir");

    // ── 5) Kaynaklar + görünürlük ──────────────────────────────────────────────────────────────
    section("5. Kaynak görünürlüğü ve lisans kuralları");
    const SRC_API = String(await one(`select public.stone_library_source_save($1, null, $2)`, [OWNER.id, JSON.stringify(srcData)]));
    ok((await one(`select display_mode from public.stone_library_sources where id=$1`, [SRC_API])) === "hidden", "Roxy (provider_code=roxy) varsayılan görünürlük = GİZLİ");
    ok((await errCode(`select public.stone_library_source_save($1, null, $2)`, [OWNER.id, JSON.stringify({ ...srcData, source_key: "zz-api2", display_mode: "real" })])) === "SL021",
      "yeni kaynak 'real' görünürlükle açılamaz (SL021)");
    ok((await errCode(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_API, JSON.stringify({ status: "active" })])) === "23514",
      "lisans kaydı olmadan kaynak etkinleştirilemez (CHECK)");
    await su.query(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_API, JSON.stringify({
      license_type: "api_terms", license_terms_url: "https://example.test/terms", license_terms_sha256: "a".repeat(64), commercial_use_ok: true, status: "active" })]);
    const SRC_TRAINER = String(await one(`select public.stone_library_source_save($1, null, $2)`, [OWNER.id, JSON.stringify({ source_key: "zz-egitmen", kind: "trainer_archive", real_name: "ZZ Eğitmen Arşivi" })]));
    await su.query(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_TRAINER, JSON.stringify({ license_type: "written_contract", license_ref: "ZZ-SOZLESME-1", commercial_use_ok: true, status: "active", display_mode: "real" })]);
    const SRC_ALIAS = String(await one(`select public.stone_library_source_save($1, null, $2)`, [OWNER.id, JSON.stringify({ source_key: "zz-kurs", kind: "licensed_course", real_name: "ZZ Gerçek Kurs Adı Ltd" })]));
    await su.query(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_ALIAS, JSON.stringify({ license_type: "written_contract", license_ref: "ZZ-KURS-2", commercial_use_ok: true, status: "active", display_mode: "alias", display_alias: "Kurum İçi Eğitim Kaynağı" })]);
    const SRC_OWNER = String(await one(`select public.stone_library_source_save($1, null, $2)`, [OWNER.id, JSON.stringify({ source_key: "zz-owner", kind: "owner", real_name: "ZZ Owner Notları" })]));
    await su.query(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_OWNER, JSON.stringify({ license_type: "owner_content", license_ref: "owner", status: "active" })]);
    // Zorunlu atıf: gizlenemez
    const SRC_ATTR = String(await one(`select public.stone_library_source_save($1, null, $2)`, [OWNER.id, JSON.stringify({ source_key: "zz-atif", kind: "licensed_course", real_name: "ZZ Atıflı Kaynak" })]));
    ok((await errCode(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_ATTR, JSON.stringify({ attribution_required: true, attribution_text: "© ZZ Atıflı Kaynak" })])) === "23514",
      "zorunlu atıflı kaynak gizli kalamaz (CHECK)");
    await su.query(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_ATTR, JSON.stringify({ display_mode: "real", attribution_required: true, attribution_text: "© ZZ Atıflı Kaynak — izinle", license_type: "written_contract", license_ref: "ZZ-3", commercial_use_ok: true, status: "active" })]);
    ok((await errCode(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_ATTR, JSON.stringify({ display_mode: "hidden" })])) === "23514",
      "atıflı kaynağı sonradan gizlemek reddedilir (CHECK)");
    ok((await errCode(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_TRAINER, JSON.stringify({ hack: 1 })])) === "SL020", "bilinmeyen alan reddedilir");
    await su.query(`select public.stone_library_document_add($1, $2, $3)`, [OWNER.id, SRC_API, JSON.stringify({ doc_kind: "terms_snapshot", title: "ZZ şart anlık görüntüsü", content_sha256: "b".repeat(64) })]);

    // ── 6) Taşlar, adlar, TR/EN eşleme ─────────────────────────────────────────────────────────
    section("6. Kanonik taş, TR/EN ad ve alternatif yazılış");
    const mkStone = async (slug: string, tr: string, en: string | null) =>
      String(await one(`select public.stone_library_stone_save($1, null, $2)`, [OWNER.id, JSON.stringify({ slug, name_tr: tr, name_en: en })]));
    const S_AMETIST = await mkStone("ametist", "Ametist", "Amethyst");
    const S_KARNEOL = await mkStone("karneol", "Karneol", "Carnelian");
    const S_LAPIS = await mkStone("lapis-lazuli", "Lapis Lazuli", "Lapis Lazuli");
    const S_DRAFT = await mkStone("zz-taslak", "ZZ Taslak Taşı", null);
    const S_HIDDEN = await mkStone("zz-gizli", "ZZ Gizli Taş", null);
    await su.query(`select public.stone_library_name_add($1, $2, 'tr', 'Karnelyan', 'spelling')`, [OWNER.id, S_KARNEOL]);
    await su.query(`select public.stone_library_name_add($1, $2, 'tr', 'Lapislazuli', 'spelling')`, [OWNER.id, S_LAPIS]);
    await su.query(`select public.stone_library_name_add($1, $2, 'tr', 'Mor Kuvars', 'alias')`, [OWNER.id, S_AMETIST]);
    ok((await errCode(`select public.stone_library_name_add($1, $2, 'tr', 'KARNELYAN', 'alias')`, [OWNER.id, S_LAPIS])) === "SL026", "aynı ad (harf farkıyla) iki karta bağlanamaz");
    ok((await errCode(`select public.stone_library_stone_save($1, null, $2)`, [OWNER.id, JSON.stringify({ slug: "ametist-2", name_tr: "AMETİST", name_en: null })])) === "SL026", "aynı TR ad (AMETİST) ikinci karta verilemez");
    ok((await errCode(`select public.stone_library_stone_save($1, null, $2)`, [OWNER.id, JSON.stringify({ slug: "zz-y", name_tr: "Amethyst" })])) === "SL026", "başka kartın EN adı TR ad olarak verilemez");
    ok((await one(`select public.stone_library_name_add($1, $2, 'tr', 'ametist', 'alias')`, [OWNER.id, S_AMETIST])) === null, "kartın kendi adı alternatif olarak ikinci kez saklanmaz");
    for (const [ext, st] of [["zzx-amethyst-01", S_AMETIST], ["zzx-carnelian-02", S_KARNEOL], ["zzx-lapis-03", S_LAPIS]] as const) {
      await su.query(`select public.stone_library_external_id_link($1, $2, $3, $4)`, [OWNER.id, SRC_API, ext, st]);
    }
    ok((await errCode(`select public.stone_library_external_id_link($1, $2, 'zzx-amethyst-01', $3)`, [OWNER.id, SRC_API, S_KARNEOL])) === "SL028", "harici kimlik başka karta sessizce taşınamaz");
    // Tarihçe: taş adı değişince eski hâl kaybolmaz
    await su.query(`select public.stone_library_stone_save($1, $2, $3)`, [OWNER.id, S_DRAFT, JSON.stringify({ name_tr: "ZZ Taslak Taşı (düzeltilmiş)" })]);
    const hist = await q<{ o: string; n: string; actor: string }>(`select old_row->>'name_tr' o, new_row->>'name_tr' n, actor::text actor from public.stone_library_history where table_name='stone_library_stones' and row_id=$1`, [S_DRAFT]);
    ok(hist.length >= 1 && hist.some((h) => h.o === "ZZ Taslak Taşı" && h.n === "ZZ Taslak Taşı (düzeltilmiş)" && h.actor === OWNER.id), "taş düzenlemesinde eski hâl + aktör sürüm geçmişinde", hist);
    ok((await errCode(`select public.stone_library_stone_save($1, $2, $3)`, [OWNER.id, S_DRAFT, JSON.stringify({ name_tr: "x", expected_version: 1 })])) === "SL023", "eski sürümle düzenleme (iyimser kilit) reddedilir");

    // ── 7) Sürümlü kayıtlar: kaynaklar birbirini ezmez ─────────────────────────────────────────
    section("7. Sürümlü bilgi alanları");
    const addRec = async (stone: string, source: string, field: string, lang: string, content: string, extra: Record<string, unknown> = {}) =>
      String(await one(`select public.stone_library_record_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: stone, source_id: source, field_key: field, lang, content, ...extra })]));
    const R_API_DESC_TR = await addRec(S_AMETIST, SRC_API, "description", "tr", "ZZ sentetik açıklama: mor renkli zzkristalkelime taşı.");
    const R_API_DESC_EN = await addRec(S_AMETIST, SRC_API, "description", "en", "ZZ synthetic description: purple zzcrystalword stone.");
    const R_API_PHYS = await addRec(S_AMETIST, SRC_API, "meaning_physical", "tr", "ZZ sentetik fiziksel ifade zzsaglikkelime etkilidir.");
    const R_API_SPIR = await addRec(S_AMETIST, SRC_API, "meaning_spiritual", "tr", "ZZ sentetik ruhsal metin zzruhsalkelime.");
    const R_TRN_DESC = await addRec(S_AMETIST, SRC_TRAINER, "description", "tr", "ZZ eğitmen açıklaması zzegitmenkelime.");
    const R_ALIAS_DESC = await addRec(S_AMETIST, SRC_ALIAS, "description", "tr", "ZZ kurs açıklaması zzkurskelime.");
    const R_ATTR_DESC = await addRec(S_AMETIST, SRC_ATTR, "description", "tr", "ZZ atıflı kaynak metni zzatifkelime.");
    const R_HIDDENREC = await addRec(S_AMETIST, SRC_TRAINER, "care", "tr", "ZZ gizlenecek bakım metni zzgizlikelime.");
    const R_DRAFT_DESC = await addRec(S_DRAFT, SRC_TRAINER, "description", "tr", "ZZ taslak taşın metni zztaslakkelime.");
    const R_HIDDENSTONE = await addRec(S_HIDDEN, SRC_TRAINER, "description", "tr", "ZZ gizli taşın metni zzgizlitaskelime.");
    const R_KARNEOL = await addRec(S_KARNEOL, SRC_TRAINER, "description", "tr", "ZZ karneol metni turuncu zzturuncukelime.");
    const R_LAPIS = await addRec(S_LAPIS, SRC_TRAINER, "description", "en", "ZZ lapis text deep blue zzbluekeyword.");
    await addRec(S_AMETIST, SRC_OWNER, "usage", "tr", "ZZ owner notu zzownerkelime.", { origin: "owner_authored" });
    ok(R_API_PHYS !== R_API_DESC_TR && (await one(`select health_sensitive from public.stone_library_records where id=$1`, [R_API_PHYS])) === true, "meaning_physical otomatik 'sağlık hassas'");
    ok((await errCode(`update public.stone_library_records set health_sensitive=false where id=$1`, [R_API_PHYS])) === "23514", "fiziksel alanın sağlık işareti kaldırılamaz (CHECK)");
    ok((await one(`select public.stone_library_record_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_API, field_key: "description", lang: "tr", content: "ZZ sentetik açıklama: mor renkli zzkristalkelime taşı." })])) === R_API_DESC_TR,
      "aynı içerik tekrar eklenince yeni sürüm açılmaz (idempotent)");
    const cnt = await q<{ s: string; n: number }>(`select source_id::text s, count(*)::int n from public.stone_library_records where stone_id=$1 and field_key='description' and lang='tr' and is_current group by 1`, [S_AMETIST]);
    ok(cnt.length === 4 && cnt.every((c) => c.n === 1), "aynı taş + alan + dil: 4 kaynağın her biri kendi güncel kaydını korur (ezilme yok)", cnt);
    ok((await errCode(`select public.stone_library_record_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_API, field_key: "x", lang: "tr", content: "a" })])) === "23514", "bilinmeyen alan anahtarı reddedilir");
    ok((await errCode(`select public.stone_library_record_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_API, field_key: "description", lang: "tr", content: "a", origin: "owner_authored" })])) === "SL034", "API kaynağına owner_authored yazılamaz");
    // İçerik değiştirilemez (superuser bile tetikleyiciye takılır)
    ok((await errCode(`update public.stone_library_records set content='EZİLDİ' where id=$1`, [R_API_DESC_TR])) === "SL012", "kaynak metni UPDATE ile değiştirilemez (SL012)");
    ok((await errCode(`delete from public.stone_library_records where id=$1`, [R_API_DESC_TR])) === "SL011", "kayıt fiziksel silinemez (SL011)");

    // ── 8) Yayınlama denetimleri ───────────────────────────────────────────────────────────────
    section("8. Yayın, görünürlük ve sağlık kilidi");
    const pubDoc = async (stone: string) => (await q<{ doc: Record<string, unknown> }>(`select doc from public.stone_library_published where stone_id=$1`, [stone]))[0]?.doc ?? null;
    const pubText = async () => JSON.stringify(await q(`select slug, doc, search_tsv::text t, names_fold from public.stone_library_published`));
    for (const s of [S_AMETIST, S_KARNEOL, S_LAPIS, S_HIDDEN]) await su.query(`select public.stone_library_stone_set_status($1, $2, 'published')`, [OWNER.id, s]);
    await su.query(`select public.stone_library_stone_set_status($1, $2, 'hidden')`, [OWNER.id, S_HIDDEN]);
    ok((await q(`select 1 from public.stone_library_published where stone_id = any($1)`, [[S_DRAFT, S_HIDDEN]])).length === 0, "taslak ve gizli taşlar yayın yüzeyinde YOK");
    let doc = await pubDoc(S_AMETIST);
    const pendingTxt = JSON.stringify(doc);
    ok(doc !== null && !["zzkristalkelime", "zzcrystalword", "zzruhsalkelime", "zzegitmenkelime", "zzkurskelime", "zzatifkelime"].some((w) => pendingTxt.includes(w)),
      "onaylanmamış (pending) kaynak kayıtları yayımlanmaz", doc);
    ok(pendingTxt.includes("zzownerkelime"), "owner'ın kendi yazdığı içerik onaylı başlar");
    for (const r of [R_API_DESC_TR, R_API_DESC_EN, R_API_SPIR, R_API_PHYS, R_TRN_DESC, R_ALIAS_DESC, R_ATTR_DESC, R_HIDDENREC, R_DRAFT_DESC, R_HIDDENSTONE, R_KARNEOL, R_LAPIS]) {
      await su.query(`select public.stone_library_review($1, 'record', $2, 'approve')`, [OWNER.id, r]);
    }
    await su.query(`select public.stone_library_review($1, 'record', $2, 'hide', 'ZZ gizlendi')`, [OWNER.id, R_HIDDENREC]);
    let txt = await pubText();
    ok(txt.includes("zzkristalkelime") && txt.includes("zzegitmenkelime") && txt.includes("zzkurskelime"), "onaylı + görünür kayıtlar yayımlandı");
    ok(txt.includes("zzownerkelime"), "owner içeriği (owner_authored, otomatik onaylı) yayımlandı");
    ok(!txt.includes("zzgizlikelime"), "gizlenen kayıt yayın belgesinde ve arama indeksinde YOK");
    ok(!txt.includes("zztaslakkelime") && !txt.includes("zzgizlitaskelime"), "taslak / gizli taş metni indekste YOK");
    ok(!txt.includes("zzsaglikkelime"), "sağlık hassas metin (onaylı olsa da) hukuk onayı yokken YOK");
    ok((await errCode(`select public.stone_library_review($1, 'record', $2, 'legal_clear', '')`, [OWNER.id, R_API_PHYS])) === "SL042", "hukuk onayı referanssız verilemez");
    await su.query(`select public.stone_library_review($1, 'record', $2, 'legal_clear', 'ZZ-HUKUK-REF-1')`, [OWNER.id, R_API_PHYS]);
    ok(!(await pubText()).includes("zzsaglikkelime"), "kayıt hukuk onaylı ama genel sağlık kilidi KAPALI → hâlâ YOK");
    ok((await errCode(`select public.stone_library_settings_save($1, $2)`, [OWNER.id, JSON.stringify({ health_content_publication_enabled: true })])) === "23514", "genel sağlık kilidi hukuk referansı olmadan açılamaz");
    await su.query(`select public.stone_library_settings_save($1, $2)`, [OWNER.id, JSON.stringify({ health_content_publication_enabled: true, legal_review_ref: "ZZ-HUKUK-GENEL" })]);
    ok((await pubText()).includes("zzsaglikkelime"), "hukuk onayı + genel kilit açık → sağlık içeriği yayımlandı (özgün ifade 'etkilidir' korunarak)");
    ok((await pubText()).includes("etkilidir"), "kaynak ifadesi yumuşatılmadı ('etkilidir' aynen)");
    await su.query(`select public.stone_library_settings_save($1, $2)`, [OWNER.id, JSON.stringify({ health_content_publication_enabled: false })]);
    ok(!(await pubText()).includes("zzsaglikkelime"), "genel kilit tekrar kapanınca sağlık içeriği anında geri çekildi");
    ok((await one(`select doc->'health_notice'->>'tr' from public.stone_library_published where stone_id=$1`, [S_AMETIST])) === STONE_LIBRARY_HEALTH_NOTICE_TR, "görünür sağlık uyarısı owner metniyle birebir");

    // Facet'ler
    const addFacet = async (d: Record<string, unknown>) => String(await one(`select public.stone_library_facet_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_API, ...d })]));
    await addFacet({ facet: "chakra", value_key: "third_eye" });
    await addFacet({ facet: "chakra", value_key: "crown" });
    await addFacet({ facet: "zodiac", value_key: "pisces" });
    await addFacet({ facet: "element", value_key: "air" });
    await addFacet({ facet: "color", value_key: "purple" });
    await addFacet({ facet: "planet", value_key: "jupiter" });
    await addFacet({ facet: "keyword", lang: "tr", value_text: "Huzur" });
    await addFacet({ facet: "keyword", lang: "en", value_text: "Calm Mind" });
    await addFacet({ facet: "birth_month", value_num: 2 });
    await addFacet({ facet: "hardness", value_num: 7 });
    await addFacet({ facet: "numerical_vibration", value_num: 3 });
    await addFacet({ facet: "pairing", pair_external_id: "zzx-carnelian-02" });
    await su.query(`select public.stone_library_facet_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_KARNEOL, source_id: SRC_TRAINER, facet: "chakra", value_key: "sacral" })]);
    ok((await errCode(`select public.stone_library_facet_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_API, facet: "chakra", value_key: "kalp_cakrasi_yanlis" })])) === "SL041", "sözlükte olmayan çakra reddedilir");
    ok((await errCode(`select public.stone_library_facet_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_API, facet: "birth_month", value_num: 13 })])) === "23514", "doğum ayı 1–12 dışı reddedilir");
    doc = await pubDoc(S_AMETIST);
    const facets = (doc?.facets ?? {}) as Record<string, unknown>;
    ok(JSON.stringify(facets.chakra ?? []).includes("Üçüncü Göz") && JSON.stringify(facets.chakra ?? []).includes("Taç Çakra"), "çakra TR etiketleri (sözlük) yayın belgesinde");
    ok(JSON.stringify(facets.zodiac ?? []).includes("Balık") && JSON.stringify(facets.element ?? []).includes("Hava") && JSON.stringify(facets.color ?? []).includes("Mor"), "burç / element / renk TR etiketleri");
    const hd = (doc?.hardness ?? {}) as { min?: number; max?: number };
    ok(hd.min === 7 && hd.max === 7 && JSON.stringify(facets.birth_month) === "[2]", "sertlik + doğum ayı", { h: doc?.hardness, b: facets.birth_month });
    ok(JSON.stringify(doc?.pairings ?? []).includes("karneol"), "eşleştirme harici kimlikle (zzx-carnelian-02) yayımlanmış karta çözüldü", doc?.pairings);

    // ── 9) Uzman route'ları: erişim ────────────────────────────────────────────────────────────
    section("9. Uzman erişimi (varsayılan kapalı, kişi bazında yetki)");
    const searchH = (await import("../../app/api/dogaltas/kutuphane/route")) as unknown as Record<string, Handler>;
    const detailH = (await import("../../app/api/dogaltas/kutuphane/[slug]/route")) as unknown as Record<string, Handler>;
    ok(Object.keys(searchH).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)).join(",") === "GET"
       && Object.keys(detailH).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)).join(",") === "GET",
       "uzman route'larında yalnız GET var (yazma ucu yok → Next 405)");
    const S = searchH.GET; const D = detailH.GET;
    const as = (w: Who) => ({ id: w.id, token: w.token });
    const notFoundBodies = new Set<string>();
    const nonNoStore: string[] = [];
    const allExpertBodies: string[] = [];
    const track = (label: string, r: Res) => {
      if (r.cache !== "no-store") nonNoStore.push(`${label}:${r.status}`);
      if (r.status === 404) notFoundBodies.add(r.body);
      if (r.status === 200) allExpertBodies.push(r.body);
      return r;
    };
    // Hazırlık kapısı kapalı → herkes 404 (owner dahil), DB'ye gidilmez
    {
      const before = env.stats.requests;
      for (const val of [undefined, "", "1", "TRUE", " true"]) {
        if (val === undefined) delete process.env.STONE_LIBRARY_ENABLED; else process.env.STONE_LIBRARY_ENABLED = val;
        const rs = [track("off-s", await call(S, as(OWNER), { query: "?q=ametist" })), track("off-d", await call(D, as(OWNER), { params: { slug: "ametist" } }))];
        ok(rs.every((r) => r.status === 404), `kapı "${val ?? "(yok)"}" → owner dahil 404`);
      }
      ok(env.stats.requests === before, "kapı kapalıyken DB'ye hiç istek gitmedi", env.stats.requests - before);
    }
    process.env.STONE_LIBRARY_ENABLED = "true";
    const everyone: [string, Who][] = [["E1", E1], ["E2", E2], ["E3", E3], ["NOSTONES", NOSTONES], ["DEMO", DEMO], ["PENDING", PENDING], ["NOPKG", TRIAL_EXPIRED], ["ADMIN", ADMIN], ["DEMO_OWNER", DEMO_OWNER]];
    for (const [label, w] of everyone) {
      const a = track(`pre-${label}`, await call(S, as(w), { query: "?q=ametist" }));
      const b = track(`pre-d-${label}`, await call(D, as(w), { params: { slug: "ametist" } }));
      ok(a.status === 404 && b.status === 404, `${label}: yetki verilmeden arama + detay 404`);
    }
    let deniedOthers = 0;
    for (const w of E_OTHERS) if ((await call(S, as(w))).status === 404) deniedOthers++;
    ok(deniedOthers === E_OTHERS.length, `30 ek uzmanın hepsi varsayılan olarak reddedildi (${deniedOthers}/30)`);
    ok((await call(S, null)).status === 404 && (await call(S, { id: E1.id })).status === 404 && (await call(S, { id: E1.id, token: "zz-sahte" })).status === 404,
      "anonim / tokensız / sahte token → 404");
    const own = track("owner", await call(S, as(OWNER), { query: "?q=ametist" }));
    ok(own.status === 200, "owner önizleme: arama 200", own.status);
    // Yetki ver
    ok((await errCode(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, DEMO.id])) === "SL072", "demo hesaba yetki verilemez");
    ok((await errCode(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, NOSTONES.id])) === "SL072", "Doğaltaş izni olmayan uzmana yetki verilemez");
    ok((await errCode(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, ADMIN.id])) === "SL072", "admin'e (uzman değil) yetki verilemez");
    ok((await errCode(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, OWNER.id])) === "SL070", "owner kendine yetki veremez");
    await su.query(`select public.stone_library_grant_access($1, $2, 'ZZ pilot')`, [OWNER.id, E1.id]);
    await su.query(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, E2.id]);
    ok((await errCode(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, E1.id])) === "SL073", "mükerrer etkin yetki yok");
    const e1s = track("E1", await call(S, as(E1), { query: "?q=ametist" }));
    ok(e1s.status === 200, "yetkili uzman E1 → arama 200", e1s.status);
    ok(track("E3", await call(S, as(E3), { query: "?q=ametist" })).status === 404, "yetkisiz uzman E3 → 404 (E1/E2'nin yetkisi işe yaramaz)");
    ok(track("E3-as-E1", await call(S, { id: E1.id, token: E3.token }, { query: "?q=ametist" })).status === 404, "E3 kendi token'ıyla E1 kimliğini taşıyamaz (oturum bağlama) → 404");
    let grantedOthers = 0;
    for (const w of E_OTHERS) if ((await call(S, as(w))).status === 200) grantedOthers++;
    ok(grantedOthers === 0, "2 yetkiden sonra 30 ek uzmanın hiçbiri erişemiyor", grantedOthers);
    // Yetki iptali / uygunsuzluk
    await su.query(`select public.stone_library_revoke_access($1, $2)`, [OWNER.id, E2.id]);
    ok(track("E2-rev", await call(S, as(E2))).status === 404, "yetkisi kaldırılan uzman → 404");
    await su.query(`update public.users set tenant_id=$2 where id=$1`, [E1.id, T[2]]);
    ok(track("E1-tenant", await call(S, as(E1))).status === 404, "tenant değişince yetki kalıcı iptal (auto revoke) → 404");
    await su.query(`update public.users set tenant_id=$2 where id=$1`, [E1.id, T[0]]);
    ok(track("E1-back", await call(S, as(E1))).status === 404, "tenant geri alınsa da iptal edilen yetki kendiliğinden dirilmez");
    ok((await one(`select revoke_reason from public.stone_library_access_grants where user_id=$1 order by granted_at desc limit 1`, [E1.id])) === "tenant_changed", "iptal gerekçesi: tenant_changed");
    await su.query(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, E1.id]);
    ok(track("E1-regrant", await call(S, as(E1))).status === 200, "owner yeniden yetki verince erişim döner");
    await su.query(`update public.users set module_permissions='{"clients":true}' where id=$1`, [E3.id]);
    await su.query(`update public.users set module_permissions='{"stones":true,"clients":true}' where id=$1`, [E3.id]);
    await su.query(`select public.stone_library_grant_access($1, $2)`, [OWNER.id, E3.id]);
    await su.query(`update public.users set module_permissions='{"clients":true}' where id=$1`, [E3.id]);
    ok(track("E3-mod", await call(S, as(E3))).status === 404, "Doğaltaş modül izni kaldırılınca → 404");
    ok((await one(`select public.stone_library_viewer_allowed($1)`, [E3.id])) === false, "DB kilidi de modül izni yokken reddeder");
    ok((await one(`select count(*)::int from public.stone_library_access_grants where user_id=$1 and revoked_at is null`, [E3.id])) === 1, "modül izni kaldırma GEÇİCİ red: kütüphane yetkisi kalıcı iptal edilmez");
    await su.query(`update public.users set module_permissions='{"stones":true,"clients":true}' where id=$1`, [E3.id]);
    ok(track("E3-mod-back", await call(S, as(E3))).status === 200, "modül izni geri gelince erişim döner");
    await su.query(`select public.stone_library_revoke_access($1, $2)`, [OWNER.id, E3.id]);
    await su.query(`update public.users set active=false where id=$1`, [E1.id]);
    ok(track("E1-inactive", await call(S, as(E1))).status === 404, "pasif hesap → 404");
    await su.query(`update public.users set active=true where id=$1`, [E1.id]);
    ok(track("E1-active", await call(S, as(E1))).status === 200, "geçici durum (pasif) yetkiyi iptal etmez; aktifleşince erişim sürer");
    ok((await one(`select public.stone_library_viewer_allowed($1)`, [E2.id])) === false && (await one(`select public.stone_library_viewer_allowed($1)`, [OWNER.id])) === true,
      "DB izleyici kilidi: iptal edilmiş = false, owner = true");
    ok((await one(`select public.stone_library_expert_search($1, 'ametist')`, [E3.id])) === null, "yetkisiz izleyici RPC'yi doğrudan çağırsa da sonuç NULL (DB kilidi)");
    ok((await errCode(`update public.stone_library_access_grants set revoked_at=null, revoke_reason=null where user_id=$1`, [E2.id])) === "SL013", "iptal edilmiş yetki DB'de yeniden etkinleştirilemez");

    // ── 10) Arama (TR/EN, normalizasyon, bulanık, filtre) ─────────────────────────────────────
    section("10. Arama ve filtreler");
    const first = async (qs: string) => {
      const r = track(`q${qs}`, await call(S, as(E1), { query: qs }));
      const items = (r.json.items ?? []) as { slug: string }[];
      return { r, slugs: items.map((i) => i.slug), total: r.json.total as number };
    };
    for (const term of ["Ametist", "Amethyst", "AMETİST", "ametist", "AMETIST", "ametıst", "Mor Kuvars"]) {
      const x = await first(`?q=${encodeURIComponent(term)}`);
      ok(x.slugs[0] === "ametist", `"${term}" → ametist ilk sırada`, x.slugs);
    }
    for (const term of ["Karneol", "Karnelyan", "KARNELYAN", "Carnelian"]) {
      const x = await first(`?q=${encodeURIComponent(term)}`);
      ok(x.slugs[0] === "karneol", `"${term}" → karneol`, x.slugs);
    }
    for (const term of ["Lapis Lazuli", "Lapislazuli", "LAPİS LAZULİ", "lapis"]) {
      const x = await first(`?q=${encodeURIComponent(term)}`);
      ok(x.slugs[0] === "lapis-lazuli", `"${term}" → lapis-lazuli`, x.slugs);
    }
    ok((await first("?q=ametis")).slugs[0] === "ametist", "bulanık/önek: 'ametis' → ametist");
    ok((await first("?q=zzkristalkelime")).slugs.join() === "ametist", "açıklama kelimesi (TR) aranabilir");
    ok((await first("?q=zzcrystalword")).slugs.join() === "ametist", "açıklama kelimesi (EN) aranabilir");
    ok((await first("?q=huzur")).slugs.join() === "ametist", "anahtar kelime 'huzur' (TR) aranabilir");
    ok((await first("?q=calm%20mind")).slugs.join() === "ametist", "anahtar kelime 'calm mind' (EN) aranabilir");
    ok((await first("?q=" + encodeURIComponent("Üçüncü Göz"))).slugs.includes("ametist"), "çakra etiketi metinle aranabilir");
    for (const hidden of ["zzgizlikelime", "zztaslakkelime", "zzgizlitaskelime", "zzsaglikkelime", "ZZ Taslak", "ZZ Gizli Taş"]) {
      const x = await first(`?q=${encodeURIComponent(hidden)}`);
      ok(x.total === 0, `gizli/taslak/sağlık içeriği aramada çıkmaz: "${hidden}"`, x.slugs);
    }
    ok((await first("?chakra=third_eye")).slugs.join() === "ametist", "çakra filtresi");
    ok((await first("?chakra=sacral,third_eye")).slugs.sort().join() === "ametist,karneol", "aynı filtrede çoklu değer = VEYA");
    ok((await first("?chakra=third_eye&zodiac=aries")).total === 0, "farklı filtreler = VE");
    ok((await first("?zodiac=pisces&element=air&color=purple&planet=jupiter")).slugs.join() === "ametist", "burç + element + renk + gezegen filtresi");
    ok((await first("?keyword=Huzur")).slugs.join() === "ametist", "anahtar kelime filtresi (harf duyarsız)");
    ok((await first("?pairs_with=karneol")).slugs.join() === "ametist", "taş eşleştirmesi filtresi");
    ok((await first("?birth_month=2&hardness_min=6&hardness_max=8")).slugs.join() === "ametist", "doğum ayı + sertlik aralığı");
    ok((await first("?q=" + encodeURIComponent("'; drop table x; --"))).r.status === 200, "kötü niyetli sorgu güvenle işlenir (200, hata yok)");
    ok((await first("?chakra=" + encodeURIComponent("x' or 1=1"))).r.status === 200, "geçersiz filtre değeri RPC'ye gitmez");
    const all = await first("");
    ok(all.total === 3 && all.slugs.join() === "ametist,karneol,lapis-lazuli", "boş sorgu: yalnız yayımlanmış 3 taş, ada göre sıralı", all.slugs);
    const p1 = await first("?limit=1&offset=1");
    ok(p1.slugs.join() === "karneol" && p1.total === 3, "sayfalama (limit/offset)");
    // TS ayrıştırıcı sınırları
    const parsed = parseStoneLibrarySearch(new URLSearchParams("q=" + "a".repeat(500) + "&limit=9999&chakra=ROOT,bad!,root&birth_month=13,2"));
    ok(parsed.query.length === 80 && parsed.limit === 50 && JSON.stringify(parsed.filters.chakra) === '["root"]' && JSON.stringify(parsed.filters.birth_month) === '["2"]', "istek ayrıştırıcı sınırları");

    // ── 11) Kaynak gizliliği: yanıtlarda gerçek kimlik yok ────────────────────────────────────
    section("11. Kaynak gizliliği (sunucu yanıtı düzeyinde)");
    const det = track("det", await call(D, as(E1), { params: { slug: "ametist" } }));
    ok(det.status === 200, "yetkili uzman detay 200", det.status);
    const item = det.json.item as Record<string, unknown>;
    const secs = (item?.sections ?? []) as { label: string | null; attribution: string | null; fields: { content: string }[] }[];
    const secOf = (word: string) => secs.find((s) => s.fields.some((f) => f.content.includes(word)));
    ok(secOf("zzkristalkelime")?.label === null, "gizli kaynak (API) bölümü etiketsiz (label=null)");
    ok(secOf("zzegitmenkelime")?.label === "ZZ Eğitmen Arşivi", "'gerçek adı göster' seçilen eğitmen adı görünür");
    ok(secOf("zzkurskelime")?.label === "Kurum İçi Eğitim Kaynağı", "'owner adı' seçilen kaynakta yalnız owner'ın verdiği ad");
    ok(secOf("zzatifkelime")?.attribution === "© ZZ Atıflı Kaynak — izinle", "zorunlu atıf metni korunur");
    const allBodies = allExpertBodies.join("\n");
    for (const banned of ["RoxyAPI", "roxy", "ZZ sentetik test kaynağı", "ZZ Gerçek Kurs Adı Ltd", "zz-api", "zz-kurs", "zzx-carnelian-02", "zzx-amethyst-01", "zzx-lapis-03",
      "example.test/terms", "a".repeat(64), "ZZ-SOZLESME", "ZZ-HUKUK", SRC_API, SRC_ALIAS, S_AMETIST, R_API_DESC_TR, "payload", "license", "quota", "real_name", "source_id"]) {
      ok(!allBodies.toLowerCase().includes(banned.toLowerCase()), `uzman yanıtlarında yok: ${banned.length > 40 ? banned.slice(0, 12) + "…" : banned}`);
    }
    ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(allBodies), "uzman yanıtlarında hiçbir iç uuid yok");
    ok(allExpertBodies.length > 20, `taranan başarılı uzman yanıtı sayısı: ${allExpertBodies.length}`);
    // Görünürlük değişince yanıt anında değişir
    await su.query(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_TRAINER, JSON.stringify({ display_mode: "hidden" })]);
    const det2 = await call(D, as(E1), { params: { slug: "ametist" } });
    ok(!det2.body.includes("ZZ Eğitmen Arşivi"), "owner eğitmen adını gizleyince ad yanıttan anında kalktı");
    await su.query(`select public.stone_library_source_save($1, $2, $3)`, [OWNER.id, SRC_TRAINER, JSON.stringify({ display_mode: "real" })]);
    // İkinci kilit: sızıntı tarayıcısı
    const leaks = findStoneLibraryLeaks({ slug: "x", source_id: "1", sections: [{ label: "RoxyAPI", fields: [{ content: "bkz https://roxyapi.com/api/v2/crystals" }] }] });
    ok(leaks.some((l) => l.reason === "forbidden_key") && leaks.filter((l) => l.reason.startsWith("forbidden_value")).length >= 2, "sızıntı tarayıcısı yasak anahtar ve değerleri yakalar", leaks);
    const sanitized = toExpertStoneDoc({ slug: "ametist", name_tr: "Ametist", source_id: "x", real_name: "RoxyAPI", sections: [{ key: "s1", label: null, source_id: "y", fields: [{ field: "description", lang: "tr", content: "a", raw_id: "z" }] }] });
    ok(!!sanitized && !JSON.stringify(sanitized).includes("source_id") && !JSON.stringify(sanitized).includes("RoxyAPI") && !JSON.stringify(sanitized).includes("raw_id"), "beyaz liste fazladan anahtarları düşürür");
    ok(track("bad-slug", await call(D, as(E1), { params: { slug: "../ametist" } })).status === 404 && track("draft", await call(D, as(E1), { params: { slug: "zz-taslak" } })).status === 404
       && track("hidden", await call(D, as(E1), { params: { slug: "zz-gizli" } })).status === 404, "geçersiz / taslak / gizli slug → 404");
    ok(notFoundBodies.size === 1, "tüm red dalları AYNI 404 gövdesi", [...notFoundBodies]);
    ok(nonNoStore.length === 0, "tüm yanıtlar Cache-Control: no-store", nonNoStore);

    // ── 12) Sürüm + geri alma veri kaybına yol açmaz ───────────────────────────────────────────
    section("12. Sürüm geçmişi, owner düzenlemesi, geri alma");
    const R_EDIT = await addRec(S_AMETIST, SRC_TRAINER, "description", "tr", "ZZ eğitmen açıklaması owner tarafından düzeltildi zzduzeltmekelime.", { origin: "owner_edit", based_on_id: R_TRN_DESC });
    const v = await q<{ id: string; version: number; is_current: boolean; content: string; origin: string }>(
      `select id::text, version, is_current, content, origin from public.stone_library_records where stone_id=$1 and source_id=$2 and field_key='description' and lang='tr' order by version`, [S_AMETIST, SRC_TRAINER]);
    ok(v.length === 2 && v[0].content === "ZZ eğitmen açıklaması zzegitmenkelime." && !v[0].is_current && v[1].is_current && v[1].origin === "owner_edit", "owner düzenlemesi = yeni sürüm; özgün metin aynen korunur", v);
    txt = await pubText();
    ok(txt.includes("zzduzeltmekelime") && !txt.includes("zzegitmenkelime"), "yayında owner sürümü");
    await su.query(`select public.stone_library_record_set_current($1, $2, 'özgüne dön')`, [OWNER.id, R_TRN_DESC]);
    txt = await pubText();
    ok(txt.includes("zzegitmenkelime") && !txt.includes("zzduzeltmekelime"), "özgün sürüme dönüş (hiçbir sürüm silinmeden)");
    ok((await errCode(`select public.stone_library_record_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_TRAINER, field_key: "description", lang: "tr", content: "x", origin: "owner_edit", based_on_id: R_KARNEOL })])) === "SL036",
      "başka anahtarın kaydı düzenleme tabanı olamaz");
    // Yeni kaynak sürümü (ör. güncelleme aktarımı) mevcut onaylı sürümü ezmez
    const R_API_V2 = await addRec(S_AMETIST, SRC_API, "description", "tr", "ZZ güncellenmiş sağlayıcı açıklaması zzyenisurumkelime.");
    ok((await one(`select is_current from public.stone_library_records where id=$1`, [R_API_V2])) === false && (await pubText()).includes("zzkristalkelime") && !(await pubText()).includes("zzyenisurumkelime"),
      "yeni kaynak sürümü bekleyende kalır; yayındaki onaylı sürüm değişmez");
    // Kayıt silme → önceki sürüm güncel olur; geri alma eski durumu kurar
    const opRec = String(await one(`select public.stone_library_delete($1, 'record', $2, 'ZZ deneme')`, [OWNER.id, R_EDIT]));
    ok((await one(`select is_current from public.stone_library_records where id=$1`, [R_TRN_DESC])) === true, "silinen (güncel olmayan) sürüm sonrası güncel sürüm korunur");
    await su.query(`select public.stone_library_restore($1, $2)`, [OWNER.id, opRec]);
    ok((await one(`select deleted_at is null from public.stone_library_records where id=$1`, [R_EDIT])) === true, "sürüm geri alındı");
    await su.query(`select public.stone_library_record_set_current($1, $2)`, [OWNER.id, R_EDIT]);
    const opCur = String(await one(`select public.stone_library_delete($1, 'record', $2)`, [OWNER.id, R_EDIT]));
    ok((await one(`select is_current from public.stone_library_records where id=$1`, [R_TRN_DESC])) === true && (await pubText()).includes("zzegitmenkelime"),
      "güncel sürüm silinince önceki sürüm otomatik güncel (içerik boşluğu yok)");
    await su.query(`select public.stone_library_restore($1, $2)`, [OWNER.id, opCur]);
    ok((await one(`select is_current from public.stone_library_records where id=$1`, [R_EDIT])) === true && (await one(`select is_current from public.stone_library_records where id=$1`, [R_TRN_DESC])) === false,
      "geri alma: silinen güncel sürüm yeniden güncel, terfi eden eski sürüm geri çekildi");
    ok((await errCode(`select public.stone_library_restore($1, $2)`, [OWNER.id, opCur])) === "SL055", "aynı işlem iki kez geri alınamaz");
    // Taş silme: bağımlılık kontrolleri
    ok((await errCode(`select public.stone_library_delete($1, 'stone', $2)`, [OWNER.id, S_KARNEOL])) === "SL050", "yayımdaki taş silinemez (önce yayından kaldır)");
    await su.query(`select public.stone_library_stone_set_status($1, $2, 'draft')`, [OWNER.id, S_KARNEOL]);
    ok(!JSON.stringify(await pubDoc(S_AMETIST)).includes("karneol"), "yayından kalkan taş eşleştirmelerden de anında düştü");
    ok((await errCode(`select public.stone_library_delete($1, 'stone', $2)`, [OWNER.id, S_KARNEOL])) === "SL051", "bağımlılığı olan taş cascade olmadan silinemez");
    const recBefore = await hashTables(["stone_library_records"]);
    const opStone = String(await one(`select public.stone_library_delete($1, 'stone', $2, 'ZZ yanlışlık', true)`, [OWNER.id, S_KARNEOL]));
    ok((await one(`select count(*)::int from public.stone_library_records where stone_id=$1 and deleted_at is null`, [S_KARNEOL])) === 0
       && (await one(`select count(*)::int from public.stone_library_records where stone_id=$1`, [S_KARNEOL])) === 1, "cascade silme: kayıtlar yumuşak silindi, fiziksel olarak duruyor");
    ok((await one(`select count(*)::int from public.stone_library_names where stone_id=$1 and deleted_at is null`, [S_KARNEOL])) === 0, "taşın alternatif adları da silindi (ad serbest kaldı)");
    await su.query(`select public.stone_library_restore($1, $2)`, [OWNER.id, opStone]);
    ok(JSON.stringify(recBefore) === JSON.stringify(await hashTables(["stone_library_records"])), "taş geri alındı: kayıt tablosu silme öncesiyle birebir aynı");
    ok((await one(`select count(*)::int from public.stone_library_names where stone_id=$1 and deleted_at is null`, [S_KARNEOL])) === 1, "alternatif ad (Karnelyan) geri geldi");
    await su.query(`select public.stone_library_stone_set_status($1, $2, 'published')`, [OWNER.id, S_KARNEOL]);
    ok((await first("?q=Karnelyan")).slugs[0] === "karneol" && JSON.stringify(await pubDoc(S_AMETIST)).includes("karneol"), "yeniden yayın: arama ve eşleştirme geri döndü");
    ok((await errCode(`delete from public.stone_library_stones where id=$1`, [S_DRAFT])) === "SL011", "taş fiziksel silinemez");
    ok((await errCode(`select public.stone_library_delete($1, 'source', $2)`, [OWNER.id, SRC_ALIAS])) === "SL051", "kayıtları olan kaynak cascade olmadan silinemez");

    // ── 13) Aktarım paketleri (F2 için DB kilitleri) ───────────────────────────────────────────
    section("13. Aktarım paketi kilitleri (gerçek aktarım YOK)");
    const SRC_DRAFT = String(await one(`select public.stone_library_source_save($1, null, $2)`, [OWNER.id, JSON.stringify({ source_key: "zz-lisanssiz", kind: "api", real_name: "ZZ Lisanssız API" })]));
    ok((await errCode(`select public.stone_library_batch_open($1, $2)`, [OWNER.id, JSON.stringify({ source_id: SRC_DRAFT, dry_run: false, credit_cap: 10 })])) === "SL060", "lisans/etkin olmayan kaynaktan gerçek aktarım açılamaz");
    ok((await errCode(`select public.stone_library_batch_open($1, $2)`, [OWNER.id, JSON.stringify({ source_id: SRC_API, dry_run: false, credit_cap: 10 })])) === "SL063", "API aktarımında şart metni SHA zorunlu");
    const DRY = String(await one(`select public.stone_library_batch_open($1, $2)`, [OWNER.id, JSON.stringify({ source_id: SRC_API, dry_run: true, credit_cap: 0, calls_planned: 92, langs: ["tr", "en"] })]));
    ok((await errCode(`select public.stone_library_batch_set_status($1, $2, 'running')`, [OWNER.id, DRY])) === "SL031", "deneme (dry-run) paketi çalıştırılamaz → 0 çağrı");
    const B = String(await one(`select public.stone_library_batch_open($1, $2)`, [OWNER.id, JSON.stringify({ source_id: SRC_API, dry_run: false, credit_cap: 2, calls_planned: 2, terms_sha256: "c".repeat(64) })]));
    ok((await errCode(`select public.stone_library_batch_reserve_call($1, $2)`, [OWNER.id, B])) === "SL032", "planlı (başlamamış) pakette çağrı ayrılamaz");
    await su.query(`select public.stone_library_batch_set_status($1, $2, 'running')`, [OWNER.id, B]);
    ok((await errCode(`select public.stone_library_batch_open($1, $2)`, [OWNER.id, JSON.stringify({ source_id: SRC_API, dry_run: false, credit_cap: 2, terms_sha256: "c".repeat(64) })])) === null
       && (await errCode(`select public.stone_library_batch_set_status($1, (select id from public.stone_library_import_batches where status='planned' and source_id=$2 and not dry_run order by created_at desc limit 1), 'running')`, [OWNER.id, SRC_API])) === "23505",
       "aynı kaynakta aynı anda tek çalışan paket");
    ok((await errCode(`select public.stone_library_raw_put($1, $2, 'zz-ext', 'tr', '/crystals/zz-ext', 200, '{"zz":1}')`, [OWNER.id, B])) === "SL066", "kredi ayrılmadan ham kayıt yazılamaz (önce deftere)");
    await su.query(`select public.stone_library_batch_reserve_call($1, $2, 'zz-ext')`, [OWNER.id, B]);
    const RAW = String(await one(`select public.stone_library_raw_put($1, $2, 'zz-ext', 'tr', '/crystals/zz-ext', 200, '{"zz":"sentetik"}')`, [OWNER.id, B]));
    ok(/^[0-9a-f]{64}$/.test(String(await one(`select payload_sha256 from public.stone_library_raw where id=$1`, [RAW]))), "ham kaydın SHA-256'sı sunucuda hesaplandı");
    ok((await errCode(`update public.stone_library_raw set payload='{}' where id=$1`, [RAW])) === "SL010", "ham veri değiştirilemez");
    ok((await errCode(`delete from public.stone_library_raw where id=$1`, [RAW])) === "SL010", "ham veri silinemez");
    ok((await errCode(`truncate public.stone_library_raw cascade`)) === "SL010", "ham veri tablosu boşaltılamaz (TRUNCATE)");
    await su.query(`select public.stone_library_batch_reserve_call($1, $2)`, [OWNER.id, B]);
    ok((await errCode(`select public.stone_library_batch_reserve_call($1, $2)`, [OWNER.id, B])) === "SL065", "kredi tavanı (2) DB'de zorlanır: 3. çağrı reddedildi");
    const R_BATCH = await addRec(S_AMETIST, SRC_API, "affirmation", "tr", "ZZ paket olumlaması zzpaketkelime.", { batch_id: B, raw_id: RAW });
    await su.query(`select public.stone_library_review($1, 'record', $2, 'approve')`, [OWNER.id, R_BATCH]);
    ok((await pubText()).includes("zzpaketkelime"), "paket kaydı onaylanınca yayında");
    await su.query(`select public.stone_library_batch_set_status($1, $2, 'stop_requested')`, [OWNER.id, B]);
    ok((await errCode(`select public.stone_library_batch_reserve_call($1, $2)`, [OWNER.id, B])) === "SL032", "durdurma isteğinden sonra yeni ücretli çağrı ayrılamaz");
    await su.query(`select public.stone_library_batch_set_status($1, $2, 'stopped')`, [OWNER.id, B]);
    ok((await errCode(`select public.stone_library_record_add($1, $2)`, [OWNER.id, JSON.stringify({ stone_id: S_AMETIST, source_id: SRC_API, field_key: "other", lang: "tr", content: "geç", batch_id: B })])) === "SL032", "durmuş pakete kayıt yazılamaz");
    const opB = String(await one(`select public.stone_library_batch_rollback($1, $2, 'ZZ geri al')`, [OWNER.id, B]));
    ok(!(await pubText()).includes("zzpaketkelime") && (await one(`select count(*)::int from public.stone_library_raw where batch_id=$1`, [B])) === 1, "paket geri alındı: kayıt yayından çıktı, ham veri korunur");
    await su.query(`select public.stone_library_restore($1, $2)`, [OWNER.id, opB]);
    ok((await pubText()).includes("zzpaketkelime") && (await one(`select status from public.stone_library_import_batches where id=$1`, [B])) === "stopped", "paket geri alma da geri alınabilir (önceki durum: stopped)");
    const ev = await q<{ kind: string }>(`select kind from public.stone_library_import_events where batch_id=$1 order by id`, [B]);
    ok(ev.map((e) => e.kind).join(",") === "opened,status_running,call_reserved,call_reserved,status_stop_requested,status_stopped,rolled_back", "işlem kaydı eksiksiz ve sıralı", ev.map((e) => e.kind));
    ok((await errCode(`update public.stone_library_import_events set message='x' where batch_id=$1`, [B])) === "SL010", "işlem kaydı değiştirilemez");
    ok((await errCode(`delete from public.stone_library_reviews`)) === "SL010", "inceleme geçmişi silinemez");

    // ── 14) Owner okuma + inceleme geçmişi ─────────────────────────────────────────────────────
    section("14. Owner görünümü ve inceleme geçmişi");
    const ov = (await one(`select public.stone_library_owner_overview($1)`, [OWNER.id])) as Record<string, unknown>;
    ok(JSON.stringify(ov).includes("RoxyAPI (ZZ sentetik test kaynağı)"), "owner gerçek kaynak adını görür");
    const os = (await one(`select public.stone_library_owner_stone($1, $2)`, [OWNER.id, S_AMETIST])) as Record<string, unknown>;
    ok(Array.isArray(os.records) && (os.records as unknown[]).length >= 10, "owner tüm sürümleri görür");
    const revActs = await q<{ a: string }>(`select distinct action a from public.stone_library_reviews`);
    for (const a of ["create", "edit", "approve", "hide", "legal_clear", "publish", "set_current", "delete", "restore", "grant", "revoke", "auto_revoke", "rollback"]) {
      ok(revActs.some((r) => r.a === a), `inceleme geçmişinde '${a}' kaydı`);
    }
    ok((await one(`select count(*)::int from public.stone_library_reviews where action<>'auto_revoke' and actor is null`)) === 0, "owner işlemlerinin hepsinde aktör kayıtlı");

    // ── 15) Katlama: TS ↔ DB birebir ──────────────────────────────────────────────────────────
    section("15. Türkçe normalizasyon (TS ↔ DB)");
    const samples = ["Ametist", "AMETİST", "ametıst", "Kırmızı Jasper", "ŞUNGİT", "Gül Kuvars", "Çakra/Öz-Güç", "Zümrüt", "Lapis  Lazuli!", "İĞNE ığne", "Rhodochrosite", "Pietersite", "Ñandú", "Émeraude", ""];
    const dbFold = await q<{ f: string }>(`select public.stone_library_fold(x) f from unnest($1::text[]) with ordinality t(x, i) order by i`, [samples]);
    ok(samples.every((s, i) => foldStoneLibraryText(s) === dbFold[i].f), "15 örnekte TS ve SQL katlaması aynı", samples.map((s, i) => [s, foldStoneLibraryText(s), dbFold[i].f]).filter((x) => x[1] !== x[2]));

    // ── 16) Mevcut veri son kontrol + dış ağ ───────────────────────────────────────────────────
    section("16. Son kontroller");
    const final = await hashTables(LEGACY_TABLES.filter((t) => !["users", "user_sessions", "tenants"].includes(t)));
    ok(Object.entries(final).every(([t, h]) => before[t] === h), "tüm test boyunca mevcut Doğaltaş / danışan / stok / YH tabloları değişmedi");
    ok(external.length === 0, "dış ağ (sağlayıcı dahil) çağrısı: 0", external);
  } finally {
    await env.stop();
  }
  console.log(`\nstone-library F1 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error("harness çöktü:", e); process.exit(1); });
