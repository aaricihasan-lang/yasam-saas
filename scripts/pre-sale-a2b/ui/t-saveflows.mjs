// AŞAMA 2B — P2-2 save flows on client detail (SessionsTab / UcretlendirmeTab / HomeworkTab / notes).
import { newPage, makeUser, BASE, ok, sleep } from "./ui-lib.mjs";

const CID = "cccccccc-0000-4000-8000-0000000000c1";
const client = { id: CID, ad: "Ayşe", soyad: "Deneme", tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", created_at: "2026-10-01T09:00:00Z", gorusme: null };

const AREAS = [
  {
    key: "Seans", tab: "Seanslar", add: "Yeni Seans Ekle", save: /Seansı Kaydet/, method: "POST", path: /\/sessions$/,
    fill: async (p) => p.getByPlaceholder("Seans genel notu...").fill("ZZ seans notu"),
    readValue: (p) => p.getByPlaceholder("Seans genel notu...").inputValue().catch(() => null),
    successJson: { ok: true }, failText: "eklenemedi", successText: "eklendi",
  },
  {
    key: "Ücret", tab: "Ücretlendirme", add: "Yeni Ücret Ekle", save: /^Kaydet$/, method: "POST", path: /\/charges$/,
    fill: async (p) => {
      await p.getByPlaceholder("Örn: Hacamat, Biyoenerji, Refleksoloji...").fill("ZZ Hacamat");
      await p.getByPlaceholder("Örn: 1500").fill("1500");
    },
    readValue: (p) => p.getByPlaceholder("Örn: 1500").inputValue().catch(() => null),
    successJson: { ok: true }, failText: "eklenemedi", successText: "eklendi",
  },
  {
    key: "Ödev", tab: "Ödevler", add: "Yeni Ödev Ekle", save: /Ödevi Kaydet/, method: "POST", path: /\/homeworks$/,
    fill: async (p) => p.getByPlaceholder("21 gün nefes çalışması...").fill("ZZ nefes ödevi"),
    readValue: (p) => p.getByPlaceholder("21 gün nefes çalışması...").inputValue().catch(() => null),
    successJson: { ok: true }, failText: "eklenemedi", successText: "eklendi",
  },
  {
    key: "Not", tab: "Notlar", add: "Yeni Not Ekle", save: /Notu Kaydet/, method: "PATCH", path: /\/notes$/,
    fill: async (p) => p.getByPlaceholder(/Danışan hakkında özel notlar/).fill("ZZ özel not"),
    readValue: (p) => p.getByPlaceholder(/Danışan hakkında özel notlar/).inputValue().catch(() => null),
    successJson: { ok: true, note: { id: "n1", notlar: JSON.stringify([{ id: "x", text: "ZZ özel not" }]) }, notlar_version: "v2" },
    failText: "hata", successText: null,
  },
];

const SCENARIOS = {
  success: (a) => ({ status: 200, json: a.successJson, delay: 600 }),
  http400: () => ({ status: 400, json: { ok: false, error: "ZZ doğrulama hatası" } }),
  http500: () => ({ status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } }),
  network: () => ({ abort: true }),
};

const toasts = (p) => p.$$eval("[role=status]", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));

export async function run() {
  for (const a of AREAS) {
    for (const [scen, mk] of Object.entries(SCENARIOS)) {
      const routes = [
        ["GET", new RegExp(`^/api/clients/${CID}$`), () => ({ status: 200, json: { ok: true, client } })],
        [a.method, a.path, () => mk(a)],
        ["GET", /\/sessions$/, () => ({ status: 200, json: { ok: true, sessions: [] } })],
        ["GET", /\/charges$/, () => ({ status: 200, json: { ok: true, charges: [] } })],
        ["GET", /\/homeworks$/, () => ({ status: 200, json: { ok: true, homeworks: [] } })],
        ["GET", /\/notes$/, () => ({ status: 200, json: { ok: true, note: null, notlar_version: "v1" } })],
      ];
      const { page, calls, pageErrors, ctx } = await newPage({ user: makeUser("expert"), routes });
      const g = `${a.key}/${scen}`;
      try {
        await page.goto(`${BASE}/dashboard/clients/${CID}`, { waitUntil: "load" });
        await sleep(2000);
        await page.getByText(a.tab, { exact: true }).first().click();
        await sleep(1000);
        await page.getByText(a.add).first().click();
        await sleep(600);
        await a.fill(page);
        const saveBtn = page.getByRole("button", { name: a.save }).first();
        if (scen === "success") {
          // çift tık: ikinci tık yanıt beklenirken gelir (duplicate guard)
          await saveBtn.click();
          await saveBtn.click({ timeout: 1500 }).catch(() => {});
        } else {
          await saveBtn.click();
        }
        await sleep(2500);
        const writes = calls.filter((c) => c.method === a.method && a.path.test(c.path));
        const t = (await toasts(page)).join(" | ");
        const btnVisible = await page.getByRole("button", { name: a.save }).first().isVisible().catch(() => false);
        const btnEnabled = btnVisible ? await page.getByRole("button", { name: a.save }).first().isEnabled().catch(() => false) : null;
        if (scen === "success") {
          ok(g, "tek yazma isteği (çift tıkta duplicate yok)", writes.length === 1, `writes=${writes.length}`);
          if (a.successText) ok(g, "başarı mesajı", t.includes(a.successText), t);
          ok(g, "form kapandı / tekrar gönderilemez", !btnVisible || (await a.readValue(page)) === "", `visible=${btnVisible}`);
        } else {
          ok(g, "hata mesajı görünür", /başarısız|hata|eklenemedi|güncellenemedi/i.test(t), t || "(toast yok)");
          ok(g, "kaydet butonu tekrar aktif (saving kapandı)", btnVisible && btnEnabled === true, `visible=${btnVisible} enabled=${btnEnabled}`);
          ok(g, "form açık, veri korunuyor", btnVisible && !!(await a.readValue(page)), "");
          ok(g, "başarı mesajı YOK", !/Başarılı/.test(t), t);
        }
        ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
      } catch (e) {
        ok(g, "senaryo çalıştı", false, String(e).slice(0, 200));
      } finally {
        await ctx.close();
      }
    }
  }
}
