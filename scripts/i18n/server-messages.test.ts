/**
 * I18N-F1-R2 — lib/i18n/serverMessages.ts güvenlik sözleşmesi: çevirici HİÇBİR koşulda istisna fırlatmaz,
 * kullanıcıya ham anahtar ("auth.server.x") veya iç ayrıntı göstermez, Türkçe çıktı birebir korunur.
 * Çalıştırma: npx tsx scripts/i18n/server-messages.test.ts
 */
import { localeTranslator, requestTranslator } from "../../lib/i18n/serverMessages";

let pass = 0, fail = 0;
const ok = (c: unknown, n: string, d?: unknown) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.error(`  FAIL ${n} ${d === undefined ? "" : JSON.stringify(d)}`); } };
const req = (v?: string) => ({ cookies: { get: (n: string) => (n === "NEXT_LOCALE" && v ? { name: n, value: v } : undefined) } }) as never;

process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "off";
const trT = requestTranslator(req("en"), "auth.server");
ok(trT("common.pending") === "Hesabınız yönetici onayı bekliyor.", "kapı kapalı: eski en çerezine rağmen Türkçe, birebir");
process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING = "on";
const enT = requestTranslator(req("en"), "auth.server");
ok(enT("common.pending") !== "Hesabınız yönetici onayı bekliyor." && !/[çğıöşüİ]/.test(enT("common.pending")), "kapı açık: İngilizce metin");
const missing = enT("bu.anahtar.yok");
ok(missing !== "" && !missing.includes("auth.server") && !missing.includes("bu.anahtar.yok"), "eksik anahtar → ham anahtar / boş metin DEĞİL, genel hata metni", missing);
let threw = false;
try { requestTranslator({ cookies: { get: () => { throw new Error("cookie patladı"); } } } as never, "auth.server")("common.pending"); } catch { threw = true; }
ok(!threw, "çerez okuma istisnası yanıtı bozmaz (istisna fırlatılmaz)");
threw = false;
try { requestTranslator(null, "olmayan.namespace")("x"); requestTranslator({} as never, "auth.server")("common.pending"); } catch { threw = true; }
ok(!threw, "olmayan namespace / çerezsiz istek (Android başlık yolu) istisna fırlatmaz");
const androidLike = requestTranslator({} as never, "auth.server")("common.pending");
ok(androidLike === "Hesabınız yönetici onayı bekliyor.", "çerezsiz istek → kaynak dil (tr)");
const icu = enT("common.pending", { gereksiz: "x" });
ok(typeof icu === "string" && icu.length > 0, "fazla argüman istisna üretmez");
const lines = localeTranslator("en", "auth.email").raw("notice.recovery_codes_generated.lines");
ok(Array.isArray(lines) || lines === undefined, "raw: dizi ya da undefined (istisna yok)", typeof lines);
ok(localeTranslator("en", "auth.email").raw("yok.anahtar") === undefined, "raw: eksik anahtar → undefined (ham yol değil)");
delete process.env.NEXT_PUBLIC_I18N_LOCALE_SWITCHING;
console.log(`\n=== sunucu çevirici güvenlik testi: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
