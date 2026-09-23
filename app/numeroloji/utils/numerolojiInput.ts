/**
 * NUM-005 — Numeroloji motoru GİRİŞ SINIRI (input boundary).
 *
 * MOTOR MATEMATİĞİ LOCKED. Bu katman motora VERİ GİRMEDEN ÖNCE doğum tarihini tek
 * kanonik biçime (DD.MM.YYYY) getirir ve TAKVİM doğrular. Amaç:
 *   - DB'den gelen ISO (YYYY-MM-DD) + kullanıcı TR (DD.MM.YYYY / DD/MM/YYYY /
 *     DD-MM-YYYY) biçimlerini güvenle kabul etmek,
 *   - geçersiz/eksik/malformed tarihte motora HİÇ girmemek (bazı hesap dolu, bazısı
 *     0/null "yarım analiz" YASAK — ya tam sonuç ya temiz doğrulama hatası),
 *   - timezone kayması olmadan çalışmak (Date constructor KULLANILMAZ; doğum tarihi
 *     bir takvim tarihidir, gün timezone yüzünden kaymaz).
 *
 * lib/numeroloji DEĞİŞTİRİLMEZ; buradan yalnız SALT-OKUMA takvim doğrulayıcı
 * (isValidCalendarDate) kullanılır — motorun kendi parseBirthDate'i DD.MM.YYYY
 * bekler ve ISO'yu reddeder, bu yüzden normalize burada yapılır.
 */
import { isValidCalendarDate } from "@/lib/numeroloji";

const pad2 = (n: number): string => String(n).padStart(2, "0");

export type BirthDateParts = { day: number; month: number; year: number };

/**
 * Ham doğum tarihi metnini {day,month,year}'e çözer (ISO veya TR ailesi) ve TAKVİM
 * doğrular (31.02 / 32.13 / 30.02 / geçersiz artık-yıl → null). Geçersiz/boş → null.
 */
export function parseBirthDateFlexible(raw: unknown): BirthDateParts | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  let day: number;
  let month: number;
  let year: number;

  // ISO: YYYY-MM-DD (yalnız tireli, 4 haneli yıl ÖNDE).
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    // TR ailesi: DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY (gün ÖNDE, 4 haneli yıl SONDA).
    const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    if (!tr) return null;
    day = Number(tr[1]);
    month = Number(tr[2]);
    year = Number(tr[3]);
  }

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  // Motorun kendi takvim doğrulayıcısı (leap year + ay-gün + yıl aralığı).
  if (!isValidCalendarDate(day, month, year)) return null;
  return { day, month, year };
}

/**
 * Motora verilecek KANONİK doğum tarihi (DD.MM.YYYY) veya geçersizse "".
 *
 * Motorun parseBirthDate-tabanlı tüm hesapları (PIN/element/zirve/mücadele/değişim/
 * çakra) bu biçimi bekler; hayatYolu/kisiselYil zaten format-agnostiktir →
 * normalize sonrası TÜM hesaplar tutarlı ve TAM olur. Geçerli bir tarih için üretilen
 * kanonik biçim, aynı gerçek tarihin ISO ve TR gösteriminde AYNIdır (motor çıktısı
 * değişmez — yalnız daha önce ISO'da sıfırlanan hesaplar artık doğru hesaplanır).
 */
export function normalizeBirthDateForEngine(raw: unknown): string {
  const p = parseBirthDateFlexible(raw);
  if (!p) return "";
  return `${pad2(p.day)}.${pad2(p.month)}.${p.year}`;
}

/** Motora uygun (geçerli takvim) bir doğum tarihi mi? */
export function isEngineReadyBirthDate(raw: unknown): boolean {
  return parseBirthDateFlexible(raw) !== null;
}
