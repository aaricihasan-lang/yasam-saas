/**
 * NKB-V2-J1 — Numeroloji Bilgi Bankası Kayıt Listesi için KANONİK sıralama.
 *
 * Amaç: liste her açılışta deterministik ve aynı sırada görünür. Kayıt ekleme /
 * düzenleme zamanı (created_at / updated_at / guncellemeTarihi) HİÇBİR seviyede
 * sıralamaya girmez.
 *
 * Sıralama zinciri:
 *   1) analysis_type rank  (Ana→Yan→İfade→Hayat→[PIN slotu]→Çakra→Element→Diğer→bilinmeyen)
 *   2) domain-aware doğal value sırası (sayısal/bileşik · Çakra · Element · fallback)
 *   3) kayıt türü rank     (aciklama → dogaltas → bilinmeyen)
 *   4) stabil id           (deterministik son bağlayıcı)
 *
 * Saf: girdi mutate edilmez, yan etki yok, her durumda deterministik sonuç üretir.
 * NOT: Şu an sayfalama YOK; comparator birleşik TAM küme üzerinde çalışır. İleride
 * sayfalama eklenirse sıralama daima slicing / pagination ÖNCESİ uygulanmalıdır.
 */

/** Kanonik sıralama için gereken minimum satır şekli (BilgiBankaListeSatir bunu karşılar). */
export type KnowledgeSortRow = {
  analizTuruKey: string;
  deger: string;
  kayitTuru: string;
  id: string;
};

/**
 * analysis_type rank haritası (aralıklı; kullanıcıya gösterilmez, yalnız sıralama).
 * 50 = gelecekte PIN Kodu için ayrılmış slot — Hayat Yolu (40) ile Çakra Omurga (60)
 * arasında rezerve. Bu görevde PIN analysis_type'ı EKLENMEZ; gerçek teknik anahtar
 * tanımlandığında bu haritaya `"<pin-anahtarı>": 50` olarak eklenecektir.
 */
const TYPE_RANK: Record<string, number> = {
  "ana-kulvar": 10,
  "yan-kulvar": 20,
  "ifade-sayisi": 30,
  "hayat-yolu": 40,
  // 50 = gelecekte PIN Kodu için ayrılmış slot (bu görevde anahtar yok — uydurulmaz).
  "cakra-omurga": 60,
  element: 70,
  diger: 80,
};
const UNKNOWN_TYPE_RANK = 90;

/** Kayıt türü rank: açıklama kaydı önce, sonra doğaltaş ataması, sonra bilinmeyen. */
const KAYIT_TURU_RANK: Record<string, number> = {
  aciklama: 0,
  dogaltas: 1,
};
const UNKNOWN_KAYIT_TURU_RANK = 2;

/** Element domain sırası (kullanıcı kararı): Ateş → Su → Toprak → Hava (alfabetik DEĞİL). */
const ELEMENT_ORDER = ["ateş", "su", "toprak", "hava"];

/** Türkçe, sayı-duyarlı, büyük/küçük harfe duyarsız tek collator (genel metin + fallback). */
const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function typeRank(key: string): number {
  return TYPE_RANK[key] ?? UNKNOWN_TYPE_RANK;
}

function kayitTuruRank(kayitTuru: string): number {
  return KAYIT_TURU_RANK[kayitTuru] ?? UNKNOWN_KAYIT_TURU_RANK;
}

/** Deterministik, locale'den bağımsız stabil id karşılaştırması (son bağlayıcı). */
function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * "12/3" → { primary:12, secondary:3 } · "22" → { primary:22, secondary:null }.
 * Baş kısımda sayı yoksa primary=null (metin fallback'ine düşülür).
 */
function parseNumericValue(value: string): { primary: number | null; secondary: number | null } {
  const m = value.match(/^\s*(\d+)(?:\s*\/\s*(\d+))?/);
  if (!m) return { primary: null, secondary: null };
  const primary = Number.parseInt(m[1], 10);
  const secondary = m[2] !== undefined ? Number.parseInt(m[2], 10) : null;
  return {
    primary: Number.isNaN(primary) ? null : primary,
    secondary: secondary !== null && Number.isNaN(secondary) ? null : secondary,
  };
}

/** "3. Çakra | AZ Destek" → { chakra:3, destek:0 }. AZ<FAZLA. Format tutmuyorsa null. */
function parseCakra(value: string): { chakra: number; destek: number } | null {
  const m = value.match(/^\s*(\d+)\s*\.\s*Çakra\s*\|\s*(AZ|FAZLA)\b/i);
  if (!m) return null;
  const chakra = Number.parseInt(m[1], 10);
  if (Number.isNaN(chakra)) return null;
  return { chakra, destek: /^az$/i.test(m[2]) ? 0 : 1 };
}

/** "Toprak | FAZLA Destek" → { element:2, destek:1 }. AZ<FAZLA. Format tutmuyorsa null. */
function parseElement(value: string): { element: number; destek: number } | null {
  const m = value.match(/^\s*([^|]+?)\s*\|\s*(AZ|FAZLA)\b/i);
  if (!m) return null;
  const idx = ELEMENT_ORDER.indexOf(m[1].trim().toLocaleLowerCase("tr"));
  if (idx < 0) return null;
  return { element: idx, destek: /^az$/i.test(m[2]) ? 0 : 1 };
}

/**
 * Aynı analysis_type içinde iki value'yu domain-aware ve deterministik karşılaştırır.
 * Çakra/Element bilinen formatlarında domain sırası; sayısal/bileşik değerlerde ana
 * sayı → (yalın önce, sonra bileşik) → ikinci sayı; kalan her şeyde Türkçe collator.
 */
export function compareValue(typeKey: string, aRaw: string, bRaw: string): number {
  const a = asText(aRaw);
  const b = asText(bRaw);

  if (typeKey === "cakra-omurga") {
    const ca = parseCakra(a);
    const cb = parseCakra(b);
    if (ca && cb) return ca.chakra - cb.chakra || ca.destek - cb.destek || collator.compare(a, b);
    if (ca) return -1;
    if (cb) return 1;
    return collator.compare(a, b);
  }

  if (typeKey === "element") {
    const ea = parseElement(a);
    const eb = parseElement(b);
    if (ea && eb) return ea.element - eb.element || ea.destek - eb.destek || collator.compare(a, b);
    if (ea) return -1;
    if (eb) return 1;
    return collator.compare(a, b);
  }

  // Sayısal / bileşik (ana-kulvar · yan-kulvar · ifade-sayisi · hayat-yolu · genel).
  const na = parseNumericValue(a);
  const nb = parseNumericValue(b);
  if (na.primary !== null && nb.primary !== null) {
    if (na.primary !== nb.primary) return na.primary - nb.primary;
    // Aynı ana sayı: yalın (ikinci sayı yok) önce, sonra bileşik; iki bileşikte ikinci sayı.
    const aHasSecond = na.secondary !== null;
    const bHasSecond = nb.secondary !== null;
    if (aHasSecond !== bHasSecond) return aHasSecond ? 1 : -1;
    if (aHasSecond && bHasSecond && na.secondary !== nb.secondary) {
      return (na.secondary as number) - (nb.secondary as number);
    }
    return collator.compare(a, b);
  }
  if (na.primary !== null) return -1; // sayısal değer, metinsel değerden önce gelir
  if (nb.primary !== null) return 1;
  return collator.compare(a, b); // ikisi de metinsel → Türkçe doğal fallback
}

/** Kanonik satır karşılaştırıcı: type rank → value → kayıt türü rank → stabil id. */
export function compareKnowledgeRows(a: KnowledgeSortRow, b: KnowledgeSortRow): number {
  const aTypeKey = asText(a.analizTuruKey);
  const bTypeKey = asText(b.analizTuruKey);

  const byType = typeRank(aTypeKey) - typeRank(bTypeKey);
  if (byType !== 0) return byType;

  // Aynı rank fakat farklı anahtar YALNIZ bilinmeyen türlerde olur (hepsi UNKNOWN_TYPE_RANK).
  // Bu türler kendi aralarında Türkçe doğal ve deterministik sıralanır.
  if (aTypeKey !== bTypeKey) {
    const byUnknownKey = collator.compare(aTypeKey, bTypeKey);
    if (byUnknownKey !== 0) return byUnknownKey;
  }

  // Aynı tür: her iki değeri de o türün domain sırasına göre karşılaştır.
  const byValue = compareValue(aTypeKey, a.deger, b.deger);
  if (byValue !== 0) return byValue;

  const byKayitTuru = kayitTuruRank(asText(a.kayitTuru)) - kayitTuruRank(asText(b.kayitTuru));
  if (byKayitTuru !== 0) return byKayitTuru;

  return compareId(asText(a.id), asText(b.id));
}

/** Girdiyi MUTATE ETMEDEN kanonik sıralı yeni dizi döndürür. */
export function sortKnowledgeRows<T extends KnowledgeSortRow>(rows: readonly T[]): T[] {
  return [...rows].sort(compareKnowledgeRows);
}
