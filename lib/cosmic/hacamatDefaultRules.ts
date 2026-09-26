/**
 * lib/cosmic/hacamatDefaultRules.ts
 *
 * KOZMİK AJANDA / HACAMAT — VARSAYILAN BAŞLANGIÇ KURALLARI (TEK KAYNAK / single source of truth)
 *
 * ÜRÜN KARARI (B MODELİ): Her yeni uzman Hacamat Kuralları bölümünü İLK kez açtığında
 * BOŞ ekranla başlamaz; sistemin tanımladığı bu 12 başlangıç kuralının UZMANA ÖZEL fiziksel
 * KOPYASI (kendi tenant'ında ayrı satırlar) oluşturulur. Bu 12 kural GLOBAL/PAYLAŞILAN kayıt
 * DEĞİLDİR — her tenant'ın kendi satırları vardır; biri değişirse/silinirse diğerleri etkilenmez.
 *
 * TEK KAYNAK: Bu dizi, yeni tenant seed'inin TEK doğruluk kaynağıdır. Aynı 12 metin başka
 * dosyalarda KOPYALANMAZ (drift yasağı). Server (app/api/hacamat/rules GET) bu sabiti
 * `ensure_hacamat_rules_seeded(p_tenant_id, p_rules)` RPC'sine JSONB olarak geçirir; içerik
 * yalnızca burada tutulur (SQL'e gömülmez). Metin, tarihsel ilk-seed migration'ı
 * (20260618000000_hacamat_rules.sql) ile BİREBİR aynıdır — o migration DONMUŞ tarihtir
 * (sistem sahibinin mevcut satırlarını üretmiştir); ileriye dönük kaynak BURASIDIR.
 *
 * NOT: "Varsayılanlara dön / geri yükle" ÖZELLİĞİ YOKTUR. Seed yalnız ilk initialization'da
 * bir kez olur; uzman tümünü silerse varsayılanlar KENDİLİĞİNDEN geri gelmez (bkz. migration
 * hacamat_rules_init tablosu + RPC no-reseed sözleşmesi).
 */

export type HacamatDefaultCategory = "before" | "after" | "general";

export type HacamatDefaultRule = {
  category: HacamatDefaultCategory;
  rule_text: string;
  sort_order: number;
};

/** Değişmez (immutable) başlangıç kuralları — 6 "öncesi" + 6 "sonrası" = 12. */
export const DEFAULT_HACAMAT_RULES: readonly HacamatDefaultRule[] = [
  { category: "before", rule_text: "Hacamat gününden 2 gün öncesinde hayvansal gıda diyetine girilecek. (Yumurta, et ve süt içeren tüm gıdalar yenmeyecek.)", sort_order: 1 },
  { category: "before", rule_text: "Hacamat gününden 1 gün öncesinden cinsel ilişkiye girilmeyecek.", sort_order: 2 },
  { category: "before", rule_text: "Hacamat saatinden en az 4 saat öncesinden yeme kesilecek. Aşırıya kaçılmamak kaydıyla su içilebilir. Hacamat aç karna yapılacak. Tok karna hacamat hastalık yapar.", sort_order: 3 },
  { category: "before", rule_text: "Fıtık rahatsızlığı, hepatit, kalp rahatsızlığı ve vücudunda platin varsa hacamattan önce mutlaka söylenecek.", sort_order: 4 },
  { category: "before", rule_text: "Kan sulandırıcı kullanılıyor ise söylenecek.", sort_order: 5 },
  { category: "before", rule_text: "Hacamattan hemen önce duş alınmayacak.", sort_order: 6 },
  { category: "after", rule_text: "Hacamattan sonra en az 3 saat hiçbir şey yenmeyecek, su aşırıya kaçılmadan içilebilir. Hacamat sonrası hemen yemek yemek hastalık yapar.", sort_order: 1 },
  { category: "after", rule_text: "Hacamattan sonra en az 3 saat uyunmayacak.", sort_order: 2 },
  { category: "after", rule_text: "Hacamattan sonra 24 saat cinsel ilişkiye girilmeyecek.", sort_order: 3 },
  { category: "after", rule_text: "Hacamattan sonra 24 saat duş/banyo yapılmayacak.", sort_order: 4 },
  { category: "after", rule_text: "Hacamattan sonra 2 gün hayvansal gıda yenmeyecek.", sort_order: 5 },
  { category: "after", rule_text: "Hacamattan sonra iki gün ağır spor yapılmayacak, ağır kaldırılmayacak.", sort_order: 6 },
] as const;

/** Toplam varsayılan kural adedi (seed doğrulaması / test için). */
export const DEFAULT_HACAMAT_RULE_COUNT = DEFAULT_HACAMAT_RULES.length; // 12
