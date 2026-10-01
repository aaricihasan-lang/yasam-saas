/**
 * Danışan listesi filtre mantığı (saf, UI'dan bağımsız).
 *
 * `app/danisan-yolculugu/liste/page.tsx` bu modülü kullanır; harness:
 * `scripts/clients-list-filter.harness.ts`.
 *
 * İlk Harf filtresi Türkçe alfabeye göre çalışır: "I" ile "İ", "C" ile "Ç"
 * FARKLI harflerdir (normalizeTr kullanılmaz — o eşleme harfleri birleştirir).
 */
import { containsTr } from "@/lib/text/turkishSearch";

/** Türkçe alfabe (29 harf) — İlk Harf seçeneklerinin sırası. */
export const TR_ALPHABET = [
  "A", "B", "C", "Ç", "D", "E", "F", "G", "Ğ", "H", "I", "İ", "J", "K", "L",
  "M", "N", "O", "Ö", "P", "R", "S", "Ş", "T", "U", "Ü", "V", "Y", "Z",
] as const;

export type ClientListFilterable = {
  ad: string | null;
  soyad: string | null;
  telefon: string | null;
  burc: string | null;
  kan: string | null;
  mizac: string | null;
};

export type ClientListFilters = {
  search: string;
  burc: string;
  kan: string;
  mizac: string;
  /** Türkçe büyük harf (TR_ALPHABET) veya "" (Tümü). */
  initial: string;
};

/**
 * Danışanın baş harfi: ad (yoksa görünen isim = ad + soyad) ilk harfi,
 * `tr-TR` büyük harfe çevrilmiş. Boş isim → null.
 * NFC normalizasyonu: ayrık yazılmış "C + ̧" gibi girdiler "Ç" olarak okunur.
 */
export function clientInitialLetter(ad: string | null, soyad: string | null): string | null {
  const first = (ad ?? "").normalize("NFC").trim();
  const display = first || `${ad ?? ""} ${soyad ?? ""}`.normalize("NFC").trim();
  if (!display) return null;
  const ch = Array.from(display)[0];
  if (!ch) return null;
  // "i".toLocaleUpperCase("tr-TR") → "İ", "ı" → "I"; tek karakter garanti için ilk kod noktası.
  return Array.from(ch.toLocaleUpperCase("tr-TR"))[0] ?? null;
}

/** İlk Harf eşleşmesi; boş seçim (Tümü) her danışanı geçirir. */
export function matchesInitial(
  client: Pick<ClientListFilterable, "ad" | "soyad">,
  initial: string,
): boolean {
  if (!initial) return true;
  return clientInitialLetter(client.ad, client.soyad) === initial;
}

/** Tek danışan tüm filtrelerden geçiyor mu? (Arama Türkçe-duyarsız.) */
export function matchesClientFilters(c: ClientListFilterable, f: ClientListFilters): boolean {
  const q = f.search.trim();
  const fullName = `${c.ad || ""} ${c.soyad || ""}`;
  const searchOk = !q || containsTr(fullName, q) || containsTr(c.telefon, q);
  const burcOk = !f.burc || c.burc === f.burc;
  const kanOk = !f.kan || c.kan === f.kan;
  const mizacOk = !f.mizac || c.mizac === f.mizac;
  const initialOk = matchesInitial(c, f.initial);
  return searchOk && burcOk && kanOk && mizacOk && initialOk;
}

/** Aktif filtre sayısı (mobil "Filtrele" rozeti). */
export function countActiveClientFilters(f: ClientListFilters): number {
  return [f.search.trim(), f.burc, f.kan, f.mizac, f.initial].filter(Boolean).length;
}
