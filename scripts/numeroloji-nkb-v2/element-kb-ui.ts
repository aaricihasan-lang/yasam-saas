/**
 * D5-A (05.11.2026) — Element Bilgi Bankası bağlantısı: GERÇEK TARAYICI testi (Playwright; DB / prod SIFIR temas).
 * Tüm /api/** istekleri tarayıcıda sahte yanıtlanır; localhost dışı istekler iptal edilir.
 *   • Bilgi Bankası'nda "Ateş | FAZLA Destek" kaydı varsa: Bütüncül analiz (Sayısal Hesaplama) Elementler
 *     bölümünde yorum görünür; kayıt yokken "Bu sonuç için bilgi bankası kaydı bulunamadı" boş durumu korunur.
 *   • Element dışı tür (çakra) ile aynı değer eşleşmez.
 * Çalıştır: npx tsx scripts/numeroloji-nkb-v2/element-kb-ui.ts   (D5A_UI_URL ile hazır sunucu kullanılabilir)
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Route } from "playwright";

const PORT = Number(process.env.D5A_UI_PORT ?? 3994);
const APP = process.env.D5A_UI_URL ?? `http://127.0.0.1:${PORT}`;
let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: unknown, detail: unknown = ""): void {
  if (cond) pass++;
  else {
    fail++;
    fails.push(`${name}${detail !== "" ? `  → ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)}` : ""}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const USER = {
  id: "u-d5a-zz", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "tenant-d5a-zz", is_demo_account: false, module_permissions: { numerology: true, numeroloji: true, clients: true },
  full_name: "ZZ D5A Uzmanı", name: "ZZ D5A Uzmanı",
};
const KB = (id: string, analysis_type: string, value: string, description: string) => ({
  id, tenant_id: USER.tenant_id, analysis_type, value, source: "gizli-kaynak", description, updated_at: "2026-11-05T00:00:00.000Z", content_sections: null,
});
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function scenario(browser: Browser, kbRows: unknown[]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", u);
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {
      /* yok */
    }
  }, JSON.stringify(USER));
  const external: string[] = [];
  await ctx.route((u) => !u.href.startsWith(APP) && !u.href.startsWith("data:") && !u.href.startsWith("blob:"), (r) => {
    external.push(r.request().url());
    return r.abort();
  });
  await ctx.route((u) => u.href.startsWith(APP) && new URL(u.href).pathname.startsWith("/api/"), (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/auth/profile") return json(route, { profile: USER });
    if (p === "/api/auth/session") return json(route, { valid: true, ok: true });
    if (p === "/api/numeroloji/knowledge") return json(route, { ok: true, rows: kbRows });
    return json(route, { ok: true, rows: [], data: [], items: [] });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${APP}/numeroloji/analiz`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Örn. Hasan Ali").waitFor({ timeout: 90_000 });
  await page.getByPlaceholder("Örn. Hasan Ali").fill("Hasan Hüseyin");
  await page.getByPlaceholder("Örn. YILMAZ").fill("Arıcı");
  const d = page.getByPlaceholder("GG.AA.YYYY");
  await d.click();
  await d.pressSequentially("09091965", { delay: 15 });
  await page.getByRole("button", { name: /HESAPLA/ }).first().click();
  await page.getByText(/^Doğum: \d{2}\.\d{2}\.\d{4}$/).first().waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /sayısal hesaplama/i }).first().click();
  await sleep(1500);
  const text = await page.locator("main").innerText();
  const i = text.search(/\nELEMENTLER?\n/i);
  const section = i >= 0 ? text.slice(i, i + 1200) : "";
  await ctx.close();
  return { section, errors, external };
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    if (!process.env.D5A_UI_URL) {
      app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "-p", String(PORT), "-H", "127.0.0.1"], {
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59998", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "zz-dummy-anon", NEXT_PUBLIC_SUPABASE_ANON_KEY: "zz-dummy-anon", SUPABASE_SERVICE_ROLE_KEY: "zz-dummy-service" },
        stdio: "ignore",
      });
      console.log(`next dev başlatıldı (pid ${app.pid}, port ${PORT})`);
    }
    const t0 = Date.now();
    for (;;) {
      const r = await fetch(`${APP}/numeroloji/analiz`).catch(() => null);
      if (r && r.status < 500) break;
      if (Date.now() - t0 > 300_000) throw new Error("sunucu hazır değil");
      await sleep(2000);
    }
    browser = await chromium.launch();
    const withRows = await scenario(browser, [
      KB("e1", "element", "Ateş | FAZLA Destek", "ZZ-TEST Ateş fazlalığı yorumu"),
      KB("e2", "element", "Su | AZ Destek", "ZZ-TEST Su eksikliği yorumu"),
      KB("e3", "element", "Su | FAZLA Destek", "ZZ-TEST eşleşmemesi gereken Su FAZLA"),
      KB("c1", "cakra-omurga", "Ateş | FAZLA Destek", "ZZ-TEST yanlış tür eşleşmemeli"),
    ]);
    ok("kayıt var: Elementler bölümü bulundu", withRows.section.length > 0, withRows.section.slice(0, 120));
    ok("kayıt var: Ateş FAZLA yorumu görünür", withRows.section.includes("ZZ-TEST Ateş fazlalığı yorumu"), withRows.section.slice(0, 400));
    ok("kayıt var: Su AZ yorumu görünür", withRows.section.includes("ZZ-TEST Su eksikliği yorumu"));
    ok("kayıt var: eşleşmeyen değer (Su FAZLA) ve başka tür (çakra) görünmez", !withRows.section.includes("eşleşmemesi gereken") && !withRows.section.includes("yanlış tür"));
    ok("kayıt var: kaynak adı ekrana taşınmaz", !withRows.section.includes("gizli-kaynak"));
    // va.vercel-scripts.com analitik betikleri zaten iptal edilir (Klasik UI harness'ıyla aynı "bilgi" durumu).
    const ext = withRows.external.filter((u) => !u.startsWith("https://va.vercel-scripts.com/"));
    ok("kayıt var: sayfa hatası yok, analitik dışı dış istek yok", withRows.errors.length === 0 && ext.length === 0, { e: withRows.errors, x: ext.slice(0, 3) });
    const empty = await scenario(browser, []);
    ok("kayıt yok: 'bilgi bankası kaydı bulunamadı' boş durumu korunur", /Bu sonuç için bilgi bankası kaydı bulunamadı/.test(empty.section), empty.section.slice(0, 300));
    ok("kayıt yok: sayfa hatası yok", empty.errors.length === 0, empty.errors);
  } catch (e) {
    ok("akış istisnasız tamamlandı", false, String(e).slice(0, 800));
  } finally {
    await browser?.close().catch(() => {});
    if (app?.pid) spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  }
  console.log(`\nD5-A element Bilgi Bankası tarayıcı testi: ${pass} geçti, ${fail} kaldı`);
  if (fails.length) console.log(fails.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(fail ? 1 : 0);
}
void main();
