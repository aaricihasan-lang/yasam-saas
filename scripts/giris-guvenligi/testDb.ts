/**
 * GİRİŞ GÜVENLİĞİ F2-C — yerel test veritabanı (embedded-postgres + repo migration zinciri + PostgREST shim).
 * Production'a SIFIR temas; sentetik kullanıcılar (session-model + f2a/f2b/f2c fixture'ları).
 * Test-only taklitler: auth_login_guarded (crypt parola), trial_activate_on_login (idempotent kayıt).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from "node:crypto";
import pg from "pg";
import { startEmbedShim } from "../dogal-destek-p2/beslenme/pgrestEmbedShim";
import { F2_STAGES } from "./f2-migration-guard.mjs";

const ROOT = process.cwd();
export const F2C_FILES = [
  "scripts/final-hardening/fixtures/session-model-fixture.sql",
  "scripts/final-hardening/fixtures/session-f2a-fixture.sql",
  "scripts/final-hardening/fixtures/session-f2b-fixture.sql",
  "scripts/final-hardening/fixtures/session-f2c-fixture.sql",
  "supabase/migrations/20270129000200_user_sessions_expiry_touch.sql",
  "supabase/migrations/20271003200000_session_model_v2.sql",
  "supabase/migrations/20271003200100_admin_audit_session_actions.sql",
  "supabase/migrations/20280103000000_auth_session_hardening_f2a.sql",
  "supabase/migrations/20280103000100_auth_mfa_core_f2b.sql",
  "supabase/migrations/20280103000200_auth_session_insert_lock_f2b.sql",
  "supabase/migrations/20280103000300_auth_trusted_devices_qr_f2c.sql",
];
/** F2-D eki: e-posta OTP (f2d fixture + 20280103000400). startF2cDb({ withF2d: true }). */
export const F2D_FILES = [
  "scripts/final-hardening/fixtures/session-f2d-fixture.sql",
  "supabase/migrations/20280103000400_auth_email_otp_f2d.sql",
];
/** F2-E eki: hesap kurtarma (20280103000500). startF2cDb({ withF2d: true, withF2e: true }). */
export const F2E_FILES = [
  "supabase/migrations/20280103000500_auth_account_recovery_f2e.sql",
  // F2-F: silme × denetim saklama + Owner taze ikinci doğrulama.
  "supabase/migrations/20280103000600_auth_purge_audit_retention_f2f.sql",
];
const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;
const HARNESS_SQL = `
GRANT SELECT, UPDATE ON public.users TO service_role;
GRANT SELECT, INSERT ON public.security_events TO service_role;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_demo_account boolean NOT NULL DEFAULT false;
-- /api/auth/profile (verifyUserRequest PROFILE_USER_SELECT) kolonları — prod'da mevcut; fixture'da boş.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS module_permissions jsonb,
  ADD COLUMN IF NOT EXISTS package_type text, ADD COLUMN IF NOT EXISTS membership_status text,
  ADD COLUMN IF NOT EXISTS subscription_status text, ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz, ADD COLUMN IF NOT EXISTS membership_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_ends_at timestamptz, ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS admin_level text, ADD COLUMN IF NOT EXISTS trial_kind text, ADD COLUMN IF NOT EXISTS trial_status text;
UPDATE public.users SET package_type = 'premium', plan = 'premium', membership_status = 'active' WHERE role = 'expert';
UPDATE public.users SET password_hash = extensions.crypt('parola-' || split_part(email, '@', 1), extensions.gen_salt('bf', 4)),
                        name = coalesce(name, initcap(split_part(email, '@', 1)));
CREATE FUNCTION public.auth_login_guarded(p_email text, p_password text, p_ip_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('status', 'ok', 'user', jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name,
       'role', u.role, 'status', u.status, 'tenant_id', u.tenant_id, 'active', u.active, 'approval_status', u.approval_status))
       FROM public.users u WHERE lower(btrim(u.email)) = lower(btrim(p_email))
        AND u.password_hash = extensions.crypt(p_password, u.password_hash) LIMIT 1),
    jsonb_build_object('status', 'invalid'));
$$;
GRANT EXECUTE ON FUNCTION public.auth_login_guarded(text, text, text) TO service_role;
CREATE TABLE public.harness_trial_log (user_id uuid NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION public.trial_activate_on_login(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.harness_trial_log WHERE user_id = p_user_id) THEN
    INSERT INTO public.harness_trial_log (user_id) VALUES (p_user_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'activated', false, 'phase', 'none');
END $$;
GRANT EXECUTE ON FUNCTION public.trial_activate_on_login(uuid) TO service_role;
`;

export const U = {
  owner: "00000000-0000-0000-0000-00000000a001",
  exp: "00000000-0000-0000-0000-00000000e0f2",
  and1: "00000000-0000-0000-0000-00000000e0b2",
  free: "00000000-0000-0000-0000-00000000e001",
};
export const EMAIL = { owner: "admin@test.local", exp: "f2a-exp@test.local", and1: "f2b-and@test.local", free: "free@test.local" };
export const pw = (email: string) => `parola-${email.split("@")[0]}`;

export type Phone = { priv: KeyObject; spki: string; deviceId?: string };
export function newPhone(): Phone {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { priv: privateKey, spki: (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64") };
}
export const signWith = (p: Phone, msg: string) =>
  cryptoSign("sha256", Buffer.from(msg, "utf8"), { key: p.priv, dsaEncoding: "der" }).toString("base64");

/** Kurulan test DB'sinin F2 düzeyi: kayıt (auth_f2_schema_level; F2-J öncesinde yok) + katalog parmak izi (bağımsız). */
export type F2DbLevel = { registry: number | null; catalog: number; latest: number };
export type F2cDb = { admin: pg.Client; pool: pg.Pool; shimUrl: string; level: F2DbLevel; close: () => Promise<void> };

/** F2-G eki: Owner işleme özel yeniden doğrulama + saklama politikası kaydı. startF2cDb({ withF2g: true }). */
export const F2G_FILES = [
  "supabase/migrations/20280103000700_auth_owner_step_up_f2g.sql",
];
/** F2-I eki: 17.11 güvenlik denetimi düzeltmeleri. startF2cDb({ withF2i: true }). */
export const F2I_FILES = [
  "supabase/migrations/20280103000900_auth_security_hardening_f2i.sql",
];
/** F2-J eki: Android yönetici oturumu cihaz kanıtı + kanal + eski oturum geçişi. startF2cDb({ withF2j: true }). */
export const F2J_FILES = [
  "supabase/migrations/20280103001000_auth_session_device_binding_f2j.sql",
];
/** F2-K eki: kritik yetki (yönetici verme) + cihaz güvenliği. startF2cDb({ withF2k: true }). */
export const F2K_FILES = [
  "supabase/migrations/20280103001100_auth_critical_privilege_device_f2k.sql",
];
/** F2-M eki: e-posta sağlayıcı listesine 'smtp' (Turhost SMTP). startF2cDb({ withF2m: true }). */
export const F2M_FILES = [
  "supabase/migrations/20280103001200_auth_email_smtp_provider_f2m.sql",
];
/** F2-H eki: denetim kayıtları kontrollü imha. startF2cDb({ withF2h: true }). */
export const F2H_FILES = [
  "supabase/migrations/20280103000800_auth_audit_retention_disposal_f2h.sql",
];
/**
 * Kurulan DB'nin F2 düzeyi iki BAĞIMSIZ kaynaktan: kayıt fonksiyonu (F2-J ile gelir; öncesinde null) ve her aşamanın
 * katalog parmak izi (F2_STAGES; f2-migration-guard ile aynı ifade) — en yüksek sağlanan aşama.
 */
export async function readF2Level(client: pg.Client): Promise<F2DbLevel> {
  // Ayrı sorgu: fonksiyon yokken çağrı ayrıştırma aşamasında hata verir (CASE içinde bile).
  const hasReg = (await client.query(`SELECT to_regprocedure('public.auth_f2_schema_level()') IS NOT NULL AS x`)).rows[0].x === true;
  const reg = hasReg ? (await client.query(`SELECT public.auth_f2_schema_level() AS l`)).rows[0].l : null;
  let catalog = -1;
  for (const s of F2_STAGES) if ((await client.query(`SELECT (${s.fp}) AS x`)).rows[0].x === true) catalog = s.level;
  return { registry: reg === null || reg === undefined ? null : Number(reg), catalog, latest: F2_STAGES[F2_STAGES.length - 1].level };
}

export async function startF2cDb(opts: { withF2d?: boolean; withF2e?: boolean; withF2g?: boolean; withF2h?: boolean; withF2i?: boolean; withF2j?: boolean; withF2k?: boolean; withF2m?: boolean } = {}): Promise<F2cDb> {
  // Uyumluluk koşusu: F2_TEST_DB_WITH_F2E=1 → önceki fazların harness'ları bütün zincir (000500 dahil) üstünde koşar.
  if (process.env.F2_TEST_DB_WITH_F2E === "1") opts = { ...opts, withF2d: true, withF2e: true };
  // F2_TEST_DB_WITH_F2I=1 → bütün zincir 000900 (F2-I) dahil: önceki fazların akışları F2-I düzeltmeleriyle aynen çalışır.
  if (process.env.F2_TEST_DB_WITH_F2I === "1") opts = { ...opts, withF2d: true, withF2e: true, withF2i: true };
  // F2_TEST_DB_WITH_F2G=1 → zincir 000700'e kadar (karşılaştırma: bir farkın F2-G'den mi F2-I'den mi geldiğini ayırmak için).
  if (process.env.F2_TEST_DB_WITH_F2G === "1") opts = { ...opts, withF2d: true, withF2e: true, withF2g: true };
  // F2_TEST_DB_WITH_F2J=1 → bütün zincir 001000 (F2-J) dahil: önceki fazların akışları F2-J ile aynen çalışır mı?
  if (process.env.F2_TEST_DB_WITH_F2J === "1") opts = { ...opts, withF2d: true, withF2e: true, withF2i: true, withF2j: true };
  // F2_TEST_DB_WITH_F2K=1 → bütün zincir 001100 (F2-K) dahil.
  if (process.env.F2_TEST_DB_WITH_F2K === "1") opts = { ...opts, withF2d: true, withF2e: true, withF2i: true, withF2j: true, withF2k: true };
  // F2_TEST_DB_WITH_F2M=1 → bütün zincir 001200 (F2-M) dahil.
  if (process.env.F2_TEST_DB_WITH_F2M === "1") opts = { ...opts, withF2d: true, withF2e: true, withF2i: true, withF2j: true, withF2k: true, withF2m: true };
  // F2_TEST_DB_LATEST=1 → EN GÜNCEL F2 zinciri (bugün 001200). Yeni aşama eklenince bu satır da güncellenmeli; unutulursa
  // aşağıdaki düzey denetimi testi BAŞLATMADAN durdurur (f2-test-db-duzey.mjs). Negatif kontrolle (F2L_NEGATIF=1) birlikte
  // verilemez: negatif kontrol bilerek eski düzeyde kurulur, en güncel zincir onu sessizce "düzeltirdi".
  const latestMode = process.env.F2_TEST_DB_LATEST === "1";
  if (latestMode && process.env.F2L_NEGATIF === "1") throw new Error("F2_TEST_DB_LATEST=1 ve F2L_NEGATIF=1 birlikte verilemez (negatif kontrol izolasyonu)");
  if (latestMode) opts = { ...opts, withF2m: true };
  if (opts.withF2m) opts = { ...opts, withF2k: true };
  if (opts.withF2k) opts = { ...opts, withF2j: true };
  if (opts.withF2j) opts = { ...opts, withF2i: true };
  if (opts.withF2i) opts = { ...opts, withF2h: true };
  if (opts.withF2h) opts = { ...opts, withF2g: true };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2c-db-"));
  const port = 57000 + Math.floor(Math.random() * 900);
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const server = new EmbeddedPostgres({
    databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
  });
  await server.initialise();
  await server.start();
  const admin = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  await admin.connect();
  // Kapanışta PostgreSQL durdurulurken boştaki bağlantılar "terminating connection due to administrator command"
  // alır; dinleyicisiz 'error' olayı süreci ÇÖKERTİR (özet satırı yazılmadan). Kapanış hatası test sonucu değildir.
  admin.on("error", () => {});
  await admin.query(BOOT);
  for (const f of [...F2C_FILES, ...(opts.withF2d || opts.withF2e || opts.withF2g ? F2D_FILES : []), ...(opts.withF2e || opts.withF2g ? F2E_FILES : []), ...(opts.withF2g ? F2G_FILES : []), ...(opts.withF2h ? F2H_FILES : []), ...(opts.withF2i ? F2I_FILES : []), ...(opts.withF2j ? F2J_FILES : []), ...(opts.withF2k ? F2K_FILES : []), ...(opts.withF2m ? F2M_FILES : [])]) await admin.query(fs.readFileSync(path.join(ROOT, f), "utf8"));
  await admin.query(HARNESS_SQL);
  const level = await readF2Level(admin);
  if (latestMode || process.env.F2_TEST_DB_LEVEL_LOG === "1") {
    console.log(`[f2-test-db] düzey kayıt=${level.registry ?? "yok"} katalog=${level.catalog} en-güncel=${level.latest}`);
  }
  if (latestMode && (level.registry !== level.latest || level.catalog !== level.latest)) {
    await admin.end().catch(() => {});
    await server.stop().catch(() => {});
    throw new Error(`F2_TEST_DB_LATEST=1 ama test DB düzeyi kayıt=${level.registry ?? "yok"} katalog=${level.catalog}, en güncel ${level.latest} — testDb.ts yeni F2 aşamasını uygulamıyor`);
  }
  const pool = new pg.Pool({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres", max: 8 });
  pool.on("error", () => {});
  const shim = await startEmbedShim(pool);
  return {
    admin, pool, shimUrl: shim.url, level,
    close: async () => {
      await admin.end().catch(() => {});
      await shim.close().catch(() => {});
      await pool.end().catch(() => {});
      await server.stop().catch(() => {});
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
    },
  };
}

/**
 * F2-K: yönetici oluşturma / etkinleştirme yollarının bu test veritabanında olmayan GERÇEK fonksiyonları için sade karşılıklar
 * (hash_password, admin_create_user_with_modules, admin_set_user_active) + production'daki gibi denetim kaydı yetkisi.
 * Güvenlik kararı karşılıklarda DEĞİL: yetki tetikleyicisi ve kanıtlı fonksiyonlar (001100) gerçek migration'dan gelir.
 */
export async function installAdminStandIns(admin: pg.Client): Promise<void> {
  await admin.query(`CREATE OR REPLACE FUNCTION public.hash_password(p_plain text) RETURNS text LANGUAGE sql SECURITY DEFINER
           SET search_path = public, extensions AS $f$ SELECT crypt(p_plain, gen_salt('bf', 4)) $f$;
           GRANT EXECUTE ON FUNCTION public.hash_password(text) TO service_role;`);
  await admin.query(`CREATE OR REPLACE FUNCTION public.admin_create_user_with_modules(p_payload jsonb, p_membership jsonb, p_modules jsonb, p_remove_keys text[])
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $f$
    DECLARE v uuid := gen_random_uuid(); r text := p_payload->>'role';
    BEGIN
      IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(p_payload->>'email')) THEN
        RETURN jsonb_build_object('outcome', 'already_exists');
      END IF;
      INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, password_hash)
      VALUES (v, lower(p_payload->>'email'), r, (SELECT tenant_id FROM public.users WHERE id = '${U.owner}'), r = 'admin', 'approved', p_payload->>'password_hash');
      RETURN jsonb_build_object('outcome', 'provisioned', 'user_id', v);
    END $f$;
    GRANT EXECUTE ON FUNCTION public.admin_create_user_with_modules(jsonb, jsonb, jsonb, text[]) TO service_role;`);
  await admin.query(`CREATE OR REPLACE FUNCTION public.admin_set_user_active(p_user_id uuid, p_actor_admin_id uuid, p_active boolean, p_expected_active boolean DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $f$
    BEGIN
      UPDATE public.users SET active = p_active WHERE id = p_user_id AND (p_expected_active IS NULL OR active IS NOT DISTINCT FROM p_expected_active);
      IF NOT FOUND THEN RAISE EXCEPTION 'durum' USING ERRCODE = 'UY001'; END IF;
      RETURN jsonb_build_object('ok', true, 'revoked_session_count', 0);
    END $f$;
    GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, uuid, boolean, boolean) TO service_role;`);
  await admin.query(`GRANT SELECT, INSERT ON public.admin_audit_log TO service_role`);

}
