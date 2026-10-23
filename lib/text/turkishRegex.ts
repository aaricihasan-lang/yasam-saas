/**
 * Türkçe büyük/küçük harf duyarsız, LİTERAL eşleşen PostgreSQL regex'i (`~*`, PostgREST `imatch`). SAF.
 *
 * Kök neden (prod, en_US.UTF-8): ILIKE iki tarafı `lower()` ile küçültür; `lower('I')` = "i" (ı değil),
 * `lower('İ')` iki karakter → "Işık"/"IŞIK"/"ışık", "İnci"/"inci" ILIKE ile güvenilir eşleşmez.
 * Çözüm: i/İ/ı/I harflerinin HER BİRİ `[iİıI]` sınıfına çevrilir; diğer harfleri `~*` eşler. Regex
 * özel karakterleri köşeli parantezle literal yapılır → kullanıcı girdisi joker/desen DEĞİL (ReDoS yok).
 *
 * Algoritma `lib/dogaltas/stonesListFetch.ts` buildTurkishInsensitiveRegex ile BİREBİR aynıdır
 * (sunucu route'ları istemci API modülünü içe aktarmasın diye saf kopya; eşdeğerlik testle kilitli:
 * scripts/bug016-bio-tr-search/routes.harness.ts).
 */
const TR_I_FAMILY = /[iİıI]/;
const TR_I_CLASS = "[iİıI]";
const REGEX_BRACKET_LITERAL = new Set([".", "$", "|", "?", "*", "+", "[", "{", "}"]);
const REGEX_DROP = /[\\^"]/g;

export function buildTurkishInsensitiveRegex(safeTerm: string, maxLength = 120): string | null {
  const cleaned = safeTerm.replace(REGEX_DROP, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned).slice(0, maxLength);
  let out = "";
  for (const ch of chars) {
    if (TR_I_FAMILY.test(ch)) out += TR_I_CLASS;
    else if (ch === "]") out += "[]]";
    else if (REGEX_BRACKET_LITERAL.has(ch)) out += `[${ch}]`;
    else out += ch;
  }
  return out.trim() ? out : null;
}
