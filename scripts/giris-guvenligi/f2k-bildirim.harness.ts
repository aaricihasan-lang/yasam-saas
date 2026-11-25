/**
 * GİRİŞ GÜVENLİĞİ F2-K (L4) — güvenlik bildirimi: kota ayrımı + sessiz düşme yok. (+ AUTH_MFA_EMAIL_ROLES "owner" kapsamı.) Gerçek PostgreSQL (PostgREST
 * benzeri shim) + SAHTE e-posta sağlayıcısı (gerçek Gmail gönderimi YOK).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2k-bildirim.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

async function main() {
  const { startF2cDb, U } = await import("./testDb");
  const db = await startF2cDb({ withF2k: true });
  try {
    const { sendSecurityNotice } = await import("@/lib/auth/securityNotice");
    const client = createClient(db.shimUrl, "f2k-l4", { auth: { persistSession: false } });
    const q = (sql: string, a: unknown[] = []) => db.admin.query(sql, a);
    const ENV = { AUTH_OTP_PEPPER: "p".repeat(40), EMAIL_DAILY_LIMIT: "1000", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,expert" /* F3: uzmana bildirim kapsamı açık */ };
    const sent: string[] = [];
    const provider = (okSend: boolean) => ({
      name: "synthetic" as const,
      async send(m: { to: string }) {
        sent.push(m.to);
        return okSend ? { ok: true as const, providerMessageId: "x" } : { ok: false as const, code: "provider_down", retryable: true };
      },
    });
    const undelivered = async (reason: string) =>
      Number((await q(`SELECT count(*) n FROM public.security_events WHERE user_id = $1 AND event_type = 'security_notice_undelivered' AND metadata->>'reason' = $2`, [U.exp, reason])).rows[0].n);

    // Normal gönderim.
    const r1 = await sendSecurityNotice(client, { userId: U.exp, to: "uzman@ornek.test", kind: "recovery_login" }, ENV, provider(true) as never);
    ok(r1 === true && sent.length === 1, "kota boşken bildirim gönderilir", { r1, sent: sent.length });
    // Sağlayıcı hatası → sessiz düşmez.
    const r2 = await sendSecurityNotice(client, { userId: U.exp, to: "uzman@ornek.test", kind: "recovery_login" }, ENV, provider(false) as never);
    ok(r2 === false && (await undelivered("provider_down")) === 1, "gönderim hatası güvenlik olayına yazılır", r2);
    // Yapılandırma yok → kaydedilir.
    const r3 = await sendSecurityNotice(client, { userId: U.exp, to: "uzman@ornek.test", kind: "recovery_login" }, {}, null);
    ok(r3 === false && (await undelivered("not_configured")) === 1, "sağlayıcı / pepper yoksa güvenlik olayına yazılır", r3);
    // Kota %80 doldu → bildirim GÖNDERİLMEZ (giriş kodlarına pay kalır) ve kaydedilir.
    const n = Number((await q(`SELECT count(*) n FROM public.auth_email_deliveries WHERE created_at > now() - interval '24 hours' AND state IN ('reserved','sent')`)).rows[0].n);
    const before = sent.length;
    const r4 = await sendSecurityNotice(client, { userId: U.exp, to: "uzman@ornek.test", kind: "recovery_login" },
      { ...ENV, EMAIL_DAILY_LIMIT: String(Math.max(1, Math.floor(n / 0.8))) }, provider(true) as never);
    ok(r4 === false && sent.length === before && (await undelivered("quota_reserved")) === 1,
      "kotanın %80'i dolunca bildirim gönderilmez, kayıt düşer (giriş kodu payı korunur)", { r4, n });
    ok(Number((await q(`SELECT count(*) n FROM public.security_events WHERE event_type = 'security_notice_undelivered' AND metadata::text LIKE '%@%'`)).rows[0].n) === 0,
      "kayıtlarda e-posta adresi yok");

    // AUTH_MFA_EMAIL_ROLES "owner" kapsamı: e-posta yöntemi YALNIZ Owner'a; başka yöneticiye açılmaz.
    const { emailOtpAllowedForUser } = await import("@/lib/auth/emailOtp");
    await q(`SELECT set_config('yasam.admin_grant','on',false);
      INSERT INTO public.users (id, email, role, tenant_id, active, approval_status)
      SELECT '00000000-0000-0000-0000-00000000ad02', 'ikinci-yonetici@test.local', 'admin', tenant_id, true, 'approved' FROM public.users WHERE id = '${U.owner}';
      SELECT set_config('yasam.admin_grant','off',false);`);
    const OTHER = "00000000-0000-0000-0000-00000000ad02";
    ok(!(await emailOtpAllowedForUser(client, U.owner, "admin", { AUTH_MFA_EMAIL_ROLES: "expert" })), "varsayılan (expert): Owner'a e-posta yöntemi YOK");
    ok(await emailOtpAllowedForUser(client, U.owner, "admin", { AUTH_MFA_EMAIL_ROLES: "expert,owner" }), "expert,owner: Owner'a e-posta yöntemi VAR");
    ok(!(await emailOtpAllowedForUser(client, OTHER, "admin", { AUTH_MFA_EMAIL_ROLES: "expert,owner" })), "expert,owner: başka yöneticiye e-posta yöntemi YOK");
    ok(await emailOtpAllowedForUser(client, U.exp, "expert", { AUTH_MFA_EMAIL_ROLES: "expert,owner" }), "expert,owner: uzmana e-posta yöntemi VAR");
    ok(!(await emailOtpAllowedForUser(client, U.exp, "expert", { AUTH_MFA_EMAIL_ROLES: "owner" })), "owner: uzmana e-posta yöntemi YOK");
    const broken = { rpc: async () => ({ data: null, error: { message: "x" } }) };
    ok(!(await emailOtpAllowedForUser(broken, U.owner, "admin", { AUTH_MFA_EMAIL_ROLES: "owner" })), "Owner sorgusu hata verirse kapalı (fail-closed)");
  } finally {
    await db.close();
  }
  console.log(`\nf2k-bildirim: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
