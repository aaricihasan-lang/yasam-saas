// Faz B/C yeniden doğrulama: liste UI render + senkron + ana stat (doğru beklemelerle)
import { chromium, devices } from "playwright";
const BASE = process.env.BASE_URL || "https://www.yasamsistemi.com";
const EMAIL = "esra@outlook.com", PASS = "123456";

async function login(ctx) {
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Giriş Yap" }).first().click();
  await p.waitForTimeout(300);
  await p.locator('input[type="email"]').fill(EMAIL);
  await p.locator('input[type="password"]').fill(PASS);
  await p.getByRole("button", { name: /Uzman Paneline Gir/i }).click();
  await p.waitForFunction(() => !!localStorage.getItem("yasam_session_token"), { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.close();
  return await ctx.storageState();
}

const browser = await chromium.launch({ headless: true });
try {
  const lc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const storageState = await login(lc);
  await lc.close();

  const expected = ["Ali Veli", "Çiğdem Şahinoğlu", "Abdülmecidşerafettin", "Burak Randevulu", "Mobil Senkron", "Web Senkron"];

  // --- WEB (desktop) liste render ---
  const dc = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const dp = await dc.newPage();
  await dp.goto(BASE + "/danisan-yolculugu/liste", { waitUntil: "domcontentloaded", timeout: 30000 });
  // liste yüklenene kadar bekle: "Yükleniyor..." kaybolup kartlar gelene dek
  await dp.waitForFunction(() => {
    const t = document.body.innerText;
    return /Kayıtlı Danışanlar\s*\(\d+\)/.test(t) && !/^\s*Yükleniyor/m.test(t);
  }, { timeout: 20000 }).catch(() => {});
  await dp.waitForTimeout(1500);
  const webText = await dp.locator("body").innerText();
  const countM = webText.match(/Kayıtlı Danışanlar\s*\((\d+)\)/);
  console.log("WEB liste sayısı:", countM ? countM[1] : "?");
  for (const name of expected) console.log(`  ${webText.includes(name) ? "✅" : "❌"} ${name}`);

  // --- Arama testi (Türkçe) ---
  await dp.getByPlaceholder("Ad, soyad veya telefon...").fill("Çiğdem");
  await dp.waitForTimeout(800);
  const searchText = await dp.locator("body").innerText();
  console.log("Arama 'Çiğdem' →", searchText.includes("Çiğdem Şahinoğlu") ? "✅ bulundu" : "❌");
  await dp.getByPlaceholder("Ad, soyad veya telefon...").fill("");

  // --- Ana sayfa stat (randevu/tarih) ---
  await dp.goto(BASE + "/danisan-yolculugu", { waitUntil: "domcontentloaded", timeout: 30000 });
  await dp.waitForFunction(() => !/—/.test((document.body.innerText.match(/Toplam Danışan/)? "x":"x")) , {timeout:1}).catch(()=>{});
  await dp.waitForTimeout(4000);
  const anaText = await dp.locator("body").innerText();
  const grab = (label) => {
    const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const idx = anaText.search(re);
    if (idx < 0) return "?";
    // değer etiketin ÜSTÜNDE (kart: değer sonra label). Etiketten önceki son sayı/tarihi al
    const before = anaText.slice(Math.max(0, idx - 40), idx).trim().split(/\s+/).pop();
    return before;
  };
  console.log("\nANA STAT:");
  ["Toplam Danışan", "Son Kayıt", "Bu Ay Yeni", "Bu Ay Randevu", "En Yakın Randevu", "Bu Yıl Toplam"].forEach(l =>
    console.log(`  ${l}: ${grab(l)}`));

  // --- Ajanda randevu görünür mü + tarih ---
  await dp.goto(BASE + "/dashboard/ajanda", { waitUntil: "domcontentloaded", timeout: 30000 });
  await dp.waitForTimeout(3500);
  const ajText = await dp.locator("body").innerText();
  console.log("\nAJANDA:");
  console.log("  Test Seansı görünür:", ajText.includes("Test Seansı") ? "✅" : "❌");
  console.log("  03.07 / 3 Tem tarih görünür:", /03\.07|3 Tem|Temmuz/i.test(ajText) ? "✅" : "(kontrol)");
  await dp.close(); await dc.close();

  // --- MOBİL liste render (senkron doğrulama) ---
  const mc = await browser.newContext({ ...devices["iPhone 13"], storageState });
  const mp = await mc.newPage();
  await mp.goto(BASE + "/danisan-yolculugu/liste", { waitUntil: "domcontentloaded", timeout: 30000 });
  await mp.waitForFunction(() => {
    const t = document.body.innerText;
    return /Kayıtlı Danışanlar\s*\(\d+\)/.test(t) && !/^\s*Yükleniyor/m.test(t);
  }, { timeout: 20000 }).catch(() => {});
  await mp.waitForTimeout(1500);
  const mobText = await mp.locator("body").innerText();
  const mCount = mobText.match(/Kayıtlı Danışanlar\s*\((\d+)\)/);
  console.log("\nMOBİL liste sayısı:", mCount ? mCount[1] : "?");
  for (const name of expected) console.log(`  ${mobText.includes(name) ? "✅" : "❌"} ${name}`);
  await mp.close(); await mc.close();
} catch (e) {
  console.log("ERR:", e.message);
} finally {
  await browser.close();
}
