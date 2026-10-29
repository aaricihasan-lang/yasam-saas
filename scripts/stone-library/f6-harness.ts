/**
 * Doğaltaş Kütüphanesi F6 — raw_put KAPATMA + OWNER KATMANLARI (sürüm / geri dönüş / yeni taş / ek bilgi / görsel / çeviri /
 * tek adım yayın / toplu silme onayı) + UZMAN ERİŞİMİ + TENANT ETKİSİZLİĞİ testi.
 * İzole embedded-postgres + PostgREST/Storage shim + migration F1 + F2 + F3 + F6-A (0300) + F6-B (0400) + GERÇEK route'lar.
 * Prod/Preview'a SIFIR temas. Sağlayıcı SAHTE (sentetik ZZ_* içerik); dış ağ kilidi açık.
 * Çalıştır: npx tsx scripts/stone-library/f6-harness.ts   (STONE_LIBRARY_F6_PG_PORT, varsayılan 54596)
 */
import "../hd-analysis-word-flow/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import pg from "pg";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { createFakeCrystals, fakeId } from "./fakeCrystals";
import { runCrystalImport, type RawPutArgs, type RunnerSummary } from "../../lib/stone-library/import/runner";
import { isOfficialCrystalsBaseUrl } from "../../lib/stone-library/import/roxyCrystalsClient";
import { findStoneLibraryLeaks, stoneDocAllowedLabels, toExpertStoneDoc } from "../../lib/stone-library/expertDto";
import { hasHealthClaim, healthAnalysis } from "../../lib/stone-library/import/healthLexicon";
import { sniffImage } from "../../lib/stone-library/ownerLayers";
import { blockersFromPublishError, publishGate } from "../../app/admin/dogaltas-kutuphane/_components/publishGate";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const MIGS = ["20271201000000_stone_library_core.sql", "20271201000100_stone_library_f2.sql", "20271201000200_stone_library_f3.sql",
  "20271201000300_stone_library_f6_raw_guard.sql", "20271201000400_stone_library_f6_layers.sql"];
const PORT = Number(process.env.STONE_LIBRARY_F6_PG_PORT ?? 54596);

type Who = { id: string; token: string };
type Res = { status: number; body: string; json: Record<string, unknown>; bytes: Buffer; type: string | null };
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function send(h: Handler, auth: { kind: "user" | "admin"; id?: string; token?: string } | null,
  o: { method?: string; body?: unknown; form?: FormData; query?: string; params?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" };
  if (auth?.id) headers[auth.kind === "admin" ? "x-admin-id" : "x-user-id"] = auth.id;
  if (auth?.token) headers["x-session-token"] = auth.token;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) { body = JSON.stringify(o.body); headers["content-type"] = "application/json"; }
  const req = new NextRequest(`http://localhost/api/test${o.query ?? ""}`, { method: o.method ?? (body ? "POST" : "GET"), headers, body });
  const res = await h(req, { params: Promise.resolve(o.params ?? {}) });
  const bytes = Buffer.from(await res.arrayBuffer());
  const text = bytes.toString("utf8");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* json değil */ }
  return { status: res.status, body: text, json, bytes, type: res.headers.get("content-type") };
}

/** Geçerli küçük PNG (w×h, düz renk). */
function makePng(w: number, h: number, seed: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, "ascii"), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, seed & 0xff)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  const realFetch = globalThis.fetch;
  let fakeHandler: ((u: string, i?: RequestInit) => Promise<Response>) | null = null;
  const external: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    if (/^https:\/\/roxyapi\.com\//.test(u) && fakeHandler) return fakeHandler(u, init);
    external.push(u);
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;

  const fns = [...new Set([...MIGS.map(mig).join("\n").matchAll(/FUNCTION public\.(stone_library_[a-z_]+)\(/g)].map((m) => m[1]))];
  const env: TestEnv = await startAnamnezTestEnv({ port: PORT, dirName: `stone-library-f6-${Date.now()}-${randomUUID().slice(0, 8)}`, rpcAllow: fns, extraSql: MIGS.map(mig) });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  process.env.STONE_LIBRARY_ENABLED = "true";
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []): Promise<T[]> => (await su.query(sql, p)).rows as T[];
  const one = async (sql: string, p: unknown[] = []): Promise<unknown> => { const r = await su.query(sql, p); const row = r.rows[0] as Record<string, unknown> | undefined; return row ? Object.values(row)[0] : undefined; };
  const n = async (sql: string, p: unknown[] = []) => Number(await one(sql, p));
  const errCode = async (sql: string, p: unknown[] = []) => { try { await su.query(sql, p); return null; } catch (e) { return (e as { code?: string }).code ?? "?"; } };

  // Güvenilir içe aktarma kimliği: ayrı bağlantı + SET ROLE stone_library_importer (owner'ın web oturumunda bu rol YOK).
  const imp = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
  await imp.connect();
  const importerRaw = async (a: RawPutArgs): Promise<string> => {
    await imp.query("begin");
    try {
      await imp.query("set local role stone_library_importer");
      const r = await imp.query("select public.stone_library_raw_put($1,$2,$3,$4,$5,$6,$7::jsonb) as id",
        [a.p_actor, a.p_batch_id, a.p_external_id, a.p_lang, a.p_endpoint, a.p_http_status, JSON.stringify(a.p_payload)]);
      await imp.query("commit");
      return String(r.rows[0].id);
    } catch (e) { await imp.query("rollback"); throw e; }
  };
  const importerErr = async (a: RawPutArgs) => { try { await importerRaw(a); return null; } catch (e) { return (e as { code?: string }).code ?? "?"; } };

  try {
    // ── 0) Şema ve ayrıcalıklar ─────────────────────────────────────────────────────────────────
    section("0. Şema ve ayrıcalıklar (F1–F3 + F6-A + F6-B)");
    const tbl = await q<{ relname: string; rls: boolean }>(`select relname, relrowsecurity rls from pg_class where relname like 'stone\\_library\\_%' and relkind='r'`);
    ok(tbl.length === 25 && tbl.every((t) => t.rls), "25 tablo (F3 19 + rezervasyon + 5 owner katmanı), hepsinde RLS açık", tbl.length);
    ok(await n(`select count(*)::int from pg_policies where tablename like 'stone\\_library\\_%'`) === 0, "hiçbir kütüphane tablosunda policy yok");
    ok(await n(`select count(*)::int from (select t.relname, r from pg_class t, unnest(array['anon','authenticated','service_role','stone_library_importer']) r
      where t.relname like 'stone\\_library\\_%' and t.relkind='r' and has_table_privilege(r, t.oid, 'SELECT,INSERT,UPDATE,DELETE')) x`) === 0,
      "hiçbir rolün kütüphane tablolarında ayrıcalığı yok (service_role + aktarım rolü dahil)");
    const svcFns = await q<{ proname: string }>(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'stone\\_library\\_%' and p.proname <> 'stone_library_fold' and has_function_privilege('service_role', p.oid, 'EXECUTE')`);
    ok(svcFns.length === 63, "service_role yalnız 63 RPC (F3 48 − raw_put + F6 yeni 16; expert_image yerine geçer)", svcFns.length);
    ok(!svcFns.some((f) => f.proname === "stone_library_raw_put"), "raw_put service_role'e KAPALI");
    ok(await n(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'stone\\_library\\_%' and has_function_privilege('stone_library_importer', p.oid, 'EXECUTE') and p.proname <> 'stone_library_fold'`) === 1,
      "aktarım rolü yalnız raw_put çalıştırabilir");
    ok(await n(`select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'stone\\_library\\_%' and p.proname <> 'stone_library_fold' and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`) === 0,
      "anon / authenticated hiçbir kütüphane RPC'sini çalıştıramaz");
    for (const f of ["stone_library_readiness", "stone_library_readiness_f3", "stone_library_refresh_stone", "stone_library_refresh_stone_f3", "stone_library_expert_image_f3",
      "stone_library_publish_internal", "stone_library_source_field_text", "stone_library_field_health", "stone_library_owner_data_check", "stone_library_translation_stale"]) {
      ok(await n(`select count(*)::int from pg_proc where proname=$1 and has_function_privilege('service_role', oid, 'EXECUTE')`, [f]) === 0, `iç yardımcı service_role'e kapalı: ${f}`);
    }
    ok(await n(`select count(*)::int from pg_roles where rolname='stone_library_importer' and not rolcanlogin`) === 1, "aktarım rolü NOLOGIN (giriş yalnız açıkça yetkilendirilen ayrı rolle)");

    // ── Kullanıcılar + kaynak ─────────────────────────────────────────────────────────────────
    const T = [randomUUID(), randomUUID()];
    for (const [i, t] of T.entries()) await su.query(`insert into public.tenants(id, name) values ($1,$2)`, [t, `ZZ_F6_T${i}`]);
    let seq = 0;
    const mk = async (label: string, o: { role?: string; stones?: boolean; demo?: boolean; superAdmin?: boolean; tenant?: string } = {}): Promise<Who> => {
      const id = randomUUID(); const token = `zz-f6-tok-${++seq}-${id.slice(0, 8)}`; const role = o.role ?? "expert";
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account, is_super_admin, admin_level)
        values ($1,$2,$3,$4,true,'approved',$5,'premium','premium',$6,$7,$8,$9)`,
        [id, `ZZ_F6_${label}`, `zz.f6.${label.toLowerCase()}@example.test`, role, JSON.stringify(role === "expert" ? { stones: o.stones ?? true, clients: true } : {}),
          o.tenant ?? T[0], o.demo === true, o.superAdmin === true, role === "admin" ? "owner" : null]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token };
    };
    const OWNER = await mk("OWNER", { role: "admin", superAdmin: true });
    const ADMIN = await mk("ADMIN", { role: "admin" });
    const DEMO_OWNER = await mk("DEMOOWNER", { role: "admin", superAdmin: true, demo: true });
    const E1 = await mk("E1");
    const E2 = await mk("E2", { tenant: T[1] });
    const E3 = await mk("E3NOSTONES", { stones: false });
    const asAdmin = (w: Who) => ({ kind: "admin" as const, id: w.id, token: w.token });
    const asUser = (w: Who) => ({ kind: "user" as const, id: w.id, token: w.token });
    const owner = (fn: string, args: Record<string, unknown>) => db.rpc(fn, { p_actor: OWNER.id, ...args }).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === "object" && fn in data[0] ? (data[0] as Record<string, unknown>)[fn] : data;
    });
    const ownerErr = async (fn: string, args: Record<string, unknown>) => { try { await owner(fn, args); return null; } catch (e) { return String((e as { code?: string }).code ?? "?") + "|" + String((e as Error).message); } };
    const hasCode = (r: string | null, c: string) => !!r && r.includes(c);
    const rpcCode = async (fn: string, args: Record<string, unknown>) => { const { error } = await db.rpc(fn, args); return error ? `${error.code}|${error.message}` : null; };

    // Tenant verisi (başka modüller): F6 işlemlerinden önce anlık görüntü.
    await su.query(`insert into public.clients(id, tenant_id, user_id, name) select gen_random_uuid(), $1, $2, 'ZZ Danışan ' || g from generate_series(1,5) g`, [T[0], E1.id]);
    await su.query(`insert into public.client_notes(tenant_id, client_id, notlar) select $1, id, 'ZZ not' from public.clients`, [T[0]]);
    const tenantSnap = async () => String(await one(`select md5(coalesce(string_agg(t || ':' || c, ',' order by t), '')) from (
        select 'clients' t, count(*)::text || md5(coalesce(string_agg(x::text, '' order by x::text), '')) c from public.clients x
        union all select 'client_notes', count(*)::text from public.client_notes
        union all select 'users', md5(coalesce(string_agg(u.id::text || u.role || coalesce(u.tenant_id::text,''), '' order by u.id), '')) from public.users u) s`));
    const snap0 = await tenantSnap();

    const SRC = String(await owner("stone_library_source_save", { p_source_id: null, p_data: { source_key: "zz-f6-api", kind: "api", real_name: "RoxyAPI (ZZ sentetik)", provider_code: "roxy" } }));
    await owner("stone_library_source_save", { p_source_id: SRC, p_data: { license_type: "api_terms", license_terms_url: "https://example.test/terms", license_terms_sha256: "a".repeat(64), commercial_use_ok: true, status: "active", image_rights: "rehost_ok" } });
    const DOC = String(await owner("stone_library_document_add", { p_source_id: SRC, p_data: { doc_kind: "correspondence", title: "ZZ e-posta ekran görüntüsü (sentetik)", content_sha256: "e".repeat(64) } }));
    const LIC = String(await owner("stone_library_license_grant_save", { p_grant_id: null, p_data: {
      source_id: SRC, scope: "crystal_images", granted_on: "2026-10-24", grantor_label: "ZZ sağlayıcı destek ekibi", commercial_display: true, storage_allowed: true,
      post_subscription_rights: true, attribution_required: false, modification_allowed: true, redistribution_limit: "Bağımsız veri seti olarak yeniden dağıtılamaz.",
      max_resolution: "300x300", document_id: DOC, document_sha256: "e".repeat(64) } }));
    await owner("stone_library_license_grant_set_status", { p_grant_id: LIC, p_status: "verified", p_note: "ZZ belge SHA-256 eşleşti" });
    const run = async (fake: ReturnType<typeof createFakeCrystals>, writeRaw: ((a: RawPutArgs) => Promise<string>) | undefined, forceRefetch = false): Promise<RunnerSummary> => {
      fakeHandler = fake.handler;
      return runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, writeRaw,
        client: { baseUrl: "https://roxyapi.com/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: fake.handler, timeoutMs: 300 },
        imageFetch: fake.handler, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 1000, allowanceRemaining: 1000, quotaFloor: 5000,
        termsSha256: "b".repeat(64), sleep: async () => undefined, forceRefetch });
    };

    // ── 1) raw_put güvenlik kapatması ─────────────────────────────────────────────────────────
    section("1. raw_put kapatması: owner web oturumu ham yanıt YAZAMAZ; yalnız güvenilir aktarım rolü + ayrılmış çağrı");
    const fake1 = createFakeCrystals({ count: 91, duplicateImageOf: new Map([[fakeId(31), fakeId(30)]]) });
    const sWeb = await run(fake1, undefined);
    ok(sWeb.status !== "completed" && await n(`select count(*)::int from public.stone_library_raw`) === 0,
      "web yolu (service_role ile raw_put) aktarımı YAPAMAZ, hiçbir ham yanıt yazılmaz", { st: sWeb.status, r: sWeb.stopReason });
    const s1 = await run(fake1, importerRaw);
    ok(s1.status === "completed" && s1.stonesCreated === 91 && s1.imagesStored === 91, "güvenilir aktarım (aktarım rolü) tamamlandı: 91 taş + 91 görsel", { st: s1.status, c: s1.stonesCreated, i: s1.imagesStored, r: s1.stopReason });
    ok(await n(`select count(*)::int from public.stone_library_raw r where not exists (select 1 from public.stone_library_call_reservations c where c.raw_id = r.id)`) === 0,
      "her ham yanıt bir ayrılmış çağrıyı tüketmiş (rezervasyon bağı 1:1)");
    const integ = await owner("stone_library_owner_integrity", { p_stone_id: null }) as Record<string, unknown>;
    ok(integ.ok === true && integ.raw_unverified === 0, "bütünlük: ok + doğrulanmamış ham yanıt 0", integ);
    const B = String(await owner("stone_library_batch_open", { p_data: { source_id: SRC, kind: "api_import", dry_run: false, langs: ["en"], credit_cap: 3, calls_planned: 0, terms_sha256: "b".repeat(64), note: "ZZ negatif" } }));
    await owner("stone_library_batch_set_status", { p_batch_id: B, p_status: "running", p_note: null });
    const rawArgs = (ext: string | null): RawPutArgs => ({ p_actor: OWNER.id, p_batch_id: B, p_external_id: ext, p_lang: "en", p_endpoint: `/crystals/${ext}`, p_http_status: 200,
      p_payload: { id: ext, name: "ZZ sahte", description: "ZZ owner'ın keyfi ham yanıtı" } });
    const svc = await db.rpc("stone_library_raw_put", rawArgs(fakeId(5)));
    ok(!!svc.error, "service_role (owner web oturumu) raw_put çağıramaz", svc.error?.message);
    ok(await importerErr(rawArgs(fakeId(5))) === "SL066", "aktarım rolü de ayrılmamış çağrıyla ham yanıt yazamaz (SL066)");
    await owner("stone_library_batch_reserve_call", { p_batch_id: B, p_external_id: fakeId(5) });
    ok(await importerErr(rawArgs(fakeId(6))) === "SL066", "başka harici kimlik için ayrılmış çağrı kullanılamaz (SL066)");
    // Kaynak adresi sabitleme (DB): ayrılmış çağrı olsa bile uç beyaz liste dışıysa yazılmaz; ayrım tüketilmez.
    const badEps = ["https://evil.test/crystals/x", "/astrology/x", "/crystals/../x", "/crystals_limit_1_x", ""];
    const badCodes: (string | null)[] = [];
    for (const ep of badEps) badCodes.push(await importerErr({ ...rawArgs(fakeId(5)), p_endpoint: ep }));
    ok(badCodes.every((c) => c === "SL067"), "beyaz liste dışı uç (yabancı adres / başka yol / ../ / bozuk sayfalama / boş) reddedilir (SL067)", badCodes);
    ok(await n(`select count(*)::int from public.stone_library_call_reservations where batch_id=$1 and consumed_at is null`, [B]) === 1,
      "reddedilen ham yazım ayrılmış çağrıyı tüketmez");
    // Kaynak adresi sabitleme (aktarım motoru): resmî olmayan taban → paket açılmaz, sahte sunucuya istek gitmez.
    const evil = createFakeCrystals({ count: 3 });
    let evilHits = 0;
    const evilHandler: typeof evil.handler = async (...a) => { evilHits++; return evil.handler(...a); };
    const batches0 = await n(`select count(*)::int from public.stone_library_import_batches`);
    const raws0 = await n(`select count(*)::int from public.stone_library_raw`);
    const sEvil = await runCrystalImport({ db, actor: OWNER.id, sourceId: SRC, licenseGrantId: LIC, writeRaw: importerRaw,
      client: { baseUrl: "https://roxyapi.com.evil.test/api/v2", apiKey: "sentetik-test-anahtari-0123456789abcdef", fetchImpl: evilHandler, timeoutMs: 300 },
      imageFetch: evilHandler, includeImages: true, includeBirthstones: true, includeVocabLists: true, creditCap: 10, allowanceRemaining: 10, quotaFloor: 0,
      termsSha256: "b".repeat(64), sleep: async () => undefined });
    ok(sEvil.status === "stopped" && sEvil.stopReason === "base_url_not_official" && evilHits === 0
      && await n(`select count(*)::int from public.stone_library_import_batches`) === batches0 && await n(`select count(*)::int from public.stone_library_raw`) === raws0,
      "resmî olmayan taban adresi: aktarım başlamaz, sahte sunucuya 0 istek, paket / ham yanıt yazılmaz", { st: sEvil.status, r: sEvil.stopReason, hits: evilHits });
    ok(isOfficialCrystalsBaseUrl("https://roxyapi.com/api/v2/") && !isOfficialCrystalsBaseUrl("http://roxyapi.com/api/v2")
      && !isOfficialCrystalsBaseUrl("https://roxyapi.com.evil.test/api/v2") && !isOfficialCrystalsBaseUrl("https://roxyapi.com/api/v3"), "resmî taban denetimi (https + tam adres)");
    const rOk = await importerRaw(rawArgs(fakeId(5)));
    ok(/^[0-9a-f-]{36}$/.test(rOk), "ayrılmış çağrı + aktarım rolü → ham yanıt yazılır");
    ok(await importerErr(rawArgs(fakeId(5))) === "SL066", "aynı ayrılmış çağrı ikinci kez kullanılamaz (SL066)");
    ok(await errCode(`insert into public.stone_library_raw (batch_id, source_id, external_id, lang, endpoint, http_status, payload) values ($1,$2,$3,'en','/x',200,'{}'::jsonb)`, [B, SRC, fakeId(7)]) === "SL095",
      "doğrudan INSERT (RPC dışı) engellenir (SL095)");
    ok(await errCode(`update public.stone_library_call_reservations set consumed_at = null, raw_id = null where raw_id = $1`, [rOk]) !== null
      && await errCode(`delete from public.stone_library_call_reservations where raw_id = $1`, [rOk]) !== null, "rezervasyon geri açılamaz / silinemez");
    await owner("stone_library_batch_set_status", { p_batch_id: B, p_status: "stop_requested", p_note: "zz" });
    await owner("stone_library_batch_set_status", { p_batch_id: B, p_status: "stopped", p_note: "zz" });
    // Veritabanı atlatılarak (süper kullanıcı) yazılmış sahte ham yanıt → bütünlük yakalar, yayın engellenir.
    const S9 = String(await one(`select stone_id from public.stone_library_external_ids where external_id=$1`, [fakeId(9)]));
    await su.query(`begin; select set_config('stone_library.raw_put','on',true);
      insert into public.stone_library_raw (batch_id, source_id, external_id, lang, endpoint, http_status, payload) values ('${B}','${SRC}','${fakeId(9)}','en','/crystals/zz',200,'{"zz":"sahte"}'::jsonb); commit;`);
    const integ9 = await owner("stone_library_owner_integrity", { p_stone_id: S9 }) as Record<string, unknown>;
    ok(integ9.ok === false && Number(integ9.raw_unverified) >= 1, "rezervasyonsuz ham yanıt bütünlükte yakalanır (raw_unverified)", integ9);
    ok(hasCode(await ownerErr("stone_library_owner_publish", { p_stone_id: S9, p_note: null }), "SL090"), "bütünlüğü bozulan taş tek adımda da yayımlanamaz (SL090)");
    const R = async (p: string) => (await import(`../../app/api/admin/dogaltas-kutuphane/${p}`)) as Record<string, Handler>;
    const akt = (await R("aktarim/route")).POST;
    const aRun = await send(akt, asAdmin(OWNER), { body: { action: "run", source_id: SRC, credit_cap: 10, terms_sha256: "b".repeat(64) } });
    ok(aRun.status === 410 && aRun.json.code === "IMPORT_OFFLINE_ONLY", "web aktarım ucu 'run' kapalı (410 IMPORT_OFFLINE_ONLY), ücretli çağrı yok", aRun.json);
    const aRec = await send(akt, asAdmin(OWNER), { body: { action: "recover", batch_id: B } });
    ok(aRec.status !== 410 && aRec.status !== 500, "takılı paket kurtarma ('recover') çalışmaya devam eder", aRec.status);

    // ── 2) Yetki: owner dışı herkes 404 ────────────────────────────────────────────────────────
    section("2. Yeni owner uçları: owner olmayan admin / demo owner / uzman / sahte oturum / anonim → 404");
    const stoneOf = async (i: number) => String(await one(`select stone_id from public.stone_library_external_ids where external_id=$1`, [fakeId(i)]));
    const slugOf = async (id: string) => String(await one(`select slug from public.stone_library_stones where id=$1`, [id]));
    const S1 = await stoneOf(1); const S2 = await stoneOf(2); const S3 = await stoneOf(3); const S4 = await stoneOf(4);
    const katman = await R("katman/[id]/route"); const gorsel = await R("katman/[id]/gorsel/route");
    const yeni = (await R("yeni-tas/route")).POST; const ceviri = (await R("ceviri/route")).POST; const toplu = (await R("toplu-silme/route")).POST; const katalog = (await R("katalog/route")).GET;
    const probes: [string, Handler, { body?: unknown; params?: Record<string, string>; form?: FormData }][] = [
      ["katalog GET", katalog, {}], ["katman GET", katman.GET, { params: { id: S1 } }],
      ["katman POST", katman.POST, { params: { id: S1 }, body: { action: "publish" } }],
      ["yeni-tas", yeni, { body: { data: { name_tr: "ZZ Yetkisiz" } } }], ["ceviri", ceviri, { body: { op: "publish" } }],
      ["toplu-silme", toplu, { body: { step: "prepare", stone_ids: [S1, S2, S3] } }], ["gorsel GET", gorsel.GET, { params: { id: S1 } }]];
    let denied = 0; let total = 0;
    for (const who of [asAdmin(ADMIN), asAdmin(DEMO_OWNER), asUser(E1), asAdmin(E1), asAdmin({ id: OWNER.id, token: "zz-sahte-token" }), null]) {
      for (const [, h, o] of probes) { total++; if ((await send(h, who, o)).status === 404) denied++; }
    }
    ok(denied === total, `owner dışı ${total} deneme → hepsi 404`, { denied, total });
    ok(hasCode(await rpcCode("stone_library_owner_version_save", { p_actor: E1.id, p_stone_id: S1, p_data: {}, p_health_fields: [], p_publish: false, p_expected_version: null, p_note: null }), "SL001"),
      "DB katmanı: uzman kimliğiyle owner RPC'si reddedilir (SL001)");
    ok(hasCode(await rpcCode("stone_library_bulk_delete_prepare", { p_actor: ADMIN.id, p_stone_ids: [S1, S2, S3] }), "SL001"),
      "DB katmanı: owner olmayan admin toplu silme belirteci alamaz (SL001)");

    // ── 3) Tek adım yayın ─────────────────────────────────────────────────────────────────────
    section("3. Tek adım yayın (taslak → yayında; gereksiz ara onay yok) + yayından kaldırma");
    const recSha0 = String(await one(`select md5(string_agg(id::text || content_sha256 || is_current::text, ',' order by id)) from public.stone_library_records`));
    const facSha0 = String(await one(`select md5(string_agg(id::text || value_key || coalesce(value_text,''), ',' order by id)) from public.stone_library_facets`));
    const allStones = (await q<{ id: string }>(`select id from public.stone_library_stones where deleted_at is null and id <> $1 order by slug`, [S9])).map((r) => r.id);
    let pubOk = 0;
    for (const id of allStones) { const r = await send(katman.POST, asAdmin(OWNER), { params: { id }, body: { action: "publish" } }); if (r.status === 200) pubOk++; }
    ok(pubOk === allStones.length && await n(`select count(*)::int from public.stone_library_stones where status='published'`) === allStones.length,
      `tek adımda ${allStones.length} taş yayımlandı (ayrı "incelemede / hazır" adımı gerekmedi)`, pubOk);
    ok(await n(`select count(*)::int from public.stone_library_published`) === allStones.length, "yayın yüzeyi her yayındaki taş için üretildi");
    const unp = await send(katman.POST, asAdmin(OWNER), { params: { id: S4 }, body: { action: "unpublish" } });
    ok(unp.status === 200 && await one(`select status from public.stone_library_stones where id=$1`, [S4]) === "hidden" && await n(`select count(*)::int from public.stone_library_published where stone_id=$1`, [S4]) === 0,
      "yayından kaldırma: taş gizlenir, uzman yüzeyinden çıkar");
    await send(katman.POST, asAdmin(OWNER), { params: { id: S4 }, body: { action: "publish" } });

    // ── 4) Uzman erişimi ──────────────────────────────────────────────────────────────────────
    section("4. Uzman erişimi: varsayılan kapalı, yalnız yayın, yazma yok, rol / tenant değişiminde yeniden kontrol");
    const D = (await import("../../app/api/dogaltas/kutuphane/[slug]/route")).GET as unknown as Handler;
    const G = (await import("../../app/api/dogaltas/kutuphane/[slug]/gorsel/route")).GET as unknown as Handler;
    const slug1 = await slugOf(S1);
    ok((await send(D, asUser(E1), { params: { slug: slug1 } })).status === 404, "izin verilmemiş uzman → 404 (varsayılan kapalı)");
    const grant = await send((await R("yetkiler/route")).POST, asAdmin(OWNER), { body: { action: "grant", user_id: E1.id } });
    ok(grant.status === 200, "owner uzman erişimi verdi");
    const d1 = await send(D, asUser(E1), { params: { slug: slug1 } });
    ok(d1.status === 200, "izinli uzman yayındaki taşı okur");
    for (const [h, o] of [[katman.POST, { params: { id: S1 }, body: { action: "save_version", data: { name_tr: "ZZ uzman yazısı" } } }], [yeni, { body: { data: { name_tr: "ZZ uzman taşı" } } }]] as const) {
      ok((await send(h as Handler, asUser(E1), o)).status === 404 && (await send(h as Handler, asAdmin(E1), o)).status === 404, "izinli uzman owner uçlarına yazamaz (404)");
    }
    const grant2 = await send((await R("yetkiler/route")).POST, asAdmin(OWNER), { body: { action: "grant", user_id: E2.id } });
    ok(grant2.status === 200 && (await send(D, asUser(E2), { params: { slug: slug1 } })).status === 200, "ikinci tenant uzmanı da izinle okur (genel katalog)");
    await su.query(`update public.users set tenant_id=$2 where id=$1`, [E2.id, T[0]]);
    ok((await send(D, asUser(E2), { params: { slug: slug1 } })).status === 404 && await n(`select count(*)::int from public.stone_library_access_grants where user_id=$1 and revoke_reason='tenant_changed'`, [E2.id]) === 1,
      "tenant değişince erişim otomatik kapanır (tenant_changed)");
    await su.query(`update public.users set tenant_id=$2 where id=$1`, [E2.id, T[1]]);
    const grant3 = await send((await R("yetkiler/route")).POST, asAdmin(OWNER), { body: { action: "grant", user_id: E3.id } });
    ok(grant3.status !== 200, "Doğaltaş izni olmayan uzmana erişim verilemez", grant3.status);

    // ── 5) Owner sürümü + geri dönüş + kaynak dokunulmazlığı ──────────────────────────────────
    section("5. Owner düzenleme katmanı: Taslak Kaydet / Kaydet ve Yayınla / önceki sürüm / özgün kaynak");
    const docOf = async (slug: string) => { const r = await send(D, asUser(E1), { params: { slug } }); return r.status === 200 ? (r.json.item as ReturnType<typeof toExpertStoneDoc>) : null; };
    const rawDoc = async (slug: string) => (await q<{ doc: Record<string, unknown> }>(`select doc from public.stone_library_published where slug=$1`, [slug]))[0]?.doc;
    const descSrc = String(await one(`select content from public.stone_library_records where stone_id=$1 and field_key='description' and lang='tr' and is_current`, [S1]));
    const draft = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "save_version", publish: false, data: { name_tr: "ZZ Owner Adı", fields: { description: "ZZ owner açıklaması taslak." } } } });
    ok(draft.status === 200 && (draft.json.result as Record<string, unknown>).version === 1, "Taslak Kaydet → sürüm 1", draft.json);
    const dd = await rawDoc(slug1);
    ok(dd?.name_tr !== "ZZ Owner Adı" && !JSON.stringify(dd).includes("ZZ owner açıklaması taslak"), "taslak sürüm uzmana görünmez");
    const pubv = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "save_version", publish: true, expected_version: 1,
      data: { name_tr: "ZZ Owner Adı", fields: { description: "ZZ owner açıklaması yayında.", affirmation: "ZZ owner olumlaması." }, facets: { chakra: ["heart", "crown"] }, hardness: { min: 6, max: 7 }, birth_month: [2], numerical_vibration: [7], pairings: [await slugOf(S2)], keywords: { tr: ["ZZ denge", "ZZ huzur"] } } } });
    ok(pubv.status === 200 && (pubv.json.result as Record<string, unknown>).version === 2, "Kaydet ve Yayınla → sürüm 2", pubv.json);
    const conflict = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "save_version", expected_version: 1, data: { name_tr: "ZZ eski sekme" } } });
    ok(conflict.status === 409 && conflict.json.code === "SL099", "eşzamanlı düzenleme çakışması yakalanır (SL099, sessiz üzerine yazma yok)");
    const doc2 = await docOf(slug1);
    const descShown = doc2?.display.fields.find((f) => f.field === "description");
    ok(doc2?.name_tr === "ZZ Owner Adı" && descShown?.display_source === "OWNER_SURUMU" && descShown.content === "ZZ owner açıklaması yayında.",
      "uzman yayındaki owner sürümünü görür (etiket: Owner sürümü)", { n: doc2?.name_tr, d: descShown });
    ok(JSON.stringify(doc2?.facets.chakra?.map((x) => x.key).sort()) === JSON.stringify(["crown", "heart"]) && doc2?.hardness?.min === 6 && doc2?.facets.birth_month?.[0] === 2
      && doc2?.facets.numerical_vibration?.[0] === 7 && doc2?.pairings.length === 1 && doc2.pairings[0].slug === await slugOf(S2),
      "owner facet / sertlik / doğum ayı / titreşim / eşleştirme yayına yansır", { f: doc2?.facets, h: doc2?.hardness, p: doc2?.pairings });
    ok(doc2?.sections.some((s) => s.fields.some((f) => f.field === "description" && f.lang === "tr" && f.content === descSrc)) === true,
      "kaynak Türkçe metin değişmeden 'Kaynak metin' sekmesinde kalır");
    ok(await n(`select count(*)::int from public.stone_library_published where 'heart' = any(chakra) and stone_id=$1`, [S1]) === 1, "owner facet'i uzman filtre aramasına da yansır");
    ok(await errCode(`update public.stone_library_owner_versions set data='{}'::jsonb where stone_id=$1`, [S1]) !== null && await errCode(`delete from public.stone_library_owner_versions where stone_id=$1`, [S1]) !== null,
      "owner sürümleri değiştirilemez / silinemez (yalnız eklenir)");
    ok(hasCode(await ownerErr("stone_library_owner_version_save", { p_stone_id: S1, p_data: { zz: 1 }, p_health_fields: [], p_publish: false, p_expected_version: null, p_note: null }), "SL098")
      && hasCode(await ownerErr("stone_library_owner_version_save", { p_stone_id: S1, p_data: { facets: { chakra: ["zz_yok"] } }, p_health_fields: [], p_publish: false, p_expected_version: null, p_note: null }), "SL098")
      && hasCode(await ownerErr("stone_library_owner_version_save", { p_stone_id: S1, p_data: { pairings: [slug1] }, p_health_fields: [], p_publish: false, p_expected_version: null, p_note: null }), "SL098"),
      "izinsiz alan / sözlükte olmayan facet / kendisiyle eşleştirme reddedilir (SL098)");
    const back1 = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "set_version", version: 1 } });
    const docB1 = await docOf(slug1);
    ok(back1.status === 200 && docB1?.display.fields.find((f) => f.field === "description")?.content === "ZZ owner açıklaması taslak.", "önceki sürüme (v1) dönüş yayına yansır");
    const backSrc = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "set_version", version: null } });
    const docS = await docOf(slug1);
    ok(backSrc.status === 200 && docS?.name_tr !== "ZZ Owner Adı" && docS?.display.fields.find((f) => f.field === "description")?.display_source === "KAYNAK_TR"
      && docS.display.fields.find((f) => f.field === "description")?.content === descSrc, "özgün kaynağa dönüş: kaynak Türkçe metin ve özgün ad geri gelir");
    await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "set_version", version: 2 } });
    ok(String(await one(`select md5(string_agg(id::text || content_sha256 || is_current::text, ',' order by id)) from public.stone_library_records`)) === recSha0
      && String(await one(`select md5(string_agg(id::text || value_key || coalesce(value_text,''), ',' order by id)) from public.stone_library_facets`)) === facSha0,
      "owner işlemleri özgün kaynak kayıtlarına / facet'lerine HİÇ yazmadı (içerik SHA'ları aynı)");
    // Sağlık: owner metni sağlık kilidini atlatamaz.
    const hv = await send(katman.POST, asAdmin(OWNER), { params: { id: S2 }, body: { action: "save_version", publish: true, data: { fields: { meaning_emotional: "ZZ bağışıklık sistemini güçlendirir.", meaning_physical: "ZZ fiziksel owner metni." } } } });
    const docH = await rawDoc(await slugOf(S2));
    const dispH = (docH?.display as { fields: { field: string; display_source: string }[] }).fields;
    ok(hv.status === 200 && !dispH.some((f) => f.display_source === "OWNER_SURUMU"), "owner metnindeki sağlık iddiası ve fiziksel etki alanı hukuk modunda gösterilmez", dispH);
    ok(((await q<{ h: string[] }>(`select health_fields h from public.stone_library_owner_versions where stone_id=$1 order by version desc limit 1`, [S2]))[0].h).sort().join() === "meaning_emotional,meaning_physical",
      "sağlık alanları sunucuda sözlükten hesaplandı (istemci değeri yok)");

    // ── 6) Yeni taş ───────────────────────────────────────────────────────────────────────────
    section("6. + Yeni Taş Ekle: yalnız Türkçe ad zorunlu, dinamik sayım, kaynak verisi bağlanamaz");
    const cnt0 = (await send(katalog, asAdmin(OWNER))).json.counts as Record<string, number>;
    const ny = await send(yeni, asAdmin(OWNER), { body: { data: { name_tr: "ZZ Owner Taşı Şeffaf" } } });
    const NEW = String((ny.json.result as Record<string, unknown>)?.id);
    ok(ny.status === 200 && await one(`select origin || '/' || status from public.stone_library_stones where id=$1`, [NEW]) === "owner/draft", "yalnız adla taslak taş oluşturuldu (köken owner)", ny.json);
    const cnt1 = (await send(katalog, asAdmin(OWNER))).json.counts as Record<string, number>;
    ok(cnt1.total === cnt0.total + 1 && cnt1.owner_created === 1, "katalog sayısı dinamik (sabit 91 yok)", { cnt0, cnt1 });
    ok((await send(yeni, asAdmin(OWNER), { body: { data: { name_tr: "zz owner taşı şeffaf" } } })).json.code === "SL100", "aynı (harf duyarsız) adla ikinci taş reddedilir (SL100)");
    ok((await send(yeni, asAdmin(OWNER), { body: { data: { name_en: "ZZ only EN" } } })).status === 400, "Türkçe ad olmadan taş oluşturulamaz");
    const ny2 = await send(yeni, asAdmin(OWNER), { body: { publish: true, data: { name_tr: "ZZ Owner Taşı Yayında", name_en: "ZZ Owner Stone", fields: { description: "ZZ owner kökenli taş açıklaması." }, facets: { color: ["green"] } } } });
    const NEW2 = String((ny2.json.result as Record<string, unknown>)?.id); const NEW2SLUG = String((ny2.json.result as Record<string, unknown>)?.slug);
    const dN = await docOf(NEW2SLUG);
    ok(ny2.status === 200 && dN?.name_tr === "ZZ Owner Taşı Yayında" && dN.display.fields[0]?.display_source === "OWNER_SURUMU" && dN.sections.length === 0,
      "Kaydet ve Yayınla: owner taşı uzmana yalnız owner sürümüyle görünür (kaynak bölümü yok)", { st: ny2.status, d: dN?.display });
    ok(await errCode(`insert into public.stone_library_external_ids (source_id, external_id, stone_id) values ($1,'zz-sahte-bag',$2)`, [SRC, NEW2]) === "SL096",
      "owner taşına sağlayıcı harici kimliği bağlanamaz (SL096) → lisans / SHA / ham yanıt atanamaz");
    ok(await errCode(`update public.stone_library_stones set origin='source' where id=$1`, [NEW2]) === "SL096", "taş kökeni değiştirilemez (SL096)");
    ok(hasCode(await ownerErr("stone_library_owner_version_set_current", { p_stone_id: NEW2, p_version: null, p_note: null }), "SL099"), "owner taşında 'özgün kaynağa dön' yoktur (SL099)");

    // ── 7) Çeviri katmanı + SHA bağı ──────────────────────────────────────────────────────────
    section("7. Doğrulanmış çeviri: kaynak EN/TR metnine birebir bağ, fallback asla doğrulanmış değil, eskime");
    const FIELDS6 = ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation", "keywords"];
    const srcText = async (stone: string, f: string, lang: string) => String(await one(`select public.stone_library_source_field_text($1,$2,$3,$4)`, [stone, SRC, f, lang]));
    const rows: Record<string, unknown>[] = [];
    const FB = new Set([`${fakeId(3)}|meaning_spiritual`, `${fakeId(4)}|affirmation`, `${fakeId(5)}|affirmation`]);
    for (let i = 1; i <= 91; i++) {
      const st = await stoneOf(i);
      for (const f of FIELDS6) {
        const key = `${fakeId(i)}|${f}`;
        rows.push({ external_id: fakeId(i), field: f, display: FB.has(key) ? "ROXY_TR_FALLBACK" : "DOGRULANMIS_TR_CEVIRI", status: FB.has(key) ? "KAYNAK_ANLAMI_BELIRSIZ" : "NIHAI_ONAY_ADAYI",
          en: await srcText(st, f, "en"), source_tr: await srcText(st, f, "tr"), content_tr: FB.has(key) ? null : `ZZ doğrulanmış çeviri ${i} ${f}`, file_sha_en: "c".repeat(64), file_sha_tr: "d".repeat(64) });
      }
    }
    ok(rows.length === 546, "sentetik paket: 91 taş × 6 alan = 546 satır (543 çeviri + 3 kaynak metin)");
    const dry = await owner("stone_library_translation_import", { p_rows: rows, p_package_ref: "ZZ-F6-SENTETIK", p_dry_run: true }) as Record<string, number>;
    ok(dry.inserted === 546 && dry.fallback === 3 && await n(`select count(*)::int from public.stone_library_translations`) === 0, "deneme çalıştırması yazmaz", dry);
    const bad = rows.map((r, i) => (i === 7 ? { ...r, en: `${String(r.en)} ZZ` } : r));
    ok(hasCode(await ownerErr("stone_library_translation_import", { p_rows: bad, p_package_ref: "ZZ", p_dry_run: false }), "SL097") && await n(`select count(*)::int from public.stone_library_translations`) === 0,
      "tek satırda kaynak EN uyuşmazlığı → tüm aktarım geri alınır (SL097)");
    const badTr = rows.map((r, i) => (i === 9 ? { ...r, source_tr: "ZZ değiştirilmiş kaynak" } : r));
    ok(hasCode(await ownerErr("stone_library_translation_import", { p_rows: badTr, p_package_ref: "ZZ", p_dry_run: false }), "SL097"), "kaynak TR metni de birebir doğrulanır (SL097)");
    const imp1 = await owner("stone_library_translation_import", { p_rows: rows, p_package_ref: "ZZ-F6-SENTETIK", p_dry_run: false }) as Record<string, number>;
    ok(imp1.inserted === 546 && await n(`select count(*)::int from public.stone_library_translations where published_at is not null`) === 0, "546 alan aktarıldı; HİÇBİRİ yayında değil (owner kararı bekler)", imp1);
    const imp2 = await owner("stone_library_translation_import", { p_rows: rows, p_package_ref: "ZZ-F6-SENTETIK", p_dry_run: false }) as Record<string, number>;
    ok(imp2.unchanged === 546 && imp2.inserted === 0, "aynı paket ikinci kez: değişiklik yok (idempotent)", imp2);
    ok(await n(`select count(*)::int from public.stone_library_translations t join public.stone_library_records r on r.stone_id=t.stone_id and r.field_key=t.field_key and r.lang='en' and r.is_current
      where t.field_key <> 'keywords' and t.source_en_sha256 <> r.content_sha256`) === 0, "çeviri bağı = kaynak EN kaydının SHA-256'sı (veritabanında hesaplandı)");
    ok(await errCode(`update public.stone_library_translations set content_tr='ZZ kurcalama' where field_key='description'`) === "SL097", "çeviri metni değiştirilemez (SL097)");
    ok(await errCode(`update public.stone_library_translations set published_at=now(), published_by=$1 where display_kind='source_tr_fallback'`, [OWNER.id]) === "23514",
      "kaynak metin (fallback) alanı doğrudan veritabanında bile 'doğrulanmış' yayımlanamaz");
    const pdry = await send(ceviri, asAdmin(OWNER), { body: { op: "publish", dry_run: true } });
    const pr = pdry.json.result as Record<string, number>;
    ok(pdry.status === 200 && pr.affected === 543 && pr.excluded_fallback === 3 && pr.excluded_stale === 0, "toplu yayın önizlemesi: 543 etkilenecek, 3 fallback sunucuda hariç", pr);
    const preal = await send(ceviri, asAdmin(OWNER), { body: { op: "publish" } });
    ok((preal.json.result as Record<string, number>).affected === 543 && await n(`select count(*)::int from public.stone_library_translations where published_at is not null`) === 543, "543 doğrulanmış çeviri yayında");
    const S3slug = await slugOf(S3);
    const d3 = await docOf(S3slug);
    ok(d3?.display.fields.find((f) => f.field === "meaning_spiritual")?.display_source === "KAYNAK_TR" && d3.display.verified_available.meaning_spiritual !== true
      && d3.display.fields.find((f) => f.field === "description")?.display_source === "DOGRULANMIS_TR_CEVIRI",
      "fallback alan uzmana 'Kaynak metin (Türkçe)' olarak gelir; 'doğrulanmış' seçeneği kapalı", d3?.display);
    ok(d3?.display.fields.every((f) => f.field !== "meaning_physical") === true, "sağlık kilidi çeviri katmanında da geçerli (fiziksel etki gösterilmez)");
    const d1t = await docOf(slug1);
    ok(d1t?.display.fields.find((f) => f.field === "description")?.display_source === "OWNER_SURUMU" && d1t.display.fields.find((f) => f.field === "meaning_spiritual")?.display_source === "DOGRULANMIS_TR_CEVIRI",
      "katman sırası: Owner sürümü → doğrulanmış çeviri → kaynak TR");
    ok(d1t?.display.verified_content.description === "ZZ doğrulanmış çeviri 1 description", "owner sürümü gösterilen alanda da doğrulanmış çeviri metni uzmana ayrıca sunulur", d1t?.display.verified_content);
    // Eskime: kaynak yeniden aktarılır, EN kaydında yeni sürüm owner tarafından güncel yapılır → çeviri gösterilmez + yayımlanamaz.
    const fake2 = createFakeCrystals({ count: 91, revision: 2, longText: new Set([fakeId(3)]), duplicateImageOf: new Map([[fakeId(31), fakeId(30)]]) });
    const s2 = await run(fake2, importerRaw, true);
    ok(s2.status === "completed", "yeniden aktarım (güvenilir yol) tamamlandı", s2.stopReason);
    const newEn = (await q<{ id: string }>(`select id from public.stone_library_records where stone_id=$1 and field_key='description' and lang='en' and not is_current and deleted_at is null order by version desc limit 1`, [S3]))[0];
    if (newEn) await owner("stone_library_record_set_current", { p_record_id: newEn.id, p_note: "ZZ kaynak güncellemesi kabul" });
    const stale = await q<{ s: boolean }>(`select public.stone_library_translation_stale(t) s from public.stone_library_translations t where t.stone_id=$1 and t.field_key='description' and t.superseded_at is null`, [S3]);
    const d3s = await docOf(S3slug);
    ok(!!newEn && stale[0]?.s === true && d3s?.display.fields.find((f) => f.field === "description")?.display_source !== "DOGRULANMIS_TR_CEVIRI",
      "kaynak EN değişince çeviri 'eskimiş' sayılır ve gösterilmez", { newEn: !!newEn, stale, d: d3s?.display.fields.find((f) => f.field === "description") });
    const rep = await send(katman.POST, asAdmin(OWNER), { params: { id: S3 }, body: { action: "translation", field: "description", op: "publish", dry_run: true } });
    ok((rep.json.result as Record<string, number>)?.excluded_stale >= 0 && (rep.json.result as Record<string, number>).affected === 0, "eskimiş alan yeniden yayımlanamaz (sunucu hariç tutar)", rep.json.result);
    const unpT = await send(katman.POST, asAdmin(OWNER), { params: { id: S2 }, body: { action: "translation", field: "affirmation", op: "unpublish" } });
    ok((unpT.json.result as Record<string, number>)?.affected === 1, "alan bazında çeviri yayından kaldırılabilir");

    // ── 8) Ek bilgiler / uyarılar ─────────────────────────────────────────────────────────────
    section("8. Ek Bilgiler ve Uzman Notları (çeviriden ayrı; yalnız owner yazar)");
    const n1 = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "note_save", data: { kind: "note", title: "ZZ Uygulama notu", body: "ZZ meditasyonda elde tutulur." } } });
    const n2 = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "note_save", data: { kind: "warning", body: "ZZ suyla temizlenmez." } } });
    await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "note_save", data: { kind: "note", body: "ZZ yalnız owner notu.", visible_to_experts: false } } });
    await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "note_save", data: { kind: "note", body: "ZZ migreni tedavi eder." } } });
    const dn = await docOf(slug1);
    ok(n1.status === 200 && n2.status === 200 && dn?.owner_info.length === 2 && dn.owner_info[0].kind === "warning" && !JSON.stringify(dn.owner_info).includes("yalnız owner")
      && !JSON.stringify(dn.owner_info).includes("migren"), "uzman: uyarı + not görünür; owner'a özel ve sağlık iddialı not gizli", dn?.owner_info);
    const noteId = String(n1.json.result);
    await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "note_delete", note_id: noteId } });
    ok((await docOf(slug1))?.owner_info.length === 1, "ek bilgi silme (geri alınabilir)");
    await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "note_restore", note_id: noteId } });
    ok((await docOf(slug1))?.owner_info.length === 2, "ek bilgi geri yükleme");

    // ── 9) Görseller ──────────────────────────────────────────────────────────────────────────
    section("9. Owner görseli: içerik doğrulama, boyut, güvenli yol, birincil yap / kaynağa dön / sil");
    const up = (id: string, buf: Buffer, extra: Record<string, string> = {}) => {
      const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(buf)], { type: "image/png" }), "zz.png");
      for (const [k, v] of Object.entries(extra)) fd.append(k, v);
      return send(gorsel.POST, asAdmin(OWNER), { params: { id }, form: fd });
    };
    for (const im of await q<{ id: string }>(`select id from public.stone_library_images where stone_id=$1 and deleted_at is null`, [S1])) {
      await owner("stone_library_image_review", { p_image_id: im.id, p_action: "approve", p_note: "ZZ kaynak görseli onayı" });
    }
    const srcImg0 = String(await one(`select md5(string_agg(id::text || sha256 || coalesce(deleted_at::text,''), ',' order by id)) from public.stone_library_images`));
    const png = makePng(120, 90, 7);
    ok(sniffImage(png)?.width === 120 && sniffImage(png)?.height === 90, "sunucu görsel imzası + boyutu dosya içeriğinden okur");
    const fakeImg = Buffer.concat([Buffer.from("<svg onload=alert(1)>"), Buffer.alloc(200)]);
    ok((await up(S1, fakeImg)).status === 415, "görsel olmayan içerik (uzantı/MIME png olsa da) reddedilir (415)");
    ok((await up(S1, Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]))).status === 413, "2 MB üstü reddedilir (413)");
    ok((await up(S1, png, { license_status: "documented" })).status === 400, "belge açıklaması olmadan 'belgeli' işaretlenemez");
    const u1 = await up(S1, png, { license_status: "undocumented" });
    const IMG1 = String(u1.json.image_id);
    ok(u1.status === 200 && u1.json.license_status === "undocumented", "owner görseli yüklendi (belgesiz olarak işaretli)", u1.json);
    const pth = String(await one(`select storage_path from public.stone_library_owner_images where id=$1`, [IMG1]));
    ok(pth === `owner/${S1}/${createHash("sha256").update(png).digest("hex")}.png`, "depo yolu sunucuda üretilir: owner/<taş>/<sha>.png");
    const gi = await send(G, asUser(E1), { params: { slug: slug1 } });
    ok(gi.status === 200 && Buffer.compare(gi.bytes, png) === 0, "uzman görsel ucu owner birincil görselini verir");
    ok(JSON.stringify(await rawDoc(slug1)).includes('"available": true') || (await docOf(slug1))?.image?.available === true, "yayın belgesinde görsel var");
    const rd = (await send(katman.GET, asAdmin(OWNER), { params: { id: S1 } })).json.readiness as { warnings: string[] };
    ok(rd.warnings.includes("owner_image_undocumented"), "belgesiz owner görseli owner'a uyarı olarak gösterilir (doğrulandı denmez)", rd.warnings);
    ok((await send(katman.POST, asAdmin(OWNER), { params: { id: S2 }, body: { action: "image_delete", image_id: IMG1 } })).status === 404, "başka taşın görseli bu taş üzerinden değiştirilemez");
    ok(hasCode(await ownerErr("stone_library_owner_image_set_primary", { p_stone_id: S2, p_image_id: IMG1 }), "SL089"), "başka taşın görseli birincil yapılamaz (SL089)");
    const srcImg = await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "image_primary", image_id: null } });
    const gi2 = await send(G, asUser(E1), { params: { slug: slug1 } });
    ok(srcImg.status === 200 && gi2.status === 200 && Buffer.compare(gi2.bytes, png) !== 0, "kaynak görseline dönüş (mevcut lisanslı görsel korunur)");
    await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "image_primary", image_id: IMG1 } });
    await send(katman.POST, asAdmin(OWNER), { params: { id: S1 }, body: { action: "image_delete", image_id: IMG1 } });
    const gi3 = await send(G, asUser(E1), { params: { slug: slug1 } });
    ok(gi3.status === 200 && Buffer.compare(gi3.bytes, png) !== 0 && await one(`select image_choice from public.stone_library_stones where id=$1`, [S1]) === "source",
      "birincil owner görseli silinince kaynak görseline düşülür");
    ok(String(await one(`select md5(string_agg(id::text || sha256 || coalesce(deleted_at::text,''), ',' order by id)) from public.stone_library_images`)) === srcImg0,
      "kaynak görselleri silinmedi / değiştirilmedi (md5 aynı)");
    ok(await n(`select count(*)::int from public.stone_library_images i where 'duplicate_image' = any(i.quality_flags) and i.deleted_at is null`) >= 1,
      "aynı görseli paylaşan taş (Jasper / Kırmızı Jasper benzeri) işaretli kalır");

    // ── 9b) F7: owner kapak önizlemesi (taslak / lisans durumundan bağımsız, YALNIZ owner) + yayın kapısı ─────────
    section("9b. Owner kapak önizlemesi + görsel izin özeti + 'Yayınla' kapısı (F7 tek çalışma alanı)");
    const kapak = (await R("taslar/[id]/kapak/route")).GET;
    const detay = (await R("taslar/[id]/route")).GET;
    const k1 = await send(kapak, asAdmin(OWNER), { params: { id: S1 } });
    ok(k1.status === 200 && String(k1.type).startsWith("image/") && k1.bytes.length > 0, "owner kapak: kaynak görseli bayt olarak gelir", { status: k1.status, type: k1.type });
    let kDenied = 0; let kTotal = 0;
    for (const who of [asAdmin(ADMIN), asAdmin(DEMO_OWNER), asUser(E1), asAdmin(E1), asAdmin({ id: OWNER.id, token: "zz-sahte-token" }), null]) {
      for (const h of [kapak, detay]) { kTotal++; const r = await send(h, who, { params: { id: S1 } }); if (r.status === 404 && !String(r.type).startsWith("image/")) kDenied++; }
    }
    ok(kDenied === kTotal, `kapak + taş ayrıntısı: owner dışı ${kTotal} deneme → hepsi 404 (bayt yok)`, { kDenied, kTotal });
    const det = await send(detay, asAdmin(OWNER), { params: { id: S1 } });
    const lic = (det.json.image_licenses ?? []) as Record<string, unknown>[];
    ok(det.status === 200 && Array.isArray(det.json.images) && lic.length >= 1 && lic.every((g) => Object.keys(g).sort().join(",") === "evidence_status,id,scope"),
      "taş ayrıntısı: görsel izin özeti yalnız kimlik / kapsam / kanıt durumu", lic);
    const png2 = makePng(64, 48, 11);
    const u2 = await up(S2, png2, { license_status: "undocumented", make_primary: "true" });
    const k2 = await send(kapak, asAdmin(OWNER), { params: { id: S2 } });
    ok(u2.status === 200 && k2.type === "image/png" && Buffer.compare(k2.bytes, png2) === 0, "kapak: owner görseli birincilse birebir o görsel", { up: u2.status, type: k2.type });
    await send(katman.POST, asAdmin(OWNER), { params: { id: S2 }, body: { action: "image_primary", image_id: null } });
    const k3 = await send(kapak, asAdmin(OWNER), { params: { id: S2 } });
    ok(k3.status === 200 && Buffer.compare(k3.bytes, png2) !== 0, "kapak: kaynak görseline dönünce yeniden kaynak görseli");
    await send(katman.POST, asAdmin(OWNER), { params: { id: S2 }, body: { action: "image_delete", image_id: String(u2.json.image_id) } });
    ok(publishGate({ ready: false, blockers: ["records_pending", "facets_pending", "no_visible_content"] }).canTry, "yayın kapısı: bekleyen kayıt engelleri tek adım yayınla çözülür → düğme etkin");
    ok(!publishGate({ ready: false, blockers: ["integrity_failed", "records_pending"] }).canTry, "yayın kapısı: bütünlük engeli düğmeyi kilitler");
    ok(!publishGate({ ready: false, blockers: ["no_visible_content"] }).canTry, "yayın kapısı: bekleyen kayıt yokken görünür içerik yoksa kilitli");
    ok(publishGate({ ready: true, blockers: [] }).canTry, "yayın kapısı: hazır taş → etkin");
    ok(JSON.stringify(blockersFromPublishError('stone_library_publish: yayına hazır değil: ["no_visible_content", "integrity_failed"]')) === '["no_visible_content","integrity_failed"]',
      "sunucu yayın reddinden kalan engel kodları okunur");

    // ── 10) Toplu silme ───────────────────────────────────────────────────────────────────────
    section("10. Toplu silme: 3+ taşta üç aşamalı onay (belirteç + 'SİL'), geri alınabilir");
    const ids5 = [await stoneOf(60), await stoneOf(61), await stoneOf(62)];
    ok((await send(toplu, asAdmin(OWNER), { body: { step: "prepare", stone_ids: ids5.slice(0, 2) } })).status === 400, "2 taş toplu silme yoluna giremez (tekil silme kullanılır)");
    const prep = await send(toplu, asAdmin(OWNER), { body: { step: "prepare", stone_ids: ids5 } });
    const TOK = String((prep.json.result as Record<string, unknown>)?.token);
    ok(prep.status === 200 && (prep.json.result as Record<string, unknown>).count === 3 && (prep.json.result as Record<string, unknown>).published === 3, "1. aşama: belirteç + sayılı özet (3 taş, 3 yayında)", prep.json);
    ok((await send(toplu, asAdmin(OWNER), { body: { step: "confirm", token: TOK, confirm_text: "sil" } })).json.code === "SL101", "yanlış onay metni reddedilir (SL101)");
    ok(hasCode(await rpcCode("stone_library_bulk_delete_confirm", { p_actor: DEMO_OWNER.id, p_token: TOK, p_confirm_text: "SİL", p_reason: null }), "SL001"),
      "belirteç başka aktörle kullanılamaz");
    const prepX = await owner("stone_library_bulk_delete_prepare", { p_stone_ids: [await stoneOf(70), await stoneOf(71), await stoneOf(72)] }) as Record<string, unknown>;
    await su.query(`update public.stone_library_bulk_tokens set expires_at = now() - interval '1 second' where id=$1`, [prepX.token]);
    ok(hasCode(await ownerErr("stone_library_bulk_delete_confirm", { p_token: prepX.token, p_confirm_text: "SİL", p_reason: null }), "SL101"), "süresi dolan belirteç reddedilir (SL101)");
    const conf = await send(toplu, asAdmin(OWNER), { body: { step: "confirm", token: TOK, confirm_text: "SİL", reason: "ZZ toplu silme" } });
    ok(conf.status === 200 && (conf.json.result as Record<string, unknown>).deleted === 3 && await n(`select count(*)::int from public.stone_library_stones where id = any($1::uuid[]) and deleted_at is not null and status='hidden'`, [ids5]) === 3,
      "3. aşama: yayındakiler yayından kaldırılıp geri alınabilir biçimde silindi", conf.json);
    ok(await n(`select count(*)::int from public.stone_library_published where stone_id = any($1::uuid[])`, [ids5]) === 0, "silinen taşlar uzman yüzeyinden çıktı");
    ok((await send(toplu, asAdmin(OWNER), { body: { step: "confirm", token: TOK, confirm_text: "SİL" } })).json.code === "SL101", "belirteç tek kullanımlık");
    const rest = await send(toplu, asAdmin(OWNER), { body: { step: "restore", token: TOK } });
    ok(rest.status === 200 && (rest.json.result as Record<string, unknown>).restored === 3 && await n(`select count(*)::int from public.stone_library_stones where id = any($1::uuid[]) and deleted_at is null`, [ids5]) === 3,
      "toplu silme tamamen geri alındı");
    ok(await n(`select count(*)::int from public.stone_library_stones where deleted_at is null`) === cnt1.total + 1, "kalıcı silme yok; toplam sayım geri geldi");

    // ── 11) Sızıntı + sağlık sözlüğü ──────────────────────────────────────────────────────────
    section("11. Uzman yanıtı sızıntı taraması + sağlık sözlüğü bağlamı");
    let leakFree = 0; let checked = 0;
    for (const s of (await q<{ slug: string }>(`select slug from public.stone_library_published order by slug limit 40`))) {
      const r = await send(D, asUser(E1), { params: { slug: s.slug } });
      const d = r.status === 200 ? (r.json.item as ReturnType<typeof toExpertStoneDoc>) : null;
      checked++;
      if (d && findStoneLibraryLeaks(d, stoneDocAllowedLabels(d)).length === 0 && !/OWNER_SURUMU.*draft|superseded|stale|owner_version|health_fields/i.test(r.body)) leakFree++;
    }
    ok(checked > 0 && leakFree === checked, `uzman yanıtlarında iç durum / kimlik / sağlayıcı sızıntısı yok (${checked} taş)`, { leakFree, checked });
    ok(!hasHealthClaim("ZZ yaratıcılığı destekler.") && !hasHealthClaim("ZZ Spinel kartı.") && !hasHealthClaim("ZZ Bloodstone kartı.")
      && !hasHealthClaim("ZZ is treated as a fragile sample."), "kanıtlı yanlış pozitifler (yaratıcı / Spinel / Bloodstone / treated as) işaretlenmez");
    ok(!hasHealthClaim("ZZ emotional wounds sample.") && !hasHealthClaim("ZZ iyileştirici enerji örneği.") && hasHealthClaim("ZZ iyileştirici kabul edilir.")
      && hasHealthClaim("ZZ pain immune örneği.") && hasHealthClaim("ZZ depression örneği."), "yumuşak kökler yalnız duygusal bağlamda bastırılır; güçlü kökler her zaman işaretli");
    ok(healthAnalysis("ZZ emotional pain örneği.").suppressed.includes("pain"), "bastırılan kök raporlanır (owner denetimi için)");

    // ── 12) Diğer modüller ────────────────────────────────────────────────────────────────────
    section("12. Diğer modüller / tenant verisi etkilenmedi");
    ok(await n(`select count(*)::int from public.clients`) === 5 && await n(`select count(*)::int from public.client_notes`) === 5, "test tenant verisi yerinde (5 danışan + 5 not)");
    ok(await tenantSnap() === snap0, "tenant tabloları (danışanlar, notlar, kullanıcı rol/tenant) F6 işlemlerinden sonra birebir aynı (md5)");
    ok(await n(`select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relname !~ '^stone_library_' and c.relnamespace='public'::regnamespace and t.tgname ~ 'stone_library'`) === 0,
      "kütüphane tetikleyicileri başka modül tablolarına bağlanmadı");
    ok(external.length === 0, "dış ağ çağrısı yok (gerçek sağlayıcıya 0 istek)", external.slice(0, 3));
  } finally {
    await imp.end().catch(() => undefined);
    await env.stop().catch(() => undefined);
    globalThis.fetch = realFetch;
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:\n - " + fails.join("\n - ")); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
