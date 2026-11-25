/**
 * Doğaltaş standart taş adı GÖSTERİM eşlemesi — birim harness'i (I18N-F1-R3, D4).
 *
 * Kilitler:
 *   - TR arayüz: her yardımcı girdiyi BİREBİR döndürür (kütüphane name_tr, demo/uzman adı, arama filtresi aynı).
 *   - EN arayüz: kütüphanede name_en birincil; demo vitrin taşında yalnız YÜKSEK güvenli ad eşlenir.
 *   - Kullanıcının oluşturduğu taş adı (demo kimliği olmayan) değişmez — aynı ad "AMETİST" olsa bile.
 *   - Belirsiz / uzman onaylı adlar (AGAT, GRANAT, PEMBE KUVARS, Oniks…) Türkçe kalır.
 *   - Uzman kaydı eşlemesi bayrağı KAPALI ve hiçbir ekrana bağlı değil.
 *   - EN arama genişletmesi: tam/önek eşleşme, TR'de boş; regex literal kalır (enjeksiyon yok).
 *   - Demo eşleme tablosu fikstürle (lib/demo/demoDogaltasFixture.ts) birebir tutarlı.
 * DB/ağ gerektirmez. Çalıştır: npx tsx scripts/dogaltas-stone-names/harness.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  DEMO_STONE_EN_NAMES,
  EXPERT_STANDARD_NAME_MAPPING_ENABLED,
  STONE_SEARCH_VARIANTS_MAX,
  expertStandardStoneDisplayName,
  libraryStoneName,
  libraryStoneSecondaryName,
  sortLibraryItemsForLocale,
  stoneRecordDisplayName,
  stoneSearchTrVariants,
} from "../../lib/dogaltas/stoneNames";
import { STANDARD_STONE_NAMES } from "../../lib/dogaltas/stoneNamesData";
import { buildStonesListSearchOrFilter } from "../../lib/dogaltas/stonesListFetch";
import { DEMO_STONES_SEED } from "../../lib/demo/demoDogaltasFixture";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(name);
  }
}

// ─── 1. Kütüphane kartı ───────────────────────────────────────────────────────────────────────────
{
  const card = { slug: "kaplan-gozu", name_tr: "Kaplan Gözü", name_en: "Tigers Eye" };
  ok("KÜTÜPHANE TR: name_tr birebir", libraryStoneName(card, "tr") === "Kaplan Gözü");
  ok("KÜTÜPHANE TR: alt satır name_en (bugünkü davranış)", libraryStoneSecondaryName(card, "tr") === "Tigers Eye");
  // B1 (Owner teknik standardı): "Tigers Eye" EN GÖSTERİMDE "Tiger's Eye"; kaynak nesne/alan değişmez, TR alt satır birebir.
  ok("KÜTÜPHANE EN: name_en birincil, gösterimde Tiger's Eye", libraryStoneName(card, "en") === "Tiger's Eye");
  ok("KÜTÜPHANE EN: kaynak name_en değişmedi (Tigers Eye)", card.name_en === "Tigers Eye");
  ok("KÜTÜPHANE EN: boşluklu kaynak da düzeltilir", libraryStoneName({ name_tr: "Kaplan Gözü", name_en: "  Tigers Eye " }, "en") === "Tiger's Eye");
  ok("KÜTÜPHANE EN: yalnız birebir eşleşme (benzer yazım aynen)", libraryStoneName({ name_tr: "X", name_en: "Tigers Eye Blue" }, "en") === "Tigers Eye Blue" && libraryStoneName({ name_tr: "X", name_en: "tigers eye" }, "en") === "tigers eye");
  ok("KÜTÜPHANE EN: zaten doğru yazım aynen", libraryStoneName({ name_tr: "Kaplan Gözü", name_en: "Tiger's Eye" }, "en") === "Tiger's Eye");
  ok("KÜTÜPHANE EN: EN sıralama düzeltilmiş adla", sortLibraryItemsForLocale([{ slug: "z", name_tr: "Z", name_en: "Topaz" }, card], "en")[0] === card);
  ok("KÜTÜPHANE EN: alt satır Türkçe ad", libraryStoneSecondaryName(card, "en") === "Kaplan Gözü");
  ok("KÜTÜPHANE EN: name_en boş → name_tr", libraryStoneName({ name_tr: "Ametist", name_en: "  " }, "en") === "Ametist" && libraryStoneName({ name_tr: "Ametist", name_en: null }, "en") === "Ametist");
  ok("KÜTÜPHANE TR: name_en boş/aynı → alt satır yok", libraryStoneSecondaryName({ name_tr: "Ametist", name_en: "" }, "tr") === null && libraryStoneSecondaryName({ name_tr: "Opal", name_en: "Opal" }, "tr") === null);
  ok("KÜTÜPHANE EN: aynı ad → alt satır yok", libraryStoneSecondaryName({ name_tr: "Opal", name_en: "Opal" }, "en") === null);
  ok("KÜTÜPHANE bilinmeyen dil → TR davranışı", libraryStoneName(card, "de") === "Kaplan Gözü" && libraryStoneName(card, undefined) === "Kaplan Gözü");
  const items = [
    { slug: "ametist", name_tr: "Ametist", name_en: "Amethyst" },
    { slug: "yesim", name_tr: "Yeşim", name_en: "Jade" },
    { slug: "akuamarin", name_tr: "Akuamarin", name_en: "Aquamarine" },
    { slug: "citrin", name_tr: "Sitrin", name_en: "Citrine" },
  ];
  ok("SIRA TR: aynı dizi referansı (sunucu sırası değişmez)", sortLibraryItemsForLocale(items, "tr") === items);
  ok("SIRA EN: İngilizce ada göre", sortLibraryItemsForLocale(items, "en").map((x) => x.slug).join(",") === "ametist,akuamarin,citrin,yesim");
  ok("SIRA EN: girdi dizisi değişmez", items.map((x) => x.slug).join(",") === "ametist,yesim,akuamarin,citrin");
}

// ─── 2. Demo vitrin taşları ───────────────────────────────────────────────────────────────────────
{
  const seedById = new Map(DEMO_STONES_SEED.map((s) => [s.id, s.stone_name]));
  const entries = Object.entries(DEMO_STONE_EN_NAMES);
  ok("DEMO: 17 yüksek güvenli eşleme", entries.length === 17);
  ok("DEMO: her kimlik fikstürde var ve saklanan ad birebir", entries.every(([id, [tr]]) => seedById.get(id) === tr));
  for (const name of ["AGAT", "GRANAT", "PEMBE KUVARS"]) {
    const seed = DEMO_STONES_SEED.find((s) => s.stone_name === name);
    ok(`DEMO: ${name} (orta güven / uzman onayı) eşlenmez`, !!seed && !(seed.id in DEMO_STONE_EN_NAMES) && stoneRecordDisplayName(seed, "en") === name);
  }
  ok("DEMO: fikstür 20 taş = 17 eşlenen + 3 TR kalan", DEMO_STONES_SEED.length === 20);
  // Sözlükle tutarlılık: her EN demo adı yüksek güvenli sözlük kaydının EN adı.
  const enSet = new Set(STANDARD_STONE_NAMES.map((e) => e.en));
  ok("DEMO: EN adlar yüksek güvenli sözlükte", entries.every(([, [, en]]) => enSet.has(en)));
  const ametist = DEMO_STONES_SEED.find((s) => s.stone_name === "AMETİST")!;
  ok("DEMO TR: saklanan ad birebir", stoneRecordDisplayName(ametist, "tr") === "AMETİST");
  ok("DEMO EN: Amethyst", stoneRecordDisplayName(ametist, "en") === "Amethyst");
  ok("DEMO EN: Tiger's Eye (sözlük yazımı)", stoneRecordDisplayName({ id: "de5a0020-c11e-4000-8000-000000000008", stone_name: "KAPLAN GÖZÜ" }, "en") === "Tiger's Eye");
  ok("DEMO EN: demo kaydının adı değişmişse eşleme yok", stoneRecordDisplayName({ id: ametist.id, stone_name: "AMETİST (MOR)" }, "en") === "AMETİST (MOR)");
  ok("KULLANICI: aynı ad farklı kimlik → değişmez (EN)", stoneRecordDisplayName({ id: "11111111-2222-4333-8444-555555555555", stone_name: "AMETİST" }, "en") === "AMETİST");
  ok("KULLANICI: kimliksiz → değişmez", stoneRecordDisplayName({ stone_name: "AMETİST" }, "en") === "AMETİST" && stoneRecordDisplayName({ id: null, stone_name: "Benim Taşım" }, "en") === "Benim Taşım");
  ok("TR: her demo taşı birebir", DEMO_STONES_SEED.every((s) => stoneRecordDisplayName(s, "tr") === s.stone_name));
}

// ─── 3. Uzman kaydı eşlemesi (KAPALI) ─────────────────────────────────────────────────────────────
{
  ok("UZMAN: bayrak kapalı", EXPERT_STANDARD_NAME_MAPPING_ENABLED === false);
  ok("UZMAN: kapalıyken EN'de de girdi aynen", expertStandardStoneDisplayName("AMETİST", "en") === "AMETİST");
  ok("UZMAN (açık, test): tam eşleşme → Amethyst", expertStandardStoneDisplayName("AMETİST", "en", { enabled: true }) === "Amethyst");
  ok("UZMAN (açık, test): TR arayüz birebir", expertStandardStoneDisplayName("AMETİST", "tr", { enabled: true }) === "AMETİST");
  ok("UZMAN (açık, test): alt-dize eşleşmesi YOK", expertStandardStoneDisplayName("AMETİST KOLYE", "en", { enabled: true }) === "AMETİST KOLYE");
  ok("UZMAN (açık, test): belirsiz terim Oniks/Ay Taşı/Akik TR kalır", ["ONİKS", "Ay Taşı", "AKİK", "Lal Taşı", "Necef", "PEMBE KUVARS", "GRANAT"].every((n) => expertStandardStoneDisplayName(n, "en", { enabled: true }) === n));
  ok("UZMAN (açık, test): bilinmeyen ad aynen", expertStandardStoneDisplayName("Benim Özel Taşım", "en", { enabled: true }) === "Benim Özel Taşım");
  // Hiçbir ekran/route bu yardımcıyı çağırmaz.
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|mjs)$/.test(e) && readFileSync(p, "utf8").includes("expertStandardStoneDisplayName")) hits.push(p);
    }
  };
  for (const d of ["app", "components", "lib", "hooks"]) walk(resolve(ROOT, d));
  ok("UZMAN: yardımcı yalnız lib/dogaltas/stoneNames.ts içinde (ekrana bağlı değil)", hits.length === 1 && hits[0]!.replace(/\\/g, "/").endsWith("lib/dogaltas/stoneNames.ts"));
}

// ─── 4. Sözlük bütünlüğü ──────────────────────────────────────────────────────────────────────────
{
  ok("SÖZLÜK: kimlikler benzersiz", new Set(STANDARD_STONE_NAMES.map((e) => e.id)).size === STANDARD_STONE_NAMES.length);
  ok("SÖZLÜK: EN adında 'uzman' / parantez yok", STANDARD_STONE_NAMES.every((e) => !/uzman|\(/i.test(e.en)));
  ok("SÖZLÜK: orta/düşük güvenli kayıtlar yok (agat, garnet, pembe-kuvars, yesim)", ["agat", "garnet", "pembe-kuvars", "yesim"].every((id) => !STANDARD_STONE_NAMES.some((e) => e.id === id)));
}

// ─── 5. EN arama genişletmesi ─────────────────────────────────────────────────────────────────────
{
  ok("ARAMA TR: daima boş", stoneSearchTrVariants("amethyst", "tr").length === 0 && stoneSearchTrVariants("amethyst", undefined).length === 0);
  ok("ARAMA EN tam: amethyst → Ametist", stoneSearchTrVariants("amethyst", "en").includes("Ametist"));
  ok("ARAMA EN önek: ameth → Ametist", stoneSearchTrVariants("ameth", "en").includes("Ametist"));
  ok("ARAMA EN büyük/küçük + kesme işareti: TIGER'S EYE / tigers eye → Kaplan Gözü", stoneSearchTrVariants("TIGER'S EYE", "en").includes("Kaplan Gözü") && stoneSearchTrVariants("tigers eye", "en").includes("Kaplan Gözü"));
  ok("ARAMA EN: 2 harflik önek genişletmez", stoneSearchTrVariants("am", "en").length === 0);
  ok("ARAMA EN: eşleşmeyen terim → boş", stoneSearchTrVariants("zzqx", "en").length === 0);
  ok("ARAMA EN: Türkçe terim zaten aranır → ek yok", stoneSearchTrVariants("ametist", "en").length === 0);
  ok("ARAMA EN: üst sınır", stoneSearchTrVariants("bla", "en").length <= STONE_SEARCH_VARIANTS_MAX && stoneSearchTrVariants("s", "en").length === 0);
  ok("ARAMA EN: orta güvenli kayıt (garnet) genişletilmez", stoneSearchTrVariants("garnet", "en").length === 0);

  const trOr = buildStonesListSearchOrFilter("amethyst", "name");
  ok("FİLTRE TR: nameVariants yok/boş → birebir aynı", buildStonesListSearchOrFilter("amethyst", "name", { nameVariants: [] }) === trOr && trOr === 'stone_name.imatch."amethyst"');
  const enOr = buildStonesListSearchOrFilter("amethyst", "name", { nameVariants: stoneSearchTrVariants("amethyst", "en") }) ?? "";
  const val = /imatch\."([^"]*)"/.exec(enOr)?.[1] ?? "";
  const re = new RegExp(val, "i");
  ok("FİLTRE EN: AMETİST kaydı bulunur", re.test("AMETİST") && re.test("Amethyst"));
  ok("FİLTRE EN: ilgisiz kayıt bulunmaz", !re.test("KUVARS"));
  ok("FİLTRE EN: tek kolon (ad modu)", enOr.split(",").length === 1);
  const evil = buildStonesListSearchOrFilter("x", "content", { nameVariants: ['a"b', "c,d", "e(f)", "g|h.*", "\\i"] }) ?? "";
  const vals = [...evil.matchAll(/\.imatch\."([^"]*)"/g)].map((m) => m[1]!);
  ok("GÜVENLİK: kötü yazımlar değerde \" \\ , ( ) üretmez", vals.length === 15 && vals.every((v) => !/["\\,()]/.test(v)));
  ok("GÜVENLİK: yazımdaki | ve . literal (köşeli parantez)", vals.every((v) => v.includes("g[|]h[.][*]")));
}

// ── Sözlük takma ad temizliği (QA D4-02 / D4-03, QTM-DG-11) ─────────────────────
{
  const dup = STANDARD_STONE_NAMES.filter((e) => new Set(e.enAliases.map((a) => a.toLowerCase())).size !== e.enAliases.length).map((e) => e.id);
  ok("SÖZLÜK: hiçbir kayıtta yinelenen EN takma ad yok (Steatit 'Soapstone' tekil)", dup.length === 0);
  const abalone = STANDARD_STONE_NAMES.find((e) => e.id === "abalone");
  ok("SÖZLÜK: Abalone takma adlarında 'Mother-of-pearl' yok (sedef eşanlamlı değil)", Boolean(abalone) && !abalone!.enAliases.some((a) => /mother.of.pearl/i.test(a)));
  ok("SÖZLÜK: kayıt sayısı değişmedi (227)", STANDARD_STONE_NAMES.length === 227);
}

console.log(`\nDoğaltaş taş adı gösterim harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) {
  console.log("Başarısız:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("✓ TÜM KAPILAR GEÇTİ");
