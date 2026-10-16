// Astroloji — MÜKERRER DOĞUM PROFİLİ eşleşmesi (SAF; sunucu + test). 2026-10-16.
//
// Amaç yalnız HATIRLATMA: aynı kişinin profili zaten varsa uzman uyarılır; ikinci profil YASAKLANMAZ (aynı ad, tarih,
// saat ve yerde doğmuş iki farklı kişi olabilir). Yüzde benzerlik YOK — yalnız KESİN eşleşme:
//   • Ad soyad: Türkçe güvenli normalize (astroNorm: İ/ı, büyük-küçük, boşluk) EŞİT. Profil adındaki " — natal" gibi
//     ek açıklama ayırıcıdan sonra atılır. Eşleştirilmiş Danışan Yolculuğu kaydının adı da aday addır.
//   • Doğum tarihi (gün/ay/yıl) EŞİT.
//   • Saat: ikisi de bilinmiyor → eşit sayılır; biri bilinip diğeri bilinmiyor → FARKLI. İkisi de biliniyorsa saat:dakika
//     EŞİT ve saat doğruluğu (resmî kayıt / yaklaşık / rektifiye…) AYNI olmalı (yaklaşık ≠ kesin).
//   • Konum: kararlı konum kimliği EŞİT; ya da (aynı yerin farklı kimlik/yazılışı — eski kayıt, Ç/C, büyük-küçük) yer adı
//     normalize EŞİT ve koordinatlar fiilen AYNI (≤ 1e-4° ≈ 11 m). Yalnız koordinat yetmez: veri setindeki "vekil"
//     ilçeler il merkezi koordinatını taşır → farklı yer adı = farklı konum. Yakınlık (aynı il, komşu ilçe…) eşleşme DEĞİLDİR.
//   • Saat dilimi (IANA) EŞİT ve çözülmüş UTC doğum anı dakikada EŞİT (yaz saati / tarihsel ofset seçimi farklıysa farklı an).

import { astroNorm } from "../search/normalize";

export type BirthIdentity = {
  birthDate: string; // YYYY-MM-DD
  birthTime: string | null; // HH:mm[:ss]
  timeKnown: boolean;
  timeAccuracy: string;
  locationId: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  birthUtc: string; // ISO
};

/** Koordinatların "aynı nokta" sayıldığı sınır (veri setleri ≤4 ondalık; yakınlık eşleşmesi DEĞİL). */
export const SAME_COORD_DEG = 1e-4;

/** "Ali Yılmaz — natal" → "ali yilmaz". Boş/anlamsız ad → "" (eşleşmeye katılmaz). */
export function personNameKey(v: string | null | undefined): string {
  const head = (v ?? "").split(/\s[—–-]\s/)[0] ?? "";
  return astroNorm(head);
}

/** Aday ad anahtarları (profil adı + eşleştirilmiş danışan adı), boşlar atılır. */
export function nameKeys(...names: (string | null | undefined)[]): string[] {
  return [...new Set(names.map(personNameKey).filter((k) => k.length > 0))];
}

export function sameName(a: string[], b: string[]): boolean {
  return a.some((k) => b.includes(k));
}

const hhmm = (t: string | null) => (t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null);
const utcMinute = (iso: string) => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 60_000) : null;
};

export function sameBirthIdentity(a: BirthIdentity, b: BirthIdentity): boolean {
  if (a.birthDate !== b.birthDate) return false;
  if (a.timeKnown !== b.timeKnown) return false;
  if (a.timeKnown) {
    const ta = hhmm(a.birthTime);
    if (ta === null || ta !== hhmm(b.birthTime)) return false;
    if (a.timeAccuracy !== b.timeAccuracy) return false;
  }
  if (a.timezone !== b.timezone) return false;
  const ua = utcMinute(a.birthUtc);
  if (ua === null || ua !== utcMinute(b.birthUtc)) return false;
  if (a.locationId !== "" && a.locationId === b.locationId) return true;
  const place = (l: string) => astroNorm(l.split(",")[0]);
  return (
    place(a.locationLabel) !== "" &&
    place(a.locationLabel) === place(b.locationLabel) &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(b.latitude) &&
    Math.abs(a.latitude - b.latitude) <= SAME_COORD_DEG &&
    Math.abs(a.longitude - b.longitude) <= SAME_COORD_DEG
  );
}

/** "Farklı kişi olarak devam et" onayı: istemcinin gördüğü eşleşme kimlikleri (en çok 50 UUID). */
export function parseDuplicateAck(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)).slice(0, 50).map((x) => x.toLowerCase());
}
