/**
 * WT3.1 — YH outbox webhook secret → Vault migration'ı: GERÇEK PostgreSQL davranış harness'ı.
 * ====================================================================
 * embedded-postgres üzerinde (ağ YOK, production'a SIFIR temas). Supabase'e özgü şemalar prod
 * imzalarıyla birebir STUB'lanır:
 *   - vault.secrets / vault.decrypted_secrets / vault.create_secret / vault.update_secret
 *     (prod: create_secret(new_secret, new_name DEFAULT NULL, new_description DEFAULT '', new_key_id DEFAULT NULL)
 *      update_secret(secret_id, new_secret DEFAULT NULL, ...)) — anon/authenticated erişemez (prod ile aynı)
 *   - net.http_post(url, body, params, headers, timeout_milliseconds) → net.calls'a yazar
 *   - net.http_request_queue / net._http_response (prod'daki gibi anon/authenticated SELECT'li)
 *   - supabase_functions.http_request (ESKİ dashboard webhook'u; secret trigger argümanında)
 * Doğrulananlar: eski plaintext trigger kalkar; tanımlarda secret yok; Vault'tan okuyan trigger
 * aynı payload'u gönderir; best-effort (net hatası/yapılandırma yok → outbox yazımı bloklanmaz);
 * rotation (yeniden çalıştırma değeri değiştirir, eski geçersiz); RPC true/false/null;
 * rol izolasyonu (anon/authenticated RPC/vault/kuyruk okuyamaz; service_role RPC çalıştırır);
 * Vault/pg_net olmayan ortamda migration hatasız atlar.
 * Secret değerleri ASLA yazdırılmaz (yalnız SQL içinde karşılaştırılır).
 *
 * Çalıştır: node scripts/yh-webhook-vault-migration-harness.mjs
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = readFileSync(path.join(ROOT, "supabase/migrations/20271010000000_yh_outbox_webhook_vault_secret.sql"), "utf8");
const PORT = 54871;
const PW = "zz-harness-local-only";
const DATA_DIR = path.join(os.tmpdir(), `yh-vault-mig-${process.pid}`);
const OLD_LEAKED = "zz-old-leaked-test-secret-0001";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${e}`); } };
const errOf = async (p) => { try { await p; return null; } catch (e) { return e.code ?? e.message; } };

const BASE = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  GRANT anon, authenticated, service_role TO postgres;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS extensions;
  GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
  CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
  CREATE TABLE public.yasam_hafizasi_outbox (
    id bigserial PRIMARY KEY, source_key text NOT NULL, source_table text, source_id uuid NOT NULL,
    tenant_id uuid NOT NULL, operation text NOT NULL, status text NOT NULL DEFAULT 'pending',
    event_version bigint NOT NULL DEFAULT 1, updated_at timestamptz DEFAULT now()
  );
`;

const SUPABASE_STUBS = `
  -- Vault (prod imzaları)
  CREATE SCHEMA vault;
  CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, description text DEFAULT '',
    secret text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  CREATE VIEW vault.decrypted_secrets AS SELECT id, name, description, secret, secret AS decrypted_secret, created_at, updated_at FROM vault.secrets;
  CREATE FUNCTION vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '', new_key_id uuid DEFAULT NULL)
    RETURNS uuid LANGUAGE sql AS $f$ INSERT INTO vault.secrets(name, description, secret) VALUES (new_name, new_description, new_secret) RETURNING id $f$;
  CREATE FUNCTION vault.update_secret(secret_id uuid, new_secret text DEFAULT NULL, new_name text DEFAULT NULL, new_description text DEFAULT NULL, new_key_id uuid DEFAULT NULL)
    RETURNS void LANGUAGE sql AS $f$ UPDATE vault.secrets SET secret = coalesce(new_secret, secret), name = coalesce(new_name, name), updated_at = now() WHERE id = secret_id $f$;
  REVOKE ALL ON SCHEMA vault FROM PUBLIC;
  GRANT USAGE ON SCHEMA vault TO service_role;
  GRANT SELECT ON vault.secrets, vault.decrypted_secrets TO service_role;

  -- pg_net (prod imzası) — çağrılar kaydedilir; test.fail_net=1 → hata
  CREATE SCHEMA net;
  CREATE TABLE net.calls (id bigserial PRIMARY KEY, url text, body jsonb, params jsonb, headers jsonb, timeout_ms int);
  CREATE TABLE net.http_request_queue (id bigserial PRIMARY KEY, headers jsonb);
  CREATE TABLE net._http_response (id bigserial PRIMARY KEY, status_code int);
  CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
    RETURNS bigint LANGUAGE plpgsql AS $f$
    DECLARE v bigint;
    BEGIN
      IF current_setting('test.fail_net', true) = '1' THEN RAISE EXCEPTION 'pg_net down (test)'; END IF;
      INSERT INTO net.calls(url, body, params, headers, timeout_ms) VALUES (url, body, params, headers, timeout_milliseconds) RETURNING id INTO v;
      RETURN v;
    END $f$;
  GRANT USAGE ON SCHEMA net TO anon, authenticated, service_role;
  GRANT SELECT ON net.http_request_queue, net._http_response TO anon, authenticated;

  -- ESKİ dashboard webhook'u (secret trigger ARGÜMANINDA)
  CREATE SCHEMA supabase_functions;
  CREATE FUNCTION supabase_functions.http_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $f$
    BEGIN INSERT INTO net.calls(url, headers) VALUES (TG_ARGV[0], TG_ARGV[2]::jsonb); RETURN NEW; END $f$;
  CREATE TRIGGER yh_professional_outbox AFTER INSERT OR UPDATE ON public.yasam_hafizasi_outbox FOR EACH ROW
    EXECUTE FUNCTION supabase_functions.http_request('https://example.test/api/internal/yh/outbox-webhook', 'POST',
      '{"Content-type":"application/json","x-yh-webhook-secret":"${OLD_LEAKED}"}', '{}', '5000');
`;

const pgServer = new EmbeddedPostgres({
  databaseDir: DATA_DIR, port: PORT, user: "postgres", password: PW, persistent: false,
  initdbFlags: ["--encoding=UTF8", "--no-locale"], onLog: () => {}, onError: () => {},
});
const client = (database) => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database });
const one = async (c, sql, params) => (await c.query(sql, params)).rows[0];

const INSERT_ROW = `INSERT INTO public.yasam_hafizasi_outbox(source_key, source_table, source_id, tenant_id, operation)
  VALUES ('dogaltas:minerals', 'minerals', gen_random_uuid(), gen_random_uuid(), 'upsert') RETURNING id`;
const SECRET = `(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='yh_outbox_webhook_secret')`;

async function main() {
  await pgServer.initialise();
  await pgServer.start();
  try {
    // ── 1) Supabase benzeri ortam ─────────────────────────────────────────
    const admin = client("postgres");
    await admin.connect();
    await admin.query("CREATE DATABASE yh_vault"); await admin.query("CREATE DATABASE yh_plain");
    await admin.end();

    const c = client("yh_vault");
    await c.connect();
    await c.query(BASE); await c.query(SUPABASE_STUBS);
    console.log("[1] Supabase benzeri ortam (vault + pg_net + eski plaintext webhook)");
    const before = await one(c, `SELECT pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE tgname='yh_professional_outbox'`);
    ok("ön-koşul: eski trigger tanımında secret GÖRÜNÜYOR (bulgu yeniden üretildi)", before.d.includes(OLD_LEAKED));

    ok("migration uygulanır", (await errOf(c.query(MIG))) === null);

    // ── 2) Tanımlarda secret yok ───────────────────────────────────────────
    console.log("[2] tanımlar");
    const def = await one(c, `SELECT pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE tgname='yh_professional_outbox'`);
    ok("trigger yeni fonksiyona bağlı (yh_outbox_webhook_notify)", /EXECUTE FUNCTION yh_outbox_webhook_notify\(\)|EXECUTE FUNCTION public\.yh_outbox_webhook_notify\(\)/.test(def.d), def.d);
    ok("trigger tanımında eski secret YOK", !def.d.includes(OLD_LEAKED) && !/secret"\s*:/.test(def.d));
    const leak = await one(c, `SELECT
        (SELECT count(*) FROM pg_trigger WHERE encode(tgargs,'escape') LIKE '%'||${SECRET}||'%' OR encode(tgargs,'escape') LIKE '%${OLD_LEAKED}%')::int AS trg,
        (SELECT count(*) FROM pg_proc WHERE prosrc LIKE '%'||${SECRET}||'%' OR prosrc LIKE '%${OLD_LEAKED}%')::int AS fn,
        (SELECT count(*) FROM information_schema.triggers WHERE action_statement LIKE '%'||${SECRET}||'%')::int AS isch,
        (SELECT count(*) FROM pg_proc p WHERE p.proname IN ('yh_outbox_webhook_notify','yh_outbox_webhook_secret_matches') AND pg_get_functiondef(p.oid) LIKE '%'||${SECRET}||'%')::int AS fdef`);
    ok("pg_trigger/pg_proc/information_schema/pg_get_functiondef'te secret (yeni+eski) YOK", leak.trg === 0 && leak.fn === 0 && leak.isch === 0 && leak.fdef === 0, JSON.stringify(leak));
    const s1 = await one(c, `SELECT length(${SECRET}) AS len, ${SECRET} ~ '^[0-9a-f]{64}$' AS hex`);
    ok("Vault'ta 32 bayt rastgele secret (64 hex) üretildi", s1.len === 64 && s1.hex === true);

    // ── 3) URL yok → uyandırma atlanır, yazım bloklanmaz ───────────────────
    console.log("[3] best-effort davranış");
    await c.query("TRUNCATE net.calls");
    ok("URL yapılandırılmamış: outbox INSERT başarılı", (await errOf(c.query(INSERT_ROW))) === null);
    ok("URL yapılandırılmamış: HTTP çağrısı yok (safety cron toparlar)", Number((await one(c, "SELECT count(*) n FROM net.calls")).n) === 0);
    await c.query(`SELECT vault.create_secret('https://example.test/api/internal/yh/outbox-webhook', 'yh_outbox_webhook_url', 'test')`);

    // ── 4) Payload + header ───────────────────────────────────────────────
    const ins = await one(c, INSERT_ROW);
    const call = await one(c, `SELECT url, body, timeout_ms, (headers->>'x-yh-webhook-secret') = ${SECRET} AS secret_ok,
        headers->>'Content-Type' AS ctype, (headers ? 'x-yh-webhook-secret') AS has_hdr FROM net.calls ORDER BY id DESC LIMIT 1`);
    ok("INSERT → tek HTTP POST, URL Vault'tan", call?.url === "https://example.test/api/internal/yh/outbox-webhook");
    ok("header x-yh-webhook-secret = Vault değeri (karşılaştırma SQL içinde)", call?.secret_ok === true && call?.has_hdr === true && call?.ctype === "application/json");
    ok("payload şekli eski webhook ile aynı (type/table/schema/record/old_record)", call?.body?.type === "INSERT" && call?.body?.table === "yasam_hafizasi_outbox"
      && call?.body?.schema === "public" && String(call?.body?.record?.id) === String(ins.id) && call?.body?.old_record === null, JSON.stringify(call?.body ?? {}).slice(0, 160));
    ok("timeout 5000 ms (eski ile aynı)", call?.timeout_ms === 5000);
    await c.query(`UPDATE public.yasam_hafizasi_outbox SET status='processing', event_version=event_version+1 WHERE id=$1`, [ins.id]);
    const up = await one(c, `SELECT body FROM net.calls ORDER BY id DESC LIMIT 1`);
    ok("UPDATE → old_record + record (event_version döngü koruması için)", up.body.type === "UPDATE" && Number(up.body.old_record.event_version) === 1 && Number(up.body.record.event_version) === 2);

    // pg_net hatası → yazım yine başarılı
    await c.query("SET test.fail_net = '1'");
    const n0 = Number((await one(c, "SELECT count(*) n FROM public.yasam_hafizasi_outbox")).n);
    ok("pg_net hatası: outbox INSERT yine başarılı (WARNING, bloklama yok)", (await errOf(c.query(INSERT_ROW))) === null
      && Number((await one(c, "SELECT count(*) n FROM public.yasam_hafizasi_outbox")).n) === n0 + 1);
    await c.query("RESET test.fail_net");

    // ── 5) RPC: true / false / null ───────────────────────────────────────
    console.log("[5] doğrulama RPC'si");
    const m = await one(c, `SELECT public.yh_outbox_webhook_secret_matches(${SECRET}) AS good,
        public.yh_outbox_webhook_secret_matches('yanlis') AS bad, public.yh_outbox_webhook_secret_matches('') AS empty,
        public.yh_outbox_webhook_secret_matches(NULL) AS nul, public.yh_outbox_webhook_secret_matches('${OLD_LEAKED}') AS old`);
    ok("doğru secret → true", m.good === true);
    ok("yanlış / boş / NULL → false", m.bad === false && m.empty === false && m.nul === false);
    ok("ESKİ (sızan) secret → false", m.old === false);

    // ── 6) Rotation ───────────────────────────────────────────────────────
    console.log("[6] rotation");
    await c.query(`CREATE TEMP TABLE prev AS SELECT ${SECRET} AS v`);
    ok("migration yeniden çalışır (idempotent)", (await errOf(c.query(MIG))) === null);
    const r = await one(c, `SELECT (SELECT v FROM prev) <> ${SECRET} AS changed, public.yh_outbox_webhook_secret_matches((SELECT v FROM prev)) AS prev_ok,
        (SELECT count(*) FROM vault.secrets WHERE name='yh_outbox_webhook_secret')::int AS n,
        (SELECT count(*) FROM pg_trigger WHERE tgname='yh_professional_outbox')::int AS trg`);
    ok("yeniden çalıştırma secret'ı DEĞİŞTİRİR (rotation)", r.changed === true);
    ok("rotation sonrası önceki secret → false", r.prev_ok === false);
    ok("tek Vault kaydı + tek trigger (çoğalma yok)", r.n === 1 && r.trg === 1);

    // ── 7) Rol izolasyonu ─────────────────────────────────────────────────
    console.log("[7] rol izolasyonu");
    for (const role of ["anon", "authenticated"]) {
      await c.query(`SET ROLE ${role}`);
      ok(`${role}: RPC çalıştıramaz (42501)`, (await errOf(c.query(`SELECT public.yh_outbox_webhook_secret_matches('x')`))) === "42501");
      ok(`${role}: vault.decrypted_secrets okuyamaz (42501)`, (await errOf(c.query(`SELECT 1 FROM vault.decrypted_secrets`))) === "42501");
      ok(`${role}: net.http_request_queue okuyamaz (42501)`, (await errOf(c.query(`SELECT 1 FROM net.http_request_queue`))) === "42501");
      ok(`${role}: net._http_response okuyamaz (42501)`, (await errOf(c.query(`SELECT 1 FROM net._http_response`))) === "42501");
      ok(`${role}: trigger fonksiyonunu doğrudan çağıramaz`, (await errOf(c.query(`SELECT public.yh_outbox_webhook_notify()`))) !== null);
      await c.query("RESET ROLE");
    }
    await c.query("SET ROLE service_role");
    const sr = await errOf(c.query(`SELECT public.yh_outbox_webhook_secret_matches('x')`));
    ok("service_role: RPC çalıştırır (yalnız boolean döner)", sr === null);
    await c.query("RESET ROLE");

    // Vault kaydı silinirse → NULL (uygulama 503 fail-closed)
    await c.query(`DELETE FROM vault.secrets WHERE name='yh_outbox_webhook_secret'`);
    ok("Vault secret yok → RPC NULL (uygulama 503)", (await one(c, `SELECT public.yh_outbox_webhook_secret_matches('x') AS v`)).v === null);
    await c.end();

    // ── 8) Vault/pg_net olmayan ortam (yerel test PG) ─────────────────────
    console.log("[8] Vault/pg_net yok");
    const p = client("yh_plain");
    await p.connect();
    await p.query(BASE);
    ok("Vault/pg_net yokken migration hatasız (adım atlanır)", (await errOf(p.query(MIG))) === null);
    ok("outbox'a trigger eklenmedi (prod'a/hiçbir yere istek yok)", Number((await one(p, `SELECT count(*) n FROM pg_trigger WHERE tgname='yh_professional_outbox'`)).n) === 0);
    await p.end();
  } finally {
    await pgServer.stop().catch(() => {});
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
  console.log(`\nyh-webhook-vault-migration-harness: ${pass}/${pass + fail} PASS`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); pgServer.stop().catch(() => {}); process.exit(1); });
