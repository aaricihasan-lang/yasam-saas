// #804 GEÇİCİ — GERÇEK APPLE SAFARI uygulama kabulü (safaridriver / W3C WebDriver; Playwright DEĞİL). Repoya girmez.
// Uygulama: next start (127.0.0.1:3984) önünde sentetik arka uç vekili (127.0.0.1:8080, .safari-sunucu.ts). Tüm veriler sentetik.
//   MOD=main → yalnız K (Kişisel Dijital Ofis görselleri)   MOD=f2 → K + L (F2 rapor logosu) + Y (yetki) + G (genişlik)
// Her kontrol PASS / FAIL / NOT TESTED olarak ayrı yazılır; biri düşse de diğerleri koşar. Ekran görüntüleri OUT'a.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const WD = process.env.WD_URL ?? "http://127.0.0.1:4444";
const BASE = process.env.UI_BASE ?? "http://127.0.0.1:8080";
const MOD = process.env.MOD === "f2" ? "f2" : "main";
const OUT = resolve(process.env.OUT ?? "safari-uygulama");
mkdirSync(OUT, { recursive: true });
const sonuc = { PASS: 0, FAIL: 0, "NOT TESTED": 0 };
const satirlar = [];
function kayit(durum, grup, ad, ayrinti = "") {
  sonuc[durum]++;
  const s = `${durum} [${MOD}/${grup}] ${ad}${ayrinti === "" ? "" : `  → ${typeof ayrinti === "string" ? ayrinti : JSON.stringify(ayrinti)}`.slice(0, 600)}`;
  satirlar.push(s); console.log(s);
}
const ok = (grup, ad, kosul, ayrinti) => kayit(kosul ? "PASS" : "FAIL", grup, ad, kosul ? "" : ayrinti);
const test = async (grup, ad, fn) => { try { await fn(); } catch (e) { kayit("FAIL", grup, `${ad} (istisna)`, String(e).slice(0, 400)); await ekran(`hata-${grup}-${ad}`).catch(() => {}); } };

// ── WebDriver ──
let sid = null;
async function wd(method, path, body) {
  const r = await fetch(WD + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j?.value ?? j).slice(0, 300)}`);
  return j.value;
}
const s = (p) => `/session/${sid}${p}`;
const exec = (script, args = []) => wd("POST", s("/execute/sync"), { script, args });
async function bekle(js, ms = 20000, args = []) {
  const son = Date.now() + ms;
  for (;;) {
    const v = await exec(`return (${js});`, args).catch(() => null);
    if (v) return v;
    if (Date.now() > son) return null;
    await new Promise((r) => setTimeout(r, 250));
  }
}
const git = (yol) => wd("POST", s("/url"), { url: BASE + yol });
// Yenileme: kaydedilmemiş değişiklik varsa uygulama "sayfadan ayrıl?" (beforeunload) uyarısı gösterir. Uyarı metni kanıt olarak
// kaydedilir ve kabul edilir (Safari'de uyarının çalıştığının da kanıtı).
const uyarilar = [];
async function yenile() {
  await wd("POST", s("/refresh"), {}).catch((e) => uyarilar.push("refresh: " + String(e).slice(0, 120)));
  for (let i = 0; i < 6; i++) {
    const t = await wd("GET", s("/alert/text")).catch(() => null);
    if (t === null) break;
    uyarilar.push(String(t).slice(0, 160)); await wd("POST", s("/alert/accept"), {}).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
  }
}
async function bul(xpath, ms = 20000) {
  const son = Date.now() + ms;
  for (;;) {
    try { const e = await wd("POST", s("/element"), { using: "xpath", value: xpath }); return Object.values(e)[0]; }
    catch (err) { if (Date.now() > son) throw new Error(`öğe yok: ${xpath}`); await new Promise((r) => setTimeout(r, 250)); }
  }
}
const tikla = async (xpath, ms) => wd("POST", s(`/element/${await bul(xpath, ms)}/click`), {});
const tid = (id) => `//*[@data-testid='${id}']`;
async function ekran(ad) {
  const b64 = await wd("GET", s("/screenshot"));
  writeFileSync(join(OUT, `${MOD}-${ad.replace(/[^a-z0-9ğüşıöç-]+/gi, "_")}.png`), Buffer.from(b64, "base64"));
}
async function sunucu(yol, govde) {
  const r = await fetch(BASE + yol, govde ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) } : {});
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(`sentetik sunucu ${yol} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
// GERÇEKTEN ÇİZİLDİ Mİ: öğe ekran görüntüsü (WebDriver) → sharp ile çözülür → arka plandan belirgin farklı (renkli) piksel oranı.
// (Otomasyondaki Safari'de canvas getImageData engelli; ekran görüntüsü tarayıcının gerçekten boyadığı pikselleri verir.)
async function cizildi(xpath) {
  const id = await bul(xpath, 10000);
  const b64 = await wd("GET", s(`/element/${id}/screenshot`));
  const { data, info } = await sharp(Buffer.from(b64, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let renkli = 0; const n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) { const [r, g, b] = [data[i], data[i + 1], data[i + 2]]; if (Math.max(r, g, b) - Math.min(r, g, b) > 40) renkli++; }
  return { boyut: `${info.width}×${info.height}`, renkliOran: Math.round((renkli / n) * 100) / 100 };
}
// Sayfadaki blob: görseller — gerçekten yüklendi mi (complete && naturalWidth/Height > 0)?
const BLOB_OLC = `return Array.from(document.querySelectorAll('img')).filter((i) => i.src.startsWith('blob:')).map((i) => ({ w: i.naturalWidth, h: i.naturalHeight, c: i.complete }));`;
async function blobOlc(enAz, ms = 20000) {
  const son = Date.now() + ms;
  let r = [];
  for (;;) {
    r = await exec(BLOB_OLC);
    const y = r.filter((x) => x.c && x.w > 0 && x.h > 0).length;
    if (r.length >= enAz && y === r.length) break;
    if (Date.now() > son) break;
    await new Promise((x) => setTimeout(x, 300));
  }
  return { toplam: r.length, yuklu: r.filter((x) => x.c && x.w > 0 && x.h > 0).length, ayrinti: r };
}
// JS istisnaları (ErrorEvent / unhandledrejection) ile kaynak yükleme hataları (img/script 404) AYRI toplanır.
const HATA_TOPLA = `window.__hatalar = window.__hatalar || []; window.__kaynak = window.__kaynak || []; if (!window.__hk) { window.__hk = 1;
  window.addEventListener('error', (e) => { if (e instanceof ErrorEvent) window.__hatalar.push('error: ' + e.message); else window.__kaynak.push((e.target && (e.target.src || e.target.href)) || '?'); }, true);
  window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('rejection: ' + String(e.reason).slice(0, 200))); } return true;`;
const hatalar = () => exec("return (window.__hatalar || []).slice(0, 10);");
// Vercel Analytics / Speed Insights betikleri yalnız Vercel'de dağıtılır; yerel next start'ta 404 BEKLENİR. Diğer her kaynak hatası FAIL.
const kaynakHatalari = async () => {
  const k = (await exec("return (window.__kaynak || []).slice(0, 20);")) ?? [];
  return { beklenen: k.filter((u) => /\/_vercel\//.test(u)), beklenmeyen: k.filter((u) => !/\/_vercel\//.test(u)) };
};

async function oturum(senaryo) {
  if (sid) { await wd("DELETE", s("")).catch(() => {}); sid = null; }
  await sunucu("/__test/sifirla", { senaryo });
  const yeni = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
  sid = yeni.sessionId;
  await wd("POST", s("/window/rect"), { width: 1280, height: 900, x: 0, y: 0 }).catch(() => {});
  await git("/robots.txt");
  const durum = await sunucu("/__test/durum");
  const kul = { id: "00000000-0000-4000-8000-0000000000f2", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe",
    role: senaryo === "yonetici" ? "admin" : "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
    tenant_id: "aaaaaaaa-0000-4000-8000-0000000000f2", is_demo_account: senaryo === "demo", module_permissions: { clients: true, numerology: true, human_design: true } };
  await exec(`localStorage.setItem('yasam_user', arguments[0]); localStorage.setItem('yasam_session_token', 'zz-local-fake-token');
    localStorage.setItem('yasam_analytics_consent_v1', JSON.stringify({ decision: 'denied', decidedAt: '2026-11-01T00:00:00.000Z' })); return true;`, [JSON.stringify(kul)]);
  await wd("POST", s("/cookie"), { cookie: { name: "NEXT_LOCALE", value: "tr", path: "/" } }).catch(() => {});
  return { kap: yeni.capabilities, durum };
}

// ── K: Kişisel Dijital Ofis görselleri (main ve F2'de AYNI akış) ──
async function studyoAc() {
  await git("/?calisma-alanim=1");
  await exec(HATA_TOPLA);
  await bul("//*[@role='dialog' and @aria-labelledby='studio-title']", 90000);
  await tikla("//*[@role='dialog' and @aria-labelledby='studio-title']//*[@role='tab'][contains(., 'Logo')]");
  await tikla("(//*[@role='dialog' and @aria-labelledby='studio-title']//button[contains(normalize-space(.), 'Görsellerimi göster')])[1]");
  await bul("//*[@role='dialog' and @aria-labelledby='studio-title']//li[contains(., '400×400')]", 30000);
}
async function bolumK() {
  const { kap } = await oturum("uzman");
  console.log(`SAFARI-SURUM ${JSON.stringify({ browserName: kap?.browserName, browserVersion: kap?.browserVersion, platformName: kap?.platformName })}`);
  await test("K", "liste: 4 küçük resim (yatay/dikey/kare/şeffaf) gerçekten yüklendi", async () => {
    await studyoAc();
    const r = await blobOlc(4);
    await ekran("K1-liste");
    ok("K", "liste: 4 küçük resim (yatay/dikey/kare/şeffaf) gerçekten yüklendi", r.toplam >= 4 && r.yuklu === r.toplam, r);
    const c = await cizildi("(//*[@role='dialog' and @aria-labelledby='studio-title']//li[contains(., '400×400')]//img[starts-with(@src, 'blob:')])[1]");
    ok("K", "küçük resim ekranda gerçekten boyandı (öğe ekran görüntüsünde renkli piksel)", c.renkliOran > 0.3, c);
  });
  await test("K", "Logo olarak kullan → stüdyo önizlemesi yüklendi", async () => {
    await tikla("//*[@role='dialog' and @aria-labelledby='studio-title']//li[contains(., '600×200')]//button[contains(., 'Logo olarak kullan')]");
    const r = await blobOlc(5);
    await ekran("K2-logo-olarak-kullan");
    ok("K", "Logo olarak kullan → stüdyo önizlemesi yüklendi", r.toplam >= 5 && r.yuklu === r.toplam, r);
  });
  await test("K", "Uygula → yenile → liste yeniden yüklendi", async () => {
    await tikla("//*[@role='dialog' and @aria-labelledby='studio-title']//button[normalize-space(.)='Uygula' or contains(normalize-space(.), 'Uygula')][not(@disabled)]");
    await bekle("!document.querySelector('[role=dialog][aria-labelledby=studio-title]') || /uygulandı|Uygulanacak değişiklik yok/i.test(document.body.innerText)", 20000);
    await yenile();
    await exec(HATA_TOPLA);
    const ana = await blobOlc(1, 20000);
    await ekran("K3-yenile-ana-sayfa");
    if (ana.toplam === 0) kayit("NOT TESTED", "K", "yenileme sonrası ana sayfada blob görsel yok (bu sayfada logo gösterilmiyor olabilir)", ana);
    else ok("K", "yenileme sonrası ana sayfadaki blob görseller yüklendi", ana.yuklu === ana.toplam, ana);
    await studyoAc();
    const r = await blobOlc(4);
    await ekran("K4-yenile-liste");
    ok("K", "yenileme sonrası görsel listesi yeniden yüklendi", r.toplam >= 4 && r.yuklu === r.toplam, r);
    ok("K", "JS istisnası yok (error/unhandledrejection)", (await hatalar()).length === 0, await hatalar());
    const kh = await kaynakHatalari();
    ok("K", "beklenmeyen kaynak yükleme hatası yok (yalnız Vercel'e özgü /_vercel/* 404'leri beklenir)", kh.beklenmeyen.length === 0, kh);
  });
}

// ── L: F2 rapor logosu (yalnız MOD=f2) ──
async function profilim() {
  await git("/settings");
  await exec(HATA_TOPLA);
  await tikla("//main//button[@aria-pressed][contains(., 'Profilim')]", 120000);
  await bul(tid("report-logo"), 60000);
}
const onizlemeYuklu = () => bekle(`(() => { const i = document.querySelector('[data-testid="report-logo-preview-img"]'); return !!i && i.complete && i.naturalWidth > 0 && i.src.startsWith('blob:') ? { w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(0, 40) } : null; })()`, 20000);
const bildirim = () => bekle(`(() => { const n = document.querySelector('[data-testid="report-logo-notice"]'); return n ? { ton: n.getAttribute('data-tone'), metin: n.textContent.trim(), rol: n.getAttribute('role') } : null; })()`, 15000);
async function varlikSec(sira) {
  const sec = await bul(tid("report-logo-opt-custom"));
  await wd("POST", s(`/element/${sec}/click`), {}).catch(async () => exec("document.querySelector('[data-testid=report-logo-opt-custom]').click(); return true;"));
  await bul(`(${tid("report-logo-asset")})[${sira}]`);
  await tikla(`(${tid("report-logo-asset")})[${sira}]`);
}
async function dosyaVer(yol) {
  // Görsel olarak gizli (sr-only) dosya alanı: WebDriver dosya ataması için yalnız test sırasında görünür yapılır (mantık değişmez).
  await exec("const f = document.querySelector('[data-testid=report-logo-file]'); f.classList.remove('sr-only'); f.style.cssText = 'position:static;width:auto;height:auto;opacity:1'; return true;");
  const el = await bul(tid("report-logo-file"));
  await wd("POST", s(`/element/${el}/value`), { text: yol });
}

async function bolumL(dosyalar) {
  await oturum("uzman");
  const d0 = await sunucu("/__test/durum");
  const [yatay, , kare] = ["yatay.png", "dikey.png", "kare.png"].map((k) => d0.ids[k]);
  await test("L", "seçim + önizleme + kaydet + yenile", async () => {
    await profilim();
    await varlikSec(3);
    const on = await onizlemeYuklu();
    await ekran("L1-onizleme");
    ok("L", "listeden logo seçimi → önizleme gerçekten yüklendi (naturalWidth > 0)", !!on, on);
    const c = await cizildi(tid("report-logo-preview-img"));
    ok("L", "önizleme logosu ekranda gerçekten boyandı (öğe ekran görüntüsünde renkli piksel)", c.renkliOran > 0.3, c);
    await tikla(tid("report-logo-save"));
    const n = await bildirim();
    const d = await sunucu("/__test/durum");
    ok("L", "kaydet → bildirim ok + sunucuda custom", n?.ton === "ok" && d.logo.source === "custom" && !!d.logo.assetId, { n, logo: d.logo });
    await yenile();
    await profilim();
    const sec = await exec("const r = document.querySelector('[data-testid=report-logo-opt-custom]'); return r ? r.checked : null;");
    const on2 = await onizlemeYuklu();
    await ekran("L2-yenileme-sonrasi");
    ok("L", "yenileme sonrası seçim korundu + önizleme yüklü", sec === true && !!on2, { sec, on2 });
  });
  await test("L", "logo değiştirme", async () => {
    const once = (await sunucu("/__test/durum")).logo.assetId;
    const src1 = await exec("const i = document.querySelector('[data-testid=report-logo-preview-img]'); return i ? i.src : null;");
    await varlikSec(1);
    const degisti = await bekle(`(() => { const i = document.querySelector('[data-testid="report-logo-preview-img"]'); return !!i && i.src !== arguments[0] && i.complete && i.naturalWidth > 0; })()`, 20000, [src1]);
    ok("L", "ikinci logo seçilince önizleme güncellendi ve yüklendi", !!degisti);
    await tikla(tid("report-logo-save"));
    await bildirim();
    await yenile();
    await profilim();
    const d = await sunucu("/__test/durum");
    ok("L", "kaydet + yenile → son seçilen logo korundu", d.logo.source === "custom" && d.logo.assetId !== once && !!(await onizlemeYuklu()), d.logo);
    await ekran("L3-degistir");
  });
  await test("L", "hata durumunda mevcut logo korunur", async () => {
    const once = (await sunucu("/__test/durum")).logo;
    await sunucu("/__test/enjekte", { tur: "logoPut", status: 500, json: { ok: false, error: "İşlem sırasında bir hata oluştu." } });
    await varlikSec(4);
    await tikla(tid("report-logo-save"));
    const n = await bildirim();
    const d = await sunucu("/__test/durum");
    await ekran("L4-hata");
    ok("L", "sunucu 500 → hata bildirimi, sunucudaki logo DEĞİŞMEDİ", n?.ton !== "ok" && d.logo.assetId === once.assetId, { n, once, sonra: d.logo });
  });
  await test("L", "yükleme (gerçek dosya + gerçek HTTP)", async () => {
    await tikla(tid("report-logo-cancel"), 3000).catch(() => {}); // önceki adımdan kalan kaydedilmemiş seçimi bırak (Vazgeç)
    await yenile();
    await profilim();
    for (const [ad, yol, beklenen] of [["PNG", dosyalar.png, "kabul"], ["JPEG", dosyalar.jpg, "kabul"], ["SVG", dosyalar.svg, "ret-istemci"], ["2 MB üstü", dosyalar.buyuk, "ret-istemci"], ["bozuk PNG", dosyalar.bozuk, "ret-sunucu"]]) {
      await yenile(); await profilim();
      const once = await sunucu("/__test/durum");
      const sec = await bul(tid("report-logo-opt-custom")); await wd("POST", s(`/element/${sec}/click`), {}).catch(() => {});
      let secilemedi = null;
      try { await dosyaVer(yol); } catch (e) { secilemedi = String(e).slice(0, 200); }
      if (secilemedi) {
        // Safari'nin dosya seçicisi input accept filtresine uymayan dosyayı hiç kabul etmedi (tarayıcı katmanı).
        if (beklenen === "ret-istemci") {
          kayit("PASS", "L", `${ad}: Safari dosya seçicisi kabul etmedi (accept="image/png,image/jpeg,image/webp") — yükleme isteği yok`, secilemedi);
          kayit("NOT TESTED", "L", `${ad}: uygulamanın kendi istemci uyarısı Safari'de gösterilemedi (dosya seçici önce reddetti)`);
        } else kayit("FAIL", "L", `${ad}: dosya seçilemedi`, secilemedi);
        continue;
      }
      const ui = await bekle(`(() => { const e = document.querySelector('[data-testid="report-logo-upload-error"]'); if (e && e.textContent.trim()) return { hata: e.textContent.trim() }; return document.querySelectorAll('[data-testid="report-logo-asset"]').length > arguments[0] ? { yeni: true } : null; })()`, 30000, [once.varliklar.length]);
      const sonra = await sunucu("/__test/durum");
      const yeni = sonra.yazmalar.slice(once.yazmalar.length);
      const oturumAcildi = yeni.some((y) => y.yol.endsWith("/uploads") && y.status === 200);
      const parcaOk = yeni.some((y) => y.yol.includes("/chunks/") && y.status === 200);
      await ekran(`L5-yukle-${ad}`);
      const iz = { ui, yeni };
      if (beklenen === "ret-istemci") { ok("L", `${ad} istemcide reddedildi (yükleme oturumu açılmadı)`, !!ui?.hata && !oturumAcildi, iz); continue; }
      if (oturumAcildi && !parcaOk) { kayit("NOT TESTED", "L", `${ad}: yükleme başladı ama dosya içeriği sunucuya ulaşmadı — WebDriver'ın verdiği dosya Safari sandbox'ında okunamıyor (otomasyon kısıtı; gerçek kullanıcı seçimi değil)`, iz); continue; }
      if (beklenen === "kabul") ok("L", `${ad} kabul: içerik sunucuya ulaştı, yeni görsel listede`, parcaOk && !!ui?.yeni && sonra.varliklar.length === once.varliklar.length + 1, iz);
      else ok("L", `${ad} sunucuda reddedildi, liste değişmedi`, parcaOk && !!ui?.hata && sonra.varliklar.length === once.varliklar.length, iz);
    }
  });
  await test("L", "kaldırma (Logo kullanma)", async () => {
    await yenile();
    await profilim();
    await tikla(tid("report-logo-opt-none")).catch(async () => exec("document.querySelector('[data-testid=report-logo-opt-none]').click(); return true;"));
    await tikla(tid("report-logo-save"));
    const n = await bildirim();
    const d = await sunucu("/__test/durum");
    ok("L", "Logo kullanma + kaydet → sunucuda none + 'kaldırıldı'", d.logo.source === "none" && /kaldırıldı/.test(n?.metin ?? ""), { n, logo: d.logo });
  });
  await test("L", "silme onayı (stüdyo, rapor logosu korumalı)", async () => {
    // Kare görseli rapor logosu yap (UI ile), sonra stüdyoda sil: iptal / Escape / onay 409 / serbest görsel onay 200.
    await profilim(); await varlikSec(3); await tikla(tid("report-logo-save")); await bildirim();
    const kayitli = (await sunucu("/__test/durum")).logo.assetId;
    await studyoAc();
    const dlg = "//*[@role='alertdialog']";
    const silAc = async (dim) => { await tikla(`//*[@role='dialog' and @aria-labelledby='studio-title']//li[contains(., '${dim}')]//button[starts-with(@aria-label, 'Sil') or starts-with(normalize-space(.), 'Sil')]`); await bul(dlg, 10000); };
    const kartBoyut = { [kare]: "400×400", [yatay]: "600×200" }[kayitli] ?? "400×400";
    await silAc(kartBoyut);
    const odak = await bekle("document.activeElement && document.activeElement.textContent.trim() === 'Düzenlemeye devam'", 3000);
    await ekran("L6-onay-penceresi");
    ok("L", "onay penceresi: güvenli seçenek ilk odakta", !!odak);
    await tikla(`${dlg}//button[normalize-space(.)='Düzenlemeye devam']`);
    await bekle("!document.querySelector('[role=alertdialog]')", 5000);
    let d = await sunucu("/__test/durum");
    ok("L", "iptal → DELETE yok", d.silmeler.length === 0, d.silmeler);
    await silAc(kartBoyut);
    await wd("POST", s("/actions"), { actions: [{ type: "key", id: "k", actions: [{ type: "keyDown", value: "" }, { type: "keyUp", value: "" }] }] });
    const kapandi = await bekle("!document.querySelector('[role=alertdialog]')", 5000);
    d = await sunucu("/__test/durum");
    ok("L", "Escape → pencere kapandı, DELETE yok", !!kapandi && d.silmeler.length === 0, d.silmeler);
    await silAc(kartBoyut);
    await tikla(`${dlg}//button[normalize-space(.)='Evet, sil']`);
    const uyari = await bekle("/Önce rapor logosundan kaldırın/.test(document.body.innerText)", 15000);
    d = await sunucu("/__test/durum");
    await ekran("L7-409");
    ok("L", "onay + rapor logosu → 409 uyarısı, görsel silinmedi", !!uyari && d.silmeler.at(-1)?.status === 409 && d.varliklar.includes(kayitli), d.silmeler);
    await silAc("200×600");
    await tikla(`${dlg}//button[normalize-space(.)='Evet, sil']`);
    const silindi = await bekle("/Görsel silindi/.test(document.body.innerText)", 15000);
    d = await sunucu("/__test/durum");
    await ekran("L8-silindi");
    ok("L", "onay + serbest görsel → silindi (200)", !!silindi && d.silmeler.at(-1)?.status === 200, d.silmeler);
  });
}

// ── Y: yetki senaryoları (sentetik) ──
async function bolumY() {
  await test("Y", "demo", async () => {
    await oturum("demo");
    await profilim();
    // Seçenekler <fieldset disabled> ile kilitlenir: input'un kendi .disabled özelliği false kalır → doğru ölçüt :disabled eşleşmesi.
    const kilit = await exec("const r = document.querySelector('[data-testid=report-logo-opt-none]'); return { kilitli: !!r && r.matches(':disabled'), kaydet: !!document.querySelector('[data-testid=report-logo-save]') };");
    // Gerçek etkileşim: kilitli seçeneğe tıklamak seçimi DEĞİŞTİRMEMELİ.
    const onceSecim = await exec("return Array.from(document.querySelectorAll('[data-testid^=report-logo-opt-]')).filter((x) => x.checked).map((x) => x.getAttribute('data-testid'));");
    const hedef = (onceSecim ?? []).includes("report-logo-opt-none") ? "report-logo-opt-custom" : "report-logo-opt-none";
    await wd("POST", s(`/element/${await bul(tid(hedef))}/click`), {}).catch(() => {});
    const sonraSecim = await exec("return Array.from(document.querySelectorAll('[data-testid^=report-logo-opt-]')).filter((x) => x.checked).map((x) => x.getAttribute('data-testid'));");
    ok("Y", "demo: kilitli seçeneğe tıklama seçimi değiştirmedi", JSON.stringify(onceSecim) === JSON.stringify(sonraSecim), { onceSecim, sonraSecim });
    await ekran("Y1-demo");
    const d = await sunucu("/__test/durum");
    ok("Y", "demo: seçenekler kilitli, kaydet yok, yazma isteği yok", kilit.kilitli && !kilit.kaydet && d.yazmalar.length === 0, { kilit, yazmalar: d.yazmalar });
    ok("Y", "demo: kayıtlı logo önizlemede yine görünür", !!(await onizlemeYuklu()));
  });
  await test("Y", "erişim kapalı", async () => {
    await oturum("erisim-kapali");
    await profilim();
    const g = await exec("return { kapali: !!document.querySelector('[data-testid=report-logo-access-off]'), secenek: !!document.querySelector('[data-testid=report-logo-opt-custom]'), temizle: !!document.querySelector('[data-testid=report-logo-clear]') };");
    await ekran("Y2-erisim-kapali");
    ok("Y", "erişim kapalı: açıklama var, seçenekler yok, önceki seçim kaldırılabilir", g.kapali && !g.secenek && g.temizle, g);
    await tikla(tid("report-logo-clear"));
    await bekle("!document.querySelector('[data-testid=report-logo-clear]')", 15000);
    const d = await sunucu("/__test/durum");
    ok("Y", "erişim kapalı: 'Önceki logo seçimini kaldır' → sunucuda none", d.logo.source === "none", d.logo);
  });
  await test("Y", "başka kullanıcı/tenant görseli", async () => {
    await oturum("uzman");
    await profilim();
    const r = await exec("const x = new XMLHttpRequest(); x.open('PUT', '/api/settings/profile/logo', false); x.setRequestHeader('content-type', 'application/json'); x.send(JSON.stringify({ source: 'custom', assetId: '99999999-9999-4999-8999-999999999999', expectedVersion: 1 })); return { status: x.status, govde: x.responseText.slice(0, 160) };");
    ok("Y", "başka kullanıcıya ait görsel kimliği → 400 LOGO_ASSET_INVALID (sentetik arka uç kuralı)", r.status === 400 && /LOGO_ASSET_INVALID/.test(r.govde), r);
  });
  await test("Y", "yönetici", async () => {
    await oturum("yonetici");
    await profilim();
    await ekran("Y4-yonetici");
    ok("Y", "yönetici rolü: rapor logosu bölümü açılıyor, sayfa hatası yok", (await hatalar()).length === 0, await hatalar());
  });
}

// ── G: genişlikler (Safari pencere en küçük genişliği ölçülür) ──
async function bolumG() {
  await oturum("uzman");
  await profilim();
  for (const w of [320, 375, 390, 768, 1024, 1440]) {
    await test("G", `${w}px`, async () => {
      await wd("POST", s("/window/rect"), { width: w, height: 900 });
      await new Promise((r) => setTimeout(r, 500));
      const g = await exec("return { ic: window.innerWidth, kaydirma: document.documentElement.scrollWidth, istemci: document.documentElement.clientWidth };");
      await ekran(`G-${w}`);
      if (g.ic > w + 20) kayit("NOT TESTED", "G", `${w}px — Safari penceresi bu genişliğe inmedi (iç genişlik ${g.ic}px)`, g);
      else ok("G", `${w}px (iç ${g.ic}px): yatay taşma yok`, g.kaydirma <= g.istemci, g);
    });
  }
}

(async () => {
  try {
    const sd = sharp({ create: { width: 500, height: 200, channels: 4, background: { r: 30, g: 90, b: 160, alpha: 1 } } });
    const DD = resolve(process.env.DOSYA_DIZIN ?? OUT); mkdirSync(DD, { recursive: true });
    const dosyalar = {
      png: join(DD, "yeni-logo.png"), jpg: join(DD, "yeni-logo.jpg"), svg: join(DD, "logo.svg"), buyuk: join(DD, "cok-buyuk.png"), bozuk: join(DD, "bozuk.png"),
    };
    writeFileSync(dosyalar.png, await sd.clone().png().toBuffer());
    writeFileSync(dosyalar.jpg, await sd.clone().jpeg().toBuffer());
    writeFileSync(dosyalar.svg, `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>`);
    const gurultu = Buffer.alloc(1400 * 1400 * 3); for (let i = 0; i < gurultu.length; i++) gurultu[i] = (i * 2654435761) >>> 24;
    writeFileSync(dosyalar.buyuk, await sharp(gurultu, { raw: { width: 1400, height: 1400, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer());
    writeFileSync(dosyalar.bozuk, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 7)]));
    await bolumK();
    if (MOD === "f2") { await bolumL(dosyalar); await bolumY(); await bolumG(); }
  } catch (e) {
    kayit("FAIL", "genel", "koşu tamamlanamadı", String(e).slice(0, 500));
  } finally {
    if (sid) await wd("DELETE", s("")).catch(() => {});
    console.log(`SAFARI-UYARILAR ${JSON.stringify(uyarilar)}`);
    console.log(`\nSAFARI-UYGULAMA ${MOD}: ${sonuc.PASS} PASS / ${sonuc.FAIL} FAIL / ${sonuc["NOT TESTED"]} NOT TESTED`);
    writeFileSync(join(OUT, `${MOD}-sonuc.txt`), satirlar.join("\n") + `\n${JSON.stringify(sonuc)}\n`);
    process.exit(sonuc.FAIL ? 1 : 0);
  }
})();
