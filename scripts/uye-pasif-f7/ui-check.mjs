/**
 * ÜYE PASİFLEŞTİRME F7 — kişiye özel üyelik uyarısı TARAYICI testi (Playwright; yalnız localhost; sentetik yığın).
 * Önkoşul: scripts/uye-arsiv-4a/ui-stack.ts + yerel `next dev` (UD2_BASE). Production'a temas YOK.
 * Yığına 20280126000000 / 000100 / 000200 + 20280127000000 migration'larını uygular (yeniden çalıştırılabilir).
 *
 *   [1] Pasif Yap penceresi: "Üyeye özel uyarı göster" varsayılan KAPALI · 3 hazır mesaj önizlemede · düzenleme sayaç ·
 *       tamamen özel · 500 aşımında onay kapalı · HTML önizlemede düz metin
 *   [2] mesajlı Pasif Yap → uzman ana sayfa bandı kişiye özel metin (HTML düz metin, betik çalışmaz)
 *   [3] yönetici sonradan düzenler → uzman sekmesi görünür olunca yeni metin (yeniden giriş yok) · kaldırır → standart metin
 *   [4] iki yönetici sekmesi aynı anda düzenler → ikincisi "bu sırada değiştirilmiş" (409), veri tutarlı
 *   [5] Aktif Yap → bant kalkar · yeniden Pasif Yap (mesajsız) → STANDART metin (eski mesaj yok)
 *   [6] isimlendirme: Arşivle + açıklamalar · Pasif Yap açıklaması · yönetici hesabında "Girişi Kapat"
 *   [7] 360 px: uzun özel mesajla bant ve yönetici penceresi taşmaz
 *   [8] kayıtlar korunur, konsolda beklenmeyen hata yok
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimShotsDir, resolveUiConfig } from "../uye-yonetimi-faz2/uiKosu.mjs";

const BASE = process.env.UD2_BASE ?? "http://localhost:3974";
const SHOTS = claimShotsDir(process.env.UD2_SHOTS ?? path.join(os.tmpdir(), "uye-pasif-f7-shots"));
const cfg = (await resolveUiConfig({ envVar: "UD2_CFG", prefixes: ["uye-detay-v2-ui-", "uye-arsiv-4a-ui-"] })).cfg;
mkdirSync(SHOTS, { recursive: true });
const db = new pg.Client({ host: "127.0.0.1", port: cfg.pg.port, user: "postgres", password: "testpw", database: "postgres" });
await db.connect();
// F7 uygulanmışsa önceki migration'lar atlanır: 20280126000000 ön koşulu audit CHECK'i tam 35 eylem bekler (F7 sonrası 37 →
// bilinçli fail-closed; production'da her migration bir kez çalışır). F7 kendisi yeniden uygulanabilir.
const f7Applied = (await db.query(`select to_regprocedure('public.admin_set_member_access_message(uuid,uuid,text,text)') is not null x`)).rows[0].x;
for (const m of [...(f7Applied ? [] : ["20280126000000_member_access_restriction.sql", "20280126000100_member_list_access_restricted.sql",
  "20280126000200_usage360_member_access_states.sql"]), "20280127000000_member_access_message.sql"]) {
  await db.query(readFileSync(path.join(process.cwd(), "supabase/migrations", m), "utf8"));
}
const q1 = async (sql, a = []) => (await db.query(sql, a)).rows[0];
const NOTICE = "Üyeliğiniz şu anda pasif durumdadır. Sistemi kullanmaya devam edebilmek için lütfen sistem yöneticimizle iletişime geçiniz.";
const PRESETS = [
  "Deneme süreniz sona ermiştir. Ücretli üyelik hakkında bilgi almak için lütfen sistem yöneticimizle iletişime geçiniz.",
  "Üyelik ödeme süreniz sona ermiştir. Sistemi kullanmaya devam edebilmek için lütfen sistem yöneticimizle iletişime geçiniz.",
  "Gecikmiş üyelik ödemeleriniz bulunmaktadır. Lütfen sistem yöneticimizle iletişime geçiniz.",
];
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); } };

const E = cfg.expert.user, O = cfg.owner.user;
const EID = E.id;
// Başlangıç: uzman aktif + kısıtsız (yeniden çalıştırılabilir).
await db.query(`update public.users set access_restriction_message = null where id=$1`, [EID]);
await db.query(`update public.users set access_restricted_at = null where id=$1`, [EID]);
const counts0 = await q1(`select (select count(*)::int from public.users) u, (select count(*)::int from public.clients) c`);
const dbState = () => q1(`select access_restricted_at is not null r, access_restriction_message m from public.users where id=$1`, [EID]);

const consoleErrors = [];
const watch = (p) => {
  p.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED|favicon|status of (403|409)|Kullanıcı kaydı yenilenemedi|yüklenemedi: (403|500)$/.test(m.text())) consoleErrors.push(`console ${m.text().slice(0, 200)}`); });
  p.on("dialog", (d) => { consoleErrors.push(`dialog ${d.message().slice(0, 80)}`); void d.dismiss(); });
};
const b = await chromium.launch();
async function ctxFor(who, viewport = { width: 1280, height: 900 }) {
  const ctx = await b.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.route((u) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.toString()), (r) => r.abort());
  if (who === "owner") await ctx.addCookies([{ name: "yasam_admin_session", value: cfg.owner.token, url: BASE }]);
  const [u, t] = who === "owner" ? [O, cfg.owner.token] : [E, cfg.expert.token];
  await ctx.addInitScript(([uu, tt]) => { try { if (!localStorage.getItem("yasam_user")) { localStorage.setItem("yasam_user", uu); localStorage.setItem("yasam_session_token", tt); } } catch { /* */ } }, [JSON.stringify(u), t]);
  return ctx;
}
async function openDetail(ctx, id) {
  const p = await ctx.newPage(); watch(p);
  await p.goto(`${BASE}/admin/users/${id}`, { waitUntil: "domcontentloaded" });
  await p.locator("#uye-detay-ad").waitFor({ timeout: 180_000 });
  await p.waitForTimeout(700);
  return p;
}
const banner = (p) => p.locator('[data-testid="home-access-restricted"]');
async function openHome(ctx) {
  const p = await ctx.newPage(); watch(p);
  await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await p.locator('[data-testid="home-hub-grid"]').waitFor({ timeout: 180_000 });
  await p.waitForTimeout(1500);
  return p;
}
const resync = async (p) => { await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.waitForTimeout(2500); };
const bannerText = async (p) => (await banner(p).count()) ? (await banner(p).innerText()).trim() : null;
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const expectStatus = (p, re) => p.waitForResponse((r) => re.test(r.url()) && r.request().method() === "POST", { timeout: 120_000 });

// ── [1] Pencere ───────────────────────────────────────────────────────────────
console.log("[1] Pasif Yap penceresi");
const oc = await ctxFor("owner");
const ad = await openDetail(oc, EID);
await ad.locator("[data-access-restrict-open]").click();
const toggle = ad.locator("[data-msg-toggle]");
await toggle.waitFor({ timeout: 30_000 });
ok(!(await toggle.isChecked()) && (await ad.locator("[data-access-message-editor]").count()) === 0, "'Üyeye özel uyarı göster' varsayılan KAPALI; editör gizli");
await toggle.check();
const preview = ad.locator("[data-msg-preview]");
for (let i = 1; i <= 3; i++) {
  await ad.locator(`[data-msg-preset="${i}"]`).check();
  ok((await preview.innerText()).trim() === PRESETS[i - 1] && (await ad.locator("[data-msg-text]").inputValue()) === PRESETS[i - 1], `hazır mesaj ${i}: metin alanı + canlı önizleme`);
}
await ad.locator("[data-msg-text]").fill(PRESETS[2] + " Ek not.");
ok((await preview.innerText()).trim() === PRESETS[2] + " Ek not." && (await ad.locator("[data-msg-custom]").isChecked()), "hazır mesaj düzenlendi → önizleme güncel, 'özel' seçildi");
ok(/^\s*\d+\s*\/\s*500/.test(await ad.locator("[data-msg-counter]").innerText()), "karakter sayacı", await ad.locator("[data-msg-counter]").innerText());
await ad.locator("[data-msg-text]").fill("x".repeat(501));
ok(await ad.locator("[data-restrict-confirm]").isDisabled() && /500/.test(await ad.locator("[data-msg-counter]").innerText()), "501 karakter → onay düğmesi kapalı + uyarı");
const HTML = `<img src=x onerror="window.__xss=1"><b>Kalın</b> ödeme & "tırnak"`;
await ad.locator("[data-msg-custom]").check();
await ad.locator("[data-msg-text]").fill(HTML);
ok((await preview.innerText()).includes("<img src=x") && (await preview.locator("img, b").count()) === 0, "HTML önizlemede DÜZ METİN (etiket oluşmaz)");
await ad.screenshot({ path: path.join(SHOTS, "01-pasif-yap-penceresi.png") });

// ── [2] Mesajlı Pasif Yap → uzman bandı ───────────────────────────────────────
console.log("\n[2] Mesajlı Pasif Yap → uzman ana sayfası");
const resp = expectStatus(ad, /\/status$/);
await ad.locator("[data-restrict-confirm]").click();
ok((await resp).status() === 200, "Pasif Yap (mesajlı) 200");
await ad.waitForTimeout(1200);
const s2 = await dbState();
ok(s2.r === true && s2.m === HTML, "DB: kısıt + mesaj tek işlemde kaydedildi", s2);
ok(/Ana sayfa üyelik uyarısı/.test(await ad.locator("[data-access-message-panel]").textContent()) && (await ad.locator("[data-access-message-current]").innerText()).includes("<img src=x"),
  "yönetici panelinde mevcut uyarı (düz metin)");
const ec = await ctxFor("expert");
const eh = await openHome(ec);
await banner(eh).waitFor({ timeout: 60_000 });
ok((await bannerText(eh)) === HTML && (await banner(eh).getAttribute("data-custom-message")) === "1", "uzman bandı kişiye özel metni gösterir");
ok((await banner(eh).locator("img, b").count()) === 0 && (await eh.evaluate(() => window.__xss)) === undefined, "HTML düz metin; betik ÇALIŞMADI");
await eh.screenshot({ path: path.join(SHOTS, "02-uzman-ozel-uyari.png"), fullPage: false });

// ── [3] Sonradan düzenle / kaldır ─────────────────────────────────────────────
console.log("\n[3] Düzenle / kaldır");
await ad.locator("[data-access-message-edit]").click();
await ad.locator("[data-access-message-dialog]").waitFor({ timeout: 30_000 });
await ad.locator('[data-access-message-dialog] [data-msg-preset="2"]').check();
let r3 = expectStatus(ad, /\/status$/);
await ad.locator("[data-access-message-save]").click();
ok((await r3).status() === 200, "düzenleme kaydedildi (200)");
await ad.waitForTimeout(1000);
ok((await dbState()).m === PRESETS[1], "DB: yeni metin");
await resync(eh);
ok((await bannerText(eh)) === PRESETS[1], "uzman sekmesi görünür olunca yeni metin (yeniden giriş yok)");
await ad.locator("[data-access-message-edit]").click();
r3 = expectStatus(ad, /\/status$/);
await ad.locator("[data-access-message-remove]").click();
ok((await r3).status() === 200, "uyarı kaldırıldı (200)");
await ad.waitForTimeout(1000);
await resync(eh);
const s3 = await dbState();
ok(s3.r === true && s3.m === null && (await bannerText(eh)) === NOTICE && (await banner(eh).getAttribute("data-custom-message")) === "0",
  "kaldırıldı → standart kırmızı uyarı; kısıt sürüyor");

// ── [4] Eşzamanlı iki yönetici ────────────────────────────────────────────────
console.log("\n[4] Eşzamanlı düzenleme");
const ad2 = await openDetail(oc, EID);
await ad.reload({ waitUntil: "domcontentloaded" }); await ad.locator("#uye-detay-ad").waitFor({ timeout: 120_000 }); await ad.waitForTimeout(700);
for (const p of [ad, ad2]) { await p.locator("[data-access-message-edit]").click(); await p.locator("[data-access-message-dialog]").waitFor({ timeout: 30_000 }); }
await ad.locator('[data-access-message-dialog] [data-msg-custom]').check();
await ad.locator('[data-access-message-dialog] [data-msg-text]').fill("Birinci yönetici");
await ad2.locator('[data-access-message-dialog] [data-msg-custom]').check();
await ad2.locator('[data-access-message-dialog] [data-msg-text]').fill("İkinci yönetici");
const ra = expectStatus(ad, /\/status$/);
await ad.locator("[data-access-message-save]").click();
ok((await ra).status() === 200, "birinci yönetici kaydetti");
const rb = expectStatus(ad2, /\/status$/);
await ad2.locator("[data-access-message-save]").click();
ok((await rb).status() === 409 && (await dbState()).m === "Birinci yönetici", "ikinci (bayat) yönetici 409; veri tutarlı");
await ad2.waitForTimeout(800);
ok((await ad2.locator("body").innerText()).includes("bu sırada değiştirilmiş"), "ikinci yöneticiye 'bu sırada değiştirilmiş' uyarısı");
await ad2.close();

// ── [5] Aktif Yap + yeniden Pasif Yap ─────────────────────────────────────────
console.log("\n[5] Aktif Yap + yeniden pasifleştirme");
if (await ad.locator("[data-access-message-dialog]").count()) await ad.keyboard.press("Escape");
await ad.reload({ waitUntil: "domcontentloaded" }); await ad.locator("#uye-detay-ad").waitFor({ timeout: 120_000 }); await ad.waitForTimeout(700);
const r5 = expectStatus(ad, /\/status$/);
await ad.getByRole("button", { name: "Aktif Yap" }).click();
ok((await r5).status() === 200, "Aktif Yap 200");
await ad.waitForTimeout(1200);
ok((await dbState()).r === false && (await dbState()).m === null, "DB: kısıt ve mesaj temizlendi");
await resync(eh);
ok((await banner(eh).count()) === 0, "uzman: bant kalktı (yeniden giriş yok)");
await ad.locator("[data-access-restrict-open]").click();
await ad.locator("[data-msg-toggle]").waitFor({ timeout: 30_000 });
ok(!(await ad.locator("[data-msg-toggle]").isChecked()), "yeniden açılışta seçenek yine KAPALI (eski taslak taşınmaz)");
const r6 = expectStatus(ad, /\/status$/);
await ad.locator("[data-restrict-confirm]").click();
ok((await r6).status() === 200, "yeniden Pasif Yap (mesajsız) 200");
await ad.waitForTimeout(1000);
const eh2 = await openHome(ec);
await banner(eh2).waitFor({ timeout: 60_000 });
ok((await dbState()).m === null && (await bannerText(eh2)) === NOTICE, "yeniden pasif: STANDART metin — eski mesaj geri gelmedi");
await eh2.close(); await eh.close();

// ── [6] İsimlendirme ──────────────────────────────────────────────────────────
console.log("\n[6] İsimlendirme");
const archDetail = await openDetail(oc, cfg.ids.proExempt ?? EID);
const bodyTxt = await archDetail.locator("body").innerText();
ok(/Arşivle/.test(bodyTxt) && !/Pasife Al ve Arşivle/.test(bodyTxt) && bodyTxt.includes("Sisteme giriş tamamen kapanır. Kayıtlar korunur."), "düğme 'Arşivle' + açıklaması");
ok(bodyTxt.includes("Giriş açık, modüller kilitli"), "'Pasif Yap' açıklaması: Giriş açık, modüller kilitli");
await archDetail.screenshot({ path: path.join(SHOTS, "03-isimlendirme.png") });
await archDetail.close();
const adminTarget = cfg.admin2?.user?.id ?? cfg.ids?.admin2 ?? "00000000-0000-4000-8000-00000000d2a2"; // ui-stack ADMIN2
if (adminTarget) {
  const adp = await openDetail(oc, adminTarget);
  const t = await adp.locator("body").innerText();
  ok(t.includes("Girişi Kapat") && !/\bPasif Yap\b/.test(t), "yönetici hesabında düğme 'Girişi Kapat'");
  await adp.close();
} else {
  ok(false, "yığında ikinci yönetici kimliği bulunamadı");
}

// ── [7] 360 px ────────────────────────────────────────────────────────────────
console.log("\n[7] 360 px");
const LONG = ("Uzun kişiye özel uyarı metni — ödeme bilgilendirmesi için lütfen yöneticiyle görüşün. ").repeat(5).slice(0, 480);
const cur = (await dbState()).m;
await db.query(`select public.admin_set_member_access_message($1,$2,$3,$4)`, [EID, O.id, LONG, cur]);
const mc = await ctxFor("expert", { width: 360, height: 780 });
const mh = await openHome(mc);
await banner(mh).waitFor({ timeout: 60_000 });
ok((await bannerText(mh)) === LONG.trim() && (await overflow(mh)) <= 1, "360 px: uzun özel mesaj bantta, yatay taşma yok", { ov: await overflow(mh) });
await mh.screenshot({ path: path.join(SHOTS, "04-mobil-360-uzman.png") });
await mc.close();
const ma = await ctxFor("owner", { width: 360, height: 780 });
const map = await openDetail(ma, EID);
await map.locator("[data-access-message-edit]").click();
await map.locator("[data-access-message-dialog]").waitFor({ timeout: 30_000 });
ok((await overflow(map)) <= 1 && (await map.locator("[data-access-message-save]").isVisible()), "360 px: yönetici uyarı penceresi taşmıyor, Kaydet görünür", { ov: await overflow(map) });
await map.screenshot({ path: path.join(SHOTS, "05-mobil-360-yonetici.png") });
await ma.close();

// ── [8] Temizlik + kayıtlar ───────────────────────────────────────────────────
console.log("\n[8] Kayıtlar");
await db.query(`select public.admin_set_member_access_restriction($1,$2,false,true)`, [EID, O.id]);
const counts1 = await q1(`select (select count(*)::int from public.users) u, (select count(*)::int from public.clients) c`);
ok(counts1.u === counts0.u && counts1.c === counts0.c, "kullanıcı / danışan satırı silinmedi", { counts0, counts1 });
const au = await q1(`select count(*)::int n from public.admin_audit_log where target_user_id=$1 and action in ('user_access_message_set','user_access_message_cleared')`, [EID]);
ok(au.n >= 3, "düzenleme / kaldırma audit'e yazıldı", au);
ok(consoleErrors.length === 0, "tarayıcı konsolunda beklenmeyen hata / diyalog yok", consoleErrors.slice(0, 6));
await oc.close(); await ec.close();
await b.close();
await db.end();
console.log(`\nÜYE PASİFLEŞTİRME F7 UI: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
