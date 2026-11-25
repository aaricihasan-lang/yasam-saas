// Doğum öncesi analiz (owner kararı 06.11.2026): gelecekteki doğum tarihi YASAKLANMAZ — anne/babalar planlanan
// doğum tarihine göre isim analizi yaptırabilir. Bu saf yardımcı yalnız SUNUMU düzeltir: referans tarih doğumdan
// önceyse yaş ("Yaş -1"), "şu anda içinde bulunulan" aktif dönem ve "şu anki" yaşam evresi gösterilmez; motor ve
// formüller DEĞİŞMEZ (sayılar doğum tarihine göre aynen hesaplanır).
import type { CalendarDate, CycleResult } from "@/lib/numeroloji/timing";

/** Referans tarih doğum tarihinden önce mi? (geçerli doğum tarihi + negatif takvim yaşı) */
export function isPreBirth(cycle: Pick<CycleResult, "age" | "timeline">): boolean {
  return cycle.age < 0 && cycle.timeline.length > 0;
}

function fmt(cd: CalendarDate): string {
  return `${String(cd.day).padStart(2, "0")}.${String(cd.month).padStart(2, "0")}.${cd.year}`;
}

/** Sekme / rapor üstündeki bağlam notu. */
export function preBirthNote(birth: CalendarDate, ref: CalendarDate): string {
  return `Doğum öncesi analiz: doğum tarihi (${fmt(birth)}) referans tarihten (${fmt(ref)}) sonradır. Sayı ve isim hesapları bu doğum tarihine göre yapılır; yaşa ve aktif döneme bağlı değerler doğumla başlar.`;
}

/** Aktif Kişisel Yıl yerine gösterilen açıklama. */
export function preBirthActiveYearText(birth: CalendarDate): string {
  return `Doğum öncesi — henüz aktif kişisel yıl yok. İlk aktif kişisel yıl doğum gününde (${fmt(birth)}) başlar.`;
}

/** Çeviri fonksiyonu (`numerology.tabs.timing.preBirth` ad alanı). */
export type PreBirthT = (key: string, values?: Record<string, string>) => string;

/** I18N: kaynak dil dışı ekranlar için aynı notlar (karar ve tarih biçimi aynı; TR fonksiyonları birebir kalır). */
export function preBirthNoteEn(t: PreBirthT, birth: CalendarDate, ref: CalendarDate): string {
  return t("note", { birth: fmt(birth), ref: fmt(ref) });
}
export function preBirthActiveYearTextEn(t: PreBirthT, birth: CalendarDate): string {
  return t("activeYear", { birth: fmt(birth) });
}
export function preBirthEvreTextEn(t: PreBirthT, firstEnergy: number | undefined): string {
  return firstEnergy !== undefined ? t("evreWithEnergy", { energy: String(firstEnergy) }) : t("evre");
}

/** Yaşam Evresi yerine gösterilen açıklama (ilk evre enerjisi motorun PIN timeline'ından). */
export function preBirthEvreText(firstEnergy: number | undefined): string {
  return `Doğum öncesi — yaşam evresi doğumla başlar. İlk evre: Evre 1${firstEnergy !== undefined ? ` (enerji ${firstEnergy})` : ""}.`;
}
