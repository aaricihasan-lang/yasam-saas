// KİŞİSEL DİJİTAL OFİS (P2) — 20271228000000 GERÇEK PostgreSQL doğrulaması. YALNIZ yerel geçici embedded-postgres; production /
// staging / uzak DB YOK. Sentetik kayıtlar; sonunda geçici dizin silinir.
// Kapsam: idempotency (2×), private bucket + istemci politikası kaldırma (çok-bucket'lı politikada DUR), RLS + rol yetkileri,
// görsel değişmezliği / tek seferlik silme işareti / yalnız sahibi siler, yol CHECK (tenant öneki), boyut CHECK (logo 2 MB),
// 60 görsel tavanı (eşzamanlı), yükleme oturumu kuralları + 5 açık oturum tavanı, parça boyutu, izin listesi (kendine izin yok,
// tek etkin izin, yalnız geri alma, diriltme yok), kapasite raporu (expert-workspace atfı + fonksiyon yetkileri korunur),
// hesap temizleme keşfi, güvenlik manifesti karşılaştırması, veri silen geri alma yok.
// Çalıştırma: node scripts/workspace/pg/workspace-assets.mjs
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
const MIG = (f) => fs.readFileSync(path.join(REPO, "supabase/migrations", f), "utf8");
const USAGE = MIG("20270113000000_expert_storage_usage_rpc.sql");
const P2 = MIG("20271228000000_expert_workspace_assets_access.sql");
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UA = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const UB = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
const OWNER = "0ae00000-0000-4000-8000-0000000000aa";
const TABLES = ["expert_workspace_assets", "expert_workspace_uploads", "expert_workspace_upload_chunks", "expert_workspace_access_grants"];
const FUNCS = ["expert_workspace_asset_guard", "expert_workspace_asset_cap", "expert_workspace_upload_guard", "expert_workspace_grant_guard"];

const watchdog = setTimeout(() => { console.error("FAIL workspace-assets: 4 dakika aşıldı"); process.exit(1); }, 4 * 60_000);
watchdog.unref();
const opened = new Set();
async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 56000 + Math.floor(Math.random() * 3000);
    const ok = await new Promise((res) => { const s = net.createServer(); s.once("error", () => res(false)); s.listen(p, "127.0.0.1", () => s.close(() => res(true))); });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kdo-assets-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", "max_connections=60"], onLog: () => {}, onError: () => {} });
const client = (database = "postgres") => { const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database }); c.on("error", () => {}); opened.add(c); return c; };
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
async function expectErr(c, sql, params, code, re) {
  await c.query("SAVEPOINT x");
  try { await c.query(sql, params); await c.query("RELEASE SAVEPOINT x"); return { ok: false, got: "hata yok" }; }
  catch (e) { await c.query("ROLLBACK TO SAVEPOINT x"); return { ok: e.code === code && (!re || re.test(String(e.message))), got: `${e.code} ${String(e.message).slice(0, 90)}` }; }
}
const assetRow = (o = {}) => {
  const id = o.id ?? crypto.randomUUID();
  const t = o.tenant ?? TA;
  const u = o.user ?? UA;
  return { id, sql: `INSERT INTO public.expert_workspace_assets (id, tenant_id, user_id, kind, original_format, original_bytes, original_width, original_height,
      desktop_path, desktop_width, desktop_height, desktop_bytes, mobile_path, mobile_width, mobile_height, mobile_bytes, sha256)
      VALUES ($1,$2,$3,$4,'png',$5,800,600,$6,800,600,1000,$7,600,450,800,$8)`,
    params: [id, t, u, o.kind ?? "photo", o.bytes ?? 5000, o.desktop ?? `${t}/${u}/${id}/desktop.webp`, o.mobile ?? `${t}/${u}/${id}/mobile.webp`, o.sha ?? "a".repeat(64)] };
};

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  await admin.query(USAGE);
  // Önceden (yanlışlıkla) açılmış istemci politikası → migration kaldırmalı.
  await admin.query(`CREATE POLICY expert_workspace_public_read ON storage.objects FOR SELECT TO anon USING (bucket_id = 'expert-workspace')`);
  await admin.query(P2);
  let second = true;
  try { await admin.query(P2); } catch { second = false; }
  check("A01 migration iki kez çalışır (idempotent)", second);
  check("A02 migration DROP TABLE / TRUNCATE / DELETE FROM içermez", !/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(P2.replace(/--[^\n]*/g, "")));

  // ── Bucket ──
  const b = (await admin.query(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='expert-workspace'`)).rows[0];
  check("A03 bucket private, 5 MB, yalnız image/webp", b && b.public === false && Number(b.file_size_limit) === 5242880 && JSON.stringify(b.allowed_mime_types) === '["image/webp"]', JSON.stringify(b));
  check("A04 bucket'a ait istemci politikası kaldırıldı", Number((await admin.query(`SELECT count(*) n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (coalesce(qual,'') LIKE '%expert-workspace%' OR coalesce(with_check,'') LIKE '%expert-workspace%')`)).rows[0].n) === 0);
  // Başka bucket'ı da kapsayan politika → migration DURMALI (ayrı veritabanı).
  await admin.query("CREATE DATABASE kdo_mix");
  const mix = client("kdo_mix");
  await mix.connect();
  await mix.query(BOOT);
  await mix.query(USAGE);
  await mix.query(`CREATE POLICY mixed_read ON storage.objects FOR SELECT TO anon USING (bucket_id = 'expert-workspace' OR bucket_id = 'stone-photos')`);
  let mixErr = "";
  try { await mix.query(P2); } catch (e) { mixErr = String(e.message); await mix.query("ROLLBACK").catch(() => {}); }
  check("A05 başka bucket'ı da kapsayan politika varsa migration DURUR (elle inceleme)", /başka bucket/.test(mixErr), mixErr.slice(0, 120));
  check("A06 duran migration yarım nesne bırakmaz (tablo yok)", (await mix.query(`SELECT to_regclass('public.expert_workspace_assets') r`)).rows[0].r === null);
  await mix.end();

  // ── Yetkiler + RLS ──
  for (const t of TABLES) {
    const r = (await admin.query(`SELECT has_table_privilege('anon','public.${t}','SELECT') a_s, has_table_privilege('authenticated','public.${t}','SELECT') u_s,
        has_table_privilege('authenticated','public.${t}','INSERT') u_i, has_table_privilege('service_role','public.${t}','SELECT') s_s,
        has_table_privilege('service_role','public.${t}','INSERT') s_i, has_table_privilege('service_role','public.${t}','DELETE') s_d,
        has_table_privilege('service_role','public.${t}','TRUNCATE') s_t,
        (SELECT relrowsecurity FROM pg_class WHERE oid='public.${t}'::regclass) rls, (SELECT count(*) FROM pg_policies WHERE tablename='${t}')::int pol`)).rows[0];
    const delOk = t === "expert_workspace_upload_chunks" ? r.s_d === true : r.s_d === false;
    check(`A07 ${t}: istemci yetkisi yok, RLS açık, politika yok, TRUNCATE yok, DELETE ${t.endsWith("chunks") ? "yalnız geçici parçalarda" : "YOK"}`,
      !r.a_s && !r.u_s && !r.u_i && r.s_s && r.s_i && !r.s_t && delOk && r.rls && r.pol === 0, JSON.stringify(r));
  }
  for (const fn of FUNCS) {
    const r = (await admin.query(`SELECT has_function_privilege('anon','public.${fn}()','EXECUTE') a, has_function_privilege('authenticated','public.${fn}()','EXECUTE') u, (SELECT prosecdef FROM pg_proc WHERE proname='${fn}') sd`)).rows[0];
    check(`A08 ${fn}: istemciye kapalı, SECURITY DEFINER değil`, !r.a && !r.u && r.sd === false);
  }
  const colPriv = (await admin.query(`SELECT has_column_privilege('service_role','public.expert_workspace_assets','desktop_path','UPDATE') p, has_column_privilege('service_role','public.expert_workspace_assets','user_id','UPDATE') u,
      has_column_privilege('service_role','public.expert_workspace_assets','deleted_at','UPDATE') d, has_column_privilege('service_role','public.expert_workspace_access_grants','user_id','UPDATE') g`)).rows[0];
  check("A09 service_role yol / kullanıcı kolonlarını güncelleyemez; yalnız silme işareti", !colPriv.p && !colPriv.u && colPriv.d && !colPriv.g, JSON.stringify(colPriv));

  // ── Görsel kayıtları ──
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const a1 = assetRow();
  await admin.query(a1.sql, a1.params);
  const foreign = assetRow({ desktop: `${TB}/${UA}/x/desktop.webp` });
  check("A10 başka tenant önekli yol → CHECK reddi", (await expectErr(admin, foreign.sql, foreign.params, "23514", /expert_wa_path_chk/)).ok);
  const trav = assetRow();
  trav.params[5] = `${TA}/${UA}/../${trav.id}/desktop.webp`;
  check("A11 '..' içeren yol → CHECK reddi", (await expectErr(admin, trav.sql, trav.params, "23514", /expert_wa_path_chk/)).ok);
  const bigLogo = assetRow({ kind: "logo", bytes: 3 * 1024 * 1024 });
  check("A12 logo 2 MB üstü → CHECK reddi", (await expectErr(admin, bigLogo.sql, bigLogo.params, "23514", /expert_wa_size_chk/)).ok);
  const bigPhoto = assetRow({ bytes: 11 * 1024 * 1024 });
  check("A13 fotoğraf 10 MB üstü → CHECK reddi", (await expectErr(admin, bigPhoto.sql, bigPhoto.params, "23514", /expert_wa_size_chk/)).ok);
  const badKind = assetRow({ kind: "svg" });
  check("A14 bilinmeyen tür → CHECK reddi", (await expectErr(admin, badKind.sql, badKind.params, "23514", /expert_wa_kind_chk/)).ok);
  check("A15 service_role görsel satırını SİLEMEZ (DELETE yetkisi yok)", (await expectErr(admin, "DELETE FROM public.expert_workspace_assets WHERE id=$1", [a1.id], "42501")).ok);
  check("A16 başkası adına silme işareti → tetikleyici reddi", (await expectErr(admin, "UPDATE public.expert_workspace_assets SET deleted_at=now(), deleted_by=$2 WHERE id=$1", [a1.id, UB], "P0001", /DELETE_OWNER_ONLY/)).ok);
  const del = await admin.query("UPDATE public.expert_workspace_assets SET deleted_at=now(), deleted_by=$2 WHERE id=$1 RETURNING deleted_at", [a1.id, UA]);
  check("A17 sahibi silme işaretini koyar (satır korunur)", del.rowCount === 1);
  check("A18 silinmiş görsel diriltilemez / tekrar işaretlenemez", (await expectErr(admin, "UPDATE public.expert_workspace_assets SET deleted_at=NULL, deleted_by=NULL WHERE id=$1", [a1.id], "P0001", /ALREADY_DELETED/)).ok);
  await admin.query("COMMIT");
  await admin.query("BEGIN");
  check("A19 süper kullanıcı bile yol / tür değiştiremez (tetikleyici)", (await expectErr(admin, "UPDATE public.expert_workspace_assets SET kind='logo' WHERE id=$1", [a1.id], "P0001", /ASSET_IMMUTABLE/)).ok);
  await admin.query("ROLLBACK");

  // 60 tavanı, eşzamanlı.
  for (let i = 0; i < 59; i++) { const r = assetRow({ user: UB, tenant: TB }); await admin.query(r.sql, r.params); }
  const conns = [];
  for (let i = 0; i < 6; i++) { const c = client(); await c.connect(); await c.query("SET ROLE service_role"); conns.push(c); }
  const res = await Promise.allSettled(conns.map((c) => { const r = assetRow({ user: UB, tenant: TB }); return c.query(r.sql, r.params); }));
  const capped = Number((await admin.query("SELECT count(*) n FROM public.expert_workspace_assets WHERE user_id=$1 AND deleted_at IS NULL", [UB])).rows[0].n);
  check("A20 etkin görsel tavanı 60 (6 eşzamanlı ekleme → yalnız 1 kabul)", capped === 60 && res.filter((r) => r.status === "fulfilled").length === 1, `etkin ${capped}`);
  await Promise.all(conns.map((c) => c.end()));

  // ── Yükleme oturumları + parçalar ──
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const UP = "INSERT INTO public.expert_workspace_uploads (tenant_id, user_id, kind, declared_mime, file_name, declared_bytes, chunk_size, chunk_count, status) VALUES ($1,$2,$3,$4,$5,$6,3145728,$7,$8) RETURNING id";
  const u1 = (await admin.query(UP, [TA, UA, "photo", "image/jpeg", "a.jpg", 5_000_000, 2, "open"])).rows[0].id;
  check("A21 oturum 'completed' olarak açılamaz", (await expectErr(admin, UP, [TA, UA, "photo", "image/jpeg", "a.jpg", 100, 1, "completed"], "P0001", /UPLOAD_STATUS/)).ok);
  check("A22 logo beyanı 2 MB üstü → CHECK reddi", (await expectErr(admin, UP, [TA, UA, "logo", "image/png", "l.png", 3_000_000, 1, "open"], "23514", /expert_wu_size_chk/)).ok);
  check("A23 SVG beyanı → CHECK reddi", (await expectErr(admin, UP, [TA, UA, "logo", "image/svg+xml", "l.svg", 100, 1, "open"], "23514", /expert_wu_mime_chk/)).ok);
  for (let i = 0; i < 4; i++) await admin.query(UP, [TA, UA, "logo", "image/png", `l${i}.png`, 1000, 1, "open"]);
  check("A24 aynı anda en fazla 5 açık yükleme", (await expectErr(admin, UP, [TA, UA, "logo", "image/png", "x.png", 1000, 1, "open"], "P0001", /UPLOAD_CAP/)).ok);
  check("A26 kolon yetkisi olmayan beyan alanı güncellenemez", (await expectErr(admin, "UPDATE public.expert_workspace_uploads SET declared_bytes=1 WHERE id=$1", [u1], "42501")).ok);
  check("A27 'completed' asset_id olmadan reddedilir", (await expectErr(admin, "UPDATE public.expert_workspace_uploads SET status='completed' WHERE id=$1", [u1], "23514", /expert_wu_asset_chk/)).ok);
  await admin.query("UPDATE public.expert_workspace_uploads SET status='aborted' WHERE id=$1", [u1]);
  check("A28 kapanan oturum yeniden açılamaz", (await expectErr(admin, "UPDATE public.expert_workspace_uploads SET status='open' WHERE id=$1", [u1], "P0001", /UPLOAD_STATUS/)).ok);
  const CH = "INSERT INTO public.expert_workspace_upload_chunks (upload_id, idx, tenant_id, user_id, data) VALUES ($1,$2,$3,$4,$5)";
  check("A29 3 MB üstü parça → CHECK reddi", (await expectErr(admin, CH, [u1, 0, TA, UA, Buffer.alloc(3145729)], "23514", /expert_wuc_size_chk/)).ok);
  await admin.query(CH, [u1, 0, TA, UA, Buffer.alloc(10)]);
  check("A30 aynı parça iki kez yazılamaz (PK)", (await expectErr(admin, CH, [u1, 0, TA, UA, Buffer.alloc(10)], "23505")).ok);
  check("A31 geçici parça sunucuca silinebilir", (await admin.query("DELETE FROM public.expert_workspace_upload_chunks WHERE upload_id=$1", [u1])).rowCount === 1);
  await admin.query("COMMIT");

  // ── İzin listesi ──
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const G = "INSERT INTO public.expert_workspace_access_grants (tenant_id, user_id, granted_by, note) VALUES ($1,$2,$3,$4) RETURNING id";
  check("A32 kendi kendine izin → CHECK reddi", (await expectErr(admin, G, [TA, UA, UA, null], "23514", /expert_wag_self_chk/)).ok);
  const g1 = (await admin.query(G, [TA, UA, OWNER, "test uzmanı"])).rows[0].id;
  check("A33 kullanıcı başına tek etkin izin", (await expectErr(admin, G, [TA, UA, OWNER, null], "23505", /expert_wag_active_uq/)).ok);
  check("A35 geri alma nedeni olmadan geri alma → CHECK reddi", (await expectErr(admin, "UPDATE public.expert_workspace_access_grants SET revoked_at=now(), revoked_by=$2 WHERE id=$1", [g1, OWNER], "23514", /expert_wag_revoke_chk/)).ok);
  await admin.query("UPDATE public.expert_workspace_access_grants SET revoked_at=now(), revoked_by=$2, revoke_reason='owner_revoked' WHERE id=$1", [g1, OWNER]);
  check("A36 geri alınan izin diriltilemez", (await expectErr(admin, "UPDATE public.expert_workspace_access_grants SET revoked_at=NULL, revoked_by=NULL, revoke_reason=NULL WHERE id=$1", [g1], "P0001", /ALREADY_REVOKED/)).ok);
  check("A37 geri almadan sonra yeni izin verilebilir (eski kayıt denetim izi olarak kalır)", (await admin.query(G, [TA, UA, OWNER, null])).rowCount === 1);
  check("A38 izin kaydı SİLİNEMEZ", (await expectErr(admin, "DELETE FROM public.expert_workspace_access_grants WHERE id=$1", [g1], "42501")).ok);
  await admin.query("COMMIT");
  await admin.query("BEGIN");
  check("A39 süper kullanıcı bile izin kaydının kişisini değiştiremez", (await expectErr(admin, "UPDATE public.expert_workspace_access_grants SET user_id=$2 WHERE id=$1", [g1, UB], "P0001", /GRANT_IMMUTABLE/)).ok);
  await admin.query("ROLLBACK");

  // ── Kapasite raporu ──
  await admin.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('expert-workspace', $1, '{"size":"12345"}'), ('expert-workspace', $2, '{"size":"55"}'), ('client-anamnesis-files', $3, '{"size":"9"}')`,
    [`${TA}/${UA}/x/desktop.webp`, `${TA}/${UA}/x/mobile.webp`, `${TA}/c/a.pdf`]);
  const us = (await admin.query("SELECT tenant_id, bucket, object_count, total_bytes FROM public.expert_storage_usage() WHERE tenant_id=$1 ORDER BY bucket", [TA])).rows;
  const ew = us.find((r) => r.bucket === "expert-workspace");
  check("A40 kapasite raporu expert-workspace'i tenant'a atfeder (2 nesne, 12400 B)", ew && Number(ew.object_count) === 2 && Number(ew.total_bytes) === 12400, JSON.stringify(us));
  check("A41 kapasite raporunun diğer bucket kapsamı değişmedi (client-anamnesis-files önceden de yoktu)", !us.some((r) => r.bucket === "client-anamnesis-files"));
  const fp = (await admin.query(`SELECT has_function_privilege('anon','public.expert_storage_usage()','EXECUTE') a, has_function_privilege('authenticated','public.expert_storage_usage()','EXECUTE') u, has_function_privilege('service_role','public.expert_storage_usage()','EXECUTE') s, (SELECT prosecdef FROM pg_proc WHERE proname='expert_storage_usage') sd`)).rows[0];
  check("A42 kapasite fonksiyonunun yetkileri korunur (anon/auth yok, service_role var, SECURITY DEFINER)", !fp.a && !fp.u && fp.s && fp.sd, JSON.stringify(fp));

  // ── Hesap temizleme keşfi ──
  const disc = await admin.query(`SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace JOIN pg_attribute a ON a.attrelid=cl.oid AND a.attname='tenant_id' AND NOT a.attisdropped
     WHERE ns.nspname='public' AND cl.relkind='r' AND a.atttypid='uuid'::regtype AND cl.relname = ANY($1)`, [TABLES]);
  check("A43 hesap/tenant temizleme keşfi 4 tabloyu da kapsar (tenant_id uuid)", disc.rowCount === 4);
  await admin.query("BEGIN");
  for (const t of TABLES) await admin.query(`DELETE FROM public.${t} WHERE tenant_id=$1`, [TA]);
  const left = Number((await admin.query(`SELECT ${TABLES.map((t) => `(SELECT count(*) FROM public.${t} WHERE tenant_id='${TA}')`).join("+")} n`)).rows[0].n);
  const otherB = Number((await admin.query("SELECT count(*) n FROM public.expert_workspace_assets WHERE tenant_id=$1", [TB])).rows[0].n);
  await admin.query("ROLLBACK");
  check("A44 tenant silme döngüsü (süper kullanıcı, sentetik, geri alındı): A boşalır, B etkilenmez — FK engeli yok", left === 0 && otherB === 60);

  // ── Güvenlik manifesti ──
  const full = JSON.parse(fs.readFileSync(path.join(REPO, "supabase/expected-manifest.json"), "utf8"));
  check("A45 manifest: 4 tablo + 4 fonksiyon + bucket + politika-yok kuralı kayıtlı",
    TABLES.every((t) => full.tables_no_client_grant.names.includes(t) && full.tables_rls_enabled.names.includes(t)) && FUNCS.every((f) => full.functions_no_client_execute.names.includes(f))
    && full.buckets["expert-workspace"]?.public === false && full.storage_policies_absent.some((r) => new RegExp(r.policy_name_pattern).test("expert_workspace_public_read")));
  const MANIFEST_SQL = fs.readFileSync(path.join(REPO, "scripts/final-hardening/drift/manifest.sql"), "utf8");
  const exp = { functions_no_client_execute: { names: FUNCS }, tables_no_client_grant: { names: TABLES }, tables_rls_enabled: { names: TABLES },
    storage_policies_absent: full.storage_policies_absent.filter((r) => String(r.reason).includes("expert-workspace")), buckets: { "expert-workspace": full.buckets["expert-workspace"] },
    tables_no_client_dangerous_privileges: full.tables_no_client_dangerous_privileges, broad_client_policies_absent: full.broad_client_policies_absent };
  const cmp = compareManifest((await admin.query(MANIFEST_SQL)).rows[0].manifest, exp);
  check("A46 drift karşılaştırması bu migration için FAIL üretmez", cmp.fails.length === 0 && cmp.checked > 0, cmp.fails.join(" | ").slice(0, 300));
  await admin.query("BEGIN");
  await admin.query(`CREATE POLICY expert_workspace_leak ON storage.objects FOR SELECT TO anon USING (bucket_id = 'expert-workspace')`);
  await admin.query(`UPDATE storage.buckets SET public = true WHERE id = 'expert-workspace'`);
  const leak = compareManifest((await admin.query(MANIFEST_SQL)).rows[0].manifest, exp);
  await admin.query("ROLLBACK");
  check("A47 kasıtlı politika + public bucket drift'te FAIL olarak yakalanır (geri alındı)", leak.fails.some((x) => /expert_workspace_leak/.test(x)) && leak.fails.some((x) => /expert-workspace\.public/.test(x)), leak.fails.join(" | ").slice(0, 200));
  await admin.end();
} catch (e) {
  fail++;
  console.log(`FAIL workspace-assets: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])));
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nworkspace assets (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
