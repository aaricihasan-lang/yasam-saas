/**
 * I18N — ANDROID (fiziksel telefon / emülatör) ELLE KABUL ORTAMI. Production'a SIFIR temas; yalnız sentetik hesaplar.
 *
 * Ne kurar (ui-e2e-mfa.ts ile aynı yapı, ama test koşmaz; Ctrl+C'ye kadar açık kalır):
 *   - Gömülü PostgreSQL + giriş güvenliği F2 zinciri (scripts/giris-guvenligi/testDb) + user_locale_prefs migration'ı.
 *   - `next start` (bu ağacın yayın kapısı AÇIK production build'i) → http://127.0.0.1:3994
 *   - E-posta doğrulama kodları sentetik sağlayıcıyla dosyaya yazılır VE konsola basılır.
 *
 * Ön koşul (build kökünde, sahte env; i18n-tarayici.yml "acik-kapi" işiyle aynı):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret NEXT_PUBLIC_I18N_LOCALE_SWITCHING=on npx next build
 * Çalıştır: npx tsx scripts/i18n/android-kabul-ortami.ts <kalıcı-dizin>
 * Telefon / emülatör: `adb reverse tcp:3994 tcp:3994` → telefonda Chrome: http://127.0.0.1:3994
 *   (127.0.0.1 güvenli bağlam sayılır → Secure oturum çerezi çalışır; LAN IP'si üzerinden http ÇALIŞMAZ.)
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { startF2cDb, EMAIL, pw } from "../giris-guvenligi/testDb";

const DIR = process.argv[2];
if (!DIR) { console.log("kalıcı dizin gerekli (sentetik e-posta kayıtları burada tutulur)"); process.exit(2); }
fs.mkdirSync(DIR, { recursive: true });
const SINK = path.join(DIR, "sentetik-eposta.jsonl");
const PORT = Number(process.env.KABUL_APP_PORT ?? 3994);
const SUPA_PROXY_PORT = Number(process.env.KABUL_SUPA_PORT ?? 54398); // build'e gömülü NEXT_PUBLIC_SUPABASE_URL ile AYNI olmalı
const BASE = `http://127.0.0.1:${PORT}`;

async function main() {
  const db = await startF2cDb({ withF2e: true });
  await db.admin.query(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8"));

  const proxy = http.createServer((req, res) => {
    const target = new URL(req.url ?? "/", db.shimUrl);
    const up = http.request(target, { method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(SUPA_PROXY_PORT, "127.0.0.1", () => resolve()); });

  const env: Record<string, string | undefined> = {
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PROXY_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret",
    SESSION_COOKIE_MODE: "primary",
    SESSION_COOKIE_ALLOWED_ORIGINS: BASE,
    RATE_LIMIT_SECRET: "i18n-kabul-rate-secret",
    LOGIN_IP_PEPPER: "i18n-kabul-pepper",
    REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
    AUTH_MFA_METHODS: "qr_device,email_otp",
    AUTH_MFA_METHOD_SCOPE: "all",
    AUTH_MFA_EMAIL_ROLES: "expert,admin",
    EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1",
    EMAIL_SYNTHETIC_SINK: SINK,
    AUTH_OTP_PEPPER: "i18n-kabul-pepper-0123456789abcdefghijklmnopqrstu",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.VERCEL_ENV;
  const app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"],
    { cwd: process.cwd(), env: env as NodeJS.ProcessEnv, stdio: "ignore" });

  // Sentetik e-posta kodlarını konsola aktar (yalnız bu izole ortamın tek kullanımlık test kodları).
  let seen = 0;
  const pump = setInterval(() => {
    if (!fs.existsSync(SINK)) return;
    const lines = fs.readFileSync(SINK, "utf8").split("\n").filter(Boolean);
    for (const l of lines.slice(seen)) {
      try { const m = JSON.parse(l) as { to?: string; subject?: string; text?: string }; const code = /\b\d{6}\b/.exec(m.text ?? "")?.[0];
        console.log(`  [e-posta] ${m.to} · ${m.subject}${code ? ` · kod ${code}` : ""}`); } catch { /* yarım satır */ }
    }
    seen = lines.length;
  }, 1000);

  const shutdown = async () => { clearInterval(pump); app.kill(); proxy.close(); await db.close().catch(() => undefined); process.exit(0); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);

  for (let i = 0; i < 180; i++) { try { const r = await fetch(`${BASE}/`); if (r.status < 500) break; } catch { /* bekle */ } await new Promise((r) => setTimeout(r, 1000)); }
  console.log(`\nI18N kabul ortamı hazır: ${BASE}  (yayın kapısı build'e bağlı; kapalı build'de dil seçici GÖRÜNMEZ)`);
  console.log("Telefon/emülatör: adb reverse tcp:%d tcp:%d → Chrome: %s", PORT, PORT, BASE);
  console.log("Sentetik hesaplar (MFA'sız):");
  console.log(`  ${EMAIL.free} / ${pw(EMAIL.free)}`);
  console.log(`E-posta kodu MFA: ${EMAIL.exp} / ${pw(EMAIL.exp)} (kod bu konsola düşer)`);
  console.log("Kapatmak için Ctrl+C.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
