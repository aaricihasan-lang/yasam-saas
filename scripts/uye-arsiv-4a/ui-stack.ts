/**
 * AŞAMA 4a — yerel UI doğrulama yığını. scripts/uye-detay-v2/ui-stack.ts ile AYNI sentetik veri + 20280101000600
 * (pasif ≠ arşiv) + gerçek RPC ile oluşturulmuş durumlar: arşivde (archived), pasif (passive), eski pasif (legacyPassive).
 * Aynı yapılandırma dosyasına yazar → hem scripts/uye-detay-v2/ui-check.mjs (PR #779 regresyonu) hem
 * scripts/uye-arsiv-4a/ui-check.mjs bu yığında koşar. Production'a SIFIR temas.
 * Ephemeral embedded-postgres (FAZ 2 tabanı + 360 + TRIAL7 + H2 + owner zili + liste V2 + 4a) + PostgREST shim.
 *   NEXT_PUBLIC_SUPABASE_URL=<shim> SUPABASE_SERVICE_ROLE_KEY=zz-ud2 npx next dev --webpack -p 3971
 * Ardından: node scripts/uye-detay-v2/ui-check.mjs
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

const OWNER = "00000000-0000-4000-8000-00000000d2a1";
const ADMIN2 = "00000000-0000-4000-8000-00000000d2a2";
const EXPERT = "00000000-0000-4000-8000-00000000d2a3";
const TOK = { owner: "zz-ud2-owner-token-000001", admin2: "zz-ud2-admin2-token-00001", expert: "zz-ud2-expert-token-00001" };
const MODS = { clients: true, numerology: true, human_design: true, hd_system_reading: true, appointments: true, stones: true };
const H = 3_600_000;
const D = 86_400_000;
const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(ms));

async function main(): Promise<void> {
  const port = Number(process.env.UD2_PG_PORT ?? 54797);
  const db = await startTestDb(port, `uye-arsiv-4a-ui-${port}`);
  const { su } = db;
  for (const f of [
    "20271230000000_astrology_technique_grants.sql",
    "20280101000000_trial7_self_trial.sql",
    "20280101000100_trial7_claims_retention.sql",
    "20280101000200_trial7_admin_trial_approval.sql",
    "20280101000300_admin_legacy_package_repair.sql",
    "20280101000400_admin_owner_notifications.sql",
    "20280101000500_admin_list_members_v2.sql",
    "20280101000600_admin_member_archive_state.sql",
  ]) await su.query(readMig(f));
  const tenant = async () => {
    const id = randomUUID();
    await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
    return id;
  };
  for (const [id, name, role, sup] of [
    [OWNER, "ZZ_UD2 Owner", "admin", true], [ADMIN2, "ZZ_UD2 Yardımcı Yönetici", "admin", false], [EXPERT, "ZZ_UD2 Uzman Kendisi", "expert", false],
  ] as [string, string, string, boolean][]) {
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, package_type, plan, payment_status, next_payment_date, module_permissions, tenant_id, created_at)
       values ($1,$2,$3,$4,true,'approved',$5,$6,'premium','premium','paid',$7::date,$8,$9, now() - interval '200 days')`,
      [id, name, `zz.ud2.${id.slice(-4)}@example.test`, role, sup, sup ? "owner" : role === "admin" ? "admin" : null, day(Date.now() + 40 * D), JSON.stringify(MODS), await tenant()],
    );
  }
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2, EXPERT, TOK.expert]);

  const NOW = Date.now();
  const mk = async (name: string, email: string, o: Record<string, unknown>) => {
    const id = randomUUID();
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_demo_account, package_type, plan, trial_kind, trial_status,
                                trial_started_at, trial_ends_at, payment_status, next_payment_date, last_payment_date, paid_amount, payment_note,
                                agreed_fee, billing_period, module_permissions, tenant_id, created_at)
       values ($1,$2,$3,'expert',$4,$5,false,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,$15,$16,$17,$18,$19,$20,$21)`,
      [id, name, email, o.active ?? true, o.approval ?? "approved", o.pkg ?? null, o.plan ?? "trial", o.tk ?? null, o.ts ?? null,
        o.t0 ? new Date(o.t0 as number) : null, o.te ? new Date(o.te as number) : null, o.pay ?? null, o.npd ?? null, o.lpd ?? null,
        o.paid ?? null, o.note ?? null, o.fee ?? null, o.period ?? null, JSON.stringify(o.mods ?? MODS), await tenant(), new Date((o.created as number) ?? NOW - 30 * D)],
    );
    if (o.login) await su.query(`insert into public.user_sessions(user_id, session_token, created_at) values ($1,$2,$3)`, [id, `zz-ud2-${id}`, new Date(o.login as number)]);
    return id;
  };
  const trial = (ts: string, t0: number | null, te: number | null) => ({ tk: "self_7d", ts, t0, te, pkg: "trial" });
  const ids: Record<string, string> = {};
  ids.proPaid = await mk("ZZ_UD2 Defne Pro Ücretli", "zz.ud2.pro@example.test", {
    pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 26 * D), lpd: day(NOW - 4 * D), paid: 1500, fee: 1500, period: "monthly",
    note: "EFT-ZZ-1107", login: NOW - 2 * H,
  });
  for (const [k, ago] of [[1, 34], [2, 64]] as [number, number][]) {
    await su.query(
      `insert into public.user_payment_history(user_id, payment_status, payment_date, next_payment_date, paid_amount, payment_note, created_at)
       values ($1,'paid',$2::date,$3::date,1500,$4,$5)`,
      [ids.proPaid, day(NOW - ago * D), day(NOW - (ago - 30) * D), `EFT-ZZ-${k}`, new Date(NOW - ago * D)],
    );
  }
  ids.proExempt = await mk("ZZ_UD2 Ece Pro Muaf", "zz.ud2.muaf@example.test", {
    pkg: "premium", plan: "premium", pay: "exempt", note: "Kurucu ekip · Owner kararı (sentetik)", login: NOW - D,
  });
  ids.trialAct = await mk("ZZ_UD2 Kaan Denemede", "zz.ud2.deneme@example.test", { ...trial("active", NOW - 2 * D, NOW + 5 * D), login: NOW - 3 * H });
  ids.trialMgmt = await mk("ZZ_UD2 Deniz Deneme Yönetimi", "zz.ud2.denemeyonetim@example.test", { ...trial("active", NOW - D, NOW + 6 * D), login: NOW - 2 * H });
  await su.query(`insert into public.pro_upgrade_requests(user_id, note) values ($1,'zz sentetik talep')`, [ids.trialMgmt]);
  ids.trialEnded = await mk("ZZ_UD2 Selin Deneme Bitti", "zz.ud2.bitti@example.test", { ...trial("active", NOW - 9 * D, NOW - 2 * D), login: NOW - 3 * D });
  ids.legacy = await mk("ZZ_UD2 Eski Kayıt", "zz.ud2.eski@example.test", { pkg: null, plan: "trial", mods: {} });
  ids.pending = await mk("ZZ_UD2 Başvuru Bekleyen", "zz.ud2.basvuru@example.test", { approval: "pending", active: false, created: NOW - 2 * H });
  ids.rejected = await mk("ZZ_UD2 Reddedilen", "zz.ud2.red@example.test", { approval: "rejected", active: false });
  ids.archived = await mk("ZZ_UD2 Arşivde Pasif", "zz.ud2.arsiv@example.test", { pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 20 * D), active: false });
  ids.longName = await mk(
    "ZZ_UD2 Çağla Gülşen Doğan Uzunsoyadlıoğulları Karamehmetoğlu",
    "zz.ud2.cok.uzun.eposta.adresi.ornegi.icin.test.kaydi@uzun-alan-adi-ornegi.example.test",
    { pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 10 * D), note: "Uzun not ".repeat(30), login: NOW - 5 * H },
  );
  // AŞAMA 4a durumları — gerçek RPC'lerle (yönetim geçmişi de gerçek): arşivde · pasif · eski pasif (audit yok, archived_at NULL)
  await su.query(`update public.users set active = true where id=$1`, [ids.archived]);
  await su.query(`select public.admin_archive_user($1,$2)`, [ids.archived, OWNER]);
  ids.passive = await mk("ZZ_UD2 Pasif Hesap", "zz.ud2.pasif@example.test", { pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 15 * D), login: NOW - 6 * D });
  await su.query(`select public.admin_set_user_active($1,$2,false,true)`, [ids.passive, OWNER]);
  ids.legacyPassive = await mk("ZZ_UD2 Eski Pasif Kayıt", "zz.ud2.eskipasif@example.test", { pkg: "premium", plan: "premium", pay: "exempt", active: false });
  ids.toArchive = await mk("ZZ_UD2 Arşivlenecek Uzman", "zz.ud2.arsivlenecek@example.test", { pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 12 * D), login: NOW - 4 * H });
  ids.archivedLong = await mk(
    "ZZ_UD2 Arşivde Nurcihan Gülbahar Uzunsoyadlıoğulları Karamehmetoğlu",
    "zz.ud2.arsivde.cok.uzun.eposta.adresi.ornegi@uzun-alan-adi-ornegi.example.test",
    { pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 9 * D) },
  );
  await su.query(`select public.admin_archive_user($1,$2)`, [ids.archivedLong, OWNER]);
  await su.query(`select public.admin_notifications_reconcile()`);

  const shim = await startPgrestShim(db.pool);
  const u = (id: string, name: string, role: string) => ({ id, email: `zz.ud2.${id.slice(-4)}@example.test`, name, full_name: name, role, status: "active", active: true, approval_status: "approved", module_permissions: MODS });
  const cfg = {
    owner: { token: TOK.owner, user: { ...u(OWNER, "ZZ_UD2 Owner", "admin"), is_super_admin: true } },
    admin2: { token: TOK.admin2, user: u(ADMIN2, "ZZ_UD2 Yardımcı Yönetici", "admin") },
    expert: { token: TOK.expert, user: u(EXPERT, "ZZ_UD2 Uzman Kendisi", "expert") },
    ids,
    pg: { port },
  };
  const cfgPath = path.join(os.tmpdir(), "uye-detay-v2-ui.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  console.log(`UI STACK HAZIR · shim ${shim.url} · cfg ${cfgPath}`);
  setInterval(() => { /* açık kal */ }, 1 << 30);
}
main().catch((e) => {
  console.error("STACK HATASI:", e);
  process.exit(1);
});
