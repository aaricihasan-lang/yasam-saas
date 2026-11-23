/**
 * Şifa Rehberi V2 — Araştırma Kütüphanem arama motoru (SAF) testleri.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/search.harness.ts
 */
import {
  buildSearchIndex, compareTitlesTr, findRanges, foldSearch, foldWithMap, initialOf, isSearchable,
  libraryRoots, MIN_QUERY, nodeHasMatch, normalizeQuery, searchRoots,
} from "../../lib/sifa-rehberi-v2/search";
import type { Block, TopicNode, Workspace } from "../../lib/sifa-rehberi-v2/types";

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
};
const T = "2026-11-23T10:00:00.000Z";
const node = (id: string, parentId: string | null, title: string, extra: Partial<TopicNode> = {}): TopicNode => ({
  id, ownerId: "u", parentId, title, sortKey: id, createdAt: T, updatedAt: T, deletedAt: null, deleteBatchId: null, ...extra,
});
const block = (id: string, nodeId: string, title: string, text: string, extra: Partial<Block> = {}): Block => ({
  id, ownerId: "u", nodeId, title, contentJson: { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] },
  contentText: text, classification: null, sources: [], sortKey: id, createdAt: T, updatedAt: T, deletedAt: null, deleteBatchId: null, ...extra,
});

console.log("\n1) Türkçe katlama kuralı");
ok(foldSearch("İSTANBUL") === "istanbul", "İ → i (Türkçe büyük harf)");
ok(foldSearch("IŞIK") === "isik", "I → ı → i, Ş → s");
ok(foldSearch("ılık") === foldSearch("ILIK") && foldSearch("ılık") === "ilik", "ı/I/i/İ eşdeğer");
ok(foldSearch("Öksürük Çay Ğ Ü") === "oksuruk cay g u", "ö ç ğ ü katlanır");
ok(foldSearch("Kâğıt Îmân Ûmumî") === "kagit iman umumi", "şapkalı â î û katlanır");
ok(foldSearch("ökş") === "oks", "ayrık birleşik işaretler (NFD) düşer");
ok(foldSearch("a   b\t c") === "a b c", "ardışık boşluk tek boşluk");
ok(foldSearch("satır1\nsatır2") === "satir1\nsatir2", "satır sonu korunur (paragraflar birleşmez)");
ok(normalizeQuery("  ÖKSÜRÜK  ") === "oksuruk", "sorgu kırpılır + katlanır");
ok(!isSearchable("a") && isSearchable("ab") && MIN_QUERY === 2, "en az 2 harf");
ok(!isSearchable("   ") && !isSearchable(""), "boş/boşluk sorgu aranmaz");

console.log("\n2) Konum haritası (vurgulama özgün harflere oturur)");
{
  const txt = "Şiddetli ÖKSÜRÜK ve öksürük";
  const r = findRanges(txt, normalizeQuery("öksürük"));
  ok(r.length === 2, "aynı metinde 2 eşleşme", r);
  ok(r.map(([s, e]) => txt.slice(s, e)).join("|") === "ÖKSÜRÜK|öksürük", "aralıklar özgün yazımı korur", r);
  const f = foldWithMap("İyi");
  ok(f.text === "iyi" && f.start[0] === 0 && f.end[0] === 1, "İ tek karaktere eşlenir", f);
  const d = "göz";
  const rd = findRanges(d, "goz");
  ok(rd.length === 1 && d.slice(rd[0][0], rd[0][1]) === d, "ayrık işaretli metinde aralık tüm harfi kapsar", rd);
  const emo = "🌿 zencefil 🌿 ZENCEFİL";
  const re = findRanges(emo, "zencefil");
  ok(re.length === 2 && emo.slice(re[1][0], re[1][1]) === "ZENCEFİL", "vekil çiftli (emoji) metinde konumlar doğru", re);
  ok(findRanges("B-12 vitamini; B12 değil", normalizeQuery("b-12")).length === 1, "noktalama birebir: 'b-12' yalnız 'B-12'yi bulur");
  ok(findRanges("ab\ncd", normalizeQuery("ab cd")).length === 0, "paragraflar arası eşleşme yok");
  ok(findRanges("aaaa", "aa").length === 2, "çakışmasız eşleşme");
  const long = ("lorem ipsum ".repeat(5000) + "zerdeçal") as string;
  const t0 = Date.now();
  const rl = findRanges(long, normalizeQuery("Zerdeçal"));
  ok(rl.length === 1 && long.slice(rl[0][0], rl[0][1]) === "zerdeçal" && Date.now() - t0 < 1500, "uzun metin (60 bin karakter)", Date.now() - t0);
}

console.log("\n3) Dizin + kök konu eşleştirme");
const ws: Workspace = {
  ownerId: "u",
  nodes: [
    node("r1", null, "Şiddetli Öksürük"),
    node("r1a", "r1", "Bitkisel Destek"),
    node("r1b", "r1a", "Zencefil Çayı"),
    node("r2", null, "Çarpıntı"),
    node("r3", null, "astım"),
    node("r4", null, "İshal"),
    node("r5", null, "Ödem"),
    node("r6", null, "cilt kuruluğu"),
    node("r7", null, "Silinmiş Konu", { deletedAt: T, deleteBatchId: "x" }),
    node("r8", null, "Uyku"),
    node("r8a", "r8", "Silinmiş Alt", { deletedAt: T, deleteBatchId: "y" }),
    node("r9", null, "  Boşluklu Başlık"),
    node("r10", null, "10. Vitamin"),
    node("r11", null, "2. Mineral"),
  ],
  blocks: [
    block("b1", "r1b", "Notlar", "Zencefil öksürüğü yatıştırır. Zencefil ılık içilir."),
    block("b2", "r2", "Bilimsel", "Kalp ritmi ve MAGNEZYUM ilişkisi."),
    block("b3", "r3", "Görsel", "", {
      contentJson: { type: "doc", content: [{ type: "figure", attrs: { src: "sifa-asset:00000000-0000-4000-8000-000000000001", alt: "", caption: "Bronş şeması" } }] },
    }),
    block("b4", "r4", "Kaynaklı", "metin", { sources: [{ id: "s1", kind: "makale", title: "Probiyotik derlemesi", authors: "Yılmaz A." }] }),
    block("b5", "r7", "Çöpteki konu kutusu", "zencefil"),
    block("b6", "r8a", "Çöpteki alt", "melatonin"),
    block("b7", "r5", "Çöpteki kutu", "lenf drenajı", { deletedAt: T, deleteBatchId: "z" }),
    block("b8", "r5", "Notlar", "Lenf DRENAJI masajı; lenf drenajı tekrar."),
  ],
  links: [],
};
const idx = buildSearchIndex(ws);
const ids = (q: string) => searchRoots(ws, idx, q).map((n) => n.id);
ok(JSON.stringify(ids("öksürük")) === JSON.stringify(["r1"]), "ana başlıkta eşleşme", ids("öksürük"));
ok(JSON.stringify(ids("bitkisel")) === JSON.stringify(["r1"]), "alt başlıkta eşleşme → kök konu", ids("bitkisel"));
ok(JSON.stringify(ids("ZENCEFİL")) === JSON.stringify(["r1"]), "3. seviye başlık + içerik → kök konu TEK KEZ (çöpteki konu hariç)", ids("ZENCEFİL"));
ok(JSON.stringify(ids("magnezyum")) === JSON.stringify(["r2"]), "içerik kutusunda eşleşme", ids("magnezyum"));
ok(JSON.stringify(ids("bronş")) === JSON.stringify(["r3"]), "görsel açıklamasında eşleşme", ids("bronş"));
ok(JSON.stringify(ids("probiyotik")) === JSON.stringify(["r4"]) && JSON.stringify(ids("yilmaz")) === JSON.stringify(["r4"]), "kaynak başlığı/yazarında eşleşme");
ok(JSON.stringify(ids("astim")) === JSON.stringify(["r3"]) && JSON.stringify(ids("ASTIM")) === JSON.stringify(["r3"]), "astım ↔ astim ↔ ASTIM");
ok(JSON.stringify(ids("ishal")) === JSON.stringify(["r4"]) && JSON.stringify(ids("İSHAL")) === JSON.stringify(["r4"]), "İshal ↔ ishal ↔ İSHAL");
ok(ids("melatonin").length === 0, "çöpteki alt başlığın kutusu aranmaz");
ok(JSON.stringify(ids("drenaj")) === JSON.stringify(["r5"]), "çöpteki kutu hariç, canlı kutu bulunur");
ok(ids("bulunmayan-kelime").length === 0, "sonuç yok");
ok(ids("a").length === 0, "tek harf sorgu → arama yok");
ok(JSON.stringify(ids("i")) === "[]" && ids("ri").length >= 1, "çok harfli genel sorgu birden fazla konu bulur");
const multi = ids("la");
ok(multi.length >= 2 && new Set(multi).size === multi.length, "birden fazla konuda eşleşme, tekrar yok", multi);
ok(nodeHasMatch(idx, "r1b", "zencefil") && !nodeHasMatch(idx, "r1a", "zencefil"), "başlık düzeyinde eşleşme işareti yalnız ilgili başlıkta");

console.log("\n4) Türkçe alfabetik sıra");
const order = libraryRoots(ws).map((n) => n.title.trim());
ok(order.indexOf("cilt kuruluğu") < order.indexOf("Çarpıntı"), "C < Ç", order);
ok(order.indexOf("Çarpıntı") < order.indexOf("İshal"), "Ç < İ", order);
ok(order.indexOf("İshal") < order.indexOf("Ödem") && order.indexOf("Ödem") < order.indexOf("Şiddetli Öksürük") && order.indexOf("Şiddetli Öksürük") < order.indexOf("Uyku"), "İ < Ö < Ş < U", order);
ok(order.indexOf("astım") < order.indexOf("Boşluklu Başlık"), "küçük harf başlık doğru yerde (a < B)", order);
ok(order.indexOf("2. Mineral") < order.indexOf("10. Vitamin"), "sayısal sıra (2 < 10)", order);
ok(!order.includes("Silinmiş Konu"), "çöpteki ana konu listede yok");
ok(searchRoots(ws, idx, "ı").length === 0, "tek harf ı aranmaz");
const sorted = [{ id: "b", title: "şeker" }, { id: "a", title: "Sağlık" }, { id: "c", title: "sabun" }].sort(compareTitlesTr).map((x) => x.title);
ok(JSON.stringify(sorted) === JSON.stringify(["sabun", "Sağlık", "şeker"]), "S < Ş; büyük/küçük harf sırayı bozmaz", sorted);
ok(initialOf("öksürük") === "Ö" && initialOf("ishal") === "İ" && initialOf("ılık") === "I" && initialOf("10. Vitamin") === "#", "baş harf grubu Türkçe büyük harf");

console.log("\n5) Ölçek");
{
  const big: Workspace = { ownerId: "u", nodes: [], blocks: [], links: [] };
  for (let i = 0; i < 3000; i++) {
    big.nodes.push(node(`n${i}`, null, `Konu ${i} ${i % 7 === 0 ? "Zerdeçal" : "Papatya"}`));
    big.nodes.push(node(`n${i}c`, `n${i}`, `Alt ${i}`));
    big.blocks.push(block(`b${i}`, `n${i}c`, "Notlar", "uzun metin ".repeat(40) + (i % 11 === 0 ? "kurkumin" : "")));
  }
  const t0 = Date.now();
  const bi = buildSearchIndex(big);
  const t1 = Date.now();
  const r = searchRoots(big, bi, "kurkumin");
  const t2 = Date.now();
  ok(r.length === Math.ceil(3000 / 11), "3000 konu: doğru sonuç sayısı", r.length);
  ok(t1 - t0 < 3000 && t2 - t1 < 800, `3000 konu + 3000 kutu: dizin ${t1 - t0} ms, sorgu ${t2 - t1} ms`);
}

console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
