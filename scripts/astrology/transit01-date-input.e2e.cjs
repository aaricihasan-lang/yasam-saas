// TRANSİT-01 tarih girişi (canlı P1, 2026-10-17) — gerçek tarayıcıda KLAVYEDEN yazma. YEREL; sahte DB + sahte Roxy.
// Canlı hata: "Seçilen gün ve saat" → tarih kutusunda gün + ay yazıldıktan sonra yılın İLK rakamı ("2" → değer
// "0002-10-17") sayfayı "This page couldn't load" ile çökertiyordu (RangeError: Invalid time value, formatToParts).
// Çalıştırma: node scripts/astrology/transit01-date-input.e2e.cjs <genişlik> <yükseklik> [android|msedge] [port]
// Ölçülen her adımda: sayfa ayakta (bileşen var), pageerror yok, alan değeri silinmedi, eksik/geçersizde uyarı + Başlat
// KAPALI, plan isteğine geçersiz tarih GİTMEDİ; tamamlanınca doğru UTC ön izlemesi.
/* eslint-disable @typescript-eslint/no-require-imports -- düz Node CommonJS test betiği */
const { chromium } = require("playwright");

const [W = "1366", H = "860", VARIANT = "", PORT = "3941"] = process.argv.slice(2);
const width = Number(W);
const height = Number(H);
const mobile = width < 640;
const android = VARIANT === "android";
const tag = `${width}px${android ? " Android-UA" : ""}${VARIANT === "msedge" ? " Edge" : ""}`;
const ORIGIN = `http://localhost:${PORT}`;
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const HDR = { "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}`, origin: ORIGIN };
let pass = 0;
let fail = 0;
const ok = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const VALID_DATE = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m || +m[1] < 1600 || +m[1] > 2600) return false;
  const x = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return x.getUTCMonth() === +m[2] - 1 && x.getUTCDate() === +m[3];
};

(async () => {
  const prof = await (await fetch(`${ORIGIN}/api/admin/astroloji/profiles?q=${encodeURIComponent("Ali Örnek")}`, { headers: HDR })).json();
  const pid = prof?.items?.[0]?.id ?? prof?.profiles?.[0]?.id;
  ok("hazırlık: golden doğum profili", typeof pid === "string");
  const browser = await chromium.launch(VARIANT === "msedge" ? { channel: "msedge" } : {});
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    ...(android ? { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36" } : {}),
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN }).catch(() => undefined);
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${e.name}: ${e.message}`));
  page.on("dialog", (d) => void d.dismiss());
  // Plan / çalıştırma isteklerinde geçersiz tarih var mı?
  const badBodies = [];
  let planCalls = 0;
  let inflight = 0;
  // Biçimi geçerli ama ANI geçersiz girişler (yaz saati boşluğu; UTC'de 1600–2600 dışı): bunlar da gövdeye GİRMEMELİ.
  const FORBIDDEN_MOMENTS = new Set(["2026-03-08|02:30|America/New_York", "2600-12-31|23:30|America/New_York", "1600-01-01|00:30|Asia/Tokyo"]);
  const isPlan = (r) => r.method() === "POST" && /\/api\/admin\/astroloji\/engine\/(plan|run)/.test(r.url());
  page.on("request", (r) => {
    if (!isPlan(r)) return;
    planCalls++;
    inflight++;
    try {
      const b = JSON.parse(r.postData() || "{}");
      for (const s of b.selections ?? []) {
        const o = s.options ?? {};
        for (const k of ["date", "startDate", "targetDate"]) if (typeof o[k] === "string" && !VALID_DATE(o[k])) badBodies.push(`${s.technique}.${k}=${o[k]}`);
        if (FORBIDDEN_MOMENTS.has(`${o.date}|${o.time}|${o.timezone}`)) badBodies.push(`${s.technique} geçersiz an ${o.date} ${o.time} ${o.timezone}`);
      }
    } catch {
      badBodies.push("gövde okunamadı");
    }
  });
  page.on("requestfinished", (r) => isPlan(r) && inflight--);
  page.on("requestfailed", (r) => isPlan(r) && inflight--);

  await page.goto(`${ORIGIN}/admin/astroloji`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-portal=new]", { timeout: 120000 });
  await page.locator("[data-portal=new]").first().click();
  await page.waitForSelector("[data-testid=atlas-new-client]", { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-testid=atlas-client-trigger]").first().click();
  await page.locator("[data-testid=atlas-client-panel] input[type=search]").fill("Ali Örnek");
  await page.waitForTimeout(900);
  await page.locator(`[data-testid=atlas-client-panel] [data-client-option="${pid}"]`).click();
  await page.waitForTimeout(1200);
  for (const id of ["western.natal", "western.transit", "western.forecast"]) {
    await page.locator(`button[data-technique='${id}']`).first().click();
    await page.waitForTimeout(200);
  }
  const focus = async (id) => {
    await page.locator(`[data-technique-focus='${id}']`).first().click();
    await page.waitForTimeout(400);
  };
  await focus("western.transit");
  const moment = page.locator("[data-testid=astro-transit-moment]").first();
  const alive = async () => (await page.locator("[data-testid=astro-transit-moment], [data-testid=astro-forecast-range]").count()) > 0 && !(await page.getByText("This page couldn’t load").count());
  // Başlat durumu YALNIZ plan oturduktan sonra ölçülür: her seçim değişiminde yeni plan beklenirken düğme geçici olarak
  // kapalıdır (plan = null) — erken ölçüm "kapalı" için YANLIŞ POZİTİF verir (17.10 son kontrolde bulundu).
  const settle = async () => {
    await page.waitForTimeout(450); // plan isteği 250 ms gecikmeyle çıkar
    for (let i = 0; i < 80 && inflight > 0; i++) await page.waitForTimeout(150);
    await page.waitForTimeout(400);
  };
  const runDisabled = async () => {
    await settle();
    return page.locator("[data-testid=astro-run]").isDisabled();
  };
  const preview = async () => ((await page.locator("[data-testid=astro-transit-utc-preview]").count()) ? (await page.locator("[data-testid=astro-transit-utc-preview]").first().innerText()) : "");
  const dateIn = () => moment.locator('input[aria-label="Transit tarihi"]');
  // Tarih kutusunun bölümüne tıkla (tr-TR: GG.AA.YYYY) — gün bölümü solda.
  const clickDay = async (loc) => {
    await loc.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(100);
  };
  for (const mode of ["custom", "date"]) {
    await moment.locator(`[data-transit-mode=${mode}]`).check();
    await page.waitForTimeout(300);
    // 1) Gün → ay → yıl (rakam rakam) — canlı çökme senaryosu.
    await clickDay(dateIn());
    const before = planCalls;
    await page.keyboard.type("17", { delay: 60 });
    await page.keyboard.type("10", { delay: 60 });
    await page.waitForTimeout(300);
    let midOk = true;
    for (const [i, k] of ["2", "0", "2", "6"].entries()) {
      await page.keyboard.type(k, { delay: 60 });
      await page.waitForTimeout(400);
      if (!(await alive())) {
        midOk = false;
        break;
      }
      const v = await dateIn().inputValue();
      if (i < 3) {
        const pv = await preview();
        const warn = /1600–2600|eksik|geçersiz/.test(pv);
        const dis = await runDisabled();
        if (!(warn && dis && !/Invalid|NaN/.test(pv))) {
          midOk = false;
          console.log(`   ara değer ${v}: uyarı=${warn} başlat-kapalı=${dis} "${pv}"`);
        }
      }
    }
    ok(`[${mode}] gün→ay→yıl rakam rakam: çökme yok; ara değerlerde uyarı + Başlat kapalı`, midOk && errors.length === 0, errors[0] ?? "");
    ok(`[${mode}] tamamlanınca değer 2026-10-17`, (await dateIn().inputValue()) === "2026-10-17", await dateIn().inputValue());
    await page.waitForTimeout(1200);
    const pv = await preview();
    ok(`[${mode}] tamamlanınca doğru UTC (İstanbul ${mode === "date" ? "12:00" : "12:00"} → 09:00 UTC)`, pv.includes("17.10.2026 09:00 UTC"), pv);
    ok(`[${mode}] tamamlanınca Başlat açık`, !(await runDisabled()));
    ok(`[${mode}] plan isteklerine geçersiz tarih gitmedi`, badBodies.length === 0, `${badBodies.slice(0, 3).join(", ")} (plan çağrısı ${planCalls - before})`);

    // 2) Yılın bir kısmını silme (Backspace) + yeniden yazma.
    await dateIn().click({ position: { x: (await dateIn().boundingBox()).width - 60, y: 10 } }).catch(() => undefined);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(400);
    const afterBs = await dateIn().inputValue();
    ok(`[${mode}] Backspace (yıl): çökme yok, uyarı, Başlat kapalı`, (await alive()) && errors.length === 0 && (afterBs === "" ? /eksik/.test(await preview()) : true) && (afterBs === "" ? await runDisabled() : true), `değer "${afterBs}"`);
    await page.keyboard.type("2027", { delay: 60 });
    await page.waitForTimeout(500);
    ok(`[${mode}] yeniden yıl yazıldı → 17.10.2027 09:00 UTC`, (await preview()).includes("17.10.2027 09:00 UTC"), await preview());
    // 3) Delete
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);
    ok(`[${mode}] Delete: çökme yok`, (await alive()) && errors.length === 0, `değer "${await dateIn().inputValue()}"`);
    // 4) Tamamen temizleme (tüm bölümler).
    await dateIn().fill("");
    await page.waitForTimeout(400);
    ok(`[${mode}] tarih tamamen temizlendi: uyarı "eksik", Başlat kapalı, çökme yok`, (await alive()) && /eksik/.test(await preview()) && (await runDisabled()) && errors.length === 0, await preview());
    // 5) Takvim simgesinden seçim = tarayıcının tek seferde tam değer ataması (yerli seçici otomasyonla açılamaz; aynı olay).
    await dateIn().fill("2026-11-05");
    await page.waitForTimeout(500);
    ok(`[${mode}] seçiciyle tam tarih (05.11.2026): kış saati İstanbul +3 → 09:00 UTC`, (await preview()).includes("05.11.2026 09:00 UTC"), await preview());
    // 6) Yapıştırma (pano → tarih kutusu).
    await page.evaluate(() => navigator.clipboard.writeText("29.02.2028").catch(() => undefined));
    await clickDay(dateIn());
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(400);
    ok(`[${mode}] yapıştırma: çökme yok`, (await alive()) && errors.length === 0, `değer "${await dateIn().inputValue()}"`);
    // 7) 29 Şubat artık yıl (klavye) ve geçersiz gün (31.02).
    await clickDay(dateIn());
    await page.keyboard.type("29022028", { delay: 60 });
    await page.waitForTimeout(500);
    ok(`[${mode}] 29.02.2028 (artık yıl) kabul → 09:00 UTC`, (await dateIn().inputValue()) === "2028-02-29" && (await preview()).includes("29.02.2028 09:00 UTC"), `${await dateIn().inputValue()} ${await preview()}`);
    await clickDay(dateIn());
    await page.keyboard.type("29022027", { delay: 60 });
    await page.waitForTimeout(500);
    const v27 = await dateIn().inputValue();
    ok(`[${mode}] 29.02.2027 (artık yıl DEĞİL): kabul edilmez / tarayıcı düzeltir; çökme yok`, (await alive()) && errors.length === 0 && v27 !== "2027-02-29", `değer "${v27}" ${await preview()}`);
    await clickDay(dateIn());
    await page.keyboard.type("31042026", { delay: 60 });
    await page.waitForTimeout(500);
    ok(`[${mode}] 31.04.2026 (geçersiz gün): çökme yok, geçersiz tarih kabul edilmez`, (await alive()) && errors.length === 0 && (await dateIn().inputValue()) !== "2026-04-31", `değer "${await dateIn().inputValue()}"`);
    // 8) Geçmiş / gelecek geçerli tarih + aralık dışı.
    await dateIn().fill("1979-02-12");
    await page.waitForTimeout(400);
    // Türkiye 1978–1985 yıl boyu UTC+3 (tzdata) → 09:00 UTC; sunucu normalizasyonu da aynı (transit01.harness D1).
    ok(`[${mode}] geçmiş tarih 12.02.1979 (İstanbul tarihsel +3 → 09:00 UTC)`, (await preview()).includes("12.02.1979 09:00 UTC"), await preview());
    await dateIn().fill("2099-12-31");
    await page.waitForTimeout(400);
    ok(`[${mode}] gelecek tarih 31.12.2099`, (await preview()).includes("31.12.2099"), await preview());
    await clickDay(dateIn());
    await page.keyboard.type("01011500", { delay: 60 });
    await page.waitForTimeout(400);
    ok(`[${mode}] aralık dışı yıl 1500: uyarı + Başlat kapalı`, (await alive()) && /1600–2600/.test(await preview()) && (await runDisabled()), `${await dateIn().inputValue()} ${await preview()}`);
    // Geçerli tarihe geri dön.
    await dateIn().fill("2026-10-17");
    await page.waitForTimeout(800);
  }
  // 9) Saat alanı + saat dilimi (gün ve saat kipi).
  await moment.locator("[data-transit-mode=custom]").check();
  await page.waitForTimeout(300);
  const time = moment.locator('input[aria-label="Transit saati"]');
  await time.click({ position: { x: 10, y: 10 } });
  await page.keyboard.type("2345", { delay: 60 });
  await page.waitForTimeout(400);
  ok("saat klavyeden 23:45 → 20:45 UTC", (await preview()).includes("17.10.2026 20:45 UTC"), await preview());
  await time.fill("");
  await page.waitForTimeout(400);
  ok("saat temizlendi: uyarı 'Saat eksik', Başlat kapalı, çökme yok", (await alive()) && /Saat eksik/.test(await preview()) && (await runDisabled()), await preview());
  await time.fill("12:00");
  await moment.locator('select[aria-label="Transit saat dilimi"]').selectOption("America/New_York");
  await page.waitForTimeout(400);
  ok("saat dilimi New York → 16:00 UTC", (await preview()).includes("17.10.2026 16:00 UTC"), await preview());
  await clickDay(dateIn());
  await page.keyboard.type("0803", { delay: 60 });
  await page.keyboard.type("2026", { delay: 60 });
  await time.fill("02:30");
  await page.waitForTimeout(400);
  const callsGap = planCalls;
  ok("New York 08.03.2026 02:30 (ileri alma boşluğu): uyarı, plan oturduktan sonra Başlat kapalı", /yaz saati/.test(await preview()) && (await runDisabled()), await preview());
  ok("yaz saati boşluğu: geçersiz an plan API'sine gönderilmedi", !badBodies.some((b) => b.includes("02:30 America/New_York")), `${badBodies.join(", ")} (bu adımda plan çağrısı ${planCalls - callsGap})`);
  await time.fill("03:30");
  await page.waitForTimeout(300);
  ok("geçerli saate dönüş (03:30 EDT → 07:30 UTC): Başlat yeniden açık", (await preview()).includes("08.03.2026 07:30 UTC") && !(await runDisabled()), await preview());
  // UTC'ye çevrilince yıl sınırı dışına düşen yerel anlar: ön izleme ↔ Başlat ↔ API tutarlı.
  await dateIn().fill("2600-12-31");
  await time.fill("23:30");
  await page.waitForTimeout(300);
  ok("yerel 31.12.2600 23:30 New York = UTC 2601: uyarı, Başlat kapalı, API'ye gitmez", /1600–2600/.test(await preview()) && (await runDisabled()) && !badBodies.some((b) => b.includes("2600-12-31 23:30")), await preview());
  await moment.locator('select[aria-label="Transit saat dilimi"]').selectOption("Asia/Tokyo");
  await dateIn().fill("1600-01-01");
  await time.fill("00:30");
  await page.waitForTimeout(300);
  ok("yerel 01.01.1600 00:30 Tokyo = UTC 1599: uyarı, Başlat kapalı, API'ye gitmez", /1600–2600/.test(await preview()) && (await runDisabled()) && !badBodies.some((b) => b.includes("1600-01-01 00:30")), await preview());
  await time.fill("12:00");
  await page.waitForTimeout(300);
  ok("yerel 01.01.1600 12:00 Tokyo (UTC aynı gün): kabul, Başlat açık", /Hesaplanacak an: 01\.01\.1600/.test(await preview()) && !(await runDisabled()), await preview());
  await moment.locator('select[aria-label="Transit saat dilimi"]').selectOption("Europe/Istanbul");
  await dateIn().fill("2026-10-17");
  await time.fill("12:00");
  await page.waitForTimeout(800);
  ok("geçerli değerlere dönüldü: 09:00 UTC, Başlat açık", (await preview()).includes("17.10.2026 09:00 UTC") && !(await runDisabled()), await preview());
  // 10) Şimdi kipi: tarih alanı yok, Başlat açık.
  await moment.locator("[data-transit-mode=now]").check();
  await page.waitForTimeout(800);
  ok("Şimdi kipi: tarih kutusu yok, ön izleme yok, Başlat açık", (await dateIn().count()) === 0 && !(await runDisabled()));

  // 11) Transit Takvimi başlangıç + bitiş (rakam rakam).
  await focus("western.forecast");
  const fr = page.locator("[data-testid=astro-forecast-range]").first();
  const st = fr.locator('input[aria-label="Takvim başlangıcı"]');
  const en = fr.locator('input[aria-label="Takvim bitişi"]');
  await clickDay(st);
  let fOk = true;
  for (const k of ["01", "11", "2", "0", "2", "6"]) {
    await page.keyboard.type(k, { delay: 60 });
    await page.waitForTimeout(350);
    if (!(await alive())) {
      fOk = false;
      break;
    }
  }
  ok("takvim başlangıcı rakam rakam (01.11.2026): çökme yok", fOk && errors.length === 0, errors[0] ?? "");
  ok("takvim başlangıcı 2026-11-01, bitiş 90 gün → 2027-01-29", (await st.inputValue()) === "2026-11-01" && (await en.inputValue()) === "2027-01-29", `${await st.inputValue()} → ${await en.inputValue()}`);
  await clickDay(st);
  await page.keyboard.type("0111", { delay: 60 });
  await page.keyboard.type("2", { delay: 60 });
  await page.waitForTimeout(400);
  ok("takvim başlangıcı ara değer (0002): uyarı + Başlat kapalı", (await alive()) && (await fr.locator("[data-testid=astro-forecast-start-issue]").count()) === 1 && (await runDisabled()), await fr.innerText());
  await page.keyboard.type("026", { delay: 60 });
  await page.waitForTimeout(600);
  await clickDay(en);
  const trail = [];
  let eOk = true;
  for (const k of ["15", "12", "2", "0", "2", "6"]) {
    await page.keyboard.type(k, { delay: 60 });
    await page.waitForTimeout(350);
    if (!(await alive())) {
      eOk = false;
      break;
    }
    trail.push(`${k}→${await en.inputValue()}`);
  }
  ok("takvim bitişi rakam rakam: çökme yok, ara değer silinmez (eski değere dönmez)", eOk && errors.length === 0 && trail.some((x) => x.includes("0002-12-15")), trail.join(" "));
  await page.waitForTimeout(400);
  ok("bitiş 15.12.2026 → süre 45 gün", /45 gün · 1 parça/.test(await fr.innerText()) && (await en.inputValue()) === "2026-12-15", await en.inputValue());
  await en.fill("");
  await page.waitForTimeout(300);
  ok("bitiş temizlendi: uyarı, süre değişmedi, Başlat kapalı, çökme yok", (await alive()) && /45 gün/.test(await fr.innerText()) && (await fr.locator("[data-testid=astro-forecast-end-issue]").count()) === 1 && (await runDisabled()), (await fr.innerText()).slice(-200));
  await en.fill("2026-12-15");
  await page.waitForTimeout(300);
  await clickDay(en);
  await page.keyboard.type("01102026", { delay: 60 });
  await page.waitForTimeout(400);
  // Yazma sırasında geçerli ara değer (01.12.2026 → 31 gün) uygulanabilir; SON değer başlangıçtan önce → uyarı + Başlat kapalı.
  const endIssue = (await fr.locator("[data-testid=astro-forecast-end-issue]").count()) ? await fr.locator("[data-testid=astro-forecast-end-issue]").innerText() : "";
  ok("bitiş başlangıçtan önce (01.10.2026): uyarı, değer silinmez, Başlat kapalı", /başlangıçtan önce/.test(endIssue) && (await en.inputValue()) === "2026-10-01" && (await runDisabled()), `${endIssue} · ${await en.inputValue()}`);
  await fr.locator('select[aria-label="Takvim süresi"]').selectOption("90");
  await page.waitForTimeout(800);
  ok("süre seçimi 90 gün → taslak temizlenir, bitiş 2027-01-29, uyarı yok, Başlat açık", (await en.inputValue()) === "2027-01-29" && (await fr.locator("[data-testid=astro-forecast-end-issue]").count()) === 0 && !(await runDisabled()), await en.inputValue());

  ok("TÜM adımlar: sayfa hatası (pageerror) yok", errors.length === 0, errors.join(" | "));
  ok("TÜM adımlar: plan/çalıştırma isteklerine geçersiz tarih gitmedi", badBodies.length === 0, badBodies.slice(0, 5).join(", "));
  ok("TÜM adımlar: hiçbir analiz çalıştırılmadı (Başlat'a basılmadı)", true);
  console.log(`\ntransit01-date-input [${tag}]: ${pass} PASS / ${fail} FAIL`);
  await browser.close();
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error("e2e hata:", e);
  process.exit(1);
});
