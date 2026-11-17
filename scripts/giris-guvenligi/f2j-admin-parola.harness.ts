/**
 * GİRİŞ GÜVENLİĞİ F2-J (N1) — çalınmış Owner oturumuyla Owner PAROLASI TAHMİNİ: arşivden çıkarma / arşivleme / kalıcı
 * silme rotaları parolayı doğrular; yanıt farkı (403 "parola doğrulanamadı" ↔ başka yanıt) parola kahini olur.
 * Düzeltme: bu rotalar giriş ekranıyla AYNI kısıtlamalı doğrulamayı (auth_login_guarded) kullanır → kilit (429).
 *
 * Gerçek route'lar + gerçek PostgreSQL. auth_login_guarded burada SİMÜLASYONDUR (aynı yanıt sözleşmesi; e-posta başına
 * 15 dakikada 5 yanlışta kilit) — üretim fonksiyonunun eşikleri kendi testlerinde sınanır. verify_admin_login üretimdeki
 * gibi crypt karşılaştırmasıdır.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2j-admin-parola.harness.ts
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
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2j: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2j-n1", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2j-n1-rate", LOGIN_IP_PEPPER: "f2j-n1-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    });
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    // Üretimdeki verify_admin_login eşdeğeri + kısıtlamalı doğrulama SİMÜLASYONU (deneme kaydı + kilit).
    await q(`CREATE TABLE IF NOT EXISTS public.harness_guard_attempts (email text, ok boolean, at timestamptz DEFAULT clock_timestamp())`);
    await q(`CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email text, p_password text) RETURNS boolean
      LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $f$
        SELECT coalesce((SELECT u.password_hash = extensions.crypt(btrim(p_password), u.password_hash) AND u.role = 'admin' AND u.active
                           FROM public.users u WHERE lower(btrim(u.email)) = lower(btrim(p_email)) LIMIT 1), false) $f$;
      GRANT EXECUTE ON FUNCTION public.verify_admin_login(text, text) TO service_role;`);
    await q(`CREATE OR REPLACE FUNCTION public.auth_login_guarded(p_email text, p_password text, p_ip_hash text) RETURNS jsonb
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
      DECLARE v jsonb; n int;
      BEGIN
        SELECT count(*) INTO n FROM public.harness_guard_attempts
         WHERE email = lower(btrim(p_email)) AND NOT ok AND at > clock_timestamp() - interval '15 minutes';
        IF n >= 5 THEN RETURN jsonb_build_object('status', 'locked', 'retry_after', 900); END IF;
        SELECT jsonb_build_object('status', 'ok', 'user', jsonb_build_object('id', u.id, 'email', u.email, 'role', u.role, 'active', u.active))
          INTO v FROM public.users u
         WHERE lower(btrim(u.email)) = lower(btrim(p_email)) AND u.password_hash = extensions.crypt(p_password, u.password_hash) LIMIT 1;
        INSERT INTO public.harness_guard_attempts (email, ok) VALUES (lower(btrim(p_email)), v IS NOT NULL);
        RETURN coalesce(v, jsonb_build_object('status', 'invalid'));
      END $f$;
      GRANT EXECUTE ON FUNCTION public.auth_login_guarded(text, text, text) TO service_role;`);
    const sid = randomUUID();
    await q(`SELECT set_config('yasam.mfa_finalize','on',false)`);
    await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method)
             VALUES ($1, $2, true, 'desktop_web', 'admin', now() + interval '1 day', 'qr_device')`, [U.owner, sid]);
    await q(`SELECT set_config('yasam.mfa_finalize','off',false)`);
    const H = { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" };
    const routes = {
      unarchive: await import("@/app/api/admin/users/[id]/unarchive/route"),
      delete: await import("@/app/api/admin/users/[id]/delete/route"),
      purge: await import("@/app/api/admin/users/[id]/purge/route"),
    };
    let ip = 20;
    type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, body: unknown, id: string) => {
      const res = await (h as Handler)(new NextRequest(url, { method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...H },
        body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
      return { status: res.status, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost/api/admin/users";
    const right = pw(EMAIL.owner);

    // Saldırgan: çalınmış çerez + rastgele hedef; yalnız parola tahmin ediyor (IP her istekte farklı).
    const tries: number[] = [];
    for (let i = 0; i < 5; i++) tries.push((await call(routes.unarchive.POST, `${L}/x/unarchive`, { adminPassword: `yanlis-${i}` }, randomUUID())).status);
    ok(tries.every((s) => s === 403), "N1a ilk 5 yanlış deneme 403 (mevcut mesaj korunur)", tries);
    const locked = await call(routes.unarchive.POST, `${L}/x/unarchive`, { adminPassword: "yanlis-6" }, randomUUID());
    ok(locked.status === 429, "N1b 6. denemede KİLİT (429) — sınırsız tahmin yok", locked);
    const rightWhileLocked = await call(routes.unarchive.POST, `${L}/x/unarchive`, { adminPassword: right }, randomUUID());
    ok(rightWhileLocked.status === 429, "N1c kilit sürerken DOĞRU parola da 429 → yanıt farkı (kahin) yok", rightWhileLocked);
    const del = await call(routes.delete.POST, `${L}/x/delete`, { adminPassword: right }, randomUUID());
    const pur = await call(routes.purge.POST, `${L}/x/purge`, { adminPassword: right, confirmEmail: "x@y.z", finalPhrase: "KALICI OLARAK SİL" }, randomUUID());
    ok(del.status === 429 || del.status === 404, "N1d arşivleme rotası da aynı kilidi paylaşır (veya hedef yok)", del);
    const purChecked = pur.status === 429 || (pur.status >= 400 && pur.json.error !== "Yönetici parolası doğrulanamadı.");
    ok(purChecked, "N1e kalıcı silme rotası kahin vermez (kilit veya parola öncesi ret)", pur);
    const n = (await q(`SELECT count(*)::int AS n FROM public.harness_guard_attempts`)).rows[0].n as number;
    ok(n === 5, "N1f yalnız kilit öncesi denemeler kısıtlamalı doğrulamaya ulaştı (kilitte sayaç ilerlemez)", { n });

    // Meşru kullanım: kilit kalkınca doğru parola önceki gibi kabul edilir (yanıt: hedef yok / işlem yanıtı; 403 DEĞİL).
    await q(`DELETE FROM public.harness_guard_attempts`);
    const legit = await call(routes.unarchive.POST, `${L}/x/unarchive`, { adminPassword: right }, randomUUID());
    ok(legit.status !== 403 && legit.status !== 429, "N1g kilit yokken doğru parola kabul edilir (meşru akış bozulmadı)", legit);
  } finally {
    await db.close();
  }
  console.log(`\nf2j-admin-parola: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
