/**
 * HTTPONLY — ANDROID FİZİKSEL / EMÜLATÖR KABUL ORTAMI (izole; production'a SIFIR temas; sentetik hesaplar).
 *
 * Ne kurar:
 *   - Gömülü PostgreSQL + F2-A…F2-K migration zinciri + sentetik hesaplar (testDb.ts).
 *   - `next start` (bu ağacın production build'i) — SESSION_COOKIE_MODE=primary, sahte gizli değerler.
 *   - HTTPS 443: `yasamsistemi.com` → 307 → `https://www.yasamsistemi.com` (canlıdaki gibi); `www` → uygulama.
 *     Sertifika, bu betiğin ürettiği TEST CA'sı ile imzalıdır (cihaza/emülatöre yalnız test için yüklenir).
 *   - Kontrol ucu (YALNIZ 127.0.0.1:3999): kip değiştirme (DB korunur), oturum listesi, eski süresiz oturum taklidi,
 *     başka cihazdan iptal taklidi. E-posta doğrulama kodları konsola yazılır (sentetik sağlayıcı).
 *   - İsteğe bağlı DNS (KABUL_DNS=1, UDP 53): yalnız yasamsistemi.com / www → bu bilgisayarın LAN IP'si; diğer adlar 1.1.1.1.
 *
 * Ön koşul: bu ağaçta `next build --webpack` (f2c-ui.e2e.ts başlığındaki sahte env ile); OpenSSL (Git Bash).
 * Çalıştır (build kökünde): npx tsx scripts/giris-guvenligi/android-kabul-ortami.ts <kalıcı-dizin>
 *   ANDROID_KIP=header|cookie (başlangıç, varsayılan header = bugünkü canlı)  KABUL_HTTPS_PORT=443  KABUL_DNS=1
 *   Emülatör: KABUL_DNS=1 KABUL_DNS_BIND=127.0.0.1 KABUL_DNS_IP=10.0.2.2 + `emulator -dns-server 127.0.0.1` (sistem DNS / hosts DEĞİŞMEZ).
 *   Her yanıt `x-kabul-ortami: izole-test` başlığı taşır (cihazın production'a değil bu ortama bağlandığının kanıtı).
 *   `/_kabul/indir` YALNIZ bu ortamda: geçerli HttpOnly oturum çereziyle küçük bir .docx eki döner (native DownloadManager'ın
 *   çerezi taşıyıp taşımadığını ölçmek için; uygulamanın Word üretimini TEST ETMEZ). Çerez değeri loglanmaz.
 *   Paralel testlerle port çakışmasında: KABUL_SUPA_PORT (build'deki NEXT_PUBLIC_SUPABASE_URL portu), KABUL_APP_PORT, KABUL_CTRL_PORT
 * Kontrol:  curl -X POST "http://127.0.0.1:3999/kip?android=cookie&killswitch=off"   ·  curl http://127.0.0.1:3999/durum
 *           curl http://127.0.0.1:3999/oturumlar  ·  curl -X POST http://127.0.0.1:3999/eski-suresiz
 *           curl -X POST "http://127.0.0.1:3999/iptal?kanal=android_app"
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { startF2cDb, U, EMAIL, pw } from "./testDb";

const DIR = process.argv[2];
if (!DIR) { console.log("kalıcı dizin gerekli (CA burada tutulur; aynı CA ile tekrar başlatılabilir)"); process.exit(2); }
fs.mkdirSync(DIR, { recursive: true });
const APP_PORT = Number(process.env.KABUL_APP_PORT ?? 3993);
const SUPA_PROXY_PORT = Number(process.env.KABUL_SUPA_PORT ?? 54398); // build'e gömülü NEXT_PUBLIC_SUPABASE_URL ile AYNI olmalı
const HTTPS_PORT = Number(process.env.KABUL_HTTPS_PORT ?? 443);
const CTRL_PORT = Number(process.env.KABUL_CTRL_PORT ?? 3999);
const CANON = "https://www.yasamsistemi.com";
const SINK = path.join(DIR, "sentetik-eposta.jsonl");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lanIp(): string {
  for (const list of Object.values(os.networkInterfaces())) for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) return i.address;
  return "127.0.0.1";
}

/** Test CA + sunucu sertifikası (yalnız yoksa üretilir). Android sistem deposu için subject_hash_old adlı kopya da yazılır. */
function ensureCerts(): { key: Buffer; cert: Buffer } {
  const f = (n: string) => path.join(DIR, n);
  const ossl = (args: string[]) => execFileSync("openssl", args, { stdio: "pipe", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  if (!fs.existsSync(f("kabul-ca.pem"))) {
    ossl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", f("kabul-ca.key"), "-out", f("kabul-ca.pem"), "-days", "30",
      "-subj", "/CN=Yasam Sistemi KABUL TEST CA (yalniz test)", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
    ossl(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", f("sunucu.key"), "-out", f("sunucu.csr"), "-subj", "/CN=www.yasamsistemi.com"]);
    fs.writeFileSync(f("san.ext"), "subjectAltName=DNS:www.yasamsistemi.com,DNS:yasamsistemi.com,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n");
    ossl(["x509", "-req", "-in", f("sunucu.csr"), "-CA", f("kabul-ca.pem"), "-CAkey", f("kabul-ca.key"), "-CAcreateserial", "-out", f("sunucu.pem"), "-days", "30", "-extfile", f("san.ext")]);
    const h = ossl(["x509", "-inform", "PEM", "-subject_hash_old", "-in", f("kabul-ca.pem"), "-noout"]).toString().trim();
    fs.copyFileSync(f("kabul-ca.pem"), f(`${h}.0`));
    fs.writeFileSync(f("android-sistem-ca-dosyasi.txt"), `${h}.0\n`);
  }
  return { key: fs.readFileSync(f("sunucu.key")), cert: fs.readFileSync(f("sunucu.pem")) };
}

async function main() {
  const tls = ensureCerts();
  const db = await startF2cDb({ withF2k: true });
  const q = (sql: string, args: unknown[] = []) => db.admin.query(sql, args);
  // Sentetik hesaplar: free (MFA'sız uzman), exp (MFA zorunlu uzman — e-posta kodu), owner (admin; MFA'sız başlar)
  await q(`UPDATE public.users SET email_verified_at = now() - interval '1 day' WHERE id = ANY($1::uuid[])`, [[U.exp, U.free, U.owner]]).catch(() => {});
  await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.exp}'; SELECT set_config('yasam.mfa_policy','off',false);`);

  const supa = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((r, j) => { supa.once("error", j); supa.listen(SUPA_PROXY_PORT, "127.0.0.1", () => r()); });

  const front = https.createServer(tls, (req, res) => {
    const host = String(req.headers.host ?? "").split(":")[0].toLowerCase();
    res.setHeader("x-kabul-ortami", "izole-test");
    if (host === "yasamsistemi.com") { res.writeHead(307, { location: `${CANON}${req.url ?? "/"}` }); res.end(); return; }
    if ((req.url ?? "").startsWith("/_kabul/indir")) {
      const cookie = String(req.headers.cookie ?? "");
      const hasSid = /(?:^|;\s*)__Host-yasam_sid=/.test(cookie);
      void (async () => {
        let valid = false;
        if (hasSid) {
          try {
            const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/auth/session`, { headers: { cookie, "x-forwarded-proto": "https", "user-agent": String(req.headers["user-agent"] ?? "") } });
            valid = ((await r.json()) as { valid?: unknown }).valid === true;
          } catch { /* geçersiz say */ }
        }
        console.log(`[indir] cerez=${hasSid ? "var" : "yok"} gecerli=${valid} ua=${/; wv\)/.test(String(req.headers["user-agent"] ?? "")) ? "webview" : "diger"}`);
        if (!valid) { res.writeHead(401, { "content-type": "text/plain" }); res.end("oturum yok"); return; }
        res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": 'attachment; filename="kabul-indirme-testi.docx"', "cache-control": "no-store" });
        res.end(Buffer.from("KABUL TEST — gercek Word degildir"));
      })();
      return;
    }
    const up = http.request({ host: "127.0.0.1", port: APP_PORT, path: req.url, method: req.method,
      headers: { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-host": "www.yasamsistemi.com" } },
      (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((r, j) => { front.once("error", j); front.listen(HTTPS_PORT, () => r()); });

  let app: ChildProcess | null = null;
  const state = { android: (process.env.ANDROID_KIP === "cookie" ? "cookie" : "header") as "header" | "cookie", killswitch: false };
  const stopApp = async () => {
    if (!app) return;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGTERM");
    app = null;
    for (let i = 0; i < 30; i++) { try { await fetch(`http://127.0.0.1:${APP_PORT}/`); } catch { return; } await sleep(500); }
  };
  const startApp = async () => {
    await stopApp();
    const env: Record<string, string | undefined> = {
      ...process.env, PORT: String(APP_PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
      SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: CANON, RATE_LIMIT_SECRET: "android-kabul-rate", LOGIN_IP_PEPPER: "android-kabul-pepper",
      REQUIRE_DB_SUPER_ADMIN_MARKER: "true", NEXT_TELEMETRY_DISABLED: "1",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,owner",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: SINK,
      AUTH_OTP_PEPPER: "android-kabul-pepper-0123456789abcdefghijklmnop",
      ANDROID_APP_SESSION_TRANSPORT: state.android,
      SESSION_COOKIE_WEB_HEADER: state.killswitch ? "on" : undefined,
    };
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    delete env.VERCEL_ENV;
    if (!String(env.NEXT_PUBLIC_SUPABASE_URL).startsWith("http://127.0.0.1:")) throw new Error("güvenlik: yerel olmayan veritabanı adresi");
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(APP_PORT)],
      { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore" });
    for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${APP_PORT}/`); if (r.status < 500) break; } catch { /* bekle */ } await sleep(1000); }
    console.log(`[kabul] uygulama hazır — Android taşıması: ${state.android} · kill-switch: ${state.killswitch ? "AÇIK" : "kapalı"}`);
  };
  await startApp();

  // Sentetik e-posta kodlarını konsola yaz
  let seen = 0;
  setInterval(() => {
    let lines: string[] = [];
    try { lines = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean); } catch { return; }
    for (const l of lines.slice(seen)) { try { const m = JSON.parse(l) as { to: string; subject: string; text?: string }; console.log(`[e-posta] ${m.to}: ${m.subject}${/\b([0-9]{6})\b/.exec(m.text ?? "") ? ` · kod ${/\b([0-9]{6})\b/.exec(m.text ?? "")?.[1]}` : ""}`); } catch { /* */ } }
    seen = lines.length;
  }, 1000);

  const ctrl = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body, null, 2)); };
    try {
      if (u.pathname === "/durum") return send(200, { ...state, https: HTTPS_PORT, lanIp: lanIp(), hesaplar: { uzman: EMAIL.free, uzmanMfa: EMAIL.exp, owner: EMAIL.owner }, parolaKurali: "parola-<e-posta yerel kısmı>" });
      if (u.pathname === "/kip" && req.method === "POST") {
        const a = u.searchParams.get("android"); const k = u.searchParams.get("killswitch");
        if (a === "header" || a === "cookie") state.android = a;
        if (k === "on" || k === "off") state.killswitch = k === "on";
        await startApp();
        return send(200, state);
      }
      if (u.pathname === "/oturumlar") {
        const r = await q(`SELECT u.email, s.client_channel, s.is_active, s.expires_at, s.mfa_method, s.end_reason, s.created_at
                             FROM public.user_sessions s JOIN public.users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 30`);
        return send(200, r.rows);
      }
      if (u.pathname === "/eski-suresiz" && req.method === "POST") {
        // F2-A öncesi süresiz Android oturumu taklidi (YALNIZ bu sentetik DB; koruma tetikleyicisi tek güncelleme için atlanır)
        const r = await q(`SET session_replication_role = replica; UPDATE public.user_sessions SET expires_at = NULL WHERE is_active AND client_channel = 'android_app'; SET session_replication_role = origin;`);
        return send(200, { guncellenen: (r as unknown as { rowCount?: number }[])[1]?.rowCount ?? null });
      }
      if (u.pathname === "/iptal" && req.method === "POST") {
        const kanal = u.searchParams.get("kanal") ?? "android_app";
        const r = await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'revoked_by_user' WHERE is_active AND client_channel = $1`, [kanal]);
        return send(200, { iptal: r.rowCount });
      }
      return send(404, { hata: "bilinmeyen uç" });
    } catch (e) { return send(500, { hata: String(e) }); }
  });
  await new Promise<void>((r) => ctrl.listen(CTRL_PORT, "127.0.0.1", () => r()));

  if (process.env.KABUL_DNS === "1") {
    const ip = process.env.KABUL_DNS_IP ?? lanIp();
    const dns = dgram.createSocket("udp4");
    dns.on("message", (msg, rinfo) => {
      // Soru adı (tek soru varsayımı)
      let i = 12; const labels: string[] = [];
      while (msg[i] !== 0 && i < msg.length) { labels.push(msg.subarray(i + 1, i + 1 + msg[i]).toString()); i += msg[i] + 1; }
      const name = labels.join(".").toLowerCase();
      const qtype = msg.readUInt16BE(i + 1);
      if (process.env.KABUL_DNS_LOG === "1") console.log(`[dns] ${name} tip=${qtype} kaynak=${rinfo.address}`);
      if (name === "yasamsistemi.com" || name === "www.yasamsistemi.com") {
        const q = msg.subarray(12, i + 5);
        const hdr = Buffer.from(msg.subarray(0, 12)); hdr.writeUInt16BE(0x8180, 2); hdr.writeUInt16BE(1, 4); hdr.writeUInt16BE(qtype === 1 ? 1 : 0, 6); hdr.writeUInt16BE(0, 8); hdr.writeUInt16BE(0, 10);
        const ans = qtype === 1 ? Buffer.concat([Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 30, 0, 4]), Buffer.from(ip.split(".").map(Number))]) : Buffer.alloc(0);
        dns.send(Buffer.concat([hdr, q, ans]), rinfo.port, rinfo.address);
        return;
      }
      const up = dgram.createSocket("udp4");
      up.on("message", (m) => { dns.send(m, rinfo.port, rinfo.address); up.close(); });
      up.send(msg, 53, "1.1.1.1");
      setTimeout(() => { try { up.close(); } catch { /* */ } }, 4000);
    });
    const bind = process.env.KABUL_DNS_BIND ?? "0.0.0.0";
    dns.bind(53, bind);
    console.log(`[kabul] DNS (${bind}:53): yasamsistemi.com / www → ${ip}`);
  }

  console.log(`
[kabul] HAZIR — production'a bağlantı YOK.
  HTTPS:        https://www.yasamsistemi.com  →  bu bilgisayar :${HTTPS_PORT} (LAN IP ${lanIp()})
  Test CA:      ${path.join(DIR, "kabul-ca.pem")}  (Android sistem deposu adı: ${fs.readFileSync(path.join(DIR, "android-sistem-ca-dosyasi.txt"), "utf8").trim()})
  Hesaplar:     ${EMAIL.free} (MFA'sız) · ${EMAIL.exp} (MFA: e-posta kodu konsola yazılır) · parola: ${pw(EMAIL.free)} / ${pw(EMAIL.exp)}
  Kontrol:      http://127.0.0.1:${CTRL_PORT}/durum
  Çıkış: Ctrl+C`);
  const shutdown = async () => { await stopApp(); front.close(); supa.close(); ctrl.close(); await db.close(); process.exit(0); };
  process.on("SIGINT", () => void shutdown());
}
main().catch((e) => { console.error(e); process.exit(1); });
