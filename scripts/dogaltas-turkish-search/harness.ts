/**
 * Doğaltaş liste araması — Türkçe i/İ/ı/I regresyon harness'i.
 *
 * Kök neden (prod en_US.UTF-8): ILIKE iki tarafı lower() ile küçültür; lower('İ') = "i̇"
 * (i + U+0307, iki karakter), lower('I') = "i". Eski 3-varyant ILIKE yaklaşımı (orijinal /
 * tüm i→İ / tüm i→ı) karışık konumları kaçırıyordu: "İnci" (İ + i) ← "inci" / "İNCİ" /
 * "inci taşı" bulunamıyordu. AŞAMA 1 testleri yalnız tek-tip İ içeren adları (ĞÜŞİÖÇ,
 * AMETİST) denediği için bu kenar durumu kaçırmıştı → burada karışık-konum vakaları kilitli.
 *
 * Bu harness:
 *   - Eski yaklaşımın PG-ILIKE semantiğinde (JS toLowerCase, PG lower() ile aynı İ davranışı)
 *     FAIL verdiğini belgeler,
 *   - yeni regex üreticisini PG `~*` semantiğinin JS karşılığıyla çalıştırır,
 *   - özel karakterlerin literal kaldığını ve tenant/sorgu bağlamının değişmediğini kilitler.
 * Gerçek PostgreSQL doğrulaması (aynı vakalar) ayrıca prod'da salt-okunur ifade
 * değerlendirmesiyle yapıldı; bu harness DB/ağ gerektirmez.
 *
 * Çalıştır: npx tsx scripts/dogaltas-turkish-search/harness.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildStonesListSearchOrFilter,
  buildTurkishInsensitiveRegex,
  sanitizeOrSearchTerm,
  STONES_LIST_SEARCH_MAX_LENGTH,
} from "../../lib/dogaltas/stonesListFetch";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error(`  ✗ ${name}`); }
}

/** PG `~*` semantiğinin JS karşılığı (yalnız bu üreticinin çıktısı için; "[]]"/"[[]" JS'e çevrilir). */
function pgImatch(text: string, pgRegex: string): boolean {
  const js = pgRegex.replace(/\[\]\]/g, "\\]").replace(/\[\[\]/g, "\\[");
  return new RegExp(js, "iu").test(text);
}
/** Ad modunda üretilen filtrenin metinle eşleşip eşleşmediği (null → filtre yok). */
function nameMatches(text: string, query: string): boolean | null {
  const or = buildStonesListSearchOrFilter(query, "name");
  if (!or) return null;
  const m = or.match(/^stone_name\.imatch\."(.*)"$/);
  if (!m) return false;
  return pgImatch(text, m[1]);
}

// ─── Kök neden: eski 3-varyant ILIKE yaklaşımı PG semantiğinde başarısız ─────────
{
  const oldPatterns = (term: string) => {
    const s = new Set([`%${term}%`]);
    if (/[iıİ]/i.test(term)) { s.add(`%${term.replace(/[iı]/gi, "İ")}%`); s.add(`%${term.replace(/[iİ]/gi, "ı")}%`); }
    return [...s];
  };
  // PG ILIKE ≈ lower(text) LIKE lower(pattern); JS toLowerCase('İ') = "i̇" (PG ile aynı).
  const pgIlike = (text: string, pattern: string) => {
    const t = text.toLowerCase();
    const p = pattern.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
    return new RegExp(`^${p}$`, "u").test(t);
  };
  ok("KÖK NEDEN: toLowerCase('İ') iki karakter (PG lower ile aynı)", "İ".toLowerCase().length === 2);
  const oldHit = (t: string, q: string) => oldPatterns(q).some((p) => pgIlike(t, p));
  ok("KÖK NEDEN: eski yaklaşım 'İnci Taşı' ← 'inci' bulamıyordu", oldHit("İnci Taşı", "inci") === false);
  ok("KÖK NEDEN: eski yaklaşım 'Işık Taşı' ← 'ışık' bulamıyordu", oldHit("Işık Taşı", "ışık") === false);
  ok("KÖK NEDEN: eski yaklaşım yalnız tam 'İnci' ile buluyordu", oldHit("İnci Taşı", "İnci") === true);
}

// ─── Türkçe vakalar (zorunlu liste + AŞAMA 1'in kaçırdığı karışık konumlar) ───────
const TR_CASES: [string, string][] = [
  ["İnci Taşı", "İnci"], ["İnci Taşı", "inci"], ["İnci Taşı", "İNCİ"], ["İnci Taşı", "inci taşı"], ["İnci Taşı", "İNCİ TAŞI"],
  ["Işık Taşı", "Işık"], ["Işık Taşı", "ışık"], ["Işık Taşı", "IŞIK"], ["Işık Taşı", "ışık taşı"],
  ["İzmir Taşı", "izmir"], ["İzmir Taşı", "İzmir"], ["İzmir Taşı", "İZMİR"],
  ["Kırmızı Taş", "kırmızı"], ["Kırmızı Taş", "KIRMIZI"], ["Kırmızı Taş", "Kırmızı"],
  ["AMETİST", "ametist"], ["Ametist", "AMETİST"], ["Ğüşöç Çakra", "ĞÜŞÖÇ çakra"], ["Şifa Ğüç", "ŞİFA ĞÜÇ"],
  ["ZZ_AUDIT_DOGALTAS_SEARCH_İnci_Taşı", "inci_taşı"], ["İnci Taşı", "nci ta"],
];
for (const [text, q] of TR_CASES) ok(`TR: "${text}" ← "${q}"`, nameMatches(text, q) === true);

// ─── ASCII ve olumsuz vakalar ───────────────────────────────────────────────────
ok("ASCII: Rose Quartz ← rose qua", nameMatches("Rose Quartz", "rose qua") === true);
ok("ASCII: Rose Quartz ← QUARTZ", nameMatches("Rose Quartz", "QUARTZ") === true);
ok("Olumsuz: İnci Taşı ← inciler", nameMatches("İnci Taşı", "inciler") === false);
ok("Olumsuz: Kırmızı ← mavi", nameMatches("Kırmızı Taş", "mavi") === false);

// ─── Özel karakterler: joker/desen DEĞİL, literal ───────────────────────────────
const SPECIAL: [string, string, boolean | null][] = [
  ["a_b taşı", "_", true], ["axb taşı", "a_b", false],
  ["100% saf", "100%", true], ["Ali'nin taşı", "ali'nin", false],
  ['say "merhaba"', '"merhaba"', true], ["back\\slash", "\\", null],
  ["<script>alert(1)</script>", "<script>", true],
  ["a.b taşı", "a.b", true], ["aXb taşı", "a.b", false],
  ["c++ taşı", "c++", true], ["x*y", "*", true], ["xyz", "*", false],
  ["soru? taşı", "soru?", true], ["[köşeli] taş", "[köşeli]", true], ["köşeli taş", "[köşeli]", false],
  ["a|b", "a|b", true], ["ab", "a|b", false], ["{x}", "{x}", true], ["dolar$", "dolar$", true],
];
for (const [text, q, exp] of SPECIAL) ok(`ÖZEL: "${text}" ← ${JSON.stringify(q)} = ${exp}`, nameMatches(text, q) === exp);

// ─── Çıktı güvenliği: PostgREST .or() dizesi bozulmaz ───────────────────────────
{
  const inputs = ["inci", "a,b", "x)y", "say \"hi\"", "back\\slash", "a'b", "<script>", "%_*", "ç".repeat(500), "[]{}.$|?*+^"];
  for (const q of inputs) {
    const or = buildStonesListSearchOrFilter(q, "content");
    const values = or ? [...or.matchAll(/\.imatch\."([^"]*)"/g)].map((m) => m[1]) : [];
    const cols = or ? or.split(/,(?=[a-z_]+\.imatch\.")/).length : 0;
    ok(`GÜVENLİK: ${JSON.stringify(q).slice(0, 16)} → değerde " \\ , ( ) yok`, values.every((v) => !/["\\,()]/.test(v)));
    // WT9: içerik modu 14 kolon (+ birincil kaynak adı + ek kaynak türetilmiş metni).
    ok(`GÜVENLİK: ${JSON.stringify(q).slice(0, 16)} → yalnız izinli kolonlar`, !or || cols === 14);
  }
  const long = buildTurkishInsensitiveRegex("x".repeat(1000)) ?? "";
  ok("GÜVENLİK: terim üst sınırı", long.length === STONES_LIST_SEARCH_MAX_LENGTH);
  ok("Boş/yalnız kaldırılan karakter → filtre yok (mevcut davranış)", buildStonesListSearchOrFilter("%", "name") === null && buildStonesListSearchOrFilter("   ", "name") === null);
  ok("İçerik modu 14 kolon (WT9: + primary_source_name + extra_sources_text), ad modu 1 kolon", (buildStonesListSearchOrFilter("inci", "content") ?? "").split(",").length === 14 && (buildStonesListSearchOrFilter("inci", "name") ?? "").split(",").length === 1);
  const legacyOr = buildStonesListSearchOrFilter("inci", "content", { legacySchema: true }) ?? "";
  ok("WT9 geri uyum: migration öncesi şemada içerik araması eski 12 kolon (yeni kolon yok)", legacyOr.split(",").length === 12 && !/primary_source_name|extra_sources_text/.test(legacyOr));
  ok("Paylaşılan sanitizeOrSearchTerm davranışı değişmedi (Biyoenerji/mineral tüketicileri)", sanitizeOrSearchTerm(" a,(b)%'c ") === "a b c");
}

// ─── Tenant / sorgu bağlamı değişmedi (kaynak kilidi) ───────────────────────────
{
  const route = readFileSync(resolve(ROOT, "app/api/dogaltas/stones/route.ts"), "utf8");
  ok("TENANT: liste sorgusu .in(tenant_id, ids) korunur", /\.select\(STONES_LIST_SELECT[\s\S]*?\.in\("tenant_id", ids\)/.test(route));
  ok("TENANT: sayaç sorgusu .in(tenant_id, ids) korunur", route.includes('.select("id", { count: "exact", head: true }).in("tenant_id", ids)'));
  ok("TENANT: arama filtresi tenant sorgusuna AND olarak eklenir (.or ayrı çağrı)", (route.match(/buildStonesListSearchOrFilter\(q, searchMode, \{ legacySchema \}\); if \(or\) query = query\.or\(or\);/g) || []).length === 2);
  ok("Sayfalama/sıralama korunur", route.includes(".range(offset, offset + limit - 1)") && route.includes('.order("id", { ascending: true })'));
}

console.log(`\nDoğaltaş Türkçe arama harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) { console.log("Başarısız:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("✓ TÜM KAPILAR GEÇTİ");
