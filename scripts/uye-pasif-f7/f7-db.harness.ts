/**
 * ÜYE PASİFLEŞTİRME F7 — kişiye özel üyelik uyarısı: VERİTABANI harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (… → 20280126000000 → 20280127000000) + gerçek RPC'ler.
 * Production'a / ağa SIFIR temas; sentetik hesaplar (ZZ_PSF7_*).
 *
 *   M  migration: ön koşul fail-closed · 2× uygulama · DML yok · tek imza (4 parametreli YOK) · yetkiler · SECURITY DEFINER
 *   U  eski çağrı uyumu: konumsal 4 argüman + adlı (PostgREST biçimi) p_message'sız çağrı AYNEN çalışır
 *   R  Pasif Yap: mesajsız · 3 hazır mesaj · düzenlenmiş hazır · özel (çok satır) · HTML/betik metni olduğu gibi (düz metin)
 *      · normalleştirme (kırpma, \r\n, sekme) · boşluk → NULL · 500 sınırı · kontrol karakteri · mesaj yalnız pasifleştirmede
 *   E  sonradan düzenle / kaldır · bayat ekran (UY001) · pasif olmayan (UY002) · yönetici hedef · arşiv (UY005) · yetkisiz aktör
 *   X  Aktif Yap mesajı TEMİZLER · yeniden pasifleştirmede eski mesaj GERİ GELMEZ · başka alan değişmez
 *   K  CHECK: pasif olmayan / yönetici satırında mesaj · 501 karakter → 23514
 *   A  audit: tam metin yalnız admin_audit_log'da (set / cleared / restricted / unrestricted)
 *   C  eşzamanlılık: aynı beklenen metinle iki düzenleme → tek başarı + tek audit · pasif yap ∥ pasif yap
 *   I  izolasyon: bir uzmanın mesajı başka uzmanın satırına yazılmaz / okunmaz
 *
 * Çalıştır: npx tsx scripts/uye-pasif-f7/f7-db.harness.ts
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { startTestDb, type TestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); return; }
  fail++;
  failures.push(label);
  console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 600)}`}`);
}

const MIG_F2 = "20280126000000_member_access_restriction.sql";
const MIG_F7 = "20280127000000_member_access_message.sql";
const PRE = [
  "20271009100000_admin_purge_archived_expert.sql",
  "20271230000000_astrology_technique_grants.sql",
  "20280101000000_trial7_self_trial.sql",
  "20280101000100_trial7_claims_retention.sql",
  "20280101000200_trial7_admin_trial_approval.sql",
  "20280101000300_admin_legacy_package_repair.sql",
  "20280101000400_admin_owner_notifications.sql",
  "20280101000500_admin_list_members_v2.sql",
  "20280101000600_admin_member_archive_state.sql",
  "20280101000690_user_payment_history_payment_date_optional_4b.sql",
  "20280101000700_admin_payment_atomic_4b.sql",
  "20280101000710_admin_trial_convert_passive_guard_4b.sql",
];
const OWNER = "00000000-0000-4000-8000-00000000f7a1";
const ADMIN2 = "00000000-0000-4000-8000-00000000f7a2";
const ADMIN_OFF = "00000000-0000-4000-8000-00000000f7a3";
const EXPERT_ACTOR = "00000000-0000-4000-8000-00000000f7e1";
export const PRESETS = [
  "Deneme süreniz sona ermiştir. Ücretli üyelik hakkında bilgi almak için lütfen sistem yöneticimizle iletişime geçiniz.",
  "Üyelik ödeme süreniz sona ermiştir. Sistemi kullanmaya devam edebilmek için lütfen sistem yöneticimizle iletişime geçiniz.",
  "Gecikmiş üyelik ödemeleriniz bulunmaktadır. Lütfen sistem yöneticimizle iletişime geçiniz.",
];

type Q = { query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };
async function errCode(c: Q, sql: string, args: unknown[] = []): Promise<string> {
  try { await c.query(sql, args); return "OK"; } catch (e) { return (e as { code?: string }).code ?? "?"; }
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address();
      const p = typeof a === "object" && a ? a.port : 0;
      srv.close(() => (p ? resolve(p) : reject(new Error("boş port alınamadı"))));
    });
  });
}

async function main(): Promise<void> {
  const port = await freePort();
  const db: TestDb = await startTestDb(port, `uye-pasif-f7-${port}`);
  const { su, pool } = db;
  try {
    for (const f of PRE) await su.query(readMig(f));
    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZPSF7',$2,'active')`, [id, `zzpsf7-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, role, sup, act] of [
      [OWNER, "admin", true, true], [ADMIN2, "admin", false, true], [ADMIN_OFF, "admin", false, false], [EXPERT_ACTOR, "expert", false, true],
    ] as [string, string, boolean, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
         values ($1,$2,$3,$4,$5,'approved',$6,$7,$8, now() - interval '400 days')`,
        [id, `ZZ_PSF7 ${role} ${id.slice(-2)}`, `zz.psf7.${id.slice(-2)}@example.test`, role, act, sup, sup ? "owner" : role === "admin" ? "admin" : null, await tenant()],
      );
    }
    const mk = async (key: string): Promise<string> => {
      const id = randomUUID();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, payment_status,
            module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',true,'approved', now() - interval '20 days','premium','premium','paid',$4,$5, now() - interval '30 days')`,
        [id, `ZZ_PSF7 Uzman ${key}`, `zz.psf7.${key}@example.test`, JSON.stringify({ clients: true, numerology: true }), await tenant()],
      );
      await su.query(`insert into public.clients(tenant_id, full_name) select tenant_id, 'ZZ Danışan' from public.users where id=$1`, [id]);
      return id;
    };
    const ids: Record<string, string> = {};
    for (const k of ["a", "b", "c", "d", "e", "f", "g"]) ids[k] = await mk(k);

    // ── M) Migration ─────────────────────────────────────────────────────────
    console.log("\n[M] Migration 20280127000000");
    let pre = "";
    try { await su.query(readMig(MIG_F7)); } catch (e) { pre = (e as Error).message; await su.query("rollback").catch(() => undefined); }
    ok(/F7 on kosul/.test(pre), "ön koşul: 20280126000000 yokken F7 uygulanmaz (fail-closed)", pre);
    await su.query(readMig(MIG_F2));
    const snap = async () => (await su.query(`select md5(string_agg((to_jsonb(u) - 'access_restriction_message')::text, '|' order by id)) h,
        (select count(*)::int from public.clients) c, (select count(*)::int from public.admin_audit_log) a from public.users u`)).rows[0];
    const s0 = await snap();
    await su.query(readMig(MIG_F7));
    await su.query(readMig(MIG_F7));
    const s1 = await snap();
    ok(s1.h === s0.h && s1.c === s0.c && s1.a === s0.a, "2× uygulandı; kullanıcı / danışan / audit satırları DEĞİŞMEDİ (DML yok)", { s0, s1 });
    const sig = (await su.query(`select
        to_regprocedure('public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean)') is null old4,
        to_regprocedure('public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean,text)') is not null new5,
        (select count(*)::int from pg_proc where proname='admin_set_member_access_restriction') n`)).rows[0];
    ok(sig.old4 && sig.new5 && sig.n === 1, "kısıt RPC'si TEK imza (5 parametre; eski 4 parametreli kaldırıldı → aşırı yükleme / belirsizlik yok)", sig);
    const fns = ["admin_set_member_access_restriction(uuid,uuid,boolean,boolean,text)", "admin_set_member_access_message(uuid,uuid,text,text)", "member_access_message_normalize(text)"];
    for (const f of fns) {
      const g = (await su.query(`select has_function_privilege('anon','public.${f}','EXECUTE') a, has_function_privilege('authenticated','public.${f}','EXECUTE') b,
          has_function_privilege('service_role','public.${f}','EXECUTE') c, has_function_privilege('public','public.${f}','EXECUTE') p`)).rows[0];
      ok(!g.a && !g.b && !g.p && g.c, `yetki: ${f.split("(")[0]} — anon / authenticated / PUBLIC YOK, service_role VAR`, g);
    }
    const sd = (await su.query(`select proname, prosecdef, proconfig::text cfg from pg_proc where proname in ('admin_set_member_access_restriction','admin_set_member_access_message') order by 1`)).rows;
    ok(sd.length === 2 && sd.every((r) => r.prosecdef === true && /search_path=public, pg_catalog/.test(r.cfg)), "RPC'ler SECURITY DEFINER + sabit search_path", sd);
    const actions = (await su.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='admin_audit_action_chk'`)).rows[0].d as string;
    ok(/user_access_message_set/.test(actions) && /user_access_message_cleared/.test(actions) && /user_access_restricted/.test(actions) && /user_unarchived/.test(actions),
      "audit CHECK süperset: yeni 2 eylem + mevcutlar");

    const R5 = `select public.admin_set_member_access_restriction($1,$2,$3,$4,$5) r`;
    const MSG = `select public.admin_set_member_access_message($1,$2,$3,$4) r`;
    const row = async (id: string) => (await su.query(`select active, access_restricted_at, access_restriction_message m, package_type, module_permissions::text mp, payment_status from public.users where id=$1`, [id])).rows[0];
    const lastAudit = async (id: string) => (await su.query(`select action, old_value, new_value from public.admin_audit_log where target_user_id=$1 order by created_at desc, id desc limit 1`, [id])).rows[0];

    // ── U) Eski çağrı uyumu ──────────────────────────────────────────────────
    console.log("\n[U] Eski çağrı uyumu");
    ok((await errCode(su, `select public.admin_set_member_access_restriction($1,$2,$3,$4)`, [ids.a, OWNER, true, false])) === "OK" && (await row(ids.a)).m === null,
      "konumsal 4 argüman (eski çağrı) çalışır; mesaj NULL");
    ok((await errCode(su, `select public.admin_set_member_access_restriction(p_user_id => $1, p_actor_admin_id => $2, p_restricted => $3, p_expected_restricted => $4)`, [ids.a, OWNER, false, true])) === "OK"
      && (await row(ids.a)).access_restricted_at === null, "adlı argümanlar, p_message'sız (PostgREST eski kod biçimi) çalışır");

    // ── R) Pasif Yap + mesaj ─────────────────────────────────────────────────
    console.log("\n[R] Pasif Yap ile mesaj");
    await su.query(R5, [ids.a, OWNER, true, false, null]);
    ok((await row(ids.a)).m === null && (await row(ids.a)).access_restricted_at !== null, "mesajsız pasifleştirme: kısıt var, mesaj NULL (standart uyarı)");
    for (const [i, k] of [[0, "b"], [1, "c"], [2, "d"]] as [number, string][]) {
      await su.query(R5, [ids[k], OWNER, true, false, PRESETS[i]]);
      const r = await row(ids[k]);
      ok(r.m === PRESETS[i] && r.access_restricted_at !== null, `hazır mesaj ${i + 1}: kısıt + mesaj aynı işlemde kaydedildi`);
    }
    const edited = PRESETS[1].replace("lütfen", "en kısa sürede lütfen");
    await su.query(R5, [ids.e, OWNER, true, false, edited]);
    ok((await row(ids.e)).m === edited, "düzenlenmiş hazır mesaj olduğu gibi saklanır");
    const html = `<script>alert('x')</script><b>Kalın</b> & "tırnak" <img src=x onerror=alert(1)>`;
    await su.query(R5, [ids.f, OWNER, true, false, html]);
    ok((await row(ids.f)).m === html, "HTML / betik metni DEĞİŞTİRİLMEDEN düz metin olarak saklanır (görüntülemede kaçışlanır)");
    const multi = "  Sayın uzman,\r\nödemeniz bekleniyor.\tTeşekkürler.  \n";
    await su.query(R5, [ids.g, OWNER, true, false, multi]);
    ok((await row(ids.g)).m === "Sayın uzman,\nödemeniz bekleniyor. Teşekkürler.", "normalleştirme: kırpma, \\r\\n → \\n, sekme → boşluk", (await row(ids.g)).m);
    // Sınırlar (yeni bir uzmanla; hata → hiçbir satır değişmez)
    const h = await mk("h");
    ok((await errCode(su, R5, [h, OWNER, true, false, "x".repeat(501)])) === "UY003" && (await row(h)).access_restricted_at === null, "501 karakter → UY003; kısıt da UYGULANMAZ (tek işlem)");
    ok((await errCode(su, R5, [h, OWNER, true, false, "ok\u0007zil"])) === "UY003" && (await row(h)).access_restricted_at === null, "kontrol karakteri → UY003; kısıt uygulanmaz");
    await su.query(R5, [h, OWNER, true, false, "y".repeat(500)]);
    ok((await row(h)).m.length === 500, "tam 500 karakter kabul edilir");
    const w = await mk("w");
    await su.query(R5, [w, OWNER, true, false, "   \n  "]);
    ok((await row(w)).m === null && (await row(w)).access_restricted_at !== null, "yalnız boşluk → mesaj NULL (standart uyarı)");
    ok((await errCode(su, R5, [w, OWNER, false, true, "aktif ederken mesaj"])) === "UY003" && (await row(w)).access_restricted_at !== null,
      "mesaj yalnız pasifleştirmede: Aktif Yap + mesaj → UY003, durum değişmez");
    ok((await errCode(su, R5, [ids.b, OWNER, true, true, "başka"])) === "OK" && (await row(ids.b)).m === PRESETS[0],
      "zaten pasif (idempotent) çağrı mesajı DEĞİŞTİRMEZ (düzenleme ayrı RPC)");

    // ── E) Sonradan düzenle / kaldır ─────────────────────────────────────────
    console.log("\n[E] Mesajı sonradan düzenle / kaldır");
    await su.query(MSG, [ids.a, OWNER, PRESETS[2], null]);
    ok((await row(ids.a)).m === PRESETS[2] && (await lastAudit(ids.a)).action === "user_access_message_set", "mesajsız pasife sonradan mesaj eklendi (audit: user_access_message_set)");
    await su.query(MSG, [ids.a, ADMIN2, "Güncellenmiş özel uyarı.", PRESETS[2]]);
    ok((await row(ids.a)).m === "Güncellenmiş özel uyarı.", "başka yetkili yönetici mesajı düzenledi");
    ok((await errCode(su, MSG, [ids.a, OWNER, "bayat", PRESETS[2]])) === "UY001" && (await row(ids.a)).m === "Güncellenmiş özel uyarı.", "bayat ekran (beklenen metin farklı) → UY001, değişmez");
    await su.query(MSG, [ids.a, OWNER, null, "Güncellenmiş özel uyarı."]);
    const la = await lastAudit(ids.a);
    ok((await row(ids.a)).m === null && la.action === "user_access_message_cleared" && la.old_value.message === "Güncellenmiş özel uyarı.",
      "mesaj kaldırıldı → standart uyarı (audit: cleared, eski metin kayıtta)");
    const nb = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1`, [ids.a])).rows[0].n;
    await su.query(MSG, [ids.a, OWNER, "", null]);
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1`, [ids.a])).rows[0].n === nb, "değişiklik yoksa audit YAZILMAZ (idempotent)");
    const act = await mk("act");
    ok((await errCode(su, MSG, [act, OWNER, "x", null])) === "UY002", "pasif olmayan uzmana mesaj → UY002");
    ok((await errCode(su, MSG, [ADMIN2, OWNER, "x", null])) === "UY002", "yönetici hedef → UY002");
    ok((await errCode(su, MSG, [ids.b, EXPERT_ACTOR, "x", PRESETS[0]])) === "42501", "uzman aktör → 42501");
    ok((await errCode(su, MSG, [ids.b, ADMIN_OFF, "x", PRESETS[0]])) === "42501", "pasif yönetici aktör → 42501");
    ok((await errCode(su, MSG, [OWNER, OWNER, "x", null])) === "UY003", "kendi hesabı → UY003");
    ok((await errCode(su, MSG, [ids.b, OWNER, "x".repeat(501), PRESETS[0]])) === "UY003" && (await row(ids.b)).m === PRESETS[0], "düzenlemede 501 karakter → UY003");

    // ── X) Aktif Yap mesajı temizler ─────────────────────────────────────────
    console.log("\n[X] Aktif Yap + yeniden pasifleştirme");
    const before = await row(ids.c);
    await su.query(R5, [ids.c, OWNER, false, true, null]);
    const after = await row(ids.c);
    ok(after.access_restricted_at === null && after.m === null, "Aktif Yap: kısıt VE mesaj birlikte temizlendi");
    ok(after.active === before.active && after.package_type === before.package_type && after.mp === before.mp && after.payment_status === before.payment_status,
      "Aktif Yap başka alan değiştirmez (paket / modül / ödeme / active aynen)");
    const ua = await lastAudit(ids.c);
    ok(ua.action === "user_access_unrestricted" && ua.old_value.message === PRESETS[1] && ua.new_value.message === null, "audit: unrestricted, eski mesaj kayıtta");
    await su.query(R5, [ids.c, OWNER, true, false, null]);
    ok((await row(ids.c)).m === null, "yeniden pasifleştirme (mesajsız): ESKİ MESAJ GERİ GELMEDİ");

    // ── K) CHECK ─────────────────────────────────────────────────────────────
    console.log("\n[K] CHECK");
    ok((await errCode(su, `update public.users set access_restriction_message='x' where id=$1`, [act])) === "23514", "pasif olmayan satırda mesaj → 23514");
    ok((await errCode(su, `update public.users set access_restriction_message='x' where id=$1`, [ADMIN2])) === "23514", "yönetici satırında mesaj → 23514");
    ok((await errCode(su, `update public.users set access_restriction_message=$2 where id=$1`, [ids.b, "z".repeat(501)])) === "23514", "501 karakter doğrudan yazım → 23514");
    ok((await errCode(su, `update public.users set access_restricted_at=null where id=$1`, [ids.b])) === "23514", "mesaj varken kısıt tek başına kaldırılamaz → 23514 (tutarlılık)");

    // ── A) Audit tam metin ───────────────────────────────────────────────────
    console.log("\n[A] Audit");
    const ra = (await su.query(`select new_value from public.admin_audit_log where target_user_id=$1 and action='user_access_restricted' order by created_at desc limit 1`, [ids.f])).rows[0];
    ok(ra?.new_value?.message === html, "Pasif Yap audit'i tam metni içerir (yalnız yönetici audit tablosu)");

    // ── C) Eşzamanlılık ──────────────────────────────────────────────────────
    console.log("\n[C] Eşzamanlılık");
    const c1 = await pool.connect(), c2 = await pool.connect();
    try {
      const n0 = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1`, [ids.d])).rows[0].n;
      const res = await Promise.all([
        errCode(c1 as unknown as Q, MSG, [ids.d, OWNER, "Birinci yönetici", PRESETS[2]]),
        errCode(c2 as unknown as Q, MSG, [ids.d, ADMIN2, "İkinci yönetici", PRESETS[2]]),
      ]);
      const n1 = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1`, [ids.d])).rows[0].n;
      ok(res.filter((r) => r === "OK").length === 1 && res.includes("UY001") && n1 === n0 + 1 && ["Birinci yönetici", "İkinci yönetici"].includes((await row(ids.d)).m),
        "aynı beklenen metinle iki düzenleme → tek başarı + UY001 + tek audit", res);
      const x = await mk("x");
      const r2 = await Promise.all([
        errCode(c1 as unknown as Q, R5, [x, OWNER, true, false, "A mesajı"]),
        errCode(c2 as unknown as Q, R5, [x, ADMIN2, true, false, "B mesajı"]),
      ]);
      const ax = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1 and action='user_access_restricted'`, [x])).rows[0].n;
      ok(r2.filter((r) => r === "OK").length === 1 && r2.includes("UY001") && ax === 1, "pasif yap ∥ pasif yap → tek değişiklik + tek audit", r2);
    } finally { c1.release(); c2.release(); }

    // ── I) İzolasyon + arşiv ─────────────────────────────────────────────────
    console.log("\n[I] İzolasyon + arşiv");
    const others = (await su.query(`select count(*)::int n from public.users where access_restriction_message = $1 and id <> $2`, [html, ids.f])).rows[0].n;
    ok(others === 0, "HTML mesajı yalnız ilgili uzmanın satırında");
    await su.query(`select public.admin_archive_user($1,$2)`, [ids.b, OWNER]);
    ok((await errCode(su, MSG, [ids.b, OWNER, "arşivde", PRESETS[0]])) === "UY005", "arşivdeki hesapta mesaj düzenlenemez (UY005)");
    ok((await row(ids.b)).m === PRESETS[0], "arşivleme mesajı silmez (kayıt korunur; giriş zaten kapalı)");
    const fin = await snap();
    ok(fin.c >= s0.c && fin.c === s0.c + 4, "danışan satırları korunur (silinen yok; +4 = sonradan oluşturulan sentetik uzmanlar)", { s0: s0.c, fin: fin.c });
  } finally {
    await db.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
