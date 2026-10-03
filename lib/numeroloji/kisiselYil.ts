import { NumerolojiResult } from "./ortak";
import { currentIstanbulYear } from "./currentYear";
import { nominalPersonalYear } from "./timing/personal";

/**
 * Kişisel Yıl (Danışan Yolculuğu ve diğer modüller için TEK GİRİŞ NOKTASI).
 *
 * METODOLOJİ KAYNAĞI: kitap 1. seviye PDF s.177 (basılı s.176) "KİŞİSEL YIL HESAPLAMA":
 *   "içinde bulunduğumuz seneye doğum gün ve ayınıza ilişkin sayıları ekleyin … çift taneli
 *   sayıları, bir ile dokuz arasında tek haneli kişisel yıl sayınız [olana] kadar birbirleriyle
 *   toplayın." Örnek 18.02.1987 / 2024 → 1+8+0+2+2+0+2+4 = 19 → 1+9 = 10 → 1.
 *   → 19 KORUNMAZ; sonuç her zaman 1–9 (kitap kişisel yıl anlamlarını yalnız 1–9 için verir).
 *
 * NUM-F03: Bu fonksiyon önceden 11/19/22/33'ü koruyor ve sunucu saatinin (UTC) yılını
 * kullanıyordu; Numeroloji modülüyle aynı kişi/yıl için farklı sonuç veriyordu
 * (29.01.1950 / 2026: 22 ↔ 4). Artık Numeroloji'nin kanonik `nominalPersonalYear`
 * fonksiyonunu kullanır ve takvim yılı Europe/Istanbul'a göre alınır.
 *
 * ISO (YYYY-MM-DD) ve TR (DD.MM.YYYY, DD/MM/YYYY) formatlarını kabul eder; geçersiz takvim
 * tarihinde "-" döner.
 */
export function calcKisiselYil(birthDate: string, calendarYear: number = currentIstanbulYear()): NumerolojiResult {
  const normalized = normalizeBirthDate(birthDate);
  if (!normalized) return { display: "-", key: "", steps: [] };
  const r = nominalPersonalYear(normalized, calendarYear);
  if (!r.value) return { display: "-", key: "", steps: [] };
  return {
    display: String(r.value),
    key: String(r.value),
    steps: [`Kişisel Yıl (${calendarYear}): ${r.value}`, ...r.steps],
  };
}

function normalizeBirthDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[3].padStart(2, "0")}.${iso[2].padStart(2, "0")}.${iso[1]}`;
  return s;
}
