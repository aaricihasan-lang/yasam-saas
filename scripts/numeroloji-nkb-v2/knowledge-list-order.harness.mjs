/**
 * NKB-V2-J1 — Numeroloji Bilgi Bankası Kayıt Listesi kanonik sıralama harness'ı.
 *
 * GERÇEK production comparator'ı çalıştırır (knowledgeListOrder.ts) — kaynak kodda
 * string arayan sahte test DEĞİL, ikinci implementasyon YOK. Node 24 native TS
 * type-stripping ile .ts doğrudan import edilir (validate-helpers.mjs ile aynı kalıp).
 *
 * Çalıştır: node scripts/numeroloji-nkb-v2/knowledge-list-order.harness.mjs
 * FAIL > 0 → exit 1, FAIL = 0 → exit 0.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORDER = pathToFileURL(
  join(HERE, "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers", "knowledgeListOrder.ts"),
).href;

const mod = await import(ORDER);
const { sortKnowledgeRows, compareKnowledgeRows, compareValue } = mod;

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${ok || !detail ? "" : " :: " + detail}`);
  if (ok) pass++;
  else fail++;
}

// Fixture satır üreticisi (gerçek BilgiBankaListeSatir alt kümesi + ekstra alanlar).
let autoId = 0;
function row(analizTuruKey, deger, kayitTuru = "aciklama", extra = {}) {
  autoId += 1;
  return {
    id: extra.id ?? `${kayitTuru}:auto-${autoId}`,
    recordId: `rec-${autoId}`,
    analizTuruKey,
    analizTuru: analizTuruKey,
    deger,
    kayitTuru,
    guncellemeTarihi: extra.guncellemeTarihi ?? "2020-01-01T00:00:00.000Z",
    tenant_id: extra.tenant_id,
    ...extra,
  };
}
// Sıralı çıktının belirleyici imzası.
const sig = (rows) => rows.map((r) => `${r.analizTuruKey}#${r.deger}#${r.kayitTuru}`);
const eqArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 1) KARIŞIK KAYITLAR
{
  const input = [
    row("hayat-yolu", "3"),
    row("ana-kulvar", "1"),
    row("yan-kulvar", "5"),
    row("ana-kulvar", "3"),
    row("ana-kulvar", "2"),
  ];
  const out = sortKnowledgeRows(input).map((r) => `${r.analizTuru} ${r.deger}`);
  const exp = ["ana-kulvar 1", "ana-kulvar 2", "ana-kulvar 3", "yan-kulvar 5", "hayat-yolu 3"];
  check("1 karışık kayıtlar kanonik sıraya girer", eqArr(out, exp), out.join(" | "));
}

// 2) SONRADAN EKLENEN ANA KULVAR (id/tarih giriş sırasından bağımsız doğru yer)
{
  const input = [
    row("ana-kulvar", "1", "aciklama", { id: "aciklama:aaa", guncellemeTarihi: "2020-01-01T00:00:00Z" }),
    row("ana-kulvar", "2", "aciklama", { id: "aciklama:bbb", guncellemeTarihi: "2020-01-02T00:00:00Z" }),
    row("ana-kulvar", "3", "aciklama", { id: "aciklama:ccc", guncellemeTarihi: "2020-01-03T00:00:00Z" }),
    // 4 ve 5 sonradan eklenmiş: id ve tarih olarak en "yeni"/"son" ama value doğru yeri belirler.
    row("ana-kulvar", "5", "aciklama", { id: "aciklama:zzz9", guncellemeTarihi: "2026-12-31T00:00:00Z" }),
    row("ana-kulvar", "4", "aciklama", { id: "aciklama:zzz8", guncellemeTarihi: "2026-12-30T00:00:00Z" }),
  ];
  const out = sortKnowledgeRows(input).map((r) => r.deger);
  check("2 sonradan eklenen Ana Kulvar 4/5 doğru yere oturur", eqArr(out, ["1", "2", "3", "4", "5"]), out.join(","));
}

// 3) TYPE RANK (unknown dahil)
{
  const input = [
    row("diger", "x"),
    row("element", "Ateş | AZ Destek"),
    row("cakra-omurga", "1. Çakra | AZ Destek"),
    row("hayat-yolu", "1"),
    row("ifade-sayisi", "1"),
    row("yan-kulvar", "1"),
    row("ana-kulvar", "1"),
    row("gelecek-tur", "1"), // bilinmeyen
  ];
  const out = sortKnowledgeRows(input).map((r) => r.analizTuruKey);
  const exp = ["ana-kulvar", "yan-kulvar", "ifade-sayisi", "hayat-yolu", "cakra-omurga", "element", "diger", "gelecek-tur"];
  check("3 type rank sırası exact (Ana→Yan→İfade→Hayat→Çakra→Element→Diğer→unknown)", eqArr(out, exp), out.join(">"));
}

// 3b) PIN slotu statik sözleşme: Hayat Yolu(40) ile Çakra(60) arasında 50 boş; anahtar YOK.
{
  // Davranışsal kanıt: bilinmeyen "pin-kodu" anahtarı unknown(90) gibi davranır (fake key eklenmemiş).
  const a = row("hayat-yolu", "1");
  const pin = row("pin-kodu", "1");
  const cakra = row("cakra-omurga", "1. Çakra | AZ Destek");
  const out = sortKnowledgeRows([cakra, pin, a]).map((r) => r.analizTuruKey);
  // hayat-yolu(40) < cakra-omurga(60) < pin-kodu(bilinmeyen=90): PIN gerçek anahtar olmadığından sona düşer.
  check("3b PIN teknik anahtarı YOK (bilinmeyen gibi sona düşer; 50 slotu rezerve/comment)",
    eqArr(out, ["hayat-yolu", "cakra-omurga", "pin-kodu"]), out.join(">"));
}

// 4) DOĞAL SAYI SIRASI
{
  const vals = ["9", "33", "2", "11", "1", "22", "10", "3", "19"];
  const out = sortKnowledgeRows(vals.map((v) => row("ana-kulvar", v))).map((r) => r.deger);
  check("4 doğal sayı sırası 1,2,3,9,10,11,19,22,33", eqArr(out, ["1", "2", "3", "9", "10", "11", "19", "22", "33"]), out.join(","));
}

// 5) LEXICAL HATA YOK
{
  const out = sortKnowledgeRows(["1", "10", "11", "2"].map((v) => row("ana-kulvar", v))).map((r) => r.deger);
  check("5 lexical hata yok: 1,10,11,2 → 1,2,10,11", eqArr(out, ["1", "2", "10", "11"]), out.join(","));
}

// 6) BİLEŞİK DEĞERLER (ana sayı birincil)
{
  const vals = ["48/3", "22", "12/3", "20/2", "19/1", "13/4", "29/11", "33", "14/5", "23/5", "21/3", "32/5"];
  const out = sortKnowledgeRows(vals.map((v) => row("hayat-yolu", v))).map((r) => r.deger);
  const exp = ["12/3", "13/4", "14/5", "19/1", "20/2", "21/3", "22", "23/5", "29/11", "32/5", "33", "48/3"];
  check("6 bileşik değerler ana sayıya göre sıralanır", eqArr(out, exp), out.join(","));
}

// 7) YALIN vs BİLEŞİK (aynı ana sayı → yalın önce)
{
  const out = sortKnowledgeRows([row("hayat-yolu", "22/4"), row("hayat-yolu", "22")]).map((r) => r.deger);
  check("7 yalın 22, bileşik 22/4'ten önce gelir", eqArr(out, ["22", "22/4"]), out.join(","));
}

// 8) ÇAKRA
{
  const vals = [
    "10. Çakra | FAZLA Destek",
    "2. Çakra | AZ Destek",
    "1. Çakra | FAZLA Destek",
    "1. Çakra | AZ Destek",
    "10. Çakra | AZ Destek",
  ];
  const out = sortKnowledgeRows(vals.map((v) => row("cakra-omurga", v))).map((r) => r.deger);
  const exp = [
    "1. Çakra | AZ Destek",
    "1. Çakra | FAZLA Destek",
    "2. Çakra | AZ Destek",
    "10. Çakra | AZ Destek",
    "10. Çakra | FAZLA Destek",
  ];
  check("8 çakra: numara sayısal + AZ<FAZLA (10 lexical hatası yok)", eqArr(out, exp), out.join(" | "));
}

// 9) ELEMENT (Ateş→Su→Toprak→Hava, AZ→FAZLA)
{
  const shuffled = [
    "Hava | FAZLA Destek",
    "Su | AZ Destek",
    "Ateş | FAZLA Destek",
    "Toprak | AZ Destek",
    "Ateş | AZ Destek",
    "Hava | AZ Destek",
    "Su | FAZLA Destek",
    "Toprak | FAZLA Destek",
  ];
  const out = sortKnowledgeRows(shuffled.map((v) => row("element", v))).map((r) => r.deger);
  const exp = [
    "Ateş | AZ Destek",
    "Ateş | FAZLA Destek",
    "Su | AZ Destek",
    "Su | FAZLA Destek",
    "Toprak | AZ Destek",
    "Toprak | FAZLA Destek",
    "Hava | AZ Destek",
    "Hava | FAZLA Destek",
  ];
  check("9 element: Ateş→Su→Toprak→Hava, her birinde AZ→FAZLA", eqArr(out, exp), out.join(" | "));
}

// 10) ARAMA/FİLTRE ALT KÜMESİ — relatif sıra korunur
{
  const full = sortKnowledgeRows([
    row("ana-kulvar", "1"),
    row("ana-kulvar", "2"),
    row("yan-kulvar", "5"),
    row("hayat-yolu", "3"),
    row("hayat-yolu", "12/3"),
  ]);
  const filtered = full.filter((r) => r.analizTuruKey === "hayat-yolu"); // filter sırayı bozmaz
  const out = filtered.map((r) => r.deger);
  check("10 filtre alt kümesi kanonik relatif sırayı korur", eqArr(out, ["3", "12/3"]), out.join(","));
}

// 11) TARİH BAĞIMSIZLIĞI (guncellemeTarihi tersine çevrilse de sonuç aynı)
{
  const base = [
    row("ana-kulvar", "1", "aciklama", { guncellemeTarihi: "2026-01-01T00:00:00Z" }),
    row("ana-kulvar", "2", "aciklama", { guncellemeTarihi: "2020-01-01T00:00:00Z" }),
    row("ana-kulvar", "3", "aciklama", { guncellemeTarihi: "2023-06-15T00:00:00Z" }),
  ];
  const reversedDates = base.map((r, i) => ({ ...r, guncellemeTarihi: `20${10 + i}-01-01T00:00:00Z` }));
  const a = sig(sortKnowledgeRows(base));
  const b = sig(sortKnowledgeRows(reversedDates));
  check("11 sonuç tarihe (guncellemeTarihi) bağımlı değil", eqArr(a, b) && eqArr(a.map((s) => s.split("#")[1]), ["1", "2", "3"]), a.join(","));
}

// 12) ADMIN/UZMAN ORTAK — aynı satır biçimi aynı sonucu üretir; tek export comparator
{
  const mk = () => [row("yan-kulvar", "2"), row("ana-kulvar", "9"), row("ana-kulvar", "10")];
  const adminOut = sig(sortKnowledgeRows(mk()));
  const uzmanOut = sig(sortKnowledgeRows(mk()));
  const singleComparator = typeof sortKnowledgeRows === "function" && typeof compareKnowledgeRows === "function";
  check("12 admin/uzman aynı comparator → aynı sonuç (tek ortak export)", eqArr(adminOut, uzmanOut) && singleComparator, adminOut.join(","));
}

// 13) TENANT KARIŞMAZ — comparator tenant alanını değiştirmez / sıralamada kullanmaz
{
  const input = [
    row("ana-kulvar", "2", "aciklama", { tenant_id: "T-A" }),
    row("ana-kulvar", "1", "aciklama", { tenant_id: "T-B" }),
  ];
  const out = sortKnowledgeRows(input);
  const tenantPreserved = out.every((r) => r.tenant_id === (r.deger === "1" ? "T-B" : "T-A"));
  const orderByValueNotTenant = out.map((r) => r.deger).join(",") === "1,2";
  check("13 tenant alanı değişmez ve sıralamayı etkilemez", tenantPreserved && orderByValueNotTenant);
}

// 14) UNKNOWN TYPE — bilinenlerden sonra; kendi aralarında Türkçe doğal
{
  const input = [
    row("zeta-tur", "1"),
    row("ana-kulvar", "1"),
    row("çile-tur", "1"),
    row("alfa-tur", "1"),
  ];
  const out = sortKnowledgeRows(input).map((r) => r.analizTuruKey);
  // ana-kulvar önce; sonra bilinmeyenler Türkçe alfabetik: alfa < çile < zeta
  check("14 unknown type'lar bilinenden sonra + Türkçe doğal sıralı",
    out[0] === "ana-kulvar" && eqArr(out.slice(1), ["alfa-tur", "çile-tur", "zeta-tur"]), out.join(">"));
}

// 15) AYNI TYPE/VALUE — aciklama önce dogaltas; aynı türde id son bağlayıcı
{
  const input = [
    row("hayat-yolu", "3", "dogaltas", { id: "dogaltas:x" }),
    row("hayat-yolu", "3", "aciklama", { id: "aciklama:x" }),
    row("hayat-yolu", "3", "aciklama", { id: "aciklama:a" }),
  ];
  const out = sortKnowledgeRows(input).map((r) => `${r.kayitTuru}:${r.id.split(":")[1]}`);
  // aynı value → aciklama'lar (id: a, x) önce, sonra dogaltas
  check("15 aynı type/value: aciklama→dogaltas yan yana, id deterministik son bağlayıcı",
    eqArr(out, ["aciklama:a", "aciklama:x", "dogaltas:x"]), out.join(" | "));
}

// 16) NULL/BOŞ DEĞER GÜVENLİĞİ — crash yok, deterministik
{
  let crashed = false;
  let out1 = [], out2 = [];
  try {
    const weird = [
      row("ana-kulvar", ""),
      row("ana-kulvar", "5"),
      row("hayat-yolu", undefined),
      row("element", null),
      row("cakra-omurga", "bozuk-format"),
      row("diger", "  "),
    ];
    out1 = sig(sortKnowledgeRows(weird));
    out2 = sig(sortKnowledgeRows([...weird].reverse()));
  } catch (e) {
    crashed = true;
    console.log("   (exception) " + (e && e.message));
  }
  check("16 null/boş/bozuk value crash etmez ve deterministik", !crashed && eqArr(out1, out2), out1.join(","));
}

// 16b) SAF: sortKnowledgeRows girdiyi mutate etmez
{
  const input = [row("ana-kulvar", "3"), row("ana-kulvar", "1"), row("ana-kulvar", "2")];
  const snapshot = input.map((r) => r.deger).join(",");
  const out = sortKnowledgeRows(input);
  check("16b sortKnowledgeRows girdiyi mutate etmez (saf)",
    input.map((r) => r.deger).join(",") === snapshot && out.map((r) => r.deger).join(",") === "1,2,3");
}

// 16c) compareValue simetri/determinizm (aynı çift her yönde tutarlı işaret)
{
  const a = "19/1", b = "20/2";
  const ab = compareValue("hayat-yolu", a, b);
  const ba = compareValue("hayat-yolu", b, a);
  check("16c compareValue anti-simetrik (sgn(a,b) = -sgn(b,a))", ab < 0 && ba > 0, `${ab}/${ba}`);
}

console.log("\n============================================================");
const total = pass + fail;
console.log(`TOTAL ${total}`);
console.log(`PASS  ${pass}`);
console.log(`FAIL  ${fail}`);
console.log("============================================================");
process.exit(fail > 0 ? 1 : 0);
