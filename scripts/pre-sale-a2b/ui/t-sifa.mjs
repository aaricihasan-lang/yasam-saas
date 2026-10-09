// AŞAMA 2B — P2-4 Şifa Rehberi foto yükleme hata görünürlüğü (create görünümü, SectionEditor).
import { newPage, makeUser, BASE, ok, sleep } from "./ui-lib.mjs";

const toasts = (p) => p.$$eval("[role=status]", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PREVIEW = "data:image/png;base64," + PNG_1PX.toString("base64");
const prepOk = () => ({ status: 200, json: { ok: true, path: "zz-tenant/staging/zz.png", token: "zz-token" } });

const CASES = {
  success: { prepare: prepOk, storage: "ok", finalize: () => ({ status: 200, json: { ok: true, image: { id: "img1", name: "zz.png", file_path: "zz-tenant/staging/zz.png" }, previewUrl: PREVIEW } }) },
  prepare400: { prepare: () => ({ status: 400, json: { ok: false, error: "ZZ Desteklenmeyen dosya türü." } }), expectMsg: "ZZ Desteklenmeyen" },
  prepare500: { prepare: () => ({ status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } }), expectMsg: "tamamlanamadı" },
  prepareNetwork: { prepare: () => ({ abort: true }) },
  demo: { prepare: () => ({ status: 200, json: { ok: true, demo: true } }), expectMsg: "Demo hesabında" },
  storageFail: { prepare: prepOk, storage: "fail", expectMsg: "Görsel yüklenemedi" },
  finalize500: { prepare: prepOk, storage: "ok", finalize: () => ({ status: 500, json: { ok: false, error: "ZZ Görsel kaydedilemedi." } }), expectMsg: "kaydedilemedi" },
};

export async function run() {
  for (const [name, c] of Object.entries(CASES)) {
    const g = `Şifa-foto/${name}`;
    const routes = [
      ["GET", /^\/api\/sifa-rehberi\/guides/, () => ({ status: 200, json: { ok: true, guides: [], nextCursor: null } })],
      ["POST", /^\/api\/sifa-rehberi\/photos\/prepare$/, c.prepare],
      ["POST", /^\/api\/sifa-rehberi\/photos\/finalize$/, c.finalize ?? (() => ({ status: 500, json: {} }))],
      ["POST", /^\/api\/sifa-rehberi\/photos\/cleanup$/, () => ({ status: 200, json: { ok: true } })],
    ];
    const { page, ctx, calls, pageErrors } = await newPage({ user: makeUser("expert"), routes });
    // Storage signed-upload (fake Supabase origin) — testte kontrollü yanıt.
    await ctx.route("http://127.0.0.1:54399/storage/**", (route) =>
      c.storage === "ok"
        ? route.fulfill({ status: 200, json: { Key: "stone-photos/zz-tenant/staging/zz.png" }, headers: { "access-control-allow-origin": "*" } })
        : route.fulfill({ status: 400, json: { statusCode: "403", error: "Unauthorized", message: "ZZ signature invalid" }, headers: { "access-control-allow-origin": "*" } }),
    );
    try {
      await page.goto(`${BASE}/sifa-rehberi`, { waitUntil: "load" });
      await sleep(2000);
      await page.getByRole("button", { name: /Yeni kayıt oluştur/ }).first().click();
      await sleep(1000);
      await page.getByRole("button", { name: /Tıbbi Nedenler/ }).first().click();
      await sleep(700);
      await page.getByRole("button", { name: /Yeni Not Ekle/ }).first().click();
      await sleep(700);
      const note = page.locator("textarea:not([readonly]):visible, input:not([readonly]):not([type=file]):not([type=checkbox]):not([list]):visible").last();
      await note.fill("ZZ korunacak not metni");
      const fotoBtn = page.getByRole("button", { name: /Foto Ekle/ }).first();
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), fotoBtn.click()]);
      await chooser.setFiles({ name: "zz.png", mimeType: "image/png", buffer: PNG_1PX });
      await sleep(2500);
      const t = (await toasts(page)).join(" | ");
      const thumbs = await page.locator('img[alt="zz.png"]').count();
      const btnText = (await fotoBtn.innerText()).trim();
      ok(g, "yükleme durumu kapandı (Foto Ekle, aktif)", /Foto Ekle/.test(btnText) && (await fotoBtn.isEnabled()), btnText);
      ok(g, "not metni korunuyor", (await note.inputValue()) === "ZZ korunacak not metni");
      if (name === "success") {
        ok(g, "foto eklendi (önizleme görünür)", thumbs === 1, `thumbs=${thumbs}`);
        ok(g, "hata mesajı YOK", !/yüklenemedi/i.test(t), t);
      } else {
        ok(g, "hata kullanıcıya gösterildi", /Görsel yüklenemedi/.test(t), t || "(toast yok)");
        if (c.expectMsg) ok(g, "anlamlı mesaj iletildi", t.includes(c.expectMsg), t);
        ok(g, "başarısız foto yüklenmiş gibi GÖRÜNMÜYOR", thumbs === 0, `thumbs=${thumbs}`);
        if (name === "finalize500") ok(g, "finalize hatasında orphan cleanup çağrıldı", calls.some((x) => x.path === "/api/sifa-rehberi/photos/cleanup"));
      }
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) {
      ok(g, "senaryo çalıştı", false, String(e).slice(0, 220));
    } finally { await ctx.close(); }
  }
}
