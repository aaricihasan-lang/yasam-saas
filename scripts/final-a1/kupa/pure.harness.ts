/**
 * FINAL-A1 — Kupa & Hacamat: SAF mantık testleri (DB/ağ/prod YOK).
 *   - Protokol listesi arama: başlık + kategori + ETİKET (Türkçe İ/ı katlama)
 *   - Kaydedilmemiş-değişiklik (kirli) mantığı: form / şablon seçimi / gün paneli
 *   - Atıf kaynağı: serbest ad → yeniden kullanım kuralı; öneri yalnız kendi kaynakları
 * Çalıştır: npx tsx scripts/final-a1/kupa/pure.harness.ts
 */
import { protocolMatchesQuery } from "../../../app/kupa/lib/protocolSearch";
import { anyDirty, formValuesDiffer, openFormDirty, templateSelectionDirty } from "../../../app/kupa/lib/formDirty";
import { findReusableSourceByName, ownSourceSuggestions } from "../../../lib/cupping/ownSources";

let pass = 0;
let fail = 0;
function eq<T>(actual: T, expected: T, name: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  → beklenen ${e}, gelen ${a}`}`);
}

async function main() {
  console.log("── 5) Protokol arama (başlık + kategori + etiket) ──");
  {
    const P = [
      { id: "a", title: "Migren Protokolü", category: "Baş Bölgesi", tags: ["baş ağrısı", "ense"] },
      { id: "b", title: "Bel Fıtığı", category: "Sırt", tags: ["IŞIK TEDAVİSİ", "İstanbul eğitimi"] },
      { id: "c", title: "Genel Detoks", category: null, tags: null },
      { id: "d", title: "Diz", category: undefined, tags: ["kupa", "  "] },
    ];
    const ids = (q: string) => P.filter((p) => protocolMatchesQuery(p, q)).map((p) => p.id);
    eq(ids("migren"), ["a"], "başlık eşleşmesi (harf duyarsız)");
    eq(ids("sırt"), ["b"], "kategori eşleşmesi");
    eq(ids("ense"), ["a"], "etiket eşleşmesi (başlık/kategoride yok)");
    eq(ids("baş ağrı"), ["a"], "etiket içinde kısmi eşleşme");
    eq(ids("ışık"), ["b"], "Türkçe: 'ışık' ↔ etiket 'IŞIK TEDAVİSİ'");
    eq(ids("tedavi"), ["b"], "Türkçe: 'tedavi' ↔ 'TEDAVİSİ' (İ→i)");
    eq(ids("istanbul"), ["b"], "Türkçe: 'istanbul' ↔ 'İstanbul'");
    eq(ids("ISTANBUL"), ["b"], "Türkçe: büyük 'ISTANBUL' (I→ı≡i) ↔ 'İstanbul'");
    eq(ids("KUPA"), ["d"], "büyük harf sorgu ↔ küçük etiket");
    eq(ids("baş"), ["a"], "başlık+kategori+etiket aynı kayıtta → tek sonuç");
    eq(ids("yok-boyle-bir-sey"), [], "eşleşme yok → boş");
    eq(ids(""), ["a", "b", "c", "d"], "boş sorgu → hepsi");
    eq(ids("   "), ["a", "b", "c", "d"], "yalnız boşluk → hepsi");
    eq(ids("ense,kupa"), [], "etiketler birleştirilip sınır aşılmaz (sahte eşleşme yok)");
    eq(ids("detoks"), ["c"], "kategori/etiket null → başlık yine çalışır");
  }

  console.log("\n── 6) Kirli mantığı (yalnız gerçek değişiklik) ──");
  {
    const base = { title: "Şablon", before_text: "a", makeDefault: false };
    eq(formValuesDiffer({ ...base }, base), false, "aynı değerler → temiz");
    eq(formValuesDiffer({ ...base, title: "Şablon  " }, base), false, "yalnız baş/son boşluk → temiz");
    eq(formValuesDiffer({ ...base, title: "Şablon 2" }, base), true, "metin değişti → kirli");
    eq(formValuesDiffer({ ...base, makeDefault: true }, base), true, "checkbox değişti → kirli");
    eq(formValuesDiffer({ ...base, extra: "x" }, base), true, "yeni alana değer → kirli");
    eq(formValuesDiffer({ ...base, extra: "" }, base), false, "yeni alan boş → temiz");
    eq(openFormDirty(null, base), false, "kapalı form ASLA kirli değil");
    eq(openFormDirty({ title: "", note: "" }, { title: "", note: "" }), false, "yeni boş form açıldı, dokunulmadı → temiz");
    eq(openFormDirty({ title: "x", note: "" }, { title: "", note: "" }), true, "yeni forma yazıldı → kirli");
    eq(openFormDirty({ title: "", note: "" }, null), false, "taban yok + boş form → temiz");

    eq(templateSelectionDirty("t1", "t1"), false, "şablon: aynı seçim → temiz");
    eq(templateSelectionDirty("t2", "t1"), true, "şablon: farklı seçim → kirli");
    eq(templateSelectionDirty(null, "t1"), true, "şablon: bağlantı kaldırıldı → kirli");
    eq(templateSelectionDirty("t1", null), true, "şablon: yeni bağlandı → kirli");
    eq(templateSelectionDirty("", null), false, "şablon: '' ≡ null → temiz");
    eq(templateSelectionDirty(null, undefined), false, "şablon: null ≡ undefined → temiz");

    eq(anyDirty(false, false, false), false, "sayfa: hiçbir kaynak kirli değil → uyarı YOK");
    eq(anyDirty(false, true, false), true, "sayfa: tek kaynak kirli → uyarı");
    eq(anyDirty(), false, "sayfa: kaynak yok → temiz");

    // Gün paneli (DayEditPanel.dayStyleDirty) — renk null↔"" eşdeğer, boşluk değişiklik sayılmaz.
    const { dayStyleDirty } = await import("../../../app/kupa/takvim/components/DayEditPanel");
    const init = { colorKey: null, label: "", note: "" };
    eq(dayStyleDirty({ ...init }, init), false, "gün: açılıp dokunulmadı → temiz");
    eq(dayStyleDirty({ ...init, colorKey: "rose" as never }, init), true, "gün: renk seçildi → kirli");
    eq(dayStyleDirty({ ...init, label: "  " }, init), false, "gün: yalnız boşluk → temiz");
    eq(dayStyleDirty({ ...init, note: "not" }, init), true, "gün: not yazıldı → kirli");
    const saved = { colorKey: "sky" as never, label: "Sünnet", note: "x" };
    eq(dayStyleDirty({ ...saved }, saved), false, "gün (kayıtlı): değişmedi → temiz");
    eq(dayStyleDirty({ ...saved, label: "Sünnet " }, saved), false, "gün (kayıtlı): sona boşluk → temiz");
    eq(dayStyleDirty({ ...saved, label: "" }, saved), true, "gün (kayıtlı): açıklama silindi → kirli");
  }

  console.log("\n── 4) Atıf kaynağı: serbest ad + yalnız kendi önerileri ──");
  {
    const src = [
      { id: "own1", source_name: "Ahmet Hoca Eğitim Notu" },
      { id: "sys1", source_name: "Sistem Sahibi Kataloğu", origin_source_id: "x", transferred_at: "2026-01-01" },
      { id: "sys2", source_name: "Admin Kitabı", origin_type: "admin_transfer" },
      { id: "own2", source_name: "İbn Sina Notları" },
    ];
    eq(ownSourceSuggestions(src, ""), ["Ahmet Hoca Eğitim Notu", "İbn Sina Notları"], "öneri: yalnız kendi (aktarılmış/sistem YOK)");
    eq(ownSourceSuggestions(src, "kata"), [], "öneri: sistem kataloğu aransa bile gelmez");
    eq(ownSourceSuggestions(src, "admin"), [], "öneri: admin aktarımı aransa bile gelmez");
    eq(findReusableSourceByName(src, "  ahmet   hoca eğitim NOTU ")?.id, "own1", "yeniden kullanım: kendi aynı adlı kaynağı (boşluk/harf duyarsız)");
    eq(findReusableSourceByName(src, "İBN SİNA NOTLARI")?.id, "own2", "yeniden kullanım: Türkçe büyük harf");
    eq(findReusableSourceByName(src, "Sistem Sahibi Kataloğu")?.id, "sys1", "aynı tenant'ta birebir aynı ad → mükerrer master üretilmez (protokol akışıyla aynı)");
    eq(findReusableSourceByName(src, "Yeni Kaynak"), null, "yeni ad → null (oluşturulacak)");
    eq(findReusableSourceByName(src, "   "), null, "boş ad → null");
    const dupe = [
      { id: "sysA", source_name: "Ortak Ad", transferred_at: "2026-01-01", origin_source_id: "o" },
      { id: "ownA", source_name: "ortak ad" },
    ];
    eq(findReusableSourceByName(dupe, "Ortak Ad")?.id, "ownA", "aynı ad hem aktarılmış hem kendi → KENDİ kaynağı öncelikli");
  }

  console.log(`\nFINAL-A1 Kupa saf harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main();
