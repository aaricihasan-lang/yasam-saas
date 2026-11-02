/**
 * KAMPANYA MERKEZİ — D-2 (Owner kararı 03.11.2026): YORUM KAPALI iken ekran sonucu, API yanıtı ve indirilebilir raporda
 * değerlendirme / yönlendirme ifadesi bulunmaz ("uyumlu / zorlayıcı", "olumlu / olumsuz", "kaçınılmalı", "tavsiye edilir",
 * "benefic / malefic"…). Hesaplanan sayılar, burç / ev / derece, açı türü, eşleşmeler ve hesap adımları KORUNUR.
 * Bu dosya SAF (IO yok); sunucu sonucu ve rapor modeli üretildikten SONRA, yalnız yorum kapalıyken uygulanır.
 */
import type { ResultBlock } from "./types";

/** Değerlendirme / yönlendirme sözlüğü (Türkçe + sağlayıcının İngilizce terimleri). Unicode harf sınırlarıyla. */
const W = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const TERMS = [
  "çok uygun", "uygun(?:dur|suz|suzdur|sun| değil| değildir| görülür)?", "uyumlu", "uyumsuz", "zorlayıcı", "tavsiye(?: edilir)?", "önerilir", "önerilmez",
  "kaçınılmalı", "kaçınılması önerilir", "kaçının", "olumlu", "olumsuz", "şanslı", "şanssız", "uğurlu", "uğursuz", "hayırlı", "hayırsız",
  "zararlı", "faydalı", "dikkat(?: işareti)?", "sakının", "mükemmel", "kötü", "elverişli", "elverişsiz", "iyicil", "kötücül",
  "fortunate", "unfortunate", "excellent", "avoid", "favou?rable", "unfavou?rable", "auspicious", "inauspicious", "benefic", "malefic",
  "recommended?", "caution", "harmonious", "challenging",
  // Bağımsız denetim (03.11): sağlayıcı uyum puanı ve Türkçeleştirilmiş benefik / malefik.
  "uyum puanı", "uyum yüzdesi", "uyum skoru", "compatib\\p{L}*", "benefik", "malefik",
];
export const EVALUATIVE_RE = new RegExp(`${W}(?:${TERMS.join("|")})${E}`, "iu");

/** Teknik katmandaki doğası gereği değerlendirme olan alan adları (değer ne olursa olsun yorum kapalıyken gösterilmez). */
export const EVALUATIVE_KEYS = new Set(["verdict", "compatible", "severity", "nature", "quality", "effect", "auspicious", "isAuspicious", "benefic", "malefic", "recommendation", "rating", "favorable"]);

/** Türkçe büyük harfler (İ/I) için önce tr küçük harfe çevrilir (i bayrağı "İyi"yi yakalamaz). */
export const isEvaluative = (s: unknown): boolean => typeof s === "string" && EVALUATIVE_RE.test(s.toLocaleLowerCase("tr-TR"));

/** Ekran blokları: değerlendirme içeren kv satırı / tablo sütunu / liste öğesi çıkarılır; boş kalan blok düşer. */
export function scrubEvaluativeBlocks(blocks: readonly ResultBlock[]): ResultBlock[] {
  const out: ResultBlock[] = [];
  for (const b of blocks) {
    if (b.type === "kv") {
      const rows = b.rows.filter(([k, v]) => !isEvaluative(k) && !isEvaluative(v));
      if (rows.length) out.push({ ...b, rows });
    } else if (b.type === "table") {
      const keep = b.head.map((h, i) => i === 0 || !(isEvaluative(h) || b.rows.some((r) => isEvaluative(r[i]))));
      const head = b.head.filter((_, i) => keep[i]);
      const rows = b.rows.map((r) => r.filter((_, i) => keep[i])).filter((r) => !isEvaluative(r[0]));
      if (head.length) out.push({ ...b, head, rows });
    } else if (b.type === "list") {
      const items = b.items.filter((x) => !isEvaluative(x));
      if (items.length) out.push({ ...b, items });
    } else if (!isEvaluative(b.text) && !isEvaluative(b.title)) out.push(b);
  }
  return out;
}
