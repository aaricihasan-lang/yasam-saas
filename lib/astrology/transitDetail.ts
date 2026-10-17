// TRANSİT-01 (2026-10-17) — Batı Transit + Transit Takvimi için SAF yardımcılar (istemci + sunucu + rapor ortak).
//
// Kurallar:
//   • Yeni astrolojik hesap ÜRETMEZ: kesinleşme anları yalnız sağlayıcının takvim (forecast) olaylarından okunur;
//     "en güçlü" sıralaması sağlayıcının açı gücü (strength) ve orb değerindendir; açı türü sayımı listeden sayılır.
//   • Tek türetilmiş değer: transit gezegeninin içinden geçtiği NATAL EV — natal çerçevenin ev başlangıçlarına
//     (cusp) göre aritmetik yerleşim; ekranda ve raporda "natal ev başlangıçlarına göre" diye açıkça etiketlenir.
//   • Zaman: sağlayıcı anları UTC'dir; gösterim seçilen IANA saat dilimine Intl ile çevrilir (yaz/kış saati dahil).

import { isValidIsoDate, normalizeTime, resolveAstroBirthTime } from "./birth/timeResolution";
import type { AspectType, BodyId, NatalHouse } from "./model/western";
import type { ForecastEvent, ForecastTechnical, PointId, TransitAspect, TransitCalendarExact, TransitTechnical } from "./model/westernTiming";

/** Majör açılar (diğerleri minör). */
export const MAJOR_ASPECTS: ReadonlySet<AspectType> = new Set<AspectType>(["conjunction", "opposition", "trine", "square", "sextile"]);

/**
 * Takvim kesinleşmesiyle eşleştirilebilen noktalar. Düğümler ve Lilith HARİÇ: takvim ucu (/forecast/transits) düğüm /
 * Lilith yöntemini (gerçek / ortalama) belgelemez ve istekte seçtirmez → transitin düğüm türüyle aynı olduğu
 * doğrulanamaz; yanlış anı göstermek yerine eşleştirme yapılmaz.
 */
const CALENDAR_MATCHABLE: ReadonlySet<string> = new Set(["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "chiron", "ascendant", "midheaven"]);
export const CALENDAR_UNMATCHED_NOTE = "Ay düğümü ve Lilith hedefli/kaynaklı açılarda takvim kesinleşmesi gösterilmez (takvim hesabının düğüm yöntemi belirtilmiyor).";

/** Takvim parçalarından bu transitin açıları için kesinleşme anları (yalnız aynı gezegen + aynı natal hedef + aynı açı türü). */
export function calendarExactFor(t: Pick<TransitTechnical, "aspects">, parts: (ForecastTechnical | null)[], window: { start: string; end: string }): TransitCalendarExact | null {
  const found = parts.filter((p): p is ForecastTechnical => !!p);
  if (found.length === 0) return null;
  const events = found.flatMap((p) => p.events).filter((e) => e.type === "transit_aspect" && e.body && e.targetBody && e.aspect);
  const hits: TransitCalendarExact["hits"] = [];
  const seen = new Set<string>();
  for (const a of t.aspects) {
    if (!CALENDAR_MATCHABLE.has(a.transit) || !CALENDAR_MATCHABLE.has(a.natal)) continue;
    const k = `${a.transit}|${a.natal}|${a.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const times = [...new Set(events.filter((e) => e.body === a.transit && e.targetBody === a.natal && e.aspect === a.type).map((e) => e.datetime))].sort();
    if (times.length > 0) hits.push({ transit: a.transit, natal: a.natal, type: a.type, exactUtc: times });
  }
  return { window, complete: found.length === parts.length, hits };
}

/** Bir açının takvimdeki kesinleşme anları (yoksa boş). */
export function exactTimesOf(ce: TransitCalendarExact | null | undefined, a: Pick<TransitAspect, "transit" | "natal" | "type">): string[] {
  return ce?.hits.find((h) => h.transit === a.transit && h.natal === a.natal && h.type === a.type)?.exactUtc ?? [];
}

/** "En güçlü transitler": sağlayıcı gücü (büyükten küçüğe), eşitlikte daha dar orb. */
export function strongestTransits<A extends Pick<TransitAspect, "strength" | "orb">>(aspects: A[], n = 5): A[] {
  return [...aspects].sort((x, y) => y.strength - x.strength || x.orb - y.orb).slice(0, n);
}

/** Açı türüne göre sayım (sağlayıcı listesinden). */
export function aspectTypeCounts(aspects: Pick<TransitAspect, "type">[]): [AspectType, number][] {
  const m = new Map<AspectType, number>();
  for (const a of aspects) m.set(a.type, (m.get(a.type) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const norm = (x: number) => ((x % 360) + 360) % 360;

/** Boylamın natal ev başlangıçlarına göre ev numarası (cusp i ≤ boylam < cusp i+1). 12 cusp yoksa null. */
export function natalHouseOf(longitude: number, houses: Pick<NatalHouse, "number" | "longitude">[]): number | null {
  if (houses.length !== 12) return null;
  const cs = [...houses].sort((a, b) => a.number - b.number);
  const lon = norm(longitude);
  for (let i = 0; i < 12; i++) {
    const a = norm(cs[i].longitude);
    const span = norm(cs[(i + 1) % 12].longitude - a);
    if (span > 0 && norm(lon - a) < span) return cs[i].number;
  }
  return null;
}
export const NATAL_HOUSE_NOTE = "Natal ev: transit gezegeninin boylamı, kayıtlı natal haritanın ev başlangıçlarına (cusp) göre yerleştirilmiştir.";

/** Transit gezegenlerinin içinden geçtiği natal evler (natal çerçeve yoksa boş harita). */
export function transitNatalHouses(t: Pick<TransitTechnical, "bodies" | "natalFrame">): Map<BodyId, number> {
  const out = new Map<BodyId, number>();
  const hs = t.natalFrame?.houses;
  if (!hs || hs.length !== 12) return out;
  for (const b of t.bodies) {
    const h = natalHouseOf(b.longitude, hs);
    if (h !== null) out.set(b.id, h);
  }
  return out;
}

// ─── Zaman gösterimi ─────────────────────────────────────────────────────────

export function isIanaZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** UTC anı ("YYYY-MM-DDTHH:MM[:SS][Z]") → seçilen saat diliminde "GG.AA.YYYY SS:DD" + kısaltma (ör. GMT+3). */
export function formatInZone(utcIso: string, tz: string): { text: string; zone: string } | null {
  const ms = Date.parse(/Z$/.test(utcIso) ? utcIso : `${utcIso.length === 16 ? `${utcIso}:00` : utcIso.slice(0, 19)}Z`);
  if (!Number.isFinite(ms) || !isIanaZone(tz)) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return { text: `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`, zone: String(p.timeZoneName ?? tz) };
}

/** UTC anının seçilen saat dilimindeki takvim günü (YYYY-MM-DD). */
export function dayKeyInZone(utcIso: string, tz: string): string | null {
  const ms = Date.parse(/Z$/.test(utcIso) ? utcIso : `${utcIso.slice(0, 19)}Z`);
  if (!Number.isFinite(ms) || !isIanaZone(tz)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** "17.10.2026 12:00 (GMT+3, Europe/Istanbul) · 17.10.2026 09:00 UTC" — tz yoksa yalnız UTC. */
export function momentLabel(utcIso: string, tz: string | null | undefined): string {
  const utc = `${utcIso.slice(8, 10)}.${utcIso.slice(5, 7)}.${utcIso.slice(0, 4)} ${utcIso.slice(11, 16)} UTC`;
  if (!tz || tz === "UTC") return utc;
  const z = formatInZone(utcIso, tz);
  return z ? `${z.text} (${z.zone}, ${tz}) · ${utc}` : utc;
}

/** İki an arasındaki işaretli fark — "3 gün 4 sa sonra" / "2 sa önce" / "aynı an". */
export function relativeTo(atUtc: string, exactUtc: string): string {
  const a = Date.parse(/Z$/.test(atUtc) ? atUtc : `${atUtc}Z`);
  const b = Date.parse(exactUtc);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  const diff = b - a;
  const m = Math.round(Math.abs(diff) / 60_000);
  if (m < 1) return "aynı an";
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const txt = d > 0 ? `${d} gün${h ? ` ${h} sa` : ""}` : h > 0 ? `${h} sa${mm ? ` ${mm} dk` : ""}` : `${mm} dk`;
  return `${txt} ${diff > 0 ? "sonra" : "önce"}`;
}

// ─── Takvim (forecast) ──────────────────────────────────────────────────────

/** Sağlayıcı önem puanı açıklaması (ekranda ve raporda AYNI metin). */
export const SIGNIFICANCE_NOTE =
  "Önem puanı (0–100), hesaplama sağlayıcısının olayları sıralamak için verdiği göreli değerlendirmedir. Olayın gerçekleşme olasılığı, kesin sonuç, sağlık riski veya maddi kazanç göstergesi değildir.";

export function significanceBand(v: number | null): "high" | "mid" | "low" | null {
  if (v === null) return null;
  return v >= 70 ? "high" : v >= 40 ? "mid" : "low";
}
export const SIGNIFICANCE_BAND_LABELS = { high: "yüksek", mid: "orta", low: "düşük" } as const;

/** Kişisel (natal haritaya açı) ↔ genel gökyüzü olayı ayrımı. */
export const isPersonalEvent = (e: Pick<ForecastEvent, "type">) => e.type === "transit_aspect";

/** Olayları seçilen saat dilimindeki takvim gününe göre grupla (sıra korunur). */
export function groupEventsByDay<E extends Pick<ForecastEvent, "datetime">>(events: E[], tz: string): [string, E[]][] {
  const m = new Map<string, E[]>();
  for (const e of events) {
    const k = dayKeyInZone(e.datetime, tz) ?? e.datetime.slice(0, 10);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return [...m.entries()];
}

/** Bir takvim gününün seçilen saat dilimindeki 12:00 anı → UTC dakika ("YYYY-MM-DDTHH:MM"). Geçersiz gün/bölge → null (istisna ATMAZ). */
export function middayUtcOf(day: string, tz: string): string | null {
  if (!isValidIsoDate(day) || !isIanaZone(tz)) return null;
  const r = resolveAstroBirthTime(day, "12:00", tz, "earlier");
  return r.kind === "ok" ? r.utcIso.slice(0, 16) : null;
}

/** "YYYY-MM-DD" + n gün (UTC takvim aritmetiği). Geçersizse null. */
export function addDaysIso(iso: string, n: number): string | null {
  if (!isValidIsoDate(iso) || !Number.isInteger(n)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? new Date(ms + n * 86_400_000).toISOString().slice(0, 10) : null;
}
/** İki gün arası gün sayısı, iki uç DAHİL (aynı gün = 1). */
export function daysBetweenIso(start: string, end: string): number | null {
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) + 1 : null;
}

/** Transit / takvim tarih alanlarının kabul aralığı (sunucu `yearOk` ile aynı). */
export const ATLAS_YEAR_MIN = 1600;
export const ATLAS_YEAR_MAX = 2600;

/**
 * Tarih alanı denetimi (YYYY-MM-DD). Tarayıcının tarih kutusu yazma sırasında EKSİK ara değerler üretir: boş dize
 * (gün/ay/yıl tamamlanmadı) veya yıl rakam rakam yazılırken "0002-10-17", "0020-10-17", "0202-10-17". Bunlar hata DEĞİL,
 * tamamlanmamış girişlerdir → açıklayıcı uyarı; hiçbiri UTC hesabına / plana / API'ye geçmez. Geçerliyse null.
 */
export function dateInputIssue(date: string): string | null {
  if (!date) return "Tarih eksik — gün, ay ve yılı tamamlayın.";
  if (!isValidIsoDate(date)) return "Tarih geçersiz — gün, ay ve 4 haneli yılı kontrol edin.";
  const y = Number(date.slice(0, 4));
  if (y < ATLAS_YEAR_MIN || y > ATLAS_YEAR_MAX) return `Tarih ${ATLAS_YEAR_MIN}–${ATLAS_YEAR_MAX} aralığında olmalı (yıl 4 haneli yazılmalı).`;
  return null;
}
/** Saat alanı denetimi (SS:DD). Geçerliyse null. */
export function timeInputIssue(time: string): string | null {
  if (!time) return "Saat eksik — saat ve dakikayı tamamlayın.";
  return /^\d{2}:\d{2}$/.test(time) && normalizeTime(time) ? null : "Saat geçersiz.";
}

/**
 * Ekran ön izlemesi: "Hesaplanacak an: 17.10.2026 09:00 UTC". Dönüşüm SUNUCUNUN kullandığı fonksiyonla aynıdır
 * (`resolveAstroBirthTime`, belirsiz saatte ilk yaşanan an) → ön izleme ile hesaplanan an ayrışmaz. HİÇBİR girişte istisna atmaz.
 */
export function localToUtcPreview(date: string, time: string, tz: string): { ok: boolean; text: string } {
  const issue = dateInputIssue(date) ?? timeInputIssue(time);
  if (issue) return { ok: false, text: issue };
  if (!isIanaZone(tz)) return { ok: false, text: "Saat dilimi geçersiz." };
  const r = resolveAstroBirthTime(date, time, tz, "earlier");
  if (r.kind === "gap") return { ok: false, text: "Bu yerel saat bu tarihte yok (yaz saati geçişi) — saati değiştirin." };
  if (r.kind !== "ok") return { ok: false, text: "Tarih veya saat geçersiz." };
  const iso = r.utcIso;
  const y = Number(iso.slice(0, 4));
  if (!(y >= ATLAS_YEAR_MIN && y <= ATLAS_YEAR_MAX)) return { ok: false, text: `Tarih ${ATLAS_YEAR_MIN}–${ATLAS_YEAR_MAX} aralığında olmalı.` };
  return { ok: true, text: `Hesaplanacak an: ${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC` };
}

/** Takvim penceresi ↔ gün: gün pencere içinde mi? */
export const dayInWindow = (day: string, w: { start: string; end: string }) => day >= w.start && day <= w.end;

/** Bir olayın (UTC) dakikaya yuvarlanmış anı ("YYYY-MM-DDTHH:MM"). Saniye varsa en yakın dakikaya yuvarlanır. */
export function eventMinuteUtc(datetime: string): string | null {
  const ms = Date.parse(datetime);
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.round(ms / 60_000) * 60_000).toISOString().slice(0, 16);
}

export type { PointId };
