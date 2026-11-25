/**
 * GİRİŞ GÜVENLİĞİ F2-H — denetim kaydı saklama / kontrollü imha: UÇTAN UCA route harness'ı (GERÇEK PostgreSQL +
 * GERÇEK route'lar). Production'a SIFIR temas; sentetik kullanıcılar; SENTETİK süre / gerekçe (gerçek karar DEĞİL).
 * "Telefon" adımı = imzası doğrulanmış QR kararının DB adımı (auth_qr_decide).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2h-routes.harness.ts
 */
import fs from "node:fs";
import Module from "node:module";
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
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
function cookieFrom(res: Response, name: string): string {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return raw.slice(name.length + 1).split(";")[0];
  return "";
}

async function main() {
  // Statik: imha için zamanlayıcı / otomatik tetik YOK (migration, rota, sayfa).
  const files = ["supabase/migrations/20280103000800_auth_audit_retention_disposal_f2h.sql", "app/api/admin/retention/route.ts", "app/admin/denetim-saklama/page.tsx"];
  const src = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  ok(!/cron\.|pg_cron|schedule\(|setInterval\(|inngest|vercel\.json/i.test(src), "imha için zamanlayıcı / otomatik tetik YOK");
  ok(!fs.readFileSync("supabase/migrations/20280103000800_auth_audit_retention_disposal_f2h.sql", "utf8").match(/UPDATE public\.auth_audit_retention_policy SET retention_days = \d/),
    "migration hiçbir saklama süresi DAYATMAZ");

  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2h: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2h-harness", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2h-rate", LOGIN_IP_PEPPER: "f2h-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
      EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1", AUTH_OTP_PEPPER: "f2h-harness-pepper-0123456789abcdefghijklmnop",
    });
    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const stepUp = await import("@/app/api/admin/step-up/route");
    const retention = await import("@/app/api/admin/retention/route");
    let ip = 10;
    type Handler = (r: NextRequest) => Promise<Response>;
    const call = async (h: unknown, url: string, method: "GET" | "POST", body: unknown, headers: Record<string, string> = {}) => {
      const res = await (h as Handler)(new NextRequest(url, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...headers },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }));
      return { res, json: (await res.clone().json().catch(() => ({}))) as J, text: await res.clone().text() };
    };
    const L = "http://localhost";
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    const lastCode = (to: string) => /^([0-9]{6}) — /.exec([...syntheticOutbox()].reverse().find((m) => m.to === to)?.subject ?? "")?.[1] ?? "";
    const web = (bind: string) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });

    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [U.owner]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.owner}'; SELECT set_config('yasam.mfa_policy','off',false);`);
    const odev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, repeat('O',120), encode(sha256('owner-phone'::bytea),'hex'), 'OWNR-PHON', 'active', now()) RETURNING id`, [U.owner])).rows[0].id as string;
    const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email: EMAIL.owner, password: pw(EMAIL.owner) });
    const bind = cookieFrom(l.res, "__Host-yasam_mfa");
    const ch = String(l.json.challengeId);
    await call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, web(bind));
    await call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code: lastCode(EMAIL.owner) }, web(bind));
    const sid = cookieFrom((await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, web(bind))).res, "__Host-yasam_sid");
    const H = { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" };
    const proof = async (action: string, target: string) => {
      const b = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "begin", action, targetId: target }, H);
      const n = new URLSearchParams(new URL(String((b.json.qr as J).url)).hash.slice(1)).get("n");
      await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4)`, [b.json.challengeId, n, odev, (b.json.qr as J).matchCode]);
    };
    await q(`INSERT INTO public.auth_recovery_events (subject_user_id, actor_id, event, detail, created_at)
             SELECT $1, $1, 'code_used', '{"x":1}', now() - interval '400 days' FROM generate_series(1, 7)`, [U.owner]);

    const ov = await call(retention.GET, `${L}/api/admin/retention`, "GET", null, H);
    const pols = (ov.json.policies ?? []) as J[];
    ok(ov.res.status === 200 && pols.length === 3 && pols.every((p) => p.method === "karar_bekliyor" && p.retention_days === null), "varsayılan: 3 tablo karar bekliyor", ov.json);
    const pv0 = await call(retention.POST, `${L}/api/admin/retention`, "POST", { op: "preview", table: "auth_recovery_events" }, H);
    ok(pv0.res.status === 409 && pv0.json.code === "POLICY_UNDECIDED", "karar yokken önizleme / imha yok", pv0.json);
    const ps0 = await call(retention.POST, `${L}/api/admin/retention`, "POST",
      { op: "policy_set", table: "auth_recovery_events", retentionDays: 365, legalBasis: "Sentetik test gerekçesi — gerçek karar değil", method: "silme" }, H);
    ok(ps0.res.status === 403 && ps0.json.code === "STEP_UP_REQUIRED" && typeof ps0.json.target === "string", "politika kanıt ister", ps0.json);
    await proof("retention_policy", String(ps0.json.target));
    const ps = await call(retention.POST, `${L}/api/admin/retention`, "POST",
      { op: "policy_set", table: "auth_recovery_events", retentionDays: 365, legalBasis: "Sentetik test gerekçesi — gerçek karar değil", method: "silme" }, H);
    ok(ps.res.status === 200, "kanıtla politika", ps.json);
    const pv = await call(retention.POST, `${L}/api/admin/retention`, "POST", { op: "preview", table: "auth_recovery_events" }, H);
    ok(pv.res.status === 200 && pv.json.candidates === 7 && pv.json.confirm_text === "auth_recovery_events silme 7", "önizleme: sayı + onay metni", pv.json);
    ok(Number((await q(`SELECT count(*) n FROM public.auth_recovery_events WHERE created_at < now() - interval '300 days'`)).rows[0].n) === 7, "önizleme silmedi");
    const runId = String(pv.json.run_id);
    const wrong = await call(retention.POST, `${L}/api/admin/retention`, "POST", { op: "execute", runId, confirm: "auth_recovery_events silme 8" }, H);
    ok(wrong.res.status === 400 && wrong.json.code === "CONFIRM_MISMATCH", "onay metni birebir", wrong.json);
    const ex0 = await call(retention.POST, `${L}/api/admin/retention`, "POST", { op: "execute", runId, confirm: "auth_recovery_events silme 7" }, H);
    ok(ex0.json.code === "STEP_UP_REQUIRED" && ex0.json.target === runId, "imha ayrıca kanıt ister (hedef = çalıştırma)", ex0.json);
    await proof("retention_execute", runId);
    const ex = await call(retention.POST, `${L}/api/admin/retention`, "POST", { op: "execute", runId, confirm: "auth_recovery_events silme 7" }, H);
    ok(ex.res.status === 200 && ex.json.affected === 7, "imha tamamlandı (7)", ex.json);
    ok(Number((await q(`SELECT count(*) n FROM public.auth_recovery_events WHERE created_at < now() - interval '300 days'`)).rows[0].n) === 0, "yalnız süresi dolan satırlar silindi");
    const ov2 = await call(retention.GET, `${L}/api/admin/retention`, "GET", null, H);
    ok(((ov2.json.recentRuns ?? []) as J[]).some((r) => r.id === runId && r.state === "completed" && r.affected === 7), "işlem kayıtlı (kapsam + sayı)");
    ok(!ov2.text.includes('"x":1') && !ov2.text.includes("code_used"), "görünümde kayıt içeriği yok");
    const sf = await call(retention.POST, `${L}/api/admin/retention`, "POST",
      { op: "policy_set", table: "security_events", retentionDays: 365, legalBasis: "Sentetik test gerekçesi — gerçek karar değil", method: "anonimlestirme" }, H);
    ok(sf.res.status === 400 && sf.json.code === "METHOD_NOT_ALLOWED", "güvenlik olayları anonimleştirilemez (yalnız silme)", sf.json);
    const adm2 = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email: "admin2@test.local", password: pw("admin2@test.local") });
    const a2 = await call(retention.GET, `${L}/api/admin/retention`, "GET", null,
      { "x-admin-id": "00000000-0000-0000-0000-00000000a002", cookie: `__Host-yasam_sid=${cookieFrom(adm2.res, "__Host-yasam_sid")}`, "sec-fetch-site": "same-origin" });
    ok(a2.res.status === 403, "Owner olmayan yönetici göremez", a2.json);
  } finally {
    await db.close();
  }
  console.log(`\nf2h-routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
