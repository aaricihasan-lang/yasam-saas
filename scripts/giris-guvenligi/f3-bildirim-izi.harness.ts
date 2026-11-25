/**
 * GİRİŞ GÜVENLİĞİ F3 (yayın sonrası denetim) — kapsam kontrolü güvenlik BİLDİRİMİNİ durdurduğunda güvenlik KAYDI ve GİRİŞ korunur mu?
 * Gerçek route'lar + gerçek PostgreSQL (en güncel F2 zinciri) + sentetik e-posta. Production / gerçek hesap YOK.
 *
 * Kapsam kontrolünün etkilediği bildirim türleri (lib/auth/securityNotice çağrıları): recovery_case_opened, recovery_case_executed,
 * recovery_login, owner_offline_login, recovery_codes_generated, email_changed_old. Hepsinde güvenlik kararı ve denetim kaydı
 * (auth_recovery_events + security_events) bildirimden ÖNCE veritabanı fonksiyonunda yazılır; bildirim "en iyi çaba"dır.
 *
 * Burada en sık yol sınanır: MFA zorunlu bir UZMAN kurtarma koduyla giriş yapar (varsayılan kapsam = yalnız Owner):
 *   · giriş TAMAMLANIR (oturum açılır, mfa_method=recovery_code) — kapsam girişi etkilemez;
 *   · auth_recovery_events 'code_used' + security_events 'recovery_code_used' YAZILIR (denetim kaybolmaz);
 *   · e-posta GİTMEZ; security_events 'security_notice_undelivered' reason=scope_closed kind=recovery_login YAZILIR;
 *   · kapsam owner,expert yapılınca AYNI akışta bildirim uzmana GİDER (tek fark kapsamdır);
 *   · Owner'ın çevrimdışı kit girişinde bildirim varsayılan kapsamda Owner'a GİDER.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-bildirim-izi.harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
const ORIGIN = "https://www.yasamsistemi.com";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f3-izi-")), "eposta.jsonl");
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f3-izi", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f3-izi-rate", LOGIN_IP_PEPPER: "f3-izi-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: "f3-izi-pepper-0123456789abcdefghijklmnop",
    });
    delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES;
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const recoveryVerify = await import("@/app/api/auth/mfa/recovery/verify/route");
    const { generateRecoveryCodes, normalizeRecoveryCode, hashRecoveryCode, formatRecoveryCode } = await import("@/lib/auth/recoveryCodes");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 60;
    type H = (r: NextRequest) => Promise<Response>;
    const call = async (h: unknown, url: string, body: unknown, headers: Record<string, string> = {}) => {
      const res = await (h as H)(new NextRequest(`${ORIGIN}${url}`, { method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ip++ % 250}`, "user-agent": WEB_UA, origin: ORIGIN, "sec-fetch-site": "same-origin", ...headers },
        body: JSON.stringify(body) }));
      const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      return { status: res.status, json: (await res.clone().json().catch(() => ({}))) as J, set };
    };
    const cookieVal = (set: string[], name: string) => (set.find((c) => c.startsWith(`${name}=`)) ?? "").split(";")[0].split("=").slice(1).join("=");
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string }); } catch { return []; } };
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const recoveryLogin = async (email: string, code: string) => {
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE state IN ('pending','verified')`);
      const l = await call(sessionRoute.POST, "/api/auth/session", { email, password: pw(email) });
      const bind = cookieVal(l.set, "__Host-yasam_mfa");
      const v = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", { challengeId: l.json.challengeId, code }, { cookie: `__Host-yasam_mfa=${bind}` });
      const c = await call(completeRoute.POST, "/api/auth/mfa/complete", { challengeId: l.json.challengeId }, { cookie: `__Host-yasam_mfa=${bind}` });
      return { l, v, c, sid: cookieVal(c.set, "__Host-yasam_sid") };
    };

    // Fikstür: uzman MFA zorunlu + 2 kurtarma kodu (yalnız sentetik DB; tetikleyiciler bu kurulum için tek işlemde devre dışı).
    const codes = generateRecoveryCodes(2).map(formatRecoveryCode);
    const hashes = codes.map((c) => hashRecoveryCode(U.exp, normalizeRecoveryCode(c)!));
    await q(`BEGIN; SET LOCAL session_replication_role = replica;
             UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${U.exp}';
             INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash) VALUES
               ('${U.exp}', 'user', gen_random_uuid(), '${hashes[0]}'), ('${U.exp}', 'user', gen_random_uuid(), '${hashes[1]}');
             COMMIT;`);

    console.log("── 1) Varsayılan kapsam (yalnız Owner): MFA zorunlu UZMAN kurtarma koduyla giriş");
    {
      const before = mails().length;
      const r = await recoveryLogin(EMAIL.exp, codes[0]);
      ok(r.l.status === 202 && (r.l.json.methods as string[] | undefined)?.includes("recovery_code") === true, "parola → 202, kurtarma kodu sunuldu", { s: r.l.status, m: r.l.json.methods });
      ok(r.v.status === 200 && r.c.status === 200 && !!r.sid, "kurtarma kodu doğrulandı, OTURUM AÇILDI (kapsam girişi etkilemedi)", { v: r.v.status, c: r.c.status });
      const m = (await q(`SELECT mfa_method, is_active FROM public.user_sessions WHERE session_token = $1`, [r.sid])).rows[0];
      ok(m?.mfa_method === "recovery_code" && m?.is_active === true, "oturum MFA kanıtı recovery_code, etkin", m);
      ok(await n(`SELECT count(*)::int n FROM public.auth_recovery_events WHERE subject_user_id = $1 AND event = 'code_used'`, [U.exp]) === 1, "auth_recovery_events 'code_used' YAZILDI (denetim kaybolmadı)");
      ok(await n(`SELECT count(*)::int n FROM public.security_events WHERE user_id = $1 AND event_type = 'recovery_code_used'`, [U.exp]) === 1, "security_events 'recovery_code_used' YAZILDI");
      const und = (await q(`SELECT metadata->>'kind' AS k, metadata->>'reason' AS r FROM public.security_events WHERE user_id = $1 AND event_type = 'security_notice_undelivered' ORDER BY id DESC LIMIT 1`, [U.exp])).rows[0];
      ok(und?.k === "recovery_login" && und?.r === "scope_closed", "bildirim gitmedi → 'security_notice_undelivered' kind=recovery_login reason=scope_closed", und);
      ok(mails().length === before && await n(`SELECT count(*)::int n FROM public.auth_email_deliveries WHERE user_id = $1`, [U.exp]) === 0, "uzmana e-posta GİTMEDİ, kota harcanmadı");
    }

    console.log("── 2) Kapsam owner,expert: AYNI akış bildirimi uzmana gönderir (tek fark kapsam)");
    {
      process.env.AUTH_EMAIL_SELF_SERVICE_ROLES = "owner,expert";
      const before = mails().length;
      const r = await recoveryLogin(EMAIL.exp, codes[1]);
      ok(r.c.status === 200 && !!r.sid, "giriş yine tamamlandı");
      const got = mails().slice(before);
      ok(got.length === 1 && got[0].to === EMAIL.exp, "güvenlik bildirimi uzmana GİTTİ", got.map((x) => x.to));
      delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES;
    }

    console.log("── 3) Owner çevrimdışı kit girişi (varsayılan kapsam): bildirim Owner'a GİDER");
    {
      const kit = (await q(`SELECT * FROM public.auth_owner_offline_kit_issue() AS c`)).rows.map((x: { c: string }) => x.c);
      await q(`BEGIN; SET LOCAL session_replication_role = replica; UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${U.owner}'; COMMIT;`);
      const before = mails().length;
      const r = await recoveryLogin(EMAIL.owner, kit[0]);
      const got = mails().slice(before);
      ok(r.c.status === 200 && !!r.sid, "Owner kit koduyla giriş tamamlandı");
      ok(got.length === 1 && got[0].to === EMAIL.owner, "owner_offline_login bildirimi Owner'a GİTTİ", got.map((x) => x.to));
      ok(await n(`SELECT count(*)::int n FROM public.auth_recovery_events WHERE subject_user_id = $1 AND event = 'owner_offline_used'`, [U.owner]) === 1, "Owner denetim kaydı 'owner_offline_used' yazıldı");
    }
  } finally {
    await db.close();
  }
  console.log(`\nf3-bildirim-izi: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f3-bildirim-izi HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf3-bildirim-izi: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
