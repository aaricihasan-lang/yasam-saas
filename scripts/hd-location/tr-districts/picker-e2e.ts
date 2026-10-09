/**
 * HD — Türkiye 973 ilçe dizini · DOĞUM YERİ SEÇİCİ UÇTAN UCA (gerçek tarayıcı, gerçek bileşen).
 *
 * GERÇEK HdBirthLocationPicker + projenin Tailwind CSS'i; /api/* yanıtları Playwright ile taklit
 * edilir ve Roxy konum ucu (/api/hd/location/search) SAYILIR. Gerçek Roxy çağrısı YOK.
 *   • Türkiye ilçeleri (Karesi, Altıeylül, Çumra, Kadıköy, vekil Muratpaşa) yerel listeden, Roxy 0
 *   • Yurt dışı (Berlin) dünya listesinden; açık "İlçe / şehir ara" yurt dışı için çalışmaya devam eder
 *   • 375 / 390 px ve masaüstü: liste ekran içinde, yatay kaydırma yok
 *
 * Çalıştır: npm run hd:tr-districts:e2e [-- outDir]
 */

import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = process.argv[2] || join(tmpdir(), "hd-tr-district-e2e");
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const STUB = join(ROOT, "scripts/hd-location/tr-districts/.picker-yasamUser-stub.ts");

async function bundle(): Promise<string> {
  writeFileSync(
    STUB,
    `export * from "${join(ROOT, "lib/auth/yasamUser").replace(/\\/g, "/")}";
     export function readYasamUser() { return { id: "u1" } as any; }
     export function readSessionToken() { return "test-token"; }`,
  );
  const res = await build({
    stdin: {
      contents: `import { createElement as h, useState } from "react";
        import { createRoot } from "react-dom/client";
        import { HdBirthLocationPicker } from "./app/human-design/components/HdBirthLocationPicker";
        function Picker() {
          const [v, setV] = useState<any>(null);
          return h("div", null, h(HdBirthLocationPicker, { id: "loc", value: v, onChange: setV }),
            h("p", { id: "picked" }, v ? v.id + " | " + v.label + " | " + v.tz : "—"));
        }
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
  const out = join(OUT, "tw-out.css");
  execSync(`npx tailwindcss -c tailwind.config.js -i "./app/globals.css" -o "${out}" --content "./app/human-design/components/HdBirthLocationPicker.tsx"`, { cwd: ROOT, stdio: "ignore" });
  return readFileSync(out, "utf8");
}

async function main() {
  const [js, css] = [await bundle(), tailwindCss()];
  ok("istemci paketinde ilçe koordinatı yok (sunucu veri seti pakete girmedi)", !js.includes("geonames:") && !js.includes("il-merkezi-vekil") && !js.includes("39.6492"));
  const PAGE = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body class="bg-slate-50 p-4"><div id="root" style="max-width:520px;min-height:480px"></div><script>${js}</script></body></html>`;
  const server = createServer((req, res) => {
    if ((req.url ?? "/") === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();
  const external: string[] = [];

  async function open(viewport: { width: number; height: number }) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const c = { roxyLocation: 0 };
    page.on("request", (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")) external.push(u); });
    await page.route(`${base}/api/**`, async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/api/hd/location/search") {
        c.roxyLocation++;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, results: [{ ref: "rx1.test.sig", id: "rx-fr-x-giverny", label: "Giverny, Normandie, France", tz: "Europe/Paris" }] }) });
      }
      if (u.pathname === "/api/location/search") {
        const q = (u.searchParams.get("q") ?? "").toLowerCase();
        const results = q.startsWith("berl")
          ? [{ id: "geo-2950159", name: "Berlin", country: "Germany", countryCode: "DE", adminRegion: "Berlin", lat: 52.52, lon: 13.405, elev: 0, tz: "Europe/Berlin", source: "geonames", verified: true, origin: "bundled" }]
          : [];
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, results }) });
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    });
    await page.goto(base);
    return { page, c };
  }

  try {
    for (const vp of [{ width: 375, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      console.log(`\n—— ${vp.width}px`);
      const { page, c } = await open(vp);
      const input = page.locator("#loc");
      const typeAndWait = async (q: string) => {
        await input.fill("");
        await input.pressSequentially(q, { delay: 30 });
        await page.waitForTimeout(1600); // dünya araması (250 ms) + eski otomatik arama penceresi (450 ms) geçsin
      };

      await typeAndWait("Karesi");
      const karesi = page.getByRole("option", { name: /Karesi, Balıkesir, Türkiye/ });
      ok(`${vp.width}px: 'Karesi' yerel sonuç olarak listelenir`, (await karesi.count()) === 1 && (await karesi.getAttribute("data-hd-location-source")) === "local");
      const panel = page.locator("[data-hd-location-panel]");
      const box = await panel.boundingBox();
      ok(`${vp.width}px: liste ekran içinde, yatay kaydırma yok`, !!box && box.x >= 0 && box.x + box.width <= vp.width + 0.5 && (await page.evaluate(() => document.documentElement.scrollWidth)) <= vp.width);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `karesi-${vp.width}.png`) });
      await panel.screenshot({ path: join(OUT, `karesi-panel-${vp.width}.png`) });
      await karesi.click();
      ok(`${vp.width}px: Karesi seçildi (yerel kimlik, Europe/Istanbul)`, (await page.locator("#picked").textContent()) === "trd-10-karesi | Karesi, Balıkesir, Türkiye | Europe/Istanbul");

      for (const [q, label] of [["Altıeylül", "Altıeylül, Balıkesir, Türkiye"], ["cumra", "Çumra, Konya, Türkiye"], ["Kadıköy", "Kadıköy, İstanbul, Türkiye"], ["Muratpaşa", "Muratpaşa, Antalya, Türkiye"]] as const) {
        await typeAndWait(q);
        ok(`${vp.width}px: '${q}' → ${label}`, (await page.getByRole("option", { name: label }).count()) === 1);
      }
      ok(`${vp.width}px: Türkiye aramalarında Roxy konum isteği 0`, c.roxyLocation === 0, String(c.roxyLocation));

      await typeAndWait("Berlin");
      ok(`${vp.width}px: yurt dışı (Berlin) dünya listesinden gelir`, (await page.getByRole("option", { name: /Berlin, Germany/ }).count()) === 1 && c.roxyLocation === 0);
      await typeAndWait("Giverny");
      await page.getByRole("button", { name: /İlçe \/ şehir ara/ }).click();
      await page.getByRole("option", { name: /Giverny, Normandie, France/ }).waitFor();
      ok(`${vp.width}px: yurt dışı açık arama çalışır (1 istek)`, c.roxyLocation === 1);
      await page.getByRole("option", { name: /Giverny/ }).click();
      ok(`${vp.width}px: yurt dışı sonuç seçilir (saat dilimi korunur)`, ((await page.locator("#picked").textContent()) ?? "").endsWith("Giverny, Normandie, France | Europe/Paris"));
      await page.context().close();
    }
    ok("harici ağ isteği yok", external.length === 0, external.join(", "));
  } finally {
    await browser.close();
    server.close();
    rmSync(STUB, { force: true });
  }
}

main()
  .then(() => {
    console.log(`\nHD TR İLÇE SEÇİCİ E2E: ${pass} PASS / ${fail} FAIL  (çıktı: ${OUT})`);
    process.exitCode = fail === 0 ? 0 : 1;
  })
  .catch((e) => { console.error(e); rmSync(STUB, { force: true }); process.exitCode = 1; });
