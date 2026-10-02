/**
 * Doğaltaş MİNERAL listesi araması — Türkçe i/İ/ı/I regresyon harness'i.
 *
 * Kök neden (taş listesiyle aynı sınıf): eski buildMineralIlikePatterns 4 tam-terim ILIKE
 * varyantı üretiyordu; prod en_US.UTF-8'de lower('İ') = "i̇" (2 karakter), lower('I') = "i"
 * olduğu için karışık konumlar ("İnci Minerali" ← "inci" / "İNCİ") eşleşmiyordu.
 * Prod PostgreSQL'de düzeltme öncesi 15 vakanın 8'i FAIL, sonrası 15/15 (salt-okunur ifade
 * değerlendirmesi). Düzeltme yeni algoritma YAZMAZ: PR #320'de prod'da doğrulanan
 * stonesListFetch.buildTurkishInsensitiveRegex yeniden kullanılır.
 *
 * Çalıştır: npx tsx scripts/dogaltas-mineral-turkish-search/harness.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildMineralsListSearchOrFilter,
  MINERALS_LIST_SEARCH_TEXT_COLUMNS,
} from "../../lib/dogaltas/mineralsListFetch";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error(`  ✗ ${name}`); }
}

/** PG `~*` semantiğinin JS karşılığı (bu üreticinin çıktısı için; "[]]"/"[[]" JS'e çevrilir). */
function pgImatch(text: string, pgRegex: string): boolean {
  const js = pgRegex.replace(/\[\]\]/g, "\\]").replace(/\[\[\]/g, "\\[");
  return new RegExp(js, "iu").test(text);
}
/** `name` kolonu koşulu metinle eşleşiyor mu (null → filtre yok). */
function nameMatches(text: string, query: string): boolean | null {
  const or = buildMineralsListSearchOrFilter(query);
  if (!or) return null;
  const m = or.match(/^name\.imatch\."([^"]*)"/);
  if (!m) return false;
  return pgImatch(text, m[1]);
}

// ─── Kök neden: eski 4-varyant ILIKE yaklaşımı PG semantiğinde başarısız ─────────
{
  const oldPatterns = (term: string) => {
    const s = new Set([`%${term}%`]);
    if (/[iıİI]/.test(term)) {
      s.add(`%${term.replace(/[iıI]/g, "İ")}%`); s.add(`%${term.replace(/[iİI]/g, "ı")}%`); s.add(`%${term.replace(/[ıİI]/g, "i")}%`);
    }
    return [...s];
  };
  const pgIlike = (text: string, pattern: string) => {
    const t = text.toLowerCase();
    const p = pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
    return new RegExp(`^${p}$`, "u").test(t);
  };
  const oldHit = (t: string, q: string) => oldPatterns(q).some((p) => pgIlike(t, p));
  ok("KÖK NEDEN: eski yaklaşım 'İnci Minerali' ← 'inci' bulamıyordu", oldHit("İnci Minerali", "inci") === false);
  ok("KÖK NEDEN: eski yaklaşım 'İzmir Minerali' ← 'İZMİR' bulamıyordu", oldHit("İzmir Minerali", "İZMİR") === false);
}

// ─── İstenen Türkçe vakalar ───────────────────────────────────────────────────
const TR: [string, string][] = [
  ["İnci Minerali", "İnci"], ["İnci Minerali", "inci"], ["İnci Minerali", "İNCİ"],
  ["İnci Minerali", "inci minerali"], ["İnci Minerali", "İNCİ MİNERALİ"],
  ["Işık Minerali", "Işık"], ["Işık Minerali", "ışık"], ["Işık Minerali", "IŞIK"],
  ["İzmir Minerali", "izmir"], ["İzmir Minerali", "İzmir"], ["İzmir Minerali", "İZMİR"],
  ["Kırmızı Mineral", "kırmızı"], ["Kırmızı Mineral", "KIRMIZI"],
  ["ÇİNKO", "çinko"], ["ZZ_AUDIT_İnci_Minerali", "inci_minerali"],
];
for (const [text, q] of TR) ok(`TR: "${text}" ← "${q}"`, nameMatches(text, q) === true);
ok("ASCII: Magnesium ← MAGNES", nameMatches("Magnesium", "MAGNES") === true);
ok("Olumsuz: İnci Minerali ← inciler", nameMatches("İnci Minerali", "inciler") === false);

// ─── Özel karakterler: literal, operatör/joker değil ────────────────────────────
const SPECIAL: [string, string, boolean | null][] = [
  ["100% saf", "100%", true], ["a_b min", "_", true], ["axb min", "a_b", false],
  ["back\\slash", "\\", null], ["Ali'nin min", "ali'nin", false], ['say "x"', '"x"', true],
  ["[köşeli] min", "[köşeli]", true], ["köşeli min", "[köşeli]", false], ["a]b", "a]b", true],
  ["a|b", "a|b", true], ["ab", "a|b", false], ["x*y", "*", true], ["xyz", "*", false],
  ["a.b min", "a.b", true], ["aXb min", "a.b", false], ["<script>alert(1)</script>", "<script>", true],
];
for (const [text, q, exp] of SPECIAL) ok(`ÖZEL: "${text}" ← ${JSON.stringify(q)} = ${exp}`, nameMatches(text, q) === exp);

// ─── Filtre yapısı / güvenlik ───────────────────────────────────────────────────
{
  for (const q of ["inci", "a,b", "x)y", 'say "hi"', "back\\slash", "a'b", "<script>", "%_*", "ç".repeat(500), "[]{}.$|?*+^"]) {
    const or = buildMineralsListSearchOrFilter(q);
    const vals = or ? [...or.matchAll(/\.imatch\."([^"]*)"/g)].map((m) => m[1]) : [];
    ok(`GÜVENLİK ${JSON.stringify(q).slice(0, 14)}: değerde " \\ , ( ) yok`, vals.every((v) => !/["\\,()]/.test(v)));
    ok(`GÜVENLİK ${JSON.stringify(q).slice(0, 14)}: yalnız 4 çekirdek kolon`, !or || (or.split(/,(?=[a-z_]+\.imatch\.")/).length === MINERALS_LIST_SEARCH_TEXT_COLUMNS.length
      && MINERALS_LIST_SEARCH_TEXT_COLUMNS.every((c) => or.includes(`${c}.imatch."`))));
  }
  ok("Boş / yalnız kaldırılan karakter → null (route 0 sonuç döner)", buildMineralsListSearchOrFilter("  ,() ") === null && buildMineralsListSearchOrFilter("%") === null);
  const src = readFileSync(resolve(ROOT, "lib/dogaltas/mineralsListFetch.ts"), "utf8");
  ok("Ortak yardımcı yeniden kullanılır (ikinci algoritma yok)", src.includes("buildTurkishInsensitiveRegex(safeTerm)") && !src.includes("buildMineralIlikePatterns"));
}

// ─── Tenant / sorgu bağlamı değişmedi (kaynak kilidi) ───────────────────────────
{
  const route = readFileSync(resolve(ROOT, "app/api/dogaltas/minerals/route.ts"), "utf8");
  ok("TENANT: sayaç sorgusu .eq(tenant_id) korunur", route.includes('.select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)'));
  ok("TENANT: liste sorgusu .eq(tenant_id) + sayfalama korunur", /\.select\(MINERALS_LIST_SELECT\)\s*\.eq\("tenant_id", tenantId\)[\s\S]{0,160}\.range\(offset, offset \+ limit - 1\)/.test(route));
  ok("Arama filtresi tenant sorgusuna AND olarak eklenir", (route.match(/if \(orFilter\) query = query\.or\(orFilter\);/g) || []).length === 2);
  ok("Sonuç limiti korunur (≤100)", route.includes("Math.min(Math.max(1, rawLimit), 100)"));
}

console.log(`\nDoğaltaş mineral Türkçe arama harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) { console.log("Başarısız:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("✓ TÜM KAPILAR GEÇTİ");
