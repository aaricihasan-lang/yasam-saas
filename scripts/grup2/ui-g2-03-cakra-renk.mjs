// G2-03 — Danışan Yolculuğu › Analizler: Çakra ve Çakra-Gezegen ölçüm hücreleri. "+" → hafif şeffaf yeşil
// zemin; sayısal eksi (-, −, –) → hafif şeffaf kırmızı zemin; diğerleri nötr. Yazı rengi ve kenarlık nötr hücreyle
// aynı kalır; kayıtlı (salt okunur) görünümde de renk; kaydedilen değerler aynen. Ağ-mock, prod'a SIFIR temas.
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup2/ui-g2-03-cakra-renk.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3973";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLIENT = "c0000000-0000-4000-8000-000000000001";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { clients: true },
};
// [değer, beklenen: "yesil" | "kirmizi" | "notr"]
const SAMPLES = [
  ["+3", "yesil"], ["+", "yesil"], ["-2", "kirmizi"], ["−2", "kirmizi"], ["–1", "kirmizi"], ["-%20", "kirmizi"], ["- 5", "kirmizi"],
  ["2020-2021", "notr"], ["- not", "notr"], ["-", "notr"], ["3", "notr"], ["", "notr"],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
function tone(bg) {
  const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return "?";
  const [r, g, b, a = 1] = m.slice(1).map(Number);
  if (a > 0 && a < 0.5 && g > r && g > b) return "yesil";
  if (a > 0 && a < 0.5 && r > g && r > b) return "kirmizi";
  if (r === 255 && g === 255 && b === 255) return "notr";
  if (r >= 245 && g >= 245 && b >= 250) return "notr"; // salt okunur nötr (#f8f7fe)
  return `?${bg}`;
}
const browser = await chromium.launch();

async function run(vp) {
  const g = `g2-03-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  const posts = [];
  let saved = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    if (p === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (p === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (p === `/api/clients/${CLIENT}`) return route.fulfill({ status: 200, json: { ok: true, client: { id: CLIENT, tenant_id: TENANT, first_name: "ZZ", last_name: "Renk", full_name: "ZZ Renk", row_version: 1 } } });
    if (p === `/api/clients/${CLIENT}/analyses` && req.method() === "GET") return route.fulfill({ status: 200, json: { ok: true, analyses: saved } });
    if (p === `/api/clients/${CLIENT}/analyses` && req.method() === "POST") {
      const body = req.postDataJSON();
      posts.push(body);
      saved = [{ id: `a0000000-0000-4000-8000-00000000000${posts.length}`, row_version: 1, tenant_id: TENANT, client_id: CLIENT, analysis_type: body.analysis_type, analysis_data: body.analysis_data, note: body.note ?? "", created_at: "2026-10-31T10:00:00.000Z" }, ...saved];
      return route.fulfill({ status: 200, json: { ok: true, id: saved[0].id } });
    }
    if (p.endsWith("/analyses/upload-image")) return route.fulfill({ status: 200, json: { ok: true } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, items: [], data: [] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const fields = () => page.getByTestId("analysis-fields").locator("input");
  const styles = (n) => fields().evaluateAll((els, n) => els.slice(0, n).map((el) => {
    const cs = getComputedStyle(el); return { v: el.value, bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, shadow: cs.boxShadow };
  }), n);
  try {
    await page.goto(`${BASE}/dashboard/clients/${CLIENT}?tab=analizler`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Analizi Aç" }).first().waitFor({ timeout: 90000 });
    await sleep(600);
    for (const [idx, label] of [[0, "Çakra"], [1, "Çakra-Gezegen"]]) {
      await page.getByRole("button", { name: "Analizi Aç" }).nth(idx).click();
      await fields().first().waitFor({ timeout: 10000 });
      const total = await fields().count();
      ok(g, `${label}: ölçüm hücresi sayısı aynı (${idx === 0 ? 72 : 70})`, total === (idx === 0 ? 72 : 70), String(total));
      // Seans ÖNCESİ (ilk hücreler) ve SONRASI (son hücreler) ayrı ayrı
      const lastStart = total - SAMPLES.length;
      for (let i = 0; i < SAMPLES.length; i++) { await fields().nth(i).fill(SAMPLES[i][0]); await fields().nth(lastStart + i).fill(SAMPLES[i][0]); }
      await page.mouse.click(5, 5).catch(() => {}); await sleep(300);
      const all = await fields().evaluateAll((els) => els.map((el) => { const cs = getComputedStyle(el); return { v: el.value, bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, shadow: cs.boxShadow }; }));
      const before = all.slice(0, SAMPLES.length), after = all.slice(lastStart);
      const neutral = before[SAMPLES.findIndex((s) => s[0] === "3")];
      for (const [part, list] of [["öncesi", before], ["sonrası", after]]) {
        const wrong = list.map((s, i) => [s.v, tone(s.bg), SAMPLES[i][1]]).filter(([, got, want]) => got !== want);
        ok(g, `${label} seans ${part}: zemin renkleri kurala uygun (${SAMPLES.length} değer)`, wrong.length === 0, JSON.stringify(wrong));
        ok(g, `${label} seans ${part}: yazı rengi ve kenarlık nötr hücreyle aynı`, list.every((s) => s.color === neutral.color && s.border === neutral.border), JSON.stringify(list.map((s) => [s.v, s.color, s.border])));
      }
      ok(g, `${label}: değerler aynen (yazılan = alandaki)`, before.every((s, i) => s.v === SAMPLES[i][0]));
      if (idx === 0) {
        // Kaydet → gönderilen değerler değişmeden; sonra kayıtlı (salt okunur) görünümde renk
        await page.getByTestId("analysis-save-close").click();
        await page.getByTestId("analysis-save-close").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
        const vals = posts.at(-1)?.analysis_data?.values ?? {};
        const flat = Object.values(vals).flatMap((v) => (typeof v === "object" ? [v.mark, v.male, v.female] : [v]));
        ok(g, "kayıt: gönderilen değerler yazılanlarla aynı (renk veriye karışmaz)", SAMPLES.every(([s]) => s === "" || flat.includes(s)), JSON.stringify(flat.filter(Boolean)));
        await sleep(500);
        await page.getByRole("button", { name: /^Aç$|Görüntüle|Analizi Görüntüle/ }).first().click().catch(() => {});
        await fields().first().waitFor({ timeout: 10000 }).catch(() => {});
        const ro = await page.getByTestId("analysis-fields").evaluate((f) => f.disabled).catch(() => null);
        if (ro) {
          const roStyles = await styles(SAMPLES.length);
          const wrong = roStyles.map((s, i) => [s.v, tone(s.bg), SAMPLES[i][1]]).filter(([, got, want]) => got !== want);
          ok(g, "kayıtlı analiz (salt okunur) görünümünde de renk kuralı", wrong.length === 0, JSON.stringify(wrong));
        } else {
          ok(g, "kayıtlı analiz salt okunur açıldı", false, `disabled=${ro}`);
        }
        await page.getByRole("button", { name: "Kapat" }).first().click().catch(() => {});
        await sleep(500);
      } else {
        await page.getByRole("button", { name: "Kapat" }).first().click().catch(() => {});
        await sleep(500);
      }
    }
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) await run(vp);
await browser.close();
console.log(`\nG2-03 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
