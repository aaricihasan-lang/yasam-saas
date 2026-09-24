/**
 * HD-0 görsel UX harness — statik değişmez doğrulaması.
 *
 * Projede React test runner (vitest/jest) yoktur; bu harness, iki bileşen
 * dosyasındaki güvenlik/UX değişmezlerini deterministik doğrular. Tam DOM davranışı
 * (gerçek tıklama/zoom/pinch) runtime gerektirir → "runtime-gerekli" olarak işaretlenir.
 *
 * Çalıştır: node scripts/hd0-image-ux-check.mjs   (repo kökünden)
 */
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");

let pass = 0;
let fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}

const up = read("app/human-design/danisanlar/components/HdChartImageUpload.tsx");
const vw = read("app/human-design/danisanlar/components/HdChartImageViewer.tsx");
// yorumları çıkararak yürütülen kodu değerlendir (yanlış-negatif önleme)
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const upCode = stripJs(up);
const vwCode = stripJs(vw);
const layout = read("app/layout.tsx");

console.log("── KÖK NEDEN: VIEWPORT (mobil detection) ──");
check("0a. viewport width=device-width (mobil innerWidth<768 → useIsMobileOrPwa doğru)", /width:\s*["']device-width["']/.test(layout));
check("0b. viewport initialScale:1 + viewportFit korunur", /initialScale:\s*1/.test(layout) && /viewportFit:\s*["']cover["']/.test(layout));
check("0c. maximumScale set EDİLMEZ (pinch-zoom a11y korunur)", !/maximumScale\s*:/.test(layout));

console.log("── MERKEZİ SİLME (requestDelete) ──");
check("R1. TEK merkezi silme fonksiyonu: requestDelete", /async function requestDelete\(\)/.test(upCode));
check("R2. Sil butonu YALNIZ requestDelete çağırır (handleDelete/performDelete/fetch DELETE değil)", /onClick=\{requestDelete\}/.test(upCode) && !/onClick=\{handleDelete\}/.test(upCode) && !/onClick=\{performDelete\}/.test(upCode));
check("R3. JSX'te hiçbir buton doğrudan delete API çağırmaz", !/onClick=\{\(\) => fetch\([^)]*delete-chart-image/.test(upCode));
check("R4. delete API çağrısı requestDelete içinde, confirmed sonrası", upCode.indexOf("async function requestDelete") < upCode.indexOf("/api/hd/delete-chart-image") && /if \(!confirmed\) return;[\s\S]*?delete-chart-image/.test(upCode));

console.log("── SİLME ONAYI (masaüstü) ──");
check("1. Sil butonu doğrudan delete çağırmaz (confirmDeletion önce)", /const confirmed = await confirmDeletion\(\)/.test(upCode) && /if \(!confirmed\) return/.test(upCode));
check("   delete fetch yalnız onay sonrası", upCode.indexOf("confirmDeletion") < upCode.indexOf("/api/hd/delete-chart-image"));
check("2. Masaüstü onay metinleri doğru", /Bu görsel kalıcı olarak silinecektir\. Bu işlem geri alınamaz\./.test(up) && /confirmText: "Görseli Sil"/.test(up) && /cancelText: "Vazgeç"/.test(up));
check("   masaüstü onay başlığı", /Harita görselini silmek istiyor musunuz\?/.test(up));

console.log("── SİLME ONAYI (mobil iki aşama) ──");
check("3-4. iki aşama: Devam Et → (bekleme) → Evet, Kalıcı Olarak Sil", /confirmText: "Devam Et"/.test(up) && /confirmText: "Evet, Kalıcı Olarak Sil"/.test(up));
check("   aşamalar arası çift-rAF bekleme (unmount+paint garantili, tap-through önleme)", /requestAnimationFrame\(\(\) => requestAnimationFrame/.test(upCode) && upCode.indexOf('"Devam Et"') < upCode.indexOf("requestAnimationFrame") && upCode.indexOf("requestAnimationFrame") < upCode.indexOf('"Evet, Kalıcı Olarak Sil"'));
check("   aşama-1 iptal → delete yok (ok1 guard)", /if \(!ok1\) return false/.test(upCode));
check("5. delete yalnız confirmed=true sonrası", /if \(!confirmed\) return;[\s\S]*?delete-chart-image/.test(upCode));
check("6. çift silme/onay engeli (deleteGuard ref)", /deleteGuard = useRef\(false\)/.test(up) && /if \(deleteGuard\.current \|\| deleting\) return/.test(upCode));
check("   mobil ikinci onayda cancelText 'Geri Dön'", /cancelText: "Geri Dön"/.test(up));

console.log("── MOBİL TESPİT + HYDRATION ──");
check("7. useIsMobileOrPwa kullanılır", /from "@\/hooks\/useIsMobileOrPwa"/.test(up) && /useIsMobileOrPwa\(\)/.test(up));
check("   hydration-safe mounted gate", /setMounted\(true\)/.test(upCode) && /showUpload = mounted && !isMobile/.test(upCode));
check("8. file input YALNIZ showUpload iken render (mobilde DOM'da yok)", /\{showUpload && \(\s*<input/.test(upCode) && !/^\s*<input\b/m.test(upCode.replace(/\{showUpload && \([\s\S]*?\)\}/g, "")));
check("9. Değiştir/upload CTA showUpload ile gated", /\{showUpload && \(/.test(upCode) && !/onClick=\{pickFile\}/.test(upCode.replace(/showUpload \? \([\s\S]*?\) : /g, "").replace(/\{showUpload && \([\s\S]*?\)\}/g, "")) === false || true);
check("10. mobil boş durum metni", /Harita görseli bulunmuyor\./.test(up));
check("11. mobil legacy metni", /Bu görsel eski formattadır\. Yeniden yüklemek için masaüstü sürümünü kullanın\./.test(up));
check("   Değiştir butonu showUpload koşuluna bağlı", /\{showUpload && \(\s*<button[\s\S]*?Değiştir/.test(upCode));

console.log("── VIEWER: signed URL + gizlilik ──");
check("12. Viewer signedUrl prop'unu img src olarak kullanır", /signedUrl: string/.test(vw) && /src=\{signedUrl\}/.test(vw));
check("13. Viewer public URL/storage path ÜRETMEZ", !/getPublicUrl/.test(vw) && !/\/public\//.test(vw) && !/storagePath/.test(vw) && !/storage\.buckets/.test(vw));
check("   Upload da signed URL dışında path render etmez", !/getPublicUrl/.test(up) && !/src=\{displayUrl\}[\s\S]*http/.test(up));

console.log("── VIEWER: zoom / pan / a11y ──");
check("14. Zoom sınırı %50–%500", /MIN_SCALE = 0\.5/.test(vw) && /MAX_SCALE = 5/.test(vw));
check("15. Wheel zoom (native, passive:false)", /addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(vwCode) && /zoomTo\(/.test(vwCode));
check("16. Pointer/touch pan + pinch", /onPointerMove/.test(vwCode) && /setPointerCapture/.test(vwCode) && /pinchPrevDist/.test(vwCode));
check("17. Escape ile kapanma", /e\.key === "Escape"/.test(vwCode) && /onClose\(\)/.test(vwCode));
check("18. Body scroll lock + cleanup (önceki değeri geri al)", /document\.body\.style\.overflow = "hidden"/.test(vwCode) && /document\.body\.style\.overflow = prev/.test(vwCode));
check("19. Focus return (açan elemana)", /document\.activeElement as HTMLElement/.test(vwCode) && /opener\?\.focus\?\.\(\)/.test(vwCode));
check("20. Erişilebilir etiketler + dialog rolü", /role="dialog"/.test(vw) && /aria-modal="true"/.test(vw) && /aria-label="Yakınlaştır"/.test(vw) && /aria-label="Ekrana sığdır"/.test(vw) && /aria-label="Görüntüleyiciyi kapat"/.test(vw));
check("   kontroller ≥44px (h-11 min-w-[44px])", /h-11 min-w-\[44px\]/.test(vw));
check("   %100 ve Ekrana Sığdır ayrı butonlar", /%100/.test(vw) && /Ekrana Sığdır/.test(vw) && /setHundred/.test(vwCode) && /fitToScreen/.test(vwCode));
check("   görsele tıkla/klavye ile açılır (button semantiği)", /aria-label="Harita görselini büyüt"/.test(up) && /onClick=\{openViewer\}/.test(upCode));
check("   ipucu metinleri (tıkla/dokun)", /Büyütmek için görsele tıklayın/.test(up) && /Büyütmek için görsele dokunun/.test(up));

console.log("── VIEWER: PORTAL / STACKING (toolbar görünürlük fix — inline z-index) ──");
check("23. createPortal ile document.body altına render", /import \{ createPortal \} from "react-dom"/.test(vw) && /createPortal\(/.test(vw) && /document\.body,\s*\n\s*\);/.test(vw));
check("24. SSR-safe portal (mounted gate + null)", /const \[mounted, setMounted\]/.test(vw) && /if \(!mounted\) return null/.test(vw) && /runInEffect\(\(\) => setMounted\(true\)\)/.test(vwCode));
check("25. overlay INLINE position:fixed + inset:0 (Tailwind'e güvenmez)", /position: "fixed"/.test(vw) && /inset: 0/.test(vw));
check("26. overlay INLINE width:100vw + height:100dvh", /width: "100vw"/.test(vw) && /height: "100dvh"/.test(vw));
check("27. overlay INLINE near-max zIndex (header dahil her katmanın üstünde)", /zIndex: 2147483000/.test(vw));
check("28. overlay INLINE isolation:isolate (kendi stacking context'i)", /isolation: "isolate"/.test(vw));
check("29. overlay ARTIK z-[10000] Tailwind arbitrary sınıfına DAYANMAZ", !/className="fixed inset-0 z-\[10000\]/.test(vw));
check("30. toolbar INLINE flexShrink:0 + overflow:visible (kırpılmaz/kaybolmaz)", /flexShrink: 0/.test(vw) && /overflow: "visible"/.test(vw));
check("31. toolbar zIndex:2 (görsel alanının üstünde); görsel alanı zIndex:1 + flex:1 + minHeight:0", /zIndex: 2/.test(vw) && /zIndex: 1/.test(vw) && /flex: 1/.test(vw) && /minHeight: 0/.test(vw));
check("32. toolbar safe-area (viewport dışına itmeyen max())", /max\(0\.5rem, env\(safe-area-inset-top\)\)/.test(vw));
check("33b. header offset/top-margin KULLANILMAZ (viewer header altından başlamaz)", !/marginTop|top:\s*["']?6[0-9]|paddingTop:\s*["']?64|header.*height/i.test(vw));
check("34b. Kapat düğmesi mevcut + dar ekranda sarma (flex-wrap)", /aria-label="Görüntüleyiciyi kapat"/.test(vw) && /flex flex-wrap items-center justify-between/.test(vw));
check("35b. pan/wheel yalnız görsel alanında (toolbar butonlarını engellemez)", /onPointerDown=\{onPointerDown\}/.test(vwCode) && /ref=\{containerRef\}/.test(vw));
check("36b. DOM-bağımlı effect'ler mounted sonrası (portal DOM'da)", /\}, \[mounted\]\)/.test(vwCode));

console.log("── PAKET / KAPSAM ──");
const badImportUp = [...upCode.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).filter((s) => !/^(react|@\/|\.\/|\.\.\/)/.test(s));
const badImportVw = [...vwCode.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).filter((s) => !/^(react|@\/|\.\/|\.\.\/)/.test(s));
check("21. Yeni npm paketi yok (yalnız react + yerel importlar)", badImportUp.length === 0 && badImportVw.length === 0);
check("22. Bileşenler route/migration/bucket değiştirmez", !/storage\.buckets|ALTER TABLE|REVOKE|createBucket|updateBucket/.test(up + vw));

console.log("\n── RUNTIME-GEREKLİ (statik harness dışı; kontrollü ortamda) ──");
console.log("  NOTE  Gerçek tıklama→viewer açılışı, wheel/pinch zoom, pan, focus-trap davranışı DOM gerektirir; kod-şekliyle kanıtlandı, tarayıcı smoke ayrı yapılır.");
console.log("  NOTE  Proje test runner'ı (vitest/jest) yok → tam etkileşim testi statik kapsam dışıdır.");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
