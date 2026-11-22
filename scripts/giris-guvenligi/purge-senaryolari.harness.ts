/**
 * Kalıcı uzman silme — genişletilmiş senaryolar (GERÇEK PostgreSQL, sentetik veri, production'a SIFIR temas).
 *
 * Silme fonksiyonuna DOKUNULMAZ (gövdesi production ile md5 birebir doğrulanır). Kanıtlanan:
 *   S1) Aktif (arşivlenmemiş) uzman silinemez.
 *   S2) Owner dışı yönetici silemez; e-posta onayı uyuşmazsa silinmez.
 *   S3) HD eğitim kaydı olan uzman (ON DELETE RESTRICT FK'ler): silme REDDEDİLİR ve HİÇBİR satır değişmez (tam geri alma).
 *   S4) Aynı uzman HD eğitim kaydı yokken silinebilir; başka uzmanın tenant'ı / danışanları / HD kayıtları aynen kalır.
 *   S5) Paylaşımlı tenant'taki uzman silinemez.
 *   S6) F2-K (C3): uzmanın kendisi veya cihazı için AÇIK yasal saklama varken silme REDDEDİLİR (UP011), HİÇBİR satır
 *       değişmez, saklama kaydı otomatik kaldırılmaz; Owner kaldırınca silme yapılabilir, saklama geçmişi kalır.
 *       PURGE_WITHOUT_F2K=1 → F2-K migration'ı uygulanmaz (düzeltmesiz ölçüm; S6 FAIL beklenir).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/purge-senaryolari.harness.ts
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
const PURGE_MD5 = "e7219176868c97b179b433881ee4778f";
const HD_EDU = [
  "20260606120000_human_design.sql",
  "20260606140000_human_design_clients.sql",
  "20260702120000_human_design_charts_computed.sql",
  "20271110000000_hd_education_catalog_access.sql",
  "20271112000000_hd_education_compute_publish.sql",
  "20271113000000_hd_education_chart_provider_body.sql",
  "20271206000000_hd_education_private_archive.sql",
  "20271206000100_hd_education_annotations.sql",
  "20271206000200_hd_education_biographies.sql",
  "20271220000000_hd_education_owner_controls.sql",
];
const F2_CHAIN = [
  "20271003200000_session_model_v2.sql",
  "20271003200100_admin_audit_session_actions.sql",
  "20280103000000_auth_session_hardening_f2a.sql",
  "20280103000100_auth_mfa_core_f2b.sql",
  "20280103000200_auth_session_insert_lock_f2b.sql",
  "20280103000300_auth_trusted_devices_qr_f2c.sql",
  "20280103000400_auth_email_otp_f2d.sql",
  "20280103000500_auth_account_recovery_f2e.sql",
  "20280103000600_auth_purge_audit_retention_f2f.sql",
  "20280103000700_auth_owner_step_up_f2g.sql",
  "20280103000800_auth_audit_retention_disposal_f2h.sql",
  "20280103000900_auth_security_hardening_f2i.sql",
  "20280103001000_auth_session_device_binding_f2j.sql",
  ...(process.env.PURGE_WITHOUT_F2K === "1" ? [] : ["20280103001100_auth_critical_privilege_device_f2k.sql"]),
];

async function main(): Promise<void> {
  const db = await startTestDb(Number(process.env.PURGE_SENARYO_PG_PORT ?? 54437), `purge-senaryo-db-${process.env.PURGE_SENARYO_PG_PORT ?? 54437}`); // sabit port başka süreçte doluysa
  const { su } = db;
  try {
    await su.query(`CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`);
    await su.query(`CREATE TABLE IF NOT EXISTS public.security_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      event_type text NOT NULL, severity text NOT NULL, message text, ip_address text, country text, city text,
      user_agent text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now(), reviewed_by_admin boolean NOT NULL DEFAULT false)`);
    await su.query(readMig("20271009100000_admin_purge_archived_expert.sql"));
    for (const f of PROD_ARCHIVE_CHAIN) await su.query(readMig(f));
    const h = (await su.query(`select md5(replace(prosrc, chr(13), '')) h from pg_proc where proname = 'admin_purge_archived_expert'`)).rows[0]?.h;
    ok(h === PURGE_MD5, "silme fonksiyonu gövdesi production ile BİREBİR (md5)");
    const hdErr: string[] = [];
    for (const f of HD_EDU) {
      try { await su.query(readMig(f)); } catch (e) { await su.query("ROLLBACK").catch(() => {}); hdErr.push(`${f}: ${(e as Error).message.slice(0, 200)}`); }
    }
    ok(hdErr.length === 0, "HD eğitim migration'ları uygulandı", hdErr);
    for (const f of F2_CHAIN) await su.query(readMig(f));
    const restrictFks = (await su.query(`select c.conrelid::regclass::text t, a.attname c from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.confrelid = 'public.users'::regclass and c.confdeltype in ('r','a') order by 1,2`)).rows as { t: string; c: string }[];
    console.log(`  bilgi: users'a RESTRICT/NO ACTION FK: ${restrictFks.map((r) => `${r.t}.${r.c}`).join(", ")}`);
    ok(restrictFks.some((r) => r.t === "hd_edu_private_items" && r.c === "trainer_user_id"), "HD eğitmen RESTRICT FK test DB'de production'daki gibi var");

    const mkUser = async (role: "admin" | "expert", o: { superAdmin?: boolean; tenant?: string } = {}) => {
      const id = randomUUID();
      const tenant = o.tenant ?? randomUUID();
      if (!o.tenant) await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [tenant, `zz-${tenant.slice(0, 13)}`]);
      const email = `zz.purge.${id.slice(0, 8)}@example.test`;
      // F2-K (N2): yönetici satırı yalnız yetkili yoldan (GUC kapısı) eklenebilir — test kurulumu aynı kapıyı kullanır.
      await su.query(`select set_config('yasam.admin_grant','on',false), set_config('yasam.super_admin_grant','on',false)`);
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id)
                      values ($1,$2,$3,$4,true,'approved',$5,$6)`, [id, `ZZ ${role}`, email, role, o.superAdmin ?? false, tenant]);
      await su.query(`select set_config('yasam.admin_grant','off',false), set_config('yasam.super_admin_grant','off',false)`);
      return { id, tenant, email };
    };
    const cnt = async (sql: string, a: unknown[] = []) => Number((await su.query(sql, a)).rows[0].n);
    const purge = async (target: { id: string; email: string }, actor: string, email = target.email) => {
      try {
        return { r: (await su.query(`select public.admin_purge_archived_expert($1,$2,$3) as r`, [target.id, actor, email])).rows[0].r, code: "", msg: "" };
      } catch (e) {
        const er = e as { code?: string; message: string };
        return { r: null, code: String(er.code ?? ""), msg: er.message };
      }
    };
    const snapshot = async () => JSON.stringify((await su.query(`select
      (select count(*) from public.users) u, (select count(*) from public.tenants) t, (select count(*) from public.user_sessions) s,
      (select count(*) from public.hd_edu_private_items) hi, (select count(*) from public.admin_audit_log) al`)).rows[0]);

    const owner = await mkUser("admin", { superAdmin: true });
    const admin2 = await mkUser("admin");
    const trainer = await mkUser("expert");
    const other = await mkUser("expert");

    // S1 — aktif uzman.
    const s1 = await purge(trainer, owner.id);
    ok(s1.code === "UP006" || /arşiv/i.test(s1.msg), "S1 aktif uzman silinemez", s1);
    await su.query(`select public.admin_archive_user($1, $2)`, [trainer.id, owner.id]);
    // S2 — yetki ve e-posta onayı.
    const s2a = await purge(trainer, admin2.id);
    ok(s2a.code === "UP003", "S2 Owner olmayan yönetici silemez", s2a);
    const s2b = await purge(trainer, owner.id, "baska@example.test");
    ok(s2b.code === "UP008", "S2 e-posta onayı uyuşmazsa silinmez", s2b);

    // S3 — HD eğitim kaydı (RESTRICT): eğitmen özel arşiv öğesi.
    const cols = (await su.query(`select column_name, is_nullable, column_default, data_type from information_schema.columns
      where table_schema='public' and table_name='hd_edu_private_items' order by ordinal_position`)).rows as { column_name: string; is_nullable: string; column_default: string | null; data_type: string }[];
    const required = cols.filter((c) => c.is_nullable === "NO" && c.column_default === null).map((c) => c.column_name);
    console.log(`  bilgi: hd_edu_private_items zorunlu sütunlar: ${required.join(", ")}`);
    let seeded = false;
    try {
      await su.query(`alter table public.hd_edu_private_items disable trigger user`);
      // Kurgusal eğitim kaydı (gerçek kişi / danışan bağı yok) — kısıt hd_edu_priv_items_kind_chk'e uygun.
      await su.query(`insert into public.hd_edu_private_items(tenant_id, trainer_user_id, item_kind, title, alias_label, display_mode,
          fic_input, fic_chart, fic_input_hash, fic_declared_at, fic_declaration)
        values ($1, $2, 'kurgusal', 'ZZ sentetik', 'ZZ', 'alias', '{"d":1}'::jsonb, '{"c":1}'::jsonb, repeat('a',64), now(), 'hd-egitim-kurgusal-beyan-v1')`,
        [trainer.tenant, trainer.id]);
      seeded = true;
    } catch (e) {
      console.log(`  bilgi: doğrudan ekleme hatası: ${(e as Error).message.slice(0, 200)}`);
    } finally {
      await su.query(`alter table public.hd_edu_private_items enable trigger user`);
    }
    ok(seeded, "S3 sentetik HD eğitmen özel arşiv öğesi oluşturuldu");
    // HD eğitmen profili: Owner'ın verdiği eğitim erişimi + "erişim verildi" denetim olayı (hedef = eğitmen).
    await su.query(`insert into public.hd_education_access_grants(user_id, granted_tenant_id, granted_by) values ($1,$2,$3)`, [trainer.id, trainer.tenant, owner.id]);
    await su.query(`insert into public.hd_education_audit_events(actor_kind, actor_user_id, action, target_user_id) values ('owner',$1,'access_granted',$2)`, [owner.id, trainer.id]);

    // S3b — ANORMAL: eğitmen kendi tenant'ı DIŞINDA bir RESTRICT kayıtta (içe aktarma aktörü) → silme REDDEDİLİR, HİÇBİR şey değişmez.
    const imp = (await su.query(`insert into public.hd_education_audit_events(actor_kind, actor_user_id, action) values ('import',$1,'source_added') returning id`, [trainer.id])).rows[0].id;
    const before = await snapshot();
    const s3b = await purge(trainer, owner.id);
    console.log(`  bilgi: S3b sonuç kodu=${s3b.code} mesaj=${s3b.msg.slice(0, 200)}`);
    ok(s3b.r === null && s3b.code === "UP021", "S3b tenant dışı RESTRICT referansı: silme REDDEDİLDİ (UP021)", s3b);
    ok(await snapshot() === before, "S3b HİÇBİR satır değişmedi (tam geri alma; eğitim kaydı, erişim, oturum dahil)");
    ok(await cnt(`select count(*) n from public.users where id = $1 and archived_at is not null`, [trainer.id]) === 1, "S3b uzman arşivde kalır");

    // S3 — GERÇEKÇİ eğitmen (anormal referans yok): silinir; eğitim kaydı + erişim silinir; Owner denetim olayı KALIR, hedef NULL.
    await su.query(`alter table public.hd_education_audit_events disable trigger user`);
    await su.query(`delete from public.hd_education_audit_events where id = $1`, [imp]);
    await su.query(`alter table public.hd_education_audit_events enable trigger user`);
    const auditBefore = await cnt(`select count(*) n from public.hd_education_audit_events`);
    const otherBefore = await cnt(`select count(*) n from public.users where tenant_id = $1`, [other.tenant]);
    const s3 = await purge(trainer, owner.id);
    ok(s3.code === "" && s3.r?.ok !== false, "S3 HD eğitmen (erişim + denetim olayı + özel kayıt) kalıcı silindi", s3);
    ok(await cnt(`select count(*) n from public.users where id = $1`, [trainer.id]) === 0, "S3 kullanıcı satırı silindi");
    ok(await cnt(`select count(*) n from public.hd_edu_private_items where trainer_user_id = $1`, [trainer.id]) === 0, "S3 eğitmenin özel eğitim kaydı silindi");
    ok(await cnt(`select count(*) n from public.hd_education_access_grants where user_id = $1`, [trainer.id]) === 0, "S3 eğitim erişimi silindi");
    ok(await cnt(`select count(*) n from public.hd_education_audit_events`) === auditBefore, "S3 HD denetim olayları KORUNDU");
    ok(await cnt(`select count(*) n from public.hd_education_audit_events where action = 'access_granted' and target_user_id is null`) === 1, "S3 denetim olayında kişi bağı NULL");
    ok(await cnt(`select count(*) n from public.users where tenant_id = $1`, [other.tenant]) === otherBefore, "S3 başka uzmanın tenant'ı aynen");

    // S5 — paylaşımlı tenant.
    const shared = await mkUser("expert");
    await mkUser("expert", { tenant: shared.tenant });
    await su.query(`select public.admin_archive_user($1, $2)`, [shared.id, owner.id]);
    const s5 = await purge(shared, owner.id);
    ok(s5.code === "UP009" || s5.code === "UP010", "S5 paylaşımlı tenant'taki uzman silinemez", s5);
    ok(await cnt(`select count(*) n from public.users where id = $1`, [shared.id]) === 1, "S5 hiçbir şey silinmedi");

    // S6 — F2-K (C3): yasal saklama (legal hold).
    const snap6 = async () => JSON.stringify((await su.query(`select
      (select count(*) from public.users) u, (select count(*) from public.tenants) t, (select count(*) from public.user_sessions) s,
      (select count(*) from public.auth_trusted_devices) d, (select count(*) from public.security_events) e,
      (select count(*) from public.auth_retention_holds) h, (select count(*) from public.admin_purge_context) c`)).rows[0]);
    const held = await mkUser("expert");
    await su.query(`select set_config('yasam.session_create','on',false)`);
    await su.query(`insert into public.user_sessions(user_id, session_token, expires_at) values ($1, $2, now() + interval '1 hour')`, [held.id, `zz-${randomUUID()}`]).catch(() => {});
    await su.query(`select set_config('yasam.session_create','off',false)`);
    await su.query(`insert into public.security_events(user_id, event_type, severity, message) values ($1, 'zz_test', 'low', 'ZZ')`, [held.id]);
    await su.query(`select public.admin_archive_user($1, $2)`, [held.id, owner.id]);
    const holdId = (await su.query(`insert into public.auth_retention_holds(hold_type, subject_id, reason, created_by)
      values ('subject_user', $1, 'ZZ sentetik yasal saklama talebi', $2) returning id`, [held.id, owner.id])).rows[0].id;
    const b6 = await snap6();
    const s6 = await purge(held, owner.id);
    ok(s6.r === null && s6.code === "UP011", "S6 yasal saklamadaki uzman silinemez (UP011)", s6);
    ok(await snap6() === b6, "S6 HİÇBİR satır değişmedi (kullanıcı, tenant, oturum, cihaz, güvenlik olayı, saklama kaydı)");
    ok(await cnt(`select count(*) n from public.auth_retention_holds where id = $1 and released_at is null`, [holdId]) === 1, "S6 saklama kaydı otomatik kaldırılmadı");
    // Cihaz bazlı saklama da kapsar.
    const devHeld = await mkUser("expert");
    const devId = (await su.query(`insert into public.auth_trusted_devices(user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      values ($1::uuid, repeat('Z', 120), encode(sha256(convert_to($2::text, 'UTF8')), 'hex'), 'ZZZZ-ZZZZ', 'active', now()) returning id`, [devHeld.id, devHeld.id])).rows[0].id;
    await su.query(`select public.admin_archive_user($1, $2)`, [devHeld.id, owner.id]);
    await su.query(`insert into public.auth_retention_holds(hold_type, subject_id, reason, created_by) values ('device', $1, 'ZZ sentetik cihaz saklama talebi', $2)`, [devId, owner.id]);
    const bd = await snap6();
    const s6d = await purge(devHeld, owner.id);
    ok(s6d.r === null && s6d.code === "UP011" && await snap6() === bd, "S6 cihazında yasal saklama olan uzman silinemez; hiçbir şey değişmez", s6d);
    // Owner saklamayı kaldırır → silme yapılabilir; saklama GEÇMİŞİ kalır.
    await su.query(`update public.auth_retention_holds set released_at = now(), released_by = $2 where id = $1`, [holdId, owner.id]);
    const s6r = await purge(held, owner.id);
    ok(s6r.code === "" && await cnt(`select count(*) n from public.users where id = $1`, [held.id]) === 0, "S6 saklama kaldırılınca silme yapılır", s6r);
    ok(await cnt(`select count(*) n from public.auth_retention_holds where id = $1`, [holdId]) === 1, "S6 saklama geçmişi (kaldırılmış kayıt) korunur");
  } finally {
    await db.stop();
  }
  console.log(`\npurge-senaryolari harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
