/**
 * KİŞİSEL DİJİTAL OFİS — KDO-01…06 önce / sonra ekran görüntüleri (Playwright, yerel sunucu, ağ-mock).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/workspace/* → ui-personal-backend.ts (bellekte); diğer /api/* sentetik;
 * 127.0.0.1 dışı abort. CI listesinde DEĞİL (çalışan sunucu ister).
 *   UI_BASE=http://127.0.0.1:3972 UI_SHOTS=<klasör> npx tsx scripts/workspace/ui-kdo-shots.ts
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";
import { parseDesign, type UiPrefs, type WorkspaceDesign } from "../../lib/workspace/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3972";
const OUT = process.env.UI_SHOTS ?? "kdo-shots";
const SAMPLES = process.env.UI_SAMPLES ?? "C:/YasamSistemi-Gorsel-Tasarim/kisisel-calisma-alani-p0-son-kabul/assets/ornek";
const FIXED_TIME = new Date("2026-11-02T09:30:00+03:00");
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const ALL = ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
  "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar", "cupping",
  "beslenme", "yasam_hafizasi", "astrology"];
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "Deniz",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: false,
  module_permissions: Object.fromEntries(ALL.map((k) => [k, true])),
};

const design = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`${r.error} ${r.path}`); return r.value; };

let browser: Browser;
async function open(mock: WorkspaceMock, vp: { width: number; height: number }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
    } catch { /* */ }
  }, USER);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port !== new URL(BASE).port) return route.fulfill({ status: 200, json: [] });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.startsWith("/api/settings/workspace")) {
      const r = await mock.handle(req.method(), url.pathname, url.searchParams, req.postDataBuffer());
      return r.body ? route.fulfill({ status: r.status, body: r.body, contentType: r.contentType }) : route.fulfill({ status: r.status, json: r.json });
    }
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  return page;
}
async function settle(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForTimeout(900);
}
async function home(page: Page) {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForSelector('[data-testid="home-hub-grid"] h3', { timeout: 180000 });
  await page.waitForSelector('[data-testid="home-view-mode"]', { timeout: 60000 });
  await settle(page);
}
async function studio(page: Page) {
  await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  await page.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { timeout: 180000 });
  await settle(page);
}
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });

type Scene = { name: string; applied?: unknown; prefs?: Partial<UiPrefs>; vp?: { width: number; height: number }; then?: (p: Page) => Promise<void>; studio?: boolean };

async function main() {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
  const logoBytes = readFileSync(join(SAMPLES, "logo-bedenin-frekansi-yatay.png"));
  const D = { width: 1440, height: 900 };
  const M = { width: 390, height: 844 };
  const scenes: Scene[] = [
    { name: "01-gece-varsayilan-1440", prefs: { viewMode: "night" } },
    { name: "01-gece-varsayilan-390", prefs: { viewMode: "night" }, vp: M },
    { name: "01-gece-A-varsayilan-1440", applied: { layout: "A" }, prefs: { viewMode: "night" } },
    { name: "01-gece-C-varsayilan-1440", applied: { layout: "C" }, prefs: { viewMode: "night" } },
    { name: "02-A-varsayilan-1440", applied: { layout: "A" } },
    { name: "02-B-varsayilan-1440", applied: { layout: "B" } },
    { name: "02-C-varsayilan-1440", applied: { layout: "C" } },
    { name: "02-B-varsayilan-390", applied: { layout: "B" }, vp: M },
    {
      name: "03-hizalama-1440",
      applied: { layout: "A", text: { useGreeting: false, align: "left", lines: [
        { id: "l1", role: "title", text: "Bioasera", align: "center" },
        { id: "l2", role: "subtitle", text: "Kendini Keşfet", align: "left" },
        { id: "l3", role: "body", text: "Bütünsel danışmanlık merkezi", align: "right" },
      ] } },
    },
    {
      name: "03-hizalama-ortak-1440",
      applied: { layout: "A", text: { useGreeting: false, align: "center", lines: [
        { id: "l1", role: "title", text: "Bioasera" }, { id: "l2", role: "subtitle", text: "Kendini Keşfet" }, { id: "l3", role: "body", text: "Bütünsel danışmanlık merkezi" },
      ] } },
    },
    { name: "04-C-marka-zemin-tonu-1440", applied: { layout: "C", brand: { accent: "#6d28d9", soft: "#e8f3ec", ink: "#1e1638", accent2: "#a78bfa", name: "Özel" } } },
    { name: "04-C-zemin-1440", applied: { layout: "C", brand: { accent: "#6d28d9", soft: "#e8f3ec", ink: "#1e1638", accent2: "#a78bfa", name: "Özel" }, text: { surface: "#e8f3ec" } } },
    { name: "05-studio-logo-1440", logo: true, studio: true, then: async (p) => { await p.locator('[role="dialog"] [role="tab"]').nth(1).click(); await p.waitForTimeout(500); } } as Scene & { logo: boolean },
    { name: "05-logo-sol-menu-1440", logo: true, applied: "side" } as Scene & { logo: boolean },
    { name: "06-gorunum-menusu-1440", then: async (p) => { await p.locator('[data-testid="home-view-mode"]').click(); await p.waitForTimeout(400); } },
    { name: "06-studio-gorunum-1440", studio: true, then: async (p) => { await p.locator('[role="dialog"] [role="tab"]').nth(3).click(); await p.waitForTimeout(400); } },
    { name: "06-eski-okuma-kaydi-1440", prefs: { viewMode: "reading" as UiPrefs["viewMode"] } },
  ];
  for (const sc of scenes as (Scene & { logo?: boolean })[]) {
    const mock = createWorkspaceMock({ enabled: true });
    let applied: WorkspaceDesign | null = null;
    try {
      if (sc.logo) {
        const id = await mock.seedAsset("logo", logoBytes, "logo.png", "image/png");
        if (sc.applied === "side") applied = design({ layout: "A", logo: { assetId: id, layout: { desktop: { zone: "side", x: 0.5, y: 0.35, w: 0.8 }, mobile: { zone: "page", x: 1, y: 8, w: 0.3 } } } });
        else applied = design({ layout: "A", logo: { assetId: id } });
      } else if (sc.applied) applied = design(sc.applied);
    } catch (e) {
      console.log(`⏭  ${sc.name}: bu sürümde şema kabul etmiyor (${(e as Error).message})`);
      continue;
    }
    mock.seed({ applied, prefs: sc.prefs });
    const page = await open(mock, sc.vp ?? D);
    try {
      if (sc.studio) await studio(page); else await home(page);
      if (sc.then) await sc.then(page);
      await shot(page, sc.name);
      console.log(`📸 ${sc.name}`);
    } catch (e) {
      console.log(`❌ ${sc.name}: ${(e as Error).message.slice(0, 200)}`);
    } finally {
      await page.context().close();
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
