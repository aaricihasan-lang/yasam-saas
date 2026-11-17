// Gökyüzü Atlası — UTC anının seçilen IANA bölgesinde GÖSTERİMİ (SAF; sunucu + istemci). ATL-TZ-2026F.
//
// Biçim Intl'den (yerel ayar, alanlar, kısaltma stili) gelir; OFSET ise resolveAstroBirthTime / wallClockAt ile AYNI kaynaktan
// (sürümü sabitlenmiş IANA tablosu + backzone). Çalışma ortamının Intl ofseti tabloyla aynıysa çıktı Intl'in kendi çıktısıdır
// (bayt bayt eskisi); farklıysa (eski ICU tz verisi ya da 1970 öncesi backzone) tarih/saat tablodaki ofsetle üretilir ve ofset
// kısaltması aynı stilde yazılır. Tabloda olmayan ad → yalnız Intl (eski davranış; geçersiz adda Intl'in hatası aynen).

import { isValidIanaTimeZone, utcOffsetSecondsAt } from "./timeResolution";

const DTF = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = DTF.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    DTF.set(key, f);
  }
  return f;
}

/** Intl'in (çalışma ortamı tz verisi) bu andaki ofseti; bölgeyi tanımıyorsa null. */
function intlOffsetSeconds(ms: number, tz: string): number | null {
  try {
    const v = dtf("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = /^GMT(?:([+-])(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.replace("−", "-"));
    if (!m) return null;
    if (!m[1]) return 0;
    const s = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
    return m[1] === "-" ? -s : s;
  } catch {
    return null;
  }
}

/** Ofset kısaltması, istenen stilde: yerel ayarın kendi sabit-ofset adı (destekleniyorsa), aksi hâlde "GMT+3" / "GMT+03:00". */
function offsetName(locale: string, style: Intl.DateTimeFormatOptions["timeZoneName"], off: number): string {
  const a = Math.abs(off);
  const sign = off < 0 ? "-" : "+";
  const hh = Math.floor(a / 3600);
  const mm = Math.floor((a % 3600) / 60);
  const ss = a % 60;
  if (ss === 0) {
    try {
      const id = `${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      const v = dtf(locale, { timeZone: id, timeZoneName: style }).formatToParts(new Date(0)).find((p) => p.type === "timeZoneName")?.value;
      if (v) return v;
    } catch {
      /* sabit ofsetli bölge desteklenmiyor → elle */
    }
  }
  const sec = ss ? `:${String(ss).padStart(2, "0")}` : "";
  if (style === "longOffset" || style === "longGeneric" || style === "long") return off === 0 ? "GMT" : `GMT${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}${sec}`;
  return off === 0 ? "GMT" : `GMT${sign}${hh}${mm || ss ? `:${String(mm).padStart(2, "0")}` : ""}${sec}`;
}

/** `new Intl.DateTimeFormat(locale, { ...opts, timeZone }).formatToParts(ms)` — ofset IANA tablosundan. */
export function formatZonedParts(locale: string, opts: Intl.DateTimeFormatOptions, ms: number, timeZone: string): Intl.DateTimeFormatPart[] {
  const off = isValidIanaTimeZone(timeZone) ? utcOffsetSecondsAt(ms, timeZone) : null;
  if (off === null || intlOffsetSeconds(ms, timeZone) === off) return dtf(locale, { ...opts, timeZone }).formatToParts(new Date(ms));
  const parts = dtf(locale, { ...opts, timeZone: "UTC" }).formatToParts(new Date(Math.floor(ms / 1000) * 1000 + off * 1000));
  return opts.timeZoneName ? parts.map((p) => (p.type === "timeZoneName" ? { ...p, value: offsetName(locale, opts.timeZoneName, off) } : p)) : parts;
}

/** `new Intl.DateTimeFormat(locale, { ...opts, timeZone }).format(ms)` — ofset IANA tablosundan. */
export function formatZoned(locale: string, opts: Intl.DateTimeFormatOptions, ms: number, timeZone: string): string {
  return formatZonedParts(locale, opts, ms, timeZone)
    .map((p) => p.value)
    .join("");
}

/** Gösterim için geçerli IANA adı: sabit tablodaki ad ya da Intl'in tanıdığı ad (eski davranış). */
export function isDisplayZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  if (isValidIanaTimeZone(tz)) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
