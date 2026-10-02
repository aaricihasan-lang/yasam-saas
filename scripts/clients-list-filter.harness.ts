/**
 * Danışan listesi filtre mantığı harness'ı (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/clients-list-filter.harness.ts
 *
 * Kapsam: lib/danisan/clientListFilter.ts
 *   - Türkçe alfabe (29 harf, sıra)
 *   - İlk Harf: I ≠ İ, C ≠ Ç, S ≠ Ş, küçük harf girdiler (i→İ, ı→I), NFD girdiler,
 *     boş ad → soyad (görünen isim), tamamen boş isim → eşleşmez
 *   - Arama (Türkçe-duyarsız) + burç/kan/mizaç + ilk harf birlikte
 *   - Aktif filtre sayısı
 */
import assert from "node:assert/strict";
import {
  TR_ALPHABET,
  clientInitialLetter,
  countActiveClientFilters,
  matchesClientFilters,
  matchesInitial,
  type ClientListFilterable,
  type ClientListFilters,
} from "../lib/danisan/clientListFilter";

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    fail++;
    console.log(`  ❌ ${name}\n     ${err instanceof Error ? err.message : String(err)}`);
  }
}

const c = (ad: string | null, soyad: string | null = null, extra: Partial<ClientListFilterable> = {}): ClientListFilterable => ({
  ad,
  soyad,
  telefon: null,
  burc: null,
  kan: null,
  mizac: null,
  ...extra,
});
const NO_FILTER: ClientListFilters = { search: "", burc: "", kan: "", mizac: "", initial: "" };

console.log("clients-list-filter harness");

test("TR_ALPHABET 29 harf, doğru sıra", () => {
  assert.equal(TR_ALPHABET.length, 29);
  assert.equal(
    TR_ALPHABET.join(" "),
    "A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z",
  );
  assert.ok(!TR_ALPHABET.includes("Q" as never));
  assert.ok(!TR_ALPHABET.includes("W" as never));
  assert.ok(!TR_ALPHABET.includes("X" as never));
});

test("İ / I ayrımı (büyük harf girdiler)", () => {
  assert.equal(clientInitialLetter("İlknur", null), "İ");
  assert.equal(clientInitialLetter("Işık", null), "I");
  assert.ok(matchesInitial(c("İlknur"), "İ"));
  assert.ok(!matchesInitial(c("İlknur"), "I"));
  assert.ok(matchesInitial(c("Işık"), "I"));
  assert.ok(!matchesInitial(c("Işık"), "İ"));
});

test("küçük harf girdiler tr-TR büyütülür (i→İ, ı→I)", () => {
  assert.equal(clientInitialLetter("ilknur", null), "İ");
  assert.equal(clientInitialLetter("ışık", null), "I");
  assert.equal(clientInitialLetter("çağla", null), "Ç");
  assert.equal(clientInitialLetter("şule", null), "Ş");
  assert.equal(clientInitialLetter("ömer", null), "Ö");
  assert.equal(clientInitialLetter("ülkü", null), "Ü");
  assert.equal(clientInitialLetter("ğ", null), "Ğ");
});

test("Ç / C ve Ş / S ayrı harfler", () => {
  assert.ok(matchesInitial(c("Çağla"), "Ç"));
  assert.ok(!matchesInitial(c("Çağla"), "C"));
  assert.ok(matchesInitial(c("Cem"), "C"));
  assert.ok(!matchesInitial(c("Cem"), "Ç"));
  assert.ok(matchesInitial(c("Şule"), "Ş"));
  assert.ok(!matchesInitial(c("Şule"), "S"));
  assert.ok(matchesInitial(c("Selin"), "S"));
});

test("NFD (ayrık) girdi NFC'ye çevrilir", () => {
  assert.equal(clientInitialLetter("Çağla", null), "Ç");
  assert.equal(clientInitialLetter("Şule", null), "Ş");
});

test("baştaki boşluk yok sayılır", () => {
  assert.equal(clientInitialLetter("   ayşe", null), "A");
});

test("boş ad → görünen isim (soyad) baş harfi", () => {
  assert.equal(clientInitialLetter(null, "Öztürk"), "Ö");
  assert.equal(clientInitialLetter("  ", "yılmaz"), "Y");
  assert.ok(matchesInitial(c("", "Öztürk"), "Ö"));
});

test("tamamen boş isim → null; harf seçiliyken eşleşmez, Tümü'de geçer", () => {
  assert.equal(clientInitialLetter(null, null), null);
  assert.equal(clientInitialLetter("", "  "), null);
  assert.ok(!matchesInitial(c(null, null), "A"));
  assert.ok(matchesInitial(c(null, null), ""));
});

test("ad öncelikli (soyad baş harfi kullanılmaz)", () => {
  assert.ok(matchesInitial(c("Ayşe", "Zengin"), "A"));
  assert.ok(!matchesInitial(c("Ayşe", "Zengin"), "Z"));
});

test("arama Türkçe-duyarsız + ilk harf birlikte", () => {
  const list = [
    c("İlknur", "Kaya", { telefon: "0555 111 22 33" }),
    c("Işıl", "Demir"),
    c("Ilgaz", "Çelik"),
  ];
  const r1 = list.filter((x) => matchesClientFilters(x, { ...NO_FILTER, search: "ilknur" }));
  assert.equal(r1.length, 1);
  const r2 = list.filter((x) => matchesClientFilters(x, { ...NO_FILTER, initial: "I" }));
  assert.deepEqual(r2.map((x) => x.ad), ["Işıl", "Ilgaz"]);
  const r3 = list.filter((x) => matchesClientFilters(x, { ...NO_FILTER, initial: "I", search: "celik" }));
  assert.deepEqual(r3.map((x) => x.ad), ["Ilgaz"]);
  const r4 = list.filter((x) => matchesClientFilters(x, { ...NO_FILTER, search: "111 22" }));
  assert.equal(r4.length, 1);
});

test("burç/kan/mizaç + ilk harf AND", () => {
  const list = [
    c("Ali", null, { burc: "Koç", kan: "A Rh+", mizac: "safra" }),
    c("Ayşe", null, { burc: "Koç", kan: "0 Rh-", mizac: "dem" }),
    c("Burak", null, { burc: "Koç", kan: "A Rh+", mizac: "safra" }),
  ];
  const r = list.filter((x) =>
    matchesClientFilters(x, { search: "", burc: "Koç", kan: "A Rh+", mizac: "safra", initial: "A" }),
  );
  assert.deepEqual(r.map((x) => x.ad), ["Ali"]);
  assert.equal(list.filter((x) => matchesClientFilters(x, NO_FILTER)).length, 3);
});

test("aktif filtre sayısı (boşluk-only arama sayılmaz)", () => {
  assert.equal(countActiveClientFilters(NO_FILTER), 0);
  assert.equal(countActiveClientFilters({ ...NO_FILTER, search: "   " }), 0);
  assert.equal(countActiveClientFilters({ ...NO_FILTER, search: "a", initial: "Ç" }), 2);
  assert.equal(
    countActiveClientFilters({ search: "x", burc: "Koç", kan: "A Rh+", mizac: "dem", initial: "İ" }),
    5,
  );
});

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
