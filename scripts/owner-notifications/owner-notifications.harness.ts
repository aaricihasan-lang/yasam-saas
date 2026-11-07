/**
 * OWNER BİLDİRİM ZİLİ (Admin Üye Yönetimi V2 · Aşama 1) — DB + ROUTE harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri + gerçek RPC'ler + gerçek Next route handler'ları
 * (test-only PostgREST shim). Production'a / ağa SIFIR temas; tüm hesaplar sentetik (ZZ_ON_*).
 *
 *   M  migration: 2× uygulama, mevcut satırlar değişmez, geçmiş bilgi TOPLU OLUŞTURULMAZ, açık kararlar eksiksiz
 *   Y  yetki: tablolara doğrudan erişim yok; fonksiyonlar yalnız service_role; owner dışı admin AN401; route 401/403
 *   K  5 / 20 / 50 eşzamanlı başvuru → her biri tek “basvuru” kararı
 *   D  50 ayrı deneme başlangıcı → 50 ayrı “deneme_basladi”; aynı olay 12 paralel → tek kayıt
 *   U  tetikleyici + uzlaştırma çakışması (12 paralel reconcile + sync) → tekrar yok
 *   C  karar sonuçlanması (onay, ret, Pro'ya geçiş, talep kapatma, inceleme, eski kayıt, ödeme) + karar veren
 *   O  okundu ≠ çözüldü
 *   H  bildirim hatası kaydı / girişi ENGELLEMEZ; uzlaştırma sonradan tamamlar; çözüm hatası kararı bozmaz
 *   F  yalnız ödeme tarihi geçmesi finansal uyarı ÜRETMEZ; yalnız açık “Gecikti” işareti karar olur
 *   G  5.000 bildirimde arama + sayfalama
 *   R  route: şekil, filtreler, geçersiz parametre, DB hatası → 5xx (sıfır sayaç dönmez), uzman → admin veri yok
 *
 * Çalıştır: npx tsx scripts/owner-notifications/owner-notifications.harness.ts
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";
import { DEFAULT_MODULE_PERMISSIONS } from "../../lib/auth/modulePermissions";

process.env.RATE_LIMIT_SECRET = "zz-on-rate-limit-secret";
delete process.env.TRIAL_SELF_SIGNUP_ENABLED;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

const OWNER = "00000000-0000-4000-8000-0000000016a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000016a2";
const TOK = { owner: "zz-on-owner-token-0001", admin2: "zz-on-admin2-token-0001" };
const MIG = "20280101000400_admin_owner_notifications.sql";

async function main(): Promise<void> {
  const port = 57000 + Math.floor(Math.random() * 2000);
  const db = await startTestDb(port, `owner-notifications-${port}`);
  const { su } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  const conns: pg.Client[] = [];
  const conn = async () => {
    const c = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "testpw", database: "postgres" });
    await c.connect();
    conns.push(c);
    return c;
  };
  try {
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
    for (const [id, sup] of [[OWNER, true], [ADMIN2, false]] as [string, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id)
         values ($1,$2,$3,'admin',true,'approved',$4,$5,$6)`,
        [id, sup ? "ZZ_ON_OWNER" : "ZZ_ON_ADMIN2", `zz.on.${sup ? "owner" : "admin2"}@example.test`, sup, sup ? "owner" : "admin", await tenant()],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2]);

    type Seed = { name: string; approval: string; active: boolean; pkg: string | null; plan: string; tk?: string | null; ts?: string | null; ts0?: string | null; te?: string | null; pay?: string | null; npd?: string | null; demo?: boolean };
    const mk = async (s: Seed) => {
      const id = randomUUID();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, package_type, plan, trial_kind, trial_status,
                                  trial_started_at, trial_ends_at, payment_status, next_payment_date, is_demo_account, module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13::date,$14,'{"clients":true}'::jsonb,$15, now() - interval '3 days')`,
        [id, s.name, `zz.on.${id.slice(0, 8)}@example.test`, s.active, s.approval, s.pkg, s.plan, s.tk ?? null, s.ts ?? null, s.ts0 ?? null, s.te ?? null,
          s.pay ?? null, s.npd ?? null, s.demo ?? false, await tenant()],
      );
      return id;
    };
    // ── Migration ÖNCESİ mevcut durumlar (canlıdaki açık kararların karşılığı) ──
    const PRE_PENDING = await mk({ name: "ZZ_ON Önceden Bekleyen", approval: "pending", active: false, pkg: null, plan: "trial" });
    const PRE_LEGACY = await mk({ name: "ZZ_ON Önceden Eski Kayıt", approval: "approved", active: true, pkg: null, plan: "trial" });
    const PRE_REVIEW = await mk({ name: "ZZ_ON Önceden İnceleme", approval: "approved", active: true, pkg: "trial", plan: "trial", tk: "self_7d", ts: "review" });
    const PRE_TRIAL_OLD = await mk({ name: "ZZ_ON Eski Deneme (önceden başlamış)", approval: "approved", active: true, pkg: "trial", plan: "trial", tk: "self_7d", ts: "active",
      ts0: new Date(Date.now() - 2 * 86400e3).toISOString(), te: new Date(Date.now() + 5 * 86400e3).toISOString() });
    const PRE_TRIAL_PROREQ = await mk({ name: "ZZ_ON Pro Talepli", approval: "approved", active: true, pkg: "trial", plan: "trial", tk: "self_7d", ts: "active",
      ts0: new Date(Date.now() - 3 * 86400e3).toISOString(), te: new Date(Date.now() + 4 * 86400e3).toISOString() });
    await su.query(`select public.trial_pro_request_create($1, 'ödeme yaptım')`, [PRE_TRIAL_PROREQ]);
    const PRE_OVERDUE = await mk({ name: "ZZ_ON Gecikti İşaretli", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "overdue", npd: "2026-10-01" });
    const PRE_DATE_ONLY = await mk({ name: "ZZ_ON Yalnız Tarihi Geçmiş", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "pending", npd: "2026-10-01" });
    const PRE_PREMIUM = await mk({ name: "ZZ_ON Premium", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", npd: "2027-01-01" });
    const PRE_DEMO = await mk({ name: "ZZ_ON Demo", approval: "approved", active: true, pkg: "trial", plan: "trial", demo: true });

    console.log("[M] Migration");
    const snapSql = `select md5(string_agg(u::text, E'\\n' order by u.id)) h, count(*) n from public.users u`;
    const before = (await su.query(snapSql)).rows[0];
    await su.query(readMig(MIG));
    await su.query(readMig(MIG));
    const after = (await su.query(snapSql)).rows[0];
    ok(before.h === after.h && before.n === after.n, "M1 migration 2× uygulandı; hiçbir kullanıcı satırı değişmedi");
    ok((await su.query(`select count(*)::int n from public.admin_notifications`)).rows[0].n === 0, "M2 migration kendisi bildirim üretmez (toplu oluşturma yok)");
    await su.query(`select public.admin_notifications_reconcile()`);
    const openTypes = (await su.query(`select type, target_user_id from public.admin_notifications where kind='action' and resolved_at is null`)).rows as { type: string; target_user_id: string }[];
    const has = (t: string, u: string) => openTypes.some((r) => r.type === t && r.target_user_id === u);
    ok(has("basvuru", PRE_PENDING) && has("eski_kayit", PRE_LEGACY) && has("inceleme", PRE_REVIEW) && has("pro_talebi", PRE_TRIAL_PROREQ) && has("odeme", PRE_OVERDUE),
      "M3 ilk uzlaştırma: önceden açık 5 karar türü eksiksiz görünür", openTypes);
    ok(!openTypes.some((r) => ([PRE_DATE_ONLY, PRE_PREMIUM, PRE_DEMO] as string[]).includes(r.target_user_id)), "M4 Premium / demo / yalnız tarihi geçmiş ödeme → karar YOK");
    ok((await su.query(`select count(*)::int n from public.admin_notifications where kind='info'`)).rows[0].n === 0,
      "M5 migration öncesi başlamış denemeler için “deneme başladı” bilgisi geriye dönük OLUŞTURULMADI");
    ok(openTypes.length === 5, `M6 açık karar sayısı tam 5 (${openTypes.length})`);
    void PRE_TRIAL_OLD;

    console.log("\n[Y] Yetki");
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ["admin_notifications", "admin_notification_reads", "admin_notification_settings"]) {
        const r = (await su.query(`select has_table_privilege($1, $2, 'SELECT') s, has_table_privilege($1, $2, 'INSERT') i`, [role, `public.${t}`])).rows[0];
        if (r.s || r.i) ok(false, `Y ${role} ${t} erişimi`, r);
      }
    }
    ok(true, "Y1 anon / authenticated / service_role üç tabloyu doğrudan okuyamaz/yazamaz");
    const fx = (await su.query(`select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') au,
        has_function_privilege('service_role', p.oid, 'EXECUTE') s, p.prosecdef d, array_to_string(p.proconfig, ',') cfg
      from pg_proc p where p.proname in ('admin_notification_feed','admin_notification_mark_read','admin_notification_history','admin_notifications_reconcile',
        'admin_notifications_sync_user','admin_notif_users_trg','admin_notif_pro_requests_trg','admin_notif_assert_owner')`)).rows as Record<string, unknown>[];
    ok(fx.length === 8 && fx.every((f) => f.a === false && f.au === false && f.d === true && String(f.cfg).includes("search_path")),
      "Y2 8 fonksiyon: SECURITY DEFINER + sabit search_path; anon/authenticated çalıştıramaz", fx);
    ok(fx.filter((f) => ["admin_notifications_sync_user", "admin_notif_users_trg", "admin_notif_pro_requests_trg"].includes(String(f.proname))).every((f) => f.s === false),
      "Y3 iç fonksiyonları (sync / tetikleyici) service_role bile doğrudan çalıştıramaz");
    const rej = async (sql: string, args: unknown[]) => {
      try { await su.query(sql, args); return "ok"; } catch (e) { return String((e as { code?: string }).code); }
    };
    ok((await rej(`select public.admin_notification_feed($1, 30)`, [ADMIN2])) === "AN401" &&
       (await rej(`select public.admin_notification_history($1,null,null,null,null,null,25,0)`, [ADMIN2])) === "AN401" &&
       (await rej(`select public.admin_notification_mark_read($1, null, true)`, [ADMIN2])) === "AN401" &&
       (await rej(`select public.admin_notification_feed($1, 30)`, [PRE_PREMIUM])) === "AN401",
      "Y4 owner dışı admin ve uzman kimliği → AN401 (feed / history / mark_read)");

    console.log("\n[K] 5 / 20 / 50 eşzamanlı başvuru");
    const pool = await Promise.all(Array.from({ length: 50 }, () => conn()));
    for (const n of [5, 20, 50]) {
      const emails = Array.from({ length: n }, (_, i) => `zz.on.k${n}.${i}.${randomUUID().slice(0, 6)}@example.test`);
      const res = await Promise.all(emails.map((email, i) => pool[i].query(`select public.provision_expert($1) r`, [{
        mode: "public", email, password_hash: "zz-test-hash:x", full_name: `ZZ_ON K${n} ${i}`, tenant_name: "ZZ", tenant_slug_base: `zz-on-k${n}-${i}`, module_permissions: DEFAULT_MODULE_PERMISSIONS,
      }]).then((r) => r.rows[0].r).catch((e) => ({ err: String(e) }))));
      const ids = (await su.query(`select id from public.users where email = any($1)`, [emails])).rows.map((r: { id: string }) => r.id);
      const notifs = (await su.query(`select target_user_id, count(*)::int c from public.admin_notifications where type='basvuru' and target_user_id = any($1) group by 1`, [ids])).rows as { c: number }[];
      ok(res.every((r: Record<string, unknown>) => r.ok === true) && ids.length === n && notifs.length === n && notifs.every((r) => r.c === 1),
        `K${n} ${n} eşzamanlı başvuru → ${notifs.length} ayrı karar, mükerrer 0`, { ids: ids.length, notifs: notifs.length });
      ok((await su.query(`select count(*)::int n from public.admin_notifications where kind='info' and target_user_id = any($1)`, [ids])).rows[0].n === 0,
        `K${n} başvuru “denemeye başladı” olarak GÖSTERİLMEDİ (bilgi 0)`);
    }

    console.log("\n[D] 50 ayrı deneme başlangıcı + aynı olay 12 paralel");
    const pend = (await su.query(`select id, email from public.users where full_name like 'ZZ_ON K50 %' order by full_name`)).rows as { id: string; email: string }[];
    const TRIAL_MODS = { clients: true, numerology: true, human_design: true };
    for (const p of pend) {
      await su.query(`select public.admin_approve_expert_trial($1,$2,'pending',$3,$4)`, [OWNER, p.id, `trial-claim:zzon${p.id.replace(/-/g, "").slice(0, 16)}`, TRIAL_MODS]);
    }
    const approvedRes = (await su.query(`select resolution, resolved_by, count(*)::int c from public.admin_notifications where type='basvuru' and target_user_id = any($1) group by 1,2`, [pend.map((p) => p.id)])).rows;
    ok(approvedRes.length === 1 && approvedRes[0].resolution === "deneme_onaylandi" && approvedRes[0].resolved_by === OWNER && approvedRes[0].c === 50,
      "D1 50 deneme onayı → 50 başvuru kararı “deneme_onaylandi”, karar veren owner", approvedRes);
    ok((await su.query(`select count(*)::int n from public.admin_notifications where type='deneme_basladi' and target_user_id = any($1)`, [pend.map((p) => p.id)])).rows[0].n === 0,
      "D2 onay ≠ deneme başlangıcı (ilk giriş olmadan bilgi yok)");
    await Promise.all(pend.map((p, i) => pool[i].query(`select public.trial_activate_on_login($1)`, [p.id])));
    const started = (await su.query(`select target_user_id, count(*)::int c from public.admin_notifications where type='deneme_basladi' and target_user_id = any($1) group by 1`, [pend.map((p) => p.id)])).rows as { c: number }[];
    ok(started.length === 50 && started.every((r) => r.c === 1), `D3 50 paralel ilk giriş → 50 AYRI “deneme başladı” (${started.length})`);
    const one = pend[0].id;
    await Promise.all(pool.slice(0, 12).map((c) => c.query(`select public.trial_activate_on_login($1)`, [one])));
    ok((await su.query(`select count(*)::int n from public.admin_notifications where type='deneme_basladi' and target_user_id=$1`, [one])).rows[0].n === 1,
      "D4 aynı deneme başlangıcı 12 paralel tetiklendi → tek bildirim");

    console.log("\n[U] Tetikleyici + uzlaştırma çakışması");
    const evBefore = (await su.query(`select count(*)::int n from public.admin_notifications`)).rows[0].n;
    await Promise.all(pool.slice(0, 12).map((c, i) => c.query(i % 2 ? `select public.admin_notifications_reconcile()` : `select public.admin_notifications_sync_user($1,'reconcile')`, i % 2 ? [] : [PRE_PENDING])));
    ok((await su.query(`select count(*)::int n from public.admin_notifications`)).rows[0].n === evBefore, "U1 12 paralel reconcile + sync → yeni kayıt yok (tekrar 0)");
    const dupOpen = (await su.query(`select type, target_user_id, count(*)::int c from public.admin_notifications where kind='action' and resolved_at is null group by 1,2 having count(*) > 1`)).rows;
    ok(dupOpen.length === 0, "U2 aynı tür + üye için birden fazla açık karar YOK");

    console.log("\n[C] Kararın sonuçlanması");
    const openOf = async (type: string, uid: string) => (await su.query(`select * from public.admin_notifications where type=$1 and target_user_id=$2 order by id desc limit 1`, [type, uid])).rows[0];
    // Pro talebi → Pro'ya geçiş
    await su.query(`select public.admin_trial_convert_to_pro($1,$2,$3,'{}'::text[])`, [OWNER, PRE_TRIAL_PROREQ, { clients: true }]);
    let n = await openOf("pro_talebi", PRE_TRIAL_PROREQ);
    ok(n.resolved_at && n.resolution === "pro_gecirildi" && n.resolved_by === OWNER, "C1 Pro talebi → Pro'ya geçiş: “pro_gecirildi”, karar veren owner", n);
    // Talep kapatma
    const T2 = pend[1].id;
    await su.query(`select public.trial_pro_request_create($1, null)`, [T2]);
    ok(!!(await openOf("pro_talebi", T2)) && !(await openOf("pro_talebi", T2)).resolved_at, "C2 yeni Pro talebi anında karar olarak açıldı");
    await su.query(`select public.admin_pro_request_close($1,$2)`, [OWNER, T2]);
    n = await openOf("pro_talebi", T2);
    ok(n.resolution === "talep_kapatildi", "C3 talep kapatma → “talep_kapatildi”");
    // İnceleme
    await su.query(`select public.admin_trial_set_state($1,$2,'clear_review',null)`, [OWNER, PRE_REVIEW]);
    ok((await openOf("inceleme", PRE_REVIEW)).resolution === "inceleme_kaldirildi", "C4 inceleme kaldırıldı → karar kapandı");
    // Eski kayıt (H2 onarımı)
    await su.query(`select public.admin_repair_legacy_expert_to_pro($1,$2,$3,'{}'::text[],'trial',null)`, [OWNER, PRE_LEGACY, { clients: true }]);
    ok((await openOf("eski_kayit", PRE_LEGACY)).resolution === "pro_gecirildi", "C5 eski kayıt onarımı → “pro_gecirildi”");
    // Ödeme durumu güncellendi
    await su.query(`update public.users set payment_status='paid', next_payment_date='2027-01-01' where id=$1`, [PRE_OVERDUE]);
    ok((await openOf("odeme", PRE_OVERDUE)).resolution === "odeme_durumu_guncellendi", "C6 ödeme kaydı güncellendi → karar kapandı");
    // Ret
    const newPend = await mk({ name: "ZZ_ON Ret Adayı", approval: "pending", active: false, pkg: null, plan: "trial" });
    ok(!!(await openOf("basvuru", newPend)) && !(await openOf("basvuru", newPend)).resolved_at, "C7 yeni başvuru anında karar");
    // Ret, mevcut route'ta doğrudan approval_status güncellemesidir (ayrı RPC yok).
    await su.query(`update public.users set approval_status='rejected' where id=$1`, [newPend]);
    ok((await openOf("basvuru", newPend)).resolution === "reddedildi", "C8 ret → “reddedildi”");

    console.log("\n[O] Okundu ≠ çözüldü");
    const openIds = (await su.query(`select id from public.admin_notifications where kind='action' and resolved_at is null`)).rows.map((r: { id: string }) => Number(r.id));
    const marked = (await su.query(`select public.admin_notification_mark_read($1,$2,false) n`, [OWNER, openIds])).rows[0].n;
    ok(marked === 0 && (await su.query(`select count(*)::int n from public.admin_notifications where kind='action' and resolved_at is null`)).rows[0].n === openIds.length,
      "O1 karar bildirimleri “okundu” ile işaretlenmez ve KAPANMAZ");
    const allInfo = (await su.query(`select public.admin_notification_mark_read($1,null,true) n`, [OWNER])).rows[0].n;
    const feed = (await su.query(`select public.admin_notification_feed($1, 30) f`, [OWNER])).rows[0].f;
    ok(allInfo >= 50 && feed.counts.unread_info === 0 && feed.counts.action === openIds.length, "O2 “tümünü okundu” yalnız bilgileri okur; karar sayısı aynı");

    console.log("\n[H] Hata dayanıklılığı");
    await su.query(`alter table public.admin_notifications add constraint zz_boom check (false) not valid`);
    const hp = await mk({ name: "ZZ_ON Hata Sırasında Başvuru", approval: "pending", active: false, pkg: null, plan: "trial" });
    ok(!!(await su.query(`select 1 from public.users where id=$1`, [hp])).rows[0] && !(await openOf("basvuru", hp)), "H1 bildirim yazılamasa da kayıt TAMAMLANDI (bildirim yok)");
    await su.query(`alter table public.admin_notifications drop constraint zz_boom`);
    await su.query(`select public.admin_notifications_reconcile()`);
    ok(!!(await openOf("basvuru", hp)) && !(await openOf("basvuru", hp)).resolved_at, "H2 uzlaştırma kaçan başvuruyu sonradan tamamladı");
    await su.query(`alter table public.admin_notifications add constraint zz_boom2 check (resolved_at is null) not valid`);
    await su.query(`select public.admin_approve_expert_trial($1,$2,'pending',$3,$4)`, [OWNER, hp, `trial-claim:zzonhata${hp.replace(/-/g, "").slice(0, 12)}`, TRIAL_MODS]);
    ok((await su.query(`select approval_status from public.users where id=$1`, [hp])).rows[0].approval_status === "approved" && !(await openOf("basvuru", hp)).resolved_at,
      "H3 karar kaydı yazılamasa da onay işlemi TAMAMLANDI (bildirim açık kaldı)");
    await su.query(`alter table public.admin_notifications drop constraint zz_boom2`);
    await su.query(`select public.admin_notifications_reconcile()`);
    ok((await openOf("basvuru", hp)).resolution === "deneme_onaylandi", "H4 uzlaştırma, yarım kalan kararı sonradan doğru sonuçla kapattı");
    // Karar işlemi başarısız → bildirim açık kalır
    const hp2 = await mk({ name: "ZZ_ON Bayat Onay", approval: "pending", active: false, pkg: null, plan: "trial" });
    await su.query(`select public.admin_approve_expert_trial($1,$2,'rejected',$3,$4)`, [OWNER, hp2, "trial-claim:zzonbayat0000", TRIAL_MODS]).catch(() => null);
    ok(!(await openOf("basvuru", hp2)).resolved_at, "H5 başarısız (bayat ekran) onay → karar AÇIK kalır");
    // Kullanıcı silindi (kalıcı silme benzetimi)
    const gone = await mk({ name: "ZZ_ON Silinecek", approval: "pending", active: false, pkg: null, plan: "trial" });
    await su.query(`delete from public.users where id=$1`, [gone]);
    await su.query(`update public.admin_notification_settings set last_reconciled_at = null`);
    await su.query(`select public.admin_notification_feed($1, 30)`, [OWNER]);
    const goneRow = (await su.query(`select * from public.admin_notifications where event_key like $1`, [`basvuru:${gone}:%`])).rows[0];
    ok(goneRow && goneRow.target_user_id === null && goneRow.resolution === "kayit_silindi", "H6 kalıcı silinen üye: kimlik bağlantısı boşaldı, karar “kayit_silindi”");

    console.log("\n[F] Finansal uyarı doğruluğu");
    ok(!(await openOf("odeme", PRE_DATE_ONLY)), "F1 yalnız ödeme tarihinin geçmesi karar ÜRETMEDİ (borç sayılmaz)");
    await su.query(`update public.users set payment_status='overdue' where id=$1`, [PRE_DATE_ONLY]);
    ok(!!(await openOf("odeme", PRE_DATE_ONLY)) && !(await openOf("odeme", PRE_DATE_ONLY)).resolved_at, "F2 yönetici “Gecikti” işaretleyince karar açıldı");

    console.log("\n[E] Deneme bitti bilgisi");
    const tEnd = pend[3].id;
    // Deneme migration'dan SONRA başlamış ve şimdi bitmiş (bitiş anı info_since sonrası).
    await su.query(`update public.users set trial_ends_at = now() - interval '1 millisecond', trial_started_at = now() - interval '7 days 1 millisecond' where id=$1`, [tEnd]);
    await su.query(`select public.admin_notifications_reconcile()`);
    await su.query(`select public.admin_notifications_reconcile()`);
    ok((await su.query(`select count(*)::int n from public.admin_notifications where type='deneme_bitti' and target_user_id=$1`, [tEnd])).rows[0].n === 1,
      "E1 süresi dolan deneme → tek “deneme bitti” bilgisi (2× uzlaştırma)",
      (await su.query(`select u.trial_kind, u.trial_status, u.package_type, u.trial_ends_at, s.info_since,
         (select array_agg(event_key) from public.admin_notifications where target_user_id=u.id) keys
         from public.users u, public.admin_notification_settings s where u.id=$1`, [tEnd])).rows[0]);
    await su.query(`update public.users set trial_started_at = now() - interval '30 days', trial_ends_at = now() - interval '23 days' where id=$1`, [PRE_TRIAL_OLD]);
    await su.query(`select public.admin_notifications_reconcile()`);
    ok((await su.query(`select count(*)::int n from public.admin_notifications where type='deneme_bitti' and target_user_id=$1`, [PRE_TRIAL_OLD])).rows[0].n === 0,
      "E2 migration ÖNCESİ bitmiş deneme için geriye dönük bilgi yok");
    // Zamanlanmış görev YOK: yalnız zamanın geçmesiyle oluşan olay (hiçbir satır yazılmadan) owner'ın bir sonraki
    // zil okumasında uzlaştırılır; uzlaştırma en fazla 20 sn'de bir çalışır (okuma başına değil).
    const tTime = pend[5].id;
    await su.query(`update public.users set trial_started_at = now() - interval '7 days', trial_ends_at = now() + interval '2 seconds' where id=$1`, [tTime]);
    await su.query(`update public.admin_notification_settings set last_reconciled_at = now()`);
    await new Promise((r) => setTimeout(r, 2500));
    const bitti = async () => (await su.query(`select count(*)::int n from public.admin_notifications where type='deneme_bitti' and target_user_id=$1`, [tTime])).rows[0].n as number;
    ok((await bitti()) === 0, "E3 süre doldu ama kimse yazmadı → henüz bildirim yok (tetikleyici yalnız yazmada çalışır)");
    const lastBefore = (await su.query(`select last_reconciled_at from public.admin_notification_settings`)).rows[0].last_reconciled_at;
    await su.query(`select public.admin_notification_feed($1, 30)`, [OWNER]);
    const lastAfter = (await su.query(`select last_reconciled_at from public.admin_notification_settings`)).rows[0].last_reconciled_at;
    ok((await bitti()) === 0 && +lastBefore === +lastAfter, "E4 son uzlaştırmadan <20 sn → okuma uzlaştırma ÇALIŞTIRMAZ (yük sınırı)");
    await su.query(`update public.admin_notification_settings set last_reconciled_at = now() - interval '21 seconds'`);
    await su.query(`select public.admin_notification_feed($1, 30)`, [OWNER]);
    ok((await bitti()) === 1, "E5 >20 sn sonra owner zili okununca kaçan “deneme bitti” bilgisi oluştu (kayıp yok)");
    await su.query(`update public.admin_notification_settings set last_reconciled_at = now() - interval '21 seconds'`);
    await su.query(`select public.admin_notification_feed($1, 30)`, [OWNER]);
    ok((await bitti()) === 1, "E6 tekrar uzlaştırma aynı olayı ikinci kez üretmez");

    console.log("\n[G] 5.000 bildirim");
    const someUser = pend[4].id;
    await su.query(`insert into public.admin_notifications(event_key, kind, type, target_user_id, occurred_at)
      select 'deneme_basladi:zzbulk:' || g, 'info', 'deneme_basladi', $1, now() - (g || ' minutes')::interval from generate_series(1, 5000) g`, [someUser]);
    const t0 = Date.now();
    const someName = (await su.query(`select full_name from public.users where id=$1`, [someUser])).rows[0].full_name as string;
    const hist = (await su.query(`select public.admin_notification_history($1,$2,'deneme_basladi','all',null,null,25,25) h`, [OWNER, someName])).rows[0].h;
    const ms = Date.now() - t0;
    ok(hist.total >= 5000 && hist.rows.length === 25 && hist.rows.every((r: { full_name: string }) => r.full_name.startsWith(someName)), `G1 5.000+ bildirimde arama + 2. sayfa: ${hist.total} sonuç, ${ms} ms`);
    ok(ms < 1500, `G2 süre kabul edilebilir (${ms} ms)`);
    const t1 = Date.now();
    const f2 = (await su.query(`select public.admin_notification_feed($1, 30) f`, [OWNER])).rows[0].f;
    ok(f2.infos.length === 30 && Date.now() - t1 < 1500, `G3 zil son 30 bilgiyi döner (${Date.now() - t1} ms)`);

    // ── ROUTE ───────────────────────────────────────────────────────────────────
    console.log("\n[R] Route'lar (gerçek handler)");
    shim = await startPgrestShim(db.pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const feedRoute = await import("../../app/api/admin/notifications/route");
    const readRoute = await import("../../app/api/admin/notifications/read/route");
    const histRoute = await import("../../app/api/admin/notifications/history/route");
    const userRoute = await import("../../app/api/admin/users/[id]/route");
    const registerRoute = await import("../../app/api/register/route");
    type H = (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
    const call = async (h: unknown, method: string, url: string, auth: { adminId?: string; token?: string }, body?: unknown, id = "", extra: Record<string, string> = {}) => {
      const headers: Record<string, string> = { ...extra };
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const res = await (h as H)(new NextRequest(`http://localhost${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }), { params: Promise.resolve({ id }) });
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* boş */ }
      return { status: res.status, json };
    };
    const asOwner = { adminId: OWNER, token: TOK.owner };
    const g = await call(feedRoute.GET, "GET", "/api/admin/notifications", asOwner);
    const dbCounts = (await su.query(`select count(*) filter (where kind='action' and resolved_at is null)::int a from public.admin_notifications`)).rows[0];
    ok(g.status === 200 && Array.isArray(g.json.actions) && (g.json.counts as { action: number }).action === dbCounts.a, `R1 owner feed 200; karar sayısı DB ile aynı (${dbCounts.a})`);
    const expTok = `zz-on-expert-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [PRE_PREMIUM, expTok]);
    let negOk = 0, negAll = 0;
    for (const auth of [{}, { adminId: OWNER }, { adminId: OWNER, token: "zz-bogus" }, { adminId: PRE_PREMIUM, token: expTok }, { adminId: OWNER, token: expTok }, { adminId: ADMIN2, token: TOK.admin2 }]) {
      for (const [h, m, u, b] of [[feedRoute.GET, "GET", "/api/admin/notifications", undefined], [histRoute.GET, "GET", "/api/admin/notifications/history", undefined], [readRoute.POST, "POST", "/api/admin/notifications/read", { allInfo: true }]] as [unknown, string, string, unknown][]) {
        negAll++;
        const r = await call(h, m, u, auth, b);
        if (r.status === 401 || r.status === 403) negOk++;
      }
    }
    ok(negOk === negAll, `R2 kimliksiz / tokensız / sahte / uzman token'ı / owner taklidi / normal admin × 3 uç → 401/403 (${negOk}/${negAll})`);
    const actId = (await su.query(`select id from public.admin_notifications where kind='action' and resolved_at is null limit 1`)).rows[0].id;
    const rr = await call(readRoute.POST, "POST", "/api/admin/notifications/read", asOwner, { ids: [Number(actId)] });
    ok(rr.status === 200 && rr.json.marked === 0 && !(await su.query(`select resolved_at from public.admin_notifications where id=$1`, [actId])).rows[0].resolved_at,
      "R3 okundu ucu karar bildirimini kapatamaz");
    ok((await call(readRoute.POST, "POST", "/api/admin/notifications/read", asOwner, { ids: [] })).status === 400 &&
       (await call(readRoute.POST, "POST", "/api/admin/notifications/read", asOwner, { ids: [-1] })).status === 400 &&
       (await call(readRoute.POST, "POST", "/api/admin/notifications/read", asOwner, { ids: [1], extra: 1 })).status === 400, "R4 geçersiz okundu gövdesi → 400");
    const hq = await call(histRoute.GET, "GET", "/api/admin/notifications/history?status=resolved&type=basvuru&page=1", asOwner);
    ok(hq.status === 200 && (hq.json.rows as { kind: string; resolved_at: string }[]).every((r) => r.kind === "action" && r.resolved_at) && Number(hq.json.total) >= 50,
      `R5 geçmiş: çözülen başvurular (${hq.json.total})`);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
    const hd = await call(histRoute.GET, "GET", `/api/admin/notifications/history?from=${today}&to=${today}&status=open`, asOwner);
    ok(hd.status === 200 && (hd.json.rows as { resolved_at: string | null }[]).every((r) => !r.resolved_at), "R6 tarih + açık karar filtresi");
    let badOk = 0;
    for (const qs of ["type=yok", "status=yok", "from=2026-13-40", "to=2026-02-30", "page=0", "from=bugun"]) if ((await call(histRoute.GET, "GET", `/api/admin/notifications/history?${qs}`, asOwner)).status === 400) badOk++;
    ok(badOk === 6, "R7 geçersiz filtreler → 400");
    // Bildirim bağlantısı yalnız üye kimliği taşır; uzman token'ı ile admin üye ucu okunamaz.
    const target = (g.json.actions as { target_user_id: string }[])[0]?.target_user_id;
    const uz = await call(userRoute.GET, "GET", `/api/admin/users/${target}`, { adminId: PRE_PREMIUM, token: expTok }, undefined, target);
    ok(uz.status === 401 || uz.status === 403, "R8 bildirimdeki üye bağlantısı uzman/başka tenant oturumuyla açılamaz (401/403)");
    // DB geçici hatası → 5xx (sıfır sayaç DÖNMEZ)
    await su.query(`alter function public.admin_notification_feed(uuid, integer) rename to admin_notification_feed_zz`);
    const down = await call(feedRoute.GET, "GET", "/api/admin/notifications", asOwner);
    await su.query(`alter function public.admin_notification_feed_zz(uuid, integer) rename to admin_notification_feed`);
    ok(down.status >= 500 && down.json.counts === undefined, `R9 DB hatası → ${down.status}, sayaç verisi dönmez (istemci son bilinen değeri korur)`);
    // Bildirim hatası gerçek kayıt route'unu engellemez
    await su.query(`alter table public.admin_notifications add constraint zz_boom3 check (false) not valid`);
    const regEmail = `zz.on.reg.${randomUUID().slice(0, 6)}@example.test`;
    const reg = await call(registerRoute.POST, "POST", "/api/register", {}, { fullName: "ZZ ON Kayıt", email: regEmail, password: "abcd123456" }, "", { "x-forwarded-for": "203.0.113.77" });
    await su.query(`alter table public.admin_notifications drop constraint zz_boom3`);
    ok(reg.status === 200 && (await su.query(`select count(*)::int n from public.users where email=$1`, [regEmail])).rows[0].n === 1, "R10 bildirim tablosu bozukken gerçek /api/register kaydı TAMAMLANDI");
    await su.query(`update public.admin_notification_settings set last_reconciled_at = null`);
    const g2 = await call(feedRoute.GET, "GET", "/api/admin/notifications", asOwner);
    ok((g2.json.actions as { email: string }[]).some((a) => a.email === regEmail), "R11 sonraki zil okumasında kaçan başvuru görünür (uzlaştırma)");
  } finally {
    for (const c of conns) await c.end().catch(() => undefined);
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nOWNER BİLDİRİM: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
