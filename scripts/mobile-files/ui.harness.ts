/**
 * MOBİL DOSYA İŞLEVLERİ — GERÇEK TARAYICI UI HARNESS (yalnız 127.0.0.1; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eder):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=zz-anamnez-test-anon-not-a-secret SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/mobile-files/ui.harness.ts
 *
 * Ortamlar: masaüstü 1366×900 · Android Chrome 390×844 · Android uygulama WebView UA 390×844 (native
 * kamera YOK) · Android uygulama + "YasamCamera/1" (native kamera hazır senaryosu).
 * NOT: Bu Chromium'dur; gerçek Android WebView/cihaz DEĞİLDİR (yalnız UA + ekran simülasyonu).
 *
 * Kapsam:
 *   A. Danışan Taşları: galeri seçimi görünür; "Fotoğraf Çek" yalnız destekleyen ortamda; capture=environment;
 *      gerçek 4000×3000 EXIF-6 telefon fotoğrafı → kaydet → depoda WebP, küçülmüş, DİKEY (yön doğru),
 *      DB satırı; kamera girişi seçime EKLER; 390 px'te yatay taşma yok
 *   B. Anamnez: Boş Form PDF her cihazda görünür + indirilir (%PDF); "Görüntüle" uygulamada window.open
 *      ÇAĞIRMAZ (sayfa yerinde kalır), masaüstünde mevcut davranış (window.open) korunur
 *   C. Sunucu: kapsam içi Word route'u Android UA ile 403 VERMEZ (masaüstü ile aynı durum);
 *      HD + Astroloji route'ları Android UA ile 403 VERMEYE DEVAM EDER
 */
import { execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import { SERVICE_KEY, type Seed } from "../anamnez/testEnv";
import { startDyEnv } from "../dy-presale-closeout/env";

const PORT = 3984;
const APP = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { key: string; name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string; camera: boolean };
const WV = "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";
const DEVICES: Device[] = [
  { key: "desk", name: "masaüstü", viewport: { width: 1366, height: 900 }, mobile: false, camera: false },
  { key: "chrome", name: "Android Chrome", viewport: { width: 390, height: 844 }, mobile: true, camera: true,
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" },
  { key: "app", name: "Android uygulama (native kamera yok)", viewport: { width: 390, height: 844 }, mobile: true, camera: false, ua: WV },
  { key: "appcam", name: "Android uygulama + YasamCamera/1", viewport: { width: 390, height: 844 }, mobile: true, camera: true,
    ua: `${WV} YasamSistemiAndroid/1.10.0 YasamCamera/1` },
];

async function newContext(browser: Browser, seed: Seed, d: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul",
    acceptDownloads: true, ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: seed.users.A.id, tenant_id: seed.TA, full_name: "ZZ_MF_A", email: "zz.anamnez.a@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { clients: true, appointments: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
    // window.open çağrılarını say (Görüntüle davranışı); gerçek açılış masaüstü bağlamında da sürer.
    const w = window as unknown as { __opens: string[] };
    w.__opens = [];
    const orig = window.open.bind(window);
    window.open = ((url?: string | URL, ...rest: unknown[]) => { w.__opens.push(String(url ?? "")); return orig(url as string, ...(rest as [string?, string?])); }) as typeof window.open;
  }, [JSON.stringify(user), seed.users.A.token]);
  return ctx;
}

async function noHorizontalOverflow(page: Page): Promise<{ sw: number; iw: number }> {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
}

async function main() {
  const { env, seed } = await startDyEnv({ port: 54497, dirName: "mobile-files-ui-pgdata", httpPort: 54521 });
  const q = (sql: string, args: unknown[] = []) => env.su.query(sql, args);
  await q(`alter table public.client_stones
             add column if not exists stone_type text, add column if not exists note text, add column if not exists usage_area text,
             add column if not exists combination_text text, add column if not exists warning_text text,
             add column if not exists other_notes text, add column if not exists stone_date text;
           create table if not exists public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid,
             client_id uuid references public.clients(id) on delete cascade, stone_id uuid, image_url text, file_path text,
             created_at timestamptz default now());
           create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
             client_id uuid not null references public.clients(id) on delete cascade, analysis_type text, analysis_data jsonb, note text,
             image_url text, created_at timestamptz default now(), updated_at timestamptz default now());
           grant select, insert, update, delete on public.client_stone_photos, public.client_analyses to service_role;`);
  await q(`update public.users set module_permissions = '{"clients":true,"appointments":true}'::jsonb where id=$1`, [seed.users.A.id]);
  env.storage.buckets.set("stone-photos", { public: false, sizeLimit: 10 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"] });
  const a1 = seed.clients.a1;

  // Gerçek telefon fotoğrafı: 4000×3000 saklı, EXIF yön=6 (dikey çekim), sol üstte kırmızı işaret.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="3000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b8f71"/><stop offset="1" stop-color="#3b5b7a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="400" height="300" fill="#f00"/><text x="800" y="1800" font-size="160" font-family="Arial" fill="#111">AMETİST 12,5 g</text></svg>`;
  const raw = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  let seedN = 11;
  for (let i = 0; i < raw.data.length; i++) { seedN = (seedN * 1664525 + 1013904223) >>> 0; raw.data[i] = Math.max(0, Math.min(255, raw.data[i] + ((seedN >>> 24) % 17) - 8)); }
  const phonePhoto = await sharp(raw.data, { raw: raw.info }).jpeg({ quality: 93 }).withMetadata({ orientation: 6 }).toBuffer();
  console.log(`telefon fotoğrafı: ${(phonePhoto.length / 1048576).toFixed(2)} MB, 4000×3000 + EXIF 6`);

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    // ── Hazırlık: anamnez taslağı + 1 PDF eki (masaüstü) ───────────────────────
    {
      const ctx = await newContext(browser, seed, DEVICES[0]);
      const page = await ctx.newPage();
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=anamnez`);
      await page.getByRole("heading", { name: "Anamnez", exact: true }).waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: "Yeni Anamnez Oluştur" }).click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Anamnezi Oluştur" }).click();
      await page.getByText("Taslak", { exact: true }).first().waitFor({ timeout: 30_000 });
      await page.getByText("Belgeler (PDF)").first().waitFor({ timeout: 30_000 });
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("anamnez-pdf-upload").click()]);
      await chooser.setFiles({ name: "zz-ek.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%zz\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
      await page.getByText("📄 zz-ek.pdf").waitFor({ timeout: 30_000 });
      await ctx.close();
    }

    for (const d of DEVICES) {
      const ctx = await newContext(browser, seed, d);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`${d.name}: ${e.message}`));

      // ── A) Danışan Taşları ───────────────────────────────────────────────────
      section(`A. Danışan Taşları — ${d.name}`);
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=taslar`);
      await page.getByRole("button", { name: "+ Yeni Taş Ekle" }).click({ timeout: 60_000 });
      const picker = page.getByTestId("stone-create-photo-picker");
      ok(await picker.isVisible(), "foto seçim kutusu görünür");
      const cam = page.getByTestId("stone-create-photo-camera");
      ok((await cam.count()) === (d.camera ? 1 : 0), `"Fotoğraf Çek" ${d.camera ? "VAR" : "YOK"} (beklenen)`);
      if (d.camera) {
        const capInput = await page.evaluate(() => {
          const el = document.querySelector('input[type="file"][capture]') as HTMLInputElement | null;
          return el ? { capture: el.getAttribute("capture"), accept: el.accept, multiple: el.multiple } : null;
        });
        ok(capInput?.capture === "environment" && capInput.accept === "image/*" && capInput.multiple === false, "kamera girişi: capture=environment, accept=image/*, tekli", capInput);
        const [camChooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10_000 }), cam.click()]);
        await camChooser.setFiles({ name: "kamera.jpg", mimeType: "image/jpeg", buffer: phonePhoto });
        ok(await picker.locator("img").count() === 1, "kamera çekimi seçime eklendi (önizleme 1)");
      }
      const label = page.getByText("Galeriden / Dosyadan Seç", { exact: true });
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10_000 }), label.click()]);
      await chooser.setFiles({ name: `IMG_${d.key}.JPG`, mimeType: "image/jpeg", buffer: phonePhoto });
      const expectPreviews = d.camera ? 2 : 1;
      ok(await picker.locator("img").count() === expectPreviews, `galeri seçimi EKLENDİ (önizleme ${expectPreviews})`);
      const ov = await noHorizontalOverflow(page);
      ok(ov.sw <= ov.iw + 1, `yatay taşma yok (${ov.sw} ≤ ${ov.iw})`);

      const stoneName = `ZZ Ametist ${d.key}`;
      await page.getByPlaceholder("Örn: Ametist, Şungit, Pirit").first().fill(stoneName);
      const objBefore = env.storage.objects.get("stone-photos")?.size ?? 0;
      await page.getByRole("button", { name: "💾 Taşı Kaydet" }).click();
      await page.getByText("Taş kaydı eklendi.").first().waitFor({ timeout: 60_000 }).catch(() => {});
      const deadline = Date.now() + 30_000;
      let rows: { file_path: string }[] = [];
      while (Date.now() < deadline) {
        rows = (await q(`select p.file_path from public.client_stone_photos p join public.client_stones s on s.id=p.stone_id where s.stone_name=$1`, [stoneName])).rows;
        if (rows.length >= expectPreviews) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      ok(rows.length === expectPreviews, `DB: ${rows.length}/${expectPreviews} foto kaydı taşa bağlandı`);
      const objs = env.storage.objects.get("stone-photos");
      ok((objs?.size ?? 0) - objBefore === expectPreviews, `depoda ${expectPreviews} yeni nesne`);
      for (const r of rows) {
        const o = objs?.get(r.file_path);
        if (!o) { ok(false, `nesne bulunamadı ${r.file_path}`); continue; }
        const m = await sharp(o.bytes).metadata();
        ok(o.contentType === "image/webp" && m.format === "webp", `nesne WebP (${o.contentType})`);
        ok(o.bytes.length < phonePhoto.length * 0.6, `boyut küçüldü (${(phonePhoto.length / 1048576).toFixed(2)} → ${(o.bytes.length / 1048576).toFixed(2)} MB)`);
        ok(m.width === 1920 && m.height === 2560, `yön doğru (dikey ${m.width}×${m.height})`);
        ok(r.file_path.startsWith(`${seed.TA}/`) || r.file_path.includes(seed.TA), "yol sunucuda tenant önekli üretildi", r.file_path);
      }

      // ── B) Anamnez ───────────────────────────────────────────────────────────
      section(`B. Anamnez — ${d.name}`);
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=anamnez`);
      await page.getByRole("heading", { name: "Anamnez", exact: true }).waitFor({ timeout: 60_000 });
      const blank = page.getByRole("button", { name: "Boş Formu İndir (PDF)" }).first();
      ok(await blank.isVisible(), "Boş Form PDF GÖRÜNÜR");
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), blank.click()]);
      const dlPath = await dl.path();
      const head = dlPath ? (await import("node:fs")).readFileSync(dlPath).subarray(0, 5).toString("latin1") : "";
      ok(head === "%PDF-" && /\.pdf$/i.test(dl.suggestedFilename()), `PDF indirildi (${dl.suggestedFilename()})`);
      const ov2 = await noHorizontalOverflow(page);
      ok(ov2.sw <= ov2.iw + 1, `yatay taşma yok (${ov2.sw} ≤ ${ov2.iw})`);

      await page.getByRole("button", { name: "Taslağa devam et" }).first().click({ timeout: 30_000 });
      await page.getByText("📄 zz-ek.pdf").waitFor({ timeout: 30_000 });
      ok(await page.getByTestId("anamnez-pdf-upload").isVisible(), "PDF Ekle GÖRÜNÜR");
      const viewBtn = page.getByRole("button", { name: "Görüntüle" }).first();
      const isApp = d.key === "app" || d.key === "appcam";
      const signReq = page.waitForRequest((r) => /\/storage\/v1\/object\/sign\//.test(r.url()), { timeout: 30_000 }).catch(() => null);
      const popup = ctx.waitForEvent("page", { timeout: 8_000 }).catch(() => null);
      await viewBtn.click();
      const opens = await page.evaluate(() => (window as unknown as { __opens: string[] }).__opens.slice()).catch(() => ["<sayfa değişti>"]);
      if (isApp) {
        ok(opens.length === 0, "uygulama: Görüntüle window.open ÇAĞIRMADI (sayfa boşalmaz)", opens);
        ok(!!(await signReq), "uygulama: imzalı belge adresine doğrudan gidildi (uygulama dış görüntüleyicide açar)");
      } else {
        const p = await popup;
        ok(opens.length === 1 && opens[0] === "about:blank", "tarayıcı: mevcut davranış korunuyor (yeni sekme)", opens);
        if (p) await p.close().catch(() => {});
      }
      await ctx.close();
    }

    // ── D) Word CTA'ları telefonda: görünürlük + taşma + gerçek indirme ──────────
    for (const vw of [375, 390]) {
      const d: Device = { ...DEVICES[2], key: `app${vw}`, name: `Android uygulama ${vw}px`, viewport: { width: vw, height: 812 } };
      section(`D. Word CTA'ları — ${d.name}`);
      const ctx = await newContext(browser, seed, d);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`${d.name}: ${e.message}`));
      for (const tab of ["genel", "notlar", "randevular", "taslar", "seanslar", "ucretlendirme", "odevler", "analizler"]) {
        await page.goto(`${APP}/dashboard/clients/${a1}?tab=${tab}`);
        await page.locator(`#tabpanel-${tab}`).waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(400);
        const words = await page.locator("button:visible", { hasText: /Word/ }).count();
        const ov = await noHorizontalOverflow(page);
        ok(words >= 2 && ov.sw <= ov.iw + 1, `danışan ?tab=${tab}: Word butonları görünür (${words}) · taşma yok (${ov.sw}≤${ov.iw})`);
      }
      if (vw === 390) {
        await page.goto(`${APP}/dashboard/clients/${a1}?tab=taslar`);
        const head = page.locator("button:visible", { hasText: /Word/ }).first();
        await head.waitFor({ timeout: 30_000 });
        const [wd] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), head.click()]);
        const p = await wd.path();
        const sig = p ? (await import("node:fs")).readFileSync(p).subarray(0, 2).toString("latin1") : "";
        ok(sig === "PK" && /\.docx$/i.test(wd.suggestedFilename()), `uygulama UA: Word butonu → .docx indirildi (${wd.suggestedFilename()})`);
      }
      for (const url of ["/danisan-yolculugu/liste", "/dashboard/ajanda"]) {
        await page.goto(`${APP}${url}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(800);
        const ov = await noHorizontalOverflow(page);
        ok(ov.sw <= ov.iw + 1, `${url}: taşma yok (${ov.sw}≤${ov.iw})`);
      }
      await ctx.close();
    }

    // ── C) Sunucu: Android Word engeli ──────────────────────────────────────────
    section("C. Sunucu: Word engeli (Android UA)");
    const ANDROID_UA = DEVICES[2].ua!;
    const DESK_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
    const auth = { "x-user-id": seed.users.A.id, "x-session-token": seed.users.A.token, "content-type": "application/json" };
    const call = (url: string, ua: string, init: RequestInit = {}) =>
      fetch(`${APP}${url}`, { ...init, headers: { ...auth, "user-agent": ua, ...(init.headers ?? {}) } });
    const body = JSON.stringify({ exportMode: "tab", tab: "taslar" });
    const rDesk = await call(`/api/clients/${a1}/word-report`, DESK_UA, { method: "POST", body });
    const rAnd = await call(`/api/clients/${a1}/word-report`, ANDROID_UA, { method: "POST", body });
    const tAnd = await rAnd.text();
    ok(rAnd.status !== 403 && !/Word indirme bu cihazda kullanılamıyor/.test(tAnd), `danışan Word: Android UA 403 DEĞİL (${rAnd.status})`);
    ok(rAnd.status === rDesk.status, `danışan Word: Android = masaüstü (${rAnd.status} / ${rDesk.status})`);
    if (rAnd.status === 200) ok(Buffer.from(await (await call(`/api/clients/${a1}/word-report`, ANDROID_UA, { method: "POST", body })).arrayBuffer()).subarray(0, 2).toString("latin1") === "PK", "Android UA: geçerli .docx (PK)");
    for (const [label, url, init] of [
      ["HD profesyonel indirme", "/api/hd/reports/professional/download", { method: "POST", body: "{}" }],
      ["HD profesyonel oluşturma", "/api/hd/reports/professional", { method: "POST", body: "{}" }],
    ] as const) {
      const r = await call(url, ANDROID_UA, init as RequestInit);
      const t = await r.text();
      ok(r.status === 403 && /bu cihazda kullanılamıyor|cihazda/i.test(t), `${label}: Android UA hâlâ 403 (HD/Astroloji kuralı KORUNDU)`, { status: r.status, t: t.slice(0, 120) });
    }

    // Astroloji: yetki kapısı Android engelinden ÖNCE çalışır (yetkisiz → her cihazda tek tip 404). Bu
    // test kullanıcısında Astroloji yetkisi yok → Android ve masaüstü AYNI yanıtı almalı (davranış değişmedi).
    // Android 403'ünün kendisi scripts/astrology/report8.harness.ts (yetkili kullanıcı) ile doğrulanır.
    for (const url of ["/api/admin/astroloji/analyses/00000000-0000-0000-0000-000000000000/report?format=docx", "/api/admin/astroloji/analyses/report?format=pdf&profileId=x&all=1"]) {
      const ra = await call(url, ANDROID_UA);
      const rd = await call(url, DESK_UA);
      ok(ra.status === rd.status && ra.status === 404, `Astroloji ${url.includes("analyses/report") ? "toplu" : "tekli"}: yetki kapısı önce (Android = masaüstü = ${ra.status})`);
    }

    // ── C2) 46 Word route'unun TAMAMI çalışma anında: Android engel mesajı artık yok ─
    // Engel kimlik doğrulamadan ÖNCE çalışıyordu → değişiklikten önce kimliksiz Android isteği
    // "Word indirme bu cihazda kullanılamıyor" 403'ü alırdı. Şimdi bu mesaj HİÇBİR kapsam içi
    // route'tan dönmemeli; HD'nin 2 route'unda dönmeye DEVAM etmeli. Yöntem route kaynağından okunur.
    section("C2. 46 Word route'u — Android engel mesajı (çalışma anı)");
    {
      const GUARD_MSG = /Word indirme bu cihazda kullanılamıyor/;
      // Taban: main ile ortak ata (commit sonrası da doğru çalışır). İstenirse MF_BASE ile verilir.
      const BASE = process.env.MF_BASE || execSync("git merge-base origin/main HEAD", { encoding: "utf8" }).trim();
      const changed = execSync(`git diff --name-only ${BASE} HEAD -- app/api`, { encoding: "utf8" }).split(/\r?\n/).filter((f) => f.endsWith("route.ts"));
      const headSrc = (f: string) => { try { return execSync(`git show "${BASE}:${f}"`, { encoding: "utf8" }); } catch { return ""; } };
      const guardRoutes = changed.filter((f) => /androidWordGuard/.test(headSrc(f)));
      ok(guardRoutes.length === 46, `Tabanda androidWordGuard taşıyan ve değişen route sayısı = 46 (${guardRoutes.length})`);
      let checked = 0;
      const stillBlocked: string[] = [];
      for (const f of guardRoutes) {
        const src = readFileSync(f, "utf8");
        const methods = [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH)\b/g)].map((m) => m[1]);
        const url = "/" + f.replace(/\\/g, "/").replace(/^app\//, "").replace(/\/route\.ts$/, "")
          .replace(/\[seriesId\]|\[id\]/g, "00000000-0000-0000-0000-000000000000");
        for (const m of methods) {
          const r = await fetch(`${APP}${url}`, { method: m, headers: { "user-agent": ANDROID_UA, "content-type": "application/json" }, body: m === "GET" ? undefined : "{}" });
          const t = await r.text();
          checked++;
          if (r.status === 403 && GUARD_MSG.test(t)) stillBlocked.push(`${m} ${url}`);
        }
      }
      ok(checked >= 46 && stillBlocked.length === 0, `${checked} istek (46 route): hiçbiri Android Word engeli döndürmedi`, stillBlocked);
      for (const url of ["/api/hd/reports/professional", "/api/hd/reports/professional/download"]) {
        const r = await fetch(`${APP}${url}`, { method: "POST", headers: { "user-agent": ANDROID_UA, "content-type": "application/json" }, body: "{}" });
        ok(r.status === 403 && GUARD_MSG.test(await r.text()), `HD ${url}: Android engeli KORUNUYOR (403)`);
      }
    }

    // ── E) Çalışma anı yetki + tenant izolasyonu (dosya uçları) ──────────────────
    section("E. Yetki ve tenant izolasyonu (çalışma anı)");
    {
      const A = seed.users.A;
      const B = seed.users.B; // başka tenant (TB)
      const NOMOD = seed.users.NOMOD;
      const req = (url: string, h: Record<string, string>, init: RequestInit = {}) =>
        fetch(`${APP}${url}`, { ...init, headers: { "content-type": "application/json", "user-agent": ANDROID_UA, ...h } });
      const asUser = (u: { id: string; token: string }) => ({ "x-user-id": u.id, "x-session-token": u.token });

      const bogus = await req("/api/kisisel-arsiv/signed-url?filePath=x", { "x-user-id": A.id, "x-session-token": "zz-bogus-token-not-a-session" });
      ok(bogus.status === 401, `Kişisel Arşiv: bozuk/süresi dolmuş token → 401 (${bogus.status})`);
      const mismatch = await req("/api/kisisel-arsiv/signed-url?filePath=x", { "x-user-id": A.id, "x-session-token": B.token });
      ok(mismatch.status === 403, `Kişisel Arşiv: başka kullanıcının token'ı → 403 (${mismatch.status})`);
      const noTok = await req("/api/kisisel-arsiv/signed-url?filePath=x", { "x-user-id": A.id });
      ok(noTok.status === 401, `Kişisel Arşiv: token yok → 401 (${noTok.status})`);

      const crossSigned = await req(`/api/clients/${a1}/stone-photos/signed-urls`, asUser(B), { method: "POST", body: "{}" });
      const crossSignedBody = await crossSigned.text();
      ok(crossSigned.status >= 400 && !/token=|\/object\/sign\//.test(crossSignedBody), `Taş fotoğrafı imzalı okuma: başka tenant → reddedildi (${crossSigned.status}), URL sızmadı`);
      const crossPrep = await req(`/api/clients/${a1}/stone-photos/prepare`, asUser(B), { method: "POST", body: JSON.stringify({ stoneId: "00000000-0000-0000-0000-000000000000", mimeType: "image/webp", size: 1000 }) });
      ok(crossPrep.status >= 400, `Taş fotoğrafı yükleme hazırlığı: başka tenant → reddedildi (${crossPrep.status})`);
      const crossAnam = await req(`/api/clients/${a1}/anamnez`, asUser(B));
      ok(crossAnam.status >= 400, `Anamnez: başka tenant → reddedildi (${crossAnam.status})`);
      const crossWord = await req(`/api/clients/${a1}/word-report`, asUser(B), { method: "POST", body: JSON.stringify({ exportMode: "tab", tabName: "taslar" }) });
      ok(crossWord.status >= 400, `Danışan Word: başka tenant → reddedildi (${crossWord.status}; Android engeli kalksa da tenant kapısı çalışıyor)`);
      const noModWord = await req(`/api/clients/${a1}/word-report`, asUser(NOMOD), { method: "POST", body: JSON.stringify({ exportMode: "tab", tabName: "taslar" }) });
      ok(noModWord.status === 403 || noModWord.status === 404, `Danışan Word: modül yetkisi yok → reddedildi (${noModWord.status})`);
      const anonPhotos = await fetch(`${APP}/api/clients/${a1}/stone-photos`, { headers: { "user-agent": ANDROID_UA } });
      ok(anonPhotos.status === 401, `Taş fotoğrafları: kimliksiz → 401 (${anonPhotos.status})`);
    }

    ok(pageErrors.length === 0, `sayfa JS hatası yok (${pageErrors.length})`, pageErrors);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop().catch(() => {});
  }
  console.log(`\nmobile-files UI harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log("FAIL:", fails); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
