/**
 * D2 (05.11.2026) — Bütüncül Numeroloji mükerrer kayıt tespiti (SAF; ağ / DB yok).
 *
 * Aynı ad + soyad + tam doğum tarihi ile kaydedilmiş analizleri bulur. Yalnız UYARI içindir:
 * kayıt engellenmez, birleştirilmez, üzerine yazılmaz. Liste, sunucunun tenant kapsamlı
 * `/api/numeroloji/analyses?fields=summary` yanıtıdır (kullanıcının zaten görebildiği kayıtlar).
 *
 * Normalizasyon (bilinçli olarak dar):
 *   • Unicode NFC (birleşik/ayrık "İ" vb. aynı karaktere iner).
 *   • Baş/son boşluk atılır, ardışık boşluklar tek boşluğa iner.
 *   • Büyük/küçük harf Türkçe kurala göre katlanır (tr-TR): "IŞIK" = "Işık", "İLKER" = "ilker".
 *   • Ç/C, Ş/S, Ğ/G, Ö/O, Ü/U, İ/I ve I/ı AYRI harflerdir — eşitlenmez. Tire ve noktalama korunur.
 *   • Doğum tarihi gün/ay/yıl sayısal karşılaştırılır: "01.01.1950" = "1/1/1950" = "01-01-1950".
 */

export type DuplicateCandidate = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  created_at?: string | null;
};

/** Ad / soyad karşılaştırma anahtarı. Boş → "". */
export function normalizePersonPart(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

/** Doğum tarihi anahtarı "G.A.YYYY" (sıfır dolgusuz). Geçersiz / eksik → null (eşleşme üretmez). */
export function normalizeBirthDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(/[./-]/);
  if (parts.length !== 3 || !parts.every((p) => /^\d{1,4}$/.test(p.trim()))) return null;
  const [d, m, y] = parts.map((p) => Number(p.trim()));
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${d}.${m}.${y}`;
}

/**
 * Aynı ad + soyad + doğum tarihine sahip kayıtlar (en yeni önce). Girdinin herhangi bir alanı
 * boş / geçersizse boş liste döner (yanlış pozitif yok).
 */
export function findDuplicateRecords<T extends DuplicateCandidate>(
  rows: readonly T[] | null | undefined,
  input: { name: string; surname: string; birthDate: string },
): T[] {
  const name = normalizePersonPart(input.name);
  const surname = normalizePersonPart(input.surname);
  const birth = normalizeBirthDateKey(input.birthDate);
  if (!name || !surname || !birth || !Array.isArray(rows)) return [];
  return rows
    .filter(
      (r) =>
        r &&
        typeof r.id === "string" &&
        normalizePersonPart(r.name) === name &&
        normalizePersonPart(r.surname) === surname &&
        normalizeBirthDateKey(r.birth_date) === birth,
    )
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

/** Mevcut kaydın açılacağı adres (yeni sekmede açılır; mevcut çalışma kaybolmaz). */
export function recordDetailHref(id: string): string {
  return `/numeroloji/liste/${encodeURIComponent(id)}`;
}
