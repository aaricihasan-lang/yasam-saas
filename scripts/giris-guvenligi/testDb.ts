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

export type F2cDb = { admin: pg.Client; pool: pg.Pool; shimUrl: string; close: () => Promise<void> };

export async function startF2cDb(opts: { withF2d?: boolean; withF2e?: boolean } = {}): Promise<F2cDb> {
  // Uyumluluk koşusu: F2_TEST_DB_WITH_F2E=1 → önceki fazların harness'ları bütün zincir (000500 dahil) üstünde koşar.
  if (process.env.F2_TEST_DB_WITH_F2E === "1") opts = { ...opts, withF2d: true, withF2e: true };
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
  await admin.query(BOOT);
  for (const f of [...F2C_FILES, ...(opts.withF2d || opts.withF2e ? F2D_FILES : []), ...(opts.withF2e ? F2E_FILES : [])]) await admin.query(fs.readFileSync(path.join(ROOT, f), "utf8"));
  await admin.query(HARNESS_SQL);
  const pool = new pg.Pool({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres", max: 8 });
  const shim = await startEmbedShim(pool);
  return {
    admin, pool, shimUrl: shim.url,
    close: async () => {
      await admin.end().catch(() => {});
      await shim.close().catch(() => {});
      await pool.end().catch(() => {});
      await server.stop().catch(() => {});
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
    },
  };
}
