/**
 * Premium Word Arşivi — GERÇEK TARAYICI UI testi (yalnız 127.0.0.1; production'a SIFIR temas; API'ler taklit edilir).
 *
 * Ön koşul: sahte ortam değişkenleriyle yerel sunucu (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54599 NEXT_PUBLIC_SUPABASE_ANON_KEY=zz SUPABASE_SERVICE_ROLE_KEY=zz \
 *   npx next dev --webpack -p 3991 -H 127.0.0.1
 * Çalıştır: ARCHIVE_UI_URL=http://127.0.0.1:3991 npx tsx scripts/settings-export/archive-ui.e2e.ts [çıktı klasörü]
 *
 * Masaüstü 1366×900 + mobil 390×844: modül seçimi, danışan seçici, tarih aralığı, içerik türleri, plan özeti,
 * arşiv indirme (ZIP gerçek okuyucuyla açılır), başarısız parça → EKSİK + "yeniden dene" ek arşivi, denetim kaydı
 * isteği, mobilde yatay taşma yok ve dokunma alanları ≥ 44 px.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { chromium, type Page, type Route } from "playwright";
import { buildArchiveDocx } from "../../lib/backup/wordExport";
import { getRegistryEntry } from "../../lib/backup/registry";

const APP = process.env.ARCHIVE_UI_URL ?? "http://127.0.0.1:3991";
const OUT = process.argv[2] ?? path.join(process.cwd(), ".archive-ui-out");
mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, extra?: unknown) => {
  if (c) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
  }
};

const USER = {
  id: "aaaaaaaa-1111-4000-8000-00000000000a",
  tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a",
  full_name: "Sentetik Uzman",
  email: "zz.archive@example.test",
  role: "expert",
  active: true,
  approval_status: "approved",
  package_type: "premium",
  plan: "premium",
  module_permissions: { clients: true, human_design: true },
  is_demo_account: false,
};
const C1 = { id: "c1c1c1c1-0000-4000-8000-000000000001", name: "Ayşe Öztürk" };
const C2 = { id: "c2c2c2c2-0000-4000-8000-000000000002", name: "Çağrı Işık" };

type Seen = { plan: unknown[]; parts: unknown[]; audit: unknown[] };

async function sampleDocx(title: string): Promise<Buffer> {
  const e = getRegistryEntry("client_sessions")!;
  const b = await buildArchiveDocx({ title, modules: [{ key: "clients", label: "Danışan Yolculuğu", tables: [{ entry: e, rows: [{ id: "1", title: "Seans ğüş" }], expected_count: 1, complete: true, error: null }] }] });
  return b.buffer;
}

async function mount(page: Page, seen: Seen, mode: { hdFails: boolean }) {
  const docx = await sampleDocx("UI testi");
  await page.route("**/__file/**", (r: Route) => r.fulfill({ status: 200, body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), headers: { "Access-Control-Allow-Origin": "*" } }));
  await page.route("**/api/**", async (r: Route) => {
    const url = new URL(r.request().url());
    const body = (() => {
      try {
        return JSON.parse(r.request().postData() ?? "null");
      } catch {
        return null;
      }
    })();
    const json = (status: number, b: unknown) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname === "/api/settings/archive/clients") return json(200, { ok: true, total: 2, clients: [C1, C2] });
    if (url.pathname === "/api/settings/archive/plan") {
      seen.plan.push(body);
      const o = body.options;
      return json(200, {
        ok: true, version: 1, archive_id: "a0a0a0a0-0000-4000-8000-000000000001", created_at: "2026-11-09T10:00:00.000Z", file_name: "yasam-arsiv-2026-11-09.zip",
        options: o,
        jobs: [
          { kind: "data", module: "clients", label: "Danışan Yolculuğu — kayıt dökümü", folder: "Kayıt Dökümü (Word)/01 Danışan Yolculuğu", expected: 3 },
          { kind: "client_dossier", clientId: C1.id, label: "Danışan dosyası — Ayşe Öztürk", folder: "Danışan Dosyaları/Ayşe Öztürk" },
          { kind: "hd_report", reportId: "d0d0d0d0-0000-4000-8000-000000000001", label: "HD raporu — Ayşe Öztürk", folder: "Hazır Analiz Raporları/Human Design/Ayşe Öztürk" },
          { kind: "file", source: "analysis_image", rowId: "f0f0f0f0-0000-4000-8000-000000000001", index: 0, label: "Analiz görseli.png", folder: "Fotoğraf ve Ekler/Ayşe Öztürk/Analiz görselleri" },
        ],
        summary: [{ module: "clients", label: "Danışan Yolculuğu", records: 3, tables: [{ label: "Danışanlar", records: 1 }] }],
        excluded: [{ scope: "Doğaltaş", reason: "danışana bağlı olmayan kayıt (danışan seçimi yapıldı)" }],
        warnings: [],
      });
    }
    if (url.pathname === "/api/settings/archive/part") {
      seen.parts.push(body);
      const job = body.job;
      const file = (name: string, extra: Record<string, string> = {}) =>
        r.fulfill({
          status: 200,
          body: docx,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "X-Archive-File-Name": encodeURIComponent(name),
            "Access-Control-Expose-Headers": "X-Archive-Next, X-Archive-Rows, X-Archive-Errors, X-Archive-Note, X-Archive-File-Name",
            ...extra,
          },
        });
      if (job.kind === "data") return file("Danışan Yolculuğu — Kayıt Dökümü — Bölüm 1.docx", { "X-Archive-Rows": "3", "X-Archive-Next": "" });
      if (job.kind === "client_dossier") return file("Ayşe Öztürk — Tam Rapor.docx");
      if (job.kind === "hd_report") return mode.hdFails ? json(500, { ok: false, error: "Arşiv parçası oluşturulamadı; yeniden denenebilir." }) : file("HD Raporu — Ayşe Öztürk.docx");
      if (job.kind === "file") return json(200, { ok: true, url: `${APP}/__file/x.png`, file_name: "Analiz görseli.png", expires_in: 60 });
      return json(400, { ok: false });
    }
    if (url.pathname === "/api/settings/archive/audit") {
      seen.audit.push(body);
      return json(200, { ok: true, recorded: true });
    }
    if (url.pathname.startsWith("/api/auth/profile")) return json(200, { ok: true, user: USER, profile: USER });
    return json(200, { ok: true });
  });
}

async function openExport(page: Page) {
  await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByRole("button", { name: /Dışa Aktarım/ }).first().click({ timeout: 120_000 });
  await page.getByTestId("archive-export").waitFor({ timeout: 60_000 });
}

async function zipNames(p: string): Promise<{ names: string[]; zip: JSZip }> {
  const zip = await JSZip.loadAsync(readFileSync(p), { checkCRC32: true });
  return { names: Object.keys(zip.files), zip };
}

(async () => {
  const browser = await chromium.launch();
  for (const device of [
    { key: "masaustu", viewport: { width: 1366, height: 900 }, mobile: false },
    { key: "mobil", viewport: { width: 390, height: 844 }, mobile: true },
  ]) {
    console.log(`\n[${device.key}]`);
    const ctx = await browser.newContext({ viewport: device.viewport, isMobile: device.mobile, hasTouch: device.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
    await ctx.addInitScript(([u]) => {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", "zz-ui-token");
    }, [JSON.stringify(USER)]);
    const page = await ctx.newPage();
    const seen: Seen = { plan: [], parts: [], audit: [] };
    const mode = { hdFails: device.key === "mobil" };
    await mount(page, seen, mode);
    await openExport(page);

    const modulesTxt = await page.locator("#arc-modules").innerText();
    ok(/1 · Modüller \((\d+)\/\1\)/i.test(modulesTxt), `${device.key}: tüm modüller varsayılan seçili (${modulesTxt})`);
    ok((await page.getByText("Gökyüzü Atlası", { exact: true }).count()) > 0, `${device.key}: Gökyüzü Atlası modülü listede`);
    ok((await page.getByText(/geri yüklenemez/).count()) > 0 && (await page.getByText(/Sistem Yedeği \(JSON\)/).count()) > 0, `${device.key}: Word arşivi ≠ JSON yedeği açıkça yazılı`);

    const root = page.getByTestId("archive-export");
    await root.getByRole("button", { name: "Temizle", exact: true }).click();
    await page.getByLabel("Danışan Yolculuğu arşive dahil").check();
    await page.getByLabel("Human Design arşive dahil").check();
    await root.getByText(/^Seçili danışanlar/).click();
    await root.getByLabel("Danışan ara").fill("ayşe");
    await root.getByRole("button", { name: "Ara", exact: true }).click();
    await root.getByRole("button", { name: /Ayşe Öztürk/ }).click();
    await page.getByLabel("Kayıt tarihi — başlangıç").fill("2026-01-01");
    await page.getByLabel("Kayıt tarihi — bitiş").fill("2026-10-31");
    await root.getByText("Fotoğraf ve ekler", { exact: true }).click();
    await page.getByTestId("archive-plan").click();
    await page.getByTestId("archive-plan-summary").waitFor();
    const sent = (seen.plan.at(-1) as { options: Record<string, unknown> }).options;
    ok(
      JSON.stringify(sent.modules) === JSON.stringify(["clients", "human_design"]) &&
        JSON.stringify(sent.clientIds) === JSON.stringify([C1.id]) &&
        sent.dateFrom === "2026-01-01" &&
        sent.dateTo === "2026-10-31" &&
        (sent.include as { files: boolean }).files === true,
      `${device.key}: plan isteği seçimleri doğru taşır`,
      sent,
    );
    const summary = await page.getByTestId("archive-plan-summary").innerText();
    ok(/4 parça/.test(summary) && /Doğaltaş/.test(summary) === false, `${device.key}: plan özeti görünür`, summary);
    await page.getByText(/Kapsam dışı kalanlar/).click();
    ok((await page.getByText(/danışana bağlı olmayan kayıt/).count()) > 0, `${device.key}: kapsam dışı kalanlar gerekçeli listelenir`);
    await page.screenshot({ path: path.join(OUT, `${device.key}-plan.png`), fullPage: true });

    if (device.mobile) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(overflow <= 1, `mobil: yatay taşma yok (${overflow}px)`);
      const small = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="archive-export"]')!;
        const els = [...root.querySelectorAll("button, label")] as HTMLElement[];
        return els
          .filter((e) => e.offsetParent !== null && !e.closest("details:not([open])"))
          .map((e) => ({ t: (e.innerText || e.getAttribute("aria-label") || "").slice(0, 30), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }))
          .filter((x) => x.h < 44 || x.w < 44);
      });
      ok(small.length === 0, `mobil: tüm dokunma alanları ≥ 44 px`, small);
    }

    const dl1 = page.waitForEvent("download", { timeout: 120_000 });
    await page.getByTestId("archive-run").click();
    const d1 = await dl1;
    const p1 = path.join(OUT, `${device.key}-${d1.suggestedFilename()}`);
    await d1.saveAs(p1);
    await page.getByTestId("archive-result").waitFor();
    const { names, zip } = await zipNames(p1);
    const zroot = "Yaşam Arşivi 2026-11-09/";
    ok(names.includes(`${zroot}Kayıt Dökümü (Word)/01 Danışan Yolculuğu/Danışan Yolculuğu — Kayıt Dökümü — Bölüm 1.docx`), `${device.key}: ZIP klasör yapısı (kayıt dökümü)`, names);
    ok(names.includes(`${zroot}Danışan Dosyaları/Ayşe Öztürk/Ayşe Öztürk — Tam Rapor.docx`), `${device.key}: danışan dosyası klasörü`);
    ok(names.includes(`${zroot}Fotoğraf ve Ekler/Ayşe Öztürk/Analiz görselleri/Analiz görseli.png`), `${device.key}: fotoğraf ayrı dosya`);
    const readme = await zip.file(`${zroot}BENİOKU.txt`)!.async("string");
    const result = await page.getByTestId("archive-result").innerText();
    if (!mode.hdFails) {
      ok(names.includes(`${zroot}Hazır Analiz Raporları/Human Design/Ayşe Öztürk/HD Raporu — Ayşe Öztürk.docx`), "masaüstü: HD raporu klasörü");
      ok(/Arşiv tamamlandı/.test(result) && /TAMAMLANDI/.test(readme), "masaüstü: sonuç TAMAMLANDI (arayüz + BENİOKU)", result);
      ok(seen.audit.length === 1 && (seen.audit[0] as { result: { status: string } }).result.status === "complete", "masaüstü: sonuç denetim isteği gönderildi");
    } else {
      ok(/EKSİK/.test(result) && /Başarısız 1/.test(result) && /EKSİK/.test(readme), "mobil: başarısız HD parçası → EKSİK (başarılı gösterilmez)", result);
      const rep = await zip.file(`${zroot}ARŞİV-RAPORU.txt`)!.async("string");
      ok(/HD raporu — Ayşe Öztürk/.test(rep), "mobil: başarısız parça ARŞİV-RAPORU.txt dosyasında");
      ok((seen.audit[0] as { result: { status: string; failed: number } }).result.status === "partial", "mobil: denetim sonucu partial");
      mode.hdFails = false;
      const dl2 = page.waitForEvent("download", { timeout: 120_000 });
      await page.getByRole("button", { name: /yeniden dene/ }).click();
      const d2 = await dl2;
      const p2 = path.join(OUT, `mobil-${d2.suggestedFilename()}`);
      await d2.saveAs(p2);
      const second = await zipNames(p2);
      ok(d2.suggestedFilename().endsWith("-ek.zip") && second.names.some((n) => n.endsWith("HD Raporu — Ayşe Öztürk.docx")), "mobil: yeniden deneme yalnız başarısız parçayla ek arşiv üretir", second.names);
      await page.getByTestId("archive-result").getByText("Arşiv tamamlandı").waitFor();
      ok(true, "mobil: ek arşiv sonrası sonuç TAMAMLANDI");
    }
    await page.screenshot({ path: path.join(OUT, `${device.key}-sonuc.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log(`\narchive-ui e2e: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error("e2e çöktü:", e);
  process.exit(1);
});
