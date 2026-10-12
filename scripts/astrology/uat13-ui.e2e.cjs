// 2026-10-12 Android UAT (13 madde) — YEREL TARAYICI uçtan uca (Playwright; sahte DB + sahte Roxy; GERÇEK Roxy YOK).
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (54329/54330, FAKE_ROXY_RELABEL=1 → sonuçlar gerçek DEĞİL).
// Kullanım: node scripts/astrology/uat13-ui.e2e.cjs [genişlik=390] [yükseklik=844] [fake-backend.log]
// NOT: Bu bir EMÜLASYONDUR (Chromium mobil görünüm alanı + dokunma); fiziksel Android cihaz testi DEĞİLDİR.
const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");

const [W = "390", H = "844", LOG = ""] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const BASE = "http://localhost:3931/admin/astroloji";
const API = "http://localhost:3931/api/admin/astroloji";
const REST = "http://127.0.0.1:54329/rest/v1";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} [${width}px] ${name}${extra ? ` — ${extra}` : ""}`);
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const api = async (path, body, method = body ? "POST" : "GET") => {
  const r = await fetch(`${API}${path}`, { method, headers: HDR, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const rest = async (path) => (await (await fetch(`${REST}/${path}`, { headers: { apikey: "x" } })).json());

/** Görünür alanın dışına taşan (ve yatay kaydırılabilir bir kabın içinde OLMAYAN) öğeler — "sessizce kesilen" veri. */
async function overflowOffenders(page, rootSel) {
  return page.evaluate(
    ({ rootSel, vw }) => {
      const root = document.querySelector(rootSel);
      if (!root) return ["kök yok"];
      const out = [];
      const scrollable = (el) => {
        for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
        }
        return false;
      };
      for (const el of root.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]") || el.closest("svg")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if ((r.right > vw + 1 || r.left < -1) && !scrollable(el)) {
          const txt = (el.textContent || "").trim().slice(0, 40);
          if (txt || el.tagName === "TABLE") out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} [${Math.round(r.left)}–${Math.round(r.right)}] "${txt}"`);
        }
        if (out.length > 6) break;
      }
      return out;
    },
    { rootSel, vw: width },
  );
}

(async () => {
  // Sentetik profil (yalnız yerel sahte DB) — uzun ad: başlık taşması denetimi için.
  const stamp = Date.now().toString(36);
  const label = `UAT13 Çok Uzun Danışan Adı Soyadı İkinci Soyadı ${stamp}`;
  const created = await api("/profiles", { label, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" });
  const pid = created.json.profile.id;
  // Secondary progression: yerel sahte Roxy yalnız golden hedef tarihini (2026-10-07) yankılar → API ile hesap + kayıt.
  const PROG = { technique: "western.progression", options: { targetDate: "2026-10-07", nodeType: "true" } };
  const pr = await api("/engine/run", { profileId: pid, revision: 1, selections: [PROG], confirmNewRequests: 1 });
  const prItem = pr.json?.results?.[0];
  await api("/analyses", { profileId: pid, revision: 1, technique: PROG.technique, options: prItem?.view?.options ?? PROG.options, saveRequestId: crypto.randomUUID() });

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner (yerel test)", email: "admin@yasamsistemi.com", role: "admin", membership_ends_at: null, is_demo_account: false, active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  let dialogs = 0;
  page.on("dialog", (d) => {
    console.log(`   (tarayıcı penceresi: ${d.type()} "${d.message()}" @ ${page.url()})`);
    dialogs++;
    void d.dismiss();
  });

  // ── 1) Yeni Analiz: profil seç → 5 teknik → başlat
  await page.goto("http://localhost:3931/admin", { waitUntil: "load", timeout: 120000 }).catch(() => undefined);
  await page.goto(`${BASE}#yeni-analiz`, { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill(stamp);
  await page.waitForTimeout(900);
  ok("Danışan Seç: Etkin/Arşivli düğmesi yok (tek liste)", (await page.locator("[data-testid=atlas-client-panel] button[aria-pressed]").count()) === 0);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
  await page.waitForTimeout(1200);
  const nameBox = await page.locator("[data-testid=atlas-client-name]").boundingBox();
  ok("uzun danışan adı satıra geçer (taşmaz)", !!nameBox && nameBox.x + nameBox.width <= width + 1, JSON.stringify(nameBox));
  for (const id of ["western.natal", "western.transit", "western.forecast", "western.solar_return", "western.astrocartography"]) {
    await page.locator(`button[data-technique='${id}']`).first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
  const h0 = hits();
  await page.locator("[data-testid=astro-run]").click();
  await page.waitForSelector("[data-testid=astro-desk-save]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  const saveBtn = page.locator("[data-testid=astro-desk-save]").first();
  ok("tek kayıt düğmesi: 'Tümünü Kaydet (5)'", /Tümünü Kaydet \(5\)/.test(await saveBtn.innerText()), await saveBtn.innerText());
  const sb = await saveBtn.boundingBox();
  ok("kayıt düğmesi ilk ekranda görünür (üstte)", !!sb && sb.y >= 0 && sb.y + sb.height <= height, JSON.stringify(sb));
  ok("ikinci kayıt formu / 'Kaydet' sekmesi yok", (await page.getByRole("tab", { name: /^Kaydet$/ }).count()) === 0 && (await page.locator("text=Sistem yorumunu analize ayrı katman olarak dahil et").count()) === 0);
  if (mobile) {
    const tiles = page.locator("[data-testid=astro-result-tabs-mobile] [data-tab-key-m]");
    ok("mobil: 5 açık analiz kutucuğu görünür (4 + 'Tümünü göster')", (await tiles.count()) === 4 && (await page.locator("[data-testid=astro-result-tabs-more]").isVisible()), `kutucuk ${await tiles.count()}`);
    await page.locator("[data-testid=astro-result-tabs-more]").click();
    ok("mobil: 'Tümünü göster' ile 5 kutucuk", (await tiles.count()) === 5);
    const closeBtns = page.locator("[data-testid=astro-result-tabs-mobile] [data-tab-close-m]");
    const cb = await closeBtns.first().boundingBox();
    ok("mobil: kapatma (×) ayrık ve ≥40 px dokunma alanı", !!cb && cb.width >= 38 && cb.height >= 40, JSON.stringify(cb));
  }
  ok("sonuç ekranında yatay taşma yok", (await overflowOffenders(page, "[data-testid=astro-result-view]")).length === 0, (await overflowOffenders(page, "[data-testid=astro-result-view]")).join(" | "));

  // ── 2) Transit sekmesi: tablo/kart taşmaz
  const transitTab = mobile ? page.locator("[data-testid=astro-result-tabs-mobile] [data-tab-key-m^='western.transit']") : page.locator("[data-tab-key^='western.transit']");
  await transitTab.first().click();
  await page.waitForTimeout(800);
  if (mobile) ok("mobil transit açıları bilgi kartı olarak (sütun kesilmez)", (await page.locator("[data-testid=astro-transit-cards] li").count()) > 0);
  ok("transit ekranında sessiz kesilme yok", (await overflowOffenders(page, "[data-testid=astro-result-view]")).length === 0, (await overflowOffenders(page, "[data-testid=astro-result-view]")).join(" | "));
  // ── 3) Kendi Yorumum taslağı → geri tuşu uyarısı (görünüm kaybı)
  await page.getByRole("tab", { name: /Kendi Yorumum/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator("textarea:visible").first().fill("Taslak yorum — kaydedilmedi");
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForTimeout(800);
  const dlg = page.locator("[data-testid=atlas-unsaved-dialog]");
  ok("Android geri: taslak varken uyarı çıkar", await dlg.isVisible());
  ok("uyarı metni birebir", (await page.locator("[data-testid=atlas-unsaved-message]").innerText()).trim() === "Kaydedilmemiş değişiklikleriniz var. Kaydetmeden çıkmak istiyor musunuz?");
  ok("seçenekler: Çalışmaya Devam Et / Kaydetmeden Çık", (await page.locator("[data-testid=atlas-unsaved-stay]").innerText()) === "Çalışmaya Devam Et" && (await page.locator("[data-testid=atlas-unsaved-discard]").innerText()) === "Kaydetmeden Çık");
  await page.locator("[data-testid=atlas-unsaved-stay]").click();
  await page.waitForTimeout(500);
  ok("Çalışmaya Devam Et: sonuç ekranında kalınır, taslak durur", page.url().includes("#analiz-sonucu") && (await page.locator("textarea:visible").first().inputValue()) === "Taslak yorum — kaydedilmedi");
  await page.locator("textarea:visible").first().fill("");
  await page.waitForTimeout(300);

  // ── 4) Toplu kayıt: 5 analiz; 2. kayıt ağ hatası (kısmi başarısızlık) → güvenli yeniden deneme
  const rowsBefore = (await rest(`astro_analyses?select=id&profile_id=eq.${pid}`)).length;
  let n = 0;
  await page.route("**/api/admin/astroloji/analyses", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    n++;
    if (n === 2) return r.abort("failed"); // istek hiç ulaşmadı
    if (n === 4) {
      // sunucu KAYDETTİ ama yanıt kayboldu → istemci başarısız görür; yeniden deneme aynı kimlikle "reused" almalı
      const resp = await r.fetch();
      await resp.body();
      return r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ ok: false, code: "GATEWAY", error: "Test: yanıt kayboldu" }) });
    }
    return r.continue();
  });
  await saveBtn.click();
  await page.waitForSelector("[data-testid=atlas-save-batch]");
  ok("kayıt penceresi: '5 analizden 5'i kaydedilecek'", /5 analizden 5'i kaydedilecek/.test(await page.locator("[data-testid=atlas-save-batch] h3").innerText()), await page.locator("[data-testid=atlas-save-batch] h3").innerText());
  const cb2 = await page.locator("[data-testid=atlas-save-batch-confirm]").boundingBox();
  ok("onay düğmesi ekranda görünür (sayfa altına gizlenmez)", !!cb2 && cb2.y + cb2.height <= height && cb2.y >= 0, JSON.stringify(cb2));
  const h1 = hits();
  await page.locator("[data-testid=atlas-save-batch-confirm]").click();
  await page.waitForSelector("[data-testid=atlas-save-batch-summary]", { timeout: 60000 });
  const sum1 = await page.locator("[data-testid=atlas-save-batch-summary]").innerText();
  ok("kısmi başarısızlık açıkça: '3 analiz kaydedildi, 2 analiz kaydedilemedi'", /3 analiz kaydedildi, 2 analiz kaydedilemedi/.test(sum1), sum1);
  const mid = (await rest(`astro_analyses?select=id&profile_id=eq.${pid}`)).length - rowsBefore;
  ok("DB: 4 kayıt (biri yanıtı kaybolmuş ama kaydedilmiş)", mid === 4, `${mid}`);
  await page.locator("[data-testid=atlas-save-batch-confirm]").click(); // Başarısızları yeniden dene
  await page.waitForTimeout(500);
  await page.waitForFunction(() => /2 analiz başarıyla kaydedildi/.test(document.querySelector("[data-testid=atlas-save-batch-summary]")?.textContent ?? ""), null, { timeout: 60000 });
  ok("yeniden deneme: '2 analiz başarıyla kaydedildi'", true);
  ok("yeniden denemede 'zaten kayıtlıydı (mükerrer yok)' satırı", (await page.locator("text=Zaten kayıtlıydı").count()) === 1);
  const after = (await rest(`astro_analyses?select=id,technique&profile_id=eq.${pid}`));
  ok("DB: tam 5 ayrı analiz, mükerrer yok", after.length - rowsBefore === 5 && new Set(after.map((x) => x.technique)).size === after.length, `${after.length - rowsBefore} kayıt`);
  if (LOG) ok("kayıt sırasında 0 Roxy isteği", hits() === h1, `${h1} → ${hits()}`);
  await page.unroute("**/api/admin/astroloji/analyses");
  await page.getByRole("button", { name: "Kapat" }).last().click();
  await page.waitForTimeout(600);
  ok("yeşil bildirim görünür", /analiz başarıyla kaydedildi/.test(await page.locator("[data-testid=astro-saved-notice]").innerText()));
  ok("kayıttan sonra ikinci kayıt formu yok; 'Kayıtlı analizi aç' var", (await page.locator("[data-testid=astro-open-saved]").count()) > 0 && (await page.locator("[data-testid=astro-desk-save]").count()) === 0);

  // ── 5) Teknik Ekle: çoklu seçim + ayarları kapatıp listeye dönme
  await page.locator("[data-testid=atlas-add-technique-btn]").first().click();
  await page.waitForSelector("[data-testid=atlas-add-technique]");
  await page.locator("[data-add-technique='western.synastry']").click();
  await page.locator("[data-add-settings='western.synastry']").click();
  await page.waitForTimeout(300);
  ok("ayar paneli açılır", await page.locator("[data-testid=atlas-add-params]").isVisible());
  if (mobile) ok("mobil: ayarlar listenin YERİNE açılır (üst üste binmez)", !(await page.locator("[data-add-technique='western.forecast']").isVisible()));
  await page.locator("[data-testid=atlas-add-close-settings]").click();
  await page.waitForTimeout(300);
  ok("'Ayarları Kapat / Listeye Dön' pencereyi kapatmaz, liste görünür", (await page.locator("[data-testid=atlas-add-technique]").isVisible()) && (await page.locator("[data-add-technique='western.forecast']").isVisible()));
  await page.locator("[data-add-technique='western.synastry']").click(); // seçimi kaldır
  await page.locator("[data-add-system='vedic']").click();
  for (const id of ["vedic.d1", "vedic.panchanga", "vedic.shadbala"]) await page.locator(`[data-add-technique='${id}']`).click();
  await page.locator("[data-add-system='kp']").click();
  await page.locator("[data-add-technique='kp.chart']").click();
  await page.waitForTimeout(1800);
  const planTxt = await page.locator("[data-testid=atlas-add-plan]").innerText();
  ok("çoklu seçim: 4 teknik + toplam yeni istek / hazır sonuç görünür", /4 teknik seçildi/.test(planTxt) && /yeni sağlayıcı isteği/.test(planTxt), planTxt.replace(/\s+/g, " "));
  const newReq = Number(await page.locator("[data-testid=atlas-add-newreq]").innerText());
  const h2 = hits();
  await page.locator("[data-testid=atlas-add-run]").click();
  await page.waitForSelector("[data-testid=atlas-add-technique]", { state: "detached", timeout: 90000 });
  await page.waitForTimeout(1000);
  if (LOG) ok("ücretli önizleme = gerçekte gönderilen istek sayısı", hits() - h2 === newReq, `önizleme ${newReq} · gönderilen ${hits() - h2}`);
  const addSave = await page.locator("[data-testid=astro-desk-save]").first().innerText().catch(() => "");
  ok("Teknik Ekle sonrası 4 kaydedilmemiş analiz", /Tümünü Kaydet \(4\)/.test(addSave), addSave);
  // Transit takvimi kartları
  const fcTab = mobile ? page.locator("[data-testid=astro-result-tabs-mobile] [data-tab-key-m^='western.forecast']") : page.locator("[data-tab-key^='western.forecast']");
  if (mobile && !(await fcTab.first().isVisible())) await page.locator("[data-testid=astro-result-tabs-more]").click();
  await fcTab.first().click();
  await page.waitForTimeout(800);
  if (mobile) ok("mobil Transit Takvimi olay kartları", (await page.locator("[data-testid=astro-forecast-cards] li").count()) > 0);
  ok("Transit Takvimi ekranında sessiz kesilme yok", (await overflowOffenders(page, "[data-testid=astro-result-view]")).length === 0, (await overflowOffenders(page, "[data-testid=astro-result-view]")).join(" | "));

  // ── 6) Geri tuşu: modül içi görünümler sonucu kaybettirmez; modülden çıkışta uyarı (4 kaydedilmemiş analiz)
  await page.goBack();
  await page.waitForTimeout(800);
  ok("geri (sonuç → Yeni Analiz) uyarısız; sonuçlar kaybolmaz", !(await dlg.isVisible()) && page.url().includes("#yeni-analiz"));
  await page.goBack();
  await page.waitForTimeout(1000);
  ok("geri (modülden çıkış) → uyarı", await dlg.isVisible());
  const det = await page.locator("[data-testid=atlas-unsaved-details]").innerText().catch(() => "");
  ok("uyarı ayrıntısı: 4 kaydedilmemiş analiz", /4 hesaplanmış ama Analiz Arşivi'ne kaydedilmemiş analiz/.test(det), det);
  ok("'Kaydet ve Çık (4)' sunulur", /Kaydet ve Çık \(4\)/.test(await page.locator("[data-testid=atlas-unsaved-save-leave]").innerText().catch(() => "")));
  await page.locator("[data-testid=atlas-unsaved-stay]").click();
  await page.waitForTimeout(600);
  ok("Çalışmaya Devam Et → modülde kalınır", page.url().startsWith(BASE));
  // Sonuca dön ve "Kaydet ve Çık"
  await page.goBack();
  await page.waitForTimeout(1000);
  const h3 = hits();
  const before2 = (await rest(`astro_analyses?select=id&profile_id=eq.${pid}`)).length;
  await page.locator("[data-testid=atlas-unsaved-save-leave]").click();
  await page.waitForTimeout(4000);
  const after2 = (await rest(`astro_analyses?select=id&profile_id=eq.${pid}`)).length;
  ok("Kaydet ve Çık: 4 analiz kaydedildi ve modülden çıkıldı", after2 - before2 === 4 && !page.url().startsWith(BASE), `+${after2 - before2} · ${page.url()}`);
  if (LOG) ok("Kaydet ve Çık 0 Roxy isteği", hits() === h3);
  ok("tarayıcı yerel onay penceresi (beforeunload) açılmadı", dialogs === 0, `${dialogs}`);

  // ── 7) Kaydedilmemiş iş yokken geri → uyarısız çıkış
  await page.goto(`${BASE}#analiz-arsivi`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.goBack();
  await page.waitForTimeout(1200);
  ok("iş yokken geri: uyarı çıkmaz", !(await dlg.isVisible().catch(() => false)));

  // ── 8) Kayıtlı analizler: Danışan Dosyası'nda 9 kayıt; aç → 0 Roxy; yorum göster/gizle; başlık taşmaz
  await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=astro-client-file-analyses]", { timeout: 60000 }).catch(async (e) => {
    await page.screenshot({ path: `${process.env.SHOT_DIR ?? "."}/uat13-fail-client-${width}.png`, fullPage: true });
    console.log("   url:", page.url(), "· gövde:", (await page.locator("main").innerText().catch(() => "")).slice(0, 300).replace(/\s+/g, " "));
    throw e;
  });
  await page.waitForTimeout(1500);
  const listed = await page.locator("[data-saved-item]").count();
  ok("Danışan Dosyası'nda 10 kayıtlı analiz (UI 9 + API progression 1)", listed === 10, `${listed}`);
  const h4 = hits();
  await page.locator("[data-saved-item]").first().click();
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
  await page.waitForTimeout(1200);
  if (LOG) ok("kayıtlı analizi açmak 0 Roxy isteği", hits() === h4);
  ok("kayıtlı analiz başlığı taşmaz", (await overflowOffenders(page, "[data-testid=astro-saved-analysis] header")).length === 0, (await overflowOffenders(page, "[data-testid=astro-saved-analysis] header")).join(" | "));
  const tog = page.locator("[data-testid=astro-saved-interp-toggle]");
  if (await tog.count()) {
    const before3 = await page.getByRole("tab").allInnerTexts();
    await tog.click();
    await page.waitForTimeout(300);
    const hidden = await page.getByRole("tab").allInnerTexts();
    await tog.click();
    await page.waitForTimeout(300);
    const shown = await page.getByRole("tab").allInnerTexts();
    ok("yorum gizle/göster: sekme kalkar ve geri gelir (veri silinmez)", hidden.length === before3.length - 1 && shown.length === before3.length, `${before3.length}/${hidden.length}/${shown.length}`);
  } else ok("yorum göster/gizle düğmesi (yorumlu kayıt)", false, "düğme yok");

  // Secondary progression kaydı: harita çizilir (mevcut veriden; 0 Roxy)
  await page.locator("[data-testid=astro-client-file-back], button[aria-label='Danışan Dosyası']").first().click().catch(() => undefined);
  await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=astro-client-file-analyses]", { timeout: 60000 });
  await page.waitForTimeout(1200);
  const h5 = hits();
  await page.locator("[data-saved-item]", { hasText: "Secondary progression" }).first().click();
  await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
  await page.waitForTimeout(1200);
  ok("Secondary progression kaydında harita çizilir", (await page.locator("[data-testid=atlas-mobile-chart] svg, [data-testid=atlas-chart-frame] svg").count()) > 0);
  if (LOG) ok("progression kaydını açmak 0 Roxy isteği", hits() === h5);

  // ── 9) Elle doğum tarihi + form çıkış koruması
  await page.goto(`${BASE}#yeni-analiz`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator("[data-testid=atlas-new-client]").click();
  const dt = page.locator("[data-testid=birth-date-text]");
  await dt.waitFor();
  ok("doğum tarihi: sayısal klavye (inputMode=numeric)", (await dt.getAttribute("inputmode")) === "numeric");
  await dt.pressSequentially("10041992");
  ok("10041992 → 10.04.1992", (await dt.inputValue()) === "10.04.1992", await dt.inputValue());
  ok("takvim senkron (gizli date = 1992-04-10)", (await page.locator("[data-testid=birth-date-picker]").inputValue()) === "1992-04-10");
  await dt.press("End");
  for (let i = 0; i < 4; i++) await dt.press("Backspace");
  ok("silme: 4 rakam geri → '10.04'", (await dt.inputValue()) === "10.04", await dt.inputValue());
  await dt.press("Backspace");
  ok("ayraç önünde silme takılmaz → '10.0'", (await dt.inputValue()) === "10.0", await dt.inputValue());
  await dt.press("Backspace");
  await dt.press("Backspace");
  ok("tamamen silinebilir → '1'", (await dt.inputValue()) === "1", await dt.inputValue());
  await dt.fill("");
  await dt.pressSequentially("29022023");
  ok("29.02.2023 → artık yıl uyarısı", /artık yıl değil/.test(await page.locator("[data-testid=birth-date-hint]").innerText()));
  await dt.fill("");
  await dt.pressSequentially("29022024");
  ok("29.02.2024 geçerli (artık yıl)", (await page.locator("[data-testid=birth-date-picker]").inputValue()) === "2024-02-29");
  await dt.fill("");
  await dt.pressSequentially("31042000");
  ok("31.04.2000 geçersiz gün", /geçersiz gün/.test(await page.locator("[data-testid=birth-date-hint]").innerText()));
  await dt.fill("");
  await dt.pressSequentially("1204");
  await dt.blur();
  ok("kısmi giriş uyarısı", /tamamlayın/.test(await page.locator("[data-testid=birth-date-hint]").innerText()));
  // Yerel takvim seçimi (gizli date alanı) — tarayıcının seçicideki "gün seçildi" olayının aynısı.
  await page.locator("[data-testid=birth-date-picker]").evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "1985-03-07");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(200);
  ok("takvimden seçim metne yansır: 07.03.1985 (gün kayması yok)", (await dt.inputValue()) === "07.03.1985", await dt.inputValue());
  await page.locator("[data-testid=atlas-profile-dialog] button[aria-label=Kapat]").click();
  await page.waitForTimeout(400);
  ok("doldurulmuş Yeni Danışan formu kapatılırken uyarı", await dlg.isVisible());
  await page.locator("[data-testid=atlas-unsaved-discard]").click();
  await page.waitForTimeout(300);
  ok("Kaydetmeden Çık → form kapanır", !(await page.locator("[data-testid=atlas-profile-dialog]").isVisible()));

  // ── 10) Bilgi Bankası taslağı + ekran değiştirme
  await page.goto(`${BASE}#bilgi-bankasi`, { waitUntil: "load" });
  await page.waitForSelector("[data-testid=astro-kb-workspace]", { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Yeni bilgi/ }).first().click();
  await page.waitForTimeout(400);
  const kbInput = page.locator("[data-testid=astro-kb-workspace] input[type=text], [data-testid=astro-kb-workspace] textarea").first();
  await kbInput.fill("Taslak Bilgi Bankası kaydı");
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(800);
  ok("Bilgi Bankası taslağı varken geri → uyarı", await dlg.isVisible());
  await page.locator("[data-testid=atlas-unsaved-stay]").click();

  // ── 11) Kalıcı silme (B) → Danışan Seç listesinden düşer, yenilemeden sonra da yok
  const tmp = await api("/profiles", { label: `UAT13 Silinecek ${stamp}`, birthDate: "1991-01-01", birthTime: "10:00", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" });
  const tmpId = tmp.json.profile.id;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.goto(`${BASE}#yeni-analiz`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  ok("Bilgi Bankası taslağı varken başka ekrana geçiş → uyarı", await dlg.isVisible().catch(() => false));
  if (await dlg.isVisible().catch(() => false)) await page.locator("[data-testid=atlas-unsaved-discard]").click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Silinecek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${tmpId}"]`).click();
  await page.waitForTimeout(1000);
  await page.locator("[data-testid=atlas-delete-profile]").click();
  await page.waitForSelector("[data-testid=astro-archive-delete-flow]");
  await page.locator("[data-testid=astro-delete-option-b]").click();
  await page.waitForTimeout(800);
  await page.locator("[data-testid=astro-archive-delete-flow] button", { hasText: /Devam|İleri/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(500);
  await page.locator("[data-testid=astro-archive-delete-flow] button", { hasText: /SİL|Kalıcı olarak sil|Sil/ }).last().click();
  await page.waitForSelector("[data-testid=astro-archive-delete-done]", { timeout: 30000 }).catch(() => undefined);
  ok("B silme: başarı yalnız sunucu doğrulamasından sonra", await page.locator("[data-testid=astro-archive-delete-done]").isVisible());
  ok("DB: profil silindi", (await rest(`astro_birth_profiles?select=id&id=eq.${tmpId}`)).length === 0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Silinecek");
  await page.waitForTimeout(1000);
  ok("silinen kişi Danışan Seç'te yok", (await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${tmpId}"]`).count()) === 0);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Silinecek");
  await page.waitForTimeout(1000);
  ok("yenilemeden sonra da yok", (await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${tmpId}"]`).count()) === 0);

  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\n${pass} PASS / ${fail} FAIL (${width}×${height}${mobile ? " mobil emülasyon" : ""}) · profil ${pid}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("HATA", e);
  process.exit(2);
});
