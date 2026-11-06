/**
 * KİŞİSEL DİJİTAL OFİS (P3) — ana sayfa görünüm sözleşmesi testleri (saf; DB / ağ YOK).
 * Çalıştır: npx tsx scripts/workspace/homeView.test.ts
 */
import { randomUUID } from "node:crypto";
import { FAVORITES_MAX, WORKSPACE_CENTERS } from "../../lib/workspace/catalog";
import { resolveHomeView, workspaceAssetUrl } from "../../lib/workspace/homeView";
import { DEFAULT_UI_PREFS, parseDesign, parseUiPrefs, type UiPrefs, type WorkspaceDesign } from "../../lib/workspace/schema";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
function design(v: unknown): WorkspaceDesign {
  const r = parseDesign(v, { allowAssets: true });
  if (!r.ok) throw new Error(`fixture: ${r.error} @ ${r.path}`);
  return r.value;
}
function prefs(v: Partial<UiPrefs>): UiPrefs {
  const r = parseUiPrefs({ ...DEFAULT_UI_PREFS, ...v });
  if (!r.ok) throw new Error(`fixture: ${r.error} @ ${r.path}`);
  return r.value;
}
const ALL_MODULES = new Set<string>(WORKSPACE_CENTERS.flatMap((c) => [...c.modules]));

// ── Varsayılan: tasarım + tercih yok → bugünkü ana sayfa ──
const def = resolveHomeView({ design: null, prefs: null });
ok(def.personalized === false && def.layout === null && def.hero === null && def.background === null && def.brand === null, "tasarım yok → kişiselleştirme yok (varsayılan ana sayfa)", def);
ok(def.logo.systemLogo === true && def.logo.personal === null, "kalıcı Yaşam Sistemi logosu daima; kişisel logo yok");
ok(def.centers.length === WORKSPACE_CENTERS.length && def.centers.every((c, i) => c.key === WORKSPACE_CENTERS[i].key && !c.hidden && c.modules.every((m) => !m.hidden)), "7 merkez katalog sırasıyla, hiçbiri gizli değil");
ok(def.favorites.length === 0 && def.cardLevel === "center" && def.viewMode === "auto", "varsayılan: Favorilerim boş, merkez kartları, otomatik görünüm");
ok(JSON.stringify(def.reading) === JSON.stringify(DEFAULT_UI_PREFS.reading), "varsayılan okuma tercihleri");
ok(JSON.stringify(resolveHomeView({ design: undefined, prefs: undefined })) === JSON.stringify(def), "undefined ≡ null");

// ── Varlık URL'si yalnız uuid'den ──
const id = randomUUID();
ok(workspaceAssetUrl(id, "desktop") === `/api/settings/workspace/assets/${id}?v=desktop`, "masaüstü varyant URL'si P2 güvenli uç");
ok(workspaceAssetUrl(id, "mobile") === `/api/settings/workspace/assets/${id}?v=mobile`, "mobil varyant URL'si P2 güvenli uç");
for (const bad of ["../../secret.png", "https://evil.example/x.png", "tenant/1/logo.webp", "", id.toUpperCase(), `${id}?v=x`, null, undefined]) {
  ok(workspaceAssetUrl(bad as string | null | undefined, "desktop") === null, `geçersiz varlık kimliği URL üretmez: ${JSON.stringify(bad)}`);
}

// ── Tasarım uygulanır; fotoğraf / logo yalnız kimlikten ──
const photoId = randomUUID();
const logoId = randomUUID();
const d = design({ layout: "B", bg: { mode: "photo", photoAssetId: photoId }, logo: { assetId: logoId } });
const v = resolveHomeView({ design: d, prefs: null });
ok(v.personalized && v.layout === "B", "tasarım düzeni (A/B/C) aktarılır");
ok(v.background?.photo?.desktop === `/api/settings/workspace/assets/${photoId}?v=desktop` && v.background.photo.mobile.endsWith("?v=mobile"), "arka plan fotoğrafı masaüstü + mobil varyant");
ok(v.logo.personal?.image?.desktop === `/api/settings/workspace/assets/${logoId}?v=desktop`, "kişisel logo güvenli uçtan");
ok(v.logo.systemLogo === true, "kişisel logo varken de kalıcı Yaşam Sistemi logosu korunur");
ok(!JSON.stringify(v).includes("photoAssetId") && !JSON.stringify(v).includes("\"assetId\""), "görünüm nesnesinde ham varlık kimliği alanı yok");
const theme = resolveHomeView({ design: design({ layout: "A", bg: { mode: "theme", theme: "lavanta", photoAssetId: photoId } }), prefs: null });
ok(theme.background?.photo === null, "fotoğraf modu değilse fotoğraf URL'si üretilmez");
const forged = { ...d, bg: { ...d.bg, photoAssetId: "https://evil.example/x.png" }, logo: { ...d.logo, assetId: "../x" } } as WorkspaceDesign;
const fv = resolveHomeView({ design: forged, prefs: null });
ok(fv.background?.photo === null && fv.logo.personal?.image === null, "doğrulanmamış (sahte) kimlik bile URL'ye dönüşmez");

// ── Tasarım ve tercihler bağımsız ──
const p = prefs({ hiddenModules: ["center:stok", "module:reflexology"], favorites: ["module:numerology", "module:stones"], cardLevel: "module", viewMode: "night" });
const both = resolveHomeView({ design: d, prefs: p, accessibleModules: ALL_MODULES });
const reset = resolveHomeView({ design: null, prefs: p, accessibleModules: ALL_MODULES });
ok(reset.personalized === false && reset.layout === null, "Tasarımımı sıfırla → yalnız tasarım varsayılana döner");
ok(JSON.stringify(reset.centers) === JSON.stringify(both.centers) && JSON.stringify(reset.favorites) === JSON.stringify(both.favorites), "sıfırlamada gizlenenler ve Favorilerim korunur");
ok(reset.cardLevel === "module" && reset.viewMode === "night", "sıfırlamada kart düzeyi ve görünüm modu korunur");
const prefsReset = resolveHomeView({ design: d, prefs: null });
ok(prefsReset.layout === "B" && prefsReset.background?.photo !== null, "tercihler varsayılansa tasarım etkilenmez");

// ── Gizleme yalnız görünürlük ──
ok(both.centers.find((c) => c.key === "stok")?.hidden === true, "merkez gizleme");
ok(both.centers.find((c) => c.key === "energy_body")?.modules.find((m) => m.key === "reflexology")?.hidden === true, "modül gizleme");
ok(both.centers.find((c) => c.key === "energy_body")?.hidden === false, "modül gizlemek merkezini gizlemez");
ok(both.centers.every((c) => Object.keys(c).sort().join() === "hidden,key,modules"), "merkez nesnesinde kilit/yetki alanı YOK (karar çağıranda)");

// ── Favorilerim ──
ok(JSON.stringify(both.favorites) === JSON.stringify(["module:numerology", "module:stones"]), "favoriler kullanıcı sırasıyla");
const limited = resolveHomeView({ design: null, prefs: p, accessibleModules: new Set(["stones"]) });
ok(JSON.stringify(limited.favorites) === JSON.stringify(["module:stones"]), "erişilemeyen modül favorilerde gösterilmez");
ok(resolveHomeView({ design: null, prefs: p }).favorites.length === 0, "erişim listesi verilmezse favori gösterilmez (güvenli varsayılan)");
const many = { ...DEFAULT_UI_PREFS, favorites: [...ALL_MODULES].map((m) => `module:${m}`).concat(["module:stones", "center:stok", "module:yok"]) };
const mv = resolveHomeView({ design: null, prefs: many, accessibleModules: ALL_MODULES });
ok(mv.favorites.length === FAVORITES_MAX && new Set(mv.favorites).size === mv.favorites.length, `favoriler tekrarsız ve en çok ${FAVORITES_MAX}`);
ok(mv.favorites.every((f) => f.startsWith("module:")), "merkez / bilinmeyen anahtar favori olamaz");

// ── Girdi değişmez ──
const before = JSON.stringify(p);
resolveHomeView({ design: d, prefs: p, accessibleModules: ALL_MODULES }).reading.scale = 9;
ok(JSON.stringify(p) === before, "çıktı değiştirilse de girdi tercihleri değişmez");

console.log(`\nworkspace homeView test: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
