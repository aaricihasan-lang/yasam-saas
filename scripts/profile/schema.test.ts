/**
 * UZMAN PROFİLİ (F1) — saf şema + rapor kimliği testleri (DB / ağ YOK).
 * Çalıştır: npx tsx scripts/profile/schema.test.ts
 */
import {
  EMPTY_PROFILE, PROFILE_FLAG_FIELDS, PROFILE_LIMITS, PROFILE_TEXT_FIELDS, charCount, isValidEmail, isValidWebsite, normalizeProfileText,
  parseExpectedVersion, parseProfilePatch, type ProfileFields,
} from "../../lib/profile/schema";
import { reportIdentityOf } from "../../lib/profile/identity";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const n = (f: Parameters<typeof normalizeProfileText>[0], v: unknown) => normalizeProfileText(f, v);
const val = (f: Parameters<typeof normalizeProfileText>[0], v: unknown) => { const r = n(f, v); return r.ok ? r.value : `ERR:${r.error}`; };
const bad = (f: Parameters<typeof normalizeProfileText>[0], v: unknown) => !n(f, v).ok;
const ch = (c: number) => String.fromCharCode(c);

console.log("[varsayılanlar]");
ok(EMPTY_PROFILE.reportBrandingEnabled === false, "boş profilde rapor markalaması KAPALI (eski/yeni kullanıcıda raporlar değişmez)");
ok(PROFILE_TEXT_FIELDS.every((f) => EMPTY_PROFILE[f] === null), "boş profilde tüm metinler null");
ok(EMPTY_PROFILE.reportShowTitle && EMPTY_PROFILE.reportShowOrganization && EMPTY_PROFILE.reportShowContact && EMPTY_PROFILE.reportShowNote, "alan anahtarları varsayılan açık (yalnız ana anahtar açıkken anlamlı)");
ok(Object.isFrozen(EMPTY_PROFILE), "EMPTY_PROFILE donmuş (paylaşılan nesne değiştirilemez)");
ok(PROFILE_LIMITS.title === 80 && PROFILE_LIMITS.organization === 120 && PROFILE_LIMITS.phone === 32 && PROFILE_LIMITS.contactEmail === 254 && PROFILE_LIMITS.website === 200 && PROFILE_LIMITS.bio === 1000 && PROFILE_LIMITS.reportNote === 300, "sınırlar migration CHECK'leriyle aynı");

console.log("[normalize]");
ok(val("title", "  Psikolojik Danışman  ") === "Psikolojik Danışman", "baş/son boşluk kırpılır");
ok(val("title", "   ") === null && val("bio", "\n \n") === null && val("title", "") === null, "boş / yalnız boşluk → null");
ok(val("title", null) === null && val("title", undefined) === null, "null / undefined → null");
ok(bad("title", 5) && bad("title", true) && bad("bio", ["a"]) && bad("bio", { a: 1 }), "metin dışı tür reddedilir");
ok(val("bio", "Satır 1\r\nSatır 2\rSatır 3") === "Satır 1\nSatır 2\nSatır 3", "biyografide CRLF / CR → LF");
ok(val("title", "Café") === "Café", "NFC normalizasyonu (birleşik aksan tek karaktere)");
ok(val("title", "ş".repeat(80)) === "ş".repeat(80) && bad("title", "ş".repeat(81)), "unvan 80 kod noktası kabul, 81 ret");
ok(!bad("organization", "a".repeat(120)) && bad("organization", "a".repeat(121)), "kurum 120 / 121");
ok(!bad("bio", "🙂".repeat(1000)) && bad("bio", "🙂".repeat(1001)), "biyografi kod noktasıyla sayılır (emoji 1 karakter): 1000 / 1001");
ok(charCount("🙂a") === 2 && "🙂a".length === 3, "charCount UTF-16 değil kod noktası sayar (PostgreSQL char_length ile aynı)");
ok(!bad("reportNote", "a".repeat(300)) && bad("reportNote", "a".repeat(301)), "rapor dipnotu 300 / 301");
ok(!bad("bio", Array(20).fill("x").join("\n")) && bad("bio", Array(21).fill("x").join("\n")), "biyografi en fazla 20 satır");
ok(!bad("reportNote", "a\nb\nc\nd") && bad("reportNote", "a\nb\nc\nd\ne"), "rapor dipnotu en fazla 4 satır");

console.log("[kötü niyetli metin]");
ok(bad("title", "a\nb") && bad("organization", "a\nb"), "tek satırlı alanda satır sonu reddedilir");
ok(bad("bio", "a" + ch(0) + "b") && bad("title", "a" + ch(0) + "b"), "NUL reddedilir");
ok(bad("bio", "a\tb") && bad("bio", "a" + ch(0x1b) + "[31m") && bad("bio", "a" + ch(0x7f)), "sekme / ESC (ANSI) / DEL reddedilir");
ok([0x202e, 0x202d, 0x202a, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c, 0xfeff, 0x2028, 0x2029].every((c) => bad("title", "abc" + ch(c) + "def") && bad("bio", "abc" + ch(c) + "def")),
  "görünmez yön işaretleri (RLO/LRO/LRE/LRI/RLI/FSI/PDI/LRM/RLM/ALM), BOM, satır/paragraf ayırıcı reddedilir");
ok(bad("title", "a" + ch(0xd800) + "b") && bad("bio", ch(0xdc00)), "eşleşmemiş vekil (lone surrogate) reddedilir");
ok(!bad("bio", "Aile 👨\u200D👩\u200D👧 danışmanlığı"), "ZWJ'li emoji dizisi kabul (U+200D yasak değil)");
ok(bad("bio", "<script>alert(1)</script>") && bad("title", "</b>") && bad("organization", "<img src=x onerror=alert(1)>") && bad("reportNote", "<!-- x -->") && bad("bio", "<?php"), "etiket başlangıcı reddedilir (<script, </b, <img, <!--, <?)");
ok(!bad("bio", "3 < 5 ve 7 > 2") && !bad("bio", "<3") && !bad("title", "A & B > C") && !bad("bio", "\"tırnak\" 'tek' `ters`"), "doğal < > & tırnak kullanımı serbest (metin olarak saklanır, HTML işlenmez)");
ok(val("bio", "<3 ' OR 1=1 --") === "<3 ' OR 1=1 --", "SQL benzeri metin olduğu gibi metin olarak saklanır");

console.log("[telefon]");
ok(val("phone", "+90 (532) 123-45-67") === "+90 (532) 123-45-67" && !bad("phone", "05321234567"), "geçerli telefon biçimleri");
ok(bad("phone", "0532 ABC 45") && bad("phone", "123") && bad("phone", "1".repeat(16)) && bad("phone", "+90.532.123") && bad("phone", "tel:05321234567"), "harf / az rakam / 15+ rakam / nokta / tel: ret");
ok(bad("phone", "1 ".repeat(17)), "33+ karakter ret");

console.log("[e-posta]");
ok(isValidEmail("ayse.yilmaz+rapor@example.invalid") && isValidEmail("a@b.co"), "geçerli e-postalar");
ok(!isValidEmail("ayse.example.invalid") && !isValidEmail("a@@b.co") && !isValidEmail("a b@b.co") && !isValidEmail("a@b") && !isValidEmail("a@-b.co") && !isValidEmail("a@b_c.co") && !isValidEmail("<a>@b.co") && !isValidEmail("a@b.c0"), "geçersiz e-postalar");
ok(!isValidEmail("a".repeat(65) + "@b.co") && !isValidEmail("a@" + "b".repeat(250) + ".co"), "yerel kısım > 64 / toplam > 254 ret");
ok(bad("contactEmail", "javascript:alert(1)@x.co") === true, "javascript: içeren adres ret (yerel kısımda ':' yasak)");

console.log("[internet sitesi]");
ok(isValidWebsite("https://www.example.invalid") && isValidWebsite("https://ornek.com.tr/hakkimda?x=1#iletisim") && isValidWebsite("https://xn--rnek-zoa.com:8443/"), "geçerli https adresleri (punycode dahil)");
for (const u of ["http://example.com", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "file:///etc/passwd", "//example.com", "example.com", "www.example.com",
  "https://user:pw@example.com", "https://evil.com@good.com", "https://localhost", "https://a.localhost", "https://127.0.0.1", "https://[::1]/", "https://example", "https://exa mple.com",
  "https://example.com/a b", "https://example.com/<script>", "https://example.com/\"x", "https://exa_mple.com", "https://-x.com", "https://şirket.com", "HTTPS://example.com", " https://example.com\n/x"]) {
  ok(bad("website", u), `site ret: ${JSON.stringify(u)}`);
}
ok(bad("website", "https://" + "a".repeat(189) + ".com"), "201 karakter site ret");
ok(val("website", "  https://www.example.invalid  ") === "https://www.example.invalid", "site kırpılır, normalize edilmeden (değiştirilmeden) saklanır");

console.log("[yama ayrıştırma]");
const full: ProfileFields = { ...EMPTY_PROFILE, title: "Uzman", organization: "Yaşam Merkezi", phone: "+90 532 123 45 67", contactEmail: "ayse@example.invalid", website: "https://example.invalid", bio: "Kısa\nbiyografi", reportNote: "Not", reportBrandingEnabled: true };
const pf = parseProfilePatch(full);
ok(pf.ok && JSON.stringify(pf.value) === JSON.stringify(full), "tam profil kabul, çıktı aynı");
const sub = parseProfilePatch({ title: "Yalnız unvan" });
ok(sub.ok && Object.keys(sub.value).length === 1 && sub.value.title === "Yalnız unvan", "alt küme kabul; gönderilmeyen alan çıktıya eklenmez (değişmez)");
ok(parseProfilePatch({}).ok, "boş yama kabul (değişiklik yok)");
for (const k of ["full_name", "fullName", "name", "email", "password", "role", "package_type", "plan", "tenant_id", "user_id", "id", "is_demo_account", "module_permissions", "admin_level", "logoAssetId", "logo_source", "approval_status"]) {
  const r = parseProfilePatch({ title: "x", [k]: "x" });
  ok(!r.ok && r.path === `profile.${k}` && r.error === "Bu alan profilden değiştirilemez.", `hesap alanı ret: ${k}`);
}
const unk = parseProfilePatch({ titel: "x" });
ok(!unk.ok && unk.path === "profile.titel" && unk.error === "Bilinmeyen alan.", "bilinmeyen alan ret (yol ile)");
const proto = parseProfilePatch(JSON.parse('{"__proto__": {"reportBrandingEnabled": true}, "title": "x"}'));
ok(!proto.ok && proto.path === "profile.__proto__", "__proto__ anahtarı bilinmeyen alan olarak reddedilir (prototip kirliliği yok)");
ok(!parseProfilePatch(null).ok && !parseProfilePatch([]).ok && !parseProfilePatch("x").ok, "nesne dışı profil ret");
const multi = parseProfilePatch({ title: "a".repeat(81), website: "http://x.com", reportBrandingEnabled: "true", phone: "abc" });
ok(!multi.ok && !!multi.fields && Object.keys(multi.fields).sort().join(",") === "phone,reportBrandingEnabled,title,website", "geçersiz alanlar alan bazında TOPLU döner", multi);
ok(PROFILE_FLAG_FIELDS.every((f) => !parseProfilePatch({ [f]: 1 }).ok && !parseProfilePatch({ [f]: "false" }).ok && parseProfilePatch({ [f]: false }).ok), "anahtarlar yalnız gerçek boolean");
ok(parseExpectedVersion(0).ok && parseExpectedVersion(5).ok && !parseExpectedVersion(-1).ok && !parseExpectedVersion(1.5).ok && !parseExpectedVersion("1").ok && !parseExpectedVersion(undefined).ok, "expectedVersion doğrulaması");

console.log("[rapor kimliği (F3 bağlantı noktası)]");
ok(reportIdentityOf({ ...full, reportBrandingEnabled: false }, { fullName: "Ayşe Yılmaz" }) === null, "ana anahtar kapalı → null (rapor bugünkü gibi)");
ok(reportIdentityOf(EMPTY_PROFILE, { fullName: "Ayşe Yılmaz" }) === null, "boş profil → null");
const idAll = reportIdentityOf(full, { fullName: " Ayşe Yılmaz " });
ok(!!idAll && idAll.fullName === "Ayşe Yılmaz" && idAll.title === "Uzman" && idAll.organization === "Yaşam Merkezi" && !!idAll.phone && !!idAll.contactEmail && !!idAll.website && idAll.note === "Not", "açık + tüm alanlar → hepsi");
const idSome = reportIdentityOf({ ...full, reportShowTitle: false, reportShowContact: false, reportShowNote: false }, { fullName: null });
ok(!!idSome && idSome.title === null && idSome.phone === null && idSome.contactEmail === null && idSome.website === null && idSome.note === null && idSome.organization === "Yaşam Merkezi" && idSome.fullName === null, "alan anahtarları tek tek gizler");

console.log(`\nprofile schema test: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
