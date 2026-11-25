/**
 * Doğaltaş — SİSTEMİN SUNDUĞU standart taş adlarının ekran diline göre GÖSTERİMİ (I18N-F1-R3, D4).
 *
 * İlke (Owner kararı): saklanan hiçbir değer değişmez — kütüphane `name_tr` / `name_en`, `stones.stone_name`,
 * `client_stones.stone_name`, `combination_stones.snapshot_name`, stok adı ve stok eşleme anahtarı olduğu gibi kalır.
 * Bu modül yalnız GÖRÜNEN adı seçer; kontrol akışı / kayıt / karşılaştırma asla bu çıktıya bağlanmaz.
 * Türkçe arayüzde her fonksiyon girdiyi BİREBİR döndürür.
 *
 * Kapsam:
 *   1. Doğaltaş Kütüphanesi kartları (sistem verisi): EN arayüzde `name_en` birincil (boşsa `name_tr`).
 *   2. Demo vitrin taşları (sabit sentetik kimlikli 20 kayıt): yalnız sözlükte YÜKSEK güvenli 17 ad eşlenir;
 *      AGAT / GRANAT / PEMBE KUVARS (orta güven + uzman onayı) Türkçe kalır. Kimlik + saklanan ad birlikte eşleşmeli
 *      (demo kaydının adı değişmişse eşleme yapılmaz).
 *   3. EN arayüzde uzman taş listesi araması: İngilizce standart ad (yüksek güven) tam/önek eşleşirse o taşın Türkçe
 *      yazımları aramaya alternatif olarak eklenir (`stoneSearchTrVariants`).
 *   4. Uzmanın KENDİ kayıtlarındaki standart adların eşlenmesi (`expertStandardStoneDisplayName`) Owner kararı
 *      bekliyor: tasarımı hazır, bayrak KAPALI ve hiçbir ekrana bağlı değildir.
 */
import { foldStoneLibraryText } from "@/lib/stone-library/fold";
import { STANDARD_STONE_NAMES, type StandardStoneNameEntry } from "./stoneNamesData";

/** Ekran dili: yalnız "en" eşleme yapar; diğer her değer (tr, bilinmeyen) girdiyi aynen döndürür. */
type LocaleLike = string | null | undefined;
const isEn = (locale: LocaleLike): boolean => locale === "en";

// ─── 1. Doğaltaş Kütüphanesi (sistem kartları) ─────────────────────────────────────────────────────

export type LibraryStoneNames = { name_tr: string; name_en?: string | null };

/**
 * EN GÖSTERİM katmanında kütüphane `name_en` yazım düzeltmeleri (Owner teknik standardı, I18N geniş geliştirme B1).
 * Kaynak alan (DB `stone_library.name_en`) DEĞİŞMEZ; yalnız EN ekranda görünen ad düzeltilir. Anahtar: kırpılmış
 * `name_en` ile BİREBİR (büyük/küçük harf dahil) eşleşme — benzer yazımlar / uzman kayıtları etkilenmez.
 */
const LIBRARY_EN_DISPLAY_FIXES: ReadonlyMap<string, string> = new Map([
  ["Tigers Eye", "Tiger's Eye"], // i18n-ignore: kanonik taş adı verisi (sözlük `kaplan-gozu` → "Tiger's Eye")
]);

/**
 * Kartın ekran dilindeki birincil adı. TR: `name_tr` (birebir). EN: `name_en` (boşsa `name_tr`); kaynak yazımı
 * yalnız `LIBRARY_EN_DISPLAY_FIXES` listesindeki birebir eşleşmeler için gösterimde düzeltilir.
 */
export function libraryStoneName(item: LibraryStoneNames, locale: LocaleLike): string {
  if (isEn(locale)) {
    const en = item.name_en?.trim();
    if (en) return LIBRARY_EN_DISPLAY_FIXES.get(en) ?? en;
  }
  return item.name_tr;
}

/** Birincil adın altında gösterilecek öbür dildeki ad (aynıysa / yoksa null). TR: `name_en`; EN: `name_tr`. */
export function libraryStoneSecondaryName(item: LibraryStoneNames, locale: LocaleLike): string | null {
  const primary = libraryStoneName(item, locale);
  const other = isEn(locale) ? item.name_tr : item.name_en ?? null;
  return other && other !== primary ? other : null;
}

/**
 * EN arayüzde kütüphane listesini görünen (İngilizce) ada göre sıralar; TR'de diziyi AYNEN (aynı referans) döndürür —
 * sunucunun Türkçe sırası değişmez. Kararlı: eş adlarda slug.
 */
export function sortLibraryItemsForLocale<T extends LibraryStoneNames & { slug: string }>(items: readonly T[], locale: LocaleLike): readonly T[] {
  if (!isEn(locale)) return items;
  return [...items].sort((a, b) => {
    const c = libraryStoneName(a, locale).localeCompare(libraryStoneName(b, locale), "en", { sensitivity: "base" });
    return c !== 0 ? c : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
}

// ─── 2. Demo vitrin taşları ───────────────────────────────────────────────────────────────────────

/**
 * Demo vitrin taşı kimliği → [saklanan ad (lib/demo/demoDogaltasFixture.ts), EN gösterim adı].
 * Yalnız sözlükte `guven = yuksek` ve uzman onayı gerektirmeyen 17 ad. Test: scripts/dogaltas/stone-names-harness.ts
 * fikstürle birebir tutarlılığı doğrular.
 */
// i18n-ignore: demo kimliği → saklanan kanonik ad eşlemesi (veri)
const DEMO_STONE_EN: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  "de5a0020-c11e-4000-8000-000000000002": ["AKUAMARİN", "Aquamarine"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000003": ["AMAZONİT", "Amazonite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000004": ["AMETİST", "Amethyst"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000005": ["FLORİT", "Fluorite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000007": ["HEMATİT", "Hematite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000008": ["KAPLAN GÖZÜ", "Tiger's Eye"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000009": ["KARNELYAN", "Carnelian"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-00000000000a": ["LABRADORİT", "Labradorite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-00000000000b": ["LAPİSLAZULİ", "Lapis Lazuli"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-00000000000c": ["LEPİDOLİT", "Lepidolite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-00000000000d": ["MALAHİT", "Malachite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-00000000000e": ["OBSİDYEN (SİYAH)", "Black Obsidian"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000010": ["PİRİT", "Pyrite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000011": ["RODOKROZİT", "Rhodochrosite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000012": ["SELENİT", "Selenite"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000013": ["SİTRİN", "Citrine"], // i18n-ignore: kanonik demo adı
  "de5a0020-c11e-4000-8000-000000000014": ["TURMALİN (SİYAH)", "Black Tourmaline"], // i18n-ignore: kanonik demo adı
});

/** Test/denetim için salt-okunur görünüm. */
export const DEMO_STONE_EN_NAMES = DEMO_STONE_EN;

/**
 * Taş kaydının ekran dilindeki görünen adı (taş listesi / detay başlığı / çekmece / hub araması).
 * TR: saklanan ad birebir. EN: yalnız demo vitrin kimliği + saklanan ad birebir eşleşirse sözlükteki EN ad;
 * kullanıcının oluşturduğu her taş (demo kimliği olmayan) adı AYNEN kalır.
 */
export function stoneRecordDisplayName(stone: { id?: string | null; stone_name: string }, locale: LocaleLike): string {
  if (!isEn(locale) || !stone.id) return stone.stone_name;
  const hit = DEMO_STONE_EN[stone.id];
  return hit && hit[0] === stone.stone_name ? hit[1] : stone.stone_name;
}

// ─── 3. EN arama genişletmesi ─────────────────────────────────────────────────────────────────────

/** Önek eşleşmesi için en kısa terim (daha kısası çok sayıda taşı genişletir). */
export const STONE_SEARCH_PREFIX_MIN = 4;
/** Bir aramaya eklenecek en çok Türkçe yazım (regex uzunluğu sınırı). */
export const STONE_SEARCH_VARIANTS_MAX = 6;

/** EN karşılaştırma anahtarı: kütüphane katlaması + boşluk/kesme işaretsiz ("Tiger's Eye" = "tigers eye" = "tigerseye"). */
const enKey = (s: string): string => foldStoneLibraryText(s).replace(/ /g, "");

/** Arama kökü: parantezli ek açıklama atılır ("KAPLAN GÖZÜ (TİGERAUGE)" → "KAPLAN GÖZÜ"); alt-dize araması bu kökle yeter. */
const searchStem = (s: string): string => s.replace(/\s*\(.*$/, "").trim();

type EnIndexEntry = { key: string; entry: StandardStoneNameEntry };
let enIndex: EnIndexEntry[] | null = null;
function getEnIndex(): EnIndexEntry[] {
  if (enIndex) return enIndex;
  const out: EnIndexEntry[] = [];
  for (const entry of STANDARD_STONE_NAMES) {
    for (const n of [entry.en, ...entry.enAliases]) {
      const key = enKey(n);
      if (key) out.push({ key, entry });
    }
  }
  enIndex = out;
  return out;
}

/**
 * EN arayüz araması için ek Türkçe yazımlar. Terim, yüksek güvenli bir standart taşın İngilizce adına (veya İngilizce
 * takma adına) TAM ya da ÖNEK (≥ 4 karakter; QA D4-01: kısa öneklerin filtre URL'sini şişirmemesi için) olarak eşleşirse o taşın Türkçe yazım kökleri döner; aksi hâlde boş dizi.
 * TR arayüzde DAİMA boş dizi (davranış birebir). Dönen değerler düz metindir — çağıran (stonesListFetch) her birini aynı
 * literal-regex kaçışından geçirir; kullanıcı girdisi desen olarak yorumlanmaz.
 */
export function stoneSearchTrVariants(term: string, locale: LocaleLike): string[] {
  if (!isEn(locale)) return [];
  const q = enKey(term ?? "");
  if (!q) return [];
  const prefixOk = q.length >= STONE_SEARCH_PREFIX_MIN;
  const seen = new Set<string>([foldStoneLibraryText(term)]);
  const out: string[] = [];
  const ids = new Set<string>();
  for (const { key, entry } of getEnIndex()) {
    if (ids.has(entry.id)) continue;
    if (!(key === q || (prefixOk && key.startsWith(q)))) continue;
    ids.add(entry.id);
    for (const raw of entry.tr) {
      const stem = searchStem(raw);
      const f = foldStoneLibraryText(stem);
      if (!stem || !f || seen.has(f)) continue;
      seen.add(f);
      out.push(stem);
      if (out.length >= STONE_SEARCH_VARIANTS_MAX) return out;
    }
  }
  return out;
}

// ─── 4. Uzman kayıtlarındaki standart adlar (Owner kararı bekliyor — KAPALI) ──────────────────────

/**
 * KAPALI: Owner "uzmanın kendi kaydındaki standart ad (AMETİST) EN arayüzde Amethyst görünsün mü?" kararını verene kadar
 * false kalır ve fonksiyon HİÇBİR ekrana bağlanmaz.
 */
export const EXPERT_STANDARD_NAME_MAPPING_ENABLED = false;

let trIndex: Map<string, StandardStoneNameEntry> | null = null;
function getTrIndex(): Map<string, StandardStoneNameEntry> {
  if (trIndex) return trIndex;
  const m = new Map<string, StandardStoneNameEntry>();
  const dup = new Set<string>();
  for (const entry of STANDARD_STONE_NAMES) {
    if (entry.ambiguousTr) continue; // belirsiz Türkçe terimler (Oniks, Ay Taşı, Kehribar…) otomatik eşlenmez
    for (const raw of entry.tr) {
      const k = foldStoneLibraryText(raw);
      if (!k) continue;
      const prev = m.get(k);
      if (prev && prev.id !== entry.id) dup.add(k);
      else m.set(k, entry);
    }
  }
  for (const k of dup) m.delete(k); // çakışan yazım hiçbir taşa eşlenmez (farklı mineraller birleştirilmez)
  trIndex = m;
  return m;
}

/**
 * Uzman kaydındaki ad, yüksek güvenli bir standart taşın Türkçe yazımıyla KATLANMIŞ TAM eşleşiyorsa EN adı; aksi hâlde
 * girdi aynen. Alt-dize eşleşmesi YOK ("Yosun Akik" ≠ "Akik"). `enabled` varsayılanı kapalı bayraktır.
 */
export function expertStandardStoneDisplayName(raw: string, locale: LocaleLike, opts: { enabled?: boolean } = {}): string {
  const enabled = opts.enabled ?? EXPERT_STANDARD_NAME_MAPPING_ENABLED;
  if (!enabled || !isEn(locale)) return raw;
  const hit = getTrIndex().get(foldStoneLibraryText(raw));
  return hit ? hit.en : raw;
}
