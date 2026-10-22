/**
 * Beslenme — MOBİL TAM GENİŞLİK görsel E2E (Playwright chromium; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul (B1 E2E ile aynı yığın): uygulama NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 ile build.
 * Çalıştır: npx tsx scripts/beslenme-mobil/ui-e2e.ts --label <once|sonra> [--out <klasör>] [--expect-flush]
 *
 * Ekranlar: Beslenme Merkezi (/beslenme), Planlar listesi, Plan detayı (öğün + besin satırları).
 * Her genişlikte: ana kartların ekran kenarına uzaklığı (sol/sağ dış boşluk), scrollWidth ≤ viewport,
 * tüm düğmeler yatayda görünür, kart içi metin kenara yapışmıyor, Besin Ekle + Düzenle diyalogları açılır.
 * `--expect-flush`: telefon genişliklerinde dış boşluk 0 px OLMALI (düzeltme sonrası kabul kriteri).
 * Ölçümler `<out>/<label>-metrics.json`'a yazılır (önce/sonra + tablet/masaüstü regresyon karşılaştırması).
 */
import Module from "node:module";
import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium, type Browser, type Page } from "playwright";

pg.types.setTypeParser(1184, (v: string) => v);
pg.types.setTypeParser(1114, (v: string) => v);
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const argv = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const LABEL = argv("--label") ?? "run";
const OUT = argv("--out") ?? path.join(os.tmpdir(), "beslenme-mobil-ui");
const EXPECT_FLUSH = process.argv.includes("--expect-flush");
mkdirSync(OUT, { recursive: true });
const APP = "http://127.0.0.1:3988";
const PHONES = [320, 360, 375, 390, 412, 430];
const LARGE = [768, 1024, 1366];

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

function proxy(restUrl: string, storageUrl: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const base = (req.url ?? "").startsWith("/storage/") ? storageUrl : restUrl;
    const target = new URL(req.url ?? "/", base);
    const up = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  return new Promise((r) => server.listen(54331, "127.0.0.1", () => r(server)));
}

type Metrics = {
  vw: number; sw: number; left: number; right: number; cards: number;
  textMin: number; btnOut: number; btns: number;
};

/** Ana kartlar: main içinde yuvarlatılmış/çerçeveli ve geniş (≥ %70 vw) görünür kutular. */
async function measure(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const main = document.querySelector("main");
    const all = main ? Array.from(main.querySelectorAll<HTMLElement>("*")) : [];
    const cards = all.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.7 || r.height < 40) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      // Dekor (blob vb.) hariç: aria-hidden / tıklanamaz katmanlar kart değildir.
      if (el.closest("[aria-hidden=true]") || cs.pointerEvents === "none") return false;
      const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
      const radius = parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderTopRightRadius) > 0;
      const surface = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
      return (bordered || radius) && surface && !el.closest("[role=dialog]");
    });
    const rects = cards.map((el) => el.getBoundingClientRect());
    const left = rects.length ? Math.min(...rects.map((r) => r.left)) : -1;
    const right = rects.length ? vw - Math.max(...rects.map((r) => r.right)) : -1;
    // Kart içi metin kenara yapışmasın: başlık/metin düğümlerinin en soldaki x'i.
    const texts = main ? Array.from(main.querySelectorAll<HTMLElement>("h1, h2, h3, p")).filter((e) => e.getBoundingClientRect().width > 0) : [];
    const textMin = texts.length ? Math.min(...texts.map((e) => e.getBoundingClientRect().left)) : -1;
    const btnEls = main ? Array.from(main.querySelectorAll<HTMLElement>("button, a")).filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden";
    }) : [];
    const btnOut = btnEls.filter((b) => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > vw + 1; }).length;
    return { vw, sw: document.documentElement.scrollWidth, left: Math.round(left * 10) / 10, right: Math.round(right * 10) / 10, cards: rects.length, textMin: Math.round(textMin), btnOut, btns: btnEls.length };
  });
}

async function main() {
  const { startBesDb } = await import("../dogal-destek-p2/beslenme/env");
  const { startEmbedShim } = await import("../dogal-destek-p2/beslenme/pgrestEmbedShim");
  const { SERVICE_KEY } = await import("../anamnez/testEnv");
  const db = await startBesDb({ port: 54651, dirName: "beslenme-mobil-ui-pgdata", includeNewMigration: true });
  const shim = await startEmbedShim(db.pool);
  const px = await proxy(shim.url, db.env.url);
  const S = db.seed;
  const q1 = async (sql: string, args: unknown[] = []) => (await db.env.su.query(sql, args)).rows[0];
  const SYS = "00000000-0000-4000-8000-000000000001";
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const metrics: Record<string, Metrics> = {};
  const pageErrors: string[] = [];
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", "3988", "-H", "127.0.0.1"], {
      cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 180_000);
    const api = async (method: string, p: string, body?: unknown) => {
      const r = await fetch(`${APP}${p}`, {
        method, headers: { "content-type": "application/json", "x-user-id": S.users.A.id, "x-session-token": S.users.A.token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    };
    // Fixture: sistem besinleri (uzun ad dahil) + danışana bağlı plan + 2 öğün + besinler.
    const nid = async (c: string) => (await q1(`select id from nutrition_nutrients where code=$1`, [c])).id as string;
    const uid = async (c: string) => (await q1(`select id from nutrition_units where code=$1`, [c])).id as string;
    const food = async (name: string, kcal: number) => {
      const id = (await q1(`insert into nutrition_foods (tenant_id, name_tr, aliases) values ($1,$2,'{}') returning id`, [SYS, name])).id as string;
      await db.env.su.query(`insert into nutrition_food_nutrients (tenant_id, food_id, nutrient_id, amount, unit_id, basis_grams) values ($1,$2,$3,$4,$5,100)`,
        [SYS, id, await nid("energy"), kcal, await uid("kcal")]);
      return id;
    };
    const F1 = await food("Haşlanmış Yumurta", 155);
    const F2 = await food("Ev Yapımı Zeytinyağlı Enginar Kalbi, Taze Bezelye ve Havuçlu Garnitür (Dereotu ile)", 74);
    const created = await api("POST", `/api/beslenme/clients/${S.clients.a1}/plans`, { title: "ZZ Mobil Plan — Çiğdem Şükrü İçli Uzun Başlık", start_date: "2026-10-22", end_date: "2026-10-28" });
    const planId = (created.json.plan as { id: string }).id;
    const day0 = (await q1(`select id from nutrition_plan_days where plan_id=$1 order by plan_date limit 1`, [planId])).id as string;
    for (const [label, type, foods] of [["Kahvaltı", "breakfast", [F1, F2]], ["Öğle", "lunch", [F2]]] as const) {
      const m = await api("POST", `/api/beslenme/plans/${planId}/days/${day0}/meals`, { plan_day_id: day0, meal_type: type, label });
      const mealId = (m.json.meal as { id: string }).id;
      for (const f of foods) await api("POST", `/api/beslenme/plans/${planId}/meals/${mealId}/items`, { food_id: f, grams: 120 });
    }
    ok(!!planId, "fixture: plan + öğünler + besinler (gerçek API)");

    browser = await chromium.launch();
    const ctxFor = async (w: number) => {
      const mobile = w < 768;
      const ctx = await browser!.newContext({ viewport: { width: w, height: mobile ? 820 : 900 }, isMobile: mobile, hasTouch: mobile, locale: "tr-TR" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const user = {
        id: S.users.A.id, tenant_id: S.TA, full_name: "ZZ_DDP2_A", email: "zz.ddp2.a@example.test", role: "expert", active: true,
        approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true, beslenme: true }, is_demo_account: false,
      };
      await ctx.addInitScript(([u, tok]) => {
        localStorage.setItem("yasam_user", u as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(user), S.users.A.token]);
      return ctx;
    };

    const screens: Array<[string, string, string]> = [
      ["merkez", "/beslenme", "Beslenme"],
      ["planlar", "/beslenme/planlar", "Yeni Plan"],
      ["plan", `/beslenme/planlar/${planId}`, "Düzenle"],
    ];
    for (const w of [...PHONES, ...LARGE]) {
      console.log(`\n[${w}px]`);
      const ctx = await ctxFor(w);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(e.message));
      for (const [key, url, waitText] of screens) {
        await page.goto(`${APP}${url}`);
        await page.getByRole(key === "merkez" ? "heading" : "button", { name: waitText, exact: key === "merkez" }).first().waitFor({ timeout: 90_000 });
        if (key === "plan") await page.getByText("Haşlanmış Yumurta").first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(500);
        const m = await measure(page);
        metrics[`${key}@${w}`] = m;
        await page.screenshot({ path: path.join(OUT, `${LABEL}-${key}-${w}.png`), fullPage: true });
        ok(m.sw <= m.vw + 1, `${key} ${w}px: yatay taşma yok (scrollWidth ${m.sw} ≤ ${m.vw})`);
        ok(m.btnOut === 0, `${key} ${w}px: ${m.btns} düğme/bağlantının hiçbiri yatayda taşmıyor`, m);
        if (PHONES.includes(w)) {
          if (EXPECT_FLUSH) {
            ok(m.cards > 0 && Math.abs(m.left) <= 0.5 && Math.abs(m.right) <= 0.5, `${key} ${w}px: ana kartlar ekran kenarına dayalı (sol ${m.left} / sağ ${m.right} px)`, m);
            ok(m.textMin >= 10, `${key} ${w}px: kart içi metin kenara yapışmıyor (min x ${m.textMin}px)`, m);
          } else {
            console.log(`    ölçüm: sol ${m.left}px · sağ ${m.right}px · kart ${m.cards} · metin min x ${m.textMin}px`);
          }
        }
        if (key === "plan") {
          await page.getByRole("button", { name: /Besin Ekle/ }).first().click();
          await page.getByRole("dialog").waitFor({ timeout: 10_000 });
          const dlg = await page.getByRole("dialog").boundingBox();
          ok(!!dlg && dlg.x >= -1 && dlg.x + dlg.width <= w + 1, `plan ${w}px: Besin Ekle diyaloğu açılır, ekrana sığar`, dlg);
          await page.keyboard.press("Escape");
          await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
          await page.getByRole("button", { name: "Düzenle" }).first().click();
          await page.getByRole("dialog").waitFor({ timeout: 10_000 });
          const d2 = await page.getByRole("dialog").boundingBox();
          ok(!!d2 && d2.x >= -1 && d2.x + d2.width <= w + 1, `plan ${w}px: Düzenle diyaloğu açılır, ekrana sığar`, d2);
          if (w === 390) await page.screenshot({ path: path.join(OUT, `${LABEL}-plan-duzenle-390.png`) });
          await page.keyboard.press("Escape");
          const after = await measure(page);
          ok(after.sw <= after.vw + 1, `plan ${w}px: diyalog sonrası yatay kayma yok`);
        }
      }
      await ctx.close();
    }
    writeFileSync(path.join(OUT, `${LABEL}-metrics.json`), JSON.stringify(metrics, null, 2));
    ok(pageErrors.length === 0, "sayfa JS hatası yok", pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { try { process.kill(app.pid); } catch { /* kapalı */ } }
    await new Promise<void>((r) => px.close(() => r()));
    await shim.close().catch(() => undefined);
    await db.stop();
  }
}

main()
  .catch((e) => { fail++; fails.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nBeslenme mobil E2E (${LABEL}): ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
