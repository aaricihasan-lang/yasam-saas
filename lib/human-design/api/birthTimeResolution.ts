// HD — Yerel doğum zamanı → UTC çözümü, DST belirsizlik/boşluk TESPİTİ ile (SAF).
//
// Dahili motorun localDateTimeToUtc'si (değiştirilmedi) DST boşluğu/çakışmasında sessizce
// bir değer seçer. Otomatik hesap hattında bu KABUL EDİLMEZ:
//   • "gap"       — yerel saat o gün hiç yaşanmamış (ileri alma).        → hesap YOK.
//   • "ambiguous" — yerel saat iki kez yaşanmış (geri alma).             → hesap YOK.
//   • "ok"        — tek geçerli UTC anı (saniye hassasiyetli; LMT dahil).
// Intl (IANA tzdata) kullanılır; yaklaşık/dakika yuvarlaması yapılmaz.

export type BirthTimeResolution =
  | { kind: "ok"; utcIso: string; offsetSeconds: number }
  | { kind: "gap" }
  | { kind: "ambiguous"; offsetsSeconds: number[] }
  | { kind: "invalid"; reason: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Bir UTC anında, tz'deki duvar saatinin UTC epoch karşılığı (ms) — ofseti verir. */
function wallClockMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    era: "short",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const era = parts.find((p) => p.type === "era")?.value ?? "AD";
  const y = era === "BC" ? 1 - get("year") : get("year");
  const d = new Date(0);
  d.setUTCFullYear(y, get("month") - 1, get("day"));
  d.setUTCHours(get("hour"), get("minute"), get("second"), 0);
  return d.getTime();
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

export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$|^UTC$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
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

  // Aday ofsetler: ±1 gün içindeki tüm farklı ofsetler (bir geçişin iki yanı).
  const offsets = new Set<number>();
  for (const probe of [-36, -12, 0, 12, 36]) {
    const t = naiveMs + probe * 3_600_000;
    offsets.add(wallClockMs(t, timeZone) - t);
  }
  const valid: { utcMs: number; offset: number }[] = [];
  for (const off of offsets) {
    const utcMs = naiveMs - off;
    if (wallClockMs(utcMs, timeZone) === naiveMs && !valid.some((v) => v.utcMs === utcMs)) {
      valid.push({ utcMs, offset: off });
    }
  }
  if (valid.length === 0) return { kind: "gap" };
  if (valid.length > 1) {
    return { kind: "ambiguous", offsetsSeconds: valid.map((v) => v.offset / 1000).sort((a, b) => a - b) };
  }
  return { kind: "ok", utcIso: new Date(valid[0].utcMs).toISOString(), offsetSeconds: valid[0].offset / 1000 };
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
