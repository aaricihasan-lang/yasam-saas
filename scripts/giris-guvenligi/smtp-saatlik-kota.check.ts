/**
 * GİRİŞ GÜVENLİĞİ — SMTP (Turhost) SAATLİK kota (lib/email/smtpQuota.ts): GERÇEK PostgreSQL + production'daki gerçek
 * `auth_rate_limit_hit` fonksiyonu (migration 20270130000000 dosyasından aynen kurulur) + PostgREST shim + sahte SMTP sunucusu.
 * Production'a / Turhost'a SIFIR temas; parola sahtedir ve hiçbir çıktıda görünmez.
 *
 * A) Sınır ayarı: varsayılan / tavan 50; env yalnız düşürür.
 * B) Kapı (veritabanı): 50 izin → 51. RED (bekleme süresiyle); kayan pencere (3600 sn sonra yeniden izin).
 * C) Eşzamanlılık: 4 ayrı istemci ("Vercel örneği") × 30 paralel istek = 120 → TAM 50 izin.
 * D) Sağlayıcı: 50 ileti sunucuya gider; 51.'de BAĞLANTI AÇILMAZ, "quota" döner; production fabrikası (getEmailProvider)
 *    kapıyı HER ZAMAN takar (kota doluyken ağa çıkmaz).
 * E) Fail-closed: sayaç fonksiyonu kullanılamıyorsa gönderim YAPILMAZ.
 * F) Gmail / sentetik sağlayıcı ve günlük sınır değişmedi; parola sızmaz.
 *
 * Negatif kontrol: SMTP_KOTA_KORUMASIZ=1 → sağlayıcının kapı denetimi bu süreçte kaldırılır → D FAIL VERMELİ.
 * Çalıştır: npx tsx scripts/giris-guvenligi/smtp-saatlik-kota.check.ts
 */
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { installSourceMutations } from "./sourceMutation";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
installSourceMutations([{ envVar: "SMTP_KOTA_KORUMASIZ", file: "lib/email/smtpProvider.ts", label: "SMTP saatlik kota kapısı kaldırıldı",
  anchor: "      if (gate) {\n        const g = await gate()", replacement: "      if (false) {\n        const g = await gate!()" }]);

const captured: string[] = [];
const origLog = console.log;
console.log = (...a: unknown[]) => { captured.push(a.map(String).join(" ")); origLog(...a); };
let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 240)}` : ""}`); }
}
const section = (s: string) => console.log(`\n── ${s} ──`);
const PASSWORD = "Sahte-Kota-Parola-4Kp!x8-ASLA-GORUNMEMELI";

async function main() {
  const { startF2cDb } = await import("./testDb");
  const { smtpHourlyLimit, createSmtpHourlyGate, SMTP_HOURLY_BUCKET, SMTP_HOURLY_LIMIT_CAP } = await import("@/lib/email/smtpQuota");
  const { createSmtpProvider } = await import("@/lib/email/smtpProvider");
  const { getEmailProvider, resetEmailProviderCache } = await import("@/lib/email/provider");
  const { emailLimits, EMAIL_DAILY_LIMIT_SMTP_DEFAULT, EMAIL_DAILY_LIMIT_DEFAULT } = await import("@/lib/auth/emailOtp");
  const { HOST, makeCerts, startSmtp } = await import("./smtpTestServer");

  section("A) Sınır ayarı");
  ok(smtpHourlyLimit({}) === 50 && SMTP_HOURLY_LIMIT_CAP === 50, "varsayılan ve tavan 50/saat");
  ok(smtpHourlyLimit({ SMTP_HOURLY_LIMIT: "30" }) === 30, "env düşürebilir (30)");
  ok(smtpHourlyLimit({ SMTP_HOURLY_LIMIT: "60" }) === 50 && smtpHourlyLimit({ SMTP_HOURLY_LIMIT: "250" }) === 50, "env YÜKSELTEMEZ (60 / 250 → 50)");
  ok(["0", "-5", "abc", "", "12.5"].every((v) => smtpHourlyLimit({ SMTP_HOURLY_LIMIT: v }) === 50), "geçersiz değer → 50");

  const db = await startF2cDb();
  try {
    // Production fonksiyonu + tablo: 20270130000000 dosyasından AYNEN (yalnız bölüm 1).
    const mig = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20270130000000_admin_member_phase2.sql"), "utf8").replace(/\r\n/g, "\n");
    const a = mig.indexOf("CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events");
    const fnStart = mig.indexOf("CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(");
    const b = mig.indexOf("$$;", fnStart);
    if (a < 0 || fnStart < 0 || b < 0) throw new Error("auth_rate_limit_hit tanımı migration dosyasında bulunamadı");
    await db.admin.query(`${mig.slice(a, b + 3)}\nREVOKE ALL ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) TO service_role;`);   // production'daki yetki düzeni (dosyanın 4. bölümü)
    const sb = (): SupabaseClient => createClient(db.shimUrl, "kota-harness", { auth: { persistSession: false } });
    const count = async () => Number((await db.admin.query(`SELECT count(*)::int n FROM public.auth_rate_limit_events WHERE bucket = $1`, [SMTP_HOURLY_BUCKET])).rows[0].n);
    const reset = () => db.admin.query(`DELETE FROM public.auth_rate_limit_events WHERE bucket = $1`, [SMTP_HOURLY_BUCKET]);
    process.env.RATE_LIMIT_SECRET = "kota-harness-rate";

    section("B) Kapı (veritabanı, kayan pencere)");
    const gate = createSmtpHourlyGate(sb, {});
    let allowed = 0;
    for (let i = 0; i < 50; i++) if ((await gate()).allowed) allowed++;
    const g51 = await gate();
    ok(allowed === 50 && !g51.allowed && g51.retryAfterSec > 0 && g51.retryAfterSec <= 3600 && (await count()) === 50,
      "50 izin → 51. RED (bekleme süresi verilir); sayaçta 50 kayıt", { allowed, g51 });
    await db.admin.query(`UPDATE public.auth_rate_limit_events SET created_at = created_at - interval '3601 seconds' WHERE bucket = $1`, [SMTP_HOURLY_BUCKET]);
    ok((await gate()).allowed, "kayan pencere: 3600 sn geçen kayıtlar düşer, yeniden izin");
    await reset();
    await db.admin.query(`INSERT INTO public.auth_rate_limit_events (bucket, created_at) SELECT $1, now() - interval '59 minutes' FROM generate_series(1, 50)`, [SMTP_HOURLY_BUCKET]);
    ok(!(await gate()).allowed, "SAAT BAŞI SIFIRLAMASI YOK: 59 dk önceki 50 gönderim hâlâ sayılır (sabit pencere sınır aşımı olmaz)");
    await reset();
    const low = createSmtpHourlyGate(sb, { SMTP_HOURLY_LIMIT: "3" });
    const lows = [await low(), await low(), await low(), await low()].map((r) => r.allowed);
    ok(JSON.stringify(lows) === "[true,true,true,false]", "env ile düşürülmüş sınır (3) uygulanır", lows);
    await reset();

    section("C) Eşzamanlılık: 4 istemci × 30 paralel = 120 istek");
    const clients = [sb(), sb(), sb(), sb()];
    const gates = clients.map((c) => createSmtpHourlyGate(() => c, {}));
    const results = await Promise.all(gates.flatMap((g) => Array.from({ length: 30 }, () => g())));
    const yes = results.filter((r) => r.allowed).length;
    ok(yes === 50 && (await count()) === 50, `eşzamanlı 120 istekte TAM 50 izin (gözlenen ${yes}), sayaç 50`, { yes });
    await reset();

    section("D) Sağlayıcı: kota dolunca bağlantı açılmaz");
    const C = makeCerts();
    const s = await startSmtp({ secure: true, tlsPair: C.srv });
    try {
      const ENV = { EMAIL_PROVIDER: "smtp", SMTP_HOST: HOST, SMTP_PORT: "465", SMTP_USER: "dogrulama@ornek-alan.test", SMTP_PASSWORD: PASSWORD,
        SMTP_SENDER: "dogrulama@ornek-alan.test", SMTP_HOURLY_LIMIT: "5" };
      const p = createSmtpProvider(ENV, { connect: { host: "127.0.0.1", port: s.port }, ca: C.ca }, createSmtpHourlyGate(sb, ENV));
      const MSG = { to: "uzman@ornek.test", subject: "123456 — doğrulama kodunuz", text: "Kodunuz: 123456", html: "<p>123456</p>", category: "login" as const };
      const sent: string[] = [];
      for (let i = 0; i < 6; i++) { const r = await p!.send(MSG); sent.push(r.ok ? "ok" : r.code); }
      ok(JSON.stringify(sent) === JSON.stringify(["ok", "ok", "ok", "ok", "ok", "quota"]) && s.box.mails.length === 5 && s.box.connects === 5,
        "sınır 5 iken 5 ileti gitti; 6.'da 'quota' ve sunucuya BAĞLANTI YOK", { sent, mails: s.box.mails.length, connects: s.box.connects });
      await reset();
      // Production fabrikası: kota doluyken ağa hiç çıkmaz (gerçek olmayan ana makine; bağlanmaya çalışsaydı 'network' dönerdi).
      Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "kota-harness" });
      await db.admin.query(`INSERT INTO public.auth_rate_limit_events (bucket) SELECT $1 FROM generate_series(1, 50)`, [SMTP_HOURLY_BUCKET]);
      resetEmailProviderCache();
      const prodEnv = { ...process.env, EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.kota-testi.invalid", SMTP_PORT: "465", SMTP_USER: "info@kota-testi.invalid",
        SMTP_PASSWORD: PASSWORD, SMTP_SENDER: "info@kota-testi.invalid" };
      const prod = getEmailProvider(prodEnv);
      const pr = await prod!.send(MSG);
      ok(!pr.ok && pr.code === "quota", "production fabrikası (getEmailProvider smtp) kapıyı takar: kota doluyken 'quota', ağa çıkılmaz", pr);
      await reset();

      section("E) Fail-closed: sayaç fonksiyonu yoksa gönderim yok");
      await db.admin.query(`REVOKE EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) FROM service_role`);
      const before = s.box.mails.length;
      const r = await p!.send(MSG);
      ok(!r.ok && r.code === "quota" && s.box.mails.length === before, "sayaç okunamadı (bellek kipi örnekler arası değil) → gönderim YAPILMADI", r);
      await db.admin.query(`GRANT EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) TO service_role`);
    } finally {
      await s.close();
    }

    section("F) Değişmeyenler + sızıntı");
    const gm = getEmailProvider({ ...process.env, EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1" });
    ok(gm?.name === "synthetic", "sentetik sağlayıcı değişmedi (kapı yalnız SMTP'de)");
    ok(emailLimits({ EMAIL_PROVIDER: "smtp" }).dailyLimit === EMAIL_DAILY_LIMIT_SMTP_DEFAULT && emailLimits({ EMAIL_PROVIDER: "gmail" }).dailyLimit === EMAIL_DAILY_LIMIT_DEFAULT,
      "günlük sınırlar değişmedi (SMTP 200 · Gmail 1800)");
    const gmailSrc = fs.readFileSync(path.join(process.cwd(), "lib/email/gmailProvider.ts"), "utf8");
    ok(!/smtpQuota|auth_rate_limit_hit/.test(gmailSrc), "Gmail sağlayıcısına kota kodu eklenmedi");
    ok(!captured.join("\n").includes(PASSWORD), "test çıktısında parola YOK");
  } finally {
    await db.close();
  }
  console.log(`\nsmtp-saatlik-kota: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); fail++; console.log(`\nsmtp-saatlik-kota: ${pass} PASS / ${fail} FAIL (beklenmeyen hata)`); process.exit(1); });
