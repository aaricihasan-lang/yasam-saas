/**
 * NKB-V5 — Uzman stok taşı eşleştirme mantığı harness'ı (DB/React yok).
 * buildStockIndex + matchStock + stockLabel: normalize-EXACT ad eşleşmesi, fuzzy YOK, kategori
 * işaretlenmez, adet toplanır, adetsiz stok kaydı "Stokta". Tenant izolasyonu FETCH katmanındadır
 * (route .eq(tenant_id)); bu saf mantık yalnız tenant'ın satırlarını görür.
 *
 * Çalıştır: npx tsx scripts/numeroloji-nkb-v2/validate-stone-stock-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const ss = await import(pathToFileURL(join(HELPERS, "stoneStockLogic.ts")).href);
const { buildStockIndex, matchStock, stockLabel } = ss;

let pass = 0, fail = 0;
function check(name, cond) { const ok = Boolean(cond); console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (ok) pass++; else fail++; }

// Uzmanın (tenant) stok satırları — kanonik id YOK, yalnız ad + adet.
const idx = buildStockIndex([
  { name: "Ametist", adet: 18 },
  { name: "ametist", adet: 2 },       // aynı normalize → toplanır (20)
  { name: "Sitrin", adet: 0 },        // stok kaydı var, adet 0 → "Stokta" (miktarsız)
  { name: "  Turmalin  ", adet: 5 },  // trim/boşluk normalizasyonu
  { name: "Akik", adet: 3 },
  { name: "Kuvars", adet: 4 },
]);

console.log("── EXACT normalize eşleşme + adet ──");
check("canonical id olmadan normalize-exact eşleşir (Ametist stokta)", matchStock("Ametist", idx).stocked === true);
check("adet toplanır (18+2 = 20)", matchStock("Ametist", idx).adet === 20);
check("büyük/küçük + Türkçe İ normalize (AMETİST)", matchStock("AMETİST", idx).stocked === true);
check("baş/son boşluk + çoklu boşluk normalize (  Turmalin  )", matchStock("Turmalin", idx).stocked === true && matchStock("Turmalin", idx).adet === 5);

console.log("\n── FUZZY YOK / yanlış eşleşme koruması ──");
check("'Mor Akik' ≠ 'Akik' (contains YOK)", matchStock("Mor Akik", idx).stocked === false);
check("'Pembe Kuvars' ≠ 'Kuvars'", matchStock("Pembe Kuvars", idx).stocked === false);
check("'Mavi Topaz' (stokta yok) eşleşmez", matchStock("Mavi Topaz", idx).stocked === false);

console.log("\n── Kategori/grup başlığı stok sayılmaz ──");
check("'Yeşil Taşları' kategori → stokta değil", matchStock("Yeşil Taşları", idx).stocked === false);
check("'Şeffaf' → stokta değil", matchStock("Şeffaf", idx).stocked === false);
check("'Pembe Taşları' → stokta değil", matchStock("Pembe Taşları", idx).stocked === false);

console.log("\n── Adet gösterimi / etiket ──");
check("adetli stok → 'Stokta · 20 adet'", stockLabel(matchStock("Ametist", idx)) === "Stokta · 20 adet");
check("adetsiz (0) stok kaydı → 'Stokta'", (() => { const i = matchStock("Sitrin", idx); return i.stocked === true && i.adet === 0 && stockLabel(i) === "Stokta"; })());
check("stokta olmayan → boş etiket", stockLabel(matchStock("Mor Akik", idx)) === "");

console.log("\n── buildStockIndex sağlamlığı ──");
check("boş/eksik ad satırı yok sayılır", (() => { const j = buildStockIndex([{ name: "", adet: 5 }, { adet: 3 }, { name: "  ", adet: 1 }]); return j.size === 0; })());
check("negatif adet 0'a çekilir", (() => { const j = buildStockIndex([{ name: "X", adet: -5 }]); return matchStock("X", j).stocked === true && matchStock("X", j).adet === 0; })());

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
