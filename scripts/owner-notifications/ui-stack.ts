/**
 * OWNER BİLDİRİM ZİLİ — yerel UI doğrulama yığını (production'a SIFIR temas; sentetik ZZ_ONUI_* verisi).
 *
 * Ephemeral embedded-postgres (FAZ 2 tabanı + 360 zinciri + TRIAL7 + H2 + owner bildirim migration'ı) +
 * PostgREST shim + yalnız localhost'a açık küçük bir kontrol ucu (DB geçici hatası benzetimi / yeni olay ekleme).
 *   NEXT_PUBLIC_SUPABASE_URL=<shim adresi> SUPABASE_SERVICE_ROLE_KEY=zz-onui npx next dev --webpack -p 3951
 * Ardından: node scripts/owner-notifications/ui-check.mjs
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

const OWNER = "00000000-0000-4000-8000-0000000017a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000017a2";
const EXPERT = "00000000-0000-4000-8000-0000000017a3";
const TOK = { owner: "zz-onui-owner-token-000001", admin2: "zz-onui-admin2-token-00001", expert: "zz-onui-expert-token-00001" };
const ALL_MODS = {
  clients: true, danisan_yonetimi: true, appointments: true, ajanda: true, numerology: true, numeroloji: true,
  human_design: true, astrology: true, stones: true, dogaltas: true, reflexology: true, refleksoloji: true,
};

async function main(): Promise<void> {
  const db = await startTestDb(54596, "owner-notifications-ui");
  const { su } = db;
  for (const f of [
    "20271230000000_astrology_technique_grants.sql",
    "20280101000000_trial7_self_trial.sql",
    "20280101000100_trial7_claims_retention.sql",
    "20280101000200_trial7_admin_trial_approval.sql",
    "20280101000300_admin_legacy_package_repair.sql",
  ]) await su.query(readMig(f));
  const tenant = async () => {
    const id = randomUUID();
    await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
    return id;
  };
  for (const [id, name, role, sup, lvl] of [
    [OWNER, "ZZ_ONUI Owner", "admin", true, "owner"],
    [ADMIN2, "ZZ_ONUI Yardımcı Yönetici", "admin", false, "admin"],
    [EXPERT, "ZZ_ONUI Uzman", "expert", false, null],
  ] as [string, string, string, boolean, string | null][]) {
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, package_type, plan, module_permissions, tenant_id)
       values ($1,$2,$3,$4,true,'approved',$5,$6,'premium','premium',$7,$8)`,
      [id, name, `zz.onui.${id.slice(-4)}@example.test`, role, sup, lvl, JSON.stringify(ALL_MODS), await tenant()],
    );
  }
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6)`,
    [OWNER, TOK.owner, ADMIN2, TOK.admin2, EXPERT, TOK.expert]);

  const mk = async (name: string, approval: string, active: boolean, pkg: string | null, plan: string) => {
    const id = randomUUID();
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, package_type, plan, module_permissions, tenant_id)
       values ($1,$2,$3,'expert',$4,$5,$6,$7,'{}'::jsonb,$8)`,
      [id, name, `zz.onui.${id.slice(0, 8)}@example.test`, active, approval, pkg, plan, await tenant()],
    );
    return id;
  };
  // Migration ÖNCESİ açık durum: eski kayıt (canlıdaki karşılığı) → ilk uzlaştırmada karar olarak görünmeli.
  const legacy = await mk("ZZ_ONUI Eski Kayıt Üyesi", "approved", true, null, "trial");
  await su.query(readMig("20280101000400_admin_owner_notifications.sql"));
  // Migration SONRASI olaylar
  const pending = await mk("ZZ_ONUI Yeni Başvuru Sahibi Uzun Bir Ad Soyad Örneği", "pending", false, null, "trial");
  const trialIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await mk(`ZZ_ONUI Deneme ${i + 1}`, "pending", false, null, "trial");
    await su.query(`select public.admin_approve_expert_trial($1,$2,'pending',$3,$4::jsonb)`,
      [OWNER, id, `trial-claim:zzonui${i}${id.replace(/-/g, "").slice(0, 10)}`, JSON.stringify({ clients: true, numerology: true })]);
    await su.query(`select public.trial_activate_on_login($1)`, [id]);
    trialIds.push(id);
  }
  await su.query(`select public.trial_pro_request_create($1, 'ödeme yaptım')`, [trialIds[0]]);
  await su.query(`select public.admin_notifications_reconcile()`);

  const shim = await startPgrestShim(db.pool);

  // Kontrol ucu (yalnız 127.0.0.1): /break → feed RPC'si geçici olarak yok; /fix → geri; /add-trial → yeni deneme başlangıcı.
  let n = 10;
  const ctl = http.createServer(async (req, res) => {
    try {
      if (req.url === "/break") await su.query(`alter function public.admin_notification_feed(uuid, integer) rename to admin_notification_feed_zz`);
      else if (req.url === "/fix") await su.query(`alter function public.admin_notification_feed_zz(uuid, integer) rename to admin_notification_feed`);
      else if (req.url === "/add-trial") {
        const id = await mk(`ZZ_ONUI Sonradan Deneme ${n++}`, "pending", false, null, "trial");
        await su.query(`select public.admin_approve_expert_trial($1,$2,'pending',$3,'{"clients":true}'::jsonb)`, [OWNER, id, `trial-claim:zzonuiadd${id.replace(/-/g, "").slice(0, 10)}`]);
        await su.query(`select public.trial_activate_on_login($1)`, [id]);
      } else if (req.url === "/counts") {
        const r = (await su.query(`select count(*) filter (where kind='action' and resolved_at is null)::int a, count(*) filter (where kind='info')::int i from public.admin_notifications`)).rows[0];
        res.end(JSON.stringify(r));
        return;
      } else { res.statusCode = 404; res.end("{}"); return; }
      res.end('{"ok":true}');
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e).slice(0, 200) }));
    }
  });
  await new Promise<void>((r) => ctl.listen(0, "127.0.0.1", () => r()));
  const ctlPort = (ctl.address() as { port: number }).port;

  const u = (id: string, name: string, role: string) => ({ id, email: `zz.onui.${id.slice(-4)}@example.test`, name, full_name: name, role, status: "active", active: true, approval_status: "approved", module_permissions: ALL_MODS });
  const cfg = {
    ctl: `http://127.0.0.1:${ctlPort}`,
    owner: { token: TOK.owner, user: { ...u(OWNER, "ZZ_ONUI Owner", "admin"), is_super_admin: true } },
    admin2: { token: TOK.admin2, user: u(ADMIN2, "ZZ_ONUI Yardımcı Yönetici", "admin") },
    expert: { token: TOK.expert, user: u(EXPERT, "ZZ_ONUI Uzman", "expert") },
    ids: { legacy, pending, trials: trialIds },
  };
  const cfgPath = path.join(os.tmpdir(), "owner-notifications-ui.json");
  writeFileSync(cfgPath, JSON.stringify(cfg));
  console.log(`UI STACK HAZIR · shim ${shim.url} · cfg ${cfgPath}`);
  setInterval(() => { /* açık kal */ }, 1 << 30);
}
main().catch((e) => {
  console.error("STACK HATASI:", e);
  process.exit(1);
});
