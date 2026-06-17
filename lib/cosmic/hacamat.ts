/**
 * lib/cosmic/hacamat.ts
 * Hacamat takvimi hesaplama motoru.
 *
 * Hicri tarih için Kozmik Takvim ile aynı Intl API / Umm al-Qura sistemi kullanılır.
 * Böylece Kozmik Takvim, Ay Fazları ve Hacamat Takvimi tutarlı tarihe bakar.
 */

// ─── Tip tanımları ─────────────────────────────────────────────────────────────

export type HacamatStatus = "altin" | "sunnet" | "uygun" | "yasakli" | "normal";

export type CalendarDay = {
  miladi:          Date;
  day:             number;
  weekDay:         number;
  weekDayName:     string;
  miladiFull:      string;
  hijriDay:        number;
  hijriMonthIdx:   number;
  hijriMonthName:  string;
  hijriYear:       number;
  hijriFormatted:  string;
  status:          HacamatStatus;
  statusLabel:     string;
  stars:           string;
  description:     string;
  isNotable:       boolean;
};

export type HacamatMonthData = {
  year:            number;
  month:           number;
  miladiMonthName: string;
  hijriMonthName:  string;
  days:            CalendarDay[];
  notable:         CalendarDay[];
  altin:           CalendarDay[];
  sunnet:          CalendarDay[];
  uygun:           CalendarDay[];
  yasakliNotable:  CalendarDay[];
  notes:           string[];
};

export type AltinDay = {
  miladi:         Date;
  miladiFull:     string;
  hijriFormatted: string;
  weekDayName:    string;
  year:           number;
};

export type HijamRule = {
  id:       number;
  text:     string;
  category: "oncesi" | "sonrasi" | "genel";
};

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const WEEK_DAY_NAMES_TR = [
  "Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi",
] as const;

export const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

const HIJRI_MONTHS: ReadonlyArray<string> = [
  "Muharrem", "Safer", "Rebiülevvel", "Rebiülahir",
  "Cemaziyelevvel", "Cemaziyelahir", "Recep", "Şaban",
  "Ramazan", "Şevval", "Zilkade", "Zilhicce",
];

/** Çarşamba=3, Cuma=5, Cumartesi=6 — her koşulda hacamat yasaktır */
const YASAKLI_WEEKDAYS = new Set([3, 5, 6]);

const SUNNET_HICRI  = new Set([17, 19, 21]);
const UYGUN_HICRI   = new Set([18, 20, 22, 23, 24]);
const NOTABLE_HICRI = new Set([17, 18, 19, 20, 21, 22, 23, 24]);

// ─── Varsayılan kurallar ──────────────────────────────────────────────────────

export const DEFAULT_HIJAMA_RULES: HijamRule[] = [
  { id: 1,  category: "oncesi",  text: "Hacamat öncesi en az 3 saat aç kalınmalıdır." },
  { id: 2,  category: "oncesi",  text: "Uygulama öncesi bol su içilmelidir (1–2 saat öncesi)." },
  { id: 3,  category: "oncesi",  text: "Yoğun fiziksel aktiviteden 24 saat öncesinden kaçınılmalıdır." },
  { id: 4,  category: "oncesi",  text: "Kan sulandırıcı ilaç kullananlar uzman doktora danışmalıdır." },
  { id: 5,  category: "oncesi",  text: "Hacamat bölgelerinde açık yara veya aktif cilt hastalığı olmamalıdır." },
  { id: 6,  category: "oncesi",  text: "Hamile ve yeni doğum yapmış kadınlar doktora danışmadan yaptırmamalıdır." },
  { id: 7,  category: "sonrasi", text: "Hacamat sonrası 1–2 saat uyuma veya dinlenme önerilir." },
  { id: 8,  category: "sonrasi", text: "Uygulama sonrası 24 saat duş alınmamalıdır." },
  { id: 9,  category: "sonrasi", text: "Soğuk su ve soğuk içeceklerden 24 saat kaçınılmalıdır." },
  { id: 10, category: "sonrasi", text: "Hacamat bölgeleri 24 saat güneşe maruz bırakılmamalıdır." },
  { id: 11, category: "sonrasi", text: "Uygulama günü ağır yemek yenmemelidir." },
  { id: 12, category: "genel",   text: "Hacamat ayda en fazla 1–2 kez yaptırılmalıdır." },
  { id: 13, category: "genel",   text: "Çocuklar için mutlaka uzman denetiminde uygulanmalıdır." },
  { id: 14, category: "genel",   text: "Kullanılan tüm malzemelerin sterilizasyonundan emin olunmalıdır." },
];

// ─── Durum hesaplayıcı ────────────────────────────────────────────────────────

export function getStatus(weekDay: number, hijriDay: number): HacamatStatus {
  if (YASAKLI_WEEKDAYS.has(weekDay)) return "yasakli";
  if (hijriDay === 17 && weekDay === 2) return "altin";
  if (SUNNET_HICRI.has(hijriDay)) return "sunnet";
  if (UYGUN_HICRI.has(hijriDay))  return "uygun";
  return "normal";
}

function statusLabel(s: HacamatStatus): string {
  if (s === "altin")   return "ALTIN GÜN";
  if (s === "sunnet")  return "SÜNNET GÜN";
  if (s === "uygun")   return "UYGUN GÜN";
  if (s === "yasakli") return "YASAKLI GÜN";
  return "";
}

function statusStars(s: HacamatStatus): string {
  if (s === "altin")   return "⭐⭐⭐⭐⭐";
  if (s === "sunnet")  return "⭐⭐⭐";
  if (s === "uygun")   return "⭐";
  if (s === "yasakli") return "⛔";
  return "";
}

function statusDescription(s: HacamatStatus, weekDayName: string): string {
  if (s === "altin")   return "Hacamat için en güçlü gün";
  if (s === "sunnet")  return "Hacamat için çok uygundur";
  if (s === "uygun")   return "Hacamat için uygundur";
  if (s === "yasakli") return `${weekDayName} — Hacamat yapılmaz`;
  return "";
}

// ─── Not üreteci ──────────────────────────────────────────────────────────────
//
// KRİTİK KURAL:
// Bir yasaklı günün akşamında bir sonraki Hicri güne geçilir.
// Ancak o yeni günün GERÇEK STATÜSÜ hesaplanmalıdır.
// Yeni gün de yasaklıysa "hacamat yapılabilir" söylenemez.

function generateNote(
  weekDay:        number,
  weekDayName:    string,
  hijriDay:       number,
  hijriMonthName: string,
  status:         HacamatStatus,
): string | null {
  const prevWeekDay     = (weekDay + 6) % 7;
  const prevWeekDayName = WEEK_DAY_NAMES_TR[prevWeekDay]!;

  // ── Altın Gün ──────────────────────────────────────────────────────────────
  if (status === "altin") {
    return (
      `${hijriDay} ${hijriMonthName} ${weekDayName} gününe denk geldiğinden bu tarih Altın Gün olarak ` +
      `değerlendirilmektedir. Yılın en güçlü hacamat günleri arasında yer alır.`
    );
  }

  // ── Yasaklı günde notable Hicri gün ────────────────────────────────────────
  // Akşam ezanıyla bir sonraki Hicri gün başlar; o günün statüsü gerçek olarak hesaplanır.
  if (status === "yasakli" && (SUNNET_HICRI.has(hijriDay) || UYGUN_HICRI.has(hijriDay))) {
    const nextWeekDay     = (weekDay + 1) % 7;
    const nextWeekDayName = WEEK_DAY_NAMES_TR[nextWeekDay]!;
    const nextHijriDay    = hijriDay + 1;          // Aynı Hicri ay içinde (17-24 → 18-25)
    const nextStatus      = getStatus(nextWeekDay, nextHijriDay);

    // YASAK → YASAK: Yeni gün de yasaklı
    if (nextStatus === "yasakli") {
      return (
        `${hijriDay} ${hijriMonthName} günü ${weekDayName} gününe denk geldiğinden hacamat uygun değildir. ` +
        `${weekDayName} akşamı Hicri ${nextHijriDay} ${hijriMonthName} ${nextWeekDayName} gününe ` +
        `geçildiğinden hacamat hâlâ uygun değildir.`
      );
    }

    // YASAK → ALTIN: Nadir, ama mümkün (Hicri 17 Pazartesi yasaklıysa... hayır, 17+Pzt=sünnet.
    //   Pratikte Hicri 16 yasaklı olup akşamı Hicri 17 Salı'ya geçilebilir — bu altin durumu)
    if (nextStatus === "altin") {
      return (
        `${hijriDay} ${hijriMonthName} günü ${weekDayName} gününe denk geldiğinden gündüz hacamat uygun ` +
        `değildir. ${weekDayName} akşam ezanından sonra Hicri ${nextHijriDay} ${hijriMonthName}'e ` +
        `geçildiğinden Altın Gün'e girilmiş olur.`
      );
    }

    // YASAK → SÜNNET
    if (nextStatus === "sunnet") {
      return (
        `${hijriDay} ${hijriMonthName} günü ${weekDayName} gününe denk geldiğinden gündüz hacamat uygun ` +
        `değildir. ${weekDayName} akşam ezanından sonra Hicri ${nextHijriDay} ${hijriMonthName}'e ` +
        `geçildiğinden sünnet gününe girilmiş olur.`
      );
    }

    // YASAK → UYGUN
    if (nextStatus === "uygun") {
      return (
        `${hijriDay} ${hijriMonthName} günü ${weekDayName} gününe denk geldiğinden gündüz hacamat uygun ` +
        `değildir. ${weekDayName} akşam ezanından sonra Hicri ${nextHijriDay} ${hijriMonthName}'e ` +
        `geçildiğinden hacamat yapılabilir.`
      );
    }

    // YASAK → NORMAL (Hicri 24 sonrası — nadir)
    return (
      `${hijriDay} ${hijriMonthName} günü ${weekDayName} gününe denk geldiğinden hacamat uygun değildir. ` +
      `${weekDayName} akşamı geçilen yeni Hicri gün ${nextHijriDay} ${nextWeekDayName} günüdür.`
    );
  }

  // ── İzin günü ama bir önceki gün yasaklıydı ────────────────────────────────
  // Hicri gün önceki akşamdan başlamış olduğu için yararlanılabilir.
  if ((status === "sunnet" || status === "uygun") && YASAKLI_WEEKDAYS.has(prevWeekDay)) {
    const label = status === "sunnet" ? "sünnet gününe" : "uygun günlere";
    return (
      `Hicri takvimde gün akşamdan başladığından ${prevWeekDayName} akşam ezanı sonrasında ` +
      `Hicri ${hijriDay} ${hijriMonthName} başlamaktadır. Bu nedenle ${prevWeekDayName} ` +
      `akşamından itibaren ${label} girilmiş olur.`
    );
  }

  return null;
}

// ─── Ana aylık hesaplama ─────────────────────────────────────────────────────

export function getHacamatMonthData(year: number, month: number): HacamatMonthData {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: CalendarDay[] = [];

  const hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric", month: "numeric", year: "numeric",
  });

  for (let d = 1; d <= daysInMonth; d++) {
    const miladi      = new Date(year, month, d);
    const weekDay     = miladi.getDay();
    const weekDayName = WEEK_DAY_NAMES_TR[weekDay]!;

    let hijriDay = 0, hijriMonthIdx = 0, hijriYear = 0;
    try {
      const parts   = hijriFmt.formatToParts(miladi);
      hijriDay      = parseInt(parts.find(p => p.type === "day")?.value   ?? "0", 10);
      hijriMonthIdx = parseInt(parts.find(p => p.type === "month")?.value ?? "1", 10) - 1;
      hijriYear     = parseInt(parts.find(p => p.type === "year")?.value   ?? "0", 10);
    } catch { /* ignore */ }

    const hijriMonthName = HIJRI_MONTHS[Math.max(0, Math.min(11, hijriMonthIdx))] ?? "?";
    const status         = getStatus(weekDay, hijriDay);
    const isNotable      = NOTABLE_HICRI.has(hijriDay);

    days.push({
      miladi,
      day: d,
      weekDay,
      weekDayName,
      miladiFull:     `${d} ${MONTH_NAMES_TR[month]} ${year}`,
      hijriDay,
      hijriMonthIdx,
      hijriMonthName,
      hijriYear,
      hijriFormatted: `${hijriDay} ${hijriMonthName} ${hijriYear}`,
      status,
      statusLabel:    statusLabel(status),
      stars:          statusStars(status),
      description:    statusDescription(status, weekDayName),
      isNotable,
    });
  }

  const notable        = days.filter(d => d.isNotable);
  const altin          = days.filter(d => d.status === "altin");
  const sunnet         = days.filter(d => d.status === "sunnet");
  const uygun          = days.filter(d => d.status === "uygun");
  const yasakliNotable = days.filter(d => d.status === "yasakli" && d.isNotable);

  const notes: string[] = [];
  const seen = new Set<string>();
  for (const day of notable) {
    const note = generateNote(day.weekDay, day.weekDayName, day.hijriDay, day.hijriMonthName, day.status);
    if (note && !seen.has(note)) { seen.add(note); notes.push(note); }
  }

  const mid = days.find(d => d.day === 15) ?? days[0];
  const hijriMonthName = mid?.hijriMonthName ?? "?";

  return {
    year, month,
    miladiMonthName: MONTH_NAMES_TR[month] ?? "?",
    hijriMonthName,
    days, notable, altin, sunnet, uygun, yasakliNotable, notes,
  };
}

// ─── Altın Gün tarayıcı (2026-2036) ─────────────────────────────────────────

export function getAllAltinDays(fromYear: number, toYear: number): AltinDay[] {
  const hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric", month: "numeric", year: "numeric",
  });
  const result: AltinDay[] = [];

  for (let year = fromYear; year <= toYear; year++) {
    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date    = new Date(year, month, day);
        const weekDay = date.getDay();
        if (weekDay !== 2) continue; // Sadece Salı

        let hijriDay = 0, hijriMonthIdx = 0, hijriYear = 0;
        try {
          const parts   = hijriFmt.formatToParts(date);
          hijriDay      = parseInt(parts.find(p => p.type === "day")?.value   ?? "0", 10);
          hijriMonthIdx = parseInt(parts.find(p => p.type === "month")?.value ?? "1", 10) - 1;
          hijriYear     = parseInt(parts.find(p => p.type === "year")?.value   ?? "0", 10);
        } catch { continue; }

        if (hijriDay !== 17) continue;

        const hijriMonthName = HIJRI_MONTHS[Math.max(0, Math.min(11, hijriMonthIdx))] ?? "?";
        result.push({
          miladi:         date,
          miladiFull:     `${day} ${MONTH_NAMES_TR[month]} ${year}`,
          hijriFormatted: `17 ${hijriMonthName} ${hijriYear}`,
          weekDayName:    "Salı",
          year,
        });
      }
    }
  }
  return result;
}
