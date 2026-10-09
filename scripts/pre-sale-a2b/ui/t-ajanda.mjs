// AŞAMA 2B — P2-2 ajanda randevu create/edit.
import { newPage, makeUser, BASE, ok, sleep } from "./ui-lib.mjs";

const toasts = (p) => p.$$eval("[role=status]", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const APPT = {
  id: "dddddddd-0000-4000-8000-0000000000d1", title: "ZZ Mevcut Randevu", notes: null, client_id: null,
  appointment_date: "2026-12-01T10:00:00.000Z", status: "planlandi", tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a",
  created_at: "2026-10-01T09:00:00Z",
};

const SCEN = {
  success: () => ({ status: 200, json: { ok: true, appointment: { ...APPT, id: "new" } }, delay: 600 }),
  http400: () => ({ status: 400, json: { error: "ZZ doğrulama hatası" } }),
  http409: () => ({ status: 409, json: { error: "ZZ çakışma: tamamlanmış randevu" } }),
  http500: () => ({ status: 500, json: { error: "İşlem tamamlanamadı." } }),
  network: () => ({ abort: true }),
};

async function open(routes) {
  const r = await newPage({
    user: makeUser("expert"),
    routes: [
      ...routes,
      ["GET", /^\/api\/appointments(\?|$)/, () => ({ status: 200, json: { ok: true, appointments: [APPT] } })],
      ["GET", /^\/api\/clients$/, () => ({ status: 200, json: { clients: [] } })],
    ],
  });
  await r.page.goto(`${BASE}/dashboard/ajanda`, { waitUntil: "load" });
  await sleep(2500);
  return r;
}

export async function run() {
  for (const scen of ["success", "http400", "http500", "network"]) {
    const g = `Ajanda-create/${scen}`;
    const { page, calls, pageErrors, ctx } = await open([["POST", /^\/api\/appointments$/, SCEN[scen]]]);
    try {
      await page.getByText("Yeni Randevu Ekle").first().click();
      await sleep(600);
      await page.getByRole("button", { name: /Genel Randevu/ }).first().click();
      await page.getByPlaceholder("Örn: Seans, Toplantı, Kişisel not...").fill("ZZ Ajanda Testi");
      await page.locator('input[type="date"]').first().fill("2026-12-15");
      await page.locator('input[type="time"]').first().fill("10:30");
      const btn = page.getByRole("button", { name: "Randevu Kaydet" }).first();
      await btn.click();
      if (scen === "success") await btn.click({ timeout: 1500 }).catch(() => {});
      await sleep(2500);
      const writes = calls.filter((c) => c.method === "POST" && c.path === "/api/appointments");
      const t = (await toasts(page)).join(" | ");
      const visible = await btn.isVisible().catch(() => false);
      if (scen === "success") {
        ok(g, "tek POST (çift tıkta duplicate yok)", writes.length === 1, `writes=${writes.length}`);
        ok(g, "başarı mesajı", t.includes("Randevu oluşturuldu"), t);
        ok(g, "form kapandı", !visible, `visible=${visible}`);
      } else {
        ok(g, "hata mesajı görünür", /hata|oluşturulamadı/i.test(t), t || "(toast yok)");
        ok(g, "kaydet tekrar aktif (saving kapandı)", visible && (await btn.isEnabled()), `visible=${visible}`);
        ok(g, "form açık, başlık korunuyor", visible && (await page.getByPlaceholder("Örn: Seans, Toplantı, Kişisel not...").inputValue()) === "ZZ Ajanda Testi");
        ok(g, "başarı mesajı YOK", !/Başarılı/.test(t), t);
      }
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) {
      ok(g, "senaryo çalıştı", false, String(e).slice(0, 200));
    } finally { await ctx.close(); }
  }

  for (const scen of ["success", "http409", "http500", "network"]) {
    const g = `Ajanda-edit/${scen}`;
    const { page, calls, pageErrors, ctx } = await open([["PATCH", /^\/api\/appointments\/[^/]+$/, SCEN[scen]]]);
    try {
      const card = page.getByText("ZZ Mevcut Randevu").first();
      await card.waitFor({ timeout: 8000 });
      await page.getByRole("button", { name: /ZZ Mevcut Randevu/ }).first().click();
      await sleep(700);
      await page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
      await sleep(700);
      const title = page.getByPlaceholder("Örn: Seans, Toplantı, Kişisel not...");
      await title.fill("ZZ Güncel Başlık");
      const saveBtn = page.getByRole("button", { name: /Randevu Kaydet|Güncelle|Kaydet/ }).filter({ hasNotText: "Word" }).first();
      await saveBtn.click();
      await sleep(2500);
      const writes = calls.filter((c) => c.method === "PATCH" && /^\/api\/appointments\/[^/]+$/.test(c.path));
      const t = (await toasts(page)).join(" | ");
      const titleVisible = await title.isVisible().catch(() => false);
      ok(g, "tek PATCH gönderildi", writes.length === 1, `writes=${writes.length}`);
      if (scen === "success") {
        ok(g, "başarı mesajı", t.includes("Randevu güncellendi"), t);
      } else {
        ok(g, "hata mesajı görünür", /hata|güncellenemedi|çakışma/i.test(t), t || "(toast yok)");
        if (scen === "http409") ok(g, "sunucu mesajı gösterildi", t.includes("ZZ çakışma"), t);
        ok(g, "düzenleme formu açık + değer korunuyor", titleVisible && (await title.inputValue()) === "ZZ Güncel Başlık");
        ok(g, "kaydet tekrar aktif", await saveBtn.isEnabled().catch(() => false));
      }
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) {
      ok(g, "senaryo çalıştı", false, String(e).slice(0, 200));
    } finally { await ctx.close(); }
  }
}
