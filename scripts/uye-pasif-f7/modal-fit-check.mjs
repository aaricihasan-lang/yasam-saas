/**
 * ÜYE PASİFLEŞTİRME F7-R1 — onay pencereleri EKRANA SIĞMA testi (Playwright; yalnız localhost; sentetik yığın).
 * Önkoşul: scripts/uye-arsiv-4a/ui-stack.ts + yerel `next dev` (UD2_BASE) + 20280126 / 20280127 migration'ları uygulanmış.
 *
 * Pencereler (uzun içerikle): Pasif Yap + "Üyeye özel uyarı göster" (editör açık) · Uyarıyı düzenle / kaldır.
 * Ekranlar: masaüstü 1920×1080 · dizüstü 1366×768, 1280×720 · mobil 390×844, 360×640, 320×568 ·
 *   tarayıcı yakınlaştırması (1366×768 üzerinde %110–%200; Chrome yakınlaştırması CSS görünüm alanını küçültür →
 *   eşdeğer görünüm alanı + deviceScaleFactor ile taklit edilir).
 * Her durumda: başlık TAMAMEN görünür · Vazgeç ve işlem düğmeleri TAMAMEN görünür ve tıklanabilir (üstte başka öğe yok) ·
 *   panel ekran içinde · içerik gerekirse pencerenin İÇİNDE kayar (en alttaki önizleme kaydırınca görünür) · sayfa yatay taşmaz.
 * İşlev: Vazgeç kapatır; değişiklik yapılmaz (DB aynı).
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimShotsDir, resolveUiConfig } from "../uye-yonetimi-faz2/uiKosu.mjs";

const BASE = process.env.UD2_BASE ?? "http://localhost:3974";
const SHOTS = claimShotsDir(process.env.UD2_SHOTS ?? path.join(os.tmpdir(), "uye-pasif-f7r1-shots"));
const cfg = (await resolveUiConfig({ envVar: "UD2_CFG", prefixes: ["uye-detay-v2-ui-", "uye-arsiv-4a-ui-"] })).cfg;
mkdirSync(SHOTS, { recursive: true });
const db = new pg.Client({ host: "127.0.0.1", port: cfg.pg.port, user: "postgres", password: "testpw", database: "postgres" });
await db.connect();
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); } };
const E = cfg.expert.user, O = cfg.owner.user;
const LONG = ("Sayın uzmanımız, üyelik ödemenizle ilgili bilgilendirme için lütfen sistem yöneticimizle iletişime geçiniz. ").repeat(4).slice(0, 480);
const dbSnap = async () => (await db.query(`select access_restricted_at is not null r, access_restriction_message m from public.users where id=$1`, [E.id])).rows[0];
// Başlangıç: uzman aktif + kısıtsız.
await db.query(`update public.users set access_restriction_message = null where id=$1`, [E.id]);
await db.query(`update public.users set access_restricted_at = null where id=$1`, [E.id]);

const SCREENS = [
  { tag: "masaüstü 1920×1080", w: 1920, h: 1080 },
  { tag: "dizüstü 1366×768", w: 1366, h: 768 },
  { tag: "dizüstü 1280×720", w: 1280, h: 720 },
  { tag: "mobil 390×844", w: 390, h: 844, mobile: true },
  { tag: "mobil 360×640", w: 360, h: 640, mobile: true },
  { tag: "mobil 320×568", w: 320, h: 568, mobile: true },
  ...[110, 125, 150, 175, 200].map((z) => ({ tag: `dizüstü 1366×768 yakınlaştırma %${z}`, w: Math.round(1366 * 100 / z), h: Math.round(768 * 100 / z), dpr: z / 100 })),
];

const b = await chromium.launch();
async function openDetail(scr) {
  const ctx = await b.newContext({ viewport: { width: scr.w, height: scr.h }, deviceScaleFactor: scr.dpr ?? 1, isMobile: !!scr.mobile, hasTouch: !!scr.mobile, locale: "tr-TR" });
  await ctx.addCookies([{ name: "yasam_admin_session", value: cfg.owner.token, url: BASE }]);
  await ctx.route((u) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); }, [JSON.stringify(O), cfg.owner.token]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/users/${E.id}`, { waitUntil: "domcontentloaded" });
  await p.locator("#uye-detay-ad").waitFor({ timeout: 180_000 });
  await p.waitForTimeout(600);
  return { ctx, p };
}
/** Pencere ölçümü: başlık / düğmeler tam görünür, panel ekranda, gövde kayıyor mu, düğmenin üstünde başka öğe var mı. */
async function measure(p, dialogSel, titleSel, buttonSels) {
  return p.evaluate(([dSel, tSel, bSels]) => {
    const vh = window.innerHeight, vw = window.innerWidth;
    const dlg = document.querySelector(dSel);
    const panel = dlg?.querySelector("[data-fit-modal]");
    const body = dlg?.querySelector("[data-fit-modal-body]");
    const r = (el) => { const x = el?.getBoundingClientRect(); return x ? { t: Math.round(x.top), b: Math.round(x.bottom), l: Math.round(x.left), r: Math.round(x.right), h: Math.round(x.height) } : null; };
    const inView = (x) => !!x && x.t >= 0 && x.b <= vh && x.l >= 0 && x.r <= vw;
    const topmost = (el) => {
      const x = el.getBoundingClientRect();
      const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    };
    const btns = bSels.map((s) => document.querySelector(s)).filter(Boolean);
    return {
      vh, vw,
      panel: r(panel), title: r(document.querySelector(tSel)),
      titleIn: inView(r(document.querySelector(tSel))), panelIn: inView(r(panel)),
      btns: btns.map((x) => ({ in: inView(r(x)), top: topmost(x), h: r(x)?.h })),
      bodyScrollable: body ? body.scrollHeight > body.clientHeight + 1 : false,
      bodyOverflowY: body ? getComputedStyle(body).overflowY : null,
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, [dialogSel, titleSel, buttonSels]);
}
async function checkBottomReachable(p, dialogSel, lastSel) {
  await p.locator(`${dialogSel} [data-fit-modal-body]`).evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await p.waitForTimeout(150);
  return p.evaluate(([dSel, lSel]) => {
    const body = document.querySelector(`${dSel} [data-fit-modal-body]`);
    const last = document.querySelector(`${dSel} ${lSel}`);
    if (!body || !last) return false;
    const bb = body.getBoundingClientRect(), lb = last.getBoundingClientRect();
    // Sona kaydırılınca içeriğin SON kısmı (önizlemenin alt kenarı) kayan alanın içinde görünür olmalı. Önizleme küçük ekranda
    // alandan uzunsa tamamı aynı anda sığmaz; ulaşılabilirlik ölçütü alt kenardır. Kayma gerçekten sona varmış olmalı.
    const atEnd = Math.abs(body.scrollHeight - body.clientHeight - body.scrollTop) <= 1;
    return atEnd && lb.bottom <= bb.bottom + 1 && lb.bottom > bb.top;
  }, [dialogSel, lastSel]);
}

for (const scr of SCREENS) {
  console.log(`\n[${scr.tag}]`);
  // ── Pasif Yap penceresi (uzun içerik) ──
  {
    const { ctx, p } = await openDetail(scr);
    await p.locator("[data-access-restrict-open]").click();
    const dlg = '[role="dialog"][aria-labelledby="deactivate-title"]';
    await p.locator(`${dlg} [data-msg-toggle]`).waitFor({ timeout: 30_000 });
    await p.locator(`${dlg} [data-msg-toggle]`).check();
    await p.locator(`${dlg} [data-msg-custom]`).check();
    await p.locator(`${dlg} [data-msg-text]`).fill(LONG);
    await p.waitForTimeout(200);
    const m = await measure(p, dlg, "#deactivate-title", [`${dlg} [data-fit-modal-footer] button:first-child`, `${dlg} [data-restrict-confirm]`]);
    ok(m.titleIn, `Pasif Yap: başlık tamamen görünür`, m.title);
    ok(m.btns.length === 2 && m.btns.every((x) => x.in && x.top && x.h >= 40), `Pasif Yap: Vazgeç + Pasif yap tamamen görünür ve tıklanabilir`, m.btns);
    ok(m.panelIn, `Pasif Yap: panel ekran içinde (${m.panel?.h}px ≤ ${m.vh}px)`, m.panel);
    ok(m.bodyOverflowY === "auto" && m.pageOverflowX <= 1, `Pasif Yap: içerik pencere içinde kayabilir; sayfa yatay taşmaz`, { y: m.bodyOverflowY, x: m.pageOverflowX, kayiyor: m.bodyScrollable });
    ok(await checkBottomReachable(p, dlg, "[data-msg-preview]"), `Pasif Yap: kaydırınca içeriğin sonuna (önizleme alt kenarı) ulaşılır`);
    const slug = scr.tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await p.screenshot({ path: path.join(SHOTS, `pasif-yap-${slug}.png`) });
    await p.locator(`${dlg} [data-fit-modal-footer] button:first-child`).click();
    await p.waitForTimeout(300);
    ok((await p.locator(dlg).count()) === 0 && (await dbSnap()).r === false, `Pasif Yap: Vazgeç kapatır; hiçbir değişiklik yapılmaz`);
    await ctx.close();
  }
  // ── Uyarıyı düzenle penceresi (pasif uzman + uzun mesaj; sentetik) ──
  {
    await db.query(`select public.admin_set_member_access_restriction($1,$2,true,false,$3)`, [E.id, O.id, LONG]);
    const { ctx, p } = await openDetail(scr);
    await p.locator("[data-access-message-edit]").click();
    const dlg = "[data-access-message-dialog]";
    await p.locator(`${dlg} [data-msg-text]`).waitFor({ timeout: 30_000 });
    const m = await measure(p, dlg, "#access-msg-title", [`${dlg} [data-fit-modal-footer] button:first-child`, `${dlg} [data-access-message-remove]`, `${dlg} [data-access-message-save]`]);
    ok(m.titleIn, `Uyarıyı düzenle: başlık tamamen görünür`, m.title);
    ok(m.btns.length === 3 && m.btns.every((x) => x.in && x.top && x.h >= 40), `Uyarıyı düzenle: Vazgeç + Uyarıyı kaldır + Kaydet tamamen görünür ve tıklanabilir`, m.btns);
    ok(m.panelIn && m.bodyOverflowY === "auto" && m.pageOverflowX <= 1, `Uyarıyı düzenle: panel ekran içinde, içerik içeride kayar, yatay taşma yok`, { panel: m.panel, vh: m.vh, x: m.pageOverflowX });
    ok(await checkBottomReachable(p, dlg, "[data-msg-preview]"), `Uyarıyı düzenle: kaydırınca içeriğin sonuna ulaşılır`);
    const slug = scr.tag.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await p.screenshot({ path: path.join(SHOTS, `uyari-duzenle-${slug}.png`) });
    await p.locator(`${dlg} [data-fit-modal-footer] button:first-child`).click();
    await p.waitForTimeout(300);
    ok((await p.locator(dlg).count()) === 0 && (await dbSnap()).m === LONG.trim(), `Uyarıyı düzenle: Vazgeç kapatır; mesaj değişmez`);
    await ctx.close();
    await db.query(`select public.admin_set_member_access_restriction($1,$2,false,true)`, [E.id, O.id]);
  }
}
await b.close();
await db.end();
console.log(`\nF7-R1 PENCERE SIĞMA: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
