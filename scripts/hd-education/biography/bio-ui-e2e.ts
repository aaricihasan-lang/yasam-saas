/**
 * HD Hazır Eğitim Haritaları — FAZ 10 "HAYAT HİKÂYESİ" gerçek tarayıcı testi (Playwright + `next start`).
 * Tarayıcı → gerçek Next route'ları → PostgREST shim → geçici embedded-postgres (merkezî + özel arşiv + çizim + biyografi migration).
 * SENTETİK bölüm her zaman çalışır (ZZ_*). İsteğe bağlı GERÇEK bölüm (--real-*): korumalı alandaki gerçek snapshot paketleri ve
 * gerçek biyografi dosyaları YALNIZ bu geçici yerel DB'ye yüklenir; "yayın" yalnız yerel test DB'sindedir (gerçek yayın kararı DEĞİL).
 * Ücretli sağlayıcı kapısı KAPALI; localhost dışı her tarayıcı isteği abort edilir ve sayılır. Fiziksel cihaz DEĞİL: emülasyon.
 * Ön koşul: test build (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 … npx next build).
 * Çalıştır: npx tsx scripts/hd-education/biography/bio-ui-e2e.ts --out <repo-dışı YENİ klasör>
 *   [--real-import <sql> --local-key <sql> --real-owner <uuid> --pkg <paket1,paket2> --bio-dir <biyografi klasörü>]
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { PRIVATE_RPCS } from "../private/pgSchema";
import { ANN_RPCS, annotationSql, readMig, seedCentralSubject } from "../annotations/annSeed";
import { restoreSnapshotFile } from "../real/snapshot-io";
import { bioInsertSql, loadBioDir, parseBioFile } from "./bioImport";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ""; };
const OUT = arg("--out");
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const REAL = { imp: arg("--real-import"), key: arg("--local-key"), owner: arg("--real-owner"), pkgs: arg("--pkg").split(",").filter(Boolean), bioDir: arg("--bio-dir") };
const realMode = !!(REAL.imp && REAL.key && REAL.owner && REAL.pkgs.length && REAL.bioDir);
const PORT = 3987;
const APP = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const shots: string[] = [];
async function snap(page: Page, name: string, full = false) {
  const file = path.join(OUT, `${name}.png`);
  if (existsSync(file)) throw new Error(`üzerine yazılmaz: ${file}`);
  await page.waitForTimeout(350);
  await page.screenshot({ path: file, fullPage: full });
  shots.push(name);
}
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

/** Uzun sentetik biyografi (ZZ): 6 bölüm, çok paragraf, 14 olay, 8 kaynak. */
function longSynthBio(personKey: string, naturalKey: string, name: string) {
  const para = (i: number) => `ZZ sentetik paragraf ${i}. ${"Bu cümle uzun metin düzenini sınamak için yazılmıştır; satır kırılımı, okunabilirlik ve taşma kontrol edilir. ".repeat(4)}Uzun-bir-kelime-denemesi-ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ.`;
  const keys = ["childhood", "education", "career", "events", "later", "impact"];
  return {
    contract: "hd-edu-bio-1", person_key: personKey, natural_key: naturalKey, lang: "tr", display_name: name, life_span: "1869–1951", birth_year: 1869, death_year: 1951,
    is_living: false, profession: "ZZ Kuramsal fizikçi", known_for: "ZZ sentetik kuramlar ve deneyler", country: "ZZ Ülke · ZZ İkinci Ülke", era: "19.–20. yüzyıl", category: "bilim",
    short_intro: `${name}, testler için hazırlanmış sentetik bir eğitim kişisidir. Gerçek bir kişiyi temsil etmez.`,
    sections: keys.map((k, i) => ({ key: k, title: "", paragraphs: [0, 1, 2].map((j) => ({ text: para(i * 3 + j + 1), source_ids: j % 2 ? ["s2", "s3"] : ["s1"] })) })),
    timeline: Array.from({ length: 14 }, (_, i) => ({ date: i === 0 ? "1869-11-22" : `${1875 + i * 5}`, title: i === 0 ? "Doğumu" : `ZZ olay ${i}`, text: `ZZ sentetik yaşam olayı açıklaması ${i}.`, source_ids: [`s${(i % 8) + 1}`] })),
    sources: Array.from({ length: 8 }, (_, i) => i === 0
      ? { id: "s1", title: "ZZ Sentetik Madde", publisher: "Vikipedi (Türkçe)", kind: "wikipedia", url: "https://tr.wikipedia.org/w/index.php?title=ZZ&oldid=1", accessed_on: "2026-10-24", revision_id: "1", license: "CC BY-SA 4.0" }
      : { id: `s${i + 1}`, title: `ZZ Kaynak ${i + 1}`, publisher: "ZZ Yayıncı", kind: "encyclopedia", url: `https://example.org/zz-kaynak-${i + 1}`, accessed_on: "2026-10-24" }),
    wikipedia_usage: { direct_quotes: false, adapted_text: false, articles: [{ lang: "tr", title: "ZZ Sentetik Madde", oldid: "1", url: "https://tr.wikipedia.org/w/index.php?title=ZZ&oldid=1" }], note: null },
    open_questions: ["ZZ sentetik belirsizlik: iki kaynakta farklı yıl."], neutrality_note: null, content_status: "source_checked",
  };
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let env: TestEnv | null = null;
  const external: string[] = [];
  const consoleErrors: string[] = [];
  const badResponses = new Map<string, number>();
  let providerReq = 0;
  try {
    env = await startAnamnezTestEnv({
      port: Number(process.env.HD_EDU_BIO_UI_PG_PORT ?? 54920 + (Date.now() % 40)), httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-bio-ui-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: [...PRIVATE_RPCS, ...ANN_RPCS], extraSql: [...annotationSql(), readMig("20271127000000_hd_education_biographies.sql")],
    });
    const su = env.su;
    su.on("error", (e) => { consoleErrors.push(`pg bağlantısı düştü: ${e.message}`); });
    const q = (sql: string, a: unknown[] = []) => su.query(sql, a);
    type U = { id: string; token: string; name: string; role: "admin" | "expert"; tenant: string };
    const mkUser = async (role: "admin" | "expert", name: string, superAdmin = false, fixedId?: string): Promise<U> => {
      const id = fixedId ?? randomUUID(), tenant = randomUUID(), token = `zz-bioui-${randomUUID()}`;
      await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_T_${name}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,$6,$7,'premium','premium',$8)`,
        [id, name, `zz.bioui.${id.slice(0, 8)}@example.test`, role, superAdmin, tenant, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), role === "admin" ? "owner" : null]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, name, role, tenant };
    };
    const OWNER = await mkUser("admin", "ZZ Owner", true, realMode ? REAL.owner : undefined);
    const ADMIN = await mkUser("admin", "ZZ Normal Admin");
    const T = await mkUser("expert", "ZZ Eğitmen Ayşe");
    const T2 = await mkUser("expert", "ZZ Eğitmen Bora");
    const X = await mkUser("expert", "ZZ Yetkisiz Uzman");
    for (const w of [T, T2]) await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, w.id]);
    const S1 = await seedCentralSubject(q, OWNER.id, { name: "ZZ Sentetik Bilimci", publish: true });
    const S2 = await seedCentralSubject(q, OWNER.id, { name: "ZZ Biyografisiz Harita", publish: true, date: "1901-05-05" });
    const nk1 = (await q(`select natural_key from public.hd_education_subjects where id=$1`, [S1.id])).rows[0].natural_key as string;
    await q(bioInsertSql(parseBioFile("zz-bioui-a.tr.json", JSON.stringify(longSynthBio("zz-bioui-a", nk1, "ZZ Sentetik Bilimci")))));
    const bio1 = (await q(`select id from public.hd_education_biographies where person_key='zz-bioui-a'`)).rows[0].id as string;
    await q(`update public.hd_education_biographies set publish_status='published', published_at=now(), published_by=$2, revision=revision+1 where id=$1`, [bio1, OWNER.id]);

    // ── İsteğe bağlı GERÇEK bölüm: yalnız bu geçici DB'ye ───────────────────────────────────────
    const realPublished: Array<{ id: string; key: string; name: string; events: number }> = [];
    let realBioFiles = 0;
    if (realMode) {
      await q(readFileSync(REAL.key, "utf8"));
      await q(readFileSync(REAL.imp, "utf8"));
      let restored = 0;
      for (const pkg of REAL.pkgs) {
        const man = readFileSync(path.join(pkg, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string });
        for (const m of man) if ((await restoreSnapshotFile(su, path.join(pkg, "snapshots", m.file), m.sha256)) === "RESTORED") restored++;
      }
      ok(restored === 18, `gerçek snapshot'lar SHA doğrulamalı geri yüklendi (${restored}/18)`, restored);
      const { files, errors } = loadBioDir(REAL.bioDir);
      ok(errors.length === 0, `gerçek biyografi dosyaları doğrulayıcıdan geçti (${files.length})`, errors.slice(0, 3));
      for (const f of files) await q(bioInsertSql(f));
      realBioFiles = files.length;
      // Yerel test "yayını": hukuk E (Elvis, Philip) HARİÇ hesaplanmış kişiler. Gerçek yayın kararı DEĞİLDİR.
      const comp = (await q(`select distinct on (s.id) s.id, s.natural_key, s.display_name, s.legal_status, c.id chart_id from public.hd_education_subjects s
          join public.hd_education_charts c on c.subject_id=s.id and c.subject_revision=s.revision and c.calc_status='OK' where s.natural_key not like 'zz-%' order by s.id, c.version desc`)).rows as Array<{ id: string; natural_key: string; display_name: string; legal_status: string; chart_id: string }>;
      for (const s of comp) {
        if (s.legal_status === "E") continue;
        await q(`update public.hd_education_publications set chart_id=$2, chart_verified_by=$3, chart_verified_at=now() where subject_id=$1`, [s.id, s.chart_id, OWNER.id]);
        await q(`update public.hd_education_subjects set legal_status='LOW_REVIEWED', legal_reviewed_by=$2, legal_reviewed_at=now(), legal_review_ref='YEREL-TEST', blockers='{}' where id=$1`, [s.id, OWNER.id]);
        await q(`update public.hd_education_publications set status='approved', approved_by=$2, approved_at=now(), legal_clearance_ref='YEREL-TEST', updated_by=$2 where subject_id=$1`, [s.id, OWNER.id]);
        await q(`update public.hd_education_publications set status='published', updated_by=$2 where subject_id=$1`, [s.id, OWNER.id]);
        const b = (await q(`update public.hd_education_biographies set publish_status='published', published_at=now(), published_by=$2, revision=revision+1
            where subject_id=$1 and lang='tr' returning jsonb_array_length(timeline) n`, [s.id, OWNER.id])).rows[0] as { n: number } | undefined;
        realPublished.push({ id: s.id, key: s.natural_key, name: s.display_name, events: b?.n ?? -1 });
      }
      const legalE = comp.filter((s) => s.legal_status === "E").map((s) => s.natural_key);
      ok(comp.length === 18 && realPublished.length === 18 - legalE.length, `18 hesaplanmış kişi; ${realPublished.length}'i yerel testte yayımlandı (hukuk E ${legalE.length} kişi hariç: ${legalE.join(", ")})`, [comp.length, realPublished.length]);
      ok(realPublished.every((r) => r.events > 0), `yerel yayımlı ${realPublished.length} kişinin hepsine biyografi bağlandı`, realPublished.filter((r) => r.events <= 0).map((r) => r.key));
      writeFileSync(path.join(OUT, "_hukuk-E-yerel-yayimlanmadi.txt"), legalE.join("\n"));
    }

    const envv: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HD_PRIVATE_EDUCATION_ENABLED: "true", HD_EDUCATION_CATALOG_ENABLED: "true" };
    delete envv.HD_EDUCATION_PROVIDER_CALLS_ENABLED; delete envv.ROXY_API_KEY;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: envv as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    const appLog: string[] = [];
    app.stdout?.on("data", (d) => appLog.push(String(d))); app.stderr?.on("data", (d) => appLog.push(String(d)));
    process.on("exit", () => { try { writeFileSync(path.join(OUT, "_next-sunucu.log"), appLog.join("").slice(-200000)); } catch { /* */ } });
    const appPid = app.pid;
    process.on("exit", () => { if (appPid && process.platform === "win32") { try { execSync(`taskkill /pid ${appPid} /T /F`, { stdio: "ignore" }); } catch { /* zaten kapalı */ } } });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const wire = (p: Page) => {
      p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|_vercel\/(speed-)?insights/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 300)}`); });
      p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${e.message.slice(0, 300)}`));
      p.on("response", (r) => { if (r.status() >= 400) { const k = `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`; badResponses.set(k, (badResponses.get(k) ?? 0) + 1); } });
    };
    const ctxFor = async (u: U, w: number, h: number, mobile: boolean): Promise<BrowserContext> => {
      const ctx = await browser!.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }, ...(u.role === "admin" ? [{ name: "yasam_admin_session", value: u.token, url: APP }] : [])]);
      const profile = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: "zz@example.test", role: u.role, active: true, approval_status: "approved",
        package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: u.role === "expert" ? { human_design: true, clients: true } : {} };
      await ctx.addInitScript("window.__name = window.__name || function (f) { return f; };");
      await ctx.addInitScript(([pu, tok]) => { try { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); } catch { /* */ } }, [JSON.stringify(profile), u.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        if (/\/compute|roxyapi|\/api\/hd\/charts\/roxy/.test(url.pathname)) providerReq++;
        return route.continue();
      });
      ctx.on("page", (p) => wire(p));
      return ctx;
    };
    const open = async (ctx: BrowserContext, url: string) => { const p = await ctx.newPage(); p.setDefaultTimeout(45000); await p.goto(`${APP}${url}`, { waitUntil: "load", timeout: 90000 }); return p; };
    const det = (id: string, tab?: string) => `/human-design/egitim-haritalari/${id}${tab ? `?sekme=${tab}` : ""}`;
    const overflowX = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const bioReq: string[] = [];

    section("1 · Eğitmen: sekmeler + Hayat Hikâyesi (masaüstü 1440)");
    const tctx = await ctxFor(T, 1440, 900, false);
    {
      const p = await open(tctx, det(S1.id));
      p.on("request", (r) => { if (/\/biography/.test(r.url())) bioReq.push(r.url()); });
      await p.waitForSelector("[data-edu-tab='harita'][aria-selected='true']");
      ok(await p.locator("[data-edu-tab]").count() === 3, "3 sekme: Human Design Haritası · Hayat Hikâyesi · Kaynaklar");
      ok(await p.locator("#edu-panel-harita [data-hd-cbg], #edu-panel-harita svg").count() > 0, "varsayılan sekme: BodyGraph (mevcut içerik)");
      ok(bioReq.length === 0, "harita sekmesindeyken biyografi isteği YOK (gereksiz yükleme yok)");
      await snap(p, "B01-hd-sekmesi-masaustu");
      await p.click("[data-edu-tab='hayat']");
      await p.waitForSelector("[data-bio-state='ok']");
      ok(p.url().includes("sekme=hayat"), "sekme adreste (?sekme=hayat)");
      ok(await p.locator("[data-bio-section]").count() === 6, "6 bölüm (Çocukluk → Tarihsel Etkisi)");
      ok((await p.locator("[data-bio-section]").first().getAttribute("data-bio-section")) === "childhood", "bölüm sırası sözleşmeye uygun");
      ok(await p.locator("[data-bio-event]").count() === 14, "zaman çizelgesi: 14 olay");
      ok(await p.locator("[data-bio-disclaimer]").isVisible(), "biyografi ≠ HD yorumu uyarısı görünür");
      ok(await p.locator("#edu-panel-harita").isHidden(), "BodyGraph sekmesi gizli (silinmedi, yalnız sekme değişti)");
      ok(await overflowX(p) <= 0, "yatay taşma yok (uzun kelime dahil)", await overflowX(p));
      await snap(p, "B02-hayat-hikayesi-ust-masaustu");
      await snap(p, "B03-hayat-hikayesi-tam-masaustu", true);
      const y0 = await p.evaluate(() => window.scrollY);
      await p.click("[data-bio-jump='1930']");
      await p.waitForTimeout(800);
      const y1 = await p.evaluate(() => window.scrollY);
      ok(y1 > y0 + 200, "yıla git (1930) → çizelgedeki olaya kaydırır", [y0, y1]);
      const ev = p.locator("[data-bio-event='1930']");
      const evTop = await ev.evaluate((e) => e.getBoundingClientRect().top);
      ok(evTop >= 50, "yıla gidilen olay üst başlığın altında kalmaz (görünür)", evTop);
      await snap(p, "B04-yasam-cizelgesi-yila-git");
      await p.reload({ waitUntil: "load" });
      await p.waitForSelector("[data-bio-state='ok']");
      ok(await p.locator("[data-edu-tab='hayat'][aria-selected='true']").count() === 1, "yenileme sonrası aynı sekme açık");
      await p.locator("[data-bio-section='career'] [data-bio-cite='s2']").first().click();
      await p.waitForSelector("[data-bio-sources-tab]");
      await p.waitForTimeout(500);
      ok(await p.locator("[data-edu-tab='kaynaklar'][aria-selected='true']").count() === 1, "kaynak numarası → Kaynaklar sekmesi");
      ok(await p.locator("[data-bio-source='s2']").evaluate((e) => e.className.includes("srcFocus")), "ilgili kaynak vurgulandı");
      const links = await p.locator("[data-bio-sources-tab] a").evaluateAll((as) => as.map((a) => ({ h: (a as HTMLAnchorElement).getAttribute("href"), t: (a as HTMLAnchorElement).target, r: (a as HTMLAnchorElement).rel })));
      ok(links.length >= 9 && links.every((l) => !!l.h && /^https:\/\//.test(l.h) && l.t === "_blank" && /noopener/.test(l.r) && /noreferrer/.test(l.r)), "tüm kaynak bağlantıları https + yeni sekme + noopener noreferrer", links.slice(0, 3));
      ok(await p.locator("[data-bio-license]").isVisible() && /CC BY-SA 4\.0/.test(await p.locator("[data-bio-license]").innerText()), "lisans/atıf kutusu: CC BY-SA 4.0 + makale sürümü");
      await snap(p, "B05-kaynaklar-sekmesi-masaustu", true);
      await p.click("[data-edu-tab='hayat']");
      await p.click("[data-bio-lang='en']");
      await p.waitForSelector("[data-bio-state='lang-missing']");
      ok(/İngilizce|English/.test(await p.locator("[data-bio-state='lang-missing']").innerText()) && /otomatik çeviri gösterilmez/.test(await p.locator("[data-bio-state='lang-missing']").innerText()), "EN yok → açık uyarı, uydurma çeviri yok");
      await snap(p, "B06-ingilizce-hazir-degil");
      await p.click("[data-bio-lang-switch='tr']");
      await p.waitForSelector("[data-bio-state='ok']");
      ok(true, "Türkçe sürüme geri dönüldü");
      await p.close();
    }

    section("2 · Biyografisiz harita · katalog araması");
    {
      const p = await open(tctx, det(S2.id, "hayat"));
      await p.waitForSelector("[data-bio-state='none']");
      ok(/henüz yayımlanmadı/.test(await p.locator("[data-bio-state='none']").innerText()), "biyografisi olmayan harita: boş durum mesajı");
      await snap(p, "B07-biyografi-yok-bos-durum");
      await p.click("[data-edu-tab='harita']");
      ok(await p.locator("#edu-panel-harita svg").count() > 0, "harita sekmesi normal açılır");
      await p.goto(`${APP}/human-design/egitim-haritalari`, { waitUntil: "load" });
      await p.waitForSelector("[data-edu-card-bio]");
      const zzCard = p.locator(`a[href$='/egitim-haritalari/${S1.id}']`);
      ok(/ZZ Kuramsal fizikçi · 1869–1951/.test(await zzCard.locator("[data-edu-card-profession]").innerText()), "katalog kartında meslek + yaşam yılları");
      await p.fill("input[type='search']", "ZZ Kuramsal");
      await p.waitForTimeout(300);
      ok(await p.locator("a[href*='/egitim-haritalari/']").count() === 1, "meslekle arama: 1 sonuç");
      await p.fill("input[type='search']", "ZZ İkinci Ülke");
      await p.waitForTimeout(300);
      ok(await p.locator("a[href*='/egitim-haritalari/']").count() === 1, "ülkeyle arama: 1 sonuç");
      await p.fill("input[type='search']", "Biyografisiz");
      await p.waitForTimeout(300);
      ok(await p.locator("a[href*='/egitim-haritalari/']").count() === 1, "adla arama (mevcut davranış) korunur");
      await snap(p, "B08-katalog-meslek-arama");
      await p.close();
    }

    section("3 · Notlarıma ekle → çalışma alanı (çizimler korunur, sessiz kayıt yok)");
    {
      const p = await open(tctx, `/human-design/egitim-haritalari/${S1.id}/calisma-alani`);
      await p.waitForSelector("[data-ann-workspace] [data-hd-cbg]");
      await p.waitForSelector("[data-ann-status]");
      // Önce bir çizim yap + kaydet (katman var olsun).
      await p.click("[data-ann-tool='circle']").catch(() => undefined);
      const box = await p.locator("[data-ann-stage]").first().boundingBox();
      if (box) { await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55); await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.6, { steps: 8 }); await p.mouse.up(); }
      await p.click("[data-ann-save]");
      await p.waitForSelector("[data-ann-status='saved'], [data-ann-status='clean']", { timeout: 15000 }).catch(() => undefined);
      const before = (await q(`select el_count, revision from public.hd_edu_annotation_layers where trainer_user_id=$1`, [T.id])).rows[0] as { el_count: number; revision: number } | undefined;
      ok(!!before && before.el_count >= 1, "çalışma alanında çizim kaydedildi", before);
      await p.goto(`${APP}${det(S1.id, "hayat")}`, { waitUntil: "load" });
      await p.waitForSelector("[data-bio-state='ok']");
      await p.click("[data-edu-tab='kaynaklar']");
      await p.click("[data-edu-tab='hayat']");
      await p.click("[data-edu-tab='harita']");
      await p.click("[data-edu-tab='hayat']");
      await p.locator("[data-bio-add-note='3']").click();
      await p.waitForURL(/calisma-alani/);
      await p.waitForSelector("[data-ann-general-notes]");
      const notes = await p.locator("[data-ann-general-notes]").inputValue();
      ok(/ZZ olay 3/.test(notes) && (await p.getAttribute("[data-ann-notes-card]", "data-ann-notes-card")) === "edit", "olay korumalı notun düzenleme taslağına eklendi (düzenleme açık)", notes.slice(0, 120));
      ok(await p.locator("[data-ann-status='dirty']").count() === 1, "KAYDEDİLMEMİŞ değişiklik olarak bekliyor (sessiz kayıt yok)");
      const dbMid = (await q(`select revision from public.hd_edu_annotation_layers where trainer_user_id=$1`, [T.id])).rows[0] as { revision: number };
      ok(dbMid.revision === before!.revision, "Kaydet'e basılmadan DB değişmedi");
      ok(await p.locator("[data-ann-overlay] [data-ann-el]").count() === before!.el_count, "sekme geçişleri sonrası çizimler aynen duruyor");
      await snap(p, "B09-notlarima-ekle-calisma-alani");
      await p.click("[data-ann-save]");
      await p.waitForTimeout(1200);
      const after = (await q(`select revision, doc from public.hd_edu_annotation_layers where trainer_user_id=$1`, [T.id])).rows[0] as { revision: number; doc: { notes: string; els: unknown[] } };
      ok(after.revision === before!.revision + 1 && /ZZ olay 3/.test(after.doc.notes) && after.doc.els.length === before!.el_count, "Kaydet → not kalıcı, çizimler korunmuş", [after.revision, after.doc.els.length]);
      const other = (await q(`select count(*)::int n from public.hd_edu_annotation_layers where trainer_user_id=$1`, [T2.id])).rows[0].n;
      ok(other === 0, "başka eğitmene not/katman sızmadı");
      const t2 = await ctxFor(T2, 1440, 900, false);
      const p2 = await open(t2, `/human-design/egitim-haritalari/${S1.id}/calisma-alani`);
      await p2.waitForSelector("[data-ann-notes-view]");
      ok(!/ZZ olay 3/.test(await p2.locator("[data-ann-notes-view]").innerText()) && await p2.locator("[data-ann-overlay] [data-ann-el]").count() === 0, "ikinci eğitmen aynı haritada Ayşe'nin notunu/çizimini görmez");
      await p2.goto(`${APP}${det(S1.id, "hayat")}`, { waitUntil: "load" });
      await p2.waitForSelector("[data-bio-state='ok']");
      ok(await p2.locator("[data-bio-event]").count() === 14, "ikinci eğitmen AYNI merkezî biyografiyi görür");
      await t2.close();
      // Kaydedilmemiş not varken uygulama içi çıkış → uyarı penceresi.
      await p.goto(`${APP}${det(S1.id, "hayat")}`, { waitUntil: "load" });
      await p.waitForSelector("[data-bio-state='ok']");
      await p.locator("[data-bio-add-note='5']").click();
      await p.waitForURL(/calisma-alani/);
      await p.waitForSelector("[data-ann-status='dirty']");
      const back = p.locator("[data-ann-back], a[href$='/egitim-haritalari/" + S1.id + "']").first();
      if (await back.count()) {
        await back.click();
        await p.waitForTimeout(500);
        ok(await p.locator("[data-ann-leave-discard]").count() === 1, "kaydedilmemiş not varken çıkış → uyarı (sessiz kayıp yok)");
        await snap(p, "B10-kaydedilmemis-not-uyarisi");
      } else ok(false, "çalışma alanı geri bağlantısı bulunamadı");
      await p.close();
    }

    section("4 · Yetkisiz erişim");
    {
      const x = await ctxFor(X, 1440, 900, false);
      const p = await open(x, det(S1.id, "hayat"));
      await p.waitForTimeout(1500);
      ok(await p.locator("[data-bio-state]").count() === 0 && /bulunamad/i.test(await p.locator("body").innerText()), "yetkisiz uzman: sayfa bulunamadı, biyografi yok");
      const api = await p.evaluate(async ([id, u, tok]) => (await fetch(`/api/hd/education/charts/${id}/biography?lang=tr`, { headers: { "x-user-id": u, "x-session-token": tok } })).status, [S1.id, X.id, X.token]);
      ok(api === 404, "yetkisiz uzman biyografi API → 404", api);
      await x.close();
      const a = await ctxFor(ADMIN, 1440, 900, false);
      const pa = await open(a, "/admin/hd-egitim-haritalari");
      await pa.waitForTimeout(1500);
      ok(await pa.locator("[data-owner-tab-bio]").count() === 0, "normal admin owner ekranını / Hayat Hikâyeleri sekmesini göremez");
      const st = await pa.evaluate(async ([u, tok]) => (await fetch(`/api/admin/hd/education/biographies`, { headers: { "x-admin-id": u, "x-session-token": tok } })).status, [ADMIN.id, ADMIN.token]);
      ok(st === 404, "normal admin owner biyografi API → 404", st);
      await a.close();
    }

    section("5 · Owner: durum tablosu + düzenleme + yayın");
    const octx = await ctxFor(OWNER, 1440, 900, false);
    {
      const p = await open(octx, "/admin/hd-egitim-haritalari");
      await p.click("[data-owner-tab-bio]");
      await p.waitForSelector("[data-bio-owner-list] [data-bio-owner-row]");
      const row = p.locator("[data-bio-owner-row='zz-bioui-a']");
      ok(await row.count() === 1 && /Doğrulandı/.test(await row.innerText()) && /Hesaplandı/.test(await row.innerText()) && /Yayında/.test(await row.innerText()), "owner tablosu: doğum verisi / HD hesap / harita yayını / biyografi yayını ayrı");
      ok(/English: hazır değil/.test(await row.innerText()), "İngilizce eksikliği tabloda açıkça görünür");
      await snap(p, "B11-owner-hayat-hikayeleri-tablosu", true);
      await row.locator("[data-bio-owner-edit]").first().click();
      await p.waitForSelector("[data-bio-editor]");
      const rev0 = Number(await p.locator("[data-bio-editor]").getAttribute("data-bio-revision"));
      await p.fill("[data-bio-f='shortIntro']", "ZZ owner düzenlemesi: güncellenmiş kısa tanıtım.");
      ok(await p.locator("[data-bio-editor-dirty]").count() === 1, "düzenleme → kaydedilmemiş işareti");
      await snap(p, "B12-owner-duzenleyici");
      await p.click("[data-bio-editor-save]");
      await p.waitForSelector("[data-bio-editor-msg]");
      const rev1 = Number(await p.locator("[data-bio-editor]").getAttribute("data-bio-revision"));
      ok(rev1 === rev0 + 1 && /Kaydedildi/.test(await p.locator("[data-bio-editor-msg]").innerText()), "owner kaydetti → yeni sürüm", [rev0, rev1]);
      await p.fill("[data-bio-f='shortIntro']", "<script>alert(1)</script>");
      await p.click("[data-bio-editor-save]");
      await p.waitForTimeout(800);
      ok(/kullanılamaz/.test(await p.locator("[data-bio-editor-msg]").innerText()), "owner '<' içerik → sunucu reddi, açık hata", await p.locator("[data-bio-editor-msg]").innerText());
      await p.fill("[data-bio-f='shortIntro']", "ZZ owner düzenlemesi: güncellenmiş kısa tanıtım.");
      await p.click("[data-bio-editor-preview]");
      await p.waitForSelector("[data-bio-state='ok']");
      await snap(p, "B13-owner-egitmen-gorunumu-onizleme");
      await p.click("[data-bio-editor-unpublish]");
      await p.click("[data-bio-editor-confirm]");
      await p.waitForTimeout(1000);
      ok(/Kapalı/.test(await p.locator("[data-bio-editor-publish]").innerText()), "owner yayından kaldırdı");
      const tp = await open(tctx, det(S1.id, "hayat"));
      await tp.waitForSelector("[data-bio-state='none']");
      ok(true, "eğitmen: yayından kaldırılan biyografiyi görmez");
      await p.click("[data-bio-editor-publish-btn]");
      await p.click("[data-bio-editor-confirm]");
      await p.waitForTimeout(1000);
      await tp.reload({ waitUntil: "load" });
      await tp.waitForSelector("[data-bio-state='ok']");
      ok(/ZZ owner düzenlemesi/.test(await tp.locator("[data-bio-intro]").innerText()), "yeniden yayın → eğitmen owner'ın güncel metnini görür");
      ok(await tp.locator("[data-bio-editor]").count() === 0 && await tp.locator("textarea, [contenteditable='true']").count() === 0, "eğitmen ekranında düzenleme alanı YOK (salt okunur)");
      await tp.close();
      // CAS: iki owner sekmesi.
      const p2 = await open(octx, "/admin/hd-egitim-haritalari");
      await p2.click("[data-owner-tab-bio]");
      await p2.locator("[data-bio-owner-row='zz-bioui-a'] [data-bio-owner-edit]").first().click();
      await p2.waitForSelector("[data-bio-editor]");
      await p.click("[data-bio-editor-edit]");
      await p.fill("[data-bio-f='shortIntro']", "ZZ sekme 1 kaydı.");
      await p.click("[data-bio-editor-save]");
      await p.waitForTimeout(800);
      await p2.fill("[data-bio-f='shortIntro']", "ZZ sekme 2 eski sürüm.");
      await p2.click("[data-bio-editor-save]");
      await p2.waitForSelector("[data-bio-editor-msg]");
      ok(/başka bir oturumda değiştirildi/.test(await p2.locator("[data-bio-editor-msg]").innerText()), "eski sürümle owner kaydı → çakışma uyarısı (sessiz üzerine yazma yok)");
      await snap(p2, "B14-owner-cakisma");
      await p.close(); await p2.close();
    }

    section("6 · Mobil / tablet (emülasyon) + 320 px");
    for (const [w, h, mob, tag] of [[820, 1180, true, "tablet-820"], [390, 844, true, "mobil-390"], [360, 780, true, "mobil-360"], [320, 640, true, "mobil-320"], [1024, 768, false, "1024"]] as const) {
      const c = await ctxFor(T, w, h, mob);
      const p = await open(c, det(S1.id, "hayat"));
      await p.waitForSelector("[data-bio-state='ok']");
      const ox = await overflowX(p);
      const tabs = await p.locator("[data-edu-tab]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, vis: r.width > 0 }; }));
      ok(ox <= 0, `${tag}: yatay sayfa taşması yok`, ox);
      ok(tabs.every((t) => t.vis && t.h >= 44), `${tag}: sekmeler görünür, dokunma hedefi ≥ 44 px`, tabs);
      const inView = await p.locator("[data-edu-tab]").evaluateAll((els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; }));
      ok(inView, `${tag}: üç sekme de ekranın içinde (kaydırmadan erişilir)`);
      const fs = await p.locator("[data-bio-section] p").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      ok(fs >= 15, `${tag}: paragraf yazısı okunur (≥ 15 px)`, fs);
      await snap(p, `B15-${tag}-hayat-hikayesi`);
      if (w <= 390) {
        await p.locator("[data-bio-timeline]").scrollIntoViewIfNeeded();
        await snap(p, `B16-${tag}-yasam-cizelgesi`);
        await p.click("[data-edu-tab='kaynaklar']");
        await p.waitForSelector("[data-bio-sources-tab]");
        ok(await overflowX(p) <= 0, `${tag}: Kaynaklar sekmesinde taşma yok`);
        await snap(p, `B17-${tag}-kaynaklar`);
      }
      await c.close();
    }
    {
      const c = await ctxFor(OWNER, 390, 844, true);
      const p = await open(c, "/admin/hd-egitim-haritalari");
      await p.click("[data-owner-tab-bio]");
      await p.waitForSelector("[data-bio-owner-row]");
      ok(await overflowX(p) <= 0, "owner tablosu mobil 390: sayfa taşması yok (tablo kendi içinde kayar)");
      await snap(p, "B18-owner-mobil-390");
      await c.close();
    }

    if (realMode) {
      section("7 · GERÇEK veri (yalnız yerel test DB'si; yayın kararı değildir)");
      let okCount = 0; const bad: string[] = [];
      for (const r of realPublished) {
        const p = await open(tctx, det(r.id, "hayat"));
        try {
          await p.waitForSelector("[data-bio-state='ok']", { timeout: 30000 });
          const n = await p.locator("[data-bio-event]").count();
          const name = await p.locator("#bio-name").innerText();
          const ox = await overflowX(p);
          if (n === r.events && name.length > 1 && ox <= 0) okCount++; else bad.push(`${r.key}:${n}/${r.events}:${ox}`);
        } catch { bad.push(`${r.key}:yok`); }
        await p.close();
      }
      ok(okCount === realPublished.length, `${realPublished.length} gerçek kişinin hepsinde Hayat Hikâyesi açıldı; olay sayısı dosyayla aynı`, bad);
      const pick = (k: string) => realPublished.find((r) => r.key.startsWith(k));
      const gide = pick("andre-gide"), vic = pick("kralice-victoria"), fermi = pick("enrico-fermi");
      if (gide) {
        const p = await open(tctx, det(gide.id));
        await p.waitForSelector("#edu-panel-harita svg");
        await snap(p, "R01-gide-hd-haritasi-masaustu");
        await p.click("[data-edu-tab='hayat']"); await p.waitForSelector("[data-bio-state='ok']");
        await snap(p, "R02-gide-hayat-hikayesi-masaustu");
        await p.locator("[data-bio-timeline]").scrollIntoViewIfNeeded();
        await snap(p, "R03-gide-yasam-cizelgesi");
        await p.click("[data-edu-tab='kaynaklar']"); await p.waitForSelector("[data-bio-sources-tab]");
        await snap(p, "R04-gide-kaynaklar", true);
        await p.close();
      }
      if (vic) {
        const c = await ctxFor(T, 390, 844, true);
        const p = await open(c, det(vic.id, "hayat")); await p.waitForSelector("[data-bio-state='ok']");
        await snap(p, "R05-victoria-hayat-hikayesi-mobil-390");
        await c.close();
      }
      if (fermi) {
        const c = await ctxFor(T, 820, 1180, true);
        const p = await open(c, det(fermi.id, "hayat")); await p.waitForSelector("[data-bio-state='ok']");
        await snap(p, "R06-fermi-hayat-hikayesi-tablet-820");
        await c.close();
      }
      const p = await open(tctx, "/human-design/egitim-haritalari");
      await p.waitForSelector("[data-edu-card-bio]");
      await snap(p, "R07-katalog-gercek-kisiler", true);
      await p.fill("input[type='search']", "besteci");
      await p.waitForTimeout(300);
      ok(await p.locator("a[href*='/egitim-haritalari/']").count() >= 1, "gerçek katalog: meslekle arama (besteci) sonuç veriyor");
      await snap(p, "R08-katalog-arama-besteci");
      await p.close();
      const op = await open(octx, "/admin/hd-egitim-haritalari");
      await op.click("[data-owner-tab-bio]");
      await op.waitForSelector("[data-bio-owner-row]");
      const rows = await op.locator("[data-bio-owner-row]").count();
      ok(rows >= realBioFiles, `owner tablosu: ${rows} kişi (biyografi dosyası ${realBioFiles} + biyografisiz harita kayıtları)`);
      await snap(op, "R09-owner-tum-kisiler-durum", true);
      for (const [k, tag] of [["albert-einstein", "R10-owner-einstein-onizleme"], ["mustafa-kemal-ataturk", "R11-owner-ataturk-onizleme"]] as const) {
        const r = op.locator(`[data-bio-owner-row='${k}']`);
        if (await r.count()) {
          await r.locator("[data-bio-owner-edit]").first().click();
          await op.waitForSelector("[data-bio-editor]");
          await op.click("[data-bio-editor-preview]");
          await op.waitForSelector("[data-bio-state='ok']");
          await snap(op, tag, true);
          await op.locator("[data-bio-editor-back]").click();
          await op.waitForSelector("[data-bio-owner-row]");
        }
      }
      await op.close();
    }

    section("8 · Genel");
    ok(external.length === 0, `tarayıcıdan dış istek 0 (${external.length})`, external.slice(0, 5));
    ok(providerReq === 0, "sağlayıcı / hesap isteği 0");
    ok(consoleErrors.length === 0, `uygulama konsol hatası 0 (${consoleErrors.length})`, consoleErrors.slice(0, 5));
    await tctx.close(); await octx.close();
  } finally {
    writeFileSync(path.join(OUT, "_ekran-listesi.txt"), shots.join("\n"));
    writeFileSync(path.join(OUT, "_konsol-hatalari.txt"), consoleErrors.join("\n"));
    writeFileSync(path.join(OUT, "_hatali-yanitlar.txt"), [...badResponses.entries()].map(([k, n]) => `${n} :: ${k}`).join("\n"));
    if (browser) await browser.close().catch(() => undefined);
    if (app?.pid && process.platform === "win32") { try { execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" }); } catch { /* */ } } else app?.kill();
    if (env) await env.stop().catch(() => undefined);
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL · ekran görüntüsü: ${shots.length}`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error("e2e çöktü:", e); process.exit(1); });
