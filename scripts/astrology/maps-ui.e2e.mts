// Astrocartography + Local Space haritası — EKRAN ↔ WORD/PDF eşdeğerlik testi (YEREL; sahte DB + sahte Roxy; GERÇEK Roxy YOK).
//
// Önkoşul: `next dev -p 3931` (veya start) + dev-fake-backend (FAKE_ROXY_RELABEL=1).
// Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/maps-ui.e2e.mts [genişlik] [android] [fake.log]
//
//   M1 ACG ve Local Space hesaplanır + kaydedilir; kayıtlı analiz danışan dosyasından AÇILIR (0 sağlayıcı isteği)
//   M2 ekrandaki harita (WorldMap SVG) hat yolları = rapor haritasının hat yolları (aynı kayıt, birebir)
//   M3 ekrandaki işaret (doğum yeri / merkez) konumu = rapordaki işaret; Local Space pusula açıları = rapordaki açılar
//   M4 Word + PDF ARAYÜZDEN indirilir (bu genişlik / Android UA): Word'deki görsel = bu kaydın harita PNG'si (bayt bayt),
//      PDF'te tam genişlik görsel; ikinci indirme aynı görsel; 0 sağlayıcı isteği
import { chromium } from "playwright";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { buildAstroReport, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { renderFigurePng } from "@/lib/astrology/report/figurePng";
import type { ReportFigure } from "@/lib/astrology/report/figures";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sahte API yanıtları (test)
type J = any;
const [W = "1366", UA = "", LOG = ""] = process.argv.slice(2);
const width = Number(W);
const mobile = width < 640;
const android = UA === "android";
const tag = `${width}px${android ? " Android-UA" : ""}`;
const BASE = "http://localhost:3931/admin/astroloji";
const API = "http://localhost:3931/api/admin/astroloji";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} [${tag}] ${n}${x ? ` — ${x}` : ""}`);
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const api = async (path: string, body?: unknown) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json().catch(() => null)) as J };
};
const figureOf = (a: ReportAnalysisInput): ReportFigure | null => {
  const b = buildAstroReport(a).blocks.find((x) => x.kind === "chart");
  return b && b.kind === "chart" && "figure" in b ? b.figure : null;
};
const media = async (buf: Buffer) => {
  const z = await JSZip.loadAsync(buf);
  return Promise.all(Object.keys(z.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/")).map((f) => z.file(f)!.async("nodebuffer")));
};
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

(async () => {
  const stamp = Date.now().toString(36);
  const pid = (await api("/profiles", { label: `Harita Testi ${stamp}`, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" })).json.profile.id as string;
  const ids: Record<string, string> = {};
  for (const [technique, options] of [["western.astrocartography", {}], ["western.local_space", { referenceLocationId: null }]] as const) {
    const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: [{ technique, options }] });
    const s = plan.json.plan.selections[0];
    const run = await api("/engine/run", { profileId: pid, revision: 1, selections: [{ technique: s.technique, options: s.options ?? options }], confirmNewRequests: plan.json.plan.newRequestCount });
    const r = run.json.results[0];
    ids[technique] = (await api("/analyses", { profileId: pid, revision: 1, technique: r.technique, options: r.view.options, saveRequestId: crypto.randomUUID(), includeProviderInterp: true })).json.analysisId;
  }
  ok("M1 ACG + Local Space kaydedildi", !!ids["western.astrocartography"] && !!ids["western.local_space"]);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
    acceptDownloads: true,
    ...(android ? { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("[data-testid=astro-saved-analyses]", { timeout: 120000 });
  const h0 = hits();

  for (const tech of ["western.astrocartography", "western.local_space"] as const) {
    const id = ids[tech];
    await page.locator(`[data-saved-item="${id}"]`).click();
    // Tıklama alanı yolu şeffaftır (görünürlük değil, varlık beklenir).
    await page.waitForSelector("[data-testid=astro-saved-analysis] svg[aria-label$='dünya haritası'] path[data-line]", { timeout: 60000, state: "attached" });
    await page.waitForTimeout(1200);
    const a = (await api(`/analyses/${id}`)).json.analysis as ReportAnalysisInput;
    const fig = figureOf(a) as J;
    ok(`M2 ${tech}: rapor figürü üretildi`, !!fig && (fig.type === "acgMap" || fig.type === "localSpaceMap"));
    // Ekrandaki hat yolları (WorldMap'in tıklama alanı path'i hat ile aynı d'yi taşır).
    const screen = await page.evaluate(() => {
      const svg = document.querySelector("[data-testid=astro-saved-analysis] svg[aria-label$='dünya haritası']")!;
      const lines = [...svg.querySelectorAll("path[data-line]")].map((p) => ({ key: p.getAttribute("data-line")!, d: p.getAttribute("d")! }));
      const markers = [...svg.querySelectorAll("circle")].map((c) => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]);
      const compass = [...document.querySelectorAll("[data-testid=astro-saved-analysis] [data-ls-body] line")].map((l) => ({ id: l.parentElement!.getAttribute("data-ls-body")!, x2: Number(l.getAttribute("x2")), y2: Number(l.getAttribute("y2")), x1: Number(l.getAttribute("x1")), y1: Number(l.getAttribute("y1")) }));
      return { lines, markers, compass };
    });
    const rep = new Map((fig.lines as J[]).map((l) => [l.key, l.d]));
    ok(`M2 ${tech}: ekrandaki hat sayısı = rapor (${screen.lines.length})`, screen.lines.length === rep.size && screen.lines.length > 0, `${screen.lines.length} / ${rep.size}`);
    ok(`M2 ${tech}: her hattın yolu ekranla birebir`, screen.lines.every((l) => rep.get(l.key) === l.d));
    const mk = tech === "western.astrocartography" ? fig.markers[0] : fig.reference;
    const [mx, my] = [((mk.lon + 180) / 360) * 1000, ((90 - mk.lat) / 180) * 500];
    ok(`M3 ${tech}: işaret (${mk.label}) ekrandaki konumla aynı`, screen.markers.some(([x, y]) => Math.abs(x - mx) < 0.02 && Math.abs(y - my) < 0.02), JSON.stringify(screen.markers));
    if (tech === "western.local_space") {
      const ang = (c: J) => (Math.atan2(c.x2 - c.x1, c.y1 - c.y2) * 180) / Math.PI;
      ok("M3 Local space: ekrandaki pusula açıları = rapordaki azimutlar (K üst, saat yönü)", screen.compass.length === fig.compass.length && screen.compass.every((c) => angDiff(ang(c), (fig.compass as J[]).find((x) => x.id === c.id).azimuth) < 0.3));
    }
    // M4 — arayüzden Word / PDF
    const png = await renderFigurePng(fig);
    if ("error" in png) {
      ok(`M4 ${tech}: PNG`, false, png.error);
      continue;
    }
    for (const fmt of ["docx", "pdf"] as const) {
      const btn = page.locator(`[data-testid=astro-report-${fmt}]`).first();
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), btn.click()]);
      const buf = readFileSync((await dl.path())!);
      if (fmt === "docx") {
        const m = await media(buf);
        ok(`M4 ${tech}: Word arayüzden indi, görsel = bu kaydın haritası (bayt bayt)`, m.length === 1 && m[0].equals(png.png), `${m.length} görsel`);
      } else {
        ok(`M4 ${tech}: PDF arayüzden indi, ${png.width}px harita görseli içerir`, buf.subarray(0, 5).toString() === "%PDF-" && new RegExp(`/Width ${png.width}[\\s\\S]{0,200}?/Height ${png.height}`).test(buf.toString("latin1")));
      }
    }
    await page.locator("[data-testid=astro-saved-analysis] button[aria-label='Danışan Dosyası']").first().click();
    await page.waitForSelector("[data-testid=astro-saved-analyses]", { timeout: 30000 });
  }
  ok("M1/M4 kayıtlı analizi açma + rapor indirme 0 Roxy isteği", h0 === null || hits() === h0, `${h0}→${hits()}`);
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\nastrology maps UI [${tag}]: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  // Hata anında tarayıcı açık kalırsa süreç asılı kalmasın.
  process.exit(1);
});
