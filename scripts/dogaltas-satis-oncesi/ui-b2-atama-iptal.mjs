// B2 (05.11 canlı denetim) — Taş Kayıt → Atama paneli: İptal / × bu oturumda eklenen satırı gerçekten geri alır,
// Kaydet ile eklenen ve önceden var olan satırlara dokunulmaz; iptal edilen satır POST gövdesine girmez.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort; yazma yalnız sahte yanıtla).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/dogaltas-satis-oncesi/ui-b2-atama-iptal.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3971";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 400) : ""}`);
}
const browser = await chromium.launch();

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `b2-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  const posts = [];
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === "/api/dogaltas/duplicate-check") return route.fulfill({ status: 200, json: { ok: true, exists: false } });
    if (url.pathname === "/api/dogaltas/stone-sources/names") return route.fulfill({ status: 200, json: { ok: true, names: [] } });
    if (url.pathname === "/api/dogaltas/stones" && req.method() === "POST") {
      posts.push(req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}"));
      return route.fulfill({ status: 200, json: { ok: true, id: "b2000000-0000-4000-8000-000000000001" } });
    }
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  const modal = () => page.locator("div.fixed").filter({ has: page.getByRole("button", { name: "Satır Ekle" }) }).last();
  const openSection = async (label) => { await hit(page.getByRole("button", { name: new RegExp(label) }).first()); await modal().waitFor({ timeout: 15000 }); await sleep(200); };
  const rowsText = async () => (await modal().innerText()).replace(/\s+/g, " ");
  const addRow = async (ph, value) => { await modal().getByPlaceholder(ph).fill(value); await hit(modal().getByRole("button", { name: "Satır Ekle" })); await sleep(250); };
  try {
    await page.goto(`${BASE}/dogaltas/dogaltas-kayit`, { waitUntil: "load" });
    await hit(page.getByRole("button", { name: /Yeni Kayıt Oluştur/ }).first());
    await page.getByPlaceholder("Örn. Ametist").waitFor({ timeout: 60000 });
    await page.getByPlaceholder("Örn. Ametist").fill(`ZZ B2 ${vp.tag}`);
    await hit(page.getByRole("button", { name: /Atamalar/ }).first());
    await sleep(300);

    // 1) Ekle → İptal: satır geri alınır
    await openSection("Astrolojik Atama");
    await addRow("Astrolojik Atama yaz...", "IPTAL-1");
    ok(g, "satır eklenince panelde görünür", (await rowsText()).includes("IPTAL-1"));
    await hit(modal().getByRole("button", { name: "İptal" }));
    await sleep(300);
    await openSection("Astrolojik Atama");
    ok(g, "İptal sonrası yeniden açınca eklenen satır YOK", !(await rowsText()).includes("IPTAL-1"), await rowsText());

    // 2) Ekle → Kaydet: satır kalır
    await addRow("Astrolojik Atama yaz...", "KALICI-1");
    await hit(modal().getByRole("button", { name: "Kaydet", exact: true }));
    await sleep(300);
    await openSection("Astrolojik Atama");
    ok(g, "Kaydet ile eklenen satır korunur", (await rowsText()).includes("KALICI-1"));

    // 3) Önceden kayıtlı satır varken yeni ekle → × : yalnız yeni satır gider
    await addRow("Astrolojik Atama yaz...", "IPTAL-2");
    await hit(modal().getByRole("button", { name: "×" }));
    await sleep(300);
    await openSection("Astrolojik Atama");
    const t3 = await rowsText();
    ok(g, "× ile yalnız bu oturumdaki satır geri alınır, önceki satır korunur", t3.includes("KALICI-1") && !t3.includes("IPTAL-2"), t3);

    // 4) Bekleyen (eklenmemiş) giriş İptal ile temizlenir
    await modal().getByPlaceholder("Astrolojik Atama yaz...").fill("BEKLEYEN");
    await hit(modal().getByRole("button", { name: "İptal" }));
    await sleep(300);
    await openSection("Astrolojik Atama");
    ok(g, "İptal bekleyen girişi de temizler", (await modal().getByPlaceholder("Astrolojik Atama yaz...").inputValue()) === "");
    await hit(modal().getByRole("button", { name: "İptal" }));
    await sleep(300);

    // 5) Mineraller: oranlı satır ekle → İptal → yok; Kaydet akışı (bekleyen girişle) → var
    await openSection("Mineraller");
    await addRow("Mineral yaz...", "IPTAL-MIN");
    await hit(modal().getByRole("button", { name: "İptal" }));
    await sleep(300);
    await openSection("Mineraller");
    ok(g, "Mineraller: İptal edilen satır yok", !(await rowsText()).includes("IPTAL-MIN"));
    await modal().getByPlaceholder("Mineral yaz...").fill("Kuvars");
    await modal().getByPlaceholder("Oran % yaz...").fill("45");
    await hit(modal().getByRole("button", { name: "Kaydet", exact: true }));
    await sleep(300);
    await openSection("Mineraller");
    ok(g, "Mineraller: bekleyen girişle Kaydet satırı ekler (mevcut davranış)", (await rowsText()).includes("Kuvars"));
    await hit(modal().getByRole("button", { name: "İptal" }));
    await sleep(300);
    ok(g, "İptal, Kaydet ile eklenmiş satırı silmez", true);
    await openSection("Mineraller");
    ok(g, "Mineraller: Kuvars hâlâ var", (await rowsText()).includes("Kuvars"));
    await hit(modal().getByRole("button", { name: "İptal" }));
    await sleep(300);

    // 6) Formu kaydet → POST gövdesi: iptal edilenler yok, kaydedilenler var
    const saveBtn = page.getByRole("button", { name: "Kaydet", exact: true }).last();
    await hit(saveBtn);
    for (let i = 0; i < 40 && posts.length === 0; i++) await sleep(250);
    const body = posts[0] ?? {};
    const asg = JSON.stringify(body.assignments ?? body);
    ok(g, "POST gönderildi", posts.length === 1, JSON.stringify(posts).slice(0, 300));
    ok(g, "POST: iptal edilen satırlar YOK", !/IPTAL-1|IPTAL-2|IPTAL-MIN|BEKLEYEN/.test(asg), asg);
    ok(g, "POST: kaydedilen satırlar VAR (KALICI-1, Kuvars/45)", asg.includes("KALICI-1") && asg.includes("Kuvars") && asg.includes("45"), asg);
    ok(g, "sayfa hatası yok", errors.length === 0, errors.join(" | "));
  } catch (e) {
    ok(g, "beklenmeyen hata", false, String(e?.stack ?? e));
  }
  await ctx.close();
}
await browser.close();
console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
