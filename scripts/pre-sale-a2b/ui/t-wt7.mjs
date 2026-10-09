// WT7 — Danışan: toplu Word tek dinamik buton + gerçek "Tümünü Seç" + Ücret Alınmadı rozeti +
// ödeme durumu (zorunlu seçim / Ödendi işaretle / eski kayıt) + ödev "Kaç gün sonra?". Mobil + web.
import { newPage, makeUser, BASE, ok, sleep } from "./ui-lib.mjs";

const TA = "aaaaaaaa-0000-4000-8000-00000000000a";
const mkClient = (i) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, "0")}`,
  ad: i % 2 ? `Ayşe${i}` : `Mehmet${i}`, soyad: `Çiğdem${i}`, telefon: `0555${i}`,
  tenant_id: TA, created_at: new Date(Date.UTC(2026, 8, 1) - i * 60_000).toISOString(), gorusme: null,
});
const ALL = Array.from({ length: 45 }, (_, i) => mkClient(i + 1));
const UNPAID_ID = ALL[0].id; // Ayşe1 → ödenmemiş var
// ALL[1] (Mehmet2) → yalnız eski (NULL) kayıt → rozet YOK (charges-unpaid mock'unda yok)

function listRoutes(extra = []) {
  return [
    ...extra,
    ["GET", /^\/api\/clients\?/, (_r, url) => {
      const limit = Number(url.searchParams.get("limit") || 30);
      const offset = Number(url.searchParams.get("offset") || 0);
      return { status: 200, json: { ok: true, clients: ALL.slice(offset, offset + limit), count: ALL.length } };
    }],
    ["GET", /^\/api\/clients\/homeworks-alerts/, () => ({ status: 200, json: { ok: true, alerts: {}, names: {} } })],
    ["GET", /^\/api\/clients\/charges-unpaid/, () => ({ status: 200, json: { ok: true, unpaid: { [UNPAID_ID]: { count: 2, total: 1850 } } } })],
    ["POST", /^\/api\/clients\/word-report-bulk/, () => ({ status: 200, json: {} })],
  ];
}

const wordBtn = (p) => p.getByRole("button", { name: /(Seçilenleri|Tümünü) Word İndir|Hazırlanıyor/ }).first();
const scopeText = (p) => p.getByTestId("bulk-word-scope").innerText().catch(() => "");

async function listSuite(vp, label) {
  const mobile = vp.width < 768;
  const g = `liste/${label}`;
  const { page, calls, pageErrors, ctx } = await newPage({ user: makeUser("expert"), routes: listRoutes(), viewport: vp });
  try {
    await page.goto(`${BASE}/danisan-yolculugu/liste`, { waitUntil: "load" });
    await page.getByText("Ayşe1 Çiğdem1").first().waitFor({ timeout: 20000 });
    await sleep(800);
    // Rozet
    const badges = await page.getByTestId("client-unpaid-badge").count();
    ok(g, "Ücret Alınmadı rozeti yalnız ödenmemişi olan danışanda (1)", badges === 1, `badges=${badges}`);
    const cardA = page.locator("div.group", { hasText: "Ayşe1 Çiğdem1" }).first();
    ok(g, "rozet Ayşe1 kartında, metin 'Ücret Alınmadı'", (await cardA.getByTestId("client-unpaid-badge").innerText().catch(() => "")).includes("Ücret Alınmadı"));
    const cardM = page.locator("div.group", { hasText: "Mehmet2 Çiğdem2" }).first();
    ok(g, "eski/Belirtilmemiş kayıtlı danışanda rozet YOK", (await cardM.getByTestId("client-unpaid-badge").count()) === 0);
    ok(g, "aggregate tek istek (N+1 yok)", calls.filter((c) => c.path === "/api/clients/charges-unpaid").length === 1);

    // 0 seçili
    if (!mobile) ok(g, "0 seçili: kapsam metni 'Word için danışan seçin'", (await scopeText(page)).includes("Word için danışan seçin"));
    else ok(g, "mobil: Word kapsam metni gizli (Word politika gereği yok)", !(await page.getByTestId("bulk-word-scope").isVisible().catch(() => false)));
    if (!mobile) {
      const b = wordBtn(page);
      ok(g, "0 seçili: Word butonu PASİF", (await b.isDisabled().catch(() => false)) === true, await b.innerText().catch(() => "?"));
      ok(g, "tek Word butonu (Tümünü/Filtreli ayrı buton YOK)", (await page.getByRole("button", { name: /Filtrelenmiş Word|Tümünü Word \(/ }).count()) === 0);
    } else {
      ok(g, "mobil: Word butonu politika gereği gizli (açılmadı)", !(await wordBtn(page).isVisible().catch(() => false)));
    }

    // 2 seçim
    await cardA.locator("input[type=checkbox]").check();
    await page.locator("div.group", { hasText: "Ayşe3 Çiğdem3" }).first().locator("input[type=checkbox]").check();
    await sleep(300);
    ok(g, "2 seçili: sayaç '2 seçili'", (await page.getByText("2 seçili").count()) > 0);
    if (!mobile) ok(g, "2 seçili: kapsam '2 / 45'", (await scopeText(page)).includes("2 / 45"), await scopeText(page));
    if (!mobile) {
      const t = await wordBtn(page).innerText();
      ok(g, "2 seçili: 'Seçilenleri Word İndir (2)'", /Seçilenleri Word İndir \(2\)/.test(t), t);
      await wordBtn(page).click();
      await sleep(1200);
      const post = calls.filter((c) => c.path === "/api/clients/word-report-bulk").at(-1);
      ok(g, "2 seçili → POST selected + 2 id", post?.body?.exportMode === "selected" && post?.body?.clientIds?.length === 2, JSON.stringify(post?.body)?.slice(0, 120));
    }

    // Tümünü Seç → GERÇEK 45 (gözat modunda yalnız 30 yüklüyken)
    const loadedBefore = calls.filter((c) => c.path === "/api/clients" && /limit=1000/.test(c.search)).length;
    const selAll = page.getByRole("button", { name: /Tümünü Seç \(45\)/ }).first();
    ok(g, "'Tümünü Seç (45)' gerçek toplamı gösterir", await selAll.isVisible().catch(() => false));
    await selAll.click();
    await page.getByText("45 seçili").first().waitFor({ timeout: 10000 }).catch(() => {});
    ok(g, "Tümünü Seç → 45 seçili (yüklenmemiş sayfalar dahil)", (await page.getByText("45 seçili").count()) > 0);
    ok(g, "Tümünü Seç tüm veriyi çekti (limit=1000)", calls.filter((c) => c.path === "/api/clients" && /limit=1000/.test(c.search)).length > loadedBefore);
    if (!mobile) ok(g, "kapsam: 'Tüm danışanlar seçili (45)'", (await scopeText(page)).includes("Tüm danışanlar seçili (45)"), await scopeText(page));
    if (!mobile) {
      const t = await wordBtn(page).innerText();
      ok(g, "45/45: 'Tümünü Word İndir (45)'", /Tümünü Word İndir \(45\)/.test(t), t);
      await wordBtn(page).click();
      await sleep(1200);
      const post = calls.filter((c) => c.path === "/api/clients/word-report-bulk").at(-1);
      ok(g, "45/45 → POST exportMode all", post?.body?.exportMode === "all" && !post?.body?.clientIds, JSON.stringify(post?.body)?.slice(0, 80));
    }
    // Seçim temizle → filtre
    await page.getByTestId("bulk-clear-selection").first().click();
    await sleep(300);
    if (mobile) await page.getByRole("button", { name: /Filtre/ }).first().click().catch(() => {});
    await page.getByPlaceholder("Ad, soyad veya telefon...").first().fill("Ayşe");
    await sleep(900);
    const selFilt = page.getByRole("button", { name: /Sonuçların Tümünü Seç \(23\)/ }).first();
    ok(g, "filtre: 'Sonuçların Tümünü Seç (23)'", await selFilt.isVisible().catch(() => false));
    await selFilt.click();
    await sleep(600);
    if (mobile) ok(g, "mobil filtre: 23 seçili", (await page.getByText("23 seçili").count()) > 0);
    else ok(g, "filtre: 23 seçili + kapsam 'filtre aktif: 23 sonuç, 23 seçili'", (await scopeText(page)).includes("23 sonuç, 23 seçili"), await scopeText(page));
    if (!mobile) {
      const t = await wordBtn(page).innerText();
      ok(g, "filtre 23/45: 'Seçilenleri Word İndir (23)' (Tümü DEĞİL)", /Seçilenleri Word İndir \(23\)/.test(t), t);
      await wordBtn(page).click();
      await sleep(1200);
      const post = calls.filter((c) => c.path === "/api/clients/word-report-bulk").at(-1);
      ok(g, "filtre → POST selected + 23 id (yalnız Ayşe)", post?.body?.exportMode === "selected" && post?.body?.clientIds?.length === 23 && post.body.clientIds.every((id) => Number(id.slice(-12)) % 2 === 1));
    }
    ok(g, "sayfa hatası yok", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    await ctx.close();
  }
}

async function overLimitSuite() {
  const g = "liste/sınır";
  const big = Array.from({ length: 101 }, (_, i) => mkClient(i + 1));
  const routes = [
    ["GET", /^\/api\/clients\?/, (_r, url) => {
      const limit = Number(url.searchParams.get("limit") || 30);
      const offset = Number(url.searchParams.get("offset") || 0);
      return { status: 200, json: { ok: true, clients: big.slice(offset, offset + limit), count: big.length } };
    }],
    ...listRoutes(),
  ];
  const { page, calls, ctx } = await newPage({ user: makeUser("expert"), routes });
  try {
    await page.goto(`${BASE}/danisan-yolculugu/liste`, { waitUntil: "load" });
    await page.getByText("Ayşe1 Çiğdem1").first().waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: /Tümünü Seç \(101\)/ }).first().click();
    await page.getByText("101 seçili").first().waitFor({ timeout: 10000 }).catch(() => {});
    await wordBtn(page).click();
    await sleep(800);
    const toast = (await page.$$eval("[role=status]", (els) => els.map((e) => e.innerText).join(" | "))) || "";
    ok(g, "101 seçili → açık hata (en fazla 100)", /en fazla 100/.test(toast), toast.slice(0, 160));
    ok(g, "101 seçili → istek GÖNDERİLMEDİ (sessiz kırpma yok)", calls.filter((c) => c.path === "/api/clients/word-report-bulk").length === 0);
  } finally {
    await ctx.close();
  }
}

// ── Detay: ödeme durumu + hero uyarısı + ödev "Kaç gün sonra?" ─────────────────
async function detailSuite(vp, label) {
  const g = `detay/${label}`;
  const CID = ALL[0].id;
  let charges = [
    { id: "ch-unpaid", tenant_id: TA, client_id: CID, charge_date: "2026-10-01", category: "session", detail: "Hacamat", note: null, amount: 1500, payment_status: "unpaid", source_session_id: null, created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-01T09:00:00Z" },
    { id: "ch-legacy", tenant_id: TA, client_id: CID, charge_date: "2026-09-01", category: "other", detail: "Eski krem", note: null, amount: 350, payment_status: null, source_session_id: null, created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T09:00:00Z" },
  ];
  const routes = [
    ["GET", new RegExp(`^/api/clients/${CID}$`), () => ({ status: 200, json: { ok: true, client: ALL[0] } })],
    ["GET", /\/charges$/, () => ({ status: 200, json: { ok: true, charges } })],
    ["PATCH", /\/charges$/, (_r, _u, body) => {
      charges = charges.map((c) => (c.id === body.id ? { ...c, ...body } : c));
      return { status: 200, json: { ok: true, charge: charges.find((c) => c.id === body.id) } };
    }],
    ["POST", /\/charges$/, (_r, _u, body) => {
      const row = { ...charges[0], id: `ch-new-${charges.length}`, ...body };
      charges = [row, ...charges];
      return { status: 200, json: { ok: true, charge: row } };
    }],
    ["GET", /\/homeworks$/, () => ({ status: 200, json: { ok: true, homeworks: [] } })],
    ["POST", /\/homeworks$/, () => ({ status: 200, json: { ok: true } })],
    ["GET", /\/sessions$/, () => ({ status: 200, json: { ok: true, sessions: [] } })],
    ["GET", /\/notes$/, () => ({ status: 200, json: { ok: true, note: null, notlar_version: "v1" } })],
  ];
  const { page, calls, pageErrors, ctx } = await newPage({ user: makeUser("expert"), routes, viewport: vp });
  try {
    await page.goto(`${BASE}/dashboard/clients/${CID}`, { waitUntil: "load" });
    await page.getByTestId("client-unpaid-warning").waitFor({ timeout: 20000 }).catch(() => {});
    const warn = await page.getByTestId("client-unpaid-warning").innerText().catch(() => "");
    ok(g, "hero: 'Ücret Alınmadı · 1 ödenmemiş ücret · ₺1.500' (eski kayıt sayılmaz)", /Ücret Alınmadı/.test(warn) && /1 ödenmemiş ücret/.test(warn) && /1\.500/.test(warn), warn);
    await page.getByText("Ücretlendirme", { exact: true }).first().click();
    await sleep(1200);
    const chips = await page.getByTestId("charge-payment-chip").allInnerTexts();
    ok(g, "satır çipleri: Ödenmedi + Belirtilmemiş", chips.includes("Ödenmedi") && chips.includes("Belirtilmemiş"), chips.join(","));
    ok(g, "sekme özeti kırmızı: '1 ödenmemiş ücret'", /1 ödenmemiş ücret/.test(await page.getByTestId("charges-unpaid-summary").innerText().catch(() => "")));

    // Yeni kayıt: seçim zorunlu
    await page.getByText("Yeni Ücret Ekle").first().click();
    await sleep(400);
    await page.getByPlaceholder("Örn: 1500").fill("200");
    await page.getByRole("button", { name: /^Kaydet$/ }).first().click();
    await sleep(700);
    let toasts = (await page.$$eval("[role=status]", (els) => els.map((e) => e.innerText).join(" | "))) || "";
    ok(g, "seçimsiz Kaydet → 'ödeme durumunu seçin' + POST YOK", /ödeme durumunu seçin/i.test(toasts) && !calls.some((c) => c.method === "POST" && /\/charges$/.test(c.path)), toasts.slice(0, 120));
    await page.getByRole("radio", { name: "Ödenmedi" }).first().click();
    ok(g, "radio aria-checked", (await page.getByRole("radio", { name: "Ödenmedi" }).first().getAttribute("aria-checked")) === "true");
    await page.getByRole("button", { name: /^Kaydet$/ }).first().click();
    await sleep(1200);
    const post = calls.filter((c) => c.method === "POST" && /\/charges$/.test(c.path)).at(-1);
    ok(g, "POST payment_status=unpaid", post?.body?.payment_status === "unpaid", JSON.stringify(post?.body));
    const warn2 = await page.getByTestId("client-unpaid-warning").innerText().catch(() => "");
    ok(g, "hero yenilemesiz güncellendi: 2 ödenmemiş · ₺1.700", /2 ödenmemiş ücret/.test(warn2) && /1\.700/.test(warn2), warn2);

    // Ödendi işaretle (her ikisini)
    for (let k = 0; k < 2; k++) {
      await page.getByRole("button", { name: "Ödendi İşaretle" }).first().click();
      await sleep(900);
    }
    const patches = calls.filter((c) => c.method === "PATCH" && /\/charges$/.test(c.path));
    ok(g, "Ödendi İşaretle → PATCH {id, payment_status: paid}", patches.length === 2 && patches.every((p) => p.body?.payment_status === "paid" && Object.keys(p.body).length === 2));
    ok(g, "hepsi ödenince hero uyarısı KALKAR (yenilemesiz)", (await page.getByTestId("client-unpaid-warning").count()) === 0);
    ok(g, "'Ödendi İşaretle' kalmadı", (await page.getByRole("button", { name: "Ödendi İşaretle" }).count()) === 0);

    // Eski kayıt düzenleme: durum seçmeden kaydet → payment_status gönderilmez
    const legacyRow = page.locator("div", { hasText: "Eski krem" }).filter({ has: page.getByRole("button", { name: "Düzenle" }) }).last();
    await legacyRow.getByRole("button", { name: "Düzenle" }).click();
    await sleep(400);
    ok(g, "eski kayıt düzenleme: 'belirtilmemiş' ipucu", (await page.getByText(/ödeme durumu belirtilmemiş/).count()) > 0);
    await page.getByRole("button", { name: "Değişiklikleri Kaydet" }).first().click();
    await sleep(900);
    const lp = calls.filter((c) => c.method === "PATCH" && /\/charges$/.test(c.path)).at(-1);
    ok(g, "eski kayıt PATCH'inde payment_status YOK (tahmin yazılmaz)", lp?.body?.id === "ch-legacy" && !("payment_status" in (lp?.body ?? {})), JSON.stringify(lp?.body));

    // ── Ödev "Kaç gün sonra?"
    await page.getByText("Ödevler", { exact: true }).first().click();
    await sleep(900);
    await page.getByText("Yeni Ödev Ekle").first().click();
    await sleep(500);
    await page.getByPlaceholder("21 gün nefes çalışması...").fill("ZZ nefes");
    const dates = page.locator("input[type=date]");
    const startI = dates.nth(0);
    const endI = dates.nth(1);
    const dur = page.getByPlaceholder("Örn: 21").first();
    await startI.fill("2026-01-31");
    await dur.fill("1");
    ok(g, "2026-01-31 + 1 → 2026-02-01", (await endI.inputValue()) === "2026-02-01");
    await dur.fill("21");
    ok(g, "+21 → 2026-02-21", (await endI.inputValue()) === "2026-02-21");
    await startI.fill("2028-02-28");
    ok(g, "N son işlem: başlangıç değişince bitiş yeniden (2028-03-20, artık yıl)", (await endI.inputValue()) === "2028-03-20", await endI.inputValue());
    await endI.fill("2028-04-01");
    ok(g, "bitiş elle → N gerçek fark (33)", (await dur.inputValue()) === "33", await dur.inputValue());
    await startI.fill("2028-03-01");
    ok(g, "bitiş son işlem: başlangıç değişince bitiş KORUNUR + N=31", (await endI.inputValue()) === "2028-04-01" && (await dur.inputValue()) === "31");
    await dur.fill("0");
    ok(g, "N=0 → aynı gün", (await endI.inputValue()) === "2028-03-01");
    await dur.fill("-3");
    await sleep(200);
    ok(g, "negatif → hata metni", (await page.getByText("Gün sayısı negatif olamaz.").count()) > 0);
    ok(g, "negatif → bitiş değişmedi", (await endI.inputValue()) === "2028-03-01");
    await page.getByRole("button", { name: /Ödevi Kaydet/ }).first().click();
    await sleep(700);
    toasts = (await page.$$eval("[role=status]", (els) => els.map((e) => e.innerText).join(" | "))) || "";
    ok(g, "negatif N ile kayıt engellendi (POST yok)", /Gün sayısını düzeltin/.test(toasts) && !calls.some((c) => c.method === "POST" && /\/homeworks$/.test(c.path)), toasts.slice(0, 100));
    await dur.fill("4000");
    ok(g, "çok büyük → hata", (await page.getByText("En fazla 3650 gün girilebilir.").count()) > 0);
    await dur.fill("2.5");
    ok(g, "ondalık → hata", (await page.getByText("Yalnız tam sayı girin (örn. 7).").count()) > 0);
    await dur.fill("30");
    await page.getByRole("button", { name: /Ödevi Kaydet/ }).first().click();
    await sleep(1200);
    const hw = calls.filter((c) => c.method === "POST" && /\/homeworks$/.test(c.path)).at(-1);
    ok(g, "POST start 2028-03-01 / end 2028-03-31 (gün sayısı DB'ye gitmez)", hw?.body?.start_date === "2028-03-01" && hw?.body?.end_date === "2028-03-31" && !("durationDays" in (hw?.body ?? {})) && !("duration_days" in (hw?.body ?? {})), JSON.stringify(hw?.body)?.slice(0, 200));
    ok(g, "sayfa hatası yok", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    await ctx.close();
  }
}

export async function run() {
  await listSuite({ width: 1280, height: 900 }, "web");
  await listSuite({ width: 390, height: 844 }, "mobil");
  await overLimitSuite();
  await detailSuite({ width: 1280, height: 900 }, "web");
  await detailSuite({ width: 390, height: 844 }, "mobil");
}
