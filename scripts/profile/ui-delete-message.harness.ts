/**
 * UZMAN PROFİLİ (F2) — Kişisel Dijital Ofis görsel silme uyarısı UI testi (Playwright; yerel production build + `next start`; API mock'lu).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/workspace/* istekleri scripts/workspace/ui-personal-backend.ts ile karşılanır; görsel
 * silme (DELETE) yanıtları gerçek sunucunun (lib/workspace/assets.ts deleteAsset + route) ürettiği gövdelerle aynı biçimde
 * senaryo başına verilir; 127.0.0.1 dışı istekler abort. CI listesinde DEĞİL (build + sunucu ister).
 *   UI_BASE=http://127.0.0.1:3984 UI_OUT=<klasör> [UI_MODE=main] npx tsx scripts/profile/ui-delete-message.harness.ts
 * Senaryolar (TR + EN):
 *   1 yalnız tasarım (geçmiş tasarım 1) → F2 öncesi metin BİREBİR (UI_MODE=main: main build'de AYNI metin; kanıt eşitliği)
 *   2 yalnız rapor logosu → "Önce rapor logosundan kaldırın."
 *   3 tasarım + rapor logosu → "Önce tasarımlardan ve rapor logosundan kaldırın."
 *   4 beklenmeyen sunucu hatası (expert_profiles arızası → 500 güvenli metin) → görsel listede kalır; ikinci denemede silinir
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, type Browser } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "../workspace/ui-personal-backend";
import { parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3984";
const SINK_PORT = process.env.UI_SINK_PORT ?? "54399";
const OUT = process.env.UI_OUT ?? "profil-silme-ui";
const MODE = process.env.UI_MODE === "main" ? "main" : "dal";
mkdirSync(OUT, { recursive: true });
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const REPORT = "rapor logosu (Ayarlar › Profilim)";
const USER = {
  id: "00000000-0000-4000-8000-0000000000f2", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe", role: "expert",
  active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-0000000000f2",
  is_demo_account: false, module_permissions: { clients: true, numerology: true, human_design: true },
};

let pass = 0, fail = 0;
const fails: string[] = [];
const results: Record<string, string> = {};
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "PASS" : "FAIL"} [${group}] ${name}${!cond && detail !== "" ? `  → ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}
const design = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`${r.error} ${r.path}`); return r.value; };
const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r, g: 90, b: 60, alpha: 1 } } }).png().toBuffer();
async function waitFor(cond: () => boolean | Promise<boolean>, ms = 15000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}

type Reply = { status: number; json: unknown };
const serverBody = (where: string[]): Reply => {
  const report = where.includes(REPORT);
  const hint = !report ? "önce tasarımdan kaldırın." : where.length === 1 ? "önce rapor logosundan kaldırın." : "önce tasarımdan ve rapor logosundan kaldırın.";
  return { status: 409, json: { ok: false, code: "asset_in_use", error: `Bu görsel kullanılıyor (${where.join(", ")}); ${hint}`, where } };
};
const SAFE_500: Reply = { status: 500, json: { ok: false, error: "İşlem sırasında bir hata oluştu.", ref: "8f1d2c3b-0000-4000-8000-00000000abcd" } };

let browser: Browser;

async function run(locale: "tr" | "en") {
  const L = locale.toUpperCase();
  const mock: WorkspaceMock = createWorkspaceMock({ enabled: true });
  const a1 = await mock.seedAsset("logo", await png(800, 300, 10), "tasarim.png", "image/png");
  const a2 = await mock.seedAsset("logo", await png(600, 200, 40), "rapor.png", "image/png");
  const a3 = await mock.seedAsset("logo", await png(500, 500, 80), "ikisi.png", "image/png");
  const a4 = await mock.seedAsset("logo", await png(400, 400, 120), "serbest.png", "image/png");
  mock.seed({ applied: design({ layout: "B" }) });
  const plan = new Map<string, Reply[]>([
    [a1, [serverBody(["geçmiş tasarım 1"])]],
    [a2, [serverBody([REPORT])]],
    [a3, [serverBody(["geçmiş tasarım 1", REPORT])]],
    [a4, [SAFE_500]],
  ]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: locale === "en" ? "en-US" : "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: BASE }]);
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch { /* */ }
  }, USER);
  const deletes: { id: string; status: number }[] = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === SINK_PORT || !url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/settings/workspace")) {
      const m = url.pathname.match(/^\/api\/settings\/workspace\/assets\/([0-9a-f-]{36})$/);
      if (m && req.method() === "DELETE" && plan.get(m[1])?.length) {
        const r = plan.get(m[1])!.shift()!;
        deletes.push({ id: m[1], status: r.status });
        return route.fulfill({ status: r.status, json: r.json });
      }
      const r = await mock.handle(req.method(), url.pathname, url.searchParams, req.postDataBuffer());
      if (m && req.method() === "DELETE") deletes.push({ id: m[1], status: r.status });
      return r.body ? route.fulfill({ status: r.status, body: r.body, contentType: r.contentType }) : route.fulfill({ status: r.status, json: r.json });
    }
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname.endsWith("/astroloji/access")) return route.fulfill({ status: 404, json: { error: "not_found" } });
    if (url.pathname.startsWith("/api/beslenme")) return route.fulfill({ status: 403, json: { ok: true, access: false } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  const studio = page.locator('[role="dialog"][aria-labelledby="studio-title"]');
  await studio.waitFor({ timeout: 90000 });
  await page.addStyleTag({ content: FREEZE_CSS });
  await studio.getByRole("tab", { name: locale === "en" ? /Logo & Photo|Logo · Photo/ : /Logo ve Fotoğraf|Logo · Foto/ }).click();
  await studio.getByRole("button", { name: locale === "en" ? /Show my images/ : /Görsellerimi göster/ }).first().click();
  await studio.locator("li", { hasText: "800×300" }).first().waitFor({ timeout: 20000 });

  const notice = async () => ((await studio.locator('[role="status"], [role="alert"]').allInnerTexts()).join(" | "));
  async function del(dim: string): Promise<void> {
    const li = studio.locator("li", { hasText: dim }).first();
    await li.getByRole("button", { name: locale === "en" ? /^Delete/ : /^Sil/ }).click();
    await page.getByRole("button", { name: locale === "en" ? /^Yes, delete$/ : /^Evet, sil$/ }).click();
  }
  async function scenario(id: string, dim: string, expected: string, shot: string) {
    await del(dim);
    const seen = await waitFor(async () => (await notice()).includes(expected));
    const text = await notice();
    results[`${MODE}-${L}-${id}`] = text;
    await studio.locator('[role="status"], [role="alert"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: join(OUT, `${MODE}-${locale}-${shot}.png`) });
    return { seen, text };
  }

  const exp = locale === "en"
    ? {
      s1: "This image is in use: geçmiş tasarım 1. Remove it from those designs first.",
      s2: `This image is in use: ${REPORT}. Remove it from the report logo first.`,
      s3: `This image is in use: geçmiş tasarım 1, ${REPORT}. Remove it from those designs and the report logo first.`,
      ok: "Image deleted.",
    }
    : {
      s1: "Bu görsel kullanılıyor: geçmiş tasarım 1. Önce tasarımlardan kaldırın.",
      s2: `Bu görsel kullanılıyor: ${REPORT}. Önce rapor logosundan kaldırın.`,
      s3: `Bu görsel kullanılıyor: geçmiş tasarım 1, ${REPORT}. Önce tasarımlardan ve rapor logosundan kaldırın.`,
      ok: "Görsel silindi.",
    };

  const s1 = await scenario("1-tasarim", "800×300", exp.s1, "1-yalniz-tasarim");
  ok(L, `1 yalnız tasarım → F2 öncesi metin birebir: "${exp.s1}"`, s1.seen, s1.text);
  ok(L, "1 görsel listede kaldı", (await studio.locator("li", { hasText: "800×300" }).count()) === 1);
  if (MODE === "main") { await ctx.close(); return; }

  const s2 = await scenario("2-rapor", "600×200", exp.s2, "2-yalniz-rapor-logosu");
  ok(L, `2 yalnız rapor logosu → "${exp.s2}"`, s2.seen, s2.text);
  const s3 = await scenario("3-ikisi", "500×500", exp.s3, "3-tasarim-ve-rapor-logosu");
  ok(L, `3 tasarım + rapor logosu → "${exp.s3}"`, s3.seen, s3.text);
  ok(L, "2–3 görseller listede kaldı", (await studio.locator("li", { hasText: "600×200" }).count()) === 1 && (await studio.locator("li", { hasText: "500×500" }).count()) === 1);

  const s4 = await scenario("4-hata", "400×400", "İşlem sırasında bir hata oluştu.", "4-sunucu-hatasi");
  ok(L, "4 beklenmeyen sunucu hatası → güvenli sabit metin (iç ayrıntı / ref gösterilmez)", s4.seen && !/expert_profiles|Profil okunamadı|8f1d2c3b/.test(s4.text), s4.text);
  ok(L, "4 görsel listede kaldı (silinmedi)", (await studio.locator("li", { hasText: "400×400" }).count()) === 1 && mock.assetCount === 4);
  const s5 = await scenario("5-tekrar", "400×400", exp.ok, "5-hata-sonrasi-silme");
  ok(L, "5 sorun geçince aynı silme başarılı", s5.seen && (await waitFor(async () => (await studio.locator("li", { hasText: "400×400" }).count()) === 0)) && mock.assetCount === 3, s5.text);
  ok(L, "DELETE sırası: 409, 409, 409, 500, 200", JSON.stringify(deletes.map((d) => d.status)) === "[409,409,409,500,200]", deletes);
  ok(L, "sayfa hatası yok", errors.length === 0, errors);
  await ctx.close();
}

(async () => {
  browser = await chromium.launch();
  try {
    await run("tr");
    await run("en");
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUT, `${MODE}-metinler.json`), JSON.stringify(results, null, 2));
  console.log(`\nprofile ui-delete-message (${MODE}): ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log(fails.join("\n"));
  if (fail) process.exit(1);
})();
