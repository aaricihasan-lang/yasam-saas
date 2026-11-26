#!/usr/bin/env node
/**
 * GİRİŞ GÜVENLİĞİ F2 — CI güvenlik paketi (GitHub Actions `guvenlik` işi; yerelde de aynı komut).
 *
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri + gerçek route'lar; ağ / sır / production YOK.
 * Kapsam: MFA'sız oturum engeli, eski oturum yollarının kapalılığı (F2-A/B), QR + cihaz imzası (F2-C), e-posta OTP
 * süre / kota / deneme sınırları (F2-D), kurtarma kodu tek kullanım + 72 saat + Owner yetkisi (F2-E), silme × denetim
 * saklama + Owner taze ikinci doğrulama (F2-F), Owner işleme özel kanıt (F2-G), paralel istek güvenliği, migration / yayın sırası (000200 en sonda),
 * mevcut oturumların ve 7 günlük denemenin korunması.
 *
 * SESSİZ GEÇİŞ YOK: her adım çıkış kodu 0 VE tanınan bir "geçti" özet satırı (sıfır FAIL) üretmek zorundadır;
 * özeti okunamayan, atlanan veya zaman aşımına uğrayan adım FAIL'dir. Adımlar SIRAYLA koşar (bellek baskısı yok).
 *
 * Kullanım: node scripts/giris-guvenligi/ci-f2.mjs [--yalniz-pg]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const onlyPg = process.argv.includes("--yalniz-pg");

const PG = [
  "pg:session-f2a", "pg:session-f2b", "session-f2b-concurrency", "pg:session-f2c", "pg:session-f2d", "pg:session-f2e",
  "session-f2e-concurrency", "pg:session-f2a-on-f2e", "pg:session-f2b-on-f2e", "pg:session-f2c-on-f2e", "pg:session-f2d-on-f2e",
  "pg:session-f2f", "pg:session-f2a-on-f2f", "pg:session-f2b-on-f2f", "pg:session-f2c-on-f2f", "pg:session-f2d-on-f2f",
  "pg:deploy-order-f2-pre", "pg:deploy-order-f2-post",
  // F2-G: Owner işleme özel yeniden doğrulama (çalınmış taze oturum saldırısı), saklama politikası, geri dönüş.
  "pg:session-f2g", "session-f2g-concurrency", "pg:session-f2a-on-f2g", "pg:session-f2b-on-f2g", "pg:session-f2d-on-f2g",
  "pg:deploy-order-f2-rollback",
  // F2-H: denetim kayıtları kontrollü imha / anonimleştirme (sentetik süre / gerekçe), paralel yürütme.
  "pg:session-f2h", "session-f2h-concurrency", "pg:session-f2g-on-f2h",
  // F2-I: 17.11 bağımsız güvenlik denetimi düzeltmeleri + önceki sözleşmeler 000900 üstünde + yayın sonrası doğrulama.
  "pg:session-f2i", "pg:session-f2h-on-f2i", "pg:session-f2g-on-f2i", "pg:f2-postflight", "session-f2i-hold-race",
  "pg:deploy-order-f2-pre-full", "pg:deploy-order-f2-post-full", "pg:deploy-order-f2-rollback-full", "assetlinks-araci",
  // F2-J: Android yönetici oturumu cihaz kanıtı + kanal + eski oturum geçişi; önceki sözleşmeler 001000 üstünde.
  "pg:session-f2j", "pg:session-f2k", "pg:session-f2k-on-f2m", "pg:session-f2j-on-f2k", "pg:session-f2i-on-f2k", "pg:session-f2g-on-f2k", "pg:session-f2i-on-f2j", "pg:session-f2g-on-f2j", "pg:session-f2a-on-f2j",
];
const TSX = [
  // Varsayılan veritabanları: yeni kod, kendi fazının migration'larıyla (kod migration'dan önce yayına çıkarsa).
  "scripts/giris-guvenligi/f2b-routes.harness.ts",
  "scripts/giris-guvenligi/f2c-routes.harness.ts",
  "scripts/giris-guvenligi/f2d-routes.harness.ts",
  // Tam zincir (000000…000600): F2-E/F akışları + Owner taze MFA.
  "scripts/giris-guvenligi/f2e-routes.harness.ts",
  // Arşiv uzman kalıcı silme × F2 denetim tabloları (gerçek purge fonksiyonu).
  "scripts/giris-guvenligi/f2-purge.harness.ts",
  // Owner kritik işlemleri: kanıt (QR / e-posta), saldırı senaryosu, tek kullanım (tam zincir 000700).
  "scripts/giris-guvenligi/f2g-routes.harness.ts",
  "scripts/giris-guvenligi/f2h-routes.harness.ts",
  "scripts/giris-guvenligi/f2i-routes.harness.ts",
  // F2-J: taklit Android yönetici oturumu + kriptografik cihaz kanıtı + kanal tutarlılığı (gerçek route'lar).
  "scripts/giris-guvenligi/f2j-routes.harness.ts",
  // F2-J (N1): çalınmış Owner oturumuyla parola tahmini — arşiv / silme rotalarında giriş ile aynı kilit.
  "scripts/giris-guvenligi/f2j-admin-parola.harness.ts",
  // F2-J (L1): adres doğrulama kodu gönderildiği adrese bağlı (adres değişikliği yarışı).
  "scripts/giris-guvenligi/f2j-eposta.harness.ts",
  // F2-K (N2): çalınmış Owner oturumuyla kalıcı yönetici erişimi (oluşturma / yükseltme / etkinleştirme).
  "scripts/giris-guvenligi/f2k-yonetici.harness.ts",
  // F2-K (A3): oturum anahtarı yalnız resmî uygulamanın iki sinyalli kanalına (varsayılan); diğer bütün istemciler HttpOnly çerez.
  "scripts/giris-guvenligi/f2k-token.harness.ts",
  // HttpOnly nihai: çerez öznitelikleri, yaşam döngüsü, çakışma, CSRF, MFA öncesi red, modlar / kill-switch,
  // ANDROID_APP_SESSION_TRANSPORT=cookie (taklit kapalı + mevcut Android oturumunun çereze yükseltilmesi).
  // "AÇIK" satırları varsayılan header kipinde bilinen Firefox/WebKit taklit boşluğudur (PASS sayılmaz; özette görünür).
  "scripts/giris-guvenligi/httponly-nihai.harness.ts",
  // HttpOnly B-1: eski token → çerez geçiş kapısı (eşzamanlı istek, süre tavanı, ağ/sunucu hatası, değişmeyen kipler).
  "scripts/giris-guvenligi/cookie-migration-gate.check.ts",
  // Yönetici onay bekleyen (pending) giriş kapalı: anormal pending sonucunda anahtar hiçbir kipte gövdeye çıkmaz.
  "scripts/giris-guvenligi/pending-kapali.harness.ts",
  // Owner / admin MFA etkinleştirme provası (e-posta doğrulama → ilk cihaz → çevrimdışı kit → zorunluluk → e-posta / QR girişi →
  // kurtarma kodları → step-up → kayıp cihaz → yanlış hesap; kilitlenme kuralları).
  "scripts/giris-guvenligi/owner-mfa-prova.harness.ts",
  // Owner MFA yalnız e-posta (telefonsuz): kurtarma kodu üretim sırası, kâğıt kitle tam kurtarma, ortam ayarı kilitlenme ölçümü.
  "scripts/giris-guvenligi/owner-mfa-eposta.harness.ts",
  // Owner İki Aşamalı Giriş Yönetimi (Üye Detayı): yalnız Owner; giriş akışıyla aynı yöntem hesabı (Gmail / kapsam / rol
  // kapalıyken açılmaz — negatif kontrol dahil); kaldırma taze MFA + üyeye bağlı tek kullanımlık kanıt; Owner ilk kurulum.
  "scripts/giris-guvenligi/mfa-yonetimi-routes.harness.ts",
  // F2-K (O1): QR onayında 6 haneli yazılan kod + telefon imzası; yanlış kodda bütün açık istekler kapanır.
  "scripts/giris-guvenligi/f2k-qr.harness.ts",
  // F2-K (L4): güvenlik bildirimi kota ayrımı + gönderilemeyen bildirim kaydı.
  "scripts/giris-guvenligi/f2k-bildirim.harness.ts",
  "scripts/giris-guvenligi/purge-senaryolari.harness.ts",
  "scripts/giris-guvenligi/gmail-provider.check.ts",
  // F2-M: SMTP (Turhost) sağlayıcısı — sahte SMTP sunucusu + gerçek PG OTP akışı.
  "scripts/giris-guvenligi/smtp-provider.check.ts",
  "scripts/giris-guvenligi/smtp-otp.harness.ts",
  "scripts/giris-guvenligi/qr-encode.check.ts",
  // Test DB düzey koruması: en son F2 migration'ı = F2_STAGES = testDb.ts; gerçek PG düzeyi; tarayıcı koşucusu yargısı.
  "scripts/giris-guvenligi/f2-test-db-duzey.harness.ts",
  // Owner kilitlenme güvenliği: yanlış MFA ayarında kurtarma yolu kaybolmaz (MFA atlanmaz); Owner kendi zorunluluğu için kit şartı.
  "scripts/giris-guvenligi/owner-kilitlenme.harness.ts",
  // F2-N (001300): Owner MFA zorunluluğu için DB düzeyinde kit şartı — RPC / doğrudan UPDATE / service_role / yükseltme / INSERT,
  // son kit iptali, eşzamanlılık (iki sıra), API atlanmışken savunma derinliği, geri alma + yeniden uygulama, ön kontrol.
  "scripts/giris-guvenligi/f2n-owner-kit-db.harness.ts",
  // SMTP (Turhost) saatlik kota: 50/saat, kayan pencere, örnekler arası (DB), fail-closed; kota dolunca bağlantı yok.
  "scripts/giris-guvenligi/smtp-saatlik-kota.check.ts",
  // Yayın ön kontrolü (salt-okunur): kitsiz zorunlu Owner / Owner sayısı → GO / NO-GO (F2 öncesi production dahil).
  "scripts/giris-guvenligi/f2-owner-kit-onkontrol.harness.ts",
  // F3: kullanıcı e-postası kapsamı (AUTH_EMAIL_SELF_SERVICE_ROLES; varsayılan yalnız Owner) — sunucu denetimi, IDOR/CSRF, bildirim.
  "scripts/giris-guvenligi/f3-eposta-kapsam.harness.ts",
  // F3: gerçek gönderim öncesi SMTP kabul provası — production sağlayıcı yolu (env → smtpProvider → DB kota) + sahte TLS sunucusu;
  // Owner doğrulama → kitsiz red → kit → zorunluluk → e-posta koduyla giriş; süre / kesinti / kimlik / TLS hataları; uzman korunur.
  "scripts/giris-guvenligi/f3-smtp-kabul-provasi.harness.ts",
  // F3: Owner test iletisinin kayıtlı test hesabı alıcısı (EMAIL_OWNER_TEST_RECIPIENT) — alıcı yalnız sunucu ayarından, yalnız Owner,
  // saatte 5 + SMTP 50/saat, uygun olmayan hesap reddi, uzman kapsamı ve kayıtları değişmez.
  "scripts/giris-guvenligi/f3-test-alici.harness.ts",
  // F3 pilot (Owner 26.11): TEK uzman hesabında e-posta DOĞRULAMA pilotu — ayar (UUID + adres özeti) genişletilemez, uygunluk DB'den,
  // yalnız verify_email (adres değişikliği / bildirim / MFA açılmaz), OTP kuralları aynen, IDOR/CSRF, diğer hesaplar aynen.
  "scripts/giris-guvenligi/f3-eposta-pilot.harness.ts",
];

// F2-J: migration yeniden / sırasız uygulama koruması (statik blok denetimi, üretilmiş katalog dosyalarının güncelliği,
// 15 saldırı / hata senaryosu — gerçek embedded-postgres, prod varsayılan yetkileri taklit edilir).
const NODE = [
  ["scripts/giris-guvenligi/f2-migration-guard.mjs", "--denetle"],
  ["scripts/giris-guvenligi/f2-katalog.mjs", "--denetle"],
  ["scripts/giris-guvenligi/f2-migration-guard.harness.mjs"],
];

const steps = [
  ...NODE.map(([f, ...a]) => ({ label: [f, ...a].join(" "), cmd: process.execPath, args: [f, ...a], env: {},
    passRe: /:\s*[1-9][0-9]* PASS[ ,/]+0 FAIL/ })),
  ...PG.map((name) => ({ label: name, cmd: process.execPath, args: ["scripts/final-hardening/run-all.mjs", "--only", name], env: {},
    passRe: /final-hardening run-all: 1\/1 PASS/ })),
  ...(onlyPg ? [] : [
    ...TSX.map((f) => ({ label: f, cmd: process.execPath, args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), f], env: {},
      passRe: /:\s*[1-9][0-9]* PASS[ ,/]+0 FAIL/ })),
    // Önceki fazların route sözleşmeleri TAM zincir üzerinde (000500 + 000600 dahil).
    ...["f2b", "f2c", "f2d"].map((x) => ({ label: `${x}-routes (tam zincir)`, cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), `scripts/giris-guvenligi/${x}-routes.harness.ts`],
      env: { F2_TEST_DB_WITH_F2E: "1" }, passRe: /:\s*[1-9][0-9]* PASS[ ,/]+0 FAIL/ })),
    // F2-E sözleşmeleri EN GÜNCEL zincirde (F2-G step-up, F2-I MFA'sız oturum kapatma dahil) + 72 saat kuralının ayrı kanıtı.
    { label: "f2e-routes (en güncel zincir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/f2e-routes.harness.ts"],
      env: { F2_TEST_DB_LATEST: "1" }, passRe: /f2e-routes harness: [1-9][0-9]* PASS \/ 0 FAIL/,
      mustRe: /\[f2-test-db\] düzey kayıt=(\d+) katalog=\1 en-güncel=\1\b/ },
    // NEGATİF KONTROL: 72 saat denetimi geçici test DB'sinden kaldırılınca f2e-routes FAIL VERMELİ (test kör değil).
    { label: "f2e-routes NEGATİF (72 saat denetimi kaldırılmış test DB → FAIL beklenir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/f2e-routes.harness.ts"],
      env: { F2_TEST_DB_LATEST: "1", F2E_NEGATIF_72S: "1" }, expectFail: true,
      passRe: /f2e-routes harness: [0-9]+ PASS \/ [1-9][0-9]* FAIL/,
      mustRe: /NEGATİF KONTROL: 72 saat denetimi[^\n]*[\s\S]*FAIL 72 saat dolmadan yürütme yok[\s\S]*FAIL TAM ZİNCİR: geçerli step-up kanıtına rağmen 72 saat/ },
    // NEGATİF KONTROL (SMTP kota): kapı kaldırılınca kota aşılır → FAIL VERMELİ.
    { label: "smtp-saatlik-kota NEGATİF (SMTP_KOTA_KORUMASIZ=1 → FAIL beklenir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/smtp-saatlik-kota.check.ts"],
      env: { SMTP_KOTA_KORUMASIZ: "1" }, expectFail: true, passRe: /smtp-saatlik-kota: [0-9]+ PASS \/ [1-9][0-9]* FAIL/,
      mustRe: /\(SMTP_KOTA_KORUMASIZ=1\)[\s\S]*FAIL sınır 5 iken 5 ileti gitti[\s\S]*FAIL production fabrikası/ },
    // NEGATİF KONTROL (F2-N): 001300 OLMADAN kitsiz Owner zorunluluğu DB'den geçer → FAIL VERMELİ.
    { label: "f2n-owner-kit-db NEGATİF (F2N_NEGATIF=1, 001300 yok → FAIL beklenir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/f2n-owner-kit-db.harness.ts"],
      env: { F2N_NEGATIF: "1" }, expectFail: true, passRe: /f2n-owner-kit-db: [0-9]+ PASS \/ [1-9][0-9]* FAIL/,
      mustRe: /NEGATİF: 001300 YOK[\s\S]*FAIL doğrudan RPC \(auth_mfa_set_required\) → YF401[\s\S]*FAIL doğrudan UPDATE \(service_role/ },
    // NEGATİF KONTROLLER (Owner kilitlenme): düzeltme kaldırılınca ilgili maddeler FAIL VERMELİ.
    ...[
      ["OWNER_KILIT_ESKI_COZUMLEME", /\(OWNER_KILIT_ESKI_COZUMLEME=1\)[\s\S]*FAIL kapsam tanımsız[^\n]*YALNIZ kurtarma kodu sunulur[\s\S]*FAIL yöntem listesi boş/],
      ["OWNER_KIT_KORUMASIZ", /\(OWNER_KIT_KORUMASIZ=1\)[\s\S]*FAIL kit yokken Owner kendi zorunluluğunu AÇAMAZ/],
      ["OWNER_AYAR_KORUMASIZ", /\(OWNER_AYAR_KORUMASIZ=1\)[\s\S]*FAIL ayar hatası: tanınmayan yöntem adı/],
    ].map(([v, mustRe]) => ({ label: `owner-kilitlenme NEGATİF (${v}=1 → FAIL beklenir)`, cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/owner-kilitlenme.harness.ts"],
      env: { [v]: "1" }, expectFail: true, passRe: /owner-kilitlenme: [0-9]+ PASS \/ [1-9][0-9]* FAIL/, mustRe })),
    // NEGATİF KONTROL (F3): kapsam kararı "her zaman açık" yapılınca uzman / yönetici / bildirim maddeleri FAIL VERMELİ.
    { label: "f3-eposta-kapsam NEGATİF (F3_KAPSAM_NEGATIF=1 → FAIL beklenir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/f3-eposta-kapsam.harness.ts"],
      env: { F3_KAPSAM_NEGATIF: "1" }, expectFail: true, passRe: /f3-eposta-kapsam: [0-9]+ PASS \/ [1-9][0-9]* FAIL/,
      mustRe: /NEGATİF KONTROL \(F3_KAPSAM_NEGATIF=1\)[\s\S]*FAIL uzman kod isteği → 403[\s\S]*FAIL Owner OLMAYAN yönetici de kapalı[\s\S]*FAIL uzmana bildirim GİTMEDİ/ },
    // NEGATİF KONTROL (F3 pilot): pilot kararı "her zaman açık" yapılınca pilot dışı uzman / uygunluk / adres maddeleri FAIL VERMELİ.
    { label: "f3-eposta-pilot NEGATİF (F3_PILOT_NEGATIF=1 → FAIL beklenir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/f3-eposta-pilot.harness.ts"],
      env: { F3_PILOT_NEGATIF: "1" }, expectFail: true, passRe: /f3-eposta-pilot: [0-9]+ PASS \/ [1-9][0-9]* FAIL/,
      mustRe: /NEGATİF KONTROL \(F3_PILOT_NEGATIF=1\)[\s\S]*FAIL adres değişince[\s\S]*FAIL Pasif \(erişim kısıtı\) → pilot KAPALI[\s\S]*FAIL pilot dışı uzman: kapalı/ },
    // NEGATİF KONTROL (F3 test alıcısı): uygunluk denetimi kaldırılınca demo / pasif / arşiv / etkin değil maddeleri FAIL VERMELİ.
    { label: "f3-test-alici NEGATİF (F3_ALICI_NEGATIF=1 → FAIL beklenir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/f3-test-alici.harness.ts"],
      env: { F3_ALICI_NEGATIF: "1" }, expectFail: true, passRe: /f3-test-alici: [0-9]+ PASS \/ [1-9][0-9]* FAIL/,
      mustRe: /NEGATİF KONTROL \(F3_ALICI_NEGATIF=1\)[\s\S]*FAIL f3-alici-demo@test\.local → not_eligible[\s\S]*FAIL access_restricted_at = now\(\) → not_eligible/ },
    // NEGATİF KONTROL: A3 öncesi kural yüklenince taklit testleri FAIL VERMELİ (vermiyorsa test kör demektir).
    { label: "f2k-token NEGATİF (F2K_A3_WITHOUT_FIX=1 → FAIL beklenir)", cmd: process.execPath,
      args: [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/giris-guvenligi/f2k-token.harness.ts"],
      env: { F2K_A3_WITHOUT_FIX: "1" }, expectFail: true, passRe: /f2k-token:\s*[0-9]+ PASS, [1-9][0-9]* FAIL/ },
  ]),
];

const results = [];
for (const s of steps) {
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, {
    cwd: root, encoding: "utf8", timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...s.env },
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const summary = out.split("\n").filter((l) => s.passRe.test(l) || /RESULT:|PASS \/|PASS,|run-all:/.test(l)).slice(-2).join(" | ").trim();
  // Çıkış kodu 0 (harness / run-all FAIL varsa 1 döner) VE tanınan "geçti" özeti — ikisi birden şart.
  const passed = s.expectFail
    ? r.status === 1 && !r.error && s.passRe.test(out) && (s.mustRe ?? /NEGATİF KONTROL: A3 öncesi kural yüklendi/).test(out)
    : r.status === 0 && !r.error && s.passRe.test(out) && (!s.mustRe || s.mustRe.test(out));
  results.push({ label: s.label, passed, sec: Math.round((Date.now() - t0) / 1000), summary: summary || "(özet satırı yok)" });
  console.log(`${passed ? "PASS" : "FAIL"}  ${s.label}  (${Math.round((Date.now() - t0) / 1000)} sn)  ${summary || "(özet satırı yok)"}`);
  if (!passed) {
    console.log(out.split("\n").filter((l) => /FAIL|Error|HATA|error/.test(l)).slice(0, 30).join("\n"));
    if (r.error) console.log(`  süreç hatası: ${r.error.message}`);
  }
}
const failed = results.filter((x) => !x.passed);
console.log(`\ngiriş güvenliği F2 CI: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` — FAIL: ${failed.map((f) => f.label).join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
