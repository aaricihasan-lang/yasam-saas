/**
 * KİŞİSEL DİJİTAL OFİS — C · Kartvizit Stüdyo fotoğraf çerçevesi: Sığdır / Doldur + ölçek (Playwright, yerel, ağ-mock).
 *
 * Prod'a / dış ağa temas YOK: /api/settings/workspace/* → ui-personal-backend.ts (gerçek şema + P2 görsel hattı, bellekte);
 * 127.0.0.1 dışı abort. CI listesinde DEĞİL (çalışan sunucu ister).
 *   UI_BASE=http://127.0.0.1:3972 UI_OUT=<klasör> [UI_PHASE=once|sonra] [UI_ONCE=<önce klasörü>] npx tsx scripts/workspace/ui-photo-frame.harness.ts
 * UI_PHASE=once: yalnız ekran görüntüsü (eski kod). sonra: görüntü + doğrulamalar.
 * Görseller: P0 örnekleri (aile 3:2, panorama 3,56:1, dikey orman 2:3) + çalışma anında üretilen dikey "Human Design" benzeri
 * şema (9:16) ve kare görsel. Üretilen görsellerin dört kenarında renkli işaret bandı vardır → kenarların görünürlüğü
 * piksel ile doğrulanır (kırpılan kenar bandı ekranda bulunamaz).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";
import { parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3972";
const OUT = process.env.UI_OUT ?? "foto-cerceve";
const PHASE = process.env.UI_PHASE ?? "sonra";
const ONCE = process.env.UI_ONCE ?? "";
const SAMPLES = process.env.UI_SAMPLES ?? "C:/YasamSistemi-Gorsel-Tasarim/kisisel-calisma-alani-p0-son-kabul/assets/ornek";
const FIXED_TIME = new Date("2026-11-02T09:30:00+03:00");
const ANDROID_WV_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36";
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "Deniz", role: "expert",
  active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a",
  is_demo_account: false, module_permissions: { clients: true, numerology: true, human_design: true },
};

let pass = 0, fail = 0;
const fails: string[] = [];
const check = PHASE !== "once";
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (!check) return;
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail !== "" ? `  → ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}
const design = (v: unknown): WorkspaceDesign | null => { const r = parseDesign(v, { allowAssets: true }); return r.ok ? r.value : null; };

/** Kenarlarında işaret bandı olan sentetik görsel (üst kırmızı, alt mavi, sol yeşil, sağ turuncu). */
async function markedImage(w: number, h: number, kind: "hd" | "kare"): Promise<Buffer> {
  const band = Math.round(Math.min(w, h) * 0.06);
  const body = kind === "hd"
    ? `<circle cx="${w / 2}" cy="${h * 0.18}" r="${w * 0.08}" fill="#c99a3a"/><polygon points="${w / 2},${h * 0.3} ${w * 0.38},${h * 0.42} ${w * 0.62},${h * 0.42}" fill="#7c3aed"/>
       <rect x="${w * 0.4}" y="${h * 0.48}" width="${w * 0.2}" height="${w * 0.2}" fill="#b4235a"/><polygon points="${w * 0.3},${h * 0.72} ${w * 0.7},${h * 0.72} ${w / 2},${h * 0.84}" fill="#2f6b4f"/>
       <text x="${w / 2}" y="${h * 0.94}" font-size="${w * 0.06}" text-anchor="middle" fill="#17142b" font-family="sans-serif">HUMAN DESIGN</text>`
    : `<circle cx="${w / 2}" cy="${h / 2}" r="${w * 0.28}" fill="#7c3aed"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#f7f3ea"/>${body}
    <rect x="0" y="0" width="${w}" height="${band}" fill="#e11d48"/><rect x="0" y="${h - band}" width="${w}" height="${band}" fill="#1d4ed8"/>
    <rect x="0" y="0" width="${band}" height="${h}" fill="#16a34a"/><rect x="${w - band}" y="0" width="${band}" height="${h}" fill="#f97316"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

let browser: Browser;
type Ctx = { ctx: BrowserContext; page: Page; errors: string[] };
async function open(mock: WorkspaceMock, vp: { width: number; height: number }, ua?: string): Promise<Ctx> {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, isMobile: Boolean(ua), userAgent: ua, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
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
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, errors };
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
  await page.waitForSelector('[data-pw-hero="C"] img', { timeout: 60000 });
  await settle(page);
}
const dlg = (page: Page) => page.locator('[role="dialog"][aria-labelledby="studio-title"]');
async function studio(page: Page) {
  await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
  await page.waitForSelector('[role="dialog"][aria-labelledby="studio-title"]', { timeout: 180000 });
  await settle(page);
}

/** Çerçevedeki ana fotoğrafın ekranda görünen içerik kutusu (object-fit + object-position + ölçek hesaba katılarak). */
const FRAME_JS = `(() => {
  var mat = document.querySelector('[data-pw-hero="C"] [data-pw-frame]') || document.querySelector('[data-pw-hero="C"] [class*="mat"]');
  if (!mat) return null;
  var img = mat.querySelector('img[data-pw-frame-photo]') || mat.querySelector('picture img') || mat.querySelector('img');
  if (!img || !img.naturalWidth) return { mat: null };
  var m = mat.getBoundingClientRect(); var b = img.getBoundingClientRect(); var cs = getComputedStyle(img);
  var r = img.naturalWidth / img.naturalHeight; var fit = cs.objectFit; var W = b.width, H = b.height, cw, ch;
  if (fit === 'contain' ? W / H > r : W / H < r) { ch = H; cw = H * r; } else { cw = W; ch = W / r; }
  var pos = cs.objectPosition.split(' ').map(function (v) { return parseFloat(v) / 100; });
  var cx = b.left + (W - cw) * (isNaN(pos[0]) ? 0.5 : pos[0]); var cy = b.top + (H - ch) * (isNaN(pos[1]) ? 0.5 : pos[1]);
  return { mat: [m.left, m.top, m.width, m.height], content: [cx, cy, cw, ch], fit: fit, ratio: r, mode: mat.getAttribute('data-pw-frame'),
    backdrop: !!mat.querySelector('[data-pw-frame-backdrop]'), hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
})()`;
type Frame = { mat: number[] | null; content: number[]; fit: string; ratio: number; mode: string | null; backdrop: boolean; hscroll: boolean } | null;
const frameInfo = (page: Page) => page.evaluate(FRAME_JS) as Promise<Frame>;
const inside = (c: number[], m: number[], tol = 1.5) => c[0] >= m[0] - tol && c[1] >= m[1] - tol && c[0] + c[2] <= m[0] + m[2] + tol && c[1] + c[3] <= m[1] + m[3] + tol;
const covers = (c: number[], m: number[], tol = 1.5) => c[0] <= m[0] + tol && c[1] <= m[1] + tol && c[0] + c[2] >= m[0] + m[2] - tol && c[1] + c[3] >= m[1] + m[3] - tol;

/** Kenar bantlarının ekranda (çerçeve kutusu içinde) görünürlüğü: her kenar bandının rengi en az bir piksel şeridinde var mı. */
async function edgeBands(page: Page, m: number[]): Promise<Record<string, boolean>> {
  const vp = page.viewportSize()!;
  const clip = { x: Math.max(0, Math.floor(m[0])), y: Math.max(0, Math.floor(m[1])), width: Math.min(Math.ceil(m[2]), vp.width - Math.floor(m[0])), height: Math.min(Math.ceil(m[3]), vp.height - Math.floor(m[1])) };
  const png = await page.screenshot({ clip });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const want: Record<string, [number, number, number]> = { ust: [225, 29, 72], alt: [29, 78, 216], sol: [22, 163, 74], sag: [249, 115, 22] };
  const found: Record<string, number> = { ust: 0, alt: 0, sol: 0, sag: 0 };
  for (let i = 0; i < info.width * info.height; i++) {
    const p = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    for (const k of Object.keys(want)) if (Math.abs(p[0] - want[k][0]) < 28 && Math.abs(p[1] - want[k][1]) < 28 && Math.abs(p[2] - want[k][2]) < 28) found[k]++;
  }
  return Object.fromEntries(Object.entries(found).map(([k, n]) => [k, n > 40]));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();
  const images: { key: string; label: string; bytes: Buffer; mime: string; marked: boolean }[] = [
    { key: "hd-dikey", label: "dikey Human Design (9:16)", bytes: await markedImage(1080, 1920, "hd"), mime: "image/jpeg", marked: true },
    { key: "aile-yatay", label: "yatay aile fotoğrafı (3:2)", bytes: readFileSync(join(SAMPLES, "temsili-aile-fotografi.jpg")), mime: "image/jpeg", marked: false },
    { key: "kare", label: "kare (1:1)", bytes: await markedImage(1200, 1200, "kare"), mime: "image/jpeg", marked: true },
    { key: "panorama", label: "panoramik (3,56:1)", bytes: readFileSync(join(SAMPLES, "test-panorama-dag.jpg")), mime: "image/jpeg", marked: false },
    { key: "dikey-orman", label: "dikey fotoğraf (2:3)", bytes: readFileSync(join(SAMPLES, "test-dikey-orman.jpg")), mime: "image/jpeg", marked: false },
  ];
  const vps: { w: number; h: number; ua?: string; tag: string }[] = [
    { w: 1440, h: 900, tag: "1440" }, { w: 390, h: 844, ua: ANDROID_WV_UA, tag: "390-android" }, { w: 375, h: 812, tag: "375" }, { w: 320, h: 720, tag: "320" },
  ];
  const results: unknown[] = [];
  try {
    for (const im of images) for (const fit of (PHASE === "once" ? ["(eski)"] : ["fill", "fit"]) as string[]) for (const vp of vps) {
      if (PHASE === "once" && vp.tag !== "1440" && vp.tag !== "390-android") continue;
      const mock = createWorkspaceMock({ enabled: true });
      const id = await mock.seedAsset("photo", im.bytes, `${im.key}.jpg`, im.mime);
      const d = design({ layout: "C", bg: { mode: "photo", photoAssetId: id, tone: "light", ...(fit === "(eski)" ? {} : { frameFit: fit }) } });
      if (!d) throw new Error("şema");
      mock.seed({ applied: d });
      const c = await open(mock, { width: vp.w, height: vp.h }, vp.ua);
      try {
        await home(c.page);
        const fr = await frameInfo(c.page);
        const name = `${im.key}-${fit === "(eski)" ? "eski" : fit === "fit" ? "sigdir" : "doldur"}-${vp.tag}`;
        await c.page.locator('[data-pw-hero="C"]').screenshot({ path: join(OUT, `${name}.png`) });
        results.push({ name, frame: fr });
        if (!check || !fr || !fr.mat) { ok("F", `${name}: çerçeve ölçüldü`, false, fr); continue; }
        const aspectOk = Math.abs(fr.content[2] / fr.content[3] - fr.ratio) < 0.02 * fr.ratio;
        if (fit === "fit") {
          ok("F", `${im.label} · Sığdır · ${vp.tag}: görselin TAMAMI çerçevede, oran korunur, boşluk premium zeminle dolu`, inside(fr.content, fr.mat) && aspectOk && fr.backdrop && fr.mode === "fit", fr);
          if (im.marked) {
            const e = await edgeBands(c.page, fr.mat);
            ok("F", `${im.label} · Sığdır · ${vp.tag}: dört kenar bandı da ekranda (kırpılan kenar yok)`, e.ust && e.alt && e.sol && e.sag, e);
          }
        } else {
          ok("F", `${im.label} · Doldur · ${vp.tag}: çerçeve tamamen dolu, oran korunur (kontrollü kırpma)`, covers(fr.content, fr.mat) && aspectOk && !fr.backdrop && fr.mode !== "fit", fr);
        }
        ok("F", `${name}: yatay kaydırma yok, sayfa hatası yok`, !fr.hscroll && c.errors.length === 0, c.errors);
      } finally { await c.ctx.close(); }
    }
    if (!check) return;

    // Eski kayıt (frameFit yok) görünümü değişmez: önceki kodla alınan ekranla piksel karşılaştırması
    if (ONCE) for (const im of images) for (const tag of ["1440", "390-android"]) {
      const a = join(ONCE, `${im.key}-eski-${tag}.png`);
      const b = join(OUT, `${im.key}-doldur-${tag}.png`);
      if (!existsSync(a) || !existsSync(b)) continue;
      const A = await sharp(readFileSync(a)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const B = await sharp(readFileSync(b)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let strong = -1;
      if (A.info.width === B.info.width && A.info.height === B.info.height) {
        strong = 0;
        for (let i = 0; i < A.data.length; i += 3) if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 16) strong++;
      }
      ok("G", `${im.label} · ${tag}: eski kayıt (varsayılan Doldur) önceki görünümle piksel aynı (güçlü fark ${strong})`, strong === 0, { strong, a: A.info, b: B.info });
    }

    // Stüdyo: Sığdır seç + ölçek → canlı önizleme = sayfa; Uygula → F5 → yeniden giriş korunur
    const mock = createWorkspaceMock({ enabled: true });
    const id = await mock.seedAsset("photo", images[0].bytes, "hd.jpg", "image/jpeg");
    mock.seed({ applied: design({ layout: "C", bg: { mode: "photo", photoAssetId: id, tone: "light" } }) });
    const c = await open(mock, { width: 1440, height: 900 });
    try {
      await studio(c.page);
      await dlg(c.page).getByRole("tab", { name: /Logo/ }).click();
      await c.page.waitForTimeout(300);
      const seg = dlg(c.page).getByRole("radiogroup", { name: /Fotoğraf çerçevesi/ });
      ok("S", "panelde 'Fotoğrafı Sığdır' ve 'Çerçeveyi Doldur' seçenekleri", (await seg.getByRole("radio").count()) === 2 && (await seg.getByRole("radio", { name: /Fotoğrafı Sığdır/ }).count()) === 1);
      await seg.getByRole("radio", { name: /Fotoğrafı Sığdır/ }).click();
      await c.page.waitForTimeout(400);
      let fr = await frameInfo(c.page);
      ok("S", "Sığdır seçimi sayfada anında görünür (canlı önizleme)", !!fr && fr.mode === "fit" && inside(fr.content, fr.mat!), fr);
      const slider = dlg(c.page).getByRole("slider", { name: /Fotoğraf boyutu/ });
      await slider.fill("0.8");
      await c.page.waitForTimeout(300);
      fr = await frameInfo(c.page);
      const scaled = !!fr && fr.content[3] < fr.mat![3] * 0.85;
      ok("S", "uzaklaştırma (0,8): fotoğraf küçülür, tamamı görünür", scaled && inside(fr!.content, fr!.mat!), fr);
      // Önizleme ↔ gerçek görünüm: paneldeki çerçeve önizlemesi aynı göreli kutuyu gösterir
      const prev = await c.page.evaluate(`(() => { var p = document.querySelector('[data-testid="frame-preview"]'); if (!p) return null; var img = p.querySelector('img[data-pw-frame-photo]'); var b = p.getBoundingClientRect(); var cs = getComputedStyle(img); return { fit: cs.objectFit, tr: cs.transform, pos: cs.objectPosition, ar: b.width / b.height }; })()`) as { fit: string; tr: string; pos: string } | null;
      const real = await c.page.evaluate(`(() => { var img = document.querySelector('[data-pw-hero="C"] img[data-pw-frame-photo]'); var cs = getComputedStyle(img); return { fit: cs.objectFit, tr: cs.transform, pos: cs.objectPosition }; })()`) as { fit: string; tr: string; pos: string };
      ok("S", "panel önizlemesi gerçek çerçeveyle aynı sığdırma / ölçek / konum", !!prev && prev.fit === real.fit && prev.tr === real.tr && prev.pos === real.pos, { prev, real });
      await c.page.screenshot({ path: join(OUT, "studio-sigdir-0.8.png") });
      await dlg(c.page).locator("button", { hasText: /^Uygula$/ }).last().click();
      const md = c.page.locator('[role="alertdialog"]');
      if (await md.isVisible({ timeout: 1500 }).catch(() => false)) await md.locator("button", { hasText: /Hayır/ }).first().click();
      await c.page.waitForTimeout(1200);
      const ap = mock.raw.applied as WorkspaceDesign;
      ok("S", "Uygula → kayıtta frameFit=fit, frameZoom=0,8 (görsel yeniden yüklenmedi)", ap?.bg.frameFit === "fit" && ap?.bg.frameZoom === 0.8 && ap?.bg.photoAssetId === id && mock.assetCount === 1, ap?.bg);
      await home(c.page);
      const f5 = await frameInfo(c.page);
      ok("S", "F5 sonrası aynı görünüm", !!f5 && f5.mode === "fit" && fr !== null && Math.abs(f5.content[3] - fr.content[3]) < 1.5 && Math.abs(f5.content[0] - fr.content[0]) < 1.5, { f5, fr });
      await c.ctx.close();
      const c2 = await open(mock, { width: 1440, height: 900 });
      await home(c2.page);
      const re = await frameInfo(c2.page);
      ok("S", "çıkış + yeniden giriş (yeni oturum) sonrası aynı görünüm", !!re && re.mode === "fit" && fr !== null && Math.abs(re.content[3] - fr.content[3]) < 1.5, re);
      // Mobil (aynı kayıt) — 390 Android: tamamı görünür
      await c2.ctx.close();
      const c3 = await open(mock, { width: 390, height: 844 }, ANDROID_WV_UA);
      await home(c3.page);
      const mob = await frameInfo(c3.page);
      ok("S", "aynı kayıt mobilde (Android WebView 390): tamamı görünür, taşma yok", !!mob && inside(mob.content, mob.mat!) && !mob.hscroll, mob);
      await c3.page.locator('[data-pw-hero="C"]').screenshot({ path: join(OUT, "kayit-sonrasi-390-android.png") });
      await c3.ctx.close();
    } catch (e) {
      ok("S", "stüdyo akışı çökmedi", false, (e as Error).message);
    }
  } finally {
    await browser.close();
    writeFileSync(join(OUT, "olcum.json"), JSON.stringify(results, null, 2));
    if (check) {
      console.log(`\nui-photo-frame harness: ${pass} PASS / ${fail} FAIL`);
      if (fails.length) console.log(fails.join("\n"));
      writeFileSync(join(OUT, "sonuc.json"), JSON.stringify({ pass, fail, fails }, null, 2));
    }
  }
  process.exit(fail ? 1 : 0);
}
main();
