/**
 * Bütüncül Numeroloji kaydındaki doğum tarihi metni → YYYY-MM-DD (YALNIZ GÖSTERİM / eşleşme uyarısı).
 *
 * 30.10.2026 denetimi: canlıda 108 kaydın tamamında doğum tarihi VAR; 20'si "GG.AA.YYYY", 88'i "/" ayraçlı.
 * Karşılaştırma ekranı yalnız YYYY-MM-DD tanıdığı için "—" gösteriyordu (veri eksik değil, sunum hatası).
 * Yorum kuralı Bütüncül motoruyla AYNIDIR (lib/numeroloji/methodology.ts birthDateForEngine: "/" ve "-" → ".",
 * gün önce). Mevcut kayıt DEĞİŞTİRİLMEZ; geçersiz / tanınmayan metin → null (tarih UYDURULMAZ).
 */
export function legacyBirthIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s);
  let y: number, m: number, d: number;
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const dm = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    if (!dm) return null;
    d = Number(dm[1]);
    m = Number(dm[2]);
    y = Number(dm[3]);
  }
  if (y < 1800 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
