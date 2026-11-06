// KİŞİSEL DİJİTAL OFİS — expert_workspace_designs + expert_ui_prefs (20271227000000) GERÇEK PostgreSQL doğrulaması.
// YALNIZ yerel geçici embedded-postgres; production / staging / uzak DB YOK. Sentetik kayıtlar; sonunda geçici dizin silinir.
// Kapsam: idempotency (2×), RLS + rol yetkileri (anon/authenticated sıfır, service_role SELECT/INSERT + kolon UPDATE, DELETE/
// TRUNCATE yok), kimlik değişmezliği + sürüm adımı tetikleyicisi, CHECK'ler (geçmiş ≤ 10, Favorilerim ≤ 8, enum, boyut),
// uzman başına tek satır, iyimser kilit (aynı sürümle iki eşzamanlı UPDATE → yalnız biri), hesap temizleme tablo keşfi,
// geri alma migration'ı olmadığı (DROP/TRUNCATE/DELETE yok).
// Çalıştırma: node scripts/workspace/pg/workspace-tables.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { compareManifest } from "../../final-hardening/drift/compare.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG = path.join(REPO, "supabase/migrations/20271227000000_expert_workspace_designs_prefs.sql");
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UA = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const UB = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";

const watchdog = setTimeout(() => {
  console.error("FAIL workspace-tables: 4 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 4 * 60_000);
watchdog.unref();
const opened = new Set();
async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 56000 + Math.floor(Math.random() * 3000);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kdo-workspace-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
const client = () => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  c.on("error", () => {});
  opened.add(c);
  return c;
};
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function expectErr(c, sql, params, code, re) {
  await c.query("SAVEPOINT x");
  try {
    await c.query(sql, params);
    await c.query("RELEASE SAVEPOINT x");
    return { ok: false, got: "hata yok" };
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT x");
    return { ok: e.code === code && (!re || re.test(String(e.message))), got: `${e.code} ${String(e.message).slice(0, 90)}` };
  }
}
const D_INS = "INSERT INTO public.expert_workspace_designs (tenant_id, user_id, applied, draft, history) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb) RETURNING id, version";
const P_INS = "INSERT INTO public.expert_ui_prefs (tenant_id, user_id, hidden_modules, favorites, card_level, view_mode, reading) VALUES ($1,$2,$3::text[],$4::text[],$5,$6,$7::jsonb) RETURNING id, version";
const hist = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: crypto.randomUUID(), savedAt: "2026-11-01T00:00:00Z", design: { layout: "A", i } })));

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  const sql = fs.readFileSync(MIG, "utf8");
  await admin.query(sql);
  let second = true;
  try {
    await admin.query(sql);
  } catch {
    second = false;
  }
  check("W01 migration iki kez çalışır (idempotent)", second);
  check("W02 migration DROP TABLE / TRUNCATE / DELETE FROM içermez (veri silen geri alma yok)", !/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(sql.replace(/--[^\n]*/g, "")));

  // ── Yetkiler + RLS ──
  for (const t of ["expert_workspace_designs", "expert_ui_prefs"]) {
    const r = (await admin.query(`SELECT
        has_table_privilege('anon','public.${t}','SELECT') a_s, has_table_privilege('anon','public.${t}','INSERT') a_i,
        has_table_privilege('authenticated','public.${t}','SELECT') u_s, has_table_privilege('authenticated','public.${t}','INSERT') u_i,
        has_table_privilege('authenticated','public.${t}','UPDATE') u_u, has_table_privilege('authenticated','public.${t}','DELETE') u_d,
        has_table_privilege('service_role','public.${t}','SELECT') s_s, has_table_privilege('service_role','public.${t}','INSERT') s_i,
        has_table_privilege('service_role','public.${t}','DELETE') s_d, has_table_privilege('service_role','public.${t}','TRUNCATE') s_t,
        has_table_privilege('service_role','public.${t}','REFERENCES') s_r, has_table_privilege('service_role','public.${t}','TRIGGER') s_tr,
        has_column_privilege('service_role','public.${t}','user_id','UPDATE') s_u_user, has_column_privilege('service_role','public.${t}','tenant_id','UPDATE') s_u_tenant,
        has_column_privilege('service_role','public.${t}','id','UPDATE') s_u_id, has_column_privilege('service_role','public.${t}','version','UPDATE') s_u_ver,
        (SELECT relrowsecurity FROM pg_class WHERE oid='public.${t}'::regclass) rls,
        (SELECT count(*) FROM pg_policies WHERE tablename='${t}')::int pol`)).rows[0];
    check(`W03 ${t}: anon / authenticated hiçbir yetkiye sahip değil`, !r.a_s && !r.a_i && !r.u_s && !r.u_i && !r.u_u && !r.u_d, JSON.stringify(r));
    check(`W04 ${t}: RLS açık, istemci politikası yok`, r.rls === true && r.pol === 0);
    check(`W05 ${t}: service_role SELECT + INSERT var; DELETE / TRUNCATE / REFERENCES / TRIGGER yok`, r.s_s && r.s_i && !r.s_d && !r.s_t && !r.s_r && !r.s_tr);
    check(`W06 ${t}: service_role kimlik kolonlarını (id, user_id, tenant_id) güncelleyemez; version güncelleyebilir`, !r.s_u_user && !r.s_u_tenant && !r.s_u_id && r.s_u_ver);
  }
  const fn = (await admin.query(`SELECT has_function_privilege('anon','public.expert_workspace_row_guard()','EXECUTE') a, has_function_privilege('authenticated','public.expert_workspace_row_guard()','EXECUTE') u,
      (SELECT prosecdef FROM pg_proc WHERE proname='expert_workspace_row_guard') sd`)).rows[0];
  check("W07 tetikleyici fonksiyonu istemciye kapalı ve SECURITY DEFINER değil", !fn.a && !fn.u && fn.sd === false);

  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE anon");
  check("W08 anon SELECT → 42501", (await expectErr(admin, "SELECT 1 FROM public.expert_workspace_designs", [], "42501")).ok);
  await admin.query("ROLLBACK");
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE authenticated");
  check("W09 authenticated INSERT → 42501", (await expectErr(admin, P_INS, [TA, UA, "{}", "{}", "center", "auto", "{}"], "42501")).ok);
  await admin.query("ROLLBACK");

  // ── Güvenlik manifesti (supabase/expected-manifest.json) — gerçek katalogla karşılaştırma ──
  const full = JSON.parse(fs.readFileSync(path.join(REPO, "supabase/expected-manifest.json"), "utf8"));
  const T = ["expert_workspace_designs", "expert_ui_prefs"];
  const F = ["expert_workspace_row_guard"];
  check("W34 manifest: iki tablo tables_no_client_grant + tables_rls_enabled, fonksiyon functions_no_client_execute listesinde",
    T.every((t) => full.tables_no_client_grant.names.includes(t) && full.tables_rls_enabled.names.includes(t)) && F.every((f) => full.functions_no_client_execute.names.includes(f)));
  const actualManifest = (await admin.query(fs.readFileSync(path.join(REPO, "scripts/final-hardening/drift/manifest.sql"), "utf8"))).rows[0].manifest;
  const cmp = compareManifest(actualManifest, {
    functions_no_client_execute: { names: F },
    tables_no_client_grant: { names: T },
    tables_rls_enabled: { names: T },
    tables_no_client_dangerous_privileges: full.tables_no_client_dangerous_privileges,
    broad_client_policies_absent: full.broad_client_policies_absent,
  });
  check("W35 drift karşılaştırması (compare.mjs) bu migration için FAIL üretmez", cmp.fails.length === 0 && cmp.checked > 0, cmp.fails.length ? JSON.stringify(cmp.fails).slice(0, 300) : "");
  await admin.query("BEGIN");
  await admin.query("GRANT SELECT ON public.expert_ui_prefs TO anon");
  const leaked = (await admin.query(fs.readFileSync(path.join(REPO, "scripts/final-hardening/drift/manifest.sql"), "utf8"))).rows[0].manifest;
  await admin.query("ROLLBACK");
  const cmpLeak = compareManifest(leaked, { tables_no_client_grant: { names: T }, tables_rls_enabled: { names: T } });
  check("W36 kasıtlı anon yetkisi drift karşılaştırmasında FAIL olarak yakalanır (geri alındı)", cmpLeak.fails.some((f) => f.includes("expert_ui_prefs")), JSON.stringify(cmpLeak.fails).slice(0, 200));

  // ── service_role akışı ──
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const d1 = await admin.query(D_INS, [TA, UA, null, '{"layout":"B"}', "[]"]);
  check("W10 tasarım satırı eklenir, version 1", d1.rows[0].version === 1);
  check("W11 uzman başına (tenant içinde) tek tasarım satırı (UNIQUE tenant_id, user_id)", (await expectErr(admin, D_INS, [TA, UA, null, null, "[]"], "23505", /expert_wd_user_uq/)).ok);
  check("W12 geçmiş 11 kayıt → CHECK reddi", (await expectErr(admin, D_INS, [TB, UB, null, null, hist(11)], "23514", /expert_wd_history_chk/)).ok);
  check("W13 applied dizi → CHECK reddi", (await expectErr(admin, D_INS, [TB, UB, "[1]", null, "[]"], "23514", /expert_wd_applied_chk/)).ok);
  check("W14 32 KB üstü taslak → CHECK reddi", (await expectErr(admin, D_INS, [TB, UB, null, JSON.stringify({ x: "a".repeat(40_000) }), "[]"], "23514", /expert_wd_draft_chk/)).ok);
  const d10 = await admin.query(D_INS, [TB, UB, null, null, hist(10)]);
  check("W15 tam 10 geçmiş kabul", d10.rowCount === 1);
  const p1 = await admin.query(P_INS, [TA, UA, "{center:stok}", "{module:stones,module:numerology}", "module", "night", '{"scale":1.2}']);
  check("W16 tercih satırı eklenir", p1.rows[0].version === 1);
  check("W17 9 favori → CHECK reddi", (await expectErr(admin, P_INS, [TB, UB, "{}", `{${Array.from({ length: 9 }, (_, i) => `module:m${i}`).join(",")}}`, "center", "auto", "{}"], "23514", /expert_up_favorites_chk/)).ok);
  check("W18 NULL favori öğesi → CHECK reddi", (await expectErr(admin, P_INS, [TB, UB, "{}", "{NULL}", "center", "auto", "{}"], "23514", /expert_up_favorites_chk/)).ok);
  check("W19 geçersiz görünüm modu → CHECK reddi", (await expectErr(admin, P_INS, [TB, UB, "{}", "{}", "center", "neon", "{}"], "23514", /expert_up_view_mode_chk/)).ok);
  check("W20 geçersiz kart görünümü → CHECK reddi", (await expectErr(admin, P_INS, [TB, UB, "{}", "{}", "grid", "auto", "{}"], "23514", /expert_up_card_level_chk/)).ok);
  check("W21 service_role DELETE → 42501", (await expectErr(admin, "DELETE FROM public.expert_ui_prefs WHERE user_id=$1", [UA], "42501")).ok);
  check("W22 service_role user_id UPDATE → 42501", (await expectErr(admin, "UPDATE public.expert_workspace_designs SET user_id=$2 WHERE user_id=$1", [UA, UB], "42501")).ok);
  const up = await admin.query("UPDATE public.expert_workspace_designs SET draft='{\"layout\":\"C\"}'::jsonb, version=version+1 WHERE user_id=$1 AND version=1 RETURNING version", [UA]);
  check("W23 sürüm koşullu UPDATE çalışır (1 → 2)", up.rowCount === 1 && up.rows[0].version === 2);
  const stale = await admin.query("UPDATE public.expert_workspace_designs SET draft='{}'::jsonb, version=version+1 WHERE user_id=$1 AND version=1", [UA]);
  check("W24 eski sürümle UPDATE 0 satır etkiler (API 409)", stale.rowCount === 0);
  check("W25 sürüm atlatma (2 → 5) tetikleyiciyle reddedilir", (await expectErr(admin, "UPDATE public.expert_workspace_designs SET version=5 WHERE user_id=$1", [UA], "P0001", /EXPERT_WORKSPACE_VERSION_STEP/)).ok);
  check("W26 sürümü artırmadan UPDATE reddedilir", (await expectErr(admin, "UPDATE public.expert_ui_prefs SET favorites='{}' WHERE user_id=$1", [UA], "P0001", /EXPERT_WORKSPACE_VERSION_STEP/)).ok);
  await admin.query("COMMIT");

  // Süper kullanıcı bile kimlik kolonunu değiştiremez (tetikleyici).
  await admin.query("BEGIN");
  check("W27 süper kullanıcı tenant_id değiştiremez (tetikleyici)", (await expectErr(admin, "UPDATE public.expert_workspace_designs SET tenant_id=$2, version=version+1 WHERE user_id=$1", [UA, TB], "P0001", /EXPERT_WORKSPACE_IDENTITY_IMMUTABLE/)).ok);
  check("W28 süper kullanıcı user_id değiştiremez (tetikleyici)", (await expectErr(admin, "UPDATE public.expert_ui_prefs SET user_id=$2, version=version+1 WHERE user_id=$1", [UA, UB], "P0001", /EXPERT_WORKSPACE_IDENTITY_IMMUTABLE/)).ok);
  await admin.query("COMMIT");

  // ── Eşzamanlı iki sekme: aynı sürümle iki UPDATE → yalnız biri ──
  const ver = Number((await admin.query("SELECT version FROM public.expert_ui_prefs WHERE user_id=$1", [UA])).rows[0].version);
  const conns = [];
  for (let i = 0; i < 8; i++) {
    const c = client();
    await c.connect();
    await c.query("SET ROLE service_role; SET lock_timeout = '20s'");
    conns.push(c);
  }
  const res = await Promise.all(conns.map((c, i) => c.query("UPDATE public.expert_ui_prefs SET view_mode=$3, version=version+1 WHERE user_id=$1 AND version=$2", [UA, ver, i % 2 ? "day" : "night"]).then((r) => r.rowCount)));
  check("W29 8 eşzamanlı aynı-sürüm yazmasından yalnız 1'i uygulanır", res.reduce((a, b) => a + b, 0) === 1, JSON.stringify(res));
  check("W30 sürüm tam 1 arttı", Number((await admin.query("SELECT version FROM public.expert_ui_prefs WHERE user_id=$1", [UA])).rows[0].version) === ver + 1);
  await Promise.all(conns.map((c) => c.end()));

  // ── updated_at tetikleyiciyle güncellenir ──
  const t0 = (await admin.query("SELECT updated_at FROM public.expert_workspace_designs WHERE user_id=$1", [UA])).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 20));
  await admin.query("BEGIN; SET LOCAL ROLE service_role");
  const t1 = (await admin.query("UPDATE public.expert_workspace_designs SET draft=NULL, version=version+1 WHERE user_id=$1 RETURNING updated_at", [UA])).rows[0].updated_at;
  await admin.query("COMMIT");
  check("W31 updated_at her güncellemede yenilenir", t1 > t0);

  // ── Hesap temizleme keşfi (admin_purge_archived_expert: tenant_id uuid kolonlu tablolar) ──
  const disc = await admin.query(`SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND cl.relkind IN ('r','p') AND a.atttypid = 'uuid'::regtype AND cl.relname IN ('expert_workspace_designs','expert_ui_prefs')`);
  check("W32 hesap/tenant temizleme keşfi iki tabloyu da kapsar (tenant_id uuid)", disc.rowCount === 2);
  await admin.query("BEGIN");
  await admin.query("DELETE FROM public.expert_workspace_designs WHERE tenant_id=$1", [TA]);
  await admin.query("DELETE FROM public.expert_ui_prefs WHERE tenant_id=$1", [TA]);
  const leftA = Number((await admin.query("SELECT (SELECT count(*) FROM public.expert_workspace_designs WHERE tenant_id=$1) + (SELECT count(*) FROM public.expert_ui_prefs WHERE tenant_id=$1) n", [TA])).rows[0].n);
  const leftB = Number((await admin.query("SELECT count(*) n FROM public.expert_workspace_designs WHERE tenant_id=$1", [TB])).rows[0].n);
  await admin.query("ROLLBACK");
  check("W33 tenant silme döngüsü (süper kullanıcı, sentetik, geri alındı): A boşalır, B etkilenmez", leftA === 0 && leftB === 1);
  await admin.end();
} catch (e) {
  fail++;
  console.log(`FAIL workspace-tables: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])));
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nworkspace tables (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
