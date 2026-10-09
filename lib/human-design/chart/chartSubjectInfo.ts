// HD — hesaplanmış harita "Danışan" bilgi bloğu için SAF görüntü yardımcıları.
//
// Yalnız KAYITLI veriden türetir (yeni hesap / sağlayıcı çağrısı YOK):
//   • yerel tarih/saat + IANA saat dilimi: kayıt satırı (birth_date / birth_time / timezone)
//   • UTC anı: computed_result.timing.birthUtcIso — hesap anında SUNUCUDA, DST-güvenli
//     resolveBirthLocalTime ile üretilip kaydedilmiş değer (burada yeniden hesaplanmaz)
//   • UTC ofseti: yerel duvar saati − kayıtlı UTC anı (saf aritmetik; tarayıcı saat dilimi KULLANILMAZ)
//   • koordinat: kayıt satırının input.latitude / input.longitude (Roxy kayıtlarında)
// Eksik alan TAHMİN EDİLMEZ → null (ekranda "—").
//   • vekil ilçe (HD 973 ilçe dizini): kayıtlı koordinat il merkezidir → koordinat yerine açıklama

import { TR_DISTRICT_PROXY_NOTE, isTrDistrictProxy } from "../location/trDistrictIndex";

export type HdChartSubjectSource = {
  clientName?: string | null;
  birthDate?: string | null;
  birthTime?: string | null;
  birthPlace?: string | null;
  timezone?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  birthUtcIso?: string | null;
  /** Kayıtlı konum kimliği (vekil ilçe tespiti için). */
  locationId?: string | null;
};

export type HdChartSubjectInfo = {
  name: string | null;
  /** "20.07.2018 19:00" */
  localDateTime: string | null;
  /** "Europe/Istanbul · UTC+03:00" */
  zoneLabel: string | null;
  /** "20.07.2018 16:00 UTC" */
  utcDateTime: string | null;
  place: string | null;
  /** "37,8700° K · 32,4800° D" — vekil ilçede koordinat yerine TR_DISTRICT_PROXY_NOTE */
  coordinates: string | null;
  age: number | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

function parseDate(s: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function parseTime(s: string | null | undefined): { h: number; mi: number; s: number } | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s ?? "");
  if (!m) return null;
  return { h: Number(m[1]), mi: Number(m[2]), s: Number(m[3] ?? 0) };
}

function fmtDate(p: { y: number; m: number; d: number }): string {
  return `${pad(p.d)}.${pad(p.m)}.${p.y}`;
}

/** Kayıtlı UTC ISO anını saat dilimsiz biçimler ("20.07.2018 16:00 UTC"). */
export function formatUtcIso(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso ?? "");
  if (!m || !Number.isFinite(Date.parse(iso as string))) return null;
  return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]} UTC`;
}

/** Yerel duvar saati − UTC anı → ofset dakikası (saf aritmetik). */
export function utcOffsetMinutes(birthDate: string | null | undefined, birthTime: string | null | undefined, birthUtcIso: string | null | undefined): number | null {
  const d = parseDate(birthDate);
  const t = parseTime(birthTime);
  const utcMs = Date.parse(birthUtcIso ?? "");
  if (!d || !t || !Number.isFinite(utcMs)) return null;
  const wallMs = Date.UTC(d.y, d.m - 1, d.d, t.h, t.mi, t.s);
  const diff = Math.round((wallMs - utcMs) / 60000);
  // Gerçek dünyada ofsetler −12:00…+14:00 aralığında; dışı = tutarsız veri → gösterme.
  return diff >= -12 * 60 && diff <= 14 * 60 ? diff : null;
}

export function formatUtcOffset(min: number): string {
  const sign = min < 0 ? "−" : "+";
  const a = Math.abs(min);
  return `UTC${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function coord(v: unknown, pos: string, neg: string): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `${Math.abs(v).toFixed(4).replace(".", ",")}° ${v < 0 ? neg : pos}`;
}

/** Doğum gününe göre tam yaş (doğum günü henüz gelmediyse bir eksik). `today` = takvim günü. */
export function ageOn(birthDate: string | null | undefined, today: { y: number; m: number; d: number }): number | null {
  const b = parseDate(birthDate);
  if (!b) return null;
  let age = today.y - b.y;
  if (today.m < b.m || (today.m === b.m && today.d < b.d)) age--;
  return age >= 0 && age < 150 ? age : null;
}

export function buildChartSubjectInfo(src: HdChartSubjectSource, today: { y: number; m: number; d: number }): HdChartSubjectInfo {
  const d = parseDate(src.birthDate);
  const t = parseTime(src.birthTime);
  const tz = src.timezone?.trim() || null;
  const off = utcOffsetMinutes(src.birthDate, src.birthTime, src.birthUtcIso);
  const lat = coord(src.latitude, "K", "G");
  const lon = coord(src.longitude, "D", "B");
  const zoneParts = [tz, off != null ? formatUtcOffset(off) : null].filter(Boolean);
  return {
    name: src.clientName?.trim() || null,
    localDateTime: d ? `${fmtDate(d)}${t ? ` ${pad(t.h)}:${pad(t.mi)}` : ""}` : null,
    zoneLabel: zoneParts.length ? zoneParts.join(" · ") : null,
    utcDateTime: formatUtcIso(src.birthUtcIso),
    place: src.birthPlace?.trim() || null,
    coordinates: isTrDistrictProxy(src.locationId) ? TR_DISTRICT_PROXY_NOTE : lat && lon ? `${lat} · ${lon}` : null,
    age: ageOn(src.birthDate, today),
  };
}

/** Görüntüleyenin takvim günü (yaş için). */
export function todayCalendarDate(now: Date = new Date()): { y: number; m: number; d: number } {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}
