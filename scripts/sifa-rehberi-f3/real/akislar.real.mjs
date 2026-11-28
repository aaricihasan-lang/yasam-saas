/*
 * Şifa Rehberi F3 — onaylı F2 Revizyon 7 kabul testinin (613 kontrol) GERÇEK ÜRÜNE uyarlanmış hâli.
 * Doğrulamalar ve beklenen sonuçlar F2 testiyle AYNIDIR; yalnız altyapı gerçektir: `next dev` (webpack) + gerçek API
 * (/api/sifa-rehberi-v2) + izole Supabase test projesi (guard.ts FAIL-CLOSED) + sentetik ZZ uzman/oturum.
 * Masaüstü 1440×900 ve Android WebView 390×844; her görünüm kendi ZZ uzmanıyla, F2 örnek verisi API'den tohumlanır.
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… [SIFA_F3_SHOTS_DIR=…] npx tsx scripts/sifa-rehberi-f3/real/akislar.real.mjs
 */
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";
import sharp from "sharp";
import JSZip from "jszip";
import { T, mkTenant, mkUser, startServer, stopServer, seedUser, storeOf, addSavedNotesApi, userRecord, protoHash as protoHashOf, htmlText } from "./support.mts";

const PORT = Number(process.env.SIFA_F3_PORT ?? 3312);
const ORIGIN = `http://localhost:${PORT}`;
const BASE = `${ORIGIN}/sifa-rehberi`;
const SHOTS = process.env.SIFA_F3_SHOTS_DIR ?? path.join(os.tmpdir(), "sifa-rehberi-f3-ekranlar");
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
/** Bu görünümün ZZ uzmanı (masaüstü / mobil ayrı). */
let CUR = null;
let pass = 0;
let fail = 0;
const ok = (c, l, x) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${x !== undefined ? ` — ${JSON.stringify(x)}` : ""}`);
};
const sec = (t) => console.log(`\n ${t}`);
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36";
const N0 = (st, hid) => (st?.notes?.[hid] ?? []).filter((n) => !n.deletedAt)[0];
const htmlOf = (st, hid) => (st?.notes?.[hid] ?? []).filter((n) => !n.deletedAt).map((n) => n.html).join(" ");

async function ctx(browser, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ANDROID, locale: "tr-TR" } : { viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  await c.addInitScript(([rec, t]) => {
    localStorage.setItem("yasam_user", rec);
    localStorage.setItem("yasam_session_token", t);
  }, [userRecord(CUR), CUR.token]);
  const sb = new globalThis.URL(T.url).host;
  // Ağ çiti: yalnız yerel sunucu + izole test projesi (production'a / üçüncü taraflara istek yok).
  await c.route("**/*", (r) => {
    const u = r.request().url();
    const h = new globalThis.URL(u).host;
    return h === `localhost:${PORT}` || h === sb || u.startsWith("data:") || u.startsWith("blob:") ? r.continue() : r.abort();
  });
  return c;
}
/** Kayıt sürüyorsa ("Kaydediliyor…" kilidi) bitmesini bekler — gerçek ağ gecikmesi. */
const settle = (p) => p.waitForFunction(() => !document.querySelector("[data-testid=saving]"), null, { timeout: 60_000 }).catch(() => {});
function counter(page, mobile) {
  const s = { clicks: 0, enter: 0 };
  return {
    s,
    async hit(sel) {
      s.clicks++;
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: "visible", timeout: 8000 });
      mobile ? await loc.tap() : await loc.click();
      await settle(page);
    },
    async enter() {
      s.enter++;
      await page.keyboard.press("Enter");
    },
  };
}
const act = (page, mobile) => async (sel) => {
  const l = page.locator(sel).first();
  await l.waitFor({ state: "visible", timeout: 8000 });
  mobile ? await l.tap() : await l.click();
  await settle(page);
};
const crumbs = (p) => p.locator("[data-testid=crumbs]").innerText();
const focusedEditor = async (p) => {
  await p.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "editor", null, { timeout: 1500 }).catch(() => {});
  return p.evaluate(() => document.activeElement?.getAttribute("data-testid") === "editor");
};
/** Kayıtlı hâl: SUNUCUDAN (gerçek kayıt), F2 ekran biçiminde. */
const store = async (p) => {
  await settle(p);
  return storeOf(ORIGIN, CUR);
};
const rawStore = async (p) => JSON.stringify(await store(p));
const protoHash = (p) => protoHashOf(p, CUR);
const shot = async (p, n, full = false) => {
  await p.evaluate(() => document.querySelector(".toast")?.remove()); // geçici bildirim ekran görüntüsünü örtmesin
  return p.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: full });
};
const toastText = (p) => p.locator("[data-testid=toast]").innerText().catch(() => "");
/** R5: "＋ Yeni Not" kaldırıldı. Aynı başlıktaki 2./3. not yalnız ÖNCEDEN KAYDEDİLMİŞ (eski) veri olarak bulunabilir;
 *  çoklu not senaryoları bu notları depoya ekleyip sayfayı yeniler (alt alta gösterim / tarih / silme regresyonu için). */
const savedNote = (n, png, T) => ({ id: `eski-${Math.random().toString(36).slice(2, 10)}`, title: n.title, html: n.text, cls: "", sources: n.src ? [{ id: `s-${n.title.length}-${Math.random().toString(36).slice(2, 7)}`, title: n.src, authors: "", year: "", doi: n.link.startsWith("10.") ? n.link : "", url: n.link.startsWith("10.") ? "" : n.link }] : [], images: png ? [{ id: `g-${Math.random().toString(36).slice(2, 9)}`, src: `data:image/png;base64,${png.toString("base64")}`, caption: n.cap }] : [], boxes: [], createdAt: T, updatedAt: T, deletedAt: null });
async function addSavedNotes(page, hid, notes) {
  await addSavedNotesApi(ORIGIN, CUR, hid, notes.map((n) => ({
    title: n.title,
    html: n.html,
    cls: n.cls,
    sources: n.sources,
    images: n.images.map((g) => ({ png: Buffer.from(g.src.split(",")[1], "base64"), caption: g.caption })),
  })));
  await page.reload();
  await page.waitForSelector("[data-testid=heading-title]");
}
const pngBuf = await sharp({ create: { width: 640, height: 420, channels: 3, background: { r: 30, g: 140, b: 110 } } }).png().toBuffer();

// ── REVİZYON 2 senaryoları ───────────────────────────────────────────────────────
const pngOf = (r, g, b) => sharp({ create: { width: 640, height: 420, channels: 3, background: { r, g, b } } }).png().toBuffer();
const IMGS = [await pngOf(20, 120, 160), await pngOf(170, 110, 40), await pngOf(120, 60, 160)];
const RN = [
  { title: "Ayak tabanı dalak bölgesi", text: "Sol ayak tabanında dalak refleks bölgesi orta hattın dışında yer alır.", cap: "Sol ayak — dalak bölgesi", src: "Reflexology and spleen points", link: "10.1234/refleks.2020.11" },
  { title: "Uygulama süresi ve basınç", text: "Günde beş dakika, orta basınçla dairesel çalışma.", cap: "Başparmak basınç tekniği", src: "Klinik refleksoloji el kitabı", link: "https://ornek.example/refleks-el-kitabi" },
  { title: "Danışan sonuçları", text: "Üç hafta sonunda yorgunlukta azalma bildirildi (sentetik).", cap: "Takip çizelgesi", src: "Refleksoloji vaka serisi", link: "10.5555/vaka.2023.4" },
];
async function rev2(page, tap, pickHeading, mobile, tag) {
  const press = (sel, i = 0) => page.locator(sel).nth(i)[mobile ? "tap" : "click"]();
  const typeEditor = async (t) => {
    await tap("[data-testid=editor]");
    await page.keyboard.press("Control+End");
    await page.keyboard.type(t);
  };
  const reflexId = (st) => st.nodes.find((n) => n.rootId === "t-dalak" && n.templateKey === "konu:refleksoloji" && !n.deletedAt)?.id;
  const reflexNotes = async () => {
    const st = await store(page);
    return st.notes[reflexId(st)] ?? [];
  };
  const tabs = () => page.locator("[data-testid=note-tab]").count();
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");

  sec("R2-A) Aynı başlıkta birden fazla bağımsız not: Dalak › Uygulamalar / Yöntemler › Refleksoloji");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  await tap("[data-testid=edit]");
  if (mobile) {
    await tap("[data-testid=pick]");
    await page.locator('[data-testid=sheet] [data-testid=tree-toggle][data-title="Uygulamalar / Yöntemler"]').tap();
    await tap('[data-testid=sheet] [data-testid=tree-item][data-title="Refleksoloji"]');
  } else {
    await tap('[data-testid=tree] [data-testid=tree-item][data-title="Uygulamalar / Yöntemler"]');
    await tap('[data-testid=tree] [data-testid=tree-item][data-title="Refleksoloji"]');
  }
  ok(!(await page.locator("[data-testid=new-note]").count()) && (await page.locator("[data-testid=editor]").isVisible()), "R5: '＋ Yeni Not' YOK; boş başlıkta ilk not alanı doğrudan açık");
  {
    const n = RN[0];
    await page.fill("[data-testid=note-title-input]", n.title);
    await typeEditor(n.text);
    await page.locator(".note.cur [data-testid=add-image] input").setInputFiles({ name: "refleks-1.png", mimeType: "image/png", buffer: IMGS[0] });
    await page.waitForFunction(() => document.querySelectorAll(".note.cur [data-testid=image-item]").length === 1);
    await page.fill(".note.cur [data-testid=image-caption]", n.cap);
    await tap(".note.cur [data-testid=add-source]");
    await page.fill("[data-testid=source-title]", n.src);
    await page.fill("[data-testid=source-link]", n.link);
    await tap("[data-testid=source-submit]");
  }
  const pre = await store(page);
  ok((await page.locator("[data-testid=note]").count()) === 1 && !reflexId(pre) && (await page.locator(".note.cur [data-testid=not-saved-yet]").isVisible()), "ilk not taslakta; Kaydet'ten önce depoda yok, tarih 'henüz kaydedilmedi'");
  if (!mobile) await shot(page, `${tag}-18-ilk-not-duzenleme`, true);
  await tap("[data-testid=save]");
  await addSavedNotes(page, reflexId(await store(page)), RN.slice(1).map((n, i) => savedNote(n, IMGS[i + 1], new Date().toISOString())));
  const st1 = await store(page);
  const rn = st1.notes[reflexId(st1)] ?? [];
  ok(rn.length === 3 && rn.every((n, i) => n.title === RN[i].title && n.images.length === 1 && n.images[0].caption === RN[i].cap && n.sources.length === 1), "Kaydet → 3 bağımsız not; her birinin kendi başlığı, metni, görseli+açıklaması, kaynağı", rn.map((n) => n.title));
  ok(rn[0].sources[0].doi === RN[0].link && rn[1].sources[0].url === RN[1].link && rn[2].sources[0].doi === RN[2].link, "notların kaynakları farklı (DOI / bağlantı / DOI)");
  ok(new Set(rn.map((n) => n.images[0].src)).size === 3, "notların görselleri farklı");
  ok(rn.every((n) => n.createdAt && n.createdAt === n.updatedAt), "yeni notlarda oluşturulma = güncelleme = kayıt anı", rn[0].createdAt);
  ok((await tabs()) === 3 && !(await page.locator("[data-testid=new-note]").count()), "önceden kaydedilmiş 3 not aynı başlıkta korunuyor (içindekiler 3); '＋ Yeni Not' yok", await tabs());
  ok(st1.nodes.filter((n) => n.rootId === "t-dalak").length === 2, "alt başlık gerekmedi: Dalak'ta yalnız 2 satır (grup + Refleksoloji)", st1.nodes.filter((n) => n.rootId === "t-dalak").map((n) => n.title));
  const sw = [];
  for (let i = 0; i < 3; i++) {
    await press("[data-testid=note-tab]", i);
    sw.push(await page.evaluate(() => ({ t: document.querySelector(".note.cur [data-testid=note-title]")?.innerText, s: document.querySelector(".note.cur [data-testid=sources]")?.innerText ?? "", c: document.querySelector(".note.cur .capview")?.innerText ?? "", d: document.querySelector(".note.cur [data-testid=note-dates]")?.innerText ?? "" })));
  }
  ok(sw.every((x, i) => x.t === RN[i].title && x.c.includes(RN[i].cap) && (RN[i].link.startsWith("10.") ? x.s.includes(`DOI: ${RN[i].link}`) : /Bağlantıyı aç/.test(x.s))), "sekmeyle notlar arasında TEK dokunuşla geçiş; doğru metin/görsel/kaynak", sw.map((x) => x.t));
  ok(sw.every((x) => /Oluşturuldu/.test(x.d) && /Son güncelleme/.test(x.d)), "not ayrıntısında küçük tarih satırı", sw[0].d);
  const tabBox = await page.locator("[data-testid=note-tabs] .ntabs").boundingBox();
  const tabArea = await page.locator("[data-testid=note-tabs]").boundingBox();
  ok(!!tabBox && tabBox.height <= 60 && tabArea.height <= (mobile ? 110 : 60), "not listesi başı tek satır, ekranı uzatmıyor (R4: sekme yerine içindekiler; notlar alt alta)", { sekmeler: tabBox?.height, alan: tabArea?.height });
  await press("[data-testid=note-tab]", 0);
  await shot(page, `${tag}-19-uc-not-okuma`, true);
  await press("[data-testid=note-tab]", 1);
  await shot(page, `${tag}-20-not-2-secili`, !mobile);

  sec("R2-B) Otomatik tarihler");
  const before = clone(await reflexNotes());
  await new Promise((r) => setTimeout(r, 30));
  await tap("[data-testid=edit]");
  await press("[data-testid=note-tab]", 1);
  await typeEditor(" Ek gözlem.");
  ok(JSON.stringify(await reflexNotes()) === JSON.stringify(before), "yazarken tarih değişmez (yalnız Kaydet'te)");
  await tap("[data-testid=save]");
  const after = await reflexNotes();
  ok(after[1].createdAt === before[1].createdAt && after[1].updatedAt > before[1].updatedAt, "güncellenen notta: oluşturulma AYNI, son güncelleme YENİ", { c: after[1].createdAt, u: after[1].updatedAt });
  ok(JSON.stringify(after[0]) === JSON.stringify(before[0]) && JSON.stringify(after[2]) === JSON.stringify(before[2]), "değişmeyen notların tarihleri değişmedi");
  await tap("[data-testid=edit]");
  await press("[data-testid=note-tab]", 2);
  await typeEditor(" ÇÖP-YAZI");
  await page.fill("[data-testid=note-title-input]", "Değiştirilmiş ad");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  ok(JSON.stringify(await reflexNotes()) === JSON.stringify(after), "Kaydetmeden Çık → içerik ve TARİHLER değişmedi");
  await tap("[data-testid=edit]");
  await tap("[data-testid=discard]");
  ok(JSON.stringify(await reflexNotes()) === JSON.stringify(after), "değişiklik yapmadan Düzenle → Vazgeç: tarih değişmedi");

  sec("R2-C) Not silme ve Silinenler'den geri alma — Kaydet ile kesinleşir");
  await tap("[data-testid=edit]");
  await press("[data-testid=note-tab]", 2);
  await tap(".note.cur [data-testid=note-delete]");
  ok(await page.locator("[data-testid=note-delete-confirm]").isVisible(), "not silme önce onay ister");
  await tap("[data-testid=note-delete-yes]");
  ok((await tabs()) === 2 && (await reflexNotes()).every((n) => !n.deletedAt), "not ekrandan kalktı ama depoda SİLİNMEDİ (taslak)", await tabs());
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  ok((await tabs()) === 3 && JSON.stringify(await reflexNotes()) === JSON.stringify(after), "Kaydetmeden Çık → not silme İPTAL; 3 not yerinde");
  await tap("[data-testid=edit]");
  await press("[data-testid=note-tab]", 2);
  await tap(".note.cur [data-testid=note-delete]");
  await tap("[data-testid=note-delete-yes]");
  await tap("[data-testid=save]");
  const del = await reflexNotes();
  ok(del[2].deletedAt && !del[0].deletedAt && !del[1].deletedAt && (await tabs()) === 2, "Kaydet → yalnız seçili not silindi; diğer iki not yerinde");
  await tap("[data-testid=back]");
  await tap("[data-testid=open-trash]");
  const trRows = await page.$$eval("[data-testid=restore]", (els) => els.map((e) => e.getAttribute("data-title")));
  ok(trRows.some((t) => t.startsWith("Danışan sonuçları · Dalak › Refleksoloji")), "Silinenler'de not; konu › başlık bilgisiyle", trRows);
  await shot(page, `${tag}-21-silinenler-not`);
  await page.locator('[data-testid=restore][data-title^="Danışan sonuçları"]')[mobile ? "tap" : "click"]();
  ok((await reflexNotes())[2].deletedAt && (await page.locator("[data-testid=session] [data-testid=save]").isVisible()), "Geri al taslakta; Kaydet/Vazgeç sayfa başında");
  await tap("[data-testid=back]");
  ok(await page.locator("[data-testid=leave-dialog]").isVisible(), "kaydedilmemiş geri almayla çıkış → 3 seçenek");
  await tap("[data-testid=leave-drop]");
  ok((await reflexNotes())[2].deletedAt, "Kaydetmeden Çık → geri alma İPTAL; not hâlâ Silinenler'de");
  await tap("[data-testid=open-trash]");
  await page.locator('[data-testid=restore][data-title^="Danışan sonuçları"]')[mobile ? "tap" : "click"]();
  await tap("[data-testid=session] [data-testid=save]");
  const res = await reflexNotes();
  ok(!res[2].deletedAt && res[2].createdAt === after[2].createdAt && res[2].updatedAt === after[2].updatedAt, "Geri al + Kaydet → not geri geldi; tarihleri korunmuş");
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  ok((await tabs()) === 3 && /Refleksoloji/.test(await crumbs(page)), "Dalak yeniden açılınca son başlık (Refleksoloji) ve 3 not", await crumbs(page));

  sec("R2-D) Görsel kaldırma + kaynak silme taslakta");
  await tap("[data-testid=edit]");
  await press("[data-testid=note-tab]", 0);
  await tap(".note.cur [data-testid=image-remove]");
  await tap(".note.cur [data-testid=source-delete]");
  const rd = (await reflexNotes())[0];
  ok((await page.locator(".note.cur [data-testid=image-item]").count()) === 0 && rd.images.length === 1 && rd.sources.length === 1, "ekrandan kalktı, depoda duruyor");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  ok((await page.locator(".note.cur [data-testid=image-item]").count()) === 1 && (await page.locator(".note.cur [data-testid=source-item]").count()) === 1, "Kaydetmeden Çık → görsel ve kaynak geri geldi");

  sec("R2-E) Konu silme taslakta (kütüphanede Kaydet/Vazgeç)");
  await pickHeading("Dalak");
  await tap("[data-testid=menu]");
  await tap("[data-testid=mi-delete]");
  await tap("[data-testid=delete-yes]");
  await page.waitForSelector("[data-testid=library]");
  const libT = await page.$$eval("[data-testid=lib-item]", (els) => els.map((e) => e.getAttribute("data-title")));
  ok(!libT.includes("Dalak") && !(await store(page)).topics.find((t) => t.id === "t-dalak").deletedAt && (await page.locator("[data-testid=session] [data-testid=save]").isVisible()), "konu listeden kalktı; depoda silinmedi; üstte Kaydet/Vazgeç", libT.length);
  await shot(page, `${tag}-22-konu-silme-bekliyor`);
  await tap("[data-testid=session] [data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  const libT2 = await page.$$eval("[data-testid=lib-item]", (els) => els.map((e) => e.getAttribute("data-title")));
  ok(libT2.includes("Dalak") && !(await page.locator("[data-testid=session] [data-testid=save]").count()), "Vazgeç → Kaydetmeden Çık: konu silme İPTAL", libT2.includes("Dalak"));

  sec("R2-F) Arama ikinci notun içeriğini bulur ve o notu seçer");
  await page.fill("[data-testid=search]", "dairesel");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  const sn = await page.evaluate(() => ({ t: document.querySelector(".note.cur [data-testid=note-title]")?.innerText, m: document.querySelectorAll(".note.cur [data-testid=note-view] mark.hit").length }));
  ok(sn.t === RN[1].title && sn.m >= 1, "eşleşen not seçili açıldı, kelime sarı", sn);
  await tap("[data-testid=hl-clear]");

  if (!mobile) {
    sec("R2-G) Sol başlık listesi: kaydırma konumu korunur, sabit yükseklik");
    await tap("[data-testid=back]");
    await tap('[data-testid=lib-item][data-title="Akciğer"]');
    for (const g of ["Belirtiler / Sebepler", "Destekleyici / Alternatif Uygulamalar", "Uygulamalar / Yöntemler"]) {
      const t = page.locator(`[data-testid=tree] [data-testid=tree-toggle][data-title="${g}"]`);
      if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
    }
    const geo = () => page.evaluate(() => {
      const s = document.querySelector("[data-testid=side]").getBoundingClientRect();
      const b = document.querySelector("[data-testid=side-scroll]");
      return { h: Math.round(s.height), top: Math.round(b.scrollTop), sh: b.scrollHeight, ch: b.clientHeight, vh: innerHeight };
    });
    const g0 = await geo();
    ok(g0.sh > g0.ch && Math.abs(g0.h - (g0.vh - 82)) <= 4, "sol panel sabit yükseklikte (ekran boyu) ve kendi içinde kayıyor", g0);
    await page.evaluate(() => (document.querySelector("[data-testid=side-scroll]").scrollTop = 320));
    const s0 = (await geo()).top;
    const visibleTitle = (kind) => page.evaluate((k) => {
      const box = document.querySelector("[data-testid=side-scroll]").getBoundingClientRect();
      const el = [...document.querySelectorAll(`[data-testid=tree] [data-testid=${k}]`)].find((e) => {
        if (k === "tree-item" && e.hasAttribute("data-group")) return false;
        const r = e.getBoundingClientRect();
        return r.top > box.top + 120 && r.bottom < box.bottom - 120 && !e.closest(".trow.on");
      });
      return el?.getAttribute("data-title");
    }, kind);
    const vt = await visibleTitle("tree-item");
    await page.locator(`[data-testid=tree] [data-testid=tree-item][data-title="${vt}"]`).click();
    const s1 = (await geo()).top;
    ok(Math.abs(s1 - s0) <= 1 && (await crumbs(page)).includes(vt), "başlık seçimi listeyi BAŞA ATMADI", { secilen: vt, once: s0, sonra: s1 });
    const tt = await visibleTitle("tree-toggle");
    await page.locator(`[data-testid=tree] [data-testid=tree-toggle][data-title="${tt}"]`).click();
    const g2 = await geo();
    ok(Math.abs(g2.top - s0) <= 1, "aç/kapat listeyi kaydırmadı", { ok: tt, once: s0, sonra: g2.top });
    ok(g2.h === g0.h, "aç/kapat sonrası panel yüksekliği DEĞİŞMEDİ", { once: g0.h, sonra: g2.h });
    await page.locator(`[data-testid=tree] [data-testid=tree-toggle][data-title="${tt}"]`).click();
    await tap("[data-testid=edit]");
    const s3 = (await geo()).top;
    await page.keyboard.type(" Kaydırma testi.");
    const s4 = (await geo()).top;
    ok(Math.abs(s3 - s0) <= 1 && Math.abs(s4 - s0) <= 1, "Düzenle'ye geçiş ve yazı yazma listeyi kaydırmadı", { s3, s4 });
    await shot(page, `${tag}-23-konu-ekrani-duzenleme`);
    await tap("[data-testid=discard]");
    await tap("[data-testid=leave-drop]");
    ok(Math.abs((await geo()).top - s0) <= 1, "Vazgeç → Kaydetmeden Çık sonrası da konum korundu");
    await page.evaluate(() => (document.querySelector("[data-testid=side-scroll]").scrollTop = 0));
    await tap("[data-testid=back]");
    await page.fill("[data-testid=search]", "diyafram");
    await tap('[data-testid=lib-item][data-title="Akciğer"]');
    const off = await page.evaluate(() => {
      const box = document.querySelector("[data-testid=side-scroll]");
      const b = box.getBoundingClientRect();
      const r = box.querySelector(".trow.on").getBoundingClientRect();
      return { top: Math.round(box.scrollTop), visible: r.top >= b.top - 1 && r.bottom <= b.bottom + 1, gap: Math.round(b.bottom - r.bottom), sel: box.querySelector(".trow.on .ttl")?.textContent };
    });
    ok(off.visible && (off.top === 0 || off.gap <= 24), "seçili başlık ekran dışındaysa YALNIZ gerektiği kadar kaydırıldı", off);
    await tap("[data-testid=hl-clear]");
    await shot(page, `${tag}-24-konu-ekrani-okuma`);
  } else {
    sec("R2-G) Mobil: üst çubuk düzenlemede taşmıyor");
    await tap("[data-testid=edit]");
    const mb = await page.evaluate(() => {
      const t = document.querySelector("[data-testid=topbar]");
      const s = document.querySelector("[data-testid=save]").getBoundingClientRect();
      return { over: t.scrollWidth - t.clientWidth, page: document.documentElement.scrollWidth - innerWidth, saveRight: Math.round(s.right), vw: innerWidth };
    });
    ok(mb.over <= 0 && mb.page <= 0 && mb.saveRight <= mb.vw, "mobil düzenleme: Kaydet/Vazgeç ekranda, yatay taşma yok", mb);
    await typeEditor("x");
    await shot(page, `${tag}-23-konu-ekrani-duzenleme`);
    await tap("[data-testid=discard]");
    if (await page.locator("[data-testid=leave-drop]").count()) await tap("[data-testid=leave-drop]");
    await shot(page, `${tag}-24-konu-ekrani-okuma`);
  }
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
}
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── REVİZYON 3 senaryoları ───────────────────────────────────────────────────────
const { TEMPLATE: TPL_DEF } = await import("../../../components/sifa-rehberi-f3/sifaData.ts");
const TPL_SNAPSHOT = JSON.stringify(TPL_DEF);
const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
async function rev3(page, tap, pickHeading, mobile, tag) {
  const press = (sel, i = 0) => page.locator(sel).nth(i)[mobile ? "tap" : "click"]();
  const typeEditor = async (t) => {
    await tap("[data-testid=editor]");
    await page.keyboard.press("Control+End");
    await page.keyboard.type(t);
  };
  const raw = () => rawStore(page);
  const openManage = async () => {
    if (mobile) {
      await tap("[data-testid=pick]");
      await tap("[data-testid=sheet] [data-testid=manage-headings]");
    } else await tap("[data-testid=side] [data-testid=manage-headings]");
    await page.waitForSelector("[data-testid=manage]");
  };
  const openAdd = async () => {
    if (mobile) {
      await tap("[data-testid=pick]");
      await tap("[data-testid=sheet] [data-testid=add-heading]");
    } else await tap("[data-testid=side] [data-testid=add-heading]");
    await page.waitForSelector("[data-testid=addchild-form]");
  };
  const manageRows = () => page.$$eval("[data-testid=manage-row]", (els) => els.map((e) => e.getAttribute("data-title")));
  const mRow = (title) => `[data-testid=manage-row][data-title="${title}"]`;
  const dalakNode = (st, title) => st.nodes.find((n) => n.rootId === "t-dalak" && n.title === title);
  const bar = () => page.locator("[data-testid=topbar]");

  sec("R3-1/2/5) Üst çubuk: Kütüphanem düğmesi yok; konum yolu gezinir; tekrar eden konu adı yok");
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');
  await pickHeading("Bronşit");
  await pickHeading("Akut Bronşit");
  const tb = await page.evaluate(() => {
    const t = document.querySelector("[data-testid=topbar]");
    const home = t.querySelector(".crumb.home");
    return { kutBtn: [...t.querySelectorAll("button")].some((b) => /Kütüphanem/.test(b.textContent)), home: home?.textContent.trim(), aria: home?.getAttribute("aria-label"), topicName: !!document.querySelector(".topic-name"), hhead: document.querySelector(".hhead")?.innerText.trim() };
  });
  ok(!tb.kutBtn, "konu ekranında '← Kütüphanem' düğmesi YOK", tb.kutBtn);
  ok(/Akciğer/.test(tb.home ?? "") && /Kütüphaneye dön/.test(tb.aria ?? ""), "konum yolundaki konu adı kütüphaneye dönüş (‹ Akciğer)", tb.home);
  ok(!tb.topicName && !/^AKCİĞER/i.test(tb.hhead) && /Akut Bronşit/.test(tb.hhead), "sağ alanda tekrar eden küçük konu adı kaldırıldı; yalnız büyük başlık", tb.hhead.slice(0, 40));
  await page.locator('[data-testid=crumbs] [data-testid=crumb]', { hasText: "Bronşit" }).first()[mobile ? "tap" : "click"]();
  ok(/Bronşit/.test(await page.locator("[data-testid=heading-title]").innerText()) && (await crumbs(page)).trim().endsWith("Bronşit"), "konum yolundaki ara başlık o başlığı açar", await crumbs(page));
  await pickHeading("Akut Bronşit");

  sec("R3-3/4/6/7) Yazma alanı, not başlığı, yerleşim, pastel düğmeler");
  ok(!(await page.locator("[data-testid=editor]").count()), "okuma modunda düzenleme çerçevesi yok");
  await tap("[data-testid=edit]");
  const ed = await page.evaluate(() => {
    const e = document.querySelector("[data-testid=editor]");
    const cs = getComputedStyle(e);
    const ti = document.querySelector("[data-testid=note-title-input]");
    const img = getComputedStyle(document.querySelector(".note.cur [data-testid=add-image]"));
    const src = getComputedStyle(document.querySelector(".note.cur [data-testid=add-source]"));
    return { empty: !e.textContent.trim(), bw: parseFloat(cs.borderTopWidth), bc: cs.borderTopColor, bg: getComputedStyle(document.querySelector(".content")).backgroundColor, ph: e.getAttribute("data-placeholder"), before: getComputedStyle(e, "::before").content, top: Math.round(e.getBoundingClientRect().top), tph: ti?.placeholder, tval: ti?.value, img: [img.backgroundColor, img.color, img.borderTopColor], src: [src.backgroundColor, src.color] };
  });
  ok(ed.empty && ed.bw >= 1 && ed.bc !== "rgba(0, 0, 0, 0)" && lum(ed.bc) > 0.6 && lum(ed.bc) < 0.95, "boş yazma alanı ince, açık pastel çerçeveyle görünüyor", { bw: ed.bw, bc: ed.bc });
  ok(ed.ph === "Notunuzu buraya yazın…" && /Notunuzu buraya yazın/.test(ed.before), "içinde silik 'Notunuzu buraya yazın…'", ed.ph);
  await tap("[data-testid=editor]");
  await page.waitForTimeout(300); // çerçeve geçişi (0.15 sn) bitsin
  const focusBc = await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=editor]")).borderTopColor);
  ok(focusBc !== ed.bc && lum(focusBc) < lum(ed.bc), "tıklanınca çerçeve biraz belirginleşiyor", { once: ed.bc, odak: focusBc });
  ok(ed.tph === "Not başlığı" && ed.tval === "", "not başlığı yer tutucusu yalnız 'Not başlığı' (örnek metin yok)", ed.tph);
  ok(mobile ? ed.top < 640 : ed.top < 400, "not yazma alanı ekranın üst kısmında başlıyor", { top: ed.top, hedef: mobile ? "<640" : "<400 (rev2 ≈ 470)" });
  const pastel = (c) => lum(c[0]) > 0.75 && c[0] !== "rgb(255, 255, 255)";
  ok(pastel(ed.img) && pastel(ed.src) && contrast(ed.img[0], ed.img[1]) >= 4.5 && contrast(ed.src[0], ed.src[1]) >= 4.5, "Görsel ekle / Kaynak ekle pastel; yazı kontrastı ≥ 4.5 (erişilebilir)", { gorsel: ed.img[0], kontrast: contrast(ed.img[0], ed.img[1]).toFixed(1) });
  await page.locator(".note.cur [data-testid=add-source]").hover().catch(() => {});
  await shot(page, `${tag}-25-bos-not-alani`);
  // R3-2: kaydedilmemiş değişiklikle konum yolundan dönüş → 3 seçenek
  const before2 = await raw();
  await typeEditor("Konum yolu testi");
  await tap("[data-testid=back]");
  ok(await page.locator("[data-testid=leave-dialog]").isVisible(), "konum yolundan dönüşte (değişiklik varken) 3 seçenekli pencere");
  await tap("[data-testid=leave-continue]");
  ok((await page.locator("[data-testid=editor]").innerText()).includes("Konum yolu testi"), "Düzenlemeye Devam Et → yazılanlar duruyor");
  await tap("[data-testid=back]");
  await tap("[data-testid=leave-drop]");
  await page.waitForSelector("[data-testid=library]");
  ok((await raw()) === before2, "Kaydetmeden Çık → kütüphaneye döndü, depo değişmedi");

  sec("R3-8) Başlık Ekle: ana başlık, alt başlık, daha derin alt başlık (yeri açıkça gösteriliyor)");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  await pickHeading("Dalak");
  await openAdd();
  ok(await page.locator("[data-testid=addheading-parent]").isVisible(), "panel 'Nereye eklensin?' seçimini gösteriyor");
  await page.selectOption("[data-testid=addheading-parent]", "__root__");
  await page.fill("[data-testid=addchild-input]", "Araştırmalarım");
  const w1 = await page.locator("[data-testid=addheading-where]").innerText();
  ok(/Dalak › Araştırmalarım/.test(w1), "konum önizlemesi: Dalak › Araştırmalarım", w1);
  await shot(page, `${tag}-26-baslik-ekle-paneli`);
  await tap("[data-testid=addheading-submit]");
  ok((await crumbs(page)).trim().endsWith("Araştırmalarım") && (await page.locator("[data-testid=editor]").isVisible()), "ana başlık açıldı ve boş not alanı hazır");
  await typeEditor("Kendi araştırma klasörüm.");
  await openAdd();
  const def2 = await page.locator("[data-testid=addheading-parent] option:checked").innerText();
  ok(/Araştırmalarım altında/.test(def2), "varsayılan yer: bulunulan başlığın altı", def2.trim());
  await page.fill("[data-testid=addchild-input]", "Makaleler");
  await page.keyboard.press("Enter");
  await openAdd();
  await page.fill("[data-testid=addchild-input]", "2024");
  await tap("[data-testid=addheading-submit]");
  const cr3 = (await crumbs(page)).replace(/\s+/g, "");
  ok(/Dalak›Araştırmalarım›Makaleler›2024$/.test(cr3), "3 seviye: Dalak › Araştırmalarım › Makaleler › 2024", cr3);
  await tap("[data-testid=save]");
  const st8 = await store(page);
  const a = dalakNode(st8, "Araştırmalarım");
  const m = dalakNode(st8, "Makaleler");
  const y = dalakNode(st8, "2024");
  ok(a?.parentId === null && m?.parentId === a?.id && y?.parentId === m?.id, "ağaç ilişkisi doğru kaydedildi");
  await openManage();
  await press(`${mRow("Araştırmalarım")} [data-testid=m-edit]`);
  const mv = await page.$$eval("[data-testid=m-move-select] option", (els) => els.map((e) => e.textContent.trim()));
  ok(!mv.some((t) => /^└?\s*(Araştırmalarım|Makaleler|2024) altında/.test(t.replace(/ /g, ""))), "döngü engeli: başlık kendi altına / alt başlıklarına taşınamaz", mv.length);
  await tap("[data-act=m-cancel]");

  sec("R3-9) Hazır başlık bu konuda yeniden adlandırılıyor");
  await press(`${mRow("Refleksoloji")} [data-testid=m-edit]`);
  await page.fill("[data-testid=m-rename-input]", "Ayak Refleksolojisi");
  await shot(page, `${tag}-27-baslik-duzenle`);
  await tap("[data-testid=m-apply]");
  ok((await manageRows()).includes("Ayak Refleksolojisi") && !(await manageRows()).includes("Refleksoloji"), "listede yeni ad");

  sec("R3-10) Hazır başlık silme + geri alma (Kaydet'e bağlı)");
  await press(`${mRow("Mizaç Sebepleri")} [data-testid=m-delete]`);
  ok(/Altında başka başlık ya da not yok/.test(await page.locator("[data-testid=m-delete-impact]").innerText()), "silinecek başlık ve etkisi açıkça gösteriliyor");
  await tap("[data-testid=m-delete-yes]");
  ok(!(await manageRows()).includes("Mizaç Sebepleri"), "Mizaç Sebepleri listeden kalktı");
  await tap("[data-testid=manage-close]");
  ok(!(await store(page)).nodes.some((n) => n.rootId === "t-dalak" && n.templateKey === "konu:mizac"), "Kaydet'ten önce depoda değişiklik yok");
  await tap("[data-testid=save]");
  const st10 = await store(page);
  const rf = st10.nodes.find((n) => n.rootId === "t-dalak" && n.templateKey === "konu:refleksoloji");
  ok(rf?.title === "Ayak Refleksolojisi" && (st10.notes[rf.id] ?? []).filter((n) => !n.deletedAt).length === 3, "Kaydet → ad değişti, 3 not aynı başlıkta duruyor");
  ok(st10.nodes.some((n) => n.rootId === "t-dalak" && n.templateKey === "konu:mizac" && n.deletedAt), "Kaydet → Mizaç Sebepleri bu konuda silindi (tek satır, Silinenler'de)");
  await tap("[data-testid=back]");
  await tap("[data-testid=open-trash]");
  await page.locator('[data-testid=restore][data-title^="Mizaç Sebepleri · Dalak"]')[mobile ? "tap" : "click"]();
  await tap("[data-testid=session] [data-testid=save]");
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  await openManage();
  ok((await manageRows()).includes("Mizaç Sebepleri"), "Silinenler'den geri al + Kaydet → hazır başlık geri geldi");
  await press(`${mRow("Mizaç Sebepleri")} [data-testid=m-delete]`);
  await tap("[data-testid=m-delete-yes]");

  sec("R3-11) Altında not/görsel/kaynak olan başlığı silme — güvenli");
  await press(`${mRow("Uygulamalar / Yöntemler")} [data-testid=m-delete]`);
  const imp = await page.locator("[data-testid=m-delete-impact]").innerText();
  ok(/5 alt başlık/.test(imp) && /3 not/.test(imp) && /3 görsel/.test(imp) && /3 kaynak/.test(imp), "etki: 5 alt başlık, 3 not, 3 görsel, 3 kaynak", imp);
  await shot(page, `${tag}-28-baslik-sil-onayi`);
  await tap("[data-testid=m-delete-yes]");
  await tap("[data-testid=manage-close]");
  await tap("[data-testid=save]");
  const st11 = await store(page);
  const grp = st11.nodes.find((n) => n.rootId === "t-dalak" && n.templateKey === "grup:uygulamalar");
  const rfn = st11.notes[rf.id];
  ok(grp.deletedAt && rfn.every((n) => n.deletedAt) && st11.nodes.find((n) => n.id === rf.id).deletedAt, "Kaydet → başlık, alt başlığı ve 3 notu birlikte Silinenler'de (sessizce kaybolmadı)");
  await tap("[data-testid=back]");
  await tap("[data-testid=open-trash]");
  const tr11 = await page.$$eval("[data-testid=restore]", (els) => els.map((e) => e.getAttribute("data-title")));
  ok(tr11.some((t) => t.startsWith("Uygulamalar / Yöntemler · Dalak")) && !tr11.some((t) => t.startsWith("Ayak Refleksolojisi")) && tr11.some((t) => t.startsWith("Mizaç Sebepleri · Dalak")), "Silinenler: üst başlık tek satır (altındakiler onunla); Mizaç ayrı", tr11);
  await shot(page, `${tag}-29-silinenler-hazir-baslik`);
  await page.locator('[data-testid=restore][data-title^="Uygulamalar / Yöntemler · Dalak"]')[mobile ? "tap" : "click"]();
  await tap("[data-testid=session] [data-testid=save]");
  const st11b = await store(page);
  ok(st11b.notes[rf.id].every((n, i) => !n.deletedAt && n.createdAt === rfn[i].createdAt && n.updatedAt === rfn[i].updatedAt), "Geri al + Kaydet → 3 not tarihleriyle geri geldi");

  sec("R3-12/13) Konu izolasyonu + yeni konu orijinal şablonla");
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');
  await openManage();
  const ak = await manageRows();
  ok(ak.includes("Mizaç Sebepleri") && ak.includes("Refleksoloji") && !ak.includes("Ayak Refleksolojisi") && !ak.includes("Araştırmalarım"), "Dalak'taki değişiklikler Akciğer'e YANSIMADI", { mizac: ak.includes("Mizaç Sebepleri"), refleks: ak.includes("Refleksoloji") });
  await tap("[data-testid=manage-close]");
  await tap("[data-testid=discard]");
  await tap("[data-testid=back]");
  await tap("[data-testid=back]");
  await tap("[data-testid=card-yeni]");
  await page.fill("[data-testid=new-title]", "Böbrek");
  await tap("[data-testid=new-create]");
  await openManage();
  const bo = await manageRows();
  ok(bo.length === 25 && JSON.stringify(bo) === JSON.stringify(TPL_DEF.map((t) => t.label)), "yeni konu: 25 hazır başlığın TAMAMI, orijinal ad ve sırayla", bo.length);
  ok(JSON.stringify((await import("../../../components/sifa-rehberi-f3/sifaData.ts")).TEMPLATE) === TPL_SNAPSHOT, "global şablon tanımı değişmedi");
  await tap("[data-testid=manage-close]");
  const st13 = await store(page);
  ok(!st13.topics.some((t) => t.title === "Böbrek") && st13.nodes.length === st11b.nodes.length, "kaydedilmeden şablon hiçbir satır üretmedi");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  await page.waitForSelector("[data-testid=library]");

  sec("R3-14/15) Sağ çalışma alanından Yeni Başlık ve Not; çoklu not korunuyor");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  await openManage(); // Mizaç silmesi ve Ayak Refleksolojisi'ne geçiş
  await tap("[data-testid=manage-close]");
  if (mobile) {
    await tap("[data-testid=pick]");
    const stg = page.locator('[data-testid=sheet] [data-testid=tree-toggle][data-title="Uygulamalar / Yöntemler"]');
    if ((await stg.getAttribute("aria-expanded")) !== "true") await stg.tap();
    await tap('[data-testid=sheet] [data-testid=tree-item][data-title="Ayak Refleksolojisi"]');
  } else {
    const tg = page.locator('[data-testid=tree] [data-testid=tree-toggle][data-title="Uygulamalar / Yöntemler"]');
    if ((await tg.getAttribute("aria-expanded")) !== "true") await tg.click();
    await tap('[data-testid=tree] [data-testid=tree-item][data-title="Ayak Refleksolojisi"]');
  }
  ok((await page.locator("[data-testid=note-tab]").count()) === 3, "Ayak Refleksolojisi: 3 not (çoklu not korunuyor)");
  const ctr = counter(page, mobile);
  if (mobile) {
    await ctr.hit("[data-testid=pick]");
    await ctr.hit("[data-testid=sheet] [data-testid=add-heading]");
  } else await ctr.hit("[data-testid=side] [data-testid=add-heading]");
  const def14 = await page.locator("[data-testid=addheading-parent] option:checked").innerText();
  ok(/Ayak Refleksolojisi altında/.test(def14), "R4: sol paneldeki 'Başlık Ekle' → yer: bulunulan başlığın altı (açıkça)", def14.trim());
  await page.fill("[data-testid=addchild-input]", "Vaka Notları");
  const pf = await page.evaluate(() => {
    const panel = document.querySelector("[data-testid=addchild-form]").getBoundingClientRect();
    const els = [...document.querySelectorAll("[data-testid=addchild-form] input, [data-testid=addchild-form] select, [data-testid=addchild-form] button")].map((e) => e.getBoundingClientRect());
    return { out: els.filter((r) => r.right > panel.right + 1 || r.right > innerWidth).length, page: document.documentElement.scrollWidth - innerWidth };
  });
  ok(pf.out === 0 && pf.page <= 0, "Yeni başlık paneli: alanlar panel ve ekran içinde (taşma yok)", pf);
  if (!mobile) await shot(page, `${tag}-30-yeni-baslik-ve-not`);
  else await shot(page, `${tag}-30-yeni-baslik-ve-not`);
  await ctr.hit("[data-testid=addheading-submit]");
  await page.fill("[data-testid=note-title-input]", "İlk vaka");
  await typeEditor("Sağ alandan açılan başlığın ilk notu.");
  await ctr.hit("[data-testid=save]");
  const st14 = await store(page);
  const vk = dalakNode(st14, "Vaka Notları");
  ok(vk?.parentId === rf.id && st14.notes[vk.id]?.[0]?.title === "İlk vaka" && /ilk notu/.test(st14.notes[vk.id][0].html), "başlık ağaca eklendi + notu kaydedildi", { tiklama: ctr.s.clicks });
  await pickHeading("Ayak Refleksolojisi");
  await tap("[data-testid=edit]");
  ok(!(await page.locator("[data-testid=new-note]").count()) && !(await page.locator("button", { hasText: "Yeni Not" }).count()) && (await page.locator("[data-testid=note-tab]").count()) === 3, "R5: düzenlemede '＋ Yeni Not' yok (başka adla da yok); mevcut 3 not korunuyor");
  await tap("[data-testid=discard]");
  ok((await page.locator("[data-testid=note-tab]").count()) === 3, "Vazgeç → 3 not");

  sec("R3-16) Kaydetmeden Çık bütün bekleyen başlık değişikliklerini iptal eder");
  const before16 = await raw();
  await openManage();
  await press(`${mRow("Araştırmalarım")} [data-testid=m-edit]`);
  await page.fill("[data-testid=m-rename-input]", "DEĞİŞTİ");
  await tap("[data-testid=m-apply]");
  await press(`${mRow("Aromaterapi")} [data-testid=m-delete]`);
  await tap("[data-testid=m-delete-yes]");
  await press(`${mRow("Uygulamalar / Yöntemler")} [data-testid=m-delete]`);
  await tap("[data-testid=m-delete-yes]");
  await tap("[data-testid=manage-close]");
  await openAdd();
  await page.fill("[data-testid=addchild-input]", "Geçici başlık");
  await tap("[data-testid=addheading-submit]");
  await typeEditor("geçici not");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  await openManage();
  const r16 = await manageRows();
  ok((await raw()) === before16 && r16.includes("Araştırmalarım") && r16.includes("Aromaterapi") && r16.includes("Ayak Refleksolojisi") && !r16.includes("Geçici başlık") && !r16.includes("DEĞİŞTİ"), "ad değişikliği + 2 silme + yeni başlık + not → hepsi iptal; depo aynı");
  await tap("[data-testid=manage-close]");
  await tap("[data-testid=discard]");

  if (!mobile) {
    sec("R3-17) Sol liste kaydırma konumu yeni panellerde de korunuyor");
    const tg = page.locator('[data-testid=tree] [data-testid=tree-toggle][data-title="Belirtiler / Sebepler"]');
    if ((await tg.getAttribute("aria-expanded")) !== "true") await tg.click();
    await page.evaluate(() => (document.querySelector("[data-testid=side-scroll]").scrollTop = 200));
    const t0 = await page.evaluate(() => document.querySelector("[data-testid=side-scroll]").scrollTop);
    await tap("[data-testid=side] [data-testid=manage-headings]");
    await tap("[data-testid=manage-close]");
    const t1 = await page.evaluate(() => document.querySelector("[data-testid=side-scroll]").scrollTop);
    await tap("[data-testid=side] [data-testid=add-heading]");
    await tap("[data-act=close-panel]");
    const t2 = await page.evaluate(() => document.querySelector("[data-testid=side-scroll]").scrollTop);
    ok(t0 > 0 && t1 === t0 && t2 === t0, "Başlık Düzenle/Sil ve Başlık Ekle paneli listeyi kaydırmadı", { t0, t1, t2 });
    await tap("[data-testid=discard]");
    await openManage();
    await shot(page, `${tag}-31-baslik-yonetimi`);
    await tap("[data-testid=manage-close]");
    await tap("[data-testid=discard]");
    await shot(page, `${tag}-32-konu-okuma`);
  } else {
    sec("R3-18) Mobil: taşma ve düğme çakışması yok");
    const over = (sel) => page.evaluate((s) => {
      const rs = [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect()).filter((r) => r.width);
      let hit = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (rs[i].left < rs[j].right - 1 && rs[j].left < rs[i].right - 1 && rs[i].top < rs[j].bottom - 1 && rs[j].top < rs[i].bottom - 1) hit++;
      return { hit, page: document.documentElement.scrollWidth - innerWidth, out: rs.filter((r) => r.right > innerWidth + 1 || r.left < -1).length };
    }, sel);
    await tap("[data-testid=edit]");
    const o1 = await over("[data-testid=topbar] button, .nacts button, [data-testid=pick]");
    ok(o1.hit === 0 && o1.page <= 0 && o1.out === 0, "düzenleme: üst çubuk düğmeleri çakışmıyor, taşmıyor", o1);
    await shot(page, `${tag}-31-duzenleme`);
    await tap("[data-testid=discard]");
    await tap("[data-testid=pick]");
    const o2 = await over("[data-testid=sheet] .hacts button");
    ok(o2.hit === 0 && o2.out === 0, "başlık seç: + Başlık Ekle · Başlık Düzenle / Sil yan yana, rahat", o2);
    await shot(page, `${tag}-32-baslik-sec`);
    await tap("[data-testid=sheet] [data-testid=manage-headings]");
    const o3 = await over("[data-testid=manage] button");
    ok(o3.hit === 0 && o3.page <= 0 && o3.out === 0, "Başlık Düzenle / Sil penceresi mobilde taşmıyor", o3);
    await shot(page, `${tag}-33-baslik-yonetimi`);
    await press(`${mRow("Diyet Önerileri")} [data-testid=m-delete]`);
    await page.locator("[data-testid=m-delete-confirm]").scrollIntoViewIfNeeded();
    await shot(page, `${tag}-34-baslik-sil-onayi`);
    await tap("[data-act=m-cancel]");
    await tap("[data-testid=manage-close]");
    await tap("[data-testid=discard]");
  }
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
}

// ── REVİZYON 4 senaryoları ───────────────────────────────────────────────────────
const R4N = [
  { title: "Akciğer ve mizaç ilişkisi", text: "Kuru ve soğuk mizaçta akciğer hassasiyeti artabilir (sentetik)." },
  { title: "Balgamlı mizaç gözlemi", text: "Nemli mizaçta balgam artışı görülebilir (sentetik)." },
  { title: "Mevsim etkisi", text: "Sonbaharda belirtiler belirginleşebilir (sentetik)." },
];
const R4B = [
  { title: "Dikkat Edilecekler", text: "Soğuk içeceklerden kaçınılmalı.", cap: "Dikkat görseli", src: "Mizaç ve solunum", link: "10.4321/mizac.2022.5", url: "https://ornek.example/dikkat" },
  { title: "Uygulama Önerileri", text: "Ilık buhar ve kuru sıcak uygulama.", src: "Geleneksel uygulamalar kitabı", link: "https://ornek.example/uygulama" },
  { title: "Araştırma Notlarım", text: "Okunacak makaleler listesi.", url: "https://ornek.example/arastirma" },
];
async function rev4(page, tap, pickHeading, mobile, tag) {
  const press = (sel, i = 0) => page.locator(sel).nth(i)[mobile ? "tap" : "click"]();
  const inNote = (i, sel) => page.locator("[data-testid=note]").nth(i).locator(sel)[mobile ? "tap" : "click"]();
  const lastBox = () => page.locator(".cbox.editing").last();
  const typeIn = async (loc, t) => {
    await loc[mobile ? "tap" : "click"]();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(t);
  };
  const typeEditor = (t) => typeIn(page.locator("[data-testid=editor]"), t);
  const raw = () => rawStore(page);
  const mizacId = (st) => st.nodes.find((n) => n.rootId === "t-akciger" && n.templateKey === "konu:mizac" && !n.deletedAt)?.id;
  const mizac = async () => {
    const st = await store(page);
    return (st.notes[mizacId(st)] ?? []).filter((n) => !n.deletedAt);
  };
  const openManage = async () => {
    if (mobile) {
      await tap("[data-testid=pick]");
      await tap("[data-testid=sheet] [data-testid=manage-headings]");
    } else await tap("[data-testid=side] [data-testid=manage-headings]");
    await page.waitForSelector("[data-testid=manage]");
  };
  const rowsOf = () => page.$$eval("[data-testid=manage-row]", (els) => els.map((e) => e.getAttribute("data-title")));
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');

  sec("R4-1) Sağdaki 'Yeni Başlık ve Not' kaldırıldı; tek yol sol paneldeki 'Başlık Ekle'");
  await pickHeading("Bronşit");
  const dup1 = await page.locator("[data-testid=new-heading-note]").count();
  await tap("[data-testid=menu]");
  const menuTxt = await page.locator("[data-testid=menu-list]").innerText();
  await page.keyboard.press("Escape");
  await tap("[data-testid=edit]");
  const dup2 = await page.locator("[data-testid=new-heading-note]").count();
  const nn = await page.locator("[data-testid=new-note]").count();
  await tap("[data-testid=discard]");
  ok(dup1 === 0 && dup2 === 0 && !/Yeni başlık|Başlıkları düzenle|Yeni not/i.test(menuTxt) && nn === 0, "R5: sağda '＋ Yeni Not' de yok; başlık ekleme/düzenleme tekrarları yok (menüde de)", { dup1, dup2, yeniNot: nn });
  ok(await page.locator(mobile ? "[data-testid=pick]" : "[data-testid=side] [data-testid=add-heading]").isVisible(), "başlık ekleme sol panelde (mobilde 'Başlık seç' içinde)");

  sec("R4-8/9) Grup başlığı not editörü açmaz; alt başlık seçilince notlar açılır");
  const nodes0 = (await store(page)).nodes.length;
  await pickHeading("Belirtiler / Sebepler");
  const g1 = await page.evaluate(() => ({ gv: !!document.querySelector("[data-testid=group-view]"), ed: document.querySelectorAll(".editor").length, nn: document.querySelectorAll("[data-testid=new-note]").length, kids: [...document.querySelectorAll("[data-testid=group-child]")].map((e) => e.getAttribute("data-title")) }));
  ok(g1.gv && g1.ed === 0 && g1.nn === 0, "grup seçildi: alt başlık listesi var, not editörü ve 'Yeni Not' YOK", g1);
  ok(JSON.stringify(g1.kids) === JSON.stringify(["Genel / Özet", "Tıbbi Nedenler", "Bilinçaltı Sebepleri", "Mizaç Sebepleri", "Diğer Sebepler", "İridolojide Karşılığı", "El Analizinde Karşılığı"]), "grubun 7 alt başlığı sade listede", g1.kids.length);
  await shot(page, `${tag}-35-grup-basligi`);
  await tap("[data-testid=edit]");
  ok((await page.locator(".editor").count()) === 0 && (await page.locator("[data-testid=group-view]").isVisible()), "Düzenle'de de grup başlığına not alanı açılmıyor");
  await tap("[data-testid=discard]");
  ok((await store(page)).nodes.length === nodes0, "grup başlığına bakmak kayıt satırı üretmedi");
  await tap('[data-testid=group-child][data-title="Mizaç Sebepleri"]');
  ok(/Mizaç Sebepleri/.test(await page.locator("[data-testid=heading-title]").innerText()) && (await page.locator("[data-testid=note-empty]").isVisible()), "alt başlığa dokununca o başlığın not alanı açıldı");

  sec("R4-3/4) Küçük başlık, yukarıdan başlayan yazma alanı; aynı başlıkta 3 not");
  await tap("[data-testid=edit]");
  const geo = await page.evaluate(() => ({ fs: parseFloat(getComputedStyle(document.querySelector(".htitle")).fontSize), top: Math.round(document.querySelector("[data-testid=editor]").getBoundingClientRect().top), bc: getComputedStyle(document.querySelector("[data-testid=editor]")).borderTopColor }));
  ok(geo.fs <= 24 && (mobile ? geo.top < 560 : geo.top < 330), "başlık küçüldü, yazma alanı yukarıda başlıyor (çerçeve görünür)", { punto: geo.fs, ust: geo.top, onceki: "38 px / ≈ 360 px" });
  await page.fill("[data-testid=note-title-input]", R4N[0].title);
  await typeEditor(R4N[0].text);
  ok((await page.locator("[data-testid=editor]").count()) === 1, "ilk not yazılırken tek editör açık (notlar karışmıyor)");
  await tap("[data-testid=save]");
  await addSavedNotes(page, mizacId(await store(page)), R4N.slice(1).map((n) => savedNote(n, null, new Date().toISOString())));
  const m1 = await mizac();
  ok(m1.length === 3 && m1.every((n, i) => n.title === R4N[i].title && n.html.includes(R4N[i].text.slice(0, 12)) && n.createdAt), "3 bağımsız not depoda (1'i arayüzden, 2'si önceden kaydedilmiş)", m1.map((n) => n.title));

  sec("R4-5) Üç not tek sayfada alt alta");
  const st5 = await page.evaluate(() => [...document.querySelectorAll("[data-testid=note]")].map((a) => ({ t: a.querySelector("[data-testid=note-title]")?.innerText, v: a.querySelector("[data-testid=note-view]")?.innerText ?? "", top: Math.round(a.getBoundingClientRect().top), ed: !!a.querySelector("[data-testid=note-edit]"), del: !!a.querySelector("[data-testid=note-delete]"), d: a.querySelector("[data-testid=note-dates]")?.innerText ?? "" })));
  ok(st5.length === 3 && st5.every((x, i) => x.t === R4N[i].title && x.v.includes(R4N[i].text.slice(0, 12))) && st5[0].top < st5[1].top && st5[1].top < st5[2].top, "3 notun hepsi aynı anda sayfada, sırayla alt alta (sekme yok)", st5.map((x) => x.top));
  ok(st5.every((x) => x.ed && x.del && /Oluşturuldu/.test(x.d)), "her notun kendi Düzenle / Sil düğmesi ve tarihi var");
  await page.locator("[data-testid=note]").nth(2).scrollIntoViewIfNeeded();
  ok(await page.locator("[data-testid=note]").nth(2).locator("[data-testid=note-view]").isVisible(), "aşağı kaydırınca 3. not okunuyor");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${tag}-36-uc-not-alt-alta`, !mobile);

  sec("R4-6/17) Yalnız bir notu düzenleme; yalnız onun tarihi değişir");
  const b6 = await mizac();
  await page.waitForTimeout(20);
  await inNote(1, "[data-testid=note-edit]");
  const e6 = await page.evaluate(() => ({ eds: document.querySelectorAll("[data-testid=editor]").length, t: document.querySelector("[data-testid=note-title-input]")?.value, views: document.querySelectorAll("[data-testid=note-view]").length }));
  ok(e6.eds === 1 && e6.t === R4N[1].title && e6.views === 2, "2. notun Düzenle'si: yalnız o not düzenlemede, diğer ikisi okumada", e6);
  await typeEditor(" Ek bilgi.");
  await tap("[data-testid=save]");
  const a6 = await mizac();
  ok(a6[1].updatedAt > b6[1].updatedAt && a6[1].createdAt === b6[1].createdAt && JSON.stringify(a6[0]) === JSON.stringify(b6[0]) && JSON.stringify(a6[2]) === JSON.stringify(b6[2]), "yalnız düzenlenen notun 'son güncelleme' tarihi değişti");

  sec("R4-7) Bir notu silme ve geri alma (Kaydet'e bağlı)");
  await inNote(2, "[data-testid=note-delete]");
  ok(await page.locator("[data-testid=note-delete-confirm]").isVisible(), "okuma modundaki 'Sil' önce onay istiyor");
  await tap("[data-testid=note-delete-yes]");
  ok((await page.locator("[data-testid=note]").count()) === 2 && (await mizac()).length === 3, "not ekrandan kalktı; Kaydet'ten önce depoda duruyor");
  await tap("[data-testid=save]");
  ok((await mizac()).length === 2, "Kaydet → not Silinenler'e gitti");
  await tap("[data-testid=back]");
  await tap("[data-testid=open-trash]");
  await page.locator(`[data-testid=restore][data-title^="${R4N[2].title}"]`)[mobile ? "tap" : "click"]();
  await tap("[data-testid=session] [data-testid=save]");
  const r7 = await mizac();
  ok(r7.length === 3 && r7[2].createdAt === a6[2].createdAt && r7[2].updatedAt === a6[2].updatedAt, "Geri al + Kaydet → not tarihleriyle geri geldi");
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');
  ok(/Mizaç Sebepleri/.test(await crumbs(page)) && (await page.locator("[data-testid=note]").count()) === 3, "Akciğer yeniden açıldı: Mizaç Sebepleri, 3 not alt alta");

  sec("R4-10/11/12) Not içinde içerik kutuları (ayrı metin, görsel, kaynak, bağlantı)");
  const b10 = await mizac();
  await page.waitForTimeout(20);
  await inNote(0, "[data-testid=note-edit]");
  ok((await page.locator("[data-testid=box-add]").count()) === 1 && (await page.locator(".cbox-tools").count()) === 0, "notta '＋ İçerik Kutusu Ekle' var; kutu araçları kutu eklenmeden görünmüyor");
  for (const [i, b] of R4B.entries()) {
    await tap("[data-testid=box-add]");
    await lastBox().locator("[data-testid=box-title-input]").fill(b.title);
    await typeIn(lastBox().locator("[data-testid=box-editor]"), b.text);
    if (b.cap) {
      await lastBox().locator("[data-testid=box-add-image] input").setInputFiles({ name: `kutu-${i + 1}.png`, mimeType: "image/png", buffer: IMGS[i] });
      await page.waitForFunction(() => [...document.querySelectorAll(".cbox.editing")].pop()?.querySelectorAll("[data-testid=box-image-item]").length === 1);
      await lastBox().locator("[data-testid=box-image-caption]").fill(b.cap);
    }
    if (b.src) {
      await lastBox().locator("[data-testid=box-add-source]")[mobile ? "tap" : "click"]();
      await page.fill("[data-testid=source-title]", b.src);
      await page.fill("[data-testid=source-link]", b.link);
      await tap("[data-testid=source-submit]");
    }
    if (b.url) {
      await lastBox().locator("[data-testid=box-add-link]")[mobile ? "tap" : "click"]();
      await page.fill("[data-testid=link-url]", "yanlış adres");
      await tap("[data-testid=link-submit]");
      if (i === 0) ok(/https/.test(await page.locator("[data-testid=link-error]").innerText()), "geçersiz bağlantı eklenmedi, açık uyarı");
      await page.fill("[data-testid=link-title]", `${b.title} bağlantısı`);
      await page.fill("[data-testid=link-url]", b.url);
      await tap("[data-testid=link-submit]");
    }
  }
  ok((await page.locator(".cbox.editing").count()) === 3, "aynı nota 3 içerik kutusu eklendi");
  await page.locator(".cbox.editing").first().scrollIntoViewIfNeeded();
  await shot(page, `${tag}-37-icerik-kutulari-duzenleme`);
  await tap("[data-testid=save]");
  const a10 = await mizac();
  const bx = a10[0].boxes ?? [];
  ok(bx.length === 3 && bx.every((b, i) => b.title === R4B[i].title && b.html.includes(R4B[i].text.slice(0, 10))), "kutular notun parçası olarak kaydedildi; adları ve metinleri ayrı", bx.map((b) => b.title));
  ok(bx[0].images.length === 1 && bx[0].images[0].caption === R4B[0].cap && bx[0].sources[0].doi === R4B[0].link && bx[0].links[0].url === R4B[0].url && bx[1].images.length === 0 && bx[1].sources[0].url === R4B[1].link && bx[1].links.length === 0 && bx[2].sources.length === 0 && bx[2].links[0].url === R4B[2].url, "görsel/kaynak/bağlantı yalnız kendi kutusunda (karışma yok)");
  ok(JSON.stringify(a10[0].images) === JSON.stringify(b10[0].images) && JSON.stringify(a10[0].sources) === JSON.stringify(b10[0].sources), "notun ana Görseller / Kaynaklar bölümleri ayrı ve korunuyor");
  ok(a10[0].updatedAt > b10[0].updatedAt && a10[0].createdAt === b10[0].createdAt && JSON.stringify(a10[1]) === JSON.stringify(b10[1]) && JSON.stringify(a10[2]) === JSON.stringify(b10[2]), "kutu değişikliği yalnız o notun güncelleme tarihine yansıdı");
  const rd = await page.evaluate(() => [...document.querySelectorAll("[data-testid=note]")][0].querySelectorAll("[data-testid=cbox]").length);
  ok(rd === 3 && (await page.locator("[data-testid=note]").nth(0).locator("[data-testid=box-link-item]").count()) === 2, "okuma modunda 3 kutu notun içinde, alt alta");
  await page.locator("[data-testid=note]").nth(0).locator("[data-testid=cbox]").first().scrollIntoViewIfNeeded();
  await shot(page, `${tag}-38-icerik-kutulari-okuma`);

  sec("R4-13 + R5-3) Kutu adını değiştirme; kutuyu DOĞRUDAN silme (bildirim / Geri al / Silinenler yok)");
  const b13 = await mizac();
  const raw13 = await raw();
  const delId = b13[0].boxes[2].id;
  await page.waitForTimeout(20);
  await inNote(0, "[data-testid=note-edit]");
  await page.locator(".cbox.editing").nth(1).locator("[data-testid=box-title-input]").fill("Uygulama Önerilerim");
  await page.locator(".cbox.editing").nth(2).locator("[data-testid=box-delete]")[mobile ? "tap" : "click"]();
  const v13 = await page.evaluate(() => ({ boxes: document.querySelectorAll(".cbox.editing").length, undo: document.querySelectorAll("[data-testid=box-undo-row], [data-testid=box-undo], .cbox-undo").length, txt: document.querySelector("[data-testid=notes]")?.innerText ?? "", toast: document.querySelector("[data-testid=toast]")?.innerText ?? "" }));
  ok(v13.boxes === 2 && !v13.txt.includes("Araştırma Notlarım"), "Kutuyu sil → kutu ekrandan HEMEN kalktı", { kutu: v13.boxes });
  ok(v13.undo === 0 && !/Geri al/.test(v13.txt) && !/kesinleşir/.test(v13.txt + v13.toast), "'Kaydet'e basınca kesinleşir' bildirimi ve 'Geri al' düğmesi YOK", { undo: v13.undo, toast: v13.toast });
  ok((await raw()) === raw13, "Kaydet'ten önce kayıtlı veri değişmedi");
  await shot(page, `${tag}-44-kutu-dogrudan-silindi`);
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  ok((await raw()) === raw13 && (await page.locator("[data-testid=note]").nth(0).locator("[data-testid=cbox]").count()) === 3, "Vazgeç → Kaydetmeden Çık: kutu yerinde, kayıtlı veri aynen");
  await inNote(0, "[data-testid=note-edit]");
  await page.locator(".cbox.editing").nth(1).locator("[data-testid=box-title-input]").fill("Uygulama Önerilerim");
  await page.locator(".cbox.editing").nth(2).locator("[data-testid=box-delete]")[mobile ? "tap" : "click"]();
  await tap("[data-testid=save]");
  const a13n = await mizac();
  const a13 = a13n[0].boxes;
  ok(a13.length === 2 && a13[1].title === "Uygulama Önerilerim" && !a13.some((b) => b.id === delId) && (await page.locator("[data-testid=note]").nth(0).locator("[data-testid=cbox]").count()) === 2, "Kaydet → ad değişti; kutu kalıcı silindi (notta kaydı yok)", a13.map((b) => b.title));
  const raw13b = await raw();
  ok(!raw13b.includes(delId) && !raw13b.includes(R4B[2].url) && !raw13b.includes(R4B[2].text), "silinen kutunun metni ve bağlantısı depoda HİÇ kalmadı");
  ok(a13[0].images.length === 1 && a13[0].sources[0].doi === R4B[0].link && a13[0].links[0].url === R4B[0].url && a13[1].sources[0].url === R4B[1].link, "diğer kutuların görsel/kaynak/bağlantıları yerinde");
  ok(a13n[0].updatedAt > b13[0].updatedAt && a13n[0].createdAt === b13[0].createdAt && JSON.stringify(a13n[1]) === JSON.stringify(b13[1]) && JSON.stringify(a13n[2]) === JSON.stringify(b13[2]), "yalnız o notun 'son güncelleme' tarihi değişti; diğer notlar aynı");
  await tap("[data-testid=back]");
  await tap("[data-testid=open-trash]");
  const tr = await page.$$eval("[data-testid=restore]", (els) => els.map((e) => `${e.getAttribute("data-kind")}|${e.getAttribute("data-title")}`));
  ok(!tr.some((t) => t.startsWith("kutu|Araştırma Notlarım")), "Silinenler'de bu kutu YOK (arşive gönderilmedi)", tr.filter((t) => t.startsWith("kutu")));
  await shot(page, `${tag}-45-silinenler-kutu-yok`);
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');
  // Sonraki regresyon adımları için aynı adla YENİ bir kutu (yeni kimlik) eklenir.
  await inNote(0, "[data-testid=note-edit]");
  await tap("[data-testid=box-add]");
  await lastBox().locator("[data-testid=box-title-input]").fill(R4B[2].title);
  await typeIn(lastBox().locator("[data-testid=box-editor]"), R4B[2].text);
  await lastBox().locator("[data-testid=box-add-link]")[mobile ? "tap" : "click"]();
  await page.fill("[data-testid=link-title]", `${R4B[2].title} bağlantısı`);
  await page.fill("[data-testid=link-url]", R4B[2].url);
  await tap("[data-testid=link-submit]");
  await tap("[data-testid=save]");
  const re13 = (await mizac())[0].boxes;
  ok(re13.length === 3 && re13[2].title === R4B[2].title && re13[2].id !== delId, "aynı adla eklenen kutu yeni kayıt (eski kimlik geri gelmedi)");

  sec("R4-15) Kaydetmeden Çık: not, kutu, görsel, kaynak, bağlantı değişikliklerinin hepsi iptal");
  const before15 = await raw();
  await inNote(0, "[data-testid=note-edit]");
  await tap("[data-testid=box-add]");
  await lastBox().locator("[data-testid=box-title-input]").fill("Geçici kutu");
  await page.locator(".cbox.editing").first().locator("[data-testid=box-image-remove]")[mobile ? "tap" : "click"]();
  await page.locator(".cbox.editing").first().locator("[data-testid=box-source-delete]")[mobile ? "tap" : "click"]();
  await page.locator(".cbox.editing").first().locator("[data-testid=box-link-delete]")[mobile ? "tap" : "click"]();
  await page.locator(".cbox.editing").nth(1).locator("[data-testid=box-delete]")[mobile ? "tap" : "click"]();
  await page.fill("[data-testid=note-title-input]", "Geçici not adı");
  await inNote(1, "[data-testid=note-delete]");
  await tap("[data-testid=note-delete-yes]");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  const v15 = await page.evaluate(() => ({ notes: document.querySelectorAll("[data-testid=note]").length, boxes: document.querySelectorAll("[data-testid=note]")[0]?.querySelectorAll("[data-testid=cbox]").length }));
  ok((await raw()) === before15 && v15.notes === 3 && v15.boxes === 3, "hepsi iptal; depo ve ekran eski hâlinde", v15);

  sec("R4-16) Başlık değişikliği yalnız o konuda");
  await openManage();
  await page.locator('[data-testid=manage-row][data-title="Diğer Sebepler"] [data-testid=m-edit]')[mobile ? "tap" : "click"]();
  await page.fill("[data-testid=m-rename-input]", "Diğer Etkenler");
  await tap("[data-testid=m-apply]");
  await tap("[data-testid=manage-close]");
  await tap("[data-testid=save]");
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  await openManage();
  const dr = await rowsOf();
  ok(dr.includes("Diğer Sebepler") && !dr.includes("Diğer Etkenler"), "Akciğer'deki ad değişikliği Dalak'a yansımadı");
  await tap("[data-testid=manage-close]");
  await tap("[data-testid=discard]");

  sec("R4-19) Eski kayıtlar korunuyor: grup başlığına yazılmış not kaybolmuyor");
  const before19 = await raw();
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Şiddetli Öksürük"]');
  await pickHeading("Uygulamalar / Yöntemler");
  const lg = await page.evaluate(() => ({ gv: !!document.querySelector("[data-testid=group-view]"), lg: document.querySelector("[data-testid=group-legacy]")?.innerText ?? "", edit: !!document.querySelector("[data-testid=group-legacy] [data-testid=note-edit]"), nn: document.querySelectorAll("[data-testid=new-note]").length }));
  ok(lg.gv && /Eski grup notu/.test(lg.lg) && lg.edit && lg.nn === 0, "grup görünümü + eski not ayrı bölümde, okunabilir/düzenlenebilir; yeni not açılmıyor", { eskiNot: /Eski grup notu/.test(lg.lg) });
  ok((await raw()) === before19 && !(await store(page)).notes["n-ok-bitkisel-g"][0].deletedAt, "eski not taşınmadı, silinmedi; depo değişmedi");
  await shot(page, `${tag}-39-grup-eski-not`);

  sec("R4-20) Tümünü Oku ve Word: çoklu notlar ve kutular eksiksiz, doğru sırada");
  await tap("[data-testid=back]");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');
  if (mobile) {
    await tap("[data-testid=menu]");
    await tap("[data-testid=mi-read]");
  } else await tap("[data-testid=read-all]");
  const rv = await page.evaluate(() => {
    const sec = [...document.querySelectorAll(".rsec")].find((s) => /Mizaç Sebepleri/.test(s.querySelector("h2")?.innerText ?? ""));
    return { notes: [...(sec?.querySelectorAll("[data-testid=read-note] > h3") ?? [])].map((e) => e.innerText), boxes: [...(sec?.querySelectorAll("[data-testid=read-note]")[0]?.querySelectorAll("[data-testid=read-box] h4") ?? [])].map((e) => e.innerText) };
  });
  ok(JSON.stringify(rv.notes) === JSON.stringify(R4N.map((n) => n.title)) && JSON.stringify(rv.boxes) === JSON.stringify(["Dikkat Edilecekler", "Uygulama Önerilerim", "Araştırma Notlarım"]), "Tümünü Oku: 3 not + 1. notun 3 kutusu doğru sırada", rv);
  await shot(page, `${tag}-40-tumunu-oku`, !mobile);
  const [dl] = await Promise.all([page.waitForEvent("download"), tap("[data-act=word]")]);
  const zip = await JSZip.loadAsync(readFileSync(await dl.path()));
  const doc = (await zip.file("word/document.xml").async("string")).replace(/<[^>]+>/g, " ");
  const pos = [...R4N.map((n) => n.title), "Dikkat Edilecekler", "Uygulama Önerilerim", "Araştırma Notlarım"].map((t) => doc.indexOf(t));
  ok(pos.every((x) => x >= 0) && pos[0] < pos[3] && pos[3] < pos[4] && pos[4] < pos[5] && pos[5] < pos[1] && pos[1] < pos[2] && doc.includes(R4B[0].url) && doc.includes("Dikkat görseli"), "Word: notlar ve kutular (görsel açıklaması, bağlantı dahil) doğru sırada", pos);
  await tap("[data-testid=back-topic]");

  if (!mobile) {
    sec("R4-18) Masaüstü: sol liste konumu not/kutu işlemlerinde korunuyor");
    await page.evaluate(() => (document.querySelector("[data-testid=side-scroll]").scrollTop = 120));
    const s0 = await page.evaluate(() => document.querySelector("[data-testid=side-scroll]").scrollTop);
    await inNote(2, "[data-testid=note-edit]");
    await tap("[data-testid=box-add]");
    await tap("[data-testid=expand]");
    await tap("[data-testid=expand-close]");
    const s1 = await page.evaluate(() => document.querySelector("[data-testid=side-scroll]").scrollTop);
    ok(s0 > 0 && s1 === s0, "Düzenle / kutu ekle / büyütme penceresi aç-kapa sol listeyi kaydırmadı", { s0, s1 });
    await tap("[data-testid=discard]");
    await tap("[data-testid=leave-drop]");
  } else {
    sec("R4-18) Mobil: alt alta notlar ve kutularda taşma / çakışma yok");
    const chk = () => page.evaluate(() => {
      const els = [...document.querySelectorAll(".note button, .note input, .cbox, .note .editor, [data-testid=topbar] button")].map((e) => e.getBoundingClientRect()).filter((r) => r.width);
      return { page: document.documentElement.scrollWidth - innerWidth, out: els.filter((r) => r.right > innerWidth + 1 || r.left < -1).length };
    });
    const c1 = await chk();
    await inNote(0, "[data-testid=note-edit]");
    const c2 = await chk();
    ok(c1.page <= 0 && c1.out === 0 && c2.page <= 0 && c2.out === 0, "okuma ve kutulu düzenleme: yatay taşma yok", { okuma: c1, duzenleme: c2 });
    await page.locator("[data-testid=note]").nth(2).scrollIntoViewIfNeeded();
    ok(await page.locator("[data-testid=note]").nth(2).isVisible(), "mobilde de notlar aşağı kaydırılarak okunuyor");
    await tap("[data-testid=discard]");
  }
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
}

// ── REVİZYON 5 senaryoları ───────────────────────────────────────────────────────
async function rev5(page, tap, pickHeading, mobile, tag) {
  const inNote = (i, sel) => page.locator("[data-testid=note]").nth(i).locator(sel)[mobile ? "tap" : "click"]();
  const raw = () => rawStore(page);
  const mizacId = (st) => st.nodes.find((n) => n.rootId === "t-akciger" && n.templateKey === "konu:mizac" && !n.deletedAt)?.id;
  const mizac = async () => {
    const st = await store(page);
    return (st.notes[mizacId(st)] ?? []).filter((n) => !n.deletedAt);
  };
  const xe = "[data-testid=expand-editor]";
  const typeX = async (t) => {
    await page.locator(xe)[mobile ? "tap" : "click"]();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(t);
  };
  const html = (sel) => page.locator(sel).first().evaluate((e) => e.innerHTML);
  const boxEd = (i) => page.locator(".cbox.editing").nth(i).locator("[data-testid=box-editor]");
  const geoX = () => page.evaluate(() => {
    const d = document.querySelector("[data-testid=expand-dialog]").getBoundingClientRect();
    const c = document.querySelector("[data-testid=expand-close]").getBoundingClientRect();
    const e = document.querySelector("[data-testid=expand-editor]").getBoundingClientRect();
    return { w: Math.round(d.width), h: Math.round(d.height), l: Math.round(d.left), t: Math.round(d.top), r: Math.round(d.right), b: Math.round(d.bottom), vw: innerWidth, vh: innerHeight, area: +((d.width * d.height) / (innerWidth * innerHeight)).toFixed(2), cx: Math.round(d.left + d.width / 2), cy: Math.round(d.top + d.height / 2), closeR: Math.round(d.right - c.right), closeT: Math.round(c.top - d.top), edH: Math.round(e.height), page: document.documentElement.scrollWidth - innerWidth };
  });
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');
  await pickHeading("Belirtiler / Sebepler");
  await tap('[data-testid=group-child][data-title="Mizaç Sebepleri"]');

  sec("R5-2) '＋ Yeni Not' düğmesi tamamen kaldırıldı; notlar ve içerik kutuları korunuyor");
  const n0 = await page.evaluate(() => ({ nn: document.querySelectorAll("[data-testid=new-note]").length, txt: [...document.querySelectorAll("button")].filter((b) => /Yeni Not/i.test(b.textContent)).length, notes: document.querySelectorAll("[data-testid=note]").length }));
  await inNote(0, "[data-testid=note-edit]");
  const n1 = await page.evaluate(() => ({ nn: document.querySelectorAll("[data-testid=new-note]").length, txt: [...document.querySelectorAll("button")].filter((b) => /Yeni Not/i.test(b.textContent)).length, add: document.querySelectorAll("[data-testid=box-add]").length, boxes: document.querySelectorAll(".cbox.editing").length }));
  ok(n0.nn === 0 && n0.txt === 0 && n1.nn === 0 && n1.txt === 0, "okuma ve düzenlemede '＋ Yeni Not' (ya da başka adla yeni not düğmesi) yok", { okuma: n0, duzenleme: n1 });
  ok(n0.notes === 3 && n1.add === 1 && n1.boxes === 3, "kayıtlı 3 not alt alta; '＋ İçerik Kutusu Ekle' ve 3 kutu duruyor", { notlar: n0.notes, kutu: n1.boxes });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, `${tag}-46-yeni-not-dugmesi-yok`);

  sec("R5-1) Büyütme simgesi: ana notta ve her içerik kutusunda, sağ üst köşede");
  const ic = await page.evaluate(() => {
    const pos = (btn, ed) => {
      const b = btn.getBoundingClientRect();
      const e = ed.getBoundingClientRect();
      return { right: Math.round(e.right - b.right), top: Math.round(b.top - e.top), inside: b.left >= e.left && b.right <= e.right && b.top >= e.top && b.bottom <= e.bottom, txt: btn.textContent.trim(), w: Math.round(b.width) };
    };
    const main = document.querySelector("[data-testid=expand]");
    const boxes = [...document.querySelectorAll(".cbox.editing")].map((bx) => ({ n: bx.querySelectorAll("[data-testid=box-expand]").length, p: pos(bx.querySelector("[data-testid=box-expand]"), bx.querySelector("[data-testid=box-editor]")) }));
    return { mainN: document.querySelectorAll("[data-testid=expand]").length, main: main && pos(main, document.querySelector("[data-testid=editor]")), boxes };
  });
  const corner = (p) => p && p.inside && p.right <= 12 && p.top <= 12 && p.txt === "⤢";
  ok(ic.mainN === 1 && corner(ic.main), "ana not yazma alanının sağ üstünde küçük ⤢ simgesi", ic.main);
  ok(ic.boxes.length === 3 && ic.boxes.every((b) => b.n === 1 && corner(b.p)), "her içerik kutusunun yazma alanında kendi ⤢ simgesi (3/3)", ic.boxes.map((b) => b.p.right + "/" + b.p.top));
  ok(mobile ? ic.main.w >= 36 : ic.main.w <= 40, mobile ? "mobilde simge parmakla basılabilir boyutta (≥ 36 px)" : "simge küçük ve göze batmıyor (≤ 40 px)", ic.main.w);
  await shot(page, `${tag}-41-buyutme-simgeleri`);

  sec("R5-1) Ana not: geniş pencere, metin eksiksiz aktarılıyor, biçimlendirme, kapatınca geri yansıyor");
  const raw1 = await raw();
  const mainBefore = await html("[data-testid=editor]");
  await tap("[data-testid=expand]");
  ok(await page.locator("[data-testid=expand-dialog]").isVisible(), "simgeye basınca geniş yazma penceresi açıldı");
  const g = await geoX();
  if (mobile) ok(g.l >= 0 && g.r <= g.vw && g.t >= 0 && g.b <= g.vh && g.w >= g.vw - 24 && g.edH >= g.vh * 0.6 && g.page <= 0, "mobil: pencere ekrana sığıyor (taşma yok), yazma alanı ekranın büyük kısmında", g);
  else ok(g.area >= 0.35 && g.area <= 0.65 && Math.abs(g.cx - g.vw / 2) <= 4 && Math.abs(g.cy - g.vh / 2) <= 4, "masaüstü: pencere ekranın ortasında, yaklaşık yarısını kaplıyor", { alan: g.area, w: g.w, h: g.h });
  ok(g.closeR <= 24 && g.closeT <= 24, "kapatma simgesi (✕) pencerenin sağ üstünde", { sag: g.closeR, ust: g.closeT });
  ok((await html(xe)) === mainBefore, "mevcut metin pencereye EKSİKSİZ aktarıldı (biçimiyle)");
  ok((await page.locator("[data-testid=expand-dialog] [data-cmd=bold]").count()) === 1 && (await page.locator("[data-testid=expand-dialog] [data-cmd=insertUnorderedList]").count()) === 1, "pencerede biçimlendirme araçları (K · İ · Liste · 1. Liste) var");
  const LONG = " Geniş alanda yazılan uzun paragraf: belirtiler mevsim geçişlerinde artar ve dinlenmeyle azalır.";
  await typeX(LONG);
  await page.keyboard.press("Enter");
  await page.keyboard.type("İkinci satır ");
  await page.locator("[data-testid=expand-dialog] [data-cmd=bold]")[mobile ? "tap" : "click"]();
  await page.keyboard.type("KALINSOZ");
  await page.locator("[data-testid=expand-dialog] [data-cmd=bold]")[mobile ? "tap" : "click"]();
  await page.keyboard.type(" son.");
  const xh = await html(xe);
  ok(/<b>KALINSOZ<\/b>/.test(xh) && xh.includes("İkinci satır"), "geniş alanda yazma + kalın biçim çalışıyor", xh.slice(-90));
  ok(/Kaydedilmemiş/.test(await page.locator("[data-testid=save-status]").innerText()), "üstte 'Kaydedilmemiş' göstergesi güncel");
  ok((await raw()) === raw1, "pencerede yazmak kendiliğinden KAYDETMEDİ (genel Kaydet/Vazgeç korunuyor)");
  await shot(page, `${tag}-42-buyutulmus-not`);
  await tap("[data-testid=expand-close]");
  const mainAfter = await html("[data-testid=editor]");
  ok(!(await page.locator("[data-testid=expand-dialog]").count()) && mainAfter === xh, "✕ → pencere kapandı; metin (biçimiyle) ana not alanına EKSİKSİZ yansıdı");
  ok(mainAfter.includes(LONG.trim()) && (await page.locator("[data-testid=save-status]").innerText()).includes("Kaydedilmemiş"), "kapatma metin kaybı yaratmadı; değişiklik Kaydet'i bekliyor");

  sec("R5-1) İçerik kutuları: her pencere yalnız kendi kutusuna yazar (karışma yok)");
  const bh0 = [await boxEd(0).evaluate((e) => e.innerHTML), await boxEd(1).evaluate((e) => e.innerHTML), await boxEd(2).evaluate((e) => e.innerHTML)];
  await page.locator(".cbox.editing").nth(1).locator("[data-testid=box-expand]")[mobile ? "tap" : "click"]();
  const tgt = await page.locator("[data-testid=expand-dialog]").getAttribute("data-target");
  ok((await html(xe)) === bh0[1] && /Uygulama Önerilerim/.test(await page.locator("[data-testid=expand-dialog] h2").innerText()), "2. kutunun penceresi: yalnız o kutunun metni ve adı", tgt);
  ok(!(await html(xe)).includes("KALINSOZ"), "kutu penceresine ana notun metni karışmadı");
  await typeX(" KUTU-2-EK geniş alandan.");
  await shot(page, `${tag}-43-buyutulmus-kutu`);
  await tap("[data-testid=expand-close]");
  await page.locator(".cbox.editing").nth(0).locator("[data-testid=box-expand]")[mobile ? "tap" : "click"]();
  ok((await html(xe)) === bh0[0], "1. kutunun penceresi: yalnız 1. kutunun metni");
  await typeX(" KUTU-1-EK.");
  await page.keyboard.press("Escape");
  ok(!(await page.locator("[data-testid=expand-dialog]").count()), "Esc tuşu da pencereyi kapatıyor");
  const bh1 = [await boxEd(0).evaluate((e) => e.innerHTML), await boxEd(1).evaluate((e) => e.innerHTML), await boxEd(2).evaluate((e) => e.innerHTML)];
  const mainNow = await html("[data-testid=editor]");
  ok(bh1[0].includes("KUTU-1-EK") && !bh1[0].includes("KUTU-2-EK") && bh1[1].includes("KUTU-2-EK") && !bh1[1].includes("KUTU-1-EK") && bh1[2] === bh0[2], "her kutuya yalnız kendi penceresinde yazılan metin yansıdı; 3. kutu değişmedi", bh1.map((x) => x.slice(-30)));
  ok(!mainNow.includes("KUTU-") && mainNow === mainAfter, "ana not metni kutu metinleriyle karışmadı");
  await tap("[data-testid=save]");
  const s5 = await mizac();
  ok(htmlText(s5[0].html) === htmlText(mainAfter) && s5[0].html.includes("<b>KALINSOZ</b>"), "Kaydet → ana not metni (biçimiyle) kalıcı");
  ok(s5[0].boxes[0].html.includes("KUTU-1-EK") && !s5[0].boxes[0].html.includes("KUTU-2") && s5[0].boxes[1].html.includes("KUTU-2-EK") && !s5[0].boxes[1].html.includes("KUTU-1") && !s5[0].boxes[2].html.includes("KUTU-") && !s5[0].html.includes("KUTU-"), "Kaydet → her kutunun metni kendi kaydında (karışma yok)");
  ok(!s5[1].html.includes("KALINSOZ") && !s5[2].html.includes("KALINSOZ") && !s5[1].html.includes("KUTU-"), "diğer notlara hiçbir metin karışmadı");

  sec("R5-1) Metin kaybı: Vazgeç / Kaydetmeden Çık / pencere açıkken kaydetme");
  const raw6 = await raw();
  await inNote(0, "[data-testid=note-edit]");
  await tap("[data-testid=expand]");
  await typeX(" IPTAL-METNI");
  await tap("[data-testid=expand-close]");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");
  ok((await raw()) === raw6 && !(await page.locator("[data-testid=note]").nth(0).innerText()).includes("IPTAL-METNI"), "pencerede yazıp Kaydetmeden Çık → kayıtlı veri değişmedi");
  await inNote(0, "[data-testid=note-edit]");
  await tap("[data-testid=expand]");
  await typeX(" ACIKKEN-KAYIT");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => !document.querySelector("[data-testid=expand-dialog]"));
  ok((await mizac())[0].html.includes("ACIKKEN-KAYIT") && !(await page.locator("[data-testid=expand-dialog]").count()), "pencere açıkken Ctrl+S → metin kaydedildi, pencere kapandı (kayıp yok)");
  await inNote(0, "[data-testid=note-edit]");
  await tap("[data-testid=expand]");
  await typeX(" DEVAM-METNI");
  await tap("[data-testid=expand-close]");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-continue]");
  ok((await html("[data-testid=editor]")).includes("DEVAM-METNI"), "Vazgeç → Düzenlemeye Devam Et: pencerede yazılan metin duruyor");
  await tap("[data-testid=discard]");
  await tap("[data-testid=leave-drop]");

  sec("R5-1) Yeni eklenen içerik kutusunda da büyütme; boş başlıkta ilk not");
  await inNote(0, "[data-testid=note-edit]");
  await tap("[data-testid=box-add]");
  const nb = page.locator(".cbox.editing").last();
  await nb.locator("[data-testid=box-title-input]").fill("Yeni Kutu");
  ok((await nb.locator("[data-testid=box-expand]").count()) === 1, "sonradan eklenen kutuda da ⤢ simgesi var");
  await nb.locator("[data-testid=box-expand]")[mobile ? "tap" : "click"]();
  ok((await html(xe)) === "" && /Yeni Kutu/.test(await page.locator("[data-testid=expand-dialog] h2").innerText()), "boş yeni kutunun penceresi boş açılıyor");
  await typeX("Yeni kutunun geniş alandan metni.");
  await tap("[data-testid=expand-close]");
  ok((await nb.locator("[data-testid=box-editor]").innerText()).includes("Yeni kutunun geniş alandan metni."), "metin yeni kutuya yansıdı");
  await nb.locator("[data-testid=box-delete]")[mobile ? "tap" : "click"]();
  ok((await page.locator(".cbox.editing").count()) === 3, "kaydedilmemiş yeni kutu da doğrudan silindi");
  await tap("[data-testid=discard]");
  if (await page.locator("[data-testid=leave-drop]").count()) await tap("[data-testid=leave-drop]");
  await pickHeading("Belirtiler / Sebepler");
  const empty = await page.$$eval("[data-testid=group-child]", (els) => els.find((e) => /Henüz not yok/.test(e.innerText))?.getAttribute("data-title"));
  await tap(`[data-testid=group-child][data-title="${empty}"]`);
  const ne = await page.evaluate(() => ({ empty: !!document.querySelector("[data-testid=note-empty]"), btn: document.querySelector("[data-testid=note-empty] button")?.textContent.trim() }));
  ok(ne.empty && /İlk notu yaz/.test(ne.btn ?? ""), `boş başlık (${empty}): ilk not oluşturma yolu açık`, ne);
  await tap("[data-testid=note-empty] button");
  ok((await page.locator("[data-testid=editor]").isVisible()) && (await page.locator("[data-testid=expand]").count()) === 1 && !(await page.locator("[data-testid=new-note]").count()), "ilk not alanı açıldı; ⤢ simgesi var, Yeni Not yok");
  await tap("[data-testid=expand]");
  await typeX("İlk not geniş pencereden yazıldı.");
  await tap("[data-testid=expand-close]");
  await tap("[data-testid=save]");
  const st9 = await store(page);
  const hid9 = st9.nodes.find((n) => n.rootId === "t-akciger" && n.title === empty && !n.deletedAt)?.id;
  const nts9 = (st9.notes[hid9] ?? []).filter((n) => !n.deletedAt);
  ok(nts9.length === 1 && nts9[0].html.includes("İlk not geniş pencereden yazıldı.") && nts9[0].createdAt, "boş başlıkta ilk not (geniş pencereden) kaydedildi", nts9.length);

  sec("R5-3) Görsel + kaynak + bağlantılı kutu: Kaydet ile hepsi kalıcı silinir, diğerleri dokunulmaz");
  await pickHeading("Belirtiler / Sebepler");
  await tap('[data-testid=group-child][data-title="Mizaç Sebepleri"]');
  await inNote(1, "[data-testid=note-edit]");
  await tap("[data-testid=box-add]");
  const kb = page.locator(".cbox.editing").last();
  await kb.locator("[data-testid=box-title-input]").fill("Silinecek Kutu");
  await kb.locator("[data-testid=box-editor]")[mobile ? "tap" : "click"]();
  await page.keyboard.type("SILINECEK-METIN");
  await kb.locator("[data-testid=box-add-image] input").setInputFiles({ name: "silinecek.png", mimeType: "image/png", buffer: IMGS[2] });
  await page.waitForFunction(() => [...document.querySelectorAll(".cbox.editing")].pop()?.querySelectorAll("[data-testid=box-image-item]").length === 1);
  await kb.locator("[data-testid=box-image-caption]").fill("SILINECEK-GORSEL");
  await kb.locator("[data-testid=box-add-source]")[mobile ? "tap" : "click"]();
  await page.fill("[data-testid=source-title]", "SILINECEK-KAYNAK");
  await page.fill("[data-testid=source-link]", "https://ornek.example/silinecek-kaynak");
  await tap("[data-testid=source-submit]");
  await kb.locator("[data-testid=box-add-link]")[mobile ? "tap" : "click"]();
  await page.fill("[data-testid=link-url]", "https://ornek.example/silinecek-baglanti");
  await tap("[data-testid=link-submit]");
  await tap("[data-testid=save]");
  const k0 = await mizac();
  const kbox = k0[1].boxes.find((b) => b.title === "Silinecek Kutu");
  const imgSrc = kbox?.images?.[0]?.src ?? "";
  ok(!!kbox && imgSrc.startsWith("asset:") && kbox.sources.length === 1 && kbox.links.length === 1, "test kutusu metin + görsel + kaynak + bağlantıyla kaydedildi");
  await inNote(1, "[data-testid=note-edit]");
  await page.locator('.cbox.editing[data-title="Silinecek Kutu"] [data-testid=box-delete]')[mobile ? "tap" : "click"]();
  ok(!(await page.locator('.cbox.editing[data-title="Silinecek Kutu"]').count()) && (await mizac())[1].boxes.some((b) => b.id === kbox.id), "ekrandan hemen kalktı; Kaydet'e kadar kayıtlı veri aynen");
  await tap("[data-testid=save]");
  const k1 = await mizac();
  const rawK = await raw();
  ok(!k1[1].boxes.some((b) => b.id === kbox.id) && !rawK.includes(kbox.id), "Kaydet → kutu kalıcı silindi");
  ok(!rawK.includes("SILINECEK-METIN") && !rawK.includes(imgSrc) && !rawK.includes("SILINECEK-GORSEL") && !rawK.includes("SILINECEK-KAYNAK") && !rawK.includes("silinecek-kaynak") && !rawK.includes("silinecek-baglanti"), "kutunun metni, görseli, kaynağı ve bağlantısı depodan tamamen çıktı");
  ok(k1[0].boxes.length === 3 && k1[0].boxes[0].images.length === 1 && JSON.stringify(k1[0].boxes) === JSON.stringify(k0[0].boxes) && k1[2].html === k0[2].html, "diğer notların kutuları/görselleri aynen duruyor");
  await tap("[data-testid=back]");
  await tap("[data-testid=open-trash]");
  const trK = await page.$$eval("[data-testid=restore]", (els) => els.map((e) => e.getAttribute("data-title")));
  ok(!trK.some((t) => /Silinecek Kutu/.test(t)), "Silinenler'de yok");
  await tap("[data-testid=back]");

  sec("R5) Ana not silme davranışı değişmedi (hâlâ Silinenler'e gider)");
  await tap('[data-testid=lib-item][data-title="Akciğer"]');
  await pickHeading("Belirtiler / Sebepler");
  await tap('[data-testid=group-child][data-title="Mizaç Sebepleri"]');
  await inNote(2, "[data-testid=note-delete]");
  ok(/Silinenler'den geri alınabilir/.test(await page.locator("[data-testid=note-delete-confirm]").innerText()), "not silme hâlâ onay ister ve Silinenler'e gider");
  await tap("[data-testid=close-panel], [data-act=close-panel]");
  await tap("[data-testid=discard]");
  if (await page.locator("[data-testid=leave-drop]").count()) await tap("[data-testid=leave-drop]");

  if (mobile) {
    sec("R5) Mobil: düzenleme ekranında simgeler taşmıyor / çakışmıyor");
    await inNote(0, "[data-testid=note-edit]");
    const mo = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".expbtn, .cbox-h button, .cbox-title-in, [data-testid=topbar] button")].map((e) => e.getBoundingClientRect()).filter((r) => r.width);
      const btn = [...document.querySelectorAll(".expbtn")].map((e) => e.getBoundingClientRect());
      const txt = document.querySelector("[data-testid=editor]");
      return { page: document.documentElement.scrollWidth - innerWidth, out: els.filter((r) => r.right > innerWidth + 1 || r.left < -1).length, n: btn.length, pad: parseFloat(getComputedStyle(txt).paddingRight) };
    });
    ok(mo.page <= 0 && mo.out === 0 && mo.n === 4 && mo.pad >= 40, "mobil: 4 simge ekranda, metin simgenin altına girmiyor (sağ boşluk)", mo);
    await shot(page, `${tag}-47-mobil-simgeler`);
    await page.locator(".cbox.editing").nth(0).locator("[data-testid=box-expand]").tap();
    const gm = await geoX();
    ok(gm.page <= 0 && gm.r <= gm.vw && gm.b <= gm.vh && gm.l >= 0 && gm.t >= 0, "mobil kutu penceresi ekrana sığıyor", gm);
    await tap("[data-testid=expand-close]");
    await tap("[data-testid=discard]");
  }
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
}

// ── REVİZYON 6: sol paneldeki ana başlıkların görsel eşitliği ─────────────────────
const TOP_TPL = TPL_DEF.filter((t) => !t.parent);
const DIRECT = ["Doğaltaş & Mineral", "Aromaterapi", "İslami Öneriler"];
const GROUPS = ["Belirtiler / Sebepler", "Uygulamalar / Yöntemler", "Destekleyici / Alternatif Uygulamalar"];
async function rev6(page, tap, pickHeading, mobile, tag) {
  const scope = mobile ? "[data-testid=sheet]" : "[data-testid=side]";
  const openPanel = async () => {
    if (mobile && !(await page.locator("[data-testid=sheet]").count())) await tap("[data-testid=pick]");
  };
  const topRows = () => page.evaluate((sc) => {
    const tree = document.querySelector(`${sc} [data-testid=tree]`);
    const secs = [...tree.querySelectorAll(":scope > p.tsec")];
    const hazir = secs.find((p) => /Hazır/i.test(p.textContent))?.nextElementSibling;
    const own = secs.find((p) => /Kendi/i.test(p.textContent))?.nextElementSibling;
    const rowOf = (li) => {
      const r = li.querySelector(":scope > .trow");
      const t = r.querySelector(".ttl");
      const cs = getComputedStyle(t);
      return { title: r.querySelector("[data-testid=tree-item]").getAttribute("data-title"), icon: r.querySelector(".ti").textContent, top: r.classList.contains("top"), on: r.classList.contains("on"), toggle: !!r.querySelector("[data-testid=tree-toggle]"), kids: !!r.querySelector(".kids"), group: r.querySelector("[data-testid=tree-item]").hasAttribute("data-group"), color: cs.color, weight: cs.fontWeight, size: cs.fontSize, lh: cs.lineHeight, family: cs.fontFamily, iconX: Math.round(r.querySelector(".ti").getBoundingClientRect().left), textX: Math.round(t.getBoundingClientRect().left), h: Math.round(r.getBoundingClientRect().height) };
    };
    return { hazir: [...(hazir?.children ?? [])].map(rowOf), own: [...(own?.children ?? [])].map(rowOf) };
  }, scope);
  const same = (rows, k) => new Set(rows.map((r) => r[k])).size === 1;
  for (const topic of ["Akciğer", "Dalak", "Şiddetli Öksürük"]) {
    sec(`R6) ${topic}: ana başlıklar aynı belirginlikte; işlevsel ayrım korunuyor (${mobile ? "mobil başlık seçici" : "sol panel"})`);
    await page.goto(BASE + "#/kutuphane");
    await page.reload();
    await page.waitForSelector("[data-testid=library]");
    await tap(`[data-testid=lib-item][data-title="${topic}"]`);
    await pickHeading(topic); // kök seçili → hiçbir ana başlık "seçili" görünümde değil
    await openPanel();
    const { hazir, own } = await topRows();
    const tops = [...own, ...hazir];
    const visible = TOP_TPL.filter((t) => hazir.some((r) => r.icon === t.icon));
    ok(hazir.length >= 6 && JSON.stringify(hazir.map((r) => r.icon)) === JSON.stringify(visible.map((t) => t.icon)) && visible.length === hazir.length, "ikonlar ve başlık sırası korunuyor (şablon sırasıyla aynı)", hazir.map((r) => r.title));
    ok(tops.every((r) => r.top && !r.on), "bütün ana başlıklar 'ana başlık' olarak işaretli", tops.length);
    ok(same(tops, "color") && same(tops, "weight") && same(tops, "size") && same(tops, "lh") && same(tops, "family"), "yazı rengi, kalınlığı, boyutu, satır yüksekliği ve yazı tipi HEPSİNDE aynı", { renk: [...new Set(tops.map((r) => r.color))], kalinlik: [...new Set(tops.map((r) => r.weight))], boyut: [...new Set(tops.map((r) => r.size))] });
    ok(Number(tops[0].weight) >= 700 && lum(tops[0].color) < 0.08, "ana başlıklar koyu ve kalın (soluk değil)", { renk: tops[0].color, kalinlik: tops[0].weight });
    ok(same(tops, "iconX") && same(tops, "textX"), "ikonlar ve yazılar aynı hizada (dikey çizgide)", { ikon: [...new Set(tops.map((r) => r.iconX))], yazi: [...new Set(tops.map((r) => r.textX))] });
    const d = hazir.filter((r) => DIRECT.includes(r.title));
    const g = hazir.filter((r) => GROUPS.includes(r.title));
    ok(d.length === 3 && d.every((r) => !r.toggle && !r.kids && !r.group), "Doğaltaş & Mineral · Aromaterapi · İslami Öneriler: ok simgesi YOK, alt başlık sayacı YOK, grup değil", d.map((r) => r.title));
    ok(g.length === 3 && g.every((r) => r.toggle && r.kids && r.group), "3 grup başlığında aç/kapa oku ve alt başlık sayacı duruyor", g.map((r) => r.title));
    if (topic === "Akciğer") await shot(page, `${tag}-48-ana-basliklar-esit`);
  }

  sec("R6) Davranış: gruplar açılır/kapanır, üç başlık doğrudan not alanını açar");
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
  await tap('[data-testid=lib-item][data-title="Dalak"]');
  for (const t of GROUPS) {
    await openPanel();
    const tg = page.locator(`${scope} [data-testid=tree-toggle][data-title="${t}"]`);
    const a0 = await tg.getAttribute("aria-expanded");
    await tg[mobile ? "tap" : "click"]();
    const a1 = await page.locator(`${scope} [data-testid=tree-toggle][data-title="${t}"]`).getAttribute("aria-expanded");
    await page.locator(`${scope} [data-testid=tree-toggle][data-title="${t}"]`)[mobile ? "tap" : "click"]();
    const a2 = await page.locator(`${scope} [data-testid=tree-toggle][data-title="${t}"]`).getAttribute("aria-expanded");
    ok(a1 !== a0 && a2 === a0, `${t}: ok ile açılıp kapanıyor`, { once: a0, acik: a1, sonra: a2 });
    if (mobile) await tap("[data-testid=sheet-close], [data-act=sheet-close]");
  }
  for (const t of DIRECT) {
    await pickHeading(t);
    const v = await page.evaluate(() => ({ title: document.querySelector("[data-testid=heading-title]")?.innerText ?? "", gv: !!document.querySelector("[data-testid=group-view]"), note: !!document.querySelector("[data-testid=note-empty], [data-testid=notes], [data-testid=note]") }));
    ok(v.title.includes(t) && !v.gv && v.note, `${t}: dokununca doğrudan not alanı açılıyor (grup listesi değil)`, v);
  }
  await pickHeading(GROUPS[1]);
  ok(await page.locator("[data-testid=group-view]").isVisible(), "grup başlığı seçilince hâlâ alt başlık listesi açılıyor");
  await pickHeading("Aromaterapi");
  if (!mobile) await shot(page, `${tag}-49-dogrudan-not-basligi`);
  else {
    await tap("[data-testid=pick]");
    await shot(page, `${tag}-49-baslik-secici-ana-basliklar`);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(ov <= 0, "mobil başlık seçicide yatay taşma yok", ov);
    await tap("[data-act=sheet-close]");
  }
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
}

// ── REVİZYON 7: mükerrer konu kontrolü ───────────────────────────────────────────
async function rev7(page, tap, pickHeading, mobile, tag) {
  const live = async () => ((await store(page))?.topics ?? []).filter((t) => !t.deletedAt);
  const key = (x) => x.normalize("NFC").trim().toLocaleLowerCase("tr-TR");
  const dlg = "[data-testid=dup-dialog]";
  const openNew = async () => {
    await page.goto(BASE + "#/yeni");
    await page.reload();
    await page.waitForSelector("[data-testid=new-form]");
  };
  const tryCreate = async (name) => {
    await openNew();
    await page.fill("[data-testid=new-title]", name);
    await tap("[data-testid=new-create]");
    await page.waitForTimeout(80);
    return page.locator(dlg).count();
  };
  const leaveUnsaved = async () => {
    if (!(await page.locator("[data-testid=discard]").count())) return;
    await tap("[data-testid=discard]");
    if (await page.locator("[data-testid=leave-drop]").count()) await tap("[data-testid=leave-drop]");
  };
  const renameTopic = async (topic, name) => {
    await page.goto(BASE + "#/kutuphane");
    await page.reload();
    await page.waitForSelector("[data-testid=library]");
    await tap(`[data-testid=lib-item][data-title="${topic}"]`);
    await pickHeading(topic);
    await tap("[data-testid=menu]");
    await tap("[data-testid=mi-rename]");
    await page.fill("[data-testid=rename-input]", name);
    await page.locator("[data-testid=rename-input]").press("Enter");
    await page.waitForTimeout(80);
  };

  sec("R7-0) Hazırlık: örnek veride tek bir 'Migren' konusu var");
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
  const L0 = await live();
  const mig = L0.find((t) => t.title === "Migren");
  ok(!!mig && L0.filter((t) => key(t.title) === "migren").length === 1, "Migren (t-migren) mevcut, tek kayıt", L0.length);

  sec("R7-1/2) Büyük/küçük harf + Türkçe İ + baş/son boşluk → uyarı; Vazgeç hiçbir şey oluşturmaz");
  for (const v of ["Migren", "migren", "MİGREN", "MiGrEn", "   Migren   ", "  mİgReN "]) {
    const n = await tryCreate(v);
    const info = await page.evaluate(() => ({ h: document.querySelector("[data-testid=dup-dialog] h2")?.innerText, p: document.querySelector("[data-testid=dup-text]")?.innerText ?? "", b: [...document.querySelectorAll("[data-testid=dup-dialog] .dactions button")].map((x) => x.textContent.trim()) }));
    ok(n === 1 && info.h === "Bu isimde bir konu zaten mevcut." && info.p.includes("Araştırma kütüphanenizde “Migren” isimli bir konu bulunuyor.") && info.p.includes("Mevcut konuyu açmak mı, yoksa aynı isimle yeni bir konu oluşturmak mı istiyorsunuz?") && JSON.stringify(info.b) === JSON.stringify(["Mevcut Konuyu Aç", "Yine de Oluştur", "Vazgeç"]), `“${v}” → uyarı + 3 seçenek`, info.b);
    if (v === "MİGREN") await shot(page, `${tag}-50-mukerrer-konu-uyarisi`);
    await tap("[data-testid=dup-cancel]");
    const after = await page.evaluate(() => ({ dlg: !!document.querySelector("[data-testid=dup-dialog]"), val: document.querySelector("[data-testid=new-title]")?.value, view: document.querySelector(".sifa-f3")?.dataset.view }));
    ok(!after.dlg && after.view === "new" && after.val === v && (await live()).length === L0.length, `Vazgeç → uyarı kapandı, yazılan ad aynen duruyor, yeni konu yok`, after.val);
  }
  await tryCreate("migren");
  await page.keyboard.press("Escape");
  ok(!(await page.locator(dlg).count()) && (await live()).length === L0.length, "Esc = Vazgeç");

  sec("R7-4) Türkçe harfleri farklı adlar EŞLEŞMEZ (ı≠i, ş≠s, ö≠o, ü≠u, ç≠c, ğ≠g)");
  ok(key("MIGREN") !== key("Migren") && key("MİGREN") === key("Migren"), "kural: I→ı, İ→i (Türkçe)");
  for (const v of ["MIGREN", "Akciger", "Siddetli Oksuruk", "Migrén", "Migren Atağı"]) {
    const n = await tryCreate(v);
    const tv = await page.evaluate(() => document.querySelector(".sifa-f3")?.dataset.view);
    ok(n === 0 && tv === "topic", `“${v}” → uyarı YOK (farklı ad), konu açıldı`);
    await leaveUnsaved();
  }
  ok((await live()).length === L0.length, "denemeler kaydedilmedi; konu sayısı aynı");
  for (const v of ["AKCİĞER", "akciğer", " şİDDETLİ ÖKSÜRÜK "]) {
    const n = await tryCreate(v);
    const t = await page.locator("[data-testid=dup-text]").innerText().catch(() => "");
    ok(n === 1 && (v.includes("KS") || v.includes("ks") ? t.includes("“Şiddetli Öksürük”") : t.includes("“Akciğer”")), `“${v.trim()}” → Türkçe büyük/küçük harfle eşleşti, mevcut ad gösterildi`, t.slice(0, 60));
    await tap("[data-testid=dup-cancel]");
  }

  sec("R7-2) Mevcut Konuyu Aç");
  await tryCreate("MİGREN");
  await tap("[data-testid=dup-open]");
  await page.waitForSelector("[data-testid=heading-title]");
  const ro = await protoHash(page);
  ok(ro.includes(mig.id) && !(await page.locator(dlg).count()) && (await live()).length === L0.length, "mevcut 'Migren' açıldı; yeni konu oluşmadı", ro);

  sec("R7-2) Yine de Oluştur → bağımsız yeni kayıt (ad değiştirilmeden)");
  await tryCreate("  MİGREN ");
  await tap("[data-testid=dup-create]");
  await page.waitForSelector("[data-testid=heading-title]");
  ok(/MİGREN/.test(await crumbs(page)) && !/Migren/.test(await crumbs(page)), "yeni konu açıldı, ad kullanıcının yazdığı gibi: 'MİGREN'", await crumbs(page));
  await tap("[data-testid=save]");
  const L1 = await live();
  const twins = L1.filter((t) => key(t.title) === "migren");
  const old = L1.find((t) => t.id === mig.id);
  ok(L1.length === L0.length + 1 && twins.length === 2 && twins[0].id !== twins[1].id && twins.some((t) => t.title === "MİGREN"), "Kaydet → iki ayrı Migren kaydı (farklı kimlik)", twins.map((t) => t.title));
  ok(JSON.stringify(old) === JSON.stringify(mig), "eski 'Migren' kaydı hiç değişmedi (birleştirilmedi/silinmedi)");

  sec("R7-2) Aynı adlı birden fazla konu: hangisinin açılacağı seçilebiliyor");
  await tryCreate("migren");
  const t2 = await page.locator("[data-testid=dup-text]").innerText();
  ok(/2 konu bulunuyor/.test(t2), "uyarı 2 konu olduğunu söylüyor", t2.slice(0, 70));
  await tap("[data-testid=dup-open]");
  const items = await page.$$eval("[data-testid=dup-item]", (els) => els.map((e) => ({ t: e.getAttribute("data-title"), d: e.innerText })));
  ok(items.length === 2 && items.map((x) => x.t).sort().join("|") === ["MİGREN", "Migren"].sort().join("|") && items.every((x) => /Oluşturuldu/.test(x.d) && /not/.test(x.d)), "seçim listesi: iki konu, oluşturulma tarihi ve not sayısıyla", items.map((x) => x.t));
  await shot(page, `${tag}-51-hangi-konu-secimi`);
  await tap("[data-testid=dup-back]");
  ok((await page.locator("[data-testid=dup-dialog] .dactions button").count()) === 3, "← Geri → üç seçenek yeniden");
  await tap("[data-testid=dup-open]");
  const newer = twins.find((t) => t.title === "MİGREN");
  await tap(`[data-testid=dup-item][data-title="MİGREN"]`);
  await page.waitForSelector("[data-testid=heading-title]");
  ok((await protoHash(page)).includes(newer.id), "seçilen (ikinci) konu açıldı");
  ok((await live()).length === L1.length, "hiçbir kayıt eklenmedi/silinmedi");

  sec("R7-3) Konu adı değiştirme: kendisiyle karşılaştırılmaz; başka konuyla çakışınca uyarı");
  await renameTopic("Dalak", "  DALAK ");
  ok(!(await page.locator(dlg).count()) && /DALAK/.test(await page.locator("[data-testid=heading-title]").innerText()), "kendi adının büyük/küçük hâli → uyarı YOK", await page.locator("[data-testid=heading-title]").innerText());
  await leaveUnsaved();
  await renameTopic("Dalak", "Dalak");
  ok(!(await page.locator(dlg).count()), "adı aynen bırakmak → uyarı YOK");
  await leaveUnsaved();
  const raw0 = await rawStore(page);
  await renameTopic("Dalak", "akciğer");
  const rinfo = await page.evaluate(() => ({ m: document.querySelector("[data-testid=dup-dialog]")?.getAttribute("data-mode"), p: document.querySelector("[data-testid=dup-text]")?.innerText ?? "", b: [...document.querySelectorAll("[data-testid=dup-dialog] .dactions button")].map((x) => x.textContent.trim()) }));
  ok(rinfo.m === "rename" && rinfo.p.includes("“Akciğer” isimli bir konu bulunuyor") && JSON.stringify(rinfo.b) === JSON.stringify(["Mevcut Konuyu Aç", "Yine de Bu Adı Ver", "Vazgeç"]), "Dalak → 'akciğer': uyarı (ad değiştirme metniyle)", rinfo.b);
  await shot(page, `${tag}-52-ad-degistirme-uyarisi`);
  await tap("[data-testid=dup-cancel]");
  ok((await page.locator("[data-testid=rename-input]").inputValue()) === "akciğer" && (await rawStore(page)) === raw0, "Vazgeç → ad alanı açık, yazılan ad duruyor; hiçbir şey değişmedi");
  await page.locator("[data-testid=rename-input]").press("Enter");
  await tap("[data-testid=dup-create]");
  ok(/akciğer/.test(await page.locator("[data-testid=heading-title]").innerText()) && !(await page.locator(dlg).count()), "Yine de Bu Adı Ver → konu adı 'akciğer' oldu (taslakta)");
  await leaveUnsaved();
  ok((await rawStore(page)) === raw0, "Kaydetmeden Çık → Dalak adı değişmedi");
  await renameTopic("Dalak", "AKCİĞER");
  await tap("[data-testid=dup-open]");
  await page.waitForSelector("[data-testid=heading-title]");
  ok((await protoHash(page)).includes("t-akciger") && (await live()).find((t) => t.id === "t-dalak")?.title === "Dalak", "Mevcut Konuyu Aç → Akciğer açıldı; Dalak'ın adı değişmedi");
  await leaveUnsaved();
  await renameTopic("Dalak", "Migren");
  ok(/2 konu bulunuyor/.test(await page.locator("[data-testid=dup-text]").innerText()), "iki Migren varken ad değiştirme uyarısı da 2 konuyu gösteriyor");
  await tap("[data-testid=dup-open]");
  ok((await page.locator("[data-testid=dup-item]").count()) === 2, "ad değiştirmede de hangi konunun açılacağı seçilebiliyor");
  await page.keyboard.press("Escape");
  await leaveUnsaved();
  await renameTopic("MİGREN", "Migren Atağı");
  ok(!(await page.locator(dlg).count()) && /Migren Atağı/.test(await page.locator("[data-testid=heading-title]").innerText()), "benzersiz yeni ad → uyarısız değişti");
  await leaveUnsaved();

  if (mobile) {
    sec("R7) Mobil: uyarı ve seçim penceresi ekrana sığıyor");
    await tryCreate("migren");
    const g1 = await page.evaluate(() => { const r = document.querySelector("[data-testid=dup-dialog]").getBoundingClientRect(); const bs = [...document.querySelectorAll("[data-testid=dup-dialog] button")].map((b) => b.getBoundingClientRect()); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight, out: bs.filter((x) => x.right > innerWidth || x.left < 0 || x.height < 44).length, page: document.documentElement.scrollWidth - innerWidth }; });
    ok(g1.l >= 0 && g1.r <= g1.vw && g1.t >= 0 && g1.b <= g1.vh && g1.out === 0 && g1.page <= 0, "uyarı ekrana sığıyor; düğmeler ≥ 44 px, taşma yok", g1);
    await tap("[data-testid=dup-open]");
    const g2 = await page.evaluate(() => { const r = document.querySelector("[data-testid=dup-dialog]").getBoundingClientRect(); return { r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
    ok(g2.r <= g2.vw && g2.b <= g2.vh, "seçim listesi ekrana sığıyor", g2);
    await tap("[data-testid=dup-back]");
    await tap("[data-testid=dup-cancel]");
  }
  const LF = await live();
  ok(LF.length === L1.length && LF.filter((t) => key(t.title) === "migren").length === 2, "sonuç: çift kayıtlar korunuyor, hiçbir konu silinmedi/birleştirilmedi", LF.map((t) => t.title));
  await page.goto(BASE + "#/kutuphane");
  await page.reload();
  await page.waitForSelector("[data-testid=library]");
}

const TEN = await mkTenant("F2KABUL");
const USERS = { false: await mkUser(TEN, "F2D"), true: await mkUser(TEN, "F2M") };
const server = await startServer(PORT, USERS.false, path.join(SHOTS, "next-dev.log"));
const SEED_PNG = await sharp({ create: { width: 640, height: 420, channels: 3, background: { r: 15, g: 118, b: 110 } } }).png().toBuffer();
const browser = await chromium.launch();
const summary = {};
try {
  for (const mobile of [false, true]) {
    const tag = mobile ? "mobil" : "masaustu";
    console.log(`\n══ ${mobile ? "MOBİL (Android WebView profili 390×844)" : "MASAÜSTÜ (1440×900)"} ══`);
    CUR = USERS[mobile];
    await seedUser(ORIGIN, CUR, SEED_PNG);
    const c = await ctx(browser, mobile);
    const page = await c.newPage();
    const tap = act(page, mobile);
    const pickHeading = async (title) => {
      if (mobile) {
        await tap("[data-testid=pick]");
        await tap(`[data-testid=sheet] [data-testid=tree-item][data-title="${title}"]`);
      } else await tap(`[data-testid=tree] [data-testid=tree-item][data-title="${title}"]`);
    };
    const editAndFocus = async () => {
      await tap("[data-testid=edit]");
      if (mobile) await tap("[data-testid=editor]");
      else await focusedEditor(page);
    };
    await page.goto(BASE);
    await page.waitForSelector("[data-testid=card-kutuphane]");

    sec("1) Ana sayfa — yalnız iki büyük modül kartı");
    const home = await page.evaluate(() => ({
      cards: [...document.querySelectorAll(".hcard")].map((e) => e.querySelector(".hcard-title")?.textContent),
      inputs: document.querySelectorAll(".sifa-f3 input").length,
      list: document.querySelectorAll("[data-testid=lib-item]").length,
      h: Math.round(document.querySelector(".hcard").getBoundingClientRect().height),
      w: Math.round(document.querySelector(".hcard").getBoundingClientRect().width),
      gutter: Math.round(document.querySelector(".home-cards").getBoundingClientRect().left - document.querySelector(".sifa-f3").getBoundingClientRect().left),
    }));
    ok(JSON.stringify(home.cards) === JSON.stringify(["Araştırma Kütüphanem", "Yeni Kayıt"]), "ana sayfada yalnız iki kart: Araştırma Kütüphanem · Yeni Kayıt", home.cards);
    ok(home.inputs === 0 && home.list === 0, "ana sayfada konu listesi / arama / filtre / düzenleme alanı YOK", { inputs: home.inputs, list: home.list });
    ok(home.h >= 160 && (mobile || home.w >= 600) && home.gutter <= 26, "kartlar geniş ve belirgin; kenar boşluğu dar", { h: home.h, w: home.w, gutter: home.gutter });
    await shot(page, `${tag}-01-ana-sayfa`);

    sec("A) Kütüphane → Akciğer → Bronşit → Düzenle → yaz → Kaydet");
    let k = counter(page, mobile);
    await k.hit("[data-testid=card-kutuphane]");
    await page.waitForSelector("[data-testid=library]");
    await shot(page, `${tag}-02-arastirma-kutuphanem`);
    await k.hit('[data-testid=lib-item][data-title="Akciğer"]');
    const readMode = await page.evaluate(() => ({ editor: !!document.querySelector("[data-testid=editor]"), bar: !!document.querySelector("[data-testid=save]"), edit: !!document.querySelector("[data-testid=edit]") }));
    ok(!readMode.editor && !readMode.bar && readMode.edit, "kayıtlı konu OKUMA modunda açıldı: yazma alanı kilitli, Kaydet/Vazgeç yok, 'Düzenle / Güncelle' belirgin", readMode);
    if (mobile) {
      await k.hit("[data-testid=pick]");
      await k.hit('[data-testid=sheet] [data-testid=tree-item][data-title="Bronşit"]');
    } else await k.hit('[data-testid=tree] [data-testid=tree-item][data-title="Bronşit"]');
    await shot(page, `${tag}-03-okuma-modu`);
    await k.hit("[data-testid=edit]");
    if (mobile) await k.hit("[data-testid=editor]");
    const fA = mobile || (await focusedEditor(page));
    await page.keyboard.type(" Akut dönemde buhar soluması rahatlatır.");
    const top = await page.evaluate(() => {
      const s = document.querySelector("[data-testid=topbar] [data-testid=save]");
      const d = document.querySelector("[data-testid=topbar] [data-testid=discard]");
      const r = s?.getBoundingClientRect();
      return { save: !!s, discard: !!d, y: Math.round(r?.top ?? 999), rightHalf: (r?.left ?? 0) > window.innerWidth / 2, oldBar: !!document.querySelector(".savebar"), pill: document.querySelector("[data-testid=save-status]")?.textContent ?? "" };
    });
    ok(fA, "Düzenle'ye basınca not alanı yazmaya hazır");
    ok(top.save && top.discard && !top.oldBar && top.y < 110 && top.rightHalf, "Kaydet + Vazgeç ÜST SAĞDA; alt sabit çubuk YOK", top);
    ok(/Kaydedilmemiş/.test(top.pill), "üstte küçük 'Kaydedilmemiş' göstergesi", top.pill);
    await shot(page, `${tag}-04-duzenleme-modu`);
    await k.hit("[data-testid=save]");
    const stA = await store(page);
    const afterSave = await page.evaluate(() => ({ editor: !!document.querySelector("[data-testid=editor]"), bar: !!document.querySelector("[data-testid=save]") }));
    ok(N0(stA, "n-bronsit")?.html.includes("buhar soluması") && /Kaydedildi/.test(await toastText(page)), "TEK Kaydet → kalıcı, 'Kaydedildi'");
    ok(!afterSave.editor && !afterSave.bar, "Kaydet sonrası okuma moduna döndü", afterSave);
    summary[`A-${tag}`] = k.s.clicks;
    console.log(`  · A: ${k.s.clicks} tıklama/dokunma`);

    sec("Kaydet / Vazgeç / çıkış davranışı");
    await editAndFocus();
    await page.keyboard.type(" GEÇİCİ-1");
    await tap("[data-testid=discard]");
    const dlg = await page.locator("[data-testid=leave-dialog]").isVisible();
    const btns = await page.$$eval("[data-testid=leave-dialog] .dactions button", (els) => els.map((e) => e.textContent.trim()));
    ok(dlg && JSON.stringify(btns) === JSON.stringify(["💾 Kaydet ve Çık", "Kaydetmeden Çık", "Düzenlemeye Devam Et"]), "Vazgeç (değişiklik varken) → 3 seçenek", btns);
    await shot(page, `${tag}-05-vazgec-uc-secenek`);
    await tap("[data-testid=leave-continue]");
    const cont = await page.evaluate(() => ({ editor: document.querySelector("[data-testid=editor]")?.innerText ?? "", st: document.querySelector("[data-testid=save-status]")?.textContent }));
    ok(cont.editor.includes("GEÇİCİ-1") && /Kaydedilmemiş/.test(cont.st), "Düzenlemeye Devam Et → aynı ekranda, yazılanlar duruyor", cont.st);
    await tap("[data-testid=discard]");
    await tap("[data-testid=leave-drop]");
    const drop = await store(page);
    const dropView = await page.evaluate(() => ({ editor: !!document.querySelector("[data-testid=editor]"), view: document.querySelector(".note.cur [data-testid=note-view]")?.innerText ?? "" }));
    const tDrop = await toastText(page);
    ok(!htmlOf(drop, "n-bronsit").includes("GEÇİCİ-1") && htmlOf(drop, "n-bronsit").includes("buhar soluması"), "Kaydetmeden Çık → yalnız kaydedilmemiş kısım bırakıldı; önce kaydedilen korundu");
    ok(!dropView.editor && !dropView.view.includes("GEÇİCİ-1") && !/Kaydedildi/.test(tDrop), "Kaydetmeden Çık sonrası okuma modu; 'Kaydedildi' denmedi", tDrop);
    await tap("[data-testid=edit]");
    await tap("[data-testid=discard]");
    ok(!(await page.locator("[data-testid=leave-dialog]").count()) && !(await page.locator("[data-testid=editor]").count()), "değişiklik yokken Vazgeç → soru sormadan okuma moduna döner");
    await editAndFocus();
    await page.keyboard.type(" KALICI-2");
    await tap("[data-testid=back]");
    ok(await page.locator("[data-testid=leave-dialog]").isVisible(), "değişiklikle ← Kütüphanem → 3 seçenek");
    await tap("[data-testid=leave-save]");
    await page.waitForSelector("[data-testid=library]");
    ok(htmlOf(await store(page), "n-bronsit").includes("KALICI-2"), "Kaydet ve Çık → önce kaydetti, sonra kütüphaneye çıktı");
    // Tarayıcı geri tuşu
    await tap('[data-testid=lib-item][data-title="Akciğer"]');
    await editAndFocus();
    await page.keyboard.type(" GERI-3");
    await page.goBack();
    await page.waitForSelector("[data-testid=leave-dialog]", { timeout: 4000 }).catch(() => {});
    const backDlg = await page.locator("[data-testid=leave-dialog]").isVisible();
    ok(backDlg && /#\/konu\//.test(page.url()), "tarayıcı GERİ tuşu (değişiklik varken) → 3 seçenek; sayfa yerinde", page.url().split("#")[1]);
    await tap("[data-testid=leave-continue]");
    ok((await page.locator("[data-testid=editor]").innerText()).includes("GERI-3"), "geri → Düzenlemeye Devam Et: yazılanlar duruyor");
    await page.goBack();
    await page.waitForSelector("[data-testid=leave-dialog]");
    await tap("[data-testid=leave-drop]");
    await page.waitForSelector("[data-testid=library]");
    ok(!htmlOf(await store(page), "n-bronsit").includes("GERI-3"), "geri → Kaydetmeden Çık: kütüphaneye döndü, değişiklik bırakıldı");
    // Sekme kapatma / yenileme: tarayıcının kendi uyarısı
    await tap('[data-testid=lib-item][data-title="Akciğer"]');
    await editAndFocus();
    await page.keyboard.type(" KAPAT-4");
    let bu = null;
    page.once("dialog", async (d) => {
      bu = d.type();
      await d.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await new Promise((r) => setTimeout(r, 800));
    ok(bu === "beforeunload" && !page.isClosed(), "sekme kapatma/yenileme (değişiklik varken) → tarayıcı uyarısı; 'Kal' denince sayfa açık", bu);
    ok((await page.locator("[data-testid=editor]").innerText()).includes("KAPAT-4"), "uyarıdan sonra yazılanlar duruyor");
    await tap("[data-testid=discard]");
    await tap("[data-testid=leave-drop]");
    // Kayıt hatası benzetimi: başarısız kayıt sonrası "kaydedildi" denmez
    const p2 = await c.newPage();
    // Üründe prototip paneli yok: kayıt isteği sunucu hatasıyla kesilir (veri DB'ye ulaşmaz).
    await p2.route("**/api/sifa-rehberi-v2/workspace", (r) =>
      r.request().method() === "POST" ? r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Bağlantı hatası (benzetim)" }) }) : r.continue(),
    );
    await p2.goto(BASE + "#/kutuphane");
    await p2.waitForSelector("[data-testid=library]");
    const tap2 = act(p2, mobile);
    await tap2('[data-testid=lib-item][data-title="Akciğer"]');
    await tap2("[data-testid=edit]");
    if (mobile) await tap2("[data-testid=editor]");
    else await focusedEditor(p2);
    await p2.keyboard.type(" HATA-5");
    await tap2("[data-testid=save]");
    const errState = await p2.evaluate(() => ({ toast: document.querySelector("[data-testid=toast]")?.textContent ?? "", st: document.querySelector("[data-testid=save-status]")?.textContent ?? "", editor: !!document.querySelector("[data-testid=editor]") }));
    ok(/Kaydedilemedi/.test(errState.toast) && /Kaydedilmemiş/.test(errState.st) && errState.editor, "kayıt başarısız → açık hata, düzenleme ekranında kalındı, 'kaydedildi' DENMEDİ", errState.toast);
    await shot(p2, `${tag}-06-kayit-hatasi`);
    await tap2("[data-testid=back]");
    await tap2("[data-testid=leave-save]");
    const errLeave = await p2.evaluate(() => ({ lib: !!document.querySelector("[data-testid=library]"), editor: !!document.querySelector("[data-testid=editor]") }));
    ok(!errLeave.lib && errLeave.editor, "kayıt başarısızken 'Kaydet ve Çık' → ÇIKILMADI (veri kaybı yok)", errLeave);
    ok(!htmlOf(await store(p2), "n-bronsit").includes("HATA-5"), "başarısız kayıt depoya yazmadı");
    await tap2("[data-testid=discard]");
    await tap2("[data-testid=leave-drop]");
    await p2.close();

    sec("Görseller kutusu");
    await pickHeading("Bronşit");
    const roImg = await page.evaluate(() => ({ items: document.querySelectorAll(".note.cur [data-testid=image-item]").length, add: !!document.querySelector(".note.cur [data-testid=add-image]"), cap: document.querySelectorAll(".note.cur [data-testid=image-caption]").length }));
    ok(roImg.items === 1 && !roImg.add && roImg.cap === 0, "okuma modunda Görseller kutusu görüntülenir; ekle/kaldır yok", roImg);
    await tap("[data-testid=edit]");
    await page.locator(".note.cur [data-testid=add-image] input").setInputFiles({ name: "bronş-kesit.png", mimeType: "image/png", buffer: pngBuf });
    await page.waitForFunction(() => document.querySelectorAll(".note.cur [data-testid=image-item]").length === 2);
    await page.locator(".note.cur [data-testid=image-caption]").nth(1).fill("Bronş kesiti — yeni açıklama");
    ok(!(await page.locator("[data-testid=editor] img").count()), "görsel NOT alanına değil, ayrı Görseller kutusuna eklendi");
    const imgsSaved = N0(await store(page), "n-bronsit").images.length;
    await page.locator(".note.cur [data-testid=image-remove]").first()[mobile ? "tap" : "click"]();
    ok((await page.locator(".note.cur [data-testid=image-item]").count()) === 1, "görsel kaldırma (Görseller kutusunda)");
    ok(N0(await store(page), "n-bronsit").images.length === imgsSaved, "R2: görsel kaldırma Kaydet'e kadar KALICI DEĞİL (taslak)", imgsSaved);
    await shot(page, `${tag}-07-gorseller-duzenleme`);

    sec("Kaynaklar kutusu");
    await tap(".note.cur [data-testid=add-source]");
    await page.fill("[data-testid=source-title]", "Bitkisel tedavide kanıt düzeyi");
    await page.fill("[data-testid=source-link]", "yanlis bağlantı");
    await tap("[data-testid=source-submit]");
    ok(/DOI 10\.xxxx/.test(await page.locator("[data-testid=source-error]").innerText()), "geçersiz DOI/bağlantı → açık uyarı, eklenmedi");
    await page.fill("[data-testid=source-link]", "https://doi.org/10.5555/kanit.2024.7");
    await tap("[data-testid=source-submit]");
    let srcItems = await page.$$eval(".note.cur [data-testid=source-item]", (els) => els.map((e) => e.innerText));
    ok(srcItems.length === 3 && srcItems.some((t) => t.includes("DOI: 10.5555/kanit.2024.7")), "kaynak + DOI eklendi (doi.org bağlantısı DOI'ye çevrildi)", srcItems.length);
    await page.locator(".note.cur [data-testid=source-edit]").last()[mobile ? "tap" : "click"]();
    await page.fill("[data-testid=source-title]", "Bitkisel tedavide kanıt düzeyi (güncel)");
    await tap("[data-testid=source-submit]");
    srcItems = await page.$$eval(".note.cur [data-testid=source-item]", (els) => els.map((e) => e.innerText));
    ok(srcItems.some((t) => t.includes("(güncel)")), "kaynak düzenleme");
    await page.locator(".note.cur [data-testid=source-delete]").first()[mobile ? "tap" : "click"]();
    ok((await page.locator(".note.cur [data-testid=source-item]").count()) === 2, "kaynak silme");
    ok(N0(await store(page), "n-bronsit").sources.some((s) => s.id === "s1"), "R2: kaynak silme Kaydet'e kadar KALICI DEĞİL (taslak)");
    await shot(page, `${tag}-08-kaynaklar-duzenleme`);
    await tap("[data-testid=save]");
    const bn = N0(await store(page), "n-bronsit");
    ok(bn.images.length === 1 && bn.images[0].caption === "Bronş kesiti — yeni açıklama" && bn.sources.length === 2 && bn.sources.some((s) => s.doi === "10.5555/kanit.2024.7"), "Görseller ve Kaynaklar tek Kaydet ile kalıcı");
    await page.reload();
    await page.waitForSelector("[data-testid=note-area]");
    const ro = await page.evaluate(() => ({ cap: document.querySelector(".note.cur .capview")?.textContent, src: document.querySelectorAll(".note.cur [data-testid=source-item]").length, doi: !!document.querySelector(".note.cur [data-testid=source-doi]"), url: !!document.querySelector(".note.cur [data-testid=source-url]") }));
    ok(ro.cap?.includes("yeni açıklama") && ro.src === 2 && ro.doi && ro.url, "yeniden açınca okuma modunda görsel açıklaması, DOI ve bağlantı görünür", ro);
    await page.locator(".note.cur [data-testid=image-item] .thumb").first()[mobile ? "tap" : "click"]();
    ok(await page.locator("[data-testid=lightbox]").isVisible(), "görsel büyütülerek görüntülenebiliyor");
    await page.keyboard.press("Escape");
    await shot(page, `${tag}-09-okuma-modu-kutular`, true);

    sec("Kullanıcı alt başlığı oluşturma / silme / geri alma");
    const addSub = async (name) => {
      if (mobile) {
        await tap("[data-testid=pick]");
        await tap("[data-testid=sheet] [data-testid=add-heading]");
        await page.locator("[data-testid=addchild-input]").fill(name);
      } else {
        await tap("[data-testid=add-heading]");
        await page.locator("[data-testid=addchild-input]").fill(name);
      }
      await page.keyboard.press("Enter");
    };
    await tap("[data-testid=edit]");
    await addSub("Deneme Alt");
    ok((await crumbs(page)).endsWith("Deneme Alt"), "alt başlık oluşturuldu ve OTOMATİK açıldı (Bronşit altında)", await crumbs(page));
    await addSub("İç Başlık");
    if (mobile) await tap("[data-testid=editor]");
    await page.keyboard.type("İç başlık notu.");
    await tap("[data-testid=save]");
    await pickHeading("Deneme Alt");
    ok(!(await page.locator("[data-testid=delete-heading]").count()), "okuma modunda silme düğmesi yok (önce Düzenle)");
    await tap("[data-testid=edit]");
    ok(await page.locator("[data-testid=delete-heading]").isVisible(), "düzenlemede kullanıcı alt başlığında görünür '🗑 Alt başlığı sil' düğmesi");
    await tap("[data-testid=delete-heading]");
    const impact = await page.locator("[data-testid=delete-impact]").innerText();
    ok(/1 alt başlık/.test(impact) && /1 not/.test(impact), "silme öncesi etki açıkça gösteriliyor", impact);
    await shot(page, `${tag}-10-alt-baslik-silme-onayi`);
    await tap("[data-testid=delete-no]");
    ok((await store(page)).nodes.some((n) => n.title === "Deneme Alt" && !n.deletedAt), "Vazgeç → hiçbir şey silinmedi");
    await tap("[data-testid=delete-heading]");
    await tap("[data-testid=delete-yes]");
    const stPend = await store(page);
    ok(stPend.nodes.filter((n) => ["Deneme Alt", "İç Başlık"].includes(n.title)).every((n) => !n.deletedAt), "R2: alt başlıklı başlık silme Kaydet'e kadar KALICI DEĞİL");
    await tap("[data-testid=discard]");
    await tap("[data-testid=leave-drop]");
    const back1 = mobile ? 1 : await page.locator('[data-testid=tree-item][data-title="Deneme Alt"]').count();
    ok((await store(page)).nodes.filter((n) => ["Deneme Alt", "İç Başlık"].includes(n.title)).every((n) => !n.deletedAt) && back1 === 1, "R2: Kaydetmeden Çık → bekleyen (alt başlıklı) silme İPTAL; başlık yerinde", back1);
    await pickHeading("Deneme Alt");
    await tap("[data-testid=edit]");
    await tap("[data-testid=delete-heading]");
    await tap("[data-testid=delete-yes]");
    await tap("[data-testid=save]");
    const stD = await store(page);
    ok(stD.nodes.filter((n) => ["Deneme Alt", "İç Başlık"].includes(n.title)).every((n) => n.deletedAt) && (await crumbs(page)).endsWith("Bronşit"), "Silinenler'e taşındı (alt başlığıyla birlikte); üst başlığa dönüldü");
    ok(!(await page.locator('[data-testid=tree-item][data-title="Deneme Alt"]').count()), "silinen başlık ağaçta yok");
    if (mobile) {
      await tap("[data-testid=pick]");
      await page.locator('[data-testid=sheet] [data-testid=tree-toggle][data-title="Belirtiler / Sebepler"]').tap();
      await tap('[data-testid=sheet] [data-testid=tree-item][data-title="Tıbbi Nedenler"]');
    } else {
      await tap('[data-testid=tree] [data-testid=tree-item][data-title="Belirtiler / Sebepler"]');
      await tap('[data-testid=tree] [data-testid=tree-item][data-title="Tıbbi Nedenler"]');
    }
    await tap("[data-testid=edit]");
    ok(await page.locator("[data-testid=delete-heading]").isVisible(), "R3 (Owner kararı): hazır başlıkta da bu konuya özel silme düğmesi VAR");
    await tap("[data-testid=menu]");
    ok(!(await page.locator("[data-testid=mi-delete]").isDisabled()) && !(await page.locator("[data-testid=mi-rename]").isDisabled()), "R3 (Owner kararı): menüde hazır başlık yeniden adlandırma/silme açık");
    await page.keyboard.press("Escape");
    await tap("[data-testid=discard]");
    await tap("[data-testid=back]");
    await tap("[data-testid=open-trash]");
    const trash = await page.$$eval("[data-testid=restore]", (els) => els.map((e) => e.getAttribute("data-title")));
    ok(trash.some((t) => t.startsWith("Deneme Alt")) && !trash.some((t) => t.startsWith("İç Başlık")), "Silinenler'de yalnız silinen alt başlık (iç başlık onunla birlikte)", trash);
    await shot(page, `${tag}-11-silinenler`);
    await page.locator('[data-testid=restore][data-title^="Deneme Alt"]')[mobile ? "tap" : "click"]();
    ok((await store(page)).nodes.filter((n) => ["Deneme Alt", "İç Başlık"].includes(n.title)).every((n) => n.deletedAt) && (await page.locator("[data-testid=session] [data-testid=save]").isVisible()), "R2: Geri al taslakta bekliyor; sayfa başlığında Kaydet/Vazgeç çıktı");
    await tap("[data-testid=session] [data-testid=save]");
    const stR = await store(page);
    ok(stR.nodes.filter((n) => ["Deneme Alt", "İç Başlık"].includes(n.title)).every((n) => !n.deletedAt) && htmlOf(stR, stR.nodes.find((n) => n.title === "İç Başlık").id).includes("İç başlık notu"), "Geri al + Kaydet → alt başlık, iç başlığı ve notu eski yerinde", { nodes: stR.nodes.filter((n) => ["Deneme Alt", "İç Başlık"].includes(n.title)).map((n) => [n.title, n.deletedAt]), notes: Object.entries(stR.notes).filter(([k]) => stR.nodes.some((n) => n.id === k && n.title === "İç Başlık")).map(([, v]) => v.map((x) => [x.html, x.deletedAt])) });

    sec("Ağaç okları ve alt başlık belirginliği");
    await tap("[data-testid=back]");
    await tap('[data-testid=lib-item][data-title="Akciğer"]');
    if (mobile) await tap("[data-testid=pick]");
    const scope = mobile ? "[data-testid=sheet]" : "[data-testid=tree]";
    const T = `${scope} [data-testid=tree-toggle][data-title="Uygulamalar / Yöntemler"]`;
    const tg = await page.evaluate((s) => {
      const t = document.querySelector(s);
      const r = t.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), exp: t.getAttribute("aria-expanded"), kids: t.closest(".trow").querySelector(".kids")?.textContent };
    }, T);
    ok(tg.w >= 32 && tg.h >= 32 && /5 alt/.test(tg.kids ?? ""), "alt başlıklı satırda büyük ok düğmesi + 'N alt' rozeti", tg);
    await page.locator(T)[mobile ? "tap" : "click"]();
    const tg2 = await page.locator(T).getAttribute("aria-expanded");
    ok(tg2 !== tg.exp, "ok = yalnız aç/kapat (aria-expanded değişti)", { once: tg.exp, sonra: tg2 });
    if (tg2 === "true") await page.locator(T)[mobile ? "tap" : "click"]();
    await page.locator(`${scope} [data-testid=tree-item][data-title="Uygulamalar / Yöntemler"]`)[mobile ? "tap" : "click"]();
    if (mobile) await tap("[data-testid=pick]");
    const tg3 = await page.locator(T).getAttribute("aria-expanded");
    ok(tg3 === "true" && (await crumbs(page)).includes("Uygulamalar"), "ad = başlığı aç + alt başlıklarını göster (kapatmaz)", tg3);
    await shot(page, `${tag}-12-agac-oklari`);
    if (mobile) await tap("[data-act=sheet-close]");
    await pickHeading("Bronşit"); // kullanıcı en son Bronşit üzerinde çalıştı (C akışı bunu bekler)

    sec("B) Yeni Kayıt → alt başlık → yaz → Kaydet");
    await tap("[data-testid=back]");
    await tap("[data-testid=back]");
    const rowsBefore = (await store(page)).nodes.length;
    k = counter(page, mobile);
    await k.hit("[data-testid=card-yeni]");
    await page.locator("[data-testid=new-title]").fill("Zatürre");
    await shot(page, `${tag}-13-yeni-kayit`);
    await k.hit("[data-testid=new-create]");
    const newEdit = await page.evaluate(() => ({ editor: !!document.querySelector("[data-testid=editor]"), bar: !!document.querySelector("[data-testid=topbar] [data-testid=save]") }));
    ok(newEdit.editor && newEdit.bar, "yeni kayıt doğrudan DÜZENLEME modunda açıldı", newEdit);
    if (!mobile) await shot(page, `${tag}-14-yeni-kayit-hazir-basliklar`);
    if (mobile) {
      await k.hit("[data-testid=pick]");
      await shot(page, `${tag}-14-yeni-kayit-baslik-sec`);
    }
    await k.hit(mobile ? "[data-testid=sheet] [data-testid=add-heading]" : "[data-testid=add-heading]");
    await page.locator("[data-testid=addchild-input]").fill("Bronşit");
    await k.enter();
    if (mobile) await k.hit("[data-testid=editor]");
    else ok(await focusedEditor(page), "yeni alt başlık açıldı, not alanı hazır");
    await page.keyboard.type("Zatürre sonrası bronşit takibi.");
    await k.hit("[data-testid=save]");
    const stB = await store(page);
    const nt = stB.topics.find((t) => t.title === "Zatürre");
    const rows = stB.nodes.filter((n) => n.rootId === nt?.id);
    ok(rows.length === 1 && rows[0].title === "Bronşit", "SANAL ŞABLON: kayda yalnız 1 başlık satırı (25 hazır başlık kayıt oluşturmadı)", rows.map((n) => n.title));
    ok(stB.nodes.length === rowsBefore + 1, "mevcut kayıtlar değişmedi", { rowsBefore, after: stB.nodes.length });
    summary[`B-${tag}`] = k.s.clicks;
    ok(mobile || k.s.clicks <= 4, `B: ${k.s.clicks} tıklama + ${k.s.enter} Enter (hedef masaüstü ≤4)`, k.s);

    sec("C) Ertesi gün → kayıtlı konu → önceki not");
    await page.goto(BASE);
    await page.waitForSelector("[data-testid=card-kutuphane]");
    k = counter(page, mobile);
    await k.hit("[data-testid=card-kutuphane]");
    await k.hit('[data-testid=lib-item][data-title="Akciğer"]');
    const nv = await page.locator(".note.cur [data-testid=note-view]").innerText().catch(() => "");
    ok(nv.includes("buhar soluması"), "son çalışılan başlık ve önceki not doğrudan (okuma modunda) açıldı", await crumbs(page));
    summary[`C-${tag}`] = k.s.clicks;
    ok(k.s.clicks <= 2, `C: ${k.s.clicks} tıklama`, k.s);

    sec("Sanal şablon güvenliği + arama/vurgu/incelendi");
    const ak0 = (await store(page)).nodes.filter((n) => n.rootId === "t-akciger" && !n.deletedAt).length;
    await tap("[data-testid=edit]");
    if (mobile) {
      await tap("[data-testid=pick]");
      await page.locator('[data-testid=sheet] [data-testid=tree-toggle][data-title="Destekleyici / Alternatif Uygulamalar"]').tap();
      await tap('[data-testid=sheet] [data-testid=tree-item][data-title="Nefes"]');
      await tap("[data-testid=editor]");
    } else {
      await tap('[data-testid=tree] [data-testid=tree-item][data-title="Destekleyici / Alternatif Uygulamalar"]');
      await tap('[data-testid=tree] [data-testid=tree-item][data-title="Nefes"]');
    }
    await page.keyboard.type("Diyafram nefesi.");
    await tap("[data-testid=save]");
    await editAndFocus();
    await page.keyboard.type(" Günde 3 kez.");
    await tap("[data-testid=save]");
    const ak = (await store(page)).nodes.filter((n) => n.rootId === "t-akciger" && !n.deletedAt);
    ok(ak.length === ak0 + 2 && ak.filter((n) => n.templateKey === "konu:nefes").length === 1, "hazır başlığa ilk yazım: yalnız grup + başlık (+2); ikinci yazımda çoğaltma yok", ak.length - ak0);
    await tap("[data-testid=back]");
    await page.fill("[data-testid=search]", "zencefil");
    const res = await page.$$eval("[data-testid=lib-item]", (els) => els.map((e) => e.getAttribute("data-title")));
    ok(JSON.stringify(res) === JSON.stringify(["Akciğer", "Şiddetli Öksürük"]), "arama: yalnız konu başlıkları, alfabetik", res);
    await shot(page, `${tag}-15-arama`);
    await tap('[data-testid=lib-item][data-title="Akciğer"]');
    const hl = await page.evaluate(() => ({ marks: document.querySelectorAll(".note.cur [data-testid=note-view] mark.hit").length, title: document.querySelector("[data-testid=heading-title]")?.innerText, read: !document.querySelector("[data-testid=editor]") }));
    ok(hl.marks >= 2 && /Bitkisel/.test(hl.title ?? "") && hl.read, "aramadan açılan konu eşleşen başlıkta, OKUMA modunda, kelimeler sarı", hl);
    await shot(page, `${tag}-16-sari-vurgu-okuma`);
    await tap("[data-testid=back]");
    const rv = await page.$$eval("[data-testid=lib-item] .chip", (els) => els.map((e) => e.textContent));
    ok(JSON.stringify(rv) === JSON.stringify(["İncelendi", "İncelenmedi"]), "İncelendi / İncelenmedi", rv);

    await rev2(page, tap, pickHeading, mobile, tag);
    await rev3(page, tap, pickHeading, mobile, tag);
    await rev4(page, tap, pickHeading, mobile, tag);
    await rev5(page, tap, pickHeading, mobile, tag);
    await rev6(page, tap, pickHeading, mobile, tag);
    await rev7(page, tap, pickHeading, mobile, tag);

    sec("Genel");
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ov <= 0, "yatay taşma yok", ov);
    const body = await page.locator("body").innerText();
    ok(!/Basit Görünüm|Gelişmiş Görünüm|Notlarım|Bütüncül Okuma|Şablonu Ekle/.test(body), "Basit/Gelişmiş, Notlarım/Bütüncül Okuma, şablon düğmesi yok");
    await page.fill("[data-testid=search]", "");
    await tap('[data-testid=lib-item][data-title="Akciğer"]');
    await tap("[data-testid=menu]");
    await shot(page, `${tag}-17-diger-islemler`);
    await page.keyboard.press("Escape");
    await c.close();
  }
} catch (e) {
  fail++;
  console.log("  ✗ BEKLENMEYEN HATA:", String(e?.stack ?? e).slice(0, 900));
} finally {
  await browser.close();
  stopServer(server);
}
console.log("\nTIKLAMA ÖZETİ:", JSON.stringify(summary));
console.log(`SONUÇ: ${pass} PASS, ${fail} FAIL (ekranlar: ${SHOTS})`);
process.exit(fail ? 1 : 0);
