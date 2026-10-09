/**
 * HD AŞAMA 4B — Profesyonel Word butonu · İSTEMCİ AKIŞI UÇTAN UCA (gerçek tarayıcı).
 *
 * GERÇEK bileşen (HdProfessionalReportButton) + GERÇEK self-host Roxy renderer + projenin Tailwind
 * CSS'i ile çalışır. Yalnız oturum okuyucusu (readYasamUser) test kullanıcısına bağlanır ve API
 * yanıtları Playwright route'u ile taklit edilir (sunucu tarafı v2-harness'te ayrıca test edilir).
 *
 * Doğrular: yetkili uzmanda seçim penceresi (varsayılan Her ikisi) · yetkisizde pencere YOK ·
 * Sistem verisi olmayan haritada yalnız Uzman seçilebilir + açık bilgi · istek gövdesi (commentary +
 * ≥1800 px PNG) · DOCX indirme · BodyGraph başarısızsa açık "olmadan oluştur" onayı · redaksiyon
 * bildirimi · mobil 375/390 px'de pencere taşmaz · Android'de buton YOK · harici ağ isteği YOK.
 *
 * Çalıştır: npx tsx scripts/hd-word-report/ui-flow-e2e.ts [outDir]
 */

import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";
import { buildRoxyRenderPayload } from "../../lib/human-design/providers/roxy/render";
import { validateBodygraphPng } from "../../lib/human-design/reporting/bodygraphPng";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || join(ROOT, ".hd-word-e2e");
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const fixture = JSON.parse(readFileSync(join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"));
const renderData = buildRoxyRenderPayload(fixture)!;

async function bundle(): Promise<string> {
  const stub = join(ROOT, "scripts/hd-word-report/.ui-yasamUser-stub.ts");
  writeFileSync(
    stub,
    `export * from "${join(ROOT, "lib/auth/yasamUser").replace(/\\/g, "/")}";
     export function readYasamUser() { return (window as any).__user ?? null; }
     export function readSessionToken() { return "test-token"; }`,
  );
  const res = await build({
    stdin: {
      contents: `import { createElement } from "react";
        import { createRoot } from "react-dom/client";
        import { HdProfessionalReportButton } from "./app/human-design/kayitli-haritalar/components/HdProfessionalReportButton";
        (window as any).__mount = (props: any) => {
          const el = document.getElementById("root")!;
          createRoot(el).render(createElement(HdProfessionalReportButton, props));
        };`,
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
    plugins: [
      {
        name: "yasamUser-stub",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/auth\/yasamUser$/ }, (a) => (a.importer === stub ? undefined : { path: stub }));
        },
      },
    ],
    tsconfig: join(ROOT, "tsconfig.json"),
  });
  return res.outputFiles[0].text;
}

function tailwindCss(): string {
  const input = join(OUT, "tw-in.css");
  const out = join(OUT, "tw-out.css");
  writeFileSync(input, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  execSync(
    `npx tailwindcss -c tailwind.config.js -i "${input}" -o "${out}" --content "./app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx"`,
    { cwd: ROOT, stdio: "ignore" },
  );
  return readFileSync(out, "utf8");
}

const DOCX = Buffer.from("PK\u0003\u0004 test-docx");

async function main() {
  const [js, css] = await Promise.all([bundle(), Promise.resolve(tailwindCss())]);
  const PAGE = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<style>roxy-bodygraph.hd-fit{display:block;width:100%}roxy-bodygraph.hd-fit::part(card){border:0;padding:0;margin:0;background:transparent;box-shadow:none}roxy-bodygraph.hd-fit::part(chart){width:100%;max-width:none;height:auto}</style>
</head><body class="bg-slate-50 p-4"><div id="root"></div><script>${js}</script></body></html>`;
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/") { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(PAGE); return; }
    if (url.startsWith("/vendor/roxy-ui/")) { res.setHeader("content-type", "text/javascript"); res.end(readFileSync(join(ROOT, "public", url))); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();
  const external: string[] = [];

  type Scenario = {
    user: Record<string, unknown>;
    props: Record<string, unknown>;
    viewport?: { width: number; height: number };
    ua?: string;
    createStatus?: number;
    createBody?: Record<string, unknown>;
    redacted?: boolean;
  };
  async function open(s: Scenario): Promise<{ page: Page; bodies: Record<string, unknown>[] }> {
    const ctx = await browser.newContext({ viewport: s.viewport ?? { width: 1280, height: 900 }, userAgent: s.ua, acceptDownloads: true });
    const page = await ctx.newPage();
    const bodies: Record<string, unknown>[] = [];
    page.on("request", (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("blob:") && !u.startsWith("data:")) external.push(u); });
    await page.route(`${base}/api/hd/reports/professional`, async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({ status: s.createStatus ?? 200, contentType: "application/json", body: JSON.stringify(s.createBody ?? { ok: true, id: "rep-1", omittedCount: 0, bodygraph: "roxy_render", systemReading: "included", expertEntries: 2 }) });
    });
    await page.route(`${base}/api/hd/reports/professional/download`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": 'attachment; filename="Human-Design-Test-2026-10-08.docx"',
          ...(s.redacted ? { "x-hd-report-redacted": "system-reading" } : {}),
        },
        body: DOCX,
      });
    });
    await page.goto(base);
    await page.evaluate(([u, p]) => { (window as unknown as { __user: unknown }).__user = u; (window as unknown as { __mount: (x: unknown) => void }).__mount(p); }, [s.user, s.props] as const);
    return { page, bodies };
  }
  const expertWithSystem = { id: "u1", role: "expert", membership_status: "active", module_permissions: { human_design: true, hd_system_reading: true } };
  const expertNoSystem = { id: "u2", role: "expert", membership_status: "active", module_permissions: { human_design: true } };

  try {
    console.log("\n—— UI-1 Yetkili uzman + Roxy haritası: seçim penceresi → yakalama → oluştur → indir");
    {
      const { page, bodies } = await open({ user: expertWithSystem, props: { chartId: "ch-roxy", roxyRender: renderData } });
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      const dlg = page.getByRole("dialog", { name: "Word raporuna hangi yorumlar aktarılsın?" });
      ok("pencere açıldı", await dlg.isVisible());
      ok("varsayılan seçim: Her ikisi", await dlg.getByRole("radio", { name: /Her ikisi/ }).isChecked());
      ok("üç seçenek de etkin", (await dlg.getByRole("radio").count()) === 3 && !(await dlg.getByRole("radio", { name: /Yalnız Sistem Yorumu/ }).isDisabled()));
      await page.screenshot({ path: join(OUT, "ui-dialog-desktop.png") });
      await dlg.getByRole("radio", { name: /Yalnız Uzman Bilgilerim/ }).check();
      const dlP = page.waitForEvent("download");
      await dlg.getByRole("button", { name: "Raporu oluştur" }).click();
      const dl = await dlP;
      ok("DOCX indirildi (dosya adı sunucudan)", dl.suggestedFilename() === "Human-Design-Test-2026-10-08.docx");
      const b = bodies[0] ?? {};
      ok("istek: commentary=expert + chartId + requestId", b.commentary === "expert" && b.chartId === "ch-roxy" && typeof b.requestId === "string");
      const png = typeof b.bodygraphPng === "string" ? Buffer.from(String(b.bodygraphPng).split(",")[1], "base64") : null;
      const v = validateBodygraphPng(png);
      ok("istek: gerçek renderer PNG'si sunucu doğrulamasından geçer (≥1800 px)", v.ok && v.height >= 1800, v.ok ? "" : v.error);
      if (png) writeFileSync(join(OUT, "ui-captured.png"), png);
      await page.getByText(/Rapor indirildi/).waitFor();
      ok("başarı mesajı gösterildi", await page.getByText(/Rapor indirildi/).isVisible());
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      await page.waitForTimeout(300);
      ok("tekrar indir → yeni oluşturma isteği YOK (aynı rapor)", bodies.length === 1);
      await page.context().close();
    }

    console.log("\n—— UI-2 Yetkisiz uzman: pencere YOK, uzman otomatik");
    {
      const { page, bodies } = await open({ user: expertNoSystem, props: { chartId: "ch-roxy", roxyRender: renderData } });
      const dlP = page.waitForEvent("download");
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      await dlP;
      ok("seçim penceresi gösterilmedi", (await page.getByRole("dialog").count()) === 0);
      ok("istekte commentary YOK (sunucu varsayılanı = uzman)", bodies.length === 1 && !("commentary" in bodies[0]));
      await page.context().close();
    }

    console.log("\n—— UI-3 Sistem verisi olmayan (manuel) harita + yetkili uzman");
    {
      const { page, bodies } = await open({ user: expertWithSystem, props: { chartId: "ch-man" } });
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      const dlg = page.getByRole("dialog");
      ok("açık bilgi: Sistem Yorumu verisi yok", await dlg.getByText(/kayıtlı Sistem Yorumu verisi yok/).isVisible());
      ok("yalnız Uzman seçilebilir (diğerleri devre dışı)", (await dlg.getByRole("radio", { name: /Yalnız Uzman/ }).isChecked()) && (await dlg.getByRole("radio", { name: /Her ikisi/ }).isDisabled()) && (await dlg.getByRole("radio", { name: /Yalnız Sistem/ }).isDisabled()));
      const dlP = page.waitForEvent("download");
      await dlg.getByRole("button", { name: "Raporu oluştur" }).click();
      await dlP;
      ok("istek: commentary=expert, PNG YOK (manuel harita)", bodies[0]?.commentary === "expert" && !("bodygraphPng" in (bodies[0] ?? {})));
      await page.context().close();
    }

    console.log("\n—— UI-4 BodyGraph yakalanamazsa: açık onay");
    {
      const broken = { ...renderData, gates: [...(renderData.gates as unknown[]), { planet: "Sun", side: "design", gate: 999, line: 1 }] };
      const { page, bodies } = await open({ user: expertNoSystem, props: { chartId: "ch-roxy", roxyRender: broken }, createBody: { ok: true, id: "rep-2", omittedCount: 0, bodygraph: "missing", systemReading: "not_permitted", expertEntries: 1 } });
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      await page.getByRole("button", { name: "BodyGraph olmadan oluştur" }).waitFor();
      ok("rapor sessizce oluşturulmadı (istek yok) + seçenekler gösterildi", bodies.length === 0 && (await page.getByRole("button", { name: "Tekrar dene" }).isVisible()));
      const dlP = page.waitForEvent("download");
      await page.getByRole("button", { name: "BodyGraph olmadan oluştur" }).click();
      await dlP;
      ok("açık onayla istek: allowMissingBodygraph=true, PNG yok", bodies[0]?.allowMissingBodygraph === true && !("bodygraphPng" in bodies[0]));
      await page.getByText(/BodyGraph görseli OLMADAN/).waitFor();
      ok("kullanıcıya eksiklik açıkça bildirildi", await page.getByText(/BodyGraph görseli OLMADAN/).isVisible());
      await page.context().close();
    }

    console.log("\n—— UI-5 İndirme yetki nedeniyle düzenlendiyse bildirim");
    {
      const { page } = await open({ user: expertNoSystem, props: { chartId: "ch-roxy", roxyRender: renderData }, redacted: true });
      const dlP = page.waitForEvent("download");
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      await dlP;
      await page.getByText(/güncel yetkisi kapalı/).waitFor();
      ok("redaksiyon mesajı gösterildi", await page.getByText(/güncel yetkisi kapalı/).isVisible());
      await page.context().close();
    }

    console.log("\n—— UI-6 Mobil 375 / 390 px: pencere taşmaz");
    for (const width of [375, 390]) {
      const { page } = await open({ user: expertWithSystem, props: { chartId: "ch-roxy", roxyRender: renderData }, viewport: { width, height: 760 } });
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      const box = await page.getByRole("dialog").boundingBox();
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      ok(`${width}px: pencere ekran içinde, yatay kaydırma yok`, !!box && box.x >= 0 && box.x + box.width <= width + 0.5 && box.y >= 0 && box.y + box.height <= 760 + 0.5 && scrollW <= width, JSON.stringify(box));
      const radio = await page.getByRole("radio", { name: /Her ikisi/ }).locator("xpath=..").boundingBox();
      ok(`${width}px: seçenek dokunma hedefi ≥ 44 px`, !!radio && radio.height >= 44);
      await page.screenshot({ path: join(OUT, `ui-dialog-${width}.png`) });
      await page.keyboard.press("Escape");
      ok(`${width}px: ESC pencereyi kapatır`, (await page.getByRole("dialog").count()) === 0);
      await page.context().close();
    }

    console.log("\n—— UI-7 Android: buton YOK");
    {
      const { page } = await open({ user: expertWithSystem, props: { chartId: "ch-roxy", roxyRender: renderData }, ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" });
      await page.waitForTimeout(300);
      ok("Android'de Word butonu render edilmez", (await page.getByRole("button", { name: /Word/i }).count()) === 0);
      await page.context().close();
    }

    console.log("\n—— UI-9 Analizin hazır Word v2 raporu var: Word İndir → AYNI rapor, yeni oluşturma YOK");
    {
      const { page, bodies } = await open({ user: expertWithSystem, props: { chartId: "ch-roxy", roxyRender: renderData, existingReportId: "rep-ready" } });
      const dlP = page.waitForEvent("download");
      await page.getByRole("button", { name: "Word İndir", exact: true }).click();
      const dl = await dlP;
      ok("DOCX indirildi; seçim penceresi / yakalama / oluşturma isteği YOK", !!dl && bodies.length === 0 && (await page.getByRole("dialog").count()) === 0);
      await page.getByText(/yeni hesaplama yapılmadı/).waitFor();
      ok("kullanıcıya kayıtlı raporun indirildiği söylendi", await page.getByText(/yeni hesaplama yapılmadı/).isVisible());
      ok("bilinçli yeni sürüm bağlantısı görünür", await page.getByRole("button", { name: "Güncel bilgilerle yeni Word oluştur" }).isVisible());
      await page.context().close();
    }

    console.log("\n—— UI-10 Hazır rapor araması sürerken düğme bekler (kopya oluşmaz)");
    {
      const { page, bodies } = await open({ user: expertNoSystem, props: { chartId: "ch-roxy", roxyRender: renderData, lookupPending: true } });
      ok("arama sürerken Word İndir devre dışı", await page.getByRole("button", { name: "Word İndir", exact: true }).isDisabled());
      ok("istek yok", bodies.length === 0);
      await page.context().close();
    }

    console.log("\n—— UI-11 Listeden Word İndir (autoStart): akış bir kez kendiliğinden başlar");
    {
      const { page, bodies } = await open({ user: expertNoSystem, props: { chartId: "ch-roxy", roxyRender: renderData, autoStart: true } });
      const dl = await page.waitForEvent("download");
      await page.waitForTimeout(400);
      ok("tıklamasız tek oluşturma + indirme", !!dl && bodies.length === 1);
      await page.context().close();
    }

    console.log("\n—— UI-8 Ağ");
    ok("harici (Roxy/CDN) istek YOK", external.length === 0, external.join(", "));
  } finally {
    await browser.close();
    server.close();
    try { execSync(`node -e "require('fs').rmSync('scripts/hd-word-report/.ui-yasamUser-stub.ts',{force:true})"`, { cwd: ROOT }); } catch { /* yok say */ }
  }
}

main()
  .then(() => {
    console.log(`\nHD WORD UI E2E: ${pass} PASS / ${fail} FAIL  (çıktı: ${OUT})`);
    process.exitCode = fail === 0 ? 0 : 1;
  })
  .catch((e) => { console.error(e); process.exitCode = 1; });
