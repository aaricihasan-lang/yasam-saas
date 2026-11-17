/**
 * DENEME ÜYELERİ · HESAP DURUMU — yerel UI doğrulama yığını (production'a SIFIR temas; sentetik ZZ_DHD_* verisi).
 * Ephemeral embedded-postgres (FAZ 2 tabanı + TRIAL7 + 4a + 4b zinciri) + PostgREST shim.
 *   npx tsx scripts/deneme-hesap-durumu/ui-stack.ts        → "UI STACK HAZIR · shim <url>"
 *   NEXT_PUBLIC_SUPABASE_URL=<shim> SUPABASE_SERVICE_ROLE_KEY=zz-dhd npx next dev --webpack -p 3972
 * Ardından: node scripts/deneme-hesap-durumu/ui-check.mjs
 */
import { randomUUID } from "node:crypto";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { freePort, installStackShutdown } from "../uye-yonetimi-faz2/testDbRun";
import { writeStackConfig } from "../uye-yonetimi-faz2/uiKosu.mjs";
import { readMig } from "../uye-yonetimi-360/migrationChain";

const OWNER = "00000000-0000-4000-8000-00000000d4e1";
const TOK = "zz-dhd-ui-owner-token-0001";
const MODS = { clients: true, numerology: true, human_design: true, appointments: true, stones: true };
const H = 3_600_000;
const D = 86_400_000;

async function main(): Promise<void> {
  const port = Number(process.env.DHD_PG_PORT ?? (await freePort())); // boş port (paralel koşular çakışmaz)
  const db = await startTestDb(port, `deneme-hesap-durumu-ui-${port}`);
  const { su } = db;
  for (const f of [
    "20271009100000_admin_purge_archived_expert.sql",
    "20271230000000_astrology_technique_grants.sql",
    "20280101000000_trial7_self_trial.sql",
    "20280101000100_trial7_claims_retention.sql",
    "20280101000200_trial7_admin_trial_approval.sql",
    "20280101000300_admin_legacy_package_repair.sql",
    "20280101000400_admin_owner_notifications.sql",
    "20280101000500_admin_list_members_v2.sql",
    "20280101000600_admin_member_archive_state.sql",
    "20280101000710_admin_trial_convert_passive_guard_4b.sql",
  ]) await su.query(readMig(f));
  const tenant = async () => {
    const id = randomUUID();
    await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
    return id;
  };
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, package_type, plan, module_permissions, tenant_id, created_at)
     values ($1,'ZZ_DHD Owner','zz.dhd.owner@example.test','admin',true,'approved',true,'owner','premium','premium',$2,$3, now() - interval '200 days')`,
    [OWNER, JSON.stringify(MODS), await tenant()],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [OWNER, TOK]);

  const NOW = Date.now();
  let order = 0;
  const mk = async (name: string, key: string, o: { active?: boolean; archived?: boolean; ts: string; t0: number | null; te: number | null }) => {
    const id = randomUUID();
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, trial_kind, trial_status,
          trial_started_at, trial_ends_at, archived_at, module_permissions, tenant_id, created_at)
       values ($1,$2,$3,'expert',$4,'approved', now() - interval '10 days','trial','trial','self_7d',$5,$6,$7,$8,$9,$10,$11)`,
      [id, name, `zz.dhd.${key}@example.test`, o.active !== false, o.ts, o.t0 === null ? null : new Date(o.t0), o.te === null ? null : new Date(o.te),
        o.archived ? new Date(NOW - D) : null, JSON.stringify(MODS), await tenant(), new Date(NOW - 12 * D + order++ * H)],
    );
    return id;
  };
  const run = (t0: number, te: number) => ({ ts: "active", t0, te });
  const ids = {
    activeRun: await mk("ZZ_DHD Ada Aktif Denemede", "aktif-devam", run(NOW - 2 * D, NOW + 5 * D)),
    passiveRun: await mk("ZZ_DHD Bora Pasif Denemede", "pasif-devam", { active: false, ...run(NOW - 2 * D, NOW + 5 * D) }),
    archivedRun: await mk("ZZ_DHD Cem Arşivde Denemede", "arsiv-devam", { active: false, archived: true, ...run(NOW - 3 * D, NOW + 4 * D) }),
    notStarted: await mk("ZZ_DHD Derya Başlamamış", "baslamamis", { ts: "not_started", t0: null, te: null }),
    expired: await mk("ZZ_DHD Ece Süresi Bitmiş", "bitmis", run(NOW - 9 * D, NOW - 2 * D)),
    suspended: await mk("ZZ_DHD Fikret Durdurulmuş", "durdurulmus", { ts: "suspended", t0: NOW - 3 * D, te: NOW + 4 * D }),
    passiveExpired: await mk("ZZ_DHD Gül Pasif Süresi Bitmiş", "pasif-bitmis", { active: false, ...run(NOW - 10 * D, NOW - 3 * D) }),
  };

  // Arşivdeki hesapta açık Pro talebi: "Talebi kapat" (sunucuda serbest, hak açmaz) korunmalı.
  await su.query(`insert into public.pro_upgrade_requests(user_id, note) values ($1,'zz sentetik talep')`, [ids.archivedRun]);

  const shim = await startPgrestShim(db.pool);
  const cfg = {
    owner: { token: TOK, user: { id: OWNER, email: "zz.dhd.owner@example.test", name: "ZZ_DHD Owner", full_name: "ZZ_DHD Owner", role: "admin", status: "active", active: true, approval_status: "approved", is_super_admin: true, module_permissions: MODS } },
    ids,
    shim: shim.url,
    pg: { port },
  };
  // Koşuya özgü yapılandırma (kendi koşu dizininde; sabit ortak dosyaya yazılmaz) — uiKosu.mjs.
  const cfgPath = writeStackConfig({ runDir: db.runDir, shimUrl: shim.url, cfg, envPath: process.env.DHD_CFG });
  console.log(`UI STACK HAZIR · shim ${shim.url} · cfg ${cfgPath}`);
  installStackShutdown([() => shim.close(), () => db.stop()]);
  setInterval(() => { /* açık kal */ }, 1 << 30);
}
main().catch((e) => {
  console.error("STACK HATASI:", e);
  process.exit(1);
});
