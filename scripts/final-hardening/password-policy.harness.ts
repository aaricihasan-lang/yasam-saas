/**
 * Parola politikası + göster/gizle kontrolü harness'ı (owner kararı 2026-10 — satış öncesi delta).
 * Saf mantık + statik sözleşme (prod'a temas YOK). Tarayıcı davranışı ayrıca Playwright ile
 * yerel derlemede doğrulanır (rapor).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASSWORD_MIN_LENGTH,
  isObviousPassword,
  newPasswordPolicyCode,
  newPasswordPolicyMessage,
} from "../../lib/auth/passwordPolicy";
import { passwordPolicyError, validateRegisterBody, REGISTER_PASSWORD_MIN } from "../../lib/auth/registerValidation";
import { validateNewPassword, MIN_PASSWORD_LENGTH } from "../../lib/admin/accountSessionControls";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}`);
};

console.log("── A) Politika (tek kaynak) ──");
ok(PASSWORD_MIN_LENGTH === 6 && REGISTER_PASSWORD_MIN === 6 && MIN_PASSWORD_LENGTH === 6, "minimum 6 (kayıt + admin sıfırlama aynı kaynak)");
ok(newPasswordPolicyCode("48273") === "password_too_short", "5 karakter → reddedilir");
ok(newPasswordPolicyCode("482731") === null, "6 rakam (482731) → kabul");
ok(newPasswordPolicyCode("kelime") === null, "6 harf → kabul");
ok(newPasswordPolicyCode("Gü9!x#Lm2v") === null, "karmaşık parola → kabul");
ok(newPasswordPolicyCode("deniz58") === null && newPasswordPolicyCode("denizkiz") === null, "özel karakter zorunluluğu YOK");
ok(newPasswordPolicyCode("yasemin7") === null, "büyük harf zorunluluğu YOK");
ok(newPasswordPolicyCode("993018") === null && newPasswordPolicyCode("ağaçlık") === null, "harf+rakam kombinasyonu ZORUNLU DEĞİL");
for (const p of ["123456", "000000", "111111", "654321", "999999", "234567", "987654", "1234567890", "123123", "qwerty", "abcdef", "parola", "aaaaaa"]) {
  ok(newPasswordPolicyCode(p) === "password_too_common", `bariz parola reddi: ${p}`);
}
ok(!isObviousPassword("482731") && !isObviousPassword("135792") && !isObviousPassword("852147"), "rastgele 6 haneli rakamlar bariz SAYILMAZ");
ok(newPasswordPolicyCode("a@b.co", "a@b.co") === "password_equals_email", "e-posta ile aynı → reddedilir");
ok(newPasswordPolicyCode("x".repeat(129)) === "password_too_long", "128 üstü → reddedilir");
ok(/Parola/.test(newPasswordPolicyMessage("12") ?? "") && !/PIN|şifre/i.test(Object.values({ a: newPasswordPolicyMessage("12"), b: newPasswordPolicyMessage("123456") }).join(" ")), "mesajlar 'Parola' terimini kullanır (PIN/şifre YOK)");
ok(!/bcrypt|hash|cost/i.test([newPasswordPolicyMessage("12"), newPasswordPolicyMessage("123456")].join(" ")), "kullanıcı mesajında hash/teknik ayrıntı YOK");

console.log("\n── B) Sunucu yolları aynı politikayı uygular ──");
ok(validateRegisterBody({ fullName: "Ad Soyad", email: "a@b.co", password: "482731" }).ok === true, "kayıt: 6 rakam kabul");
ok(validateRegisterBody({ fullName: "Ad Soyad", email: "a@b.co", password: "48273" }).ok === false, "kayıt: 5 karakter red");
ok(validateRegisterBody({ fullName: "Ad Soyad", email: "a@b.co", password: "123456" }).ok === false, "kayıt: bariz parola red");
ok(passwordPolicyError("kelime") === null, "kayıt istemci kontrolü: 6 harf kabul");
ok(validateNewPassword("482731").ok === true && validateNewPassword("48273").ok === false && validateNewPassword("000000").ok === false, "admin sıfırlama: aynı politika");
const reg = read("app/api/register/route.ts");
const cp = read("app/api/settings/change-password/route.ts");
const adminCreate = read("app/api/admin/users/route.ts");
const adminReset = read("app/api/admin/users/[id]/password/route.ts");
ok(/newPasswordPolicyMessage\(/.test(reg), "register route: politika sunucuda");
ok(/newPasswordPolicyMessage\(/.test(cp), "change-password route: politika sunucuda");
ok(/newPasswordPolicyMessage\(/.test(adminCreate), "admin oluşturma route: politika sunucuda");
ok(/validateNewPassword\(/.test(adminReset), "admin sıfırlama route: validateNewPassword (politika)");
ok([reg, cp, adminCreate, adminReset].every((s) => /hash_password/.test(s)), "dört yol da hash_password RPC (bcrypt cost 10) kullanır");
const login = read("app/api/auth/session/route.ts");
ok(!/passwordPolicy|NEW_PASSWORD_MIN_LENGTH|newPasswordPolicy/.test(login), "girişte politika YOK (mevcut parolalar etkilenmez)");
const mig = read("supabase/migrations/20271001000000_auth_password_session_hardening.sql");
ok(/gen_salt\('bf'::text, 10\)/.test(mig) && /v_cost < 10/.test(mig), "saklama güvenliği korunur: cost 10 + progressive rehash (M1)");

console.log("\n── C) Göster/gizle bileşeni sözleşmesi ──");
const comp = read("components/ui/PasswordInput.tsx");
ok(/type=\{visible \? "text" : "password"\}/.test(comp) && /useState\(false\)/.test(comp), "varsayılan gizli; göz → text, tekrar → password");
ok(/<button\s+type="button"/.test(comp), "buton type=\"button\" (submit tetiklemez)");
ok(/"Parolayı gizle"/.test(comp) && /"Parolayı göster"/.test(comp) && /aria-label=\{label\}/.test(comp), "aria-label: Parolayı göster / Parolayı gizle");
ok(/aria-pressed=\{visible\}/.test(comp) && /aria-controls=\{inputId\}/.test(comp), "aria-pressed + aria-controls");
ok(/h-10 w-10/.test(comp) && /pr-12/.test(comp), "≥40px dokunma alanı; input sağ boşluğu metni korur");
ok(!/console\.|fetch\(|localStorage|sessionStorage|clipboard|gtag|dataLayer|track/i.test(comp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "toggle yalnız yerel UI: log/istek/depolama/pano/analitik YOK");
ok(/EyeOff/.test(comp) && /<Eye /.test(comp), "görünürken 'göz kapalı' ikonu");
ok(!/autoComplete=/.test(comp.split("return (")[1] ?? "") || /\{\.\.\.rest\}/.test(comp), "autoComplete çağırandan geçer (bileşen değiştirmez)");
ok(/::-ms-reveal/.test(read("app/globals.css")), "Edge yerleşik göz düğmesi gizli (çift ikon yok)");

console.log("\n── D) Tüm kullanıcıya açık parola alanları ortak bileşeni kullanır ──");
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir))) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const rel = `${dir}/${e}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, acc);
    else if (/\.tsx$/.test(e)) acc.push(rel);
  }
  return acc;
}
const uiFiles = [...walk("app"), ...walk("components")].filter((f) => f !== "components/ui/PasswordInput.tsx");
const rawPw = uiFiles.filter((f) => /type=["{][^>]*?"password"|type="password"/.test(read(f)));
ok(rawPw.length === 0, `ham type="password" kalan dosya yok (${rawPw.join(", ") || "0"})`);
const page = read("app/page.tsx");
ok(/<PasswordInput\s+id="login-password"\s+autoComplete="current-password"/.test(page), "giriş modalı: PasswordInput + current-password");
ok(/id="login-email"[\s\S]{0,60}autoComplete="username"/.test(page), "giriş e-posta alanı autoComplete=username (parola yöneticisi)");
const regPage = read("app/register/page.tsx");
ok((regPage.match(/<PasswordInput/g) ?? []).length === 2 && (regPage.match(/autoComplete="new-password"/g) ?? []).length >= 2, "kayıt: 2 alan PasswordInput + new-password");
const settings = read("app/settings/page.tsx");
ok(/autoComplete="current-password"/.test(settings) && /autoComplete="new-password"/.test(settings) && /<PasswordInput/.test(settings), "parola değiştirme: current/new-password + ortak bileşen");
const adminDetail = read("app/admin/users/[id]/page.tsx");
ok((adminDetail.match(/<PasswordInput/g) ?? []).length === 3, "admin: sıfırlama (2) + arşiv onayı (1) ortak bileşen");
ok(/<PasswordInput id="create-password"/.test(read("app/admin/users/page.tsx")), "admin uzman oluşturma: ortak bileşen");

console.log("\n── E) Terim: 'Parola' (PIN değil) ──");
const trHome = JSON.parse(read("messages/tr/home.json"));
const flat = JSON.stringify(trHome);
ok(!/"Şifre"|Şifremi Unuttum|Şifre Tekrar/.test(flat) && /Parolamı Unuttum/.test(flat), "TR giriş/kayıt metinleri 'Parola'");
const authUi = [page.slice(page.indexOf('id="login-password"') - 2000, page.indexOf('id="login-password"') + 2000), regPage, settings];
ok(authUi.every((s) => !/\bPIN\b/.test(s)), "parola arayüzlerinde 'PIN' YOK");

console.log("\n── F) Hukuki işletmeci kimliği — iç kapı (kullanıcıya görünmez) ──");
{
  const li = read("lib/legal/legalIdentity.ts");
  ok(/LEGAL OPERATOR IDENTITY — REQUIRED BEFORE PAID COMMERCIAL LAUNCH/.test(li) && /LEGAL_OPERATOR_IDENTITY_GATE/.test(li), "iç kapı tanımlı (LEGAL OPERATOR IDENTITY BEFORE PAID COMMERCIAL LAUNCH)");
  ok(/legalName: null/.test(li) && /address: null/.test(li) && /taxOrMersis: null/.test(li) && /kep: null/.test(li), "resmî kimlik alanları uydurulmadı (null)");
  const legalUi = [
    "app/kvkk-aydinlatma/page.tsx", "app/gizlilik-politikasi/page.tsx", "app/kullanim-sartlari/page.tsx",
    "app/veri-isleme-sozlesmesi/page.tsx", "app/alt-isleyiciler/page.tsx", "app/iletisim/page.tsx",
    "components/kvkk/LegalIdentityBlock.tsx", "components/kvkk/LegalPageShell.tsx",
  ].map(read).join("\n");
  ok(!/LEGAL_OPERATOR_IDENTITY_GATE|isLegalOperatorIdentityComplete|PAID COMMERCIAL LAUNCH/.test(legalUi), "iç kapı UI'da render edilmez");
  ok(!/A\.Ş\.|Ltd\.?\s*Şti|Limited Şirketi|Anonim Şirketi/.test(legalUi), "kayıtlı şirket/tüzel kişi gibi sunulmaz");
}

console.log(`\npassword-policy harness: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
