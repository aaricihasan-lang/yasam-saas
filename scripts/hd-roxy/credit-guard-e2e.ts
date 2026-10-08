/**
 * HD — RoxyAPI kullanım hakkı koruması · İSTEMCİ UÇTAN UCA (gerçek tarayıcı, gerçek bileşenler).
 *
 *   P2-1  "Yeniden Hesapla" (doğum bilgisi değişti) → açık onay; iptal = hesaplama isteği 0.
 *         İlk "Hesapla" ek onay istemez. Kayıtlı analizi açmak hesaplama isteği göndermez.
 *   P3-1  Doğum yeri yazarken RoxyAPI konum araması OTOMATİK başlamaz; yalnız "İlçe / şehir ara".
 *
 * GERÇEK HdAutoCalcPanel + HdBirthLocationPicker + ConfirmProvider/ToastProvider + projenin Tailwind
 * CSS'i. Oturum okuyucusu test kullanıcısına bağlanır; tüm /api/* yanıtları Playwright ile taklit
 * edilir ve Roxy'ye giden iki uç (POST /api/hd/charts/roxy, /api/hd/location/search) SAYILIR.
 * Gerçek Roxy çağrısı YOK.
 *
 * Çalıştır: npm run hd:roxy:credit-e2e [-- outDir]
 */

import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";
import { HD_RECALC_CONFIRM_MESSAGE } from "../../app/human-design/danisanlar/components/HdAutoCalcPanel";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || join(ROOT, ".hd-credit-e2e");
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const STUB = join(ROOT, "scripts/hd-roxy/.credit-yasamUser-stub.ts");

async function bundle(): Promise<string> {
  writeFileSync(
    STUB,
    `export * from "${join(ROOT, "lib/auth/yasamUser").replace(/\\/g, "/")}";
     export function readYasamUser() { return (window as any).__user ?? null; }
     export function readSessionToken() { return "test-token"; }`,
  );
  const res = await build({
    stdin: {
      contents: `import { createElement as h, useState } from "react";
        import { createRoot } from "react-dom/client";
        import { ToastProvider } from "./components/ui/ToastProvider";
        import { ConfirmProvider } from "./components/ui/ConfirmProvider";
        import { HdAutoCalcPanel } from "./app/human-design/danisanlar/components/HdAutoCalcPanel";
        import { HdBirthLocationPicker } from "./app/human-design/components/HdBirthLocationPicker";
        function Picker() {
          const [v, setV] = useState<any>(null);
          return h("div", null, h(HdBirthLocationPicker, { id: "loc", value: v, onChange: setV }),
            h("p", { id: "picked" }, v ? v.label + " | " + v.tz : "—"));
        }
        (window as any).__mountPanel = (props: any) =>
          createRoot(document.getElementById("root")!).render(h(ToastProvider, null, h(ConfirmProvider, null, h(HdAutoCalcPanel, props))));
        (window as any).__mountPicker = () =>
          createRoot(document.getElementById("root")!).render(h(Picker));`,
      resolveDir: ROOT,
      loader: "tsx",
    },
    bundle: true,
    format: "iife",
    write: false,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
    tsconfig: join(ROOT, "tsconfig.json"),
    plugins: [{
      name: "yasamUser-stub",
      setup(b) { b.onResolve({ filter: /^@\/lib\/auth\/yasamUser$/ }, (a) => (a.importer === STUB ? undefined : { path: STUB })); },
    }],
  });
  return res.outputFiles[0].text;
}

function tailwindCss(): string {
  const input = join(OUT, "tw-in.css");
  const out = join(OUT, "tw-out.css");
  writeFileSync(input, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  const content = [
    "./app/human-design/danisanlar/components/HdAutoCalcPanel.tsx",
    "./app/human-design/components/HdBirthLocationPicker.tsx",
    "./components/ui/ConfirmProvider.tsx",
    "./components/ui/ToastProvider.tsx",
  ].join(",");
  execSync(`npx tailwindcss -c tailwind.config.js -i "${input}" -o "${out}" --content "${content}"`, { cwd: ROOT, stdio: "ignore" });
  const globals = readFileSync(join(ROOT, "app/globals.css"), "utf8").replace(/@tailwind[^;]+;/g, "").replace(/@import[^;]+;/g, "");
  return readFileSync(out, "utf8") + "\n" + globals;
}

const ROW_BASE = {
  id: "11111111-2222-4333-8444-555555555555",
  client_id: "c-1",
  client_name: "Elif Şahin",
  birth_date: "2018-07-20",
  birth_time: "19:00:00",
  birth_place: "Konya, Türkiye",
  timezone: "Europe/Istanbul",
  location_id: "tr-konya",
  engine_version: "roxyapi-bodygraph-1",
  source: "computed",
  created_at: "2026-10-08T10:00:00.000Z",
};
const PANEL_PROPS = {
  clientId: "c-1",
  birthDate: "2018-07-20",
  birthTime: "19:00",
  birthPlace: "Konya, Türkiye",
  pickedLocation: null,
  storedLocation: { id: "client", label: "Konya, Türkiye", tz: "Europe/Istanbul", locationId: "tr-konya" },
  formDirty: false,
};

async function main() {
  const [js, css] = [await bundle(), tailwindCss()];
  const PAGE = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body class="bg-slate-50 p-4"><div id="root" style="max-width:420px"></div><script>${js}</script></body></html>`;
  const server = createServer((req, res) => {
    if ((req.url ?? "/") === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();

  type Counters = { compute: number; roxyLocation: number; chartGet: number; other: string[] };
  const external: string[] = [];
  async function open(viewport = { width: 1280, height: 900 }) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const c: Counters = { compute: 0, roxyLocation: 0, chartGet: 0, other: [] };
    let rows: Record<string, unknown>[] = [];
    page.on("request", (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")) { c.other.push(u); external.push(u); } });
    await page.route(`${base}/api/**`, async (route) => {
      const u = new URL(route.request().url());
      const m = route.request().method();
      if (u.pathname === "/api/hd/charts/roxy" && m === "POST") {
        c.compute++;
        const id = "99999999-2222-4333-8444-555555555555";
        rows = [{ ...ROW_BASE, id, birth_time: "19:30:00", created_at: "2026-10-08T12:00:00.000Z" }, ...rows];
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id, reused: false }) });
      }
      if (u.pathname === "/api/hd/location/search") {
        c.roxyLocation++;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, results: [{ ref: "rx1.test.sig", label: "Fatih, İstanbul, Türkiye", tz: "Europe/Istanbul" }] }) });
      }
      if (u.pathname === "/api/location/search") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, results: [] }) });
      }
      if (u.pathname === "/api/hd/charts" && u.searchParams.get("id")) {
        c.chartGet++;
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "test: detay gövdesi gerekmiyor" }) });
      }
      if (u.pathname === "/api/hd/charts") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: rows }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, rows: [], data: [] }) });
    });
    await page.goto(base);
    await page.evaluate(() => { (window as unknown as { __user: unknown }).__user = { id: "u1", role: "expert", membership_status: "active", module_permissions: { human_design: true } }; });
    return { page, c, setRows: (r: Record<string, unknown>[]) => { rows = r; } };
  }
  const mountPanel = (page: Page, props: Record<string, unknown>) =>
    page.evaluate((p) => (window as unknown as { __mountPanel: (x: unknown) => void }).__mountPanel(p), props);

  try {
    console.log("\n—— 1. İlk hesaplama: ek onay YOK");
    {
      const { page, c, setRows } = await open();
      setRows([]);
      await mountPanel(page, PANEL_PROPS);
      await page.getByRole("button", { name: "Human Design Haritasını Hesapla" }).click();
      await page.waitForTimeout(400);
      ok("onay penceresi açılmadı", (await page.getByRole("alertdialog").count()) === 0 && (await page.getByText(HD_RECALC_CONFIRM_MESSAGE).count()) === 0);
      ok("hesaplama isteği doğrudan gönderildi (1)", c.compute === 1);
      await page.context().close();
    }

    console.log("\n—— 2. Yeniden Hesapla: onay · iptal · onay");
    for (const vp of [{ width: 1280, height: 900 }, { width: 375, height: 740 }, { width: 390, height: 844 }]) {
      const { page, c, setRows } = await open(vp);
      setRows([ROW_BASE]); // kayıtlı harita 19:00; danışan 19:30 → "changed"
      await mountPanel(page, { ...PANEL_PROPS, birthTime: "19:30" });
      await page.getByRole("button", { name: "Yeniden Hesapla" }).click();
      const dlg = page.getByRole("alertdialog");
      await dlg.waitFor();
      ok(`${vp.width}px: onay penceresi ve tam mesaj`, await dlg.getByText(HD_RECALC_CONFIRM_MESSAGE).isVisible());
      const box = await dlg.boundingBox();
      ok(`${vp.width}px: pencere ekran içinde, yatay kaydırma yok`, !!box && box.x >= 0 && box.x + box.width <= vp.width + 0.5 && (await page.evaluate(() => document.documentElement.scrollWidth)) <= vp.width);
      await page.screenshot({ path: join(OUT, `recalc-confirm-${vp.width}.png`) });
      // Pencere açıkken ikinci tıklama ikinci pencere/istek üretmez.
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Yeniden Hesapla");
        b?.click(); // pencere açıkken ikinci tıklama (çift tıklama) doğrudan butona
      });
      await page.waitForTimeout(200);
      ok(`${vp.width}px: çift tıklama ikinci pencere açmaz`, (await page.getByRole("alertdialog").count()) === 1);
      await dlg.getByRole("button", { name: "Vazgeç" }).click();
      await page.waitForTimeout(400);
      ok(`${vp.width}px: iptal → hesaplama isteği 0`, c.compute === 0);
      await page.getByRole("button", { name: "Yeniden Hesapla" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Devam et" }).click();
      await page.waitForTimeout(600);
      ok(`${vp.width}px: onay → mevcut hesaplama akışı (1 istek)`, c.compute === 1);
      await page.context().close();
    }

    console.log("\n—— 3. Kayıtlı analizi açma: hesaplama isteği 0");
    {
      const { page, c, setRows } = await open();
      setRows([ROW_BASE]);
      await mountPanel(page, PANEL_PROPS); // aynı girdi → "open"
      await page.getByRole("button", { name: "Profesyonel Haritayı Aç" }).click();
      await page.waitForTimeout(500);
      ok("açma: onay yok, hesaplama 0, yalnız kayıtlı okuma (GET ?id)", (await page.getByText(HD_RECALC_CONFIRM_MESSAGE).count()) === 0 && c.compute === 0 && c.chartGet >= 1);
      await page.context().close();
    }

    console.log("\n—— 4. Konum: yazarken Roxy 0 · yalnız açık arama");
    {
      const { page, c } = await open();
      await page.evaluate(() => (window as unknown as { __mountPicker: () => void }).__mountPicker());
      const input = page.locator("#loc");
      await input.click();
      await input.pressSequentially("fatih", { delay: 60 });
      await page.waitForTimeout(2500);
      await input.pressSequentially(" camii", { delay: 60 });
      await page.waitForTimeout(2500);
      ok("yerel sonuç yokken bile yazarken Roxy konum isteği 0", c.roxyLocation === 0, String(c.roxyLocation));
      await page.screenshot({ path: join(OUT, "location-typing.png") });
      await page.getByRole("button", { name: /İlçe \/ şehir ara/ }).click();
      await page.getByRole("option", { name: /Fatih, İstanbul, Türkiye/ }).waitFor();
      ok("'İlçe / şehir ara' → 1 istek, sonuç listelendi", c.roxyLocation === 1);
      await page.getByRole("option", { name: /Fatih, İstanbul, Türkiye/ }).click();
      ok("sonuç seçilir; saat dilimi korunur", (await page.locator("#picked").textContent()) === "Fatih, İstanbul, Türkiye | Europe/Istanbul");
      await input.fill("");
      await input.pressSequentially("konya", { delay: 40 });
      await page.waitForTimeout(800);
      ok("yerel il listesi kredisiz çalışmaya devam eder (Konya), Roxy 1'de kalır", (await page.getByRole("option", { name: /Konya/ }).count()) > 0 && c.roxyLocation === 1);
      await page.context().close();
    }

    console.log("\n—— 5. Ağ");
    ok("harici (Roxy/CDN) ağ isteği yok", external.length === 0, external.join(", "));
  } finally {
    await browser.close();
    server.close();
    rmSync(STUB, { force: true });
  }
}

main()
  .then(() => {
    console.log(`\nHD ROXY CREDIT GUARD E2E: ${pass} PASS / ${fail} FAIL  (çıktı: ${OUT})`);
    process.exitCode = fail === 0 ? 0 : 1;
  })
  .catch((e) => { console.error(e); rmSync(STUB, { force: true }); process.exitCode = 1; });
