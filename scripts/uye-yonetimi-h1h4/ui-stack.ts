/**
 * ÜYE YÖNETİMİ H1–H4 — yerel UI doğrulama yığını (production'a SIFIR temas; sentetik ZZ_H1H4UI_* verisi).
 *
 * Ephemeral embedded-postgres (FAZ 2 tabanı + 360 zinciri + Gökyüzü Atlası + TRIAL7 + H2 migration'ı) +
 * PostgREST shim (port çıktıda yazar). Yerel Next sunucusu bu adrese işaret eder:
 *   NEXT_PUBLIC_SUPABASE_URL=<shim adresi> SUPABASE_SERVICE_ROLE_KEY=zz-h1h4ui npx next dev --webpack -p 3941
 * Ardından: node scripts/uye-yonetimi-h1h4/ui-check.mjs
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

const ADMIN = "00000000-0000-4000-8000-0000000014c1";
const ADMIN_TOKEN = "zz-h1h4ui-admin-token-000001";

async function main(): Promise<void> {
  const db = await startTestDb(54496, "uye-yonetimi-h1h4-ui");
  const { su } = db;
  for (const f of [
    "20271230000000_astrology_technique_grants.sql",
    "20280101000000_trial7_self_trial.sql",
    "20280101000100_trial7_claims_retention.sql",
    "20280101000200_trial7_admin_trial_approval.sql",
    "20280101000300_admin_legacy_package_repair.sql",
  ]) {
    await su.query(readMig(f));
  }
  const tenant = async () => {
    const id = randomUUID();
    await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
    return id;
  };
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id)
     values ($1,'ZZ_H1H4UI Yönetici','zz.h1h4ui.admin@example.test','admin',true,'approved',true,'owner',$2)`,
    [ADMIN, await tenant()],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [ADMIN, ADMIN_TOKEN]);

  const mk = async (name: string, o: { pkg: string | null; plan: string; ts: string | null; te: string | null; perms: Record<string, boolean> }) => {
    const id = randomUUID();
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan,
                                subscription_status, membership_status, trial_started_at, trial_ends_at, module_permissions, tenant_id)
       values ($1,$2,$3,'expert',true,'approved','2026-09-20T17:43:00+03:00',$4,$5,$5,$5,$6::timestamptz,$7::timestamptz,$8,$9)`,
      [id, name, `zz.h1h4ui.${id.slice(0, 6)}@example.test`, o.pkg, o.plan, o.ts, o.te, JSON.stringify(o.perms), await tenant()],
    );
    return id;
  };
  const pro = await mk("ZZ_H1H4UI Pro (eski pencere)", { pkg: "premium", plan: "premium", ts: "2026-10-31T17:40:00+03:00", te: "2026-11-03T17:40:00+03:00", perms: { clients: true, numerology: true } });
  const legacy = await mk("ZZ_H1H4UI Eski Kayıt", { pkg: null, plan: "trial", ts: "2026-09-05T10:00:00+03:00", te: "2026-09-12T10:00:00+03:00", perms: {} });
  // 7 günlük deneme: mevcut onay RPC'si ile (claim hash sentetik), sonra ilk giriş + süre doldurma.
  const trial = randomUUID();
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, plan, module_permissions, tenant_id)
     values ($1,'ZZ_H1H4UI Deneme Bitti','zz.h1h4ui.trial@example.test','expert',false,'pending','trial','{}'::jsonb,$2)`,
    [trial, await tenant()],
  );
  await su.query(`select public.admin_approve_expert_trial($1,$2,'pending','trial-claim:zzh1h4uitrial',$3::jsonb)`, [ADMIN, trial,
    JSON.stringify({ clients: true, appointments: true, numerology: true, human_design: true, astrology: true })]);
  await su.query(`select public.trial_activate_on_login($1)`, [trial]);
  await su.query(`update public.users set trial_started_at = now() - interval '200 hours', trial_ends_at = now() - interval '32 hours' where id = $1`, [trial]);

  const shim = await startPgrestShim(db.pool);
  const user = { id: ADMIN, email: "zz.h1h4ui.admin@example.test", name: "ZZ_H1H4UI Yönetici", full_name: "ZZ_H1H4UI Yönetici", role: "admin", status: "active", active: true, approval_status: "approved" };
  const cfg = { adminId: ADMIN, token: ADMIN_TOKEN, user, ids: { pro, legacy, trial } };
  const cfgPath = path.join(os.tmpdir(), "uye-yonetimi-h1h4-ui.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  console.log(`UI STACK HAZIR · shim ${shim.url} · cfg ${cfgPath}`);
  setInterval(() => { /* açık kal */ }, 1 << 30);
}
main().catch((e) => {
  console.error("STACK HATASI:", e);
  process.exit(1);
});
