/**
 * ÜYE LİSTESİ V2 — yerel UI doğrulama yığını (production'a SIFIR temas; sentetik ZZ_L2UI_* verisi).
 * Ephemeral embedded-postgres (FAZ 2 tabanı + 360 + TRIAL7 + H2 + owner zili + liste V2) + PostgREST shim.
 *   NEXT_PUBLIC_SUPABASE_URL=<shim> SUPABASE_SERVICE_ROLE_KEY=zz-l2ui npx next dev --webpack -p 3961
 * Ardından: node scripts/uye-listesi-v2/ui-check.mjs
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

const OWNER = "00000000-0000-4000-8000-0000000019a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000019a2";
const EXPERT = "00000000-0000-4000-8000-0000000019a3";
const TOK = { owner: "zz-l2ui-owner-token-00001", admin2: "zz-l2ui-admin2-token-0001", expert: "zz-l2ui-expert-token-0001" };
const MODS = { clients: true, numerology: true, human_design: true, appointments: true, stones: true };
const H = 3_600_000;
const D = 86_400_000;
const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(ms));

async function main(): Promise<void> {
  const db = await startTestDb(54696, "uye-listesi-v2-ui");
  const { su } = db;
  for (const f of [
    "20271230000000_astrology_technique_grants.sql",
    "20280101000000_trial7_self_trial.sql",
    "20280101000100_trial7_claims_retention.sql",
    "20280101000200_trial7_admin_trial_approval.sql",
    "20280101000300_admin_legacy_package_repair.sql",
    "20280101000400_admin_owner_notifications.sql",
    "20280101000500_admin_list_members_v2.sql",
  ]) await su.query(readMig(f));
  const tenant = async () => {
    const id = randomUUID();
    await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
    return id;
  };
  for (const [id, name, role, sup] of [
    [OWNER, "ZZ_L2UI Owner", "admin", true], [ADMIN2, "ZZ_L2UI Yardımcı Yönetici", "admin", false], [EXPERT, "ZZ_L2UI Uzman Kendisi", "expert", false],
  ] as [string, string, string, boolean][]) {
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, package_type, plan, payment_status, next_payment_date, module_permissions, tenant_id, created_at)
       values ($1,$2,$3,$4,true,'approved',$5,$6,'premium','premium','paid',$7::date,$8,$9, now() - interval '200 days')`,
      [id, name, `zz.l2ui.${id.slice(-4)}@example.test`, role, sup, sup ? "owner" : role === "admin" ? "admin" : null, day(Date.now() + 40 * D), JSON.stringify(MODS), await tenant()],
    );
  }
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2, EXPERT, TOK.expert]);

  const NOW = Date.now();
  const names = ["Şule Çınar", "İsmail Öztürk", "Ayşe Yılmaz", "Gülşen Ünal", "Ömer Işık", "Çağla Doğan Uzunsoyadlıoğulları", "Ilgaz Şahin", "Ümran Güneş"];
  let i = 0;
  const mk = async (kind: string, o: Record<string, unknown>) => {
    const id = randomUUID();
    const name = `${names[i % names.length]} ${kind}`;
    i++;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_demo_account, package_type, plan, trial_kind, trial_status,
                                trial_started_at, trial_ends_at, payment_status, next_payment_date, module_permissions, tenant_id, created_at)
       values ($1,$2,$3,'expert',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15,$16,$17)`,
      [id, name, `zz.l2ui.${i}.${id.slice(0, 5)}@example.test`, o.active ?? true, o.approval ?? "approved", o.demo ?? false, o.pkg ?? null, o.plan ?? "trial",
        o.tk ?? null, o.ts ?? null, o.t0 ? new Date(o.t0 as number) : null, o.te ? new Date(o.te as number) : null, o.pay ?? null, o.npd ?? null,
        JSON.stringify(o.mods ?? MODS), await tenant(), new Date((o.created as number) ?? NOW - 30 * D)],
    );
    if (o.login) await su.query(`insert into public.user_sessions(user_id, session_token, created_at) values ($1,$2,$3)`, [id, `zz-l2ui-${id}`, new Date(o.login as number)]);
    if (o.proReq) await su.query(`insert into public.pro_upgrade_requests(user_id, note) values ($1,'zz')`, [id]);
    return id;
  };
  const trial = (ts: string, t0: number | null, te: number | null) => ({ tk: "self_7d", ts, t0, te, pkg: "trial" });
  const pro = (pay: string, npd: string | null) => ({ pkg: "premium", plan: "premium", pay, npd });
  const ids: Record<string, string> = {};
  for (let k = 0; k < 3; k++) ids[`pending${k}`] = await mk("Başvuru", { approval: "pending", active: false, created: NOW - (k + 1) * H });
  ids.trialAct = await mk("Denemede", { ...trial("active", NOW - 2 * D, NOW + 5 * D), login: NOW - 3 * H, proReq: true });
  for (let k = 0; k < 4; k++) await mk("Denemede", { ...trial("active", NOW - 3 * D, NOW + 4 * D), login: NOW - 5 * H });
  ids.trialSoon = await mk("Bitmek Üzere", { ...trial("active", NOW - 6 * D, NOW + 20 * H), login: NOW - 1 * H });
  for (let k = 0; k < 2; k++) ids[`ns${k}`] = await mk("Başlamadı", { ...trial("not_started", null, null) });
  ids.exp = await mk("Deneme Bitti", { ...trial("active", NOW - 9 * D, NOW - 2 * D), login: NOW - 3 * D, proReq: true });
  ids.review = await mk("İncelemede", { ...trial("review", NOW - D, NOW + 6 * D) });
  ids.susp = await mk("Deneme Durdu", { ...trial("suspended", NOW - D, NOW + 6 * D) });
  for (let k = 0; k < 6; k++) await mk("Pro", { ...pro("paid", day(NOW + (20 + k) * D)), login: NOW - k * D });
  ids.proPast = await mk("Pro Tarihi Geçti", { ...pro("pending", day(NOW - 3 * D)) });
  ids.proOver = await mk("Pro Gecikti", { ...pro("overdue", day(NOW - 10 * D)) });
  ids.proNext = await mk("Pro 7 Gün", { ...pro("paid", day(NOW + 4 * D)) });
  ids.proExempt = await mk("Pro Muaf", { ...pro("exempt", null) });
  ids.legacy = await mk("Eski Kayıt", { pkg: null, plan: "trial", mods: {} });
  ids.archived = await mk("Arşivde", { ...pro("paid", day(NOW + 20 * D)), active: false });
  ids.rejected = await mk("Reddedilen", { approval: "rejected", active: false });
  ids.demo = await mk("Demo", { demo: true, ...trial("active", NOW - D, NOW + 6 * D) });
  ids.today = await mk("Bugün Kayıt", { approval: "pending", active: false, created: NOW - 20 * 60_000 });
  for (let k = 0; k < 22; k++) await mk("Pro Ek", { ...pro("paid", day(NOW + 30 * D)), created: NOW - (40 + k) * D });
  await su.query(`select public.admin_notifications_reconcile()`);

  const shim = await startPgrestShim(db.pool);
  const u = (id: string, name: string, role: string) => ({ id, email: `zz.l2ui.${id.slice(-4)}@example.test`, name, full_name: name, role, status: "active", active: true, approval_status: "approved", module_permissions: MODS });
  const cfg = {
    owner: { token: TOK.owner, user: { ...u(OWNER, "ZZ_L2UI Owner", "admin"), is_super_admin: true } },
    admin2: { token: TOK.admin2, user: u(ADMIN2, "ZZ_L2UI Yardımcı Yönetici", "admin") },
    expert: { token: TOK.expert, user: u(EXPERT, "ZZ_L2UI Uzman Kendisi", "expert") },
    ids,
  };
  const cfgPath = path.join(os.tmpdir(), "uye-listesi-v2-ui.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  console.log(`UI STACK HAZIR · shim ${shim.url} · cfg ${cfgPath}`);
  setInterval(() => { /* açık kal */ }, 1 << 30);
}
main().catch((e) => {
  console.error("STACK HATASI:", e);
  process.exit(1);
});
