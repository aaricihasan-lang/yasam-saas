/**
 * PR #779 — ödeme route'u: YENİ muafiyete geçişte gerekçe zorunluluğu (Owner kararı 11.11.2026).
 * Gerçek route (app/api/admin/users/[id]/payment) → PostgREST shim → geçici embedded-postgres (360 zinciri). Sentetik ZZ_PEX_* verisi;
 * production'a temas YOK.
 *
 * Kural: önceki durum "exempt" DEĞİLKEN durum "exempt" yapılıyorsa payment_note boş / yalnız boşluk / null olamaz → 400,
 * kullanıcı satırı + ödeme geçmişi + audit DEĞİŞMEZ. Zaten muaf (eski) kayıtların diğer alan güncellemeleri ve
 * paid / pending / overdue davranışı değişmez; yetki kontrolleri aynen.
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb360 } from "../uye-yonetimi-360/testDb360";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 300)}`}`); }
}

const OWNER = "00000000-0000-4000-8000-00000000e7a1";
const ADMIN2 = "00000000-0000-4000-8000-00000000e7a2";
const EXPERT_SELF = "00000000-0000-4000-8000-00000000e7a3";
const TOK = { owner: "zz-pex-owner-token-00001", admin2: "zz-pex-admin2-token-0001", expert: "zz-pex-expert-token-0001" };

async function main(): Promise<void> {
  // Veri klasörü porta bağlı: kesilmiş eski koşunun yetim süreçleri ("pre-existing shared memory block") yeni koşuyu kilitlemez.
  const port = Number(process.env.PEX_PG_PORT ?? 54794);
  const db = await startTestDb360(port, `uye-detay-v2-payment-exempt-${port}`);
  const { su } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, role, sup] of [[OWNER, "admin", true], [ADMIN2, "admin", false], [EXPERT_SELF, "expert", false]] as [string, string, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id)
         values ($1,$2,$3,$4,true,'approved',$5,$6,$7)`,
        [id, `ZZ_PEX ${role}`, `zz.pex.${id.slice(-4)}@example.test`, role, sup, sup ? "owner" : role === "admin" ? "admin" : null, await tenant()],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4),($5,$6)`,
      [OWNER, TOK.owner, ADMIN2, TOK.admin2, EXPERT_SELF, TOK.expert]);

    shim = await startPgrestShim(db.pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const paymentRoute = await import("../../app/api/admin/users/[id]/payment/route");

    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    type Auth = { adminId?: string; token?: string };
    const asOwner: Auth = { adminId: OWNER, token: TOK.owner };
    const asAdmin2: Auth = { adminId: ADMIN2, token: TOK.admin2 };
    const asExpert: Auth = { adminId: EXPERT_SELF, token: TOK.expert };
    async function pay(id: string, draft: Record<string, unknown>, auth: Auth = asOwner) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      const req = new NextRequest(`http://localhost/api/admin/users/${id}/payment`, { method: "POST", headers, body: JSON.stringify({ draft }) });
      const res = await (paymentRoute.POST as unknown as Handler)(req, { params: Promise.resolve({ id }) });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
      return { status: res.status, json };
    }
    const draft = (o: Partial<Record<"status" | "note" | "agreedFee" | "billingPeriod" | "paidAmount" | "lastPaymentDate" | "nextPaymentDate", unknown>>) => ({
      status: "pending", lastPaymentDate: "", nextPaymentDate: "", paidAmount: "", note: "", agreedFee: "", billingPeriod: "", ...o,
    });
    const mkExpert = async (name: string, o: { status?: string | null; note?: string | null; fee?: number | null } = {}) => {
      const id = randomUUID();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, package_type, plan, payment_status, payment_note, agreed_fee, tenant_id)
         values ($1,$2,$3,'expert',true,'approved','premium','premium',$4,$5,$6,$7)`,
        [id, `ZZ_PEX ${name}`, `zz.pex.${id.slice(0, 8)}@example.test`, o.status ?? null, o.note ?? null, o.fee ?? null, await tenant()],
      );
      return id;
    };
    /** Kullanıcı satırının tam özeti + ödeme geçmişi + audit sayısı: reddedilen istekte HİÇBİRİ değişmemeli. */
    const snapshot = async (id: string) => {
      const u = (await su.query(`select md5(u::text) h, payment_status, payment_note, agreed_fee from public.users u where id=$1`, [id])).rows[0];
      const h = (await su.query(`select count(*)::int n from public.user_payment_history where user_id=$1`, [id])).rows[0].n;
      const a = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1`, [id])).rows[0].n;
      return { u, h, a };
    };
    const same = (x: Awaited<ReturnType<typeof snapshot>>, y: Awaited<ReturnType<typeof snapshot>>) => x.u.h === y.u.h && x.h === y.h && x.a === y.a;

    console.log("\n[1] YENİ muafiyet — gerekçesiz reddedilir, hiçbir şey yazılmaz");
    for (const [label, note] of [["boş", ""], ["yalnız boşluk", "   \t  "], ["null", null]] as [string, unknown][]) {
      const id = await mkExpert(`Bekleyen ${label}`, { status: "pending" });
      const before = await snapshot(id);
      const r = await pay(id, draft({ status: "exempt", note }));
      const after = await snapshot(id);
      ok(r.status === 400 && /gerekçe/i.test(String(r.json.error ?? "")), `bekliyor → muaf, gerekçe ${label} → 400 + açık hata`, r);
      ok(same(before, after), `gerekçe ${label}: kullanıcı satırı, ödeme geçmişi ve audit DEĞİŞMEDİ`, { before, after });
    }
    for (const [label, status] of [["ödendi", "paid"], ["gecikti", "overdue"], ["durum yok", null]] as [string, string | null][]) {
      const id = await mkExpert(`Önceki ${label}`, { status });
      const before = await snapshot(id);
      const r = await pay(id, draft({ status: "exempt", note: "" }));
      ok(r.status === 400 && same(before, await snapshot(id)), `${label} → muaf, gerekçesiz → 400, değişiklik yok`, r);
    }

    console.log("\n[2] YENİ muafiyet — gerekçeli kayıt eskisi gibi");
    {
      const id = await mkExpert("Gerekçeli", { status: "pending" });
      const before = await snapshot(id);
      const r = await pay(id, draft({ status: "exempt", note: "  Kurucu ekip · Owner kararı (sentetik)  " }));
      const after = await snapshot(id);
      ok(r.status === 200 && r.json.changed === true, "gerekçeli muafiyet → 200", r);
      ok(after.u.payment_status === "exempt" && after.u.payment_note === "Kurucu ekip · Owner kararı (sentetik)", "durum exempt + gerekçe payment_note'ta (kırpılmış)", after.u);
      ok(after.h === before.h + 1, "ödeme geçmişine tek satır", { before: before.h, after: after.h });
      const hist = (await su.query(`select payment_status, payment_note from public.user_payment_history where user_id=$1 order by created_at desc limit 1`, [id])).rows[0];
      ok(hist.payment_status === "exempt" && hist.payment_note === "Kurucu ekip · Owner kararı (sentetik)", "geçmiş satırında durum + gerekçe", hist);
      const aud = (await su.query(`select action from public.admin_audit_log where target_user_id=$1 order by created_at desc limit 1`, [id])).rows[0];
      ok(after.a === before.a + 1 && aud?.action === "payment_status_changed", "yönetim geçmişi (audit) yazıldı", aud);
    }

    console.log("\n[3] Eski muaf kayıtlar (gerekçesiz) — ilgisiz alan güncellemesi ENGELLENMEZ");
    {
      const id = await mkExpert("Eski muaf gerekçesiz", { status: "exempt", note: null });
      const r = await pay(id, draft({ status: "exempt", note: "", agreedFee: "1500" }));
      const u = (await snapshot(id)).u;
      ok(r.status === 200 && Number(u.agreed_fee) === 1500 && u.payment_status === "exempt", "muaf kalır + anlaşılan ücret güncellendi → 200", { r, u });
      const r2 = await pay(id, draft({ status: "paid", note: "", lastPaymentDate: "2026-11-01", nextPaymentDate: "2026-12-01", paidAmount: "1500", agreedFee: "1500" }));
      ok(r2.status === 200 && (await snapshot(id)).u.payment_status === "paid", "eski muaf → ödendi (gerekçe gerekmez) → 200", r2);
      const r3 = await pay(id, draft({ status: "exempt", note: "", agreedFee: "1500" }));
      ok(r3.status === 400, "artık muaf değil → tekrar muafa geçiş YENİ muafiyettir → gerekçesiz 400", r3);
    }
    {
      const id = await mkExpert("Eski muaf gerekçeli", { status: "exempt", note: "Eski gerekçe" });
      const r = await pay(id, draft({ status: "exempt", note: "Eski gerekçe", agreedFee: "900" }));
      ok(r.status === 200 && Number((await snapshot(id)).u.agreed_fee) === 900, "gerekçeli eski muafın ücret güncellemesi → 200", r);
    }

    console.log("\n[4] Ödendi / bekliyor / gecikti davranışı değişmedi (not boş olabilir)");
    for (const [from, to] of [["pending", "paid"], ["paid", "overdue"], ["overdue", "pending"], [null, "pending"]] as [string | null, string][]) {
      const id = await mkExpert(`${from}→${to}`, { status: from });
      const body = to === "paid"
        ? draft({ status: to, note: "", lastPaymentDate: "2026-11-01", nextPaymentDate: "2026-12-01", paidAmount: "1500" })
        : draft({ status: to, note: "" });
      const r = await pay(id, body);
      ok(r.status === 200 && (await snapshot(id)).u.payment_status === to, `${from ?? "boş"} → ${to}, not boş → 200`, r);
    }

    console.log("\n[5] Yetki kontrolleri korunur");
    {
      const id = await mkExpert("Yetki", { status: "pending" });
      const before = await snapshot(id);
      const e = await pay(id, draft({ status: "exempt", note: "x" }), asExpert);
      ok((e.status === 401 || e.status === 403) && same(before, await snapshot(id)), "uzman oturumu ödeme yazamaz", e);
      const n = await pay(id, draft({ status: "exempt", note: "x" }), {});
      ok((n.status === 401 || n.status === 403) && same(before, await snapshot(id)), "oturumsuz istek reddedilir", n);
      const a0 = await pay(id, draft({ status: "exempt", note: "" }), asAdmin2);
      ok(a0.status === 400 && same(before, await snapshot(id)), "yardımcı yönetici de gerekçesiz yeni muafiyet yapamaz (400)", a0);
      const a1 = await pay(id, draft({ status: "exempt", note: "Yardımcı yönetici gerekçesi" }), asAdmin2);
      ok(a1.status === 200, "yardımcı yönetici gerekçeli muafiyeti uzman için yapabilir (bugünkü yetki aynen)", a1);
      const adm = await pay(ADMIN2, draft({ status: "exempt", note: "y" }), asAdmin2);
      ok(adm.status === 403, "yönetici hedefinde yalnız ana yönetici (requireMainAdminForAdminTarget) aynen", adm);
      const bad = await pay("not-a-uuid", draft({ status: "exempt", note: "y" }));
      ok(bad.status === 400, "geçersiz kullanıcı kimliği → 400", bad);
    }
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nÖDEME MUAFİYET GEREKÇESİ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("Başarısız:", failures); process.exit(1); }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
