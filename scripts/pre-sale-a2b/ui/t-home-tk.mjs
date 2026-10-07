// AŞAMA 2B — P2-1: ana sayfa (dashboard/summary) + admin tenant-kontrol; anon tarayıcı okuması YOK.
import { newPage, makeUser, BASE, ok, sleep, anonLog, anonReset, TENANT_A, TENANT_B } from "./ui-lib.mjs";

const browserAnonReads = async () => (await anonLog()).filter((r) => r.origin && r.path.startsWith("/rest/v1/"));
const SUMMARY_OK = {
  ok: true,
  counts: { stones: 7, stok: 4, sifa_rehberi: 3, digital_content: 2 },
  recent: { stones: [{ label: "ZZ Ametist", created_at: "2026-10-07T09:00:00Z" }], personal_archives: [{ label: "ZZ Arşiv Belgesi", created_at: "2026-10-06T09:00:00Z" }] },
};
const homeRoutes = (summary) => [
  ["GET", /^\/api\/dashboard\/summary/, summary],
  ["GET", /^\/api\/numeroloji\/analyses\?count=1/, () => ({ status: 200, json: { ok: true, count: 5 } })],
  ["GET", /^\/api\/numeroloji\/analyses\?recent=3/, () => ({ status: 200, json: { ok: true, rows: [{ name: "Zeynep", surname: "Deneme", created_at: "2026-10-07T11:00:00Z" }] } })],
  ["GET", /^\/api\/clients$/, () => ({ status: 200, json: { clients: [{ ad: "Ali", soyad: "Test", created_at: "2026-10-05T09:00:00Z" }] } })],
];

export async function run() {
  const HOME = {
    success: () => ({ status: 200, json: SUMMARY_OK }),
    http401: () => ({ status: 401, json: { error: "Yetki gerekli." } }),
    http403: () => ({ status: 403, json: { error: "Üyelik aktif değil." } }),
    http500: () => ({ status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } }),
    network: () => ({ abort: true }),
  };
  for (const [scen, fn] of Object.entries(HOME)) {
    const g = `Home/${scen}`;
    await anonReset();
    const { page, calls, pageErrors, ctx } = await newPage({ user: makeUser("expert"), routes: homeRoutes(fn) });
    try {
      await page.goto(BASE + "/", { waitUntil: "load" });
      await sleep(4500);
      const text = await page.evaluate(() => document.body.innerText);
      const sum = calls.filter((c) => c.path === "/api/dashboard/summary");
      ok(g, "summary çağrıldı; istemci tenant göndermiyor", sum.length >= 1 && sum.every((c) => !/tenant/i.test(c.search)), sum.map((c) => c.search).join(","));
      ok(g, "tarayıcıdan anon Supabase tablo okuması YOK (42501 kaynağı kalktı)", (await browserAnonReads()).length === 0, JSON.stringify(await browserAnonReads()));
      ok(g, "sayfa render (modül kartları var)", text.includes("Doğaltaş") && text.includes("Dijital İçerik Merkezi"));
      ok(g, "numeroloji son aktivitede ad görünür", text.includes("Zeynep Deneme"));
      ok(g, "danışan sayacı (ayrı API) etkilenmedi", text.includes("1 danışan"));
      if (scen === "success") {
        ok(g, "sayaçlar: 7 taş / 4 ürün / 2 içerik", text.includes("7 taş") && text.includes("4 ürün") && text.includes("2 içerik"));
        ok(g, "son aktivite: Doğaltaş + Arşiv", text.includes("ZZ Ametist") && text.includes("ZZ Arşiv Belgesi"));
      } else {
        ok(g, "hata durumunda yanlış sayı gösterilmiyor", !text.includes("7 taş") && !text.includes("ZZ Ametist"));
      }
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, String(e).slice(0, 200)); } finally { await ctx.close(); }
  }

  const metric = (total, tenants, nul = 0) => ({ status: 200, json: { ok: true, total, tenants, nullTenantRows: nul } });
  const TK = {
    success: { appointments: () => metric(9, { [TENANT_A]: 9 }) },
    appointments500: { appointments: () => ({ status: 500, json: { ok: false, error: "Metrikler alınamadı." } }) },
    appointmentsNetwork: { appointments: () => ({ abort: true }) },
  };
  for (const [scen, cfg] of Object.entries(TK)) {
    const g = `TenantKontrol/${scen}`;
    await anonReset();
    const { page, calls, pageErrors, ctx } = await newPage({
      user: makeUser("admin"),
      routes: [
        ["GET", /^\/api\/admin\/system-health\/counts\?metric=clients/, () => metric(5, { [TENANT_A]: 3, [TENANT_B]: 2 })],
        ["GET", /^\/api\/admin\/system-health\/counts\?metric=appointments/, cfg.appointments],
        ["GET", /^\/api\/admin\/system-health\/counts\?metric=stones/, () => metric(4, { [TENANT_B]: 4 })],
        ["GET", /^\/api\/admin\/system-health\/counts\?metric=personal_archives/, () => metric(1, { [TENANT_A]: 1 })],
        ["GET", /^\/api\/admin\/numeroloji\/tenant-metrics/, () => metric(2, { [TENANT_A]: 2 })],
      ],
    });
    try {
      await page.goto(`${BASE}/admin/tenant-kontrol`, { waitUntil: "load" });
      await sleep(4500);
      const text = await page.evaluate(() => document.body.innerText);
      const metrics = [...new Set(calls.filter((c) => c.path === "/api/admin/system-health/counts").map((c) => c.search))];
      ok(g, "admin sayfası render", text.includes("Tenant Güvenlik Kontrolü"), page.url());
      ok(g, "tüm denetim tabloları admin API'den (appointments dahil)", ["clients", "appointments", "stones", "personal_archives"].every((m) => metrics.includes(`?metric=${m}`)), metrics.join(","));
      ok(g, "numeroloji kanonik metrik API'si", calls.some((c) => c.path === "/api/admin/numeroloji/tenant-metrics"));
      ok(g, "tarayıcıdan anon Supabase tablo okuması YOK", (await browserAnonReads()).length === 0, JSON.stringify(await browserAnonReads()));
      if (scen === "success") {
        ok(g, "risk özeti: tümü güvenli (5 güvenli kontrol)", /5\s*Güvenli kontrol/.test(text.replace(/\n/g, " ")), text.slice(text.indexOf("Güvenli kontrol") - 10, text.indexOf("Güvenli kontrol") + 20));
      } else {
        ok(g, "hata kontrollü: 'Kontrol gerekli' olarak işaretlendi", /1\s*Kontrol gerekli/.test(text.replace(/\n/g, " ")));
      }
      ok(g, "JS page error yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, String(e).slice(0, 200)); } finally { await ctx.close(); }
  }
}
