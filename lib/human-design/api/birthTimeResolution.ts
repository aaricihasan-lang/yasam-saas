// HD — Yerel doğum zamanı → UTC çözümü, DST belirsizlik/boşluk TESPİTİ ile (SAF).
//
// Dahili motorun localDateTimeToUtc'si DST boşluğu/çakışmasında sessizce bir değer seçiyordu. Otomatik hesap hattında bu
// KABUL EDİLMEZ:
//   • "gap"       — yerel saat o gün hiç yaşanmamış (ileri alma).        → hesap YOK.
//   • "ambiguous" — yerel saat iki kez yaşanmış (geri alma).             → hesap YOK.
//   • "ok"        — tek geçerli UTC anı (saniye hassasiyetli; LMT dahil).
// HD-TZ (18.11.2026): ofset ortak IANA 2026f çekirdeğinden (lib/time/tzdb; Gökyüzü Atlası ile AYNI tablo + 1970 öncesi
// backzone katmanı). Çalışma ortamının Intl/ICU tz verisi (ör. Node 24 = 2026a) KULLANILMAZ — sunucu ve tarayıcı aynı sonucu
// verir. Yaklaşık/dakika yuvarlaması yapılmaz. Boşluk/çakışma politikası (güvenli ret) değişmedi.

import { isValidIanaTimeZone as tzdbIsValidIanaTimeZone, localTimeCandidates, wallClockMs as tzdbWallClockMs } from "../../time/tzdb/core";

/** HD doğum anı politikası: IANA tablosu + backzone (Gökyüzü Atlası ile aynı tarihsel ofsetler). */
const HD_TZDB_OPTIONS = { backzone: true } as const;

export type BirthTimeResolution =
  | { kind: "ok"; utcIso: string; offsetSeconds: number }
  | { kind: "gap" }
  | { kind: "ambiguous"; offsetsSeconds: number[] }
  | { kind: "invalid"; reason: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Bir UTC anında, tz'deki duvar saatinin "naif UTC" ms karşılığı — ofseti verir (IANA 2026f + backzone). */
function wallClockMs(utcMs: number, timeZone: string): number {
  return tzdbWallClockMs(utcMs, timeZone, HD_TZDB_OPTIONS);
}

/** HH:mm veya HH:mm:ss → HH:mm:ss (Roxy biçimi). Geçersizse null. */
export function toHms(time: string): string | null {
  const m = TIME_RE.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}:${m[2]}:${String(s).padStart(2, "0")}`;
}

/** IANA bölge adı denetimi — ortak çekirdek (sabit IANA tablosundaki ad, eski Intl tanımasa da geçerlidir). */
export function isValidIanaTimeZone(tz: string): boolean {
  return tzdbIsValidIanaTimeZone(tz);
}

export function resolveBirthLocalTime(date: string, time: string, timeZone: string): BirthTimeResolution {
  const dm = DATE_RE.exec(date);
  if (!dm) return { kind: "invalid", reason: "date" };
  const hms = toHms(time);
  if (!hms) return { kind: "invalid", reason: "time" };
  if (!isValidIanaTimeZone(timeZone)) return { kind: "invalid", reason: "timezone" };

  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi, s] = hms.split(":").map(Number);
  const naive = new Date(0);
  naive.setUTCFullYear(y, mo - 1, d);
  naive.setUTCHours(h, mi, s, 0);
  if (naive.getUTCFullYear() !== y || naive.getUTCMonth() !== mo - 1 || naive.getUTCDate() !== d) {
    return { kind: "invalid", reason: "date" };
  }
  const naiveMs = naive.getTime();

  // Tüm geçerli UTC anları (ortak çekirdek): [] = boşluk · 1 = tek an · 2+ = çakışma.
  const valid = localTimeCandidates(naiveMs, timeZone, HD_TZDB_OPTIONS);
  if (valid.length === 0) return { kind: "gap" };
  if (valid.length > 1) {
    return { kind: "ambiguous", offsetsSeconds: valid.map((v) => v.offsetSeconds).sort((a, b) => a - b) };
  }
  return { kind: "ok", utcIso: new Date(valid[0].utcMs).toISOString(), offsetSeconds: valid[0].offsetSeconds };
}

// ── HD-14 / HD-29: yaz saati boşluğu ve çakışması — TEK kaynak mesaj + tespit ──────────────────
// Hem kayıt (oluşturma/düzenleme: boşluk REDDEDİLİR) hem hesap (boşluk ve çakışma REDDEDİLİR) bu
// fonksiyonu kullanır; ikinci bir doğrulama sistemi yoktur. Çakışmada iki olası UTC anından biri
// ASLA sessizce seçilmez (owner kararı 2026-10-15: güvenli ret korunur).

export type BirthLocalTimeIssue = {
  kind: "gap" | "ambiguous";
  code: "BIRTH_TIME_NONEXISTENT" | "BIRTH_TIME_AMBIGUOUS";
  message: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const hmOfMs = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
function utcOffsetLabel(seconds: number): string {
  const sign = seconds < 0 ? "−" : "+";
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  return `UTC${sign}${pad2(h)}:${pad2(m)}`;
}

/** Geçiş anındaki yerel saatler (ör. 03:00 → 04:00). Bulunamazsa null. */
function transitionWallTimes(naiveMs: number, timeZone: string): { from: string; to: string } | null {
  // Tüm noktalar TAM SANİYE: wallClockMs saniye çözünürlüklüdür (ms kayması ofseti bozmasın).
  const SEC = 1000;
  let lo = Math.floor((naiveMs - 30 * 3_600_000) / SEC) * SEC;
  let hi = Math.floor((naiveMs + 30 * 3_600_000) / SEC) * SEC;
  const offAt = (t: number) => wallClockMs(t, timeZone) - t;
  const offLo = offAt(lo);
  if (offAt(hi) === offLo) return null;
  while (hi - lo > SEC) {
    const mid = Math.floor((lo + hi) / 2 / SEC) * SEC;
    if (offAt(mid) === offLo) lo = mid;
    else hi = mid;
  }
  const offHi = offAt(hi);
  // Geçişten hemen önceki ve sonraki duvar saati (saniye yuvarlaması: geçişler tam dakikadadır).
  const before = Math.round((hi + offLo) / 60_000) * 60_000;
  const after = Math.round((hi + offHi) / 60_000) * 60_000;
  return { from: hmOfMs(before), to: hmOfMs(after) };
}

function trDate(date: string): string {
  const m = DATE_RE.exec(date);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : date;
}

/**
 * Yerel doğum saati o saat diliminde hiç yaşanmamışsa (boşluk) ya da iki kez yaşanmışsa (çakışma)
 * uzmanın anlayacağı Türkçe açıklama döner; aksi halde null (geçerli saat / girdi eksik-geçersiz).
 */
export function birthLocalTimeIssue(date: string, time: string, timeZone: string): BirthLocalTimeIssue | null {
  const r = resolveBirthLocalTime(date, time, timeZone);
  if (r.kind !== "gap" && r.kind !== "ambiguous") return null;
  const hms = toHms(time) ?? time;
  const dm = DATE_RE.exec(date)!;
  const naive = new Date(0);
  naive.setUTCFullYear(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
  const [h, mi, s] = hms.split(":").map(Number);
  naive.setUTCHours(h, mi, s, 0);
  const tr = transitionWallTimes(naive.getTime(), timeZone);
  const when = `${trDate(date)} ${hms.slice(0, 5)}`;
  if (r.kind === "gap") {
    const jump = tr ? ` O gün yaz saati uygulaması nedeniyle saatler ${tr.from} → ${tr.to} olarak ileri alındı.` : "";
    return {
      kind: "gap",
      code: "BIRTH_TIME_NONEXISTENT",
      message: `${when} yerel saati ${timeZone} saat diliminde hiç yaşanmamıştır.${jump} Doğum belgesindeki saati kontrol edin; bu saatle kayıt ve hesaplama yapılamaz.`,
    };
  }
  const back = tr ? ` O gün saatler ${tr.from} → ${tr.to} olarak geri alındı;` : " Saatler geri alındı;";
  const offs = r.offsetsSeconds.map(utcOffsetLabel).join(" ve ");
  return {
    kind: "ambiguous",
    code: "BIRTH_TIME_AMBIGUOUS",
    message: `${when} yerel saati ${timeZone} saat diliminde iki kez yaşanmıştır.${back} bu saat iki farklı anda (${offs}) yaşandı. Hangi anın kastedildiği kesin bilinmediğinden sistem tahmin yapmaz ve otomatik hesaplama yapılmaz.`,
  };
}
