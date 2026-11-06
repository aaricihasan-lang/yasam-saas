/**
 * Tarayıcı tema uyumu harness'ı (satış öncesi P0, 2026-11-06).
 * Kök neden: (1) Chromium tabanlı tarayıcıların zorla koyu modu (Edge/Chrome "Auto Dark Mode for Web Contents",
 * Samsung Internet koyu modu vb.) `color-scheme: light` bildirimini yeterli saymayıp sayfayı yeniden boyuyordu;
 * (2) globals.css'teki şablon artığı `prefers-color-scheme: dark` bloğu cihaz koyuyken gövdeyi siyah + yazıyı açık
 * griye çeviriyordu (yasal sayfa başlıkları, çerez bandı düğmeleri görünmez oluyordu).
 * Statik sözleşme (prod'a temas YOK). Tarayıcı davranışı ayrıca Playwright motor matrisiyle doğrulanır (rapor).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveViewMode } from "../../lib/workspace/viewMode";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}`);
};

const css = read("app/globals.css");
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rootBlock = noComments.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

console.log("── A) Genel CSS (app/globals.css) ──");
ok(/color-scheme:\s*only light\s*;/.test(rootBlock), ":root `color-scheme: only light` (zorla koyu moddan çıkış)");
ok(/color-scheme:\s*light\s*;[\s\S]*color-scheme:\s*only light\s*;/.test(rootBlock), "`light` geri dönüşü `only light`'tan ÖNCE (bilmeyen tarayıcı light'ta kalır)");
ok(!/prefers-color-scheme\s*:\s*dark/.test(noComments), "cihaz koyu tercihi gövde rengini/zeminini çevirmiyor (şablon artığı blok yok)");
ok(/--background:\s*#ffffff/.test(rootBlock) && /--foreground:\s*#171717/.test(rootBlock), "gövde zemin/yazı değişkenleri açık temada sabit");
ok(/body\s*\{[^}]*background:\s*var\(--background\)[^}]*color:\s*var\(--foreground\)/.test(noComments), "body zemin + yazı rengi değişkenlerden");
ok(/button,\s*\[role="button"\]\s*\{\s*forced-color-adjust:\s*none;/.test(noComments), "Windows yüksek karşıtlık (forced-colors) kuralı korunuyor");
ok(!/!important[^;]*color-scheme|color-scheme[^;]*!important/.test(noComments), "color-scheme için !important kullanılmıyor");

console.log("── B) Kök layout (app/layout.tsx) ──");
const layout = read("app/layout.tsx");
const viewport = layout.match(/export const viewport: Viewport = \{([\s\S]*?)\};/)?.[1] ?? "";
ok(/colorScheme:\s*"only light"/.test(viewport), "<meta name=\"color-scheme\" content=\"only light\"> ilk HTML'de (CSS'ten önce, titreme yok)");
ok(/viewportFit:\s*"cover"/.test(viewport), "viewportFit: cover korunuyor");
const metadata = layout.match(/export const metadata: Metadata = \{([\s\S]*?)\n\};/)?.[1] ?? "";
ok(/other:\s*\{\s*"darkreader-lock":\s*"true"\s*\}/.test(metadata), "<meta name=\"darkreader-lock\"> (Dark Reader eklentisi metni okunmaz yapmasın)");

console.log("── C) Kişisel Dijital Ofis Gece/Otomatik davranışı korunuyor ──");
ok(resolveViewMode("auto", true) === "night" && resolveViewMode("auto", false) === "day", "Otomatik → cihaz tercihine uyar (koyu → Gece, açık → Gündüz)");
ok(resolveViewMode("day", true) === "day" && resolveViewMode("night", false) === "night", "manuel Gündüz/Gece tercihi cihazdan bağımsız");
ok(read("lib/workspace/viewMode.ts").includes('"(prefers-color-scheme: dark)"'), "Otomatik mod sistem tercihini matchMedia ile izliyor");
const personal = read("app/_premium/home/personal/personal.module.css");
ok((personal.match(/data-pw-mode="night"/g) ?? []).length >= 40, "Gece modu stilleri (personal.module.css) yerinde");

console.log(`\ncolor-scheme harness: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
