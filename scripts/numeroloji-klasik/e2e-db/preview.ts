/**
 * Klasik Numeroloji — Owner görsel incelemesi için GÜVENLİ YEREL ÖNİZLEME (production'a SIFIR temas).
 *
 * Ne kurar (e2e.ts ile aynı yığın):
 *   • geçici embedded-postgres + PostgREST shim (127.0.0.1), Klasik + Doğaltaş Kütüphanesi migration'ları,
 *     SENTETİK uzman / danışan, kayıtlı ham yanıtlardan katalog + 91 gerçek taş (0 kredi),
 *   • `next dev` bayraklar AÇIK (yalnız bu yerel süreçte), sağlayıcı = KAYITLI yanıtların yeniden oynatılması
 *     (provider-preload.cjs; gerçek sağlayıcıya istek YOK, dış ağ kilitli; ücretli anahtar ortama VERİLMEZ),
 *   • örnek kayıtlar (kişi analizi danışana bağlı, Kişisel Gün, ilişki), ardından görünür bir Chromium penceresi
 *     uzman oturumuyla /numeroloji-merkezi'de açılır. Kapatmak için bu terminalde Ctrl+C.
 *
 * Production verisi, gerçek kullanıcı, sır veya Vercel önizlemesi KULLANILMAZ.
 * Çalıştır: npx tsx scripts/numeroloji-klasik/e2e-db/preview.ts   (port: NUMK_PREVIEW_PORT, varsayılan 3995)
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(__dirname, "../../..");
const PORT = Number(process.env.NUMK_PREVIEW_PORT ?? 3995);
const PG_PORT = Number(process.env.NUMK_PREVIEW_PG_PORT ?? 54671);
const SHIM_PORT = Number(process.env.NUMK_PREVIEW_SHIM_PORT ?? 54672);
const APP = `http://127.0.0.1:${PORT}`;
const OUT = path.join(process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29", "onizleme");
const PRELOAD = path.join(__dirname, "provider-preload.cjs").replace(/\\/g, "/");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
  else try { process.kill(-pid, "SIGKILL"); } catch { /* yok */ }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const { startE2eDb, seedUsers, importCatalog, populateStoneLibrary, ANON_KEY, SERVICE_KEY } = await import("./env");
  console.log("Yerel önizleme kuruluyor (geçici PG + sentetik veri + kayıtlı yanıtlar)…");
  const env = await startE2eDb({ pgPort: PG_PORT, httpPort: SHIM_PORT });
  const S = await seedUsers(env.su);
  await importCatalog(PG_PORT);
  const lib = await populateStoneLibrary(env, PG_PORT, [S.A.id, S.A2.id, S.B.id]);
  console.log(`  kütüphane: ${lib.published} gerçek taş yayında (0 kredi)`);

  const nextEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${PRELOAD}`.trim(),
    NUMK_E2E_PROVIDER: "replay",
    NUMK_E2E_LOG: path.join(OUT, "provider-events.jsonl").replace(/\\/g, "/"),
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: env.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    NUMEROLOGY_CLASSIC_ENABLED: "true",
    NUMEROLOGY_CLASSIC_PROVIDER_CALLS: "true",
    NUMEROLOGY_CLASSIC_CACHE_SECRET: "zz-numk-preview-cache-secret",
    ROXY_API_KEY: "zz-preview-fake-key",
    STONE_LIBRARY_ENABLED: "true",
  };
  for (const k of ["ROXY_API_BASE_URL", "USAGE360_ENABLED", "SESSION_COOKIE_MODE", "VERCEL", "VERCEL_ENV"]) delete nextEnv[k];
  const logFd = openSync(path.join(OUT, "next-dev.log"), "a");
  const app: ChildProcess = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT, env: nextEnv, stdio: ["ignore", logFd, logFd], windowsHide: true,
  });
  const cleanup = () => killTree(app.pid);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("exit", cleanup);
  for (let i = 0; i < 400; i++) {
    try { if ((await fetch(`${APP}/numeroloji-merkezi`)).status < 500) break; } catch { /* bekle */ }
    await sleep(1500);
  }
  const call = (method: string, p: string, body?: unknown) =>
    fetch(`${APP}${p}`, { method, headers: { "content-type": "application/json", "x-user-id": S.A.id, "x-session-token": S.A.token }, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> }));
  // Örnek kayıtlar (kayıtlı vaka gövdeleriyle birebir; yeniden oynatma)
  const person = await call("POST", "/api/numeroloji-klasik/analyses", {
    kind: "person", title: "Ayşe Can Öztürk — örnek", clientId: S.clientA, techniques: ["core", "bridge", "daily", "chaldean", "dual"],
    input: { fullName: "Ayşe Can Öztürk", birth: { year: 1988, month: 2, day: 29 }, targetDate: "2026-10-29" },
  });
  await call("POST", "/api/numeroloji-klasik/analyses", {
    kind: "person", title: "Kişisel Gün — örnek", clientId: null, techniques: ["personal_day"],
    input: { fullName: "Ayşe Can Öztürk", birth: { year: 1988, month: 2, day: 29 }, targetDate: "2028-02-29" },
  });
  const pid = (person.json.analysis as { id?: string } | undefined)?.id;
  console.log(`  örnek kişi analizi: ${person.status}${pid ? ` → ${APP}/numeroloji-klasik/analiz/${pid}` : ""}`);

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: null, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = { id: S.A.id, tenant_id: S.A.tenantId, full_name: S.A.fullName, name: S.A.fullName, email: S.A.email, role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", membership_status: "active", module_permissions: S.A.perms, is_demo_account: false };
  await ctx.addInitScript(([u, tok]) => {
    try {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", tok as string);
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch { /* yok */ }
  }, [JSON.stringify(user), S.A.token]);
  await ctx.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u.href) && !u.href.startsWith("data:") && !u.href.startsWith("blob:"), (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(`${APP}/numeroloji-merkezi`);
  console.log(`\nÖNİZLEME HAZIR: ${APP}/numeroloji-merkezi  (sentetik uzman "${S.A.fullName}"; danışan dosyası: ${APP}/dashboard/clients/${S.clientA}?tab=numeroloji)`);
  console.log("Kapatmak için Ctrl+C. (Yeni hesaplar yalnız kayıtlı vaka gövdeleriyle eşleşirse yanıt alır; diğerleri 'hesaplanamadı' gösterir.)");
  browser.on("disconnected", () => { cleanup(); process.exit(0); });
  for (;;) await sleep(60_000);
}

main().catch((e) => {
  console.error("önizleme hatası:", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
