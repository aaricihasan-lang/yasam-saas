/**
 * GİRİŞ GÜVENLİĞİ F2-J (L1) — adres doğrulama kodu ile adres değişikliği arasındaki YARIŞ: kod eski adrese (A) gitmiş,
 * adres bu arada B olmuşsa, A'ya giden kod B'yi doğrulamamalı. Gerçek route + gerçek PostgreSQL; sentetik sağlayıcı.
 * Yarış penceresi, rotanın adresi okuduğu an ile kod üretimi arasındadır; test bu sırayı deterministik kurar.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2j-eposta.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

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
type J = Record<string, unknown>;

async function main() {
  const { startF2cDb, U } = await import("./testDb");
  const db = await startF2cDb({ withF2j: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2j-l1", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2j-l1-rate", EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1",
      AUTH_OTP_PEPPER: "f2j-l1-pepper-0123456789abcdefghijklmnopqrstu",
    });
    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const { issueAndSendOtp } = await import("@/lib/auth/emailOtp");
    const { getServerDb } = await import("@/lib/supabase-server");
    const route = await import("@/app/api/me/email-verification/route");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    const A = "l1-eski@example.test";
    const B = "l1-yeni@example.test";
    await q(`UPDATE public.users SET email = $2, email_verified_at = NULL WHERE id = $1`, [U.exp, A]);
    const sid = randomUUID();
    await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at)
             VALUES ($1, $2, true, 'desktop_web', 'expert', now() + interval '1 day')`, [U.exp, sid]);
    const H = { "x-user-id": U.exp, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin", "content-type": "application/json" };
    const post = async (body: J) => {
      const res = await route.POST(new NextRequest("http://localhost/api/me/email-verification", { method: "POST", headers: H, body: JSON.stringify(body) }));
      return { status: res.status, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const codeTo = (to: string) => /^([0-9]{6}) — /.exec([...syntheticOutbox()].reverse().find((m) => m.to === to)?.subject ?? "")?.[1] ?? "";

    // Yarış: rota adresi A olarak okudu; yönetici adresi B yaptı (değişiklik tetikleyicisi o anda bekleyen kod
    // bulamaz); ardından kod A için üretildi ve A'ya gitti.
    await q(`UPDATE public.users SET email = $2 WHERE id = $1`, [U.exp, B]);
    const issued = await issueAndSendOtp(getServerDb(), { userId: U.exp, email: A, purpose: "verify_email", challengeId: null });
    ok(issued.ok === true && codeTo(A).length === 6, "kurulum: kod eski adrese (A) gönderildi", issued);
    const c = await post({ action: "confirm", code: codeTo(A) });
    const v = (await q(`SELECT email, email_verified_at FROM public.users WHERE id = $1`, [U.exp])).rows[0];
    ok(c.status === 400 && v.email_verified_at === null, "L1a A'ya giden kod B'yi DOĞRULAMAZ (adres doğrulanmadı)", { c, v });

    // Meşru akış: B'ye kod iste → B'deki kodla doğrula.
    await new Promise((r) => setTimeout(r, 10));
    await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes' WHERE user_id = $1`, [U.exp]); // tekrar gönderme bekleme süresi
    const s = await post({ action: "send" });
    ok(s.status === 200 && codeTo(B).length === 6, "L1b yeni adrese (B) kod gönderildi", s);
    const ok2 = await post({ action: "confirm", code: codeTo(B) });
    const v2 = (await q(`SELECT email_verified_at FROM public.users WHERE id = $1`, [U.exp])).rows[0];
    ok(ok2.status === 200 && ok2.json.verified === true && v2.email_verified_at !== null, "L1c B'ye giden kod B'yi doğrular (meşru akış bozulmadı)", ok2);
  } finally {
    await db.close();
  }
  console.log(`\nf2j-eposta: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
