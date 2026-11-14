/**
 * ADMIN ÜYE YÖNETİMİ · AŞAMA 4b — PRO GEÇİŞİ VE ÖDEME KAYDI GÜVENLİĞİ harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (… → 4a → 4b) + gerçek RPC'ler + gerçek Next route
 * handler'ları (test-only PostgREST şimi). Production'a / ağa SIFIR temas; tüm hesaplar sentetik (ZZ_4B_*).
 *
 *   M  migration: ön koşul fail-closed · 2× uygulama · mevcut satırlar değişmez · yetkiler (yalnız service_role)
 *   P  Pro geçişi: aktif deneme → Pro · PASİF deneme → 409 (hesap pasif kalır, hiçbir satır değişmez) · arşiv → 409 ·
 *      doğrudan RPC (TR412 / UY005) · Pro geçişi ∥ pasife alma yarışı → pasif hesap hiçbir sırada aktifleşmez
 *   D  ödeme: başarı (kullanıcı + geçmiş + audit birlikte) · geçmiş hatası → hiçbir şey kalmaz · audit hatası → tamamı geri ·
 *      eşzamanlı farklı kayıtlar tutarlı · aynı verinin tekrarı (sıralı + eşzamanlı) mükerrer geçmiş üretmez ·
 *      muafiyet gerekçesi (route + DB) · eski kayıtlar (literal 'undefined', eski geçmiş satırları) · arşiv · yetki
 *   C  yayın sırası: yeni kod + ESKİ şema (4b yok) → ödeme hiçbir yazım olmadan reddedilir, pasif Pro geçişi
 *      eski davranış (aktifleştirir) → MIGRATION ÖNCE zorunlu
 *
 * Çalıştır: npx tsx scripts/uye-4b/uye-4b.harness.ts
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb, type TestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

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
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 600)}`}`);
  }
}

const MIG_PAY = "20280101000700_admin_payment_atomic_4b.sql";
const MIG_CONV = "20280101000710_admin_trial_convert_passive_guard_4b.sql";
const PRE_4B = [
  "20271009100000_admin_purge_archived_expert.sql",
  "20271230000000_astrology_technique_grants.sql",
  "20280101000000_trial7_self_trial.sql",
  "20280101000100_trial7_claims_retention.sql",
  "20280101000200_trial7_admin_trial_approval.sql",
  "20280101000300_admin_legacy_package_repair.sql",
  "20280101000400_admin_owner_notifications.sql",
  "20280101000500_admin_list_members_v2.sql",
  "20280101000600_admin_member_archive_state.sql",
];
const OWNER = "00000000-0000-4000-8000-0000000004b1";
const ADMIN2 = "00000000-0000-4000-8000-0000000004b2";
const EXPERT_ACTOR = "00000000-0000-4000-8000-0000000004b3";
const TOK = { owner: "zz-4b-owner-token-0001", admin2: "zz-4b-admin2-token-0001", expert: "zz-4b-expert-token-0001" };
const D = 86_400_000;
const PASSIVE_MSG = "Bu hesap pasif. Pro'ya geçirmek için önce yetkili yönetici tarafından Aktif Yap işlemi gerçekleştirilmelidir.";

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
type Auth = { adminId: string; token: string };
const asOwner: Auth = { adminId: OWNER, token: TOK.owner };
const asAdmin2: Auth = { adminId: ADMIN2, token: TOK.admin2 };
const asExpert: Auth = { adminId: EXPERT_ACTOR, token: TOK.expert };

/** Ortak sentetik kurulum: yöneticiler + uzman aktör + oturumlar. */
async function seedActors(db: TestDb): Promise<() => Promise<string>> {
  const { su } = db;
  const tenant = async () => {
    const id = randomUUID();
    await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ4B',$2,'active')`, [id, `zz4b-${id.slice(0, 12)}`]);
    return id;
  };
  for (const [id, role, sup] of [[OWNER, "admin", true], [ADMIN2, "admin", false], [EXPERT_ACTOR, "expert", false]] as [string, string, boolean][]) {
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
       values ($1,$2,$3,$4,true,'approved',$5,$6,$7, now() - interval '400 days')`,
      [id, `ZZ_4B ${role} ${id.slice(-2)}`, `zz.4b.${id.slice(-2)}@example.test`, role, sup, sup ? "owner" : role === "admin" ? "admin" : null, await tenant()],
    );
  }
  await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6)`,
    [OWNER, TOK.owner, ADMIN2, TOK.admin2, EXPERT_ACTOR, TOK.expert]);
  return tenant;
}

type Expert = { key: string; active?: boolean; trial?: boolean; pkg?: string | null; plan?: string; pay?: string | null; note?: string | null;
  fee?: number | null; npd?: string | null; role?: string };
async function mkExpert(db: TestDb, tenant: () => Promise<string>, e: Expert): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await db.su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, trial_kind, trial_status,
        trial_started_at, trial_ends_at, payment_status, payment_note, agreed_fee, next_payment_date, module_permissions, tenant_id, created_at)
     values ($1,$2,$3,$4,$5,'approved', now() - interval '20 days', $6,$7,$8,$9,$10,$11,$12,$13,$14,$15::date,$16,$17, now() - interval '30 days')`,
    [id, `ZZ_4B Uzman ${e.key}`, `zz.4b.${e.key}@example.test`, e.role ?? "expert", e.active !== false,
      e.trial ? "trial" : (e.pkg === undefined ? "premium" : e.pkg), e.trial ? "trial" : (e.plan ?? "premium"),
      e.trial ? "self_7d" : null, e.trial ? "active" : null, e.trial ? new Date(now - 2 * D) : null, e.trial ? new Date(now + 5 * D) : null,
      e.pay ?? null, e.note ?? null, e.fee ?? null, e.npd ?? null,
      JSON.stringify({ clients: true, numerology: true }), await tenant()],
  );
  await db.su.query(`insert into public.clients(tenant_id, full_name) select tenant_id, 'ZZ Danışan' from public.users where id=$1`, [id]);
  await db.su.query(`insert into public.user_payment_history(user_id, payment_status, paid_amount, payment_note) values ($1,'paid',1500,'zz eski satir')`, [id]);
  if (e.active !== false) await db.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, `zz-4b-${e.key}-${id.slice(0, 6)}`]);
  return id;
}

function makeCaller(routes: { payment: Handler; convert: Handler; history: Handler }) {
  async function call(h: Handler, method: string, id: string, auth: Auth, body?: unknown) {
    const headers: Record<string, string> = { "x-admin-id": auth.adminId, "x-session-token": auth.token };
    if (body !== undefined) headers["content-type"] = "application/json";
    const req = new NextRequest(`http://localhost/api/x/${id}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await h(req, { params: Promise.resolve({ id }) });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
    return { status: res.status, json };
  }
  const draft = (o: Partial<Record<"status" | "note" | "agreedFee" | "billingPeriod" | "paidAmount" | "lastPaymentDate" | "nextPaymentDate", string>>) => ({
    status: "paid", lastPaymentDate: "", nextPaymentDate: "", paidAmount: "", note: "", agreedFee: "", billingPeriod: "", ...o,
  });
  return {
    pay: (id: string, d: Record<string, unknown>, auth: Auth = asOwner) => call(routes.payment, "POST", id, auth, { draft: d }),
    convert: (id: string, auth: Auth = asOwner, modules: unknown = ["clients", "numerology"]) => call(routes.convert, "POST", id, auth, { modules }),
    history: (id: string, auth: Auth = asOwner) => call(routes.history, "GET", id, auth),
    draft,
  };
}

async function main(): Promise<void> {
  const port = 58100 + Math.floor(Math.random() * 800);
  const db = await startTestDb(port, `uye-4b-${port}`);
  const { su, pool } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    for (const f of PRE_4B) await su.query(readMig(f));
    const tenant = await seedActors(db);

    // ── M) Migration ─────────────────────────────────────────────────────────
    console.log("\n[M] Migration: ön koşul · tekrar · mevcut veri · yetki");
    const legacyU = await mkExpert(db, tenant, { key: "legacy", pay: "undefined", note: "eski not", fee: 750 });
    const snap = async () => (await su.query(`select
        (select md5(string_agg(u::text, '|' order by id)) from public.users u) u,
        (select md5(string_agg(h::text, '|' order by id)) from public.user_payment_history h) h,
        (select md5(string_agg(a::text, '|' order by id)) from public.admin_audit_log a) a,
        (select count(*)::int from public.user_sessions) s`)).rows[0];
    const s0 = await snap();
    await su.query(readMig(MIG_PAY));
    await su.query(readMig(MIG_PAY));
    await su.query(readMig(MIG_CONV));
    await su.query(readMig(MIG_CONV));
    const s1 = await snap();
    ok(JSON.stringify(s0) === JSON.stringify(s1), "migration 2× uygulandı; kullanıcı / ödeme geçmişi / audit / oturum satırları DEĞİŞMEDİ (DML yok)", { s0, s1 });
    const priv = (await su.query(`select
        has_function_privilege('anon','public.admin_save_member_payment(uuid,uuid,jsonb)','EXECUTE') a1,
        has_function_privilege('authenticated','public.admin_save_member_payment(uuid,uuid,jsonb)','EXECUTE') a2,
        has_function_privilege('service_role','public.admin_save_member_payment(uuid,uuid,jsonb)','EXECUTE') a3,
        has_function_privilege('anon','public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])','EXECUTE') b1,
        has_function_privilege('authenticated','public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])','EXECUTE') b2,
        has_function_privilege('service_role','public.admin_trial_convert_to_pro(uuid,uuid,jsonb,text[])','EXECUTE') b3,
        (select bool_and(prosecdef) from pg_proc where proname in ('admin_save_member_payment','admin_trial_convert_to_pro')) sd`)).rows[0];
    ok(!priv.a1 && !priv.a2 && priv.a3 && !priv.b1 && !priv.b2 && priv.b3 && priv.sd, "EXECUTE yalnız service_role; iki fonksiyon SECURITY DEFINER", priv);
    // Ön koşul fail-closed: ödeme geçmişi kolonu eksik ayrı bir şemada migration HİÇBİR şey uygulamaz.
    await su.query(`create schema zz_pre; create table zz_pre.t(x int)`);
    let preErr = "";
    const c1 = await pool.connect();
    try {
      await c1.query(`alter table public.user_payment_history rename column actor_admin_id to zz_actor`);
      await c1.query(`drop function public.admin_save_member_payment(uuid,uuid,jsonb)`);
      await c1.query(readMig(MIG_PAY));
    } catch (e) { preErr = (e as Error).message; await c1.query("rollback").catch(() => undefined); }
    const fnAfterPre = (await c1.query(`select to_regprocedure('public.admin_save_member_payment(uuid,uuid,jsonb)') f`)).rows[0].f;
    await c1.query(`alter table public.user_payment_history rename column zz_actor to actor_admin_id`).catch(() => undefined);
    c1.release();
    ok(/kolonlari eksik/.test(preErr) && fnAfterPre === null, "ön koşul: ödeme geçmişi kolonu eksikse migration fail-closed (fonksiyon kurulmaz)", { preErr, fnAfterPre });
    await su.query(readMig(MIG_PAY));
    ok((await su.query(`select to_regprocedure('public.admin_save_member_payment(uuid,uuid,jsonb)') f`)).rows[0].f !== null, "ön koşul düzelince migration uygulanır");

    shim = await startPgrestShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const paymentRoute = await import("../../app/api/admin/users/[id]/payment/route");
    const convertRoute = await import("../../app/api/admin/trials/[id]/convert/route");
    const historyRoute = await import("../../app/api/admin/users/[id]/payment-history/route");
    const api = makeCaller({ payment: paymentRoute.POST as unknown as Handler, convert: convertRoute.POST as unknown as Handler, history: historyRoute.GET as unknown as Handler });

    const rowHash = async (id: string) => (await su.query(`select md5(u::text) h from public.users u where id=$1`, [id])).rows[0].h as string;
    const user = async (id: string) => (await su.query(`select * from public.users where id=$1`, [id])).rows[0];
    const counts = async (id: string) => (await su.query(`select
        (select count(*)::int from public.user_payment_history where user_id=$1) hist,
        (select count(*)::int from public.admin_audit_log where target_user_id=$1) audit,
        (select count(*)::int from public.admin_audit_log where target_user_id=$1 and action='payment_status_changed') pay_audit,
        (select count(*)::int from public.trial_admin_events where target_user_id=$1) tev,
        (select count(*)::int from public.pro_upgrade_requests where user_id=$1 and status='open') openreq,
        (select count(*)::int from public.user_sessions where user_id=$1 and is_active) sess,
        (select count(*)::int from public.clients c join public.users u on u.tenant_id=c.tenant_id where u.id=$1) clients`, [id])).rows[0];
    const rpcErr = async (sql: string, args: unknown[]) => {
      try { await su.query(sql, args); return "OK"; } catch (e) { return (e as { code?: string }).code ?? "?"; }
    };

    // ── P) Pro geçişi ────────────────────────────────────────────────────────
    console.log("\n[P] Pro geçişi: aktif · pasif · arşiv · doğrudan RPC · yarış");
    const tActive = await mkExpert(db, tenant, { key: "t_active", trial: true });
    await su.query(`insert into public.pro_upgrade_requests(user_id, note) values ($1,'zz talep')`, [tActive]);
    const r1 = await api.convert(tActive);
    const u1 = await user(tActive);
    ok(r1.status === 200 && String(u1.package_type) === "premium" && u1.trial_status === "converted" && u1.active === true,
      "1) aktif deneme → Pro 200 (premium, converted, aktif kalır)", { r1, pkg: u1.package_type, ts: u1.trial_status, a: u1.active });
    ok((await counts(tActive)).openreq === 0 && (await counts(tActive)).clients === 1, "1) açık Pro talebi kapandı; danışan korunur");

    const tPassive = await mkExpert(db, tenant, { key: "t_passive", trial: true });
    await su.query(`insert into public.pro_upgrade_requests(user_id, note) values ($1,'zz talep')`, [tPassive]);
    await su.query(`select public.admin_set_user_active($1,$2,false)`, [tPassive, OWNER]);
    const hP = await rowHash(tPassive);
    const cP = await counts(tPassive);
    const r2 = await api.convert(tPassive);
    ok(r2.status === 409 && r2.json.error === PASSIVE_MSG, "2) pasif deneme → 409 + Owner metni", r2);
    ok((await rowHash(tPassive)) === hP && JSON.stringify(await counts(tPassive)) === JSON.stringify(cP),
      "2) pasif: kullanıcı satırı (paket, modül, deneme, active) + oturum + geçmiş + audit + talep DEĞİŞMEDİ", { before: cP, after: await counts(tPassive) });
    ok((await user(tPassive)).active === false, "2) hesap PASİF kalır");
    ok((await rpcErr(`select public.admin_trial_convert_to_pro($1,$2,'{"clients":true}'::jsonb,'{}'::text[])`, [OWNER, tPassive])) === "TR412"
      && (await rowHash(tPassive)) === hP, "2) doğrudan RPC (route atlanarak) → TR412, satır değişmez (kilit altındaki DB kuralı)");
    // Pasif hesap "Aktif Yap" sonrası normal geçer (iş akışı korunur)
    await su.query(`select public.admin_set_user_active($1,$2,true)`, [tPassive, OWNER]);
    const r2b = await api.convert(tPassive);
    ok(r2b.status === 200 && (await user(tPassive)).package_type === "premium", "2) önce Aktif Yap → sonra Pro geçişi 200 (mevcut akış)", r2b);

    const tArch = await mkExpert(db, tenant, { key: "t_arch", trial: true });
    await su.query(`select public.admin_archive_user($1,$2)`, [tArch, OWNER]);
    const hA = await rowHash(tArch);
    const cA = await counts(tArch);
    const r3 = await api.convert(tArch);
    ok(r3.status === 409 && /arşivde/i.test(String(r3.json.error)), "3) arşivdeki deneme → 409 (arşiv metni; mevcut engel)", r3);
    ok((await rpcErr(`select public.admin_trial_convert_to_pro($1,$2,'{"clients":true}'::jsonb,'{}'::text[])`, [OWNER, tArch])) === "UY005"
      && (await rowHash(tArch)) === hA && JSON.stringify(await counts(tArch)) === JSON.stringify(cA), "3) doğrudan RPC → UY005; hiçbir satır değişmez");
    // Yarış: Pro geçişi ∥ Pasif Yap → hangi sıra olursa olsun hesap sonunda PASİF (geçiş aktifleştiremez)
    for (let i = 0; i < 6; i++) {
      const t = await mkExpert(db, tenant, { key: `t_race${i}`, trial: true });
      const [cv, dz] = await Promise.all([
        api.convert(t),
        pool.query(`select public.admin_set_user_active($1,$2,false)`, [t, OWNER]).then(() => "ok", (e) => (e as { code?: string }).code ?? "err"),
      ]);
      const u = await user(t);
      ok(dz === "ok" && u.active === false && ((cv.status === 200 && u.package_type === "premium") || (cv.status === 409 && u.package_type === "trial")),
        `3b) yarış #${i + 1}: Pro geçişi ∥ Pasif Yap → hesap pasif kalır (${cv.status === 200 ? "geçiş önce" : "pasif önce → 409"})`, { cv: cv.status, dz, a: u.active, p: u.package_type });
    }
    // Yetki: uzman aktör / bozuk UUID — mevcut kurallar
    ok((await api.convert(tActive, asExpert)).status === 403, "yetki: uzman Pro geçişi yapamaz (403, mevcut)");

    // ── D) Ödeme ─────────────────────────────────────────────────────────────
    console.log("\n[D] Ödeme kaydı: tek işlem · hata geri alma · eşzamanlılık · tekrar · muafiyet · eski kayıt · arşiv · yetki");
    const pOk = await mkExpert(db, tenant, { key: "p_ok", pay: "pending", fee: 1000 });
    const c4 = await counts(pOk);
    const r4 = await api.pay(pOk, api.draft({ status: "paid", lastPaymentDate: "2026-11-01", nextPaymentDate: "2026-12-01", paidAmount: "1500", agreedFee: "1500", billingPeriod: "monthly", note: "Havale" }));
    const u4 = await user(pOk);
    const h4 = (await su.query(`select * from public.user_payment_history where user_id=$1 order by created_at desc, id desc limit 1`, [pOk])).rows[0];
    const a4 = (await su.query(`select * from public.admin_audit_log where target_user_id=$1 and action='payment_status_changed'`, [pOk])).rows;
    const c4b = await counts(pOk);
    ok(r4.status === 200 && r4.json.changed === true && u4.payment_status === "paid" && Number(u4.agreed_fee) === 1500 && u4.billing_period === "monthly",
      "4) başarı → kullanıcı ödeme alanları yazıldı", { r4, u4: { s: u4.payment_status, f: u4.agreed_fee } });
    ok(c4b.hist === c4.hist + 1 && c4b.pay_audit === c4.pay_audit + 1, "4) aynı işlemde 1 geçmiş + 1 audit", { c4, c4b });
    ok(h4 && h4.payment_status === "paid" && Number(h4.paid_amount) === 1500 && Number(h4.agreed_fee) === 1500 && h4.billing_period === "monthly"
      && h4.actor_admin_id === OWNER && h4.payment_note === "Havale", "4) geçmiş satırı = kaydedilen son durumun anlık görüntüsü (aktör dahil)", h4);
    const ctx4 = a4[0]?.context as { fields?: string[] } | undefined;
    ok(a4.length === 1 && a4[0].actor_admin_id === OWNER && a4[0].actor_is_main_admin === true && Array.isArray(ctx4?.fields)
      && ctx4!.fields!.includes("payment_status") && !/1500|Havale|monthly/.test(JSON.stringify(a4[0])), "4) audit: yalnız değişen alan ADLARI (tutar/not DEĞERİ yok)", a4[0]);
    ok(JSON.stringify([...(r4.json.fields as string[])].sort()) === JSON.stringify([...ctx4!.fields!].sort()), "4) yanıt alanları = audit alanları");

    // 5) Geçmiş hatası → hiçbir değişiklik kalmaz
    const h5 = await rowHash(pOk);
    const c5 = await counts(pOk);
    await su.query(`create function public.zz4b_fail() returns trigger language plpgsql as $f$ begin raise exception 'zz hata'; end $f$;
                    create trigger zz4b_fail_hist before insert on public.user_payment_history for each row execute function public.zz4b_fail();`);
    const r5 = await api.pay(pOk, api.draft({ status: "overdue", lastPaymentDate: "2026-11-01", nextPaymentDate: "2026-12-01", paidAmount: "1500", agreedFee: "1800", billingPeriod: "monthly", note: "Havale" }));
    await su.query(`drop trigger zz4b_fail_hist on public.user_payment_history`);
    ok(r5.status === 500 && r5.json.ok === false && !/zz hata|trigger|relation|permission/i.test(JSON.stringify(r5.json)), "5) geçmiş hatası → 500, ham hata sızmaz", r5);
    ok((await rowHash(pOk)) === h5 && JSON.stringify(await counts(pOk)) === JSON.stringify(c5), "5) geçmiş hatası → kullanıcı satırı, geçmiş ve audit HİÇ değişmedi");

    // 6) Audit hatası → tamamı geri alınır
    await su.query(`create function public.zz4b_fail_audit() returns trigger language plpgsql as $f$
                      begin if new.action = 'payment_status_changed' then raise exception 'zz audit hata'; end if; return new; end $f$;
                    create trigger zz4b_fail_audit before insert on public.admin_audit_log for each row execute function public.zz4b_fail_audit();`);
    const r6 = await api.pay(pOk, api.draft({ status: "overdue", lastPaymentDate: "2026-11-01", nextPaymentDate: "2026-12-01", paidAmount: "1500", agreedFee: "1800", billingPeriod: "monthly", note: "Havale" }));
    await su.query(`drop trigger zz4b_fail_audit on public.admin_audit_log; drop function public.zz4b_fail_audit(); drop function public.zz4b_fail();`);
    ok(r6.status === 500 && (await rowHash(pOk)) === h5 && JSON.stringify(await counts(pOk)) === JSON.stringify(c5),
      "6) audit hatası → 500; kullanıcı + geçmiş dahil TAMAMI geri alındı", { r6, after: await counts(pOk), c5 });

    // 7) Eşzamanlı farklı kayıtlar → tutarlı (her kaydedilen değişiklik = 1 geçmiş + 1 audit; son durum = son geçmiş)
    const pConc = await mkExpert(db, tenant, { key: "p_conc", pay: "pending", fee: 100 });
    const c7 = await counts(pConc);
    const fees = [110, 120, 130, 140, 150, 160, 170, 180];
    const res7 = await Promise.all(fees.map((f) => api.pay(pConc, api.draft({ status: "paid", agreedFee: String(f), billingPeriod: "monthly" }))));
    const c7b = await counts(pConc);
    const nChanged = res7.filter((r) => r.status === 200 && r.json.changed === true).length;
    const last7 = (await su.query(`select * from public.user_payment_history where user_id=$1 order by created_at desc, id desc limit 1`, [pConc])).rows[0];
    const u7 = await user(pConc);
    ok(res7.every((r) => r.status === 200), "7) 8 eşzamanlı kayıt: hepsi 200 (kilit sırayla işler; kısmi yazım yok)", res7.map((r) => r.status));
    ok(c7b.hist - c7.hist === nChanged && c7b.pay_audit - c7.pay_audit === nChanged && nChanged >= 1,
      `7) geçmiş artışı = audit artışı = değişen kayıt sayısı (${nChanged})`, { c7, c7b, nChanged });
    ok(Number(last7.agreed_fee) === Number(u7.agreed_fee) && last7.payment_status === u7.payment_status,
      "7) son geçmiş satırı = kullanıcının son durumu (tutarsızlık yok)", { hist: last7.agreed_fee, user: u7.agreed_fee });

    // 8) Aynı verinin tekrarı → mükerrer geçmiş yok (sıralı + eşzamanlı)
    const pDup = await mkExpert(db, tenant, { key: "p_dup", pay: "pending" });
    const dupDraft = api.draft({ status: "paid", paidAmount: "900", lastPaymentDate: "2026-11-10", billingPeriod: "yearly", agreedFee: "900" });
    const c8 = await counts(pDup);
    const r8a = await api.pay(pDup, dupDraft);
    const r8b = await api.pay(pDup, dupDraft);
    ok(r8a.json.changed === true && r8b.status === 200 && r8b.json.changed === false && (await counts(pDup)).hist === c8.hist + 1,
      "8) sıralı tekrar → changed:false, geçmiş/audit tek", { r8a: r8a.json, r8b: r8b.json });
    const pDup2 = await mkExpert(db, tenant, { key: "p_dup2", pay: "pending" });
    const c8b = await counts(pDup2);
    const res8 = await Promise.all(Array.from({ length: 6 }, () => api.pay(pDup2, dupDraft)));
    const c8c = await counts(pDup2);
    ok(res8.every((r) => r.status === 200) && res8.filter((r) => r.json.changed === true).length === 1
      && c8c.hist === c8b.hist + 1 && c8c.pay_audit === c8b.pay_audit + 1, "8) 6 eşzamanlı aynı kayıt → tam 1 geçmiş + 1 audit (kilit altında yeniden karşılaştırma)",
      { changed: res8.map((r) => r.json.changed), c8b, c8c });

    // 9) Muafiyet gerekçesi
    const pEx = await mkExpert(db, tenant, { key: "p_ex", pay: "pending" });
    const h9 = await rowHash(pEx);
    const c9 = await counts(pEx);
    const r9 = await api.pay(pEx, api.draft({ status: "exempt", note: "   " }));
    ok(r9.status === 400 && /gerekçe/.test(String(r9.json.error)) && (await rowHash(pEx)) === h9 && JSON.stringify(await counts(pEx)) === JSON.stringify(c9),
      "9) gerekçesiz YENİ muafiyet → 400 (route), hiçbir yazım yok", r9);
    ok((await rpcErr(`select public.admin_save_member_payment($1,$2,'{"payment_status":"exempt","payment_note":null}'::jsonb)`, [OWNER, pEx])) === "PY400"
      && (await rowHash(pEx)) === h9, "9) gerekçesiz YENİ muafiyet → doğrudan RPC de reddeder (PY400)");
    const r9b = await api.pay(pEx, api.draft({ status: "exempt", note: "Kurucu ekip" }));
    ok(r9b.status === 200 && (await user(pEx)).payment_status === "exempt", "9) gerekçeli muafiyet → 200", r9b);
    const pOldEx = await mkExpert(db, tenant, { key: "p_oldex", pay: "exempt", note: null });
    const r9c = await api.pay(pOldEx, api.draft({ status: "exempt", agreedFee: "0" }));
    ok(r9c.status === 200 && (await user(pOldEx)).payment_status === "exempt", "9) zaten muaf ESKİ kayıt (gerekçesiz) diğer alanı güncelleyebilir (engellenmez)", r9c);

    // 10) Eski kayıtlar
    const oldHist = (await su.query(`select md5(string_agg(h::text,'|' order by id)) m from public.user_payment_history h where payment_note='zz eski satir'`)).rows[0].m;
    const r10 = await api.pay(legacyU, api.draft({ status: "unknown", note: "yalnız not değişti", agreedFee: "750" }));
    const u10 = await user(legacyU);
    ok(r10.status === 200 && u10.payment_status === "undefined" && u10.payment_note === "yalnız not değişti" && Number(u10.agreed_fee) === 750,
      "10) literal 'undefined' eski durum + yalnız not değişti → durum yeniden YAZILMADI (normalize edilmez)", { r10, s: u10.payment_status });
    const lastH10 = (await su.query(`select payment_status from public.user_payment_history where user_id=$1 order by created_at desc, id desc limit 1`, [legacyU])).rows[0];
    ok(lastH10.payment_status === "undefined", "10) geçmiş anlık görüntüsü eski ham değeri taşır");
    ok((await su.query(`select md5(string_agg(h::text,'|' order by id)) m from public.user_payment_history h where payment_note='zz eski satir'`)).rows[0].m === oldHist,
      "10) eski ödeme geçmişi satırları DEĞİŞMEDİ / silinmedi");
    const r10h = await api.history(pOk);
    ok(r10h.status === 200 && Array.isArray(r10h.json.history) && (r10h.json.history as unknown[]).length >= 2, "10) ödeme geçmişi ekranı uç noktası çalışıyor (200)", r10h.status);

    // 11) Arşiv + yetki regresyonları
    const pArch = await mkExpert(db, tenant, { key: "p_arch", pay: "paid" });
    await su.query(`select public.admin_archive_user($1,$2)`, [pArch, OWNER]);
    const h11 = await rowHash(pArch);
    const c11 = await counts(pArch);
    const r11 = await api.pay(pArch, api.draft({ status: "overdue" }));
    ok(r11.status === 409 && /arşivde/i.test(String(r11.json.error)), "11) arşivdeki hesap ödeme değişikliği → 409 (route)", r11);
    ok((await rpcErr(`select public.admin_save_member_payment($1,$2,'{"payment_status":"overdue"}'::jsonb)`, [OWNER, pArch])) === "UY005"
      && (await rowHash(pArch)) === h11 && JSON.stringify(await counts(pArch)) === JSON.stringify(c11), "11) arşiv: doğrudan RPC → UY005, hiçbir satır değişmez");
    ok((await api.pay(pOk, api.draft({ status: "pending" }), asExpert)).status === 403, "11) uzman aktör ödeme kaydedemez (403)");
    ok((await rpcErr(`select public.admin_save_member_payment($1,$2,'{"payment_status":"pending"}'::jsonb)`, [EXPERT_ACTOR, pOk])) === "42501", "11) doğrudan RPC: admin olmayan aktör → 42501");
    ok((await api.pay(ADMIN2, api.draft({ status: "paid" }), asAdmin2)).status === 403, "11) yönetici hedef: yalnız ana yönetici (mevcut kural, 403)");
    ok((await rpcErr(`select public.admin_save_member_payment($1,$2,'{"zz":"x"}'::jsonb)`, [OWNER, pOk])) === "PY400", "11) izinli olmayan alan → PY400 (yalnız 7 ödeme kolonu)");
    const pMod = await mkExpert(db, tenant, { key: "p_mod", pay: "paid" });
    const before11 = await user(pMod);
    await api.pay(pMod, api.draft({ status: "overdue" }));
    const after11 = await user(pMod);
    ok(JSON.stringify(after11.module_permissions) === JSON.stringify(before11.module_permissions) && after11.package_type === before11.package_type
      && after11.active === true && after11.trial_status === before11.trial_status, "11) ödeme kaydı modül / paket / deneme / aktiflik alanlarına dokunmaz");
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }

  console.log(`\nAŞAMA 4b (Pro geçişi + ödeme atomik): PASS ${pass} · FAIL ${fail}`);
  if (fail) console.log("Başarısız:", failures);
  // C bölümü ayrı süreçte: route modülleri Supabase istemcisini süreç başına önbelleğe alır (getServerDb).
  const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1], "--eski-sema"], { encoding: "utf8", env: process.env, maxBuffer: 64 << 20 });
  process.stdout.write(child.stdout ?? "");
  process.stderr.write(child.stderr ?? "");
  const m = /yayın sırası \(eski şema\): PASS (\d+) · FAIL (\d+)/.exec(child.stdout ?? "");
  const cPass = m ? Number(m[1]) : 0;
  const cFail = m ? Number(m[2]) : 1;
  console.log(`\nAŞAMA 4b TOPLAM: PASS ${pass + cPass} · FAIL ${fail + cFail}`);
  if (fail || cFail || child.status !== 0) process.exit(1);
}

/** C) Yayın sırası: YENİ kod + ESKİ şema (4b migration'ları yok). Ayrı süreç (temiz Supabase istemcisi). */
async function eskiSema(): Promise<void> {
  console.log("\n[C] Yayın sırası: yeni kod + 4b'siz şema");
  const port2 = 58950 + Math.floor(Math.random() * 40);
  const db2 = await startTestDb(port2, `uye-4b-eski-${port2}`);
  let shim2: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    // startTestDb 4b ödeme fonksiyonunu kurar → "eski şema" için kaldırılır; 000710 hiç uygulanmaz.
    await db2.su.query(`drop function public.admin_save_member_payment(uuid,uuid,jsonb)`);
    for (const f of PRE_4B) await db2.su.query(readMig(f));
    const tenant2 = await seedActors(db2);
    shim2 = await startPgrestShim(db2.pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim2.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const paymentRoute = await import("../../app/api/admin/users/[id]/payment/route");
    const convertRoute = await import("../../app/api/admin/trials/[id]/convert/route");
    const historyRoute = await import("../../app/api/admin/users/[id]/payment-history/route");
    const api = makeCaller({ payment: paymentRoute.POST as unknown as Handler, convert: convertRoute.POST as unknown as Handler, history: historyRoute.GET as unknown as Handler });
    const p = await mkExpert(db2, tenant2, { key: "c_pay", pay: "pending" });
    const snapP = async () => (await db2.su.query(`select md5(u::text) h, (select count(*)::int from public.user_payment_history where user_id=$1) n,
        (select count(*)::int from public.admin_audit_log where target_user_id=$1) a from public.users u where id=$1`, [p])).rows[0];
    const before = await snapP();
    const r = await api.pay(p, api.draft({ status: "paid", paidAmount: "100" }));
    const after = await snapP();
    ok(r.status === 500 && JSON.stringify(before) === JSON.stringify(after),
      "C1) yeni kod + eski şema: ödeme HİÇBİR yazım olmadan reddedilir (kısmi kayıt yok) → MIGRATION ÖNCE", { r, before, after });
    const t = await mkExpert(db2, tenant2, { key: "c_trial", trial: true });
    await db2.su.query(`select public.admin_set_user_active($1,$2,false)`, [t, OWNER]);
    const rc = await api.convert(t);
    const ut = (await db2.su.query(`select active, package_type from public.users where id=$1`, [t])).rows[0];
    ok(rc.status === 200 && ut.active === true,
      "C2) eski şemada (4b yok) pasif deneme Pro geçişinde AKTİFLEŞİR — bulunan hata yeniden üretildi (düzeltme migration'da)", { rc: rc.status, ut });
  } finally {
    if (shim2) await shim2.close().catch(() => undefined);
    await db2.stop();
  }
}

(process.argv.includes("--eski-sema")
  ? eskiSema().then(() => {
      console.log(`\nAŞAMA 4b · yayın sırası (eski şema): PASS ${pass} · FAIL ${fail}`);
      if (fail) {
        console.log("Başarısız:", failures);
        process.exit(1);
      }
    })
  : main()
).catch((e) => {
  console.error("HARNESS HATASI:", e);
  process.exit(1);
});
