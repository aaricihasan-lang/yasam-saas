/**
 * GİRİŞ GÜVENLİĞİ F2-K (O1) — QR onayı: 6 haneli YAZILAN kod. Gerçek route'lar (giriş, QR okuma, QR karar) + gerçek
 * PostgreSQL + gerçek P-256 imzaları (telefonun test temsili; fiziksel Keystore / biyometri DEĞİL).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2k-qr.harness.ts
 */
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
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

async function main() {
  const { startF2cDb, U, EMAIL, pw, newPhone, signWith } = await import("./testDb");
  const db = await startF2cDb({ withF2k: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2k-o1", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2k-o1-rate", LOGIN_IP_PEPPER: "f2k-o1-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device", AUTH_MFA_METHOD_SCOPE: "all",
    });
    const { qrFetchMessage, qrDecideMessage } = await import("@/lib/auth/deviceSignature");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const fetchRoute = await import("@/app/api/auth/mfa/qr/fetch/route");
    const decideRoute = await import("@/app/api/auth/mfa/qr/decide/route");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 60;
    type Handler = (r: NextRequest) => Promise<Response>;
    const post = async (h: unknown, url: string, body: unknown, headers: Record<string, string> = {}) => {
      const res = await (h as Handler)(new NextRequest(url, { method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, "sec-fetch-site": "same-origin", ...headers },
        body: JSON.stringify(body) }));
      return { status: res.status, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost";
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.exp}'; SELECT set_config('yasam.mfa_policy','off',false);`);
    const phone = newPhone();
    phone.deviceId = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, $2, encode(sha256(convert_to($2::text,'UTF8')),'hex'), 'QQQQ-RRRR', 'active', now()) RETURNING id`, [U.exp, phone.spki])).rows[0].id as string;
    const ts = () => Math.floor(Date.now() / 1000);
    const start = async () => {
      const l = await post(sessionRoute.POST, `${L}/api/auth/session`, { email: EMAIL.exp, password: pw(EMAIL.exp) });
      const url = String((l.json.qr as J | undefined)?.url ?? "");
      const frag = new URLSearchParams(url.split("#")[1] ?? "");
      return { challengeId: String(l.json.challengeId), nonce: frag.get("n") ?? "", code: String((l.json.qr as J | undefined)?.matchCode ?? "") };
    };
    const fetchQr = (c: { challengeId: string; nonce: string }) => {
      const t = ts();
      return post(fetchRoute.POST, `${L}/api/auth/mfa/qr/fetch`, { challengeId: c.challengeId, qrNonce: c.nonce, deviceId: phone.deviceId, ts: t,
        signature: signWith(phone, qrFetchMessage(c.challengeId, c.nonce, phone.deviceId!, t)) });
    };
    const decide = (c: { challengeId: string; nonce: string }, code: string, signer = phone) => {
      const t = ts();
      return post(decideRoute.POST, `${L}/api/auth/mfa/qr/decide`, { challengeId: c.challengeId, qrNonce: c.nonce, deviceId: phone.deviceId,
        decision: "approve", matchCode: code, ts: t, signature: signWith(signer, qrDecideMessage(c.challengeId, c.nonce, phone.deviceId!, "approve", code, t)) });
    };
    const state = async (id: string) => (await q(`SELECT state FROM public.auth_mfa_challenges WHERE id = $1`, [id])).rows[0]?.state;

    const a = await start();
    ok(/^[0-9]{6}$/.test(a.code), "tarayıcı 6 haneli kod gösterir", a.code);
    const f = await fetchQr(a);
    ok(f.status === 200 && f.json.matchMode === "typed6" && Array.isArray(f.json.options) && (f.json.options as unknown[]).length === 0 && f.json.purpose === "login",
      "telefon 'typed6' kipi alır; seçenek listesi YOK (kod telefona sızmaz); amaç = giriş", f.json);
    // Saldırgan: telefon anahtarı olmadan doğru kodla onay → imza reddi.
    const attacker = newPhone();
    const forged = await decide(a, a.code, attacker);
    ok(forged.status === 400 && forged.json.code === "BAD_SIGNATURE" && (await state(a.challengeId)) === "pending",
      "kod tek faktör DEĞİL: telefon anahtarı olmadan doğru kod reddedilir", forged.json);
    // Eski 2 haneli biçim yeni istekte geçmez (yanlış kod sayılır → kapanır).
    const b = await start();
    const c = await start();
    const two = await decide(b, a.code.slice(0, 2));
    ok(two.json.result === "denied" && (await state(b.challengeId)) === "denied" && (await state(c.challengeId)) === "denied" && (await state(a.challengeId)) === "denied",
      "yanlış kod: istek reddedilir VE kullanıcının bütün açık QR istekleri kapanır (paralel oltalama)", { two: two.json });
    // Meşru: kodu doğru yazan kullanıcı onaylar; aynı karar ikinci kez kullanılamaz.
    const d = await start();
    const okd = await decide(d, d.code);
    ok(okd.status === 200 && okd.json.result === "approved", "meşru: doğru yazılan 6 haneli kod + telefon imzası → onay", okd.json);
    const again = await decide(d, d.code);
    ok(again.status === 404, "aynı istek ikinci kez onaylanamaz", again);
    const bad = await post(decideRoute.POST, `${L}/api/auth/mfa/qr/decide`, { challengeId: d.challengeId, qrNonce: d.nonce, deviceId: phone.deviceId, decision: "approve", matchCode: "12a456", ts: ts(), signature: "x" });
    ok(bad.status === 400 || bad.status === 404, "biçim dışı kod (harf) reddedilir", bad);
  } finally {
    await db.close();
  }
  console.log(`\nf2k-qr: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
