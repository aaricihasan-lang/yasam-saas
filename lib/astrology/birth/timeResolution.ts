// Astroloji — yerel doğum zamanı → UTC (SAF; sürümü sabitlenmiş IANA tzdata tablosu). Human Design'dan BAĞIMSIZ
// uygulama (aynı ilke: sessiz tahmin YOK).
//
//   Ofset kaynağı (ATL-TZ-2026F): IANA 2026f tablosu (çalışma ortamının ICU/Intl sürümünden bağımsız — Node/Vercel/tarayıcı
//   aynı sonucu verir) + 1970 öncesi backzone tablosu. Tabloda olmayan ad → Intl (eski yol). HD-TZ-00: tablo ve ofset çekirdeği
//   modülden bağımsız ortak katmanda (lib/time/tzdb/core.ts); burada YALNIZ Atlas politikası (auto / earlier / later) vardır.
//
//   • gap       — yerel saat o gün hiç yaşanmamış (ileri alma) → hesap YOK (kullanıcı saati düzeltmeli).
//   • ambiguous — yerel saat iki kez yaşanmış (geri alma):
//                   dst_choice=auto    → REDDEDİLİR, iki seçenek döner (uzman açıkça seçer),
//                   dst_choice=earlier → ilk yaşanan an (daha büyük UTC ofseti; genelde yaz saati),
//                   dst_choice=later   → ikinci yaşanan an (daha küçük ofset; genelde kış saati).
//   • ok        — tek geçerli an (saniye hassasiyeti; LMT dahil tarihsel ofsetler korunur).

import { isValidIanaTimeZone, localTimeCandidates } from "../../time/tzdb/core";

// HD-TZ-00: ortak çekirdekten aynen dışa aktarılır (Atlas çağrı yerleri ve testleri değişmez).
export { isValidIanaTimeZone, utcOffsetSecondsAt, wallClockAt } from "../../time/tzdb/core";

export type DstChoice = "auto" | "earlier" | "later";

export type AstroTimeResolution =
  | { kind: "ok"; utcIso: string; offsetSeconds: number; ambiguousResolved: boolean }
  | { kind: "gap" }
  | { kind: "ambiguous"; options: { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number }[] }
  | { kind: "invalid"; reason: "date" | "time" | "timezone" };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** HH:mm veya HH:mm:ss → HH:mm:ss. Geçersizse null. */
export function normalizeTime(time: string): string | null {
  const m = TIME_RE.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}:${m[2]}:${String(s).padStart(2, "0")}`;
}

export function isValidIsoDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const d = new Date(0);
  d.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function resolveAstroBirthTime(date: string, time: string, timeZone: string, choice: DstChoice = "auto"): AstroTimeResolution {
  if (!isValidIsoDate(date)) return { kind: "invalid", reason: "date" };
  const hms = normalizeTime(time);
  if (!hms) return { kind: "invalid", reason: "time" };
  if (!isValidIanaTimeZone(timeZone)) return { kind: "invalid", reason: "timezone" };

  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, s] = hms.split(":").map(Number);
  const naive = new Date(0);
  naive.setUTCFullYear(y, mo - 1, d);
  naive.setUTCHours(h, mi, s, 0);
  const naiveMs = naive.getTime();

  // Adaylar ortak çekirdekten (UTC'ye göre artan; ±36 saat yoklama). Politika (auto / earlier / later) Atlas'a aittir.
  const valid = localTimeCandidates(naiveMs, timeZone);
  if (valid.length === 0) return { kind: "gap" };
  if (valid.length === 1) {
    return { kind: "ok", utcIso: new Date(valid[0].utcMs).toISOString(), offsetSeconds: valid[0].offsetSeconds, ambiguousResolved: false };
  }
  // Belirsiz: daha erken UTC anı = ilk yaşanan (daha büyük ofset).
  const earlier = valid[0];
  const later = valid[valid.length - 1];
  if (choice === "earlier" || choice === "later") {
    const pick = choice === "earlier" ? earlier : later;
    return { kind: "ok", utcIso: new Date(pick.utcMs).toISOString(), offsetSeconds: pick.offsetSeconds, ambiguousResolved: true };
  }
  return {
    kind: "ambiguous",
    options: [
      { choice: "earlier", utcIso: new Date(earlier.utcMs).toISOString(), offsetSeconds: earlier.offsetSeconds },
      { choice: "later", utcIso: new Date(later.utcMs).toISOString(), offsetSeconds: later.offsetSeconds },
    ],
  };
}

/** Saniye ofseti → sağlayıcının beklediği ondalık saat (6 basamak; LMT kesirleri korunur). */
export function offsetSecondsToDecimalHours(offsetSeconds: number): number {
  return Math.round((offsetSeconds / 3600) * 1e6) / 1e6;
}
