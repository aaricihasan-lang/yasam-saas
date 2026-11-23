/**
 * GİRİŞ GÜVENLİĞİ F2-F — arşiv uzman KALICI SİLME × F2 güvenlik tabloları (GERÇEK PostgreSQL).
 *
 * Zincir: Üye Yönetimi FAZ 2 tabanı (admin_audit_log, provisioning_events, …) + oturum modeli + KVKK onamları +
 * 20271009100000_admin_purge_archived_expert (silme FONKSİYONUNA DOKUNULMAZ) + F2-A…F2-E + 20280103000600.
 * Production'a SIFIR temas; sentetik veri.
 *
 * Kanıtlanan:
 *   1) Güvenilir cihazı / kurtarma geçmişi olan arşiv uzman artık kalıcı silinebilir (önceden fail-closed RED).
 *   2) Silinen: hesabın oturumları, cihazları, kodları, challenge'ları, talepleri (sır / kişisel veri).
 *      KORUNAN (değiştirilemez güvenlik denetimi): auth_device_decisions, auth_recovery_events — satır sayısı
 *      silme öncesi = sonrası; değiştirilemezlik silmeden sonra da aynen çalışır.
 *   3) Başka kullanıcıların / tenant'ların hiçbir satırı değişmez.
 *   4) Purge DIŞINDA cihaz kaydı silinse bile karar kaydı silinmez (cascade yok).
 *   F2_PURGE_WITHOUT_FIX=1 → 000600 uygulanmaz: kusurun kendisi yeniden üretilir (beklenen: purge RED).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2-purge.harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const WITHOUT_FIX = process.env.F2_PURGE_WITHOUT_FIX === "1";
/** Production ile aynı arşiv / silme zinciri (Üye Arşiv 4a harness'ındaki sıra) — 20280101000600 arşiv durumu dahil. */
const PROD_ARCHIVE_CHAIN = [
  "20271230000000_astrology_technique_grants.sql",
  "20280101000000_trial7_self_trial.sql",
  "20280101000100_trial7_claims_retention.sql",
  "20280101000200_trial7_admin_trial_approval.sql",
  "20280101000300_admin_legacy_package_repair.sql",
  "20280101000400_admin_owner_notifications.sql",
  "20280101000500_admin_list_members_v2.sql",
  "20280101000600_admin_member_archive_state.sql",
];
/** Production salt-okunur KATALOG denetimi (2026-11-16, kayıt verisi okunmadı): md5(pg_proc.prosrc). */
const PROD_FN_MD5: Record<string, string> = {
  admin_archive_user: "ce0371defa6f9e24a600a0d254f31ea8",
  admin_purge_archived_expert: "e7219176868c97b179b433881ee4778f",
  admin_purge_in_progress: "ed71a230b07a2f34579f8a31b24421a9",
  admin_purge_require_archived_trg: "7dd4e55b7c7ad8c9c8e77dccfa8e152b",
  admin_unarchive_user: "4a894aab14b8a9ac36e1190596ed2ca6",
};

const F2_CHAIN = [
  "20271003200000_session_model_v2.sql",
  "20271003200100_admin_audit_session_actions.sql",
  "20280103000000_auth_session_hardening_f2a.sql",
  "20280103000100_auth_mfa_core_f2b.sql",
  "20280103000200_auth_session_insert_lock_f2b.sql",
  "20280103000300_auth_trusted_devices_qr_f2c.sql",
  "20280103000400_auth_email_otp_f2d.sql",
  "20280103000500_auth_account_recovery_f2e.sql",
];

async function main(): Promise<void> {
  const db = await startTestDb(Number(process.env.F2_PURGE_PG_PORT ?? 54431), `f2f-purge-db-${process.env.F2_PURGE_PG_PORT ?? 54431}`); // F2_PURGE_PG_PORT: sabit port başka süreçte doluysa
  const { su } = db;
  try {
    await su.query(`CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`);
    await su.query(`CREATE TABLE IF NOT EXISTS public.security_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      event_type text NOT NULL, severity text NOT NULL, message text, ip_address text, country text, city text,
      user_agent text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now(), reviewed_by_admin boolean NOT NULL DEFAULT false)`);
    await su.query(readMig("20271009100000_admin_purge_archived_expert.sql"));
    for (const f of PROD_ARCHIVE_CHAIN) await su.query(readMig(f));
    const md5s = (await su.query(`select p.proname, md5(replace(p.prosrc, chr(13), '')) h from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and p.proname = any($1)`, [Object.keys(PROD_FN_MD5)])).rows as { proname: string; h: string }[];
    for (const [fn, h] of Object.entries(PROD_FN_MD5)) {
      ok(md5s.find((r) => r.proname === fn)?.h === h, `test DB'deki ${fn} gövdesi production ile BİREBİR (md5)`);
    }
    for (const f of F2_CHAIN) await su.query(readMig(f));
    if (!WITHOUT_FIX) {
      await su.query(readMig("20280103000600_auth_purge_audit_retention_f2f.sql"));
      await su.query(readMig("20280103000600_auth_purge_audit_retention_f2f.sql"));   // idempotent
      await su.query(readMig("20280103000700_auth_owner_step_up_f2g.sql"));
    }
    console.log(`Test DB hazır (F2 zinciri${WITHOUT_FIX ? ", 000600 YOK — kusur yeniden üretimi" : " + 000600 ×2"}).\n`);

    const mkUser = async (role: "admin" | "expert", o: { superAdmin?: boolean; active?: boolean } = {}) => {
      const id = randomUUID();
      const tenant = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [tenant, `zz-${tenant.slice(0, 13)}`]);
      const email = `zz.f2f.${id.slice(0, 8)}@example.test`;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id)
                      values ($1,$2,$3,$4,$5,'approved',$6,$7)`, [id, `ZZ ${role}`, email, role, o.active ?? true, o.superAdmin ?? false, tenant]);
      return { id, tenant, email };
    };
    const cnt = async (sql: string, a: unknown[] = []) => Number((await su.query(sql, a)).rows[0].n);
    const owner = await mkUser("admin", { superAdmin: true });
    const target = await mkUser("expert");
    const other = await mkUser("expert");

    // F2 durumu: iki kullanıcıya da cihaz + karar + MFA geçmişi + kurtarma kodu / olayı (yalnız test kısayolu).
    const seedF2 = async (u: { id: string }, tag: string) => {
      const dev = (await su.query(
        `insert into public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state, activated_at)
         values ($1, repeat('A',120), encode(sha256($2::bytea),'hex'), 'ABCD-EFGH', 'Pixel', 'active', now()) returning id`, [u.id, `fp-${tag}`])).rows[0].id;
      await su.query(`insert into public.auth_device_decisions (device_id, actor_id, decision, verification_method, fingerprint_confirmed)
                      values ($1,$2,'approve','telefon',true), ($1,$3,'revoke','kullanici',false)`, [dev, owner.id, u.id]);
      await su.query(`insert into public.auth_mfa_challenges (user_id, browser_secret_hash, created_at, expires_at)
                      values ($1, encode(sha256('b'::bytea),'hex'), now(), now() + interval '5 minutes')`, [u.id]);
      await su.query(`insert into public.auth_recovery_codes (user_id, kind, batch_id, code_hash)
                      values ($1,'user',gen_random_uuid(), encode(sha256($2::bytea),'hex'))`, [u.id, `code-${tag}`]);
      await su.query(`select public.auth_recovery_log($1, $1, 'codes_generated', '{}'::jsonb)`, [u.id]);
      await su.query(`insert into public.security_events(user_id, event_type, severity) values ($1,'device_activated','medium')`, [u.id]);
      await su.query(`insert into public.user_sessions(user_id, session_token, is_active) values ($1,$2,false)`, [u.id, `zz-f2f-${randomUUID()}`]);
      return dev;
    };
    const tDev = await seedF2(target, "t");
    const oDev = await seedF2(other, "o");
    // Gerçek arşiv yolu (production fonksiyonu): aktif → arşivde (active=false + archived_at + oturum iptali + audit).
    const arch = (await su.query(`select public.admin_archive_user($1, $2) as r`, [target.id, owner.id])).rows[0].r;
    ok(arch?.ok !== false && (await cnt(`select count(*) n from public.users where id = $1 and archived_at is not null and active is not true`, [target.id])) === 1,
      "uzman production arşiv fonksiyonuyla arşivlendi", arch);

    const decisionsBefore = await cnt(`select count(*) n from public.auth_device_decisions`);
    const eventsBefore = await cnt(`select count(*) n from public.auth_recovery_events`);
    const otherSnapshot = async () => JSON.stringify((await su.query(
      `select (select count(*) from public.auth_trusted_devices where user_id = $1) d, (select count(*) from public.auth_recovery_codes where user_id = $1) c,
              (select count(*) from public.security_events where user_id = $1) s, (select count(*) from public.user_sessions where user_id = $1) us,
              (select count(*) from public.auth_mfa_challenges where user_id = $1) ch`, [other.id])).rows[0]);
    const otherBefore = await otherSnapshot();

    let res: Record<string, unknown> | null = null;
    let err = "";
    try {
      res = (await su.query(`select public.admin_purge_archived_expert($1,$2,$3) as r`, [target.id, owner.id, target.email])).rows[0].r;
    } catch (e) {
      err = (e as Error).message;
    }

    if (WITHOUT_FIX) {
      ok(!!err && /auth_device_decisions|auth_recovery_events|yalnız eklenebilir|UP0/.test(err), "KUSUR YENİDEN ÜRETİLDİ: cihaz/kurtarma geçmişi olan uzman silinemiyor", err || res);
      ok(await cnt(`select count(*) n from public.users where id = $1`, [target.id]) === 1, "fail-closed: hiçbir şey silinmedi");
    } else {
      ok(!err && res?.ok !== false, "cihaz + kurtarma geçmişi olan arşiv uzman kalıcı silindi", err || res);
      ok(await cnt(`select count(*) n from public.users where id = $1`, [target.id]) === 0, "kullanıcı satırı silindi");
      for (const t of ["auth_trusted_devices", "auth_recovery_codes", "auth_mfa_challenges", "user_sessions", "security_events"]) {
        ok(await cnt(`select count(*) n from public.${t} where user_id = $1`, [target.id]) === 0, `${t}: hedefin satırları silindi`);
      }
      ok(await cnt(`select count(*) n from public.auth_device_decisions`) === decisionsBefore, `auth_device_decisions KORUNDU (${decisionsBefore})`);
      ok(await cnt(`select count(*) n from public.auth_device_decisions where device_id = $1`, [tDev]) === 2, "silinen cihazın karar geçmişi yerinde");
      ok(await cnt(`select count(*) n from public.auth_recovery_events`) === eventsBefore, `auth_recovery_events KORUNDU (${eventsBefore})`);
      ok(await cnt(`select count(*) n from public.auth_recovery_events where subject_user_id = $1`, [target.id]) === 1, "silinen hesabın kurtarma olayı yerinde");
      ok(await otherSnapshot() === otherBefore, "başka kullanıcının F2 satırları birebir aynı");
      ok(await cnt(`select count(*) n from public.users where id = $1`, [other.id]) === 1, "başka kullanıcı yerinde");
      // Değiştirilemezlik silmeden sonra da aynen.
      for (const sql of [`update public.auth_device_decisions set note = 'x'`, `delete from public.auth_device_decisions`,
        `update public.auth_recovery_events set event = 'code_used'`, `delete from public.auth_recovery_events`]) {
        let blocked = false;
        try { await su.query(sql); } catch { blocked = true; }
        ok(blocked, `değiştirilemez kalır: ${sql.split(" ").slice(0, 3).join(" ")}`);
      }
      // Purge DIŞI: cihaz satırı silinse de karar kaydı kalır (cascade yok); FK yok, değer korunur.
      await su.query(`delete from public.auth_trusted_devices where id = $1`, [oDev]);
      ok(await cnt(`select count(*) n from public.auth_device_decisions where device_id = $1`, [oDev]) === 2, "cihaz silinince karar kaydı silinmez");
      // İzinler: service_role denetim tablolarına doğrudan erişemez (000300/000500 kuralı korunur).
      const priv = (await su.query(`select has_table_privilege('service_role','public.auth_recovery_events','SELECT') a,
                                           has_table_privilege('service_role','public.auth_device_decisions','DELETE') b`)).rows[0];
      ok(priv.a === false && priv.b === false, "API rolü denetim tablolarına erişemez");
    }
  } finally {
    await db.stop();
  }
  console.log(`\nf2-purge harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
