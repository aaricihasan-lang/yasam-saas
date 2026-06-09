/**
 * Doğaltaş arama yardımcıları.
 *
 * Tüm normalize/eşleştirme mantığı burada — büyük component'lere gömülmez.
 * Supabase'e cast/JSON ifadesi gönderilmez; JSON/dizi alanları yalnızca
 * buradaki client-side fonksiyonlarla filtrelenir.
 */

// ─── Türkçe Normalizasyon ────────────────────────────────────────────────────

/**
 * Metni Türkçe karakter ve büyük/küçük harf farkı olmadan karşılaştırılabilir
 * forma çevirir.
 *
 * Dönüşümler: ç→c  ğ→g  ı→i  İ→i  ö→o  ş→s  ü→u
 * Ayrıca NFD + combining mark temizliği yapılır (é→e gibi).
 */
export function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Türkçe normalize ederek `haystack` içinde `needle` arar.
 * "boğaz" ile "bogaz", "çakra" ile "cakra" eşleşir.
 */
export function containsTr(
  haystack: string | null | undefined,
  needle: string,
): boolean {
  if (!haystack || !needle) return false;
  return normalizeTr(haystack).includes(normalizeTr(needle));
}

// ─── Assignments JSON Yardımcıları ──────────────────────────────────────────

type AssignmentsObj = Record<string, [string, ...unknown[]][]>;

function parseAssignments(raw: unknown): AssignmentsObj {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as AssignmentsObj;
}

/**
 * `assignments` JSON'undan belirli bölümlerin değerlerini çıkarır.
 * Bölüm eşleştirmesi Türkçe normalize ile yapılır.
 *
 * Örnek: getAssignmentSection(assignments, "burc", "burç", "astroloj")
 *   → "Koç", "Akrep" gibi değerler döner
 */
function getAssignmentSection(
  raw: unknown,
  ...sectionPatterns: string[]
): string[] {
  const obj = parseAssignments(raw);
  const results: string[] = [];

  for (const [key, rows] of Object.entries(obj)) {
    const keyNorm = normalizeTr(key);
    const matches = sectionPatterns.some((p) => keyNorm.includes(normalizeTr(p)));
    if (!matches) continue;

    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (Array.isArray(row) && row.length > 0 && row[0]) {
        results.push(String(row[0]));
      }
    }
  }

  return results;
}

// ─── Filtre Kontrolleri ──────────────────────────────────────────────────────

/**
 * Taşın astrolojik atamasında (Burçlar / Astrolojik Atama) verilen burç var mı?
 * Türkçe normalize ile karşılaştırılır.
 */
export function stoneMatchesZodiac(
  assignments: unknown,
  zodiac: string,
): boolean {
  if (!zodiac) return true;
  const values = getAssignmentSection(assignments, "burc", "burç", "astroloj");
  const needleNorm = normalizeTr(zodiac);
  return values.some((v) => {
    const vNorm = normalizeTr(v);
    return vNorm === needleNorm || vNorm.includes(needleNorm) || needleNorm.includes(vNorm);
  });
}

/**
 * Taşın mineral atamasında verilen mineral adı var mı?
 * Türkçe normalize ile substring araması yapar.
 */
export function stoneMatchesMineral(
  assignments: unknown,
  mineral: string,
): boolean {
  if (!mineral) return true;
  const values = getAssignmentSection(assignments, "mineral");
  return values.some((v) => containsTr(v, mineral));
}

/**
 * Taşın herhangi bir uyarısı var mı?
 * warning_text veya warning_tags doluysa uyarılı kabul edilir.
 */
export function stoneHasWarning(
  warningText: string | null | undefined,
  warningTags: unknown,
): boolean {
  const hasText = (warningText ?? "").trim().length > 0;
  const hasTags = Array.isArray(warningTags) && warningTags.length > 0;
  return hasText || hasTags;
}

/**
 * İçerik modunda client-side metin araması.
 * stone_name ve short_description aranır (extended fetch'te mevcut alanlar).
 */
export function stoneMatchesContentSearch(
  stoneName: string,
  shortDesc: string | null | undefined,
  query: string,
): boolean {
  if (!query) return true;
  return containsTr(stoneName, query) || containsTr(shortDesc, query);
}
