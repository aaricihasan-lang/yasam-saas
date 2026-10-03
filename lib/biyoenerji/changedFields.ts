/**
 * A3 — kayıp güncelleme (lost update) dar çözümü: düzenleme formu yalnız, form AÇILDIĞI
 * ANDAKİ değerden farklı olan alanları gönderir. Başka sekmede değiştirilmiş bir alan bu
 * kullanıcı tarafından dokunulmadıysa PATCH'e girmez → üzerine eski değer yazılmaz.
 *
 * Her iki taraf da AYNI payload üreticisinden geçer (trim / boş → null / "" kuralları alan
 * bazında aynen korunur); kullanıcının bir alanı gerçekten boşaltması da "değişiklik" sayılır.
 * Aynı alanı iki kişinin eşzamanlı değiştirmesi (CAS) kapsam dışıdır: son yazan kazanır.
 */
export function changedFields<T extends Record<string, unknown>>(next: T, original: T | null): Partial<T> {
  if (!original) return next;
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (!Object.is(next[key], original[key])) out[key] = next[key];
  }
  return out;
}
