/**
 * KİŞİSEL DİJİTAL OFİS (P4) — masaüstü → mobil uyarlama testleri (saf).
 * Çalıştır: npx tsx scripts/workspace/mobileAdapt.test.ts
 */
import { randomUUID } from "node:crypto";
import { LOGO_ZONES } from "../../lib/workspace/catalog";
import { MOBILE_W_MAX, MOBILE_W_MIN, adaptPlacementToMobile, applyDesktopToMobile, deviceSettingsDiffer, mobileZone } from "../../lib/workspace/mobileAdapt";
import { parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const D = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(r.error + " " + r.path); return r.value; };
const logo = randomUUID();
const photo = randomUUID();

const base = D({ layout: "A", logo: { assetId: logo, layout: { desktop: { zone: "hero", x: 1, y: 0.5, w: 0.2 }, mobile: { zone: "toolbar", x: 0.5, y: 0.5, w: 0.9 } } }, bg: { mode: "photo", photoAssetId: photo, focus: { x: 0.3, y: 0.7 }, mobileFocus: { x: 0.8, y: 0.1 }, separateMobile: true } });
ok(deviceSettingsDiffer(base), "farklı mobil logo / odak → soru sorulur");
const m = applyDesktopToMobile(base);
ok(JSON.stringify(m.logo.layout.mobile) === JSON.stringify({ zone: "toolbar", x: 0.5, y: 0.5, w: 1 }), "karşılama bandı → mobil güvenli üst şerit (P0 mobil varsayılanı)", m.logo.layout.mobile);
const foot = adaptPlacementToMobile({ zone: "footer", x: 0.2, y: 0.5, w: 0.1 }, base);
ok(foot.zone === "footer" && foot.w > 0.1 && foot.w <= MOBILE_W_MAX, "imza şeridi korunur; oransal boyut mobil darlığına göre büyütülür", foot);
ok(m.logo.layout.desktop.zone === "hero" && m.logo.layout.desktop.w === 0.2, "masaüstü yerleşimi değişmez");
ok(m.bg.separateMobile === false && m.bg.mobileFocus.x === 0.3 && m.bg.mobileFocus.y === 0.7, "fotoğraf odağı mobilde masaüstünü izler");
ok(base.logo.layout.mobile.zone === "toolbar" && base.bg.separateMobile === true, "girdi değişmez");
ok(!deviceSettingsDiffer(m), "uyarlamadan sonra fark kalmaz (yeniden sorulmaz)");
ok(m.logo.assetId === logo && m.bg.photoAssetId === photo, "görseller aynı kimlikle kalır (yeniden yükleme yok)");
ok(parseDesign(m, { allowAssets: true }).ok, "uyarlanan tasarım şemadan geçer (P1 şeması değişmez)");

// C çerçevesi yalnız C + fotoğrafta
ok(mobileZone("cerceve", { layout: "C", bg: { ...base.bg, mode: "photo" } }) === "cerceve", "C + fotoğraf: çerçeve korunur");
ok(mobileZone("cerceve", { layout: "C", bg: { ...base.bg, mode: "theme" } }) === "toolbar", "C + tema (mobilde çerçeve gizli) → üst şerit");
ok(mobileZone("cerceve", { layout: "A", bg: base.bg }) === "toolbar", "A'da çerçeve yok → üst şerit");
ok(["hero", "sec", "rightTop", "toolbar"].every((z) => mobileZone(z as "hero", base) === "toolbar"), "dar / metinli mobil bölgeler → üst şerit");

// Tüm bölgeler ve uç değerler: sınırlar içinde
let inRange = true;
for (const zone of LOGO_ZONES) for (const w of [0.02, 0.1, 0.3, 0.6, 1]) for (const x of [-0.5, 0, 0.5, 1, 1.5]) {
  const r = adaptPlacementToMobile({ zone, x, y: x, w }, { layout: "C", bg: { ...base.bg, mode: "photo" } });
  const wOk = r.zone === "toolbar" ? r.w === 1 : r.w >= MOBILE_W_MIN && r.w <= MOBILE_W_MAX;
  if (!wOk || r.x < 0 || r.x > 1 || r.y < 0 || r.y > 1) inRange = false;
}
ok(inRange, "tüm bölge / boyut / konum kombinasyonlarında güvenli aralık (0–1; üst şerit varsayılanı, diğerleri w 0,18–0,6)");

// Soru gereksizse sorulmaz
ok(!deviceSettingsDiffer(D({ layout: "B" })), "logo ve fotoğraf yoksa soru yok");
ok(!deviceSettingsDiffer(D({ layout: "A", logo: { assetId: logo, visible: false } })), "logo gizliyse logo farkı sorulmaz");
ok(!deviceSettingsDiffer(D({ layout: "A", bg: { mode: "photo", photoAssetId: photo, separateMobile: false, mobileFocus: { x: 0.9, y: 0.9 } } })), "mobil odak ayrı değilse odak farkı sorulmaz");

console.log(`\nworkspace mobileAdapt test: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
