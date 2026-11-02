// KAMPANYA MERKEZİ — D-2 (Owner kararı 03.11): yorum KAPALI iken ekran / API / rapor metninde değerlendirme veya yönlendirme
// ifadesi bulunmamalı. Testlerin ortak sözlüğü (bağımsız kehanet; uygulama koduyla paylaşılmaz).
// Hesap verisi, teknik başlık ve nesnel eşleşme ("iki sistem aynı sonuçta", sayılar, burçlar) serbesttir.
const B = "(?<![\\p{L}\\p{N}])";
const A = "(?![\\p{L}\\p{N}])";
const T = ["çok uygun", "uygun(dur|suz|sun| değil| görül\\p{L}*)?", "uyumlu", "uyumsuz", "zorlayıcı", "tavsiye", "öneril\\p{L}*", "önerir", "kaçın\\p{L}*", "olumlu", "olumsuz",
  "şanslı", "şanssız", "uğurlu", "uğursuz", "hayırlı", "hayırsız", "zararlı", "faydalı", "dikkat", "sakının", "mükemmel", "kötü", "iyi", "elverişli", "elverişsiz",
  "fortunate", "unfortunate", "excellent", "avoid", "favou?rable", "auspicious", "inauspicious", "benefic", "malefic", "recommend\\p{L}*", "caution", "good", "bad"];
export const EVAL_RE = new RegExp(`${B}(${T.join("|")})${A}`, "iu");

/** Metindeki değerlendirme ifadeleri (bağlamıyla). */
export function evalHits(text: string, allow: readonly RegExp[] = []): string[] {
  const out: string[] = [];
  const re = new RegExp(EVAL_RE.source, "giu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const ctx = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, " ");
    if (!allow.some((a) => a.test(ctx))) out.push(ctx);
  }
  return out;
}
