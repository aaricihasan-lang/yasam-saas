/**
 * ÜYE YÖNETİMİ 360° — yerel UI duman testi yığını (production'a SIFIR temas).
 *
 * Ephemeral embedded-postgres (FAZ 2 tabanı + 360 zinciri) + PostgREST shim (sabit port 54397) +
 * sentetik veri (ZZ_M360UI_*). Yerel build bu adrese işaret eder:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54397 SUPABASE_SERVICE_ROLE_KEY=zz-smoke npx next build
 *   npx next start -p 3927
 * Ardından: node scripts/uye-yonetimi-360/ui-smoke.mjs
 *
 * Danışan tablosuna SENTINEL özel içerik yazılır — admin ekranlarında/ağda ASLA görünmemeli.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { startPgrestShim } from "../usage360/pgrestShim";
import { startTestDb360 } from "./testDb360";

const SHIM_PORT = 54397;
const ADMIN = "00000000-0000-4000-8000-0000000ce1a1";
const ADMIN_TOKEN = "zz-m360ui-admin-token-000001";

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const db = await startTestDb360(54396, "uye-yonetimi-360-ui");
  const { su } = db;
  const TODAY = istanbulToday();
  const tenant = async () => {
    const id = randomUUID();
    await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
    return id;
  };
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, approved_at)
     values ($1,'ZZ_M360UI Yönetici','zz.m360ui.admin@example.test','admin',true,'approved',true,'owner',$2, now())`,
    [ADMIN, await tenant()],
  );
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [ADMIN, ADMIN_TOKEN]);
  // usage360 detay ucu clients'ı OKUMAZ; burası sızıntı tuzağıdır.
  await su.query(`insert into public.clients(tenant_id, full_name) values ($1,'SENTINEL_CLIENT_PII_M360_DO_NOT_LEAK')`, [await tenant()]);

  const names = ["Alperen Işık", "ALPEREN İLHAN", "Ayşe Çelik", "Mehmet Öztürk", "Şule Güneş", "İbrahim Işık", "Gülşen Yıldız",
    "Ömer Şahin", "Çağla Doğan", "Ülkü Aydın", "Çok Uzun Soyadlı Bir Uzman Adı Örneği Yazılımcıoğulları"];
  const anchor = { id: randomUUID(), tenant: await tenant() };
  const created: { id: string; name: string }[] = [];
  for (let i = 0; i < 64; i++) {
    const id = i === 0 ? anchor.id : randomUUID();
    const t = i === 0 ? anchor.tenant : await tenant();
    const approval = i % 13 === 5 ? "pending" : i % 17 === 3 ? "rejected" : "approved";
    const active = approval === "approved" && i % 11 !== 7;
    const npdOffset = [-12, -1, 0, 5, 7, 8, 25, 31, 45, 61, 95, null][i % 12];
    const perms = { clients: true, reflexology: i % 2 === 0, stones: i % 3 === 0, numerology: i % 4 === 0, beslenme: i % 5 === 0 };
    const name = `ZZ_M360UI ${names[i % names.length]} ${i + 1}`;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, tenant_id, module_permissions, payment_status,
                                next_payment_date, agreed_fee, billing_period, created_at, approved_at, package_type, plan)
       values ($1,$2,$3,'expert',$4,$5,$6,$7,$8,$9::date,$10,'monthly', now() - interval '200 days', now() - interval '190 days','premium','premium')`,
      [id, name, `zz.m360ui.${i + 1}@example.test`, active, approval, t, JSON.stringify(perms), i % 9 === 4 ? "exempt" : "pending",
        npdOffset === null ? null : addDays(TODAY, npdOffset), i % 2 === 0 ? 600 : null],
    );
    created.push({ id, name });
    // Aktivite profili (gerçek etkileşim rollup'ı): 0=bugün … bazıları hiç
    const lastAgo = [0, 1, 3, 6, 10, 20, 35, 65, 95, null][i % 10];
    if (i === 0) {
      await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,visits,active_seconds,first_at,last_at)
        values ($1,$2,$3::date - 120,'desktop_web',1,60, now() - interval '120 days', now() - interval '120 days')`, [id, t, TODAY]);
    }
    if (lastAgo !== null) {
      for (let g = lastAgo; g < lastAgo + 25; g += 1 + (i % 3)) {
        const ch = g % 3 === 0 ? "android_app" : g % 3 === 1 ? "desktop_web" : "mobile_web";
        await su.query(`insert into public.usage_daily(user_id,tenant_id,day_tr,channel,visits,active_seconds,module_opens,creates,first_at,last_at)
          values ($1,$2,$3::date - $4::int,$5,2,900,3,1, ($3::date - $4::int + time '09:00') at time zone 'Europe/Istanbul', ($3::date - $4::int + time '11:30') at time zone 'Europe/Istanbul')
          on conflict do nothing`, [id, t, TODAY, g, ch]);
        await su.query(`insert into public.usage_daily_modules(user_id,tenant_id,day_tr,module_key,channel,active_seconds,module_opens,creates,first_at,last_at)
          values ($1,$2,$3::date - $4::int,$6,$5,600,1,1, ($3::date - $4::int + time '09:00') at time zone 'Europe/Istanbul', ($3::date - $4::int + time '11:00') at time zone 'Europe/Istanbul')
          on conflict do nothing`, [id, t, TODAY, g, ch, g % 2 === 0 ? "clients" : "reflexology"]);
      }
    }
    if (i % 8 === 2) await su.query(`insert into public.security_events(user_id, event_type, severity) values ($1,'login_locked','high')`, [id]);
    if (i % 10 === 3) {
      await su.query(`insert into public.admin_audit_log(actor_admin_id, actor_is_main_admin, target_user_id, action, context)
                      values ($1,true,$2,'module_enabled', jsonb_build_object('modules', jsonb_build_array('reflexology'), 'count', 1)),
                             ($1,true,$2,'payment_status_changed', jsonb_build_object('fields', jsonb_build_array('next_payment_date','paid_amount')))`, [ADMIN, id]);
    }
  }
  await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, tenant_id, is_demo_account, created_at, approved_at)
                  values ($1,'ZZ_M360UI Demo Vitrin','zz.m360ui.demo@example.test','expert',true,'approved',$2,true, now() - interval '100 days', now() - interval '100 days')`,
    [randomUUID(), await tenant()]);
  // Fiyat dönemi örneği (ilk uzman): ilk 5 ay 200, sonra 600 → RPC ile (audit dahil)
  const first = created[0];
  await su.query(`select public.admin_pricing_phase_save($1,$2,null,$3::date,$4::date,200,'monthly','İlk 5 ay','Tanışma fiyatı')`,
    [ADMIN, first.id, addDays(TODAY, -60), addDays(TODAY, 90)]);
  await su.query(`select public.admin_pricing_phase_save($1,$2,null,$3::date,null,600,'monthly',null,null)`, [ADMIN, first.id, addDays(TODAY, 91)]);
  await su.query(`insert into public.user_payment_history(user_id, payment_status, payment_date, next_payment_date, paid_amount, agreed_fee, billing_period, actor_admin_id)
                  values ($1,'paid',$2::date,$3::date,200,200,'monthly',$4)`, [first.id, addDays(TODAY, -30), addDays(TODAY, 0), ADMIN]);

  const shim = await startPgrestShim(db.pool, SHIM_PORT);
  const user = { id: ADMIN, email: "zz.m360ui.admin@example.test", name: "ZZ_M360UI Yönetici", full_name: "ZZ_M360UI Yönetici", role: "admin", status: "active", active: true, approval_status: "approved" };
  const cfg = { adminId: ADMIN, token: ADMIN_TOKEN, user, firstExpertId: first.id, firstExpertName: first.name };
  writeFileSync(path.join(os.tmpdir(), "uye-yonetimi-360-ui.json"), JSON.stringify(cfg));
  console.log(`UI STACK HAZIR · shim ${shim.url} · cfg ${path.join(os.tmpdir(), "uye-yonetimi-360-ui.json")}`);
  setInterval(() => { /* açık kal */ }, 1 << 30);
}
main().catch((e) => { console.error("STACK HATASI:", e); process.exit(1); });
