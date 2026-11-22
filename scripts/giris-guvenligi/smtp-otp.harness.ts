/**
 * GİRİŞ GÜVENLİĞİ F2-M — SMTP sağlayıcısı + GERÇEK PostgreSQL F2 zinciri (embedded) + gerçek OTP akışı (issueAndSendOtp /
 * verifyOtp → auth_email_otp_issue / auth_email_delivery_result / auth_email_otp_verify). E-posta SAHTE SMTP sunucusuna
 * (127.0.0.1) gider; kod sunucunun aldığı iletiden okunur. Gerçek posta sunucusu / gerçek kimlik bilgisi YOK.
 *
 * Kanıtlananlar: migration 001200 YOKKEN 'smtp' veritabanınca reddedilir ve HİÇ bağlantı açılmaz (fail-closed) · başarılı
 * gönderim + denetim kaydı (provider='smtp', Message-ID) · kod tek kullanımlık · 5 yanlış denemede kilit · 3 dk süre ·
 * yeniden gönderimde eski kod geçersiz · SMTP kimlik / TLS hatasında kod KULLANILAMAZ + Owner uyarısı (adres/kod/parola yok) ·
 * kota dolunca sunucuya hiç bağlanılmaz · sağlayıcı kısıtı · 001200 yeniden çalıştırılabilir, eski F2 dosyası reddedilir.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/smtp-otp.harness.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSmtpProvider, type SmtpTestHooks } from "@/lib/email/smtpProvider";
import { issueAndSendOtp, verifyOtp } from "@/lib/auth/emailOtp";
import { HOST, makeCerts, startSmtp } from "./smtpTestServer";
import { startF2cDb, U, EMAIL } from "./testDb";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

const PASSWORD = "Sahte-SMTP-Parola-Q8w!-OTP";
const PEPPER = "f2m-test-pepper-".padEnd(48, "x");
const ENV = (over: Record<string, string> = {}) => ({
  EMAIL_PROVIDER: "smtp", SMTP_HOST: HOST, SMTP_PORT: "465", SMTP_USER: "dogrulama@ornek-alan.test", SMTP_PASSWORD: PASSWORD,
  SMTP_SENDER: "dogrulama@ornek-alan.test", AUTH_OTP_PEPPER: PEPPER, ...over,
});
const FAST = { dns: 2000, connection: 1500, greeting: 1500, socket: 2000, total: 6000 };

/** Sahte sunucunun aldığı ileti gövdesinden (text/plain, base64) 6 haneli kodu çıkarır. */
function codeFrom(raw: string): string | null {
  const m = raw.match(/Content-Type: text\/plain; charset="UTF-8"\r?\nContent-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n--/);
  if (!m) return null;
  return Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString("utf8").match(/\b([0-9]{6})\b/)?.[1] ?? null;
}

async function main() {
  const C = makeCerts();
  const hooks = (port: number): SmtpTestHooks => ({ connect: { host: "127.0.0.1", port }, ca: C.ca, timeoutsMs: FAST });
  const user = { userId: U.exp, email: EMAIL.exp, name: "Test Uzman", purpose: "verify_email" as const, challengeId: null };

  console.log("── A) Migration 001200 YOK (zincir F2-K'da): 'smtp' reddedilir, bağlantı açılmaz ──");
  {
    const db = await startF2cDb({ withF2k: true });
    const sb = createClient(db.shimUrl, "f2m-test", { auth: { persistSession: false } }) as SupabaseClient;
    const s = await startSmtp({ secure: true, tlsPair: C.srv });
    const env = ENV();
    const out = await issueAndSendOtp(sb, user, env, createSmtpProvider(env, hooks(s.port)));
    ok(!out.ok && out.code === "error", "eski şemada smtp ile kod üretilemedi (bad_request → error)", out);
    ok(s.box.connects === 0 && s.box.mails.length === 0, "SMTP sunucusuna HİÇ bağlanılmadı (kod e-postası gitmedi)", s.box.connects);
    const n = Number((await db.admin.query(`SELECT count(*)::int n FROM public.auth_email_otps WHERE user_id = $1`, [U.exp])).rows[0].n);
    ok(n === 0, "veritabanında kullanılabilir kod oluşmadı (MFA atlanmaz)", n);
    await s.close();
    await db.close();
  }

  console.log("── B) Migration 001200 VAR ──");
  const db = await startF2cDb({ withF2m: true });
  const q = (sql: string, args: unknown[] = []) => db.admin.query(sql, args);
  const sb = createClient(db.shimUrl, "f2m-test", { auth: { persistSession: false } }) as SupabaseClient;
  /** Yeniden gönderim beklemesini (60 sn) test için geçmişe kaydırır. */
  const skipCooldown = () => q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [U.exp]);
  try {
    ok(Number((await q(`SELECT public.auth_f2_schema_level() AS l`)).rows[0].l) === 1200, "şema düzeyi 1200");

    console.log("  · başarılı gönderim + doğrulama + tek kullanım");
    {
      const s = await startSmtp({ secure: true, tlsPair: C.srv });
      const out = await issueAndSendOtp(sb, user, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      ok(out.ok === true, "kod üretildi ve SMTP ile gönderildi", out);
      ok(s.box.connects === 1 && s.box.mails.length === 1 && s.box.mails[0].to.join() === EMAIL.exp, "sunucu tek ileti aldı, alıcı doğru");
      const code = codeFrom(s.box.mails[0]?.raw ?? "");
      ok(!!code, "iletide 6 haneli kod var");
      const d = (await q(`SELECT provider, state, error_code, provider_message_id, purpose FROM public.auth_email_deliveries WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [U.exp])).rows[0];
      ok(d?.provider === "smtp" && d?.state === "sent" && d?.error_code === null && /^<ys\..+@ornek-alan\.test>$/.test(String(d?.provider_message_id)), "denetim kaydı: provider='smtp', state='sent', Message-ID", d);
      const o = (await q(`SELECT state, attempts, extract(epoch FROM expires_at - created_at)::int AS ttl, code_hash FROM public.auth_email_otps WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [U.exp])).rows[0];
      ok(o?.state === "active" && o?.ttl === 180, "kod aktif, süre 3 dk (değişmedi)", { state: o?.state, ttl: o?.ttl });
      ok(!!code && !String(o?.code_hash).includes(code) && /^[0-9a-f]{64}$/.test(String(o?.code_hash)), "veritabanında düz kod YOK (yalnız HMAC)");
      const v = await verifyOtp(sb, { userId: U.exp, purpose: "verify_email", challengeId: null, code: code ?? "000000", email: EMAIL.exp }, ENV());
      ok(v.ok === true, "doğru kod kabul edildi", v);
      const v2 = await verifyOtp(sb, { userId: U.exp, purpose: "verify_email", challengeId: null, code: code ?? "000000", email: EMAIL.exp }, ENV());
      ok(!v2.ok, "aynı kod İKİNCİ kez kabul edilmez (tek kullanım)", v2);
      await s.close();
    }

    console.log("  · yeniden gönderim beklemesi + eski kodun geçersizliği");
    {
      const s = await startSmtp({ secure: true, tlsPair: C.srv });
      await skipCooldown();
      const a = await issueAndSendOtp(sb, user, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      const cooldown = await issueAndSendOtp(sb, user, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      ok(a.ok === true && !cooldown.ok && cooldown.code === "cooldown", "60 sn içinde ikinci kod YOK (cooldown)", cooldown);
      ok(s.box.mails.length === 1, "cooldown'da sunucuya ileti gitmedi", s.box.mails.length);
      const oldCode = codeFrom(s.box.mails[0].raw);
      await skipCooldown();
      const b = await issueAndSendOtp(sb, user, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      const newCode = codeFrom(s.box.mails[1]?.raw ?? "");
      ok(b.ok === true && !!newCode, "yeni kod gönderildi");
      if (oldCode !== newCode) {
        const vOld = await verifyOtp(sb, { userId: U.exp, purpose: "verify_email", challengeId: null, code: oldCode ?? "000000", email: EMAIL.exp }, ENV());
        ok(!vOld.ok, "ESKİ kod yeni kod gönderilince geçersiz (superseded)", vOld);
      } else ok(true, "eski/yeni kod rastlantısal olarak aynı (geçersizlik bu turda ölçülemedi)");

      console.log("  · 5 yanlış deneme → kilit");
      const wrong = newCode === "111111" ? "222222" : "111111";
      const outs = [];
      for (let i = 0; i < 5; i++) outs.push(await verifyOtp(sb, { userId: U.exp, purpose: "verify_email", challengeId: null, code: wrong, email: EMAIL.exp }, ENV()));
      ok(outs.every((x) => !x.ok) && outs.some((x) => !x.ok && x.code === "locked"), "5 yanlış denemede kilit", outs.map((x) => (x.ok ? "ok" : x.code)));
      const vAfter = await verifyOtp(sb, { userId: U.exp, purpose: "verify_email", challengeId: null, code: newCode ?? "000000", email: EMAIL.exp }, ENV());
      ok(!vAfter.ok, "kilitten sonra DOĞRU kod da kabul edilmez", vAfter);
      await s.close();
    }

    console.log("  · süre dolumu");
    {
      const s = await startSmtp({ secure: true, tlsPair: C.srv });
      await skipCooldown();
      await q(`UPDATE public.auth_email_otps SET attempts = 0 WHERE user_id = $1`, [U.exp]); // 24 saatlik yanlış deneme tavanını sıfırla (bağımsız senaryo)
      const out = await issueAndSendOtp(sb, user, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      const code = codeFrom(s.box.mails[0]?.raw ?? "");
      // 4 dk öncesine kaydır (TTL kısıtı korunur: üretim + 3 dk = 1 dk önce doldu).
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '4 minutes', expires_at = expires_at - interval '4 minutes' WHERE user_id = $1 AND state = 'active'`, [U.exp]);
      const v = await verifyOtp(sb, { userId: U.exp, purpose: "verify_email", challengeId: null, code: code ?? "000000", email: EMAIL.exp }, ENV());
      ok(out.ok === true && !v.ok && v.code === "expired", "süresi dolan kod reddedildi (expired)", { out, v });
      await s.close();
    }

    console.log("  · SMTP kimlik hatası / TLS hatası → kod kullanılamaz + Owner uyarısı");
    for (const k of [{ name: "kimlik", o: { secure: true, tlsPair: C.srv, authFail: true }, code: "smtp_auth_failed" }, { name: "TLS", o: { secure: true, tlsPair: C.self }, code: "smtp_tls_error" }] as const) {
      const s = await startSmtp(k.o);
      await skipCooldown();
      // F2-D: aynı anda TEK açık e-posta uyarısı (tür+hedef kısmi UNIQUE) — her senaryo kendi uyarısını ölçsün.
      await q(`DELETE FROM public.admin_notifications WHERE event_key LIKE 'eposta_uyari:%'`);
      const out = await issueAndSendOtp(sb, user, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      ok(!out.ok && out.code === "send_failed", `${k.name}: kullanıcıya send_failed (QR / başka yöntem sunulur)`, out);
      // smtp-server bağlantıyı TLS el sıkışması tamamlanınca sayar: TLS reddinde 0, kimlik reddinde 1.
      ok(s.box.mails.length === 0 && s.box.auths.length <= 1 && s.box.connects <= 1, `${k.name}: ileti yok, en çok tek bağlantı (otomatik tekrar yok)`, { c: s.box.connects, m: s.box.mails.length });
      const d = (await q(`SELECT provider, state, error_code FROM public.auth_email_deliveries WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [U.exp])).rows[0];
      ok(d?.provider === "smtp" && d?.state === "failed" && d?.error_code === k.code, `${k.name}: denetim kaydı failed / ${k.code}`, d);
      const o = (await q(`SELECT state FROM public.auth_email_otps WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [U.exp])).rows[0];
      ok(o?.state === "failed", `${k.name}: kod 'failed' (doğrulanamaz; MFA atlanmaz)`, o);
      const n = (await q(`SELECT event_key, payload, target_user_id FROM public.admin_notifications WHERE event_key LIKE $1`, [`eposta_uyari:${k.code}:%`])).rows;
      ok(n.length === 1 && n[0].target_user_id === U.owner, `${k.name}: Owner'a 'eposta_uyari:${k.code}' bildirimi`, n.map((x) => x.event_key));
      const payload = JSON.stringify(n[0]?.payload ?? {});
      ok(!payload.includes("@") && !payload.includes(PASSWORD) && !/[0-9]{6}/.test(payload), `${k.name}: bildirim yükünde adres / kod / parola YOK`, payload);
      await s.close();
    }
    {
      const s = await startSmtp({ secure: true, tlsPair: C.srv, rcpt: { code: 550, msg: "No such user here" } });
      await skipCooldown();
      const before = Number((await q(`SELECT count(*)::int n FROM public.admin_notifications WHERE event_key LIKE 'eposta_uyari:rejected:%'`)).rows[0].n);
      const out = await issueAndSendOtp(sb, user, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      const after = Number((await q(`SELECT count(*)::int n FROM public.admin_notifications WHERE event_key LIKE 'eposta_uyari:rejected:%'`)).rows[0].n);
      ok(!out.ok && before === 0 && after === 0, "alıcı reddi (kullanıcıya özgü) Owner'a bildirim DOĞURMAZ (mevcut F2-D davranışı)", { out, after });
      await s.close();
    }

    console.log("  · kota: smtp varsayılanı 200/24 sa dolunca sunucuya bağlanılmaz");
    {
      // Başka kullanıcı (U.free): U.exp'in saatlik 6 kod sınırı bu senaryoyu etkilemesin. Kota sağlayıcı geneli sayılır.
      const userF = { ...user, userId: U.free, email: EMAIL.free };
      await q(`INSERT INTO public.auth_email_deliveries (user_id, purpose, provider, to_hash, state, created_at)
               SELECT $1, 'verify_email', 'smtp', repeat('a', 64), 'sent', now() - interval '1 hour' FROM generate_series(1, 200)`, [U.and1]);
      const s = await startSmtp({ secure: true, tlsPair: C.srv });
      const out = await issueAndSendOtp(sb, userF, ENV(), createSmtpProvider(ENV(), hooks(s.port)));
      ok(!out.ok && out.code === "quota_exhausted", "24 saatte 200 gönderim → quota_exhausted", out);
      ok(s.box.connects === 0, "kota dolunca SMTP sunucusuna HİÇ bağlanılmadı", s.box.connects);
      const out2 = await issueAndSendOtp(sb, userF, ENV({ EMAIL_DAILY_LIMIT: "1000" }), createSmtpProvider(ENV(), hooks(s.port)));
      ok(out2.ok === true, "EMAIL_DAILY_LIMIT açıkça yükseltilirse gönderim yapılır (Owner kararı)", out2);
      await q(`DELETE FROM public.auth_email_deliveries WHERE user_id = $1 AND to_hash = repeat('a', 64)`, [U.and1]);
      await s.close();
    }

    console.log("  · sağlayıcı kısıtı ve geriye dönük uyumluluk");
    {
      let rejected = false;
      try { await q(`INSERT INTO public.auth_email_deliveries (user_id, purpose, provider, to_hash, state) VALUES ($1, 'verify_email', 'smtp2', repeat('b', 64), 'sent')`, [U.free]); } catch { rejected = true; }
      ok(rejected, "bilinmeyen sağlayıcı adı ('smtp2') tabloda reddedilir");
      for (const p of ["gmail", "synthetic", "smtp"]) {
        const r = (await q(`SELECT public.auth_email_provider_allowed($1) AS a`, [p])).rows[0].a;
        ok(r === true, `'${p}' izinli`);
      }
      ok((await q(`SELECT public.auth_email_provider_allowed(NULL) AS a`)).rows[0].a === false, "NULL izinli değil");
      const g = (await q(`SELECT public.auth_email_notice_reserve($1, repeat('c', 64), 'gmail') AS r`, [U.free])).rows[0].r as { ok?: boolean; reason?: string; code?: string };
      const bad = (await q(`SELECT public.auth_email_notice_reserve($1, repeat('c', 64), 'resend') AS r`, [U.free])).rows[0].r as { ok?: boolean };
      ok(bad?.ok === false && JSON.stringify(g) !== JSON.stringify(bad), "notice_reserve: 'gmail' eskisi gibi işlenir, bilinmeyen ad reddedilir", { g, bad });
    }

    console.log("  · migration yeniden çalıştırma");
    {
      const fp = async () => (await q(`SELECT string_agg(p.proname || ':' || md5(p.prosrc), ',' ORDER BY p.proname) AS h FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                       WHERE n.nspname = 'public' AND p.proname LIKE 'auth_email%'`)).rows[0].h as string;
      const before = await fp();
      const sql1200 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280103001200_auth_email_smtp_provider_f2m.sql"), "utf8");
      let err1200: string | null = null;
      try { await q(sql1200); } catch (e) { err1200 = (e as { code?: string }).code ?? "hata"; }
      ok(err1200 === null && (await fp()) === before, "001200 ikinci kez çalıştırıldı: hata yok, katalog DEĞİŞMEDİ (idempotent)", err1200);
      const cons = (await q(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.auth_email_deliveries'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ~ $1`, ["\\mprovider\\M"])).rows;
      ok(cons.length === 1 && cons[0].conname === "auth_email_deliveries_provider_chk" && cons[0].def.includes("auth_email_provider_allowed(provider)"), "tabloda TEK sağlayıcı kısıtı (adlı, fonksiyona bağlı); eski liste kısıtı kaldırıldı", cons);
      const sql1100 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280103001100_auth_critical_privilege_device_f2k.sql"), "utf8");
      let err1100: string | null = null;
      try { await q(sql1100); } catch (e) { err1100 = (e as { code?: string }).code ?? "hata"; await q("ROLLBACK").catch(() => {}); }
      ok(err1100 === "YF201" && (await fp()) === before, "001100 (eski aşama) 001200'den sonra REDDEDİLİR (YF201), katalog değişmedi", err1100);
    }
  } finally {
    await db.close();
    fs.rmSync(C.dir, { recursive: true, force: true });
  }
  console.log(`\nsmtp-otp harness: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
