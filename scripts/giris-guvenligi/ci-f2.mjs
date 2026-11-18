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
  "pg:session-f2j", "pg:session-f2k", "pg:session-f2j-on-f2k", "pg:session-f2i-on-f2k", "pg:session-f2g-on-f2k", "pg:session-f2i-on-f2j", "pg:session-f2g-on-f2j", "pg:session-f2a-on-f2j",
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
  // F2-K (O1): QR onayında 6 haneli yazılan kod + telefon imzası; yanlış kodda bütün açık istekler kapanır.
  "scripts/giris-guvenligi/f2k-qr.harness.ts",
  // F2-K (L4): güvenlik bildirimi kota ayrımı + gönderilemeyen bildirim kaydı.
  "scripts/giris-guvenligi/f2k-bildirim.harness.ts",
  "scripts/giris-guvenligi/purge-senaryolari.harness.ts",
  "scripts/giris-guvenligi/gmail-provider.check.ts",
  "scripts/giris-guvenligi/qr-encode.check.ts",
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
    ? r.status === 1 && !r.error && s.passRe.test(out) && /NEGATİF KONTROL: A3 öncesi kural yüklendi/.test(out)
    : r.status === 0 && !r.error && s.passRe.test(out);
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
