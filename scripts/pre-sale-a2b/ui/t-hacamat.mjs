// AŞAMA 2B — P2-3 Hacamat kuralları: create/update/delete; UI ↔ "sunucu" tutarlılığı.
import { newPage, makeUser, BASE, ok, sleep } from "./ui-lib.mjs";

const toasts = (p) => p.$$eval("[role=status]", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
const base = () => [
  { id: "r1", category: "before", rule_text: "ZZ Kural Bir", sort_order: 0 },
  { id: "r2", category: "before", rule_text: "ZZ Kural İki", sort_order: 1 },
];
const RESP = {
  success: null, // per-op
  http500: () => ({ status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } }),
  http403: () => ({ status: 403, json: { ok: false, code: "DEMO_READONLY", error: "Demo hesap kural düzenleyemez." } }),
  network: () => ({ abort: true }),
};

async function open(server, writeRoutes) {
  const r = await newPage({
    user: makeUser("expert"),
    routes: [...writeRoutes, ["GET", /^\/api\/hacamat\/rules/, () => ({ status: 200, json: { ok: true, data: server.rules } })]],
  });
  await r.page.goto(`${BASE}/cosmic-calendar/hacamat`, { waitUntil: "load" });
  await sleep(2500);
  await r.page.getByRole("button", { name: /Kurallar/ }).first().click();
  await sleep(1200);
  return r;
}
const visibleRuleTexts = (p) =>
  p.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.childElementCount === 0 && /^ZZ /.test(e.textContent?.trim() ?? "")).map((e) => e.textContent.trim()));

// "Sunucu durumu" ile UI'yi kıyasla: reload sonrası görünen = server.rules.
async function reloadMatches(page, server) {
  await page.reload({ waitUntil: "load" });
  await sleep(2000);
  await page.getByRole("button", { name: /Kurallar/ }).first().click();
  await sleep(1000);
  const after = (await visibleRuleTexts(page)).sort();
  const expect = server.rules.map((r) => r.rule_text).sort();
  return { okv: JSON.stringify(after) === JSON.stringify(expect), after, expect };
}

export async function run() {
  // CREATE
  for (const scen of ["success", "http500", "network"]) {
    const g = `Hacamat-create/${scen}`;
    const server = { rules: base() };
    const handler = scen === "success"
      ? (req, url, body) => { const row = { id: "r9", category: body.category, rule_text: body.rule_text, sort_order: 2 }; server.rules.push(row); return { status: 200, json: { ok: true, data: row } }; }
      : RESP[scen];
    const { page, pageErrors, ctx } = await open(server, [["POST", /^\/api\/hacamat\/rules$/, handler]]);
    try {
      const input = page.getByPlaceholder("Hacamat öncesi kural ekle…");
      await input.fill("ZZ Yeni Kural");
      await page.getByRole("button", { name: "Ekle", exact: true }).first().click();
      await sleep(1800);
      const t = (await toasts(page)).join(" | ");
      const shown = await visibleRuleTexts(page);
      if (scen === "success") {
        ok(g, "yeni kural listede", shown.includes("ZZ Yeni Kural"));
        ok(g, "giriş temizlendi", (await input.inputValue()) === "");
      } else {
        ok(g, "hata mesajı görünür (sessiz değil)", /eklenemedi/i.test(t), t || "(toast yok)");
        ok(g, "kural listede GÖRÜNMÜYOR", !shown.includes("ZZ Yeni Kural"));
        ok(g, "yazılan metin korunuyor", (await input.inputValue()) === "ZZ Yeni Kural");
        ok(g, "Ekle butonu tekrar aktif", await page.getByRole("button", { name: "Ekle", exact: true }).first().isEnabled());
      }
      const m = await reloadMatches(page, server);
      ok(g, "UI = sunucu (yenileme sonrası)", m.okv, `ui=${m.after} srv=${m.expect}`);
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, String(e).slice(0, 200)); } finally { await ctx.close(); }
  }

  // UPDATE
  for (const scen of ["success", "http500", "http403", "network"]) {
    const g = `Hacamat-update/${scen}`;
    const server = { rules: base() };
    const handler = scen === "success"
      ? (req, url, body) => { const r = server.rules.find((x) => url.pathname.endsWith(x.id)); r.rule_text = body.rule_text; return { status: 200, json: { ok: true, data: r } }; }
      : RESP[scen];
    const { page, pageErrors, ctx } = await open(server, [["PUT", /^\/api\/hacamat\/rules\/[^/]+$/, handler]]);
    try {
      await page.locator('button[title="Düzenle"]').first().click();
      await sleep(400);
      const editInput = page.locator('input[type="text"]').filter({ hasNot: page.locator("[placeholder]") }).first();
      const field = (await page.locator("input:not([placeholder])").count()) ? page.locator("input:not([placeholder])").first() : editInput;
      await field.fill("ZZ Kural Bir DEĞİŞTİ");
      await page.locator('button[title="Kaydet"]').first().click();
      await sleep(1800);
      const t = (await toasts(page)).join(" | ");
      const shown = await visibleRuleTexts(page);
      if (scen === "success") {
        ok(g, "yeni metin görünür", shown.includes("ZZ Kural Bir DEĞİŞTİ"));
      } else {
        ok(g, "hata mesajı görünür", /kaydedilemedi/i.test(t), t || "(toast yok)");
        if (scen === "http403") ok(g, "sunucu mesajı (demo) gösterildi", t.includes("Demo hesap"), t);
        ok(g, "optimistic ROLLBACK: eski metin geri geldi", shown.includes("ZZ Kural Bir") && !shown.includes("ZZ Kural Bir DEĞİŞTİ"), shown.join(","));
      }
      const m = await reloadMatches(page, server);
      ok(g, "UI = sunucu (yenileme sonrası)", m.okv, `ui=${m.after} srv=${m.expect}`);
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, String(e).slice(0, 200)); } finally { await ctx.close(); }
  }

  // DELETE
  for (const scen of ["success", "http500", "network"]) {
    const g = `Hacamat-delete/${scen}`;
    const server = { rules: base() };
    const handler = scen === "success"
      ? (req, url) => { server.rules = server.rules.filter((x) => !url.pathname.endsWith(x.id)); return { status: 200, json: { ok: true } }; }
      : RESP[scen];
    const { page, pageErrors, ctx } = await open(server, [["DELETE", /^\/api\/hacamat\/rules\/[^/]+$/, handler]]);
    try {
      await page.locator('button[title="Sil"]').first().click();
      await sleep(300);
      await page.locator('button[title="Evet, sil"]').first().click();
      await sleep(1800);
      const t = (await toasts(page)).join(" | ");
      const shown = await visibleRuleTexts(page);
      if (scen === "success") {
        ok(g, "kural listeden kalktı", !shown.includes("ZZ Kural Bir") && shown.includes("ZZ Kural İki"));
      } else {
        ok(g, "hata mesajı görünür", /silinemedi/i.test(t), t || "(toast yok)");
        ok(g, "optimistic ROLLBACK: kural geri geldi (aynı sırada)", shown.indexOf("ZZ Kural Bir") === 0 && shown.includes("ZZ Kural İki"), shown.join(","));
      }
      const m = await reloadMatches(page, server);
      ok(g, "UI = sunucu (yenileme sonrası)", m.okv, `ui=${m.after} srv=${m.expect}`);
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, String(e).slice(0, 200)); } finally { await ctx.close(); }
  }
}
