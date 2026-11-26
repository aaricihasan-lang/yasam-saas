/**
 * ÜYE PASİFLEŞTİRME F4-R1 — yönetici listeleri tarayıcı kontrolü (Playwright; yalnız localhost; sentetik yığın).
 * Önkoşul: scripts/uye-arsiv-4a/ui-stack.ts + yerel `next dev` (UD2_BASE). Production'a temas YOK.
 * Yığına 20280126000000 / 000100 / 000200 migration'larını uygular (yeniden çalıştırılabilir).
 *
 *   V2 üye listesi · Pasif süzgeci · klasik liste rozeti · Kullanım Takibi › Genel Bakış (4 ayrık durum, DB ile birebir)
 *   · Uzmanlar süzgeci (Aktif / Pasif / Giriş kapalı / Arşivde) · 360 px taşma yok · "Aktif Yap" sonrası ilk hâl
 */
import { chromium } from "playwright";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimShotsDir, resolveUiConfig } from "../uye-yonetimi-faz2/uiKosu.mjs";

const BASE = process.env.UD2_BASE ?? "http://localhost:3974";
const SHOTS = claimShotsDir(process.env.UD2_SHOTS ?? path.join(os.tmpdir(), "uye-pasif-liste-ui-shots"));
const cfg = (await resolveUiConfig({ envVar: "UD2_CFG", prefixes: ["uye-detay-v2-ui-", "uye-arsiv-4a-ui-"] })).cfg;
mkdirSync(SHOTS, { recursive: true });
const db = new pg.Client({ host: "127.0.0.1", port: cfg.pg.port, user: "postgres", password: "testpw", database: "postgres" });
await db.connect();
for (const m of ["20280126000000_member_access_restriction.sql", "20280126000100_member_list_access_restricted.sql", "20280126000200_usage360_member_access_states.sql"]) {
  await db.query(readFileSync(path.join(process.cwd(), "supabase/migrations", m), "utf8"));
}
let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, d) => {
  if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; failures.push(l); console.error(`  ✗ ${l}${d === undefined ? "" : ` — ${JSON.stringify(d).slice(0, 300)}`}`); }
};
const E = cfg.expert.user, O = cfg.owner.user;
const restrict = (on) => db.query(`select public.admin_set_member_access_restriction($1,$2,$3,$4)`, [E.id, O.id, on, !on]);
const dbStates = async () => (await db.query(`select
    count(*) filter (where active is true and access_restricted_at is null)::int a,
    count(*) filter (where active is true and access_restricted_at is not null)::int p,
    count(*) filter (where active is false and archived_at is null)::int l,
    count(*) filter (where archived_at is not null)::int r
  from public.users where role='expert' and is_demo_account=false`)).rows[0];

const b = await chromium.launch();
async function ctxFor(viewport) {
  const ctx = await b.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "yasam_admin_session", value: cfg.owner.token, url: BASE }]);
  await ctx.route((u) => !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u.toString()), (r) => r.abort());
  await ctx.addInitScript(([u, t]) => { localStorage.setItem("yasam_user", u); localStorage.setItem("yasam_session_token", t); }, [JSON.stringify(O), cfg.owner.token]);
  return ctx;
}
const rowText = async (p, name) => {
  // Masaüstü tablo satırı / 360 px kart: adı VE durum etiketini birlikte içeren EN İÇ görünür öğe.
  const r = p.locator("tr, li, [role=row], article, a, div").filter({ hasText: name }).filter({ hasText: /Pasif|Aktif|Pro|Deneme|Arşiv/ }).filter({ visible: true }).last();
  await r.waitFor({ timeout: 120_000 });
  return (await r.innerText()).replace(/\s+/g, " ");
};
const tile = async (p, label) => {
  const t = p.locator("div").filter({ has: p.getByText(label, { exact: true }) }).filter({ hasText: /\d/ }).last();
  return Number(((await t.innerText()).match(/\n\s*(\d+)/) ?? [])[1]);
};
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

await restrict(true);
for (const [vp, tag] of [[{ width: 1280, height: 900 }, "masaüstü"], [{ width: 360, height: 780 }, "360 px"]]) {
  console.log(`\n[${tag}]`);
  const ctx = await ctxFor(vp);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/users?f=all`, { waitUntil: "domcontentloaded" });
  const v2 = await rowText(p, E.full_name);
  ok(/Pasif · modüller kilitli/.test(v2), `${tag}: V2 listede 'Pasif · modüller kilitli' (Aktif değil)`, v2);
  ok((await overflow(p)) <= 1, `${tag}: V2 liste yatay taşma yok`);
  await p.screenshot({ path: path.join(SHOTS, `v2-${vp.width}.png`) });
  await p.goto(`${BASE}/admin/users?f=pasif`, { waitUntil: "domcontentloaded" });
  ok((await rowText(p, E.full_name).catch(() => "")).length > 0, `${tag}: V2 'Pasif' süzgecinde`);
  await p.goto(`${BASE}/admin/users/klasik`, { waitUntil: "domcontentloaded" });
  ok(/Pasif/.test(await rowText(p, E.full_name)), `${tag}: klasik liste rozeti 'Pasif'`);
  await p.goto(`${BASE}/admin/kullanim-takibi`, { waitUntil: "domcontentloaded" });
  await p.getByText("Giriş Kapalı", { exact: true }).waitFor({ timeout: 120_000 });
  const st = await dbStates();
  const ui = { a: await tile(p, "Aktif Hesap"), p: await tile(p, "Pasif"), l: await tile(p, "Giriş Kapalı"), r: await tile(p, "Arşivde") };
  ok(JSON.stringify(ui) === JSON.stringify(st), `${tag}: Genel Bakış Aktif / Pasif / Giriş kapalı / Arşivde = DB`, { ui, st });
  ok((await overflow(p)) <= 1, `${tag}: Kullanım Takibi yatay taşma yok`);
  await p.screenshot({ path: path.join(SHOTS, `genel-bakis-${vp.width}.png`), fullPage: true });
  if (tag === "masaüstü") {
    await p.getByRole("tab", { name: "Uzmanlar" }).or(p.getByRole("button", { name: "Uzmanlar" })).first().click();
    const sel = p.getByLabel("Durum filtresi");
    await sel.waitFor({ timeout: 60_000 });
    const names = async () => {
      await p.waitForTimeout(1500);
      return (await p.locator("table tbody tr, ul li").allInnerTexts()).join("\n");
    };
    await sel.selectOption("passive");
    ok((await names()).includes(E.full_name), "süzgeç 'Pasif · modüller kilitli': pasif uzman listede");
    await sel.selectOption("active");
    ok(!(await names()).includes(E.full_name), "süzgeç 'Aktif': pasif uzman YOK");
    await sel.selectOption("login_closed");
    const lc = await names();
    ok(!lc.includes(E.full_name), "süzgeç 'Giriş kapalı': pasif uzman YOK");
    await sel.selectOption("archive");
    ok(!(await names()).includes(E.full_name), "süzgeç 'Arşivde': pasif uzman YOK");
    await p.screenshot({ path: path.join(SHOTS, "uzmanlar-arsiv.png") });
  }
  await ctx.close();
}
const st0 = await dbStates();
await restrict(false);
{
  const ctx = await ctxFor({ width: 1280, height: 900 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/kullanim-takibi`, { waitUntil: "domcontentloaded" });
  await p.getByText("Giriş Kapalı", { exact: true }).waitFor({ timeout: 120_000 });
  const a = await tile(p, "Aktif Hesap"), ps = await tile(p, "Pasif");
  ok(a === st0.a + 1 && ps === st0.p - 1, "Aktif Yap sonrası: Aktif +1, Pasif −1", { a, ps, st0 });
  await p.goto(`${BASE}/admin/users?f=all`, { waitUntil: "domcontentloaded" });
  ok(!/Pasif/.test(await rowText(p, E.full_name)), "Aktif Yap sonrası V2 listede 'Pasif' yok");
  await ctx.close();
}
await b.close();
await db.end();
console.log(`\nÜYE PASİFLEŞTİRME LİSTE UI: ${pass} PASS / ${fail} FAIL · görüntüler: ${SHOTS}`);
if (fail) { console.log("Başarısız:", failures); process.exit(1); }
