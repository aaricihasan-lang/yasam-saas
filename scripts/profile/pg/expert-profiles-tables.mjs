// UZMAN PROFİLİ (F1) — public.expert_profiles (20280102000000) GERÇEK PostgreSQL doğrulaması.
// YALNIZ yerel geçici embedded-postgres; production / staging / uzak DB YOK. Sentetik kayıtlar; sonunda geçici dizin silinir.
// Kapsam: Supabase prod varsayılan ACL'i (ALTER DEFAULT PRIVILEGES … TO anon, authenticated, service_role) altında
// uygulama, idempotency (2×), RLS + rol yetkileri (anon/authenticated sıfır; service_role SELECT/INSERT + kolon UPDATE;
// DELETE/TRUNCATE yok), kimlik değişmezliği + sürüm adımı + updated_at tetikleyicisi, CHECK'ler (uzunluk, kontrol/yön
// karakteri, etiket başlangıcı, telefon / e-posta / https site biçimi, logo kaynağı), uzman başına tek satır, iyimser kilit
// (eşzamanlı aynı sürüm → yalnız biri), varsayılanlar (markalama KAPALI), users satırlarının değişmemesi, FK CASCADE,
// hesap temizleme keşfi, güvenlik manifesti / drift, geri alma prova betiği (boş değilse durur; boşsa temiz kaldırır;
// sonra migration yeniden uygulanır).
// Çalıştırma: node scripts/profile/pg/expert-profiles-tables.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { compareManifest } from "../../final-hardening/drift/compare.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG = path.join(REPO, "supabase/migrations/20280102000000_expert_profiles.sql");
const ROLLBACK = path.join(REPO, "scripts/profile/pg/expert-profiles-rollback.sql");
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS public.users (id uuid PRIMARY KEY, tenant_id uuid, full_name text, name text, email text, role text, is_demo_account boolean DEFAULT false);
CREATE TABLE IF NOT EXISTS public.expert_workspace_designs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, user_id uuid NOT NULL);
-- Prod (Supabase) varsayılan ACL'i: bundan SONRA oluşan her tablo / fonksiyon istemci rollerine açık doğar → migration geri almalı.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UA = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const UA2 = "c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5";
const UB = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
const UX = "c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4";
const T = "expert_profiles";
const F = "expert_profile_row_guard";

const watchdog = setTimeout(() => {
  console.error("FAIL expert-profiles-tables: 4 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "expert-profiles-pg-"));
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
const INS = (cols) => `INSERT INTO public.expert_profiles (tenant_id, user_id${cols.map((c) => `, ${c}`).join("")}) VALUES ($1,$2${cols.map((_, i) => `,$${i + 3}`).join("")}) RETURNING *`;
/** Tek kolonlu CHECK reddi (savepoint içinde; satır eklenmez). */
const rejects = (c, col, value, re) => expectErr(c, INS([col]), [TB, UB, value], "23514", re);
const accepts = async (c, col, value) => {
  await c.query("SAVEPOINT y");
  try {
    await c.query(INS([col]), [TB, UB, value]);
    return true;
  } catch {
    return false;
  } finally {
    await c.query("ROLLBACK TO SAVEPOINT y");
  }
};

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  await admin.query(`INSERT INTO public.users (id, tenant_id, full_name, name, email, role) VALUES
    ($1,$4,'Ayşe Yılmaz','Ayşe','ayse@example.invalid','expert'),
    ($2,$4,'Mehmet Kaya','Mehmet','mehmet@example.invalid','expert'),
    ($3,$5,'Zeynep Demir','Zeynep','zeynep@example.invalid','expert'),
    ($6,$5,'Silinecek Uzman','S','silinecek@example.invalid','expert')`, [UA, UA2, UB, TA, TB, UX]);
  const usersSnap = async () => JSON.stringify((await admin.query("SELECT * FROM public.users ORDER BY id")).rows);
  const usersBefore = await usersSnap();
  const sql = fs.readFileSync(MIG, "utf8");
  await admin.query(sql);
  let second = true;
  let secondErr = "";
  try {
    await admin.query(sql);
  } catch (e) {
    second = false;
    secondErr = String(e?.message ?? e);
  }
  check("P01 migration prod varsayılan ACL'i altında iki kez çalışır (idempotent)", second, secondErr);
  const body = sql.replace(/--[^\n]*/g, "");
  check("P02 migration DROP TABLE / TRUNCATE / DELETE FROM / UPDATE / ALTER başka tablo içermez", !/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+public\.|\bINSERT\s+INTO\b|\bALTER\s+TABLE\s+public\.(?!expert_profiles\b)/i.test(body));

  // ── Yetkiler + RLS ──
  const r = (await admin.query(`SELECT
      has_table_privilege('anon','public.${T}','SELECT') a_s, has_table_privilege('anon','public.${T}','INSERT') a_i,
      has_table_privilege('anon','public.${T}','UPDATE') a_u, has_table_privilege('anon','public.${T}','DELETE') a_d,
      has_table_privilege('authenticated','public.${T}','SELECT') u_s, has_table_privilege('authenticated','public.${T}','INSERT') u_i,
      has_table_privilege('authenticated','public.${T}','UPDATE') u_u, has_table_privilege('authenticated','public.${T}','DELETE') u_d,
      has_table_privilege('authenticated','public.${T}','TRUNCATE') u_t,
      has_table_privilege('service_role','public.${T}','SELECT') s_s, has_table_privilege('service_role','public.${T}','INSERT') s_i,
      has_table_privilege('service_role','public.${T}','DELETE') s_d, has_table_privilege('service_role','public.${T}','TRUNCATE') s_t,
      has_table_privilege('service_role','public.${T}','REFERENCES') s_r, has_table_privilege('service_role','public.${T}','TRIGGER') s_tr,
      has_column_privilege('service_role','public.${T}','user_id','UPDATE') s_u_user, has_column_privilege('service_role','public.${T}','tenant_id','UPDATE') s_u_tenant,
      has_column_privilege('service_role','public.${T}','id','UPDATE') s_u_id, has_column_privilege('service_role','public.${T}','created_at','UPDATE') s_u_cr,
      has_column_privilege('service_role','public.${T}','version','UPDATE') s_u_ver, has_column_privilege('service_role','public.${T}','title','UPDATE') s_u_title,
      has_column_privilege('service_role','public.${T}','logo_asset_id','UPDATE') s_u_logo,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.${T}'::regclass) rls,
      (SELECT count(*) FROM pg_policies WHERE tablename='${T}')::int pol,
      (SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='${T}' AND grantee IN ('PUBLIC','anon','authenticated'))::int client_grants`)).rows[0];
  check("P03 anon / authenticated / PUBLIC hiçbir tablo yetkisine sahip değil (varsayılan ACL geri alındı)", !r.a_s && !r.a_i && !r.a_u && !r.a_d && !r.u_s && !r.u_i && !r.u_u && !r.u_d && !r.u_t && r.client_grants === 0, JSON.stringify(r));
  check("P04 RLS açık, istemci politikası yok", r.rls === true && r.pol === 0);
  check("P05 service_role SELECT + INSERT var; DELETE / TRUNCATE / REFERENCES / TRIGGER yok", r.s_s && r.s_i && !r.s_d && !r.s_t && !r.s_r && !r.s_tr);
  check("P06 service_role kimlik kolonlarını (id, tenant_id, user_id, created_at) güncelleyemez; içerik + logo + version güncelleyebilir",
    !r.s_u_user && !r.s_u_tenant && !r.s_u_id && !r.s_u_cr && r.s_u_ver && r.s_u_title && r.s_u_logo);
  const fn = (await admin.query(`SELECT has_function_privilege('anon','public.${F}()','EXECUTE') a, has_function_privilege('authenticated','public.${F}()','EXECUTE') u,
      (SELECT prosecdef FROM pg_proc WHERE proname='${F}') sd, (SELECT proconfig FROM pg_proc WHERE proname='${F}') cfg`)).rows[0];
  check("P07 tetikleyici fonksiyonu istemciye kapalı, SECURITY DEFINER değil, search_path sabit", !fn.a && !fn.u && fn.sd === false && String(fn.cfg).includes("search_path"));
  const cols = (await admin.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='${T}' ORDER BY ordinal_position`)).rows;
  const colMap = Object.fromEntries(cols.map((c) => [c.column_name, c]));
  check("P08 kolonlar: logo_asset_id uuid NULL, logo_source varsayılan 'none', report_branding_enabled varsayılan false",
    colMap.logo_asset_id?.data_type === "uuid" && colMap.logo_asset_id.is_nullable === "YES" && /'none'/.test(colMap.logo_source?.column_default ?? "") &&
    colMap.report_branding_enabled?.column_default === "false" && colMap.report_branding_enabled.is_nullable === "NO", JSON.stringify(cols.map((c) => c.column_name)));
  check("P09 users tablosunda kolon/yetki değişmedi; satırlar birebir aynı", (await usersSnap()) === usersBefore);

  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE anon");
  check("P10 anon SELECT → 42501", (await expectErr(admin, `SELECT 1 FROM public.${T}`, [], "42501")).ok);
  check("P11 anon INSERT → 42501", (await expectErr(admin, INS(["title"]), [TA, UA, "x"], "42501")).ok);
  await admin.query("ROLLBACK");
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE authenticated");
  check("P12 authenticated SELECT → 42501", (await expectErr(admin, `SELECT 1 FROM public.${T}`, [], "42501")).ok);
  check("P13 authenticated INSERT → 42501", (await expectErr(admin, INS(["title"]), [TA, UA, "x"], "42501")).ok);
  check("P14 authenticated UPDATE → 42501", (await expectErr(admin, `UPDATE public.${T} SET title='x'`, [], "42501")).ok);
  check("P15 authenticated DELETE → 42501", (await expectErr(admin, `DELETE FROM public.${T}`, [], "42501")).ok);
  await admin.query("ROLLBACK");

  // ── Güvenlik manifesti (supabase/expected-manifest.json) — gerçek katalogla karşılaştırma ──
  const full = JSON.parse(fs.readFileSync(path.join(REPO, "supabase/expected-manifest.json"), "utf8"));
  check("P16 manifest: tablo tables_no_client_grant + tables_rls_enabled, fonksiyon functions_no_client_execute listesinde (optional dahil)",
    full.tables_no_client_grant.names.includes(T) && full.tables_rls_enabled.names.includes(T) && full.functions_no_client_execute.names.includes(F) &&
    full.tables_no_client_grant.optional.includes(T) && full.tables_rls_enabled.optional.includes(T) && full.functions_no_client_execute.optional.includes(F));
  const manifestSql = fs.readFileSync(path.join(REPO, "scripts/final-hardening/drift/manifest.sql"), "utf8");
  const actualManifest = (await admin.query(manifestSql)).rows[0].manifest;
  const cmp = compareManifest(actualManifest, {
    functions_no_client_execute: { names: [F] },
    tables_no_client_grant: { names: [T] },
    tables_rls_enabled: { names: [T] },
    tables_no_client_dangerous_privileges: full.tables_no_client_dangerous_privileges,
    broad_client_policies_absent: full.broad_client_policies_absent,
  });
  check("P17 drift karşılaştırması (compare.mjs) bu migration için FAIL üretmez", cmp.fails.length === 0 && cmp.checked > 0, cmp.fails.length ? JSON.stringify(cmp.fails).slice(0, 300) : "");
  await admin.query("BEGIN");
  await admin.query(`GRANT SELECT ON public.${T} TO authenticated`);
  const leaked = (await admin.query(manifestSql)).rows[0].manifest;
  await admin.query("ROLLBACK");
  const cmpLeak = compareManifest(leaked, { tables_no_client_grant: { names: [T] }, tables_rls_enabled: { names: [T] } });
  check("P18 kasıtlı authenticated yetkisi drift karşılaştırmasında FAIL olarak yakalanır (geri alındı)", cmpLeak.fails.some((f) => f.includes(T)), JSON.stringify(cmpLeak.fails).slice(0, 200));

  // ── service_role akışı + CHECK'ler ──
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const a1 = (await admin.query(INS(["title", "organization", "bio"]), [TA, UA, "Psikolojik Danışman", "Yaşam Merkezi", "Satır 1\nSatır 2 — çok satırlı biyografi"])).rows[0];
  check("P19 profil satırı eklenir: version 1, markalama KAPALI, alan anahtarları açık, logo_source 'none'",
    a1.version === 1 && a1.report_branding_enabled === false && a1.report_show_title && a1.report_show_organization && a1.report_show_contact && a1.report_show_note && a1.logo_source === "none" && a1.logo_asset_id === null);
  check("P20 uzman başına (tenant içinde) tek satır (UNIQUE tenant_id, user_id)", (await expectErr(admin, INS([]), [TA, UA], "23505", /expert_profiles_user_uq/)).ok);
  check("P21 users'ta olmayan user_id → FK reddi", (await expectErr(admin, INS([]), [TA, "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0"], "23503")).ok);
  check("P22 unvan 81 karakter → CHECK reddi; 80 kabul", (await rejects(admin, "title", "a".repeat(81), /title_chk/)).ok && (await accepts(admin, "title", "ş".repeat(80))));
  check("P23 kurum 121 karakter → CHECK reddi; 120 kabul", (await rejects(admin, "organization", "a".repeat(121), /organization_chk/)).ok && (await accepts(admin, "organization", "a".repeat(120))));
  check("P24 biyografi 1001 → reddi; 1000 (emoji dahil, kod noktası) kabul", (await rejects(admin, "bio", "a".repeat(1001), /bio_chk/)).ok && (await accepts(admin, "bio", "🙂".repeat(1000))));
  check("P25 rapor dipnotu 301 → reddi; 300 kabul", (await rejects(admin, "report_note", "a".repeat(301), /report_note_chk/)).ok && (await accepts(admin, "report_note", "a".repeat(300))));
  check("P26 boş metin ('') → CHECK reddi (uygulama boşu NULL'a çevirir)", (await rejects(admin, "title", "", /title_chk/)).ok && (await rejects(admin, "bio", "", /bio_chk/)).ok);
  check("P27 tek satırlı alanda satır sonu → reddi; biyografide satır sonu kabul", (await rejects(admin, "title", "a\nb", /title_chk/)).ok && (await accepts(admin, "bio", "a\nb")));
  check("P28 sekme / CR / DEL kontrol karakteri → reddi", (await rejects(admin, "bio", "a\tb", /bio_chk/)).ok && (await rejects(admin, "bio", "a\rb", /bio_chk/)).ok && (await rejects(admin, "organization", "a\u007Fb", /organization_chk/)).ok);
  check("P29 görünmez yön işaretleri (RLO U+202E, LRI U+2066, RLM U+200F, ALM U+061C, BOM) → reddi",
    (await rejects(admin, "title", "abc\u202Edef", /title_chk/)).ok && (await rejects(admin, "bio", "x\u2066y", /bio_chk/)).ok &&
    (await rejects(admin, "report_note", "x\u200Fy", /report_note_chk/)).ok && (await rejects(admin, "organization", "x\u061Cy", /organization_chk/)).ok && (await rejects(admin, "title", "\uFEFFx", /title_chk/)).ok);
  check("P30 etiket başlangıcı (<script, </b, <!--, <?php, <img) → reddi; '3 < 5' ve '<3' kabul",
    (await rejects(admin, "bio", "<script>alert(1)</script>", /bio_chk/)).ok && (await rejects(admin, "title", "a</b", /title_chk/)).ok &&
    (await rejects(admin, "report_note", "<!-- x", /report_note_chk/)).ok && (await rejects(admin, "organization", "<?php", /organization_chk/)).ok &&
    (await rejects(admin, "bio", "x <img src=x onerror=1>", /bio_chk/)).ok && (await accepts(admin, "bio", "3 < 5 ve <3")));
  check("P31 telefon: harf / 33 karakter / rakamsız → reddi; '+90 (532) 123-45-67' kabul",
    (await rejects(admin, "phone", "0532abc", /phone_chk/)).ok && (await rejects(admin, "phone", "1".repeat(33), /phone_chk/)).ok &&
    (await rejects(admin, "phone", "+() -", /phone_chk/)).ok && (await accepts(admin, "phone", "+90 (532) 123-45-67")));
  check("P32 iletişim e-postası: @ yok / boşluk / alan adında alt çizgi → reddi; 'ayse.yilmaz+rapor@example.invalid' kabul",
    (await rejects(admin, "contact_email", "ayse.example.invalid", /contact_email_chk/)).ok && (await rejects(admin, "contact_email", "ay se@example.invalid", /contact_email_chk/)).ok &&
    (await rejects(admin, "contact_email", "a@ex_ample.invalid", /contact_email_chk/)).ok && (await accepts(admin, "contact_email", "ayse.yilmaz+rapor@example.invalid")));
  check("P33 site: http:// / javascript: / data: / kullanıcı-bilgisi (@) / boşluk / tek etiketli host → reddi; https kabul",
    (await rejects(admin, "website", "http://example.invalid", /website_chk/)).ok && (await rejects(admin, "website", "javascript:alert(1)", /website_chk/)).ok &&
    (await rejects(admin, "website", "data:text/html,<b>x</b>", /website_chk/)).ok && (await rejects(admin, "website", "https://user:pw@example.invalid", /website_chk/)).ok &&
    (await rejects(admin, "website", "https://example.invalid/a b", /website_chk/)).ok && (await rejects(admin, "website", "https://localhost", /website_chk/)).ok &&
    (await rejects(admin, "website", "https://" + "a".repeat(190) + ".com", /website_chk/)).ok &&
    (await accepts(admin, "website", "https://www.example.invalid/hakkimda?x=1#iletisim")));
  check("P34 logo_source geçersiz → reddi; 'custom' logo kimliği olmadan → reddi; 'workspace' kabul",
    (await rejects(admin, "logo_source", "url", /logo_source_chk/)).ok && (await rejects(admin, "logo_source", "custom", /logo_custom_chk/)).ok && (await accepts(admin, "logo_source", "workspace")));
  check("P35 service_role DELETE → 42501", (await expectErr(admin, `DELETE FROM public.${T} WHERE user_id=$1`, [UA], "42501")).ok);
  check("P36 service_role TRUNCATE → 42501", (await expectErr(admin, `TRUNCATE public.${T}`, [], "42501")).ok);
  check("P37 service_role user_id / tenant_id / created_at UPDATE → 42501",
    (await expectErr(admin, `UPDATE public.${T} SET user_id=$2, version=version+1 WHERE user_id=$1`, [UA, UB], "42501")).ok &&
    (await expectErr(admin, `UPDATE public.${T} SET tenant_id=$2, version=version+1 WHERE user_id=$1`, [UA, TB], "42501")).ok &&
    (await expectErr(admin, `UPDATE public.${T} SET created_at=now() - interval '1 day', version=version+1 WHERE user_id=$1`, [UA], "42501")).ok);
  const up = await admin.query(`UPDATE public.${T} SET title='Uzman Psikolojik Danışman', report_branding_enabled=true, version=version+1 WHERE tenant_id=$1 AND user_id=$2 AND version=1 RETURNING version, updated_at, created_at`, [TA, UA]);
  check("P38 sürüm koşullu UPDATE çalışır (1 → 2)", up.rowCount === 1 && up.rows[0].version === 2);
  const stale = await admin.query(`UPDATE public.${T} SET title='Eski sekme', version=version+1 WHERE tenant_id=$1 AND user_id=$2 AND version=1`, [TA, UA]);
  check("P39 eski sürümle UPDATE 0 satır etkiler (API 409)", stale.rowCount === 0);
  check("P40 sürüm atlatma (2 → 7) tetikleyiciyle reddedilir", (await expectErr(admin, `UPDATE public.${T} SET version=7 WHERE user_id=$1`, [UA], "P0001", /EXPERT_PROFILE_VERSION_STEP/)).ok);
  check("P41 sürümü artırmadan UPDATE reddedilir", (await expectErr(admin, `UPDATE public.${T} SET bio=NULL WHERE user_id=$1`, [UA], "P0001", /EXPERT_PROFILE_VERSION_STEP/)).ok);
  check("P42 UPDATE'te CHECK'ler de uygulanır (javascript: site)", (await expectErr(admin, `UPDATE public.${T} SET website='javascript:alert(1)', version=version+1 WHERE user_id=$1`, [UA], "23514", /website_chk/)).ok);
  await admin.query("COMMIT");

  await admin.query("BEGIN");
  check("P43 süper kullanıcı tenant_id değiştiremez (tetikleyici)", (await expectErr(admin, `UPDATE public.${T} SET tenant_id=$2, version=version+1 WHERE user_id=$1`, [UA, TB], "P0001", /EXPERT_PROFILE_IDENTITY_IMMUTABLE/)).ok);
  check("P44 süper kullanıcı user_id değiştiremez (tetikleyici)", (await expectErr(admin, `UPDATE public.${T} SET user_id=$2, version=version+1 WHERE user_id=$1`, [UA, UA2], "P0001", /EXPERT_PROFILE_IDENTITY_IMMUTABLE/)).ok);
  check("P45 süper kullanıcı created_at değiştiremez (tetikleyici)", (await expectErr(admin, `UPDATE public.${T} SET created_at=now() - interval '1 day', version=version+1 WHERE user_id=$1`, [UA], "P0001", /EXPERT_PROFILE_IDENTITY_IMMUTABLE/)).ok);
  await admin.query("COMMIT");

  // ── Eşzamanlı iki sekme: aynı sürümle 8 UPDATE → yalnız biri ──
  const ver = Number((await admin.query(`SELECT version FROM public.${T} WHERE user_id=$1`, [UA])).rows[0].version);
  const t0 = (await admin.query(`SELECT updated_at FROM public.${T} WHERE user_id=$1`, [UA])).rows[0].updated_at;
  await new Promise((res) => setTimeout(res, 20));
  const conns = [];
  for (let i = 0; i < 8; i++) {
    const c = client();
    await c.connect();
    await c.query("SET ROLE service_role; SET lock_timeout = '20s'");
    conns.push(c);
  }
  const res = await Promise.all(conns.map((c, i) => c.query(`UPDATE public.${T} SET organization=$3, version=version+1 WHERE tenant_id=$4 AND user_id=$1 AND version=$2`, [UA, ver, `Kurum ${i}`, TA]).then((x) => x.rowCount)));
  check("P46 8 eşzamanlı aynı-sürüm yazmasından yalnız 1'i uygulanır", res.reduce((a, b) => a + b, 0) === 1, JSON.stringify(res));
  const after = (await admin.query(`SELECT version, updated_at FROM public.${T} WHERE user_id=$1`, [UA])).rows[0];
  check("P47 sürüm tam 1 arttı; updated_at tetikleyiciyle yenilendi", Number(after.version) === ver + 1 && after.updated_at > t0);
  await Promise.all(conns.map((c) => c.end()));

  // ── İzolasyon: aynı tenant'ta ikinci uzman + başka tenant ──
  await admin.query("BEGIN; SET LOCAL ROLE service_role");
  await admin.query(INS(["title"]), [TA, UA2, "A2 unvanı"]);
  await admin.query(INS(["title"]), [TB, UB, "B unvanı"]);
  await admin.query(INS(["title"]), [TB, UX, "Silinecek"]);
  const onlyA = await admin.query(`UPDATE public.${T} SET title='Yalnız A', version=version+1 WHERE tenant_id=$1 AND user_id=$2 RETURNING user_id`, [TA, UA]);
  await admin.query("COMMIT");
  const titles = Object.fromEntries((await admin.query(`SELECT user_id, title FROM public.${T}`)).rows.map((x) => [x.user_id, x.title]));
  check("P48 tenant + kullanıcıyla daraltılmış güncelleme yalnız kendi satırını değiştirir (A2 ve B aynı)", onlyA.rowCount === 1 && titles[UA2] === "A2 unvanı" && titles[UB] === "B unvanı" && titles[UA] === "Yalnız A");
  check("P49 profil yazmaları users satırlarını DEĞİŞTİRMEDİ", (await usersSnap()) === usersBefore);

  // ── Silme davranışı: users satırı silinince profil CASCADE ile gider (yalnız o kullanıcı) ──
  await admin.query("BEGIN");
  await admin.query("DELETE FROM public.users WHERE id=$1", [UX]);
  const leftX = Number((await admin.query(`SELECT count(*) n FROM public.${T} WHERE user_id=$1`, [UX])).rows[0].n);
  const leftOthers = Number((await admin.query(`SELECT count(*) n FROM public.${T}`)).rows[0].n);
  await admin.query("ROLLBACK");
  check("P50 kullanıcı silinince profili CASCADE ile silinir; diğer profiller etkilenmez (geri alındı)", leftX === 0 && leftOthers === 3);

  // ── Hesap temizleme keşfi (admin_purge_archived_expert: tenant_id uuid kolonlu tablolar) ──
  const disc = await admin.query(`SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND cl.relkind IN ('r','p') AND a.atttypid = 'uuid'::regtype AND cl.relname = $1`, [T]);
  check("P51 hesap/tenant temizleme keşfi tabloyu kapsar (tenant_id uuid)", disc.rowCount === 1);
  await admin.query("BEGIN");
  await admin.query(`DELETE FROM public.${T} WHERE tenant_id=$1`, [TA]);
  const leftA = Number((await admin.query(`SELECT count(*) n FROM public.${T} WHERE tenant_id=$1`, [TA])).rows[0].n);
  const leftB = Number((await admin.query(`SELECT count(*) n FROM public.${T} WHERE tenant_id=$1`, [TB])).rows[0].n);
  await admin.query("ROLLBACK");
  check("P52 tenant silme döngüsü (süper kullanıcı, sentetik, geri alındı): A boşalır, B etkilenmez", leftA === 0 && leftB === 2);

  // ── Geri alma prova betiği ──
  const rb = fs.readFileSync(ROLLBACK, "utf8");
  let refused = "";
  try {
    await admin.query(rb);
  } catch (e) {
    refused = String(e?.message ?? e);
    await admin.query("ROLLBACK").catch(() => {});
  }
  const stillThere = Number((await admin.query(`SELECT count(*) n FROM public.${T}`)).rows[0].n);
  check("R01 geri alma: tabloda kayıt varken DURUR (EXPERT_PROFILES_NOT_EMPTY), hiçbir şey silinmez", /EXPERT_PROFILES_NOT_EMPTY/.test(refused) && stillThere === 4, refused.slice(0, 120));
  await admin.query(`DELETE FROM public.${T}`); // yalnız sentetik test verisi; süper kullanıcı
  const otherBefore = JSON.stringify((await admin.query("SELECT to_regclass('public.expert_workspace_designs') t, (SELECT count(*) FROM public.users) u")).rows[0]);
  await admin.query(rb);
  const gone = (await admin.query(`SELECT to_regclass('public.${T}') t, (SELECT count(*) FROM pg_proc WHERE proname='${F}')::int f`)).rows[0];
  check("R02 geri alma (boş tablo): tablo + tetikleyici fonksiyonu kaldırılır", gone.t === null && gone.f === 0, JSON.stringify(gone));
  check("R03 geri alma başka tabloya / users'a dokunmaz", JSON.stringify((await admin.query("SELECT to_regclass('public.expert_workspace_designs') t, (SELECT count(*) FROM public.users) u")).rows[0]) === otherBefore && (await usersSnap()) === usersBefore);
  let rb2 = true;
  try { await admin.query(rb); } catch { rb2 = false; }
  check("R04 geri alma iki kez çalışır (nesne yoksa sessizce geçer)", rb2);
  await admin.query(sql);
  const back = (await admin.query(`SELECT has_table_privilege('authenticated','public.${T}','SELECT') u, has_table_privilege('service_role','public.${T}','INSERT') s, (SELECT relrowsecurity FROM pg_class WHERE oid='public.${T}'::regclass) rls`)).rows[0];
  check("R05 geri almadan sonra migration yeniden uygulanır; yetkiler yine doğru", back.u === false && back.s === true && back.rls === true);
  await admin.end();
} catch (e) {
  fail++;
  console.log(`FAIL expert-profiles-tables: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((res) => setTimeout(res, 3000))])));
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nexpert profiles (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
