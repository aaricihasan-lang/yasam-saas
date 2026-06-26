import { chromium } from "playwright";
const EMAIL = "esra@outlook.com", PASS = "123456";
const browser = await chromium.launch({ headless: true });

// (a) apex redirect davranışı
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const redirects = [];
  p.on("response", (r) => { if ([301,302,307,308].includes(r.status())) redirects.push(`${r.status()} ${r.url()} -> ${r.headers()["location"]||""}`); });
  await p.goto("https://yasamsistemi.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(1500);
  console.log("APEX final url:", p.url());
  console.log("APEX redirects:", redirects.length ? redirects : "(yok — apex'te kalıyor)");
  await ctx.close();
}

// (b) login sırasında 4xx uç noktalar (BASE_URL — yerel veya canlı)
{
  const LBASE = process.env.BASE_URL || "https://www.yasamsistemi.com";
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  const fails = [];
  p.on("response", async (r) => { if (r.status() >= 400) fails.push(`${r.status()} ${r.request().method()} ${r.url().replace(LBASE,'')}`); });
  await p.goto(LBASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Giriş Yap" }).first().click();
  await p.waitForTimeout(300);
  await p.locator('input[type="email"]').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PASS);
  await p.getByRole("button", { name: /Uzman Paneline Gir/i }).click();
  await p.waitForFunction(() => !!localStorage.getItem("yasam_session_token"), { timeout: 30000 }).catch(()=>{});
  await p.waitForTimeout(4000);
  console.log("\nLOGIN sırası 4xx:", fails.length ? fails : "(yok)");
  await ctx.close();
}
await browser.close();
