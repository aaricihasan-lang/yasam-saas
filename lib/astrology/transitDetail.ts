// TRANSİT-01 (2026-10-17) — Batı Transit + Transit Takvimi için SAF yardımcılar (istemci + sunucu + rapor ortak).
//
// Kurallar:
//   • Yeni astrolojik hesap ÜRETMEZ: kesinleşme anları yalnız sağlayıcının takvim (forecast) olaylarından okunur;
//     "en güçlü" sıralaması sağlayıcının açı gücü (strength) ve orb değerindendir; açı türü sayımı listeden sayılır.
//   • Tek türetilmiş değer: transit gezegeninin içinden geçtiği NATAL EV — natal çerçevenin ev başlangıçlarına
//     (cusp) göre aritmetik yerleşim; ekranda ve raporda "natal ev başlangıçlarına göre" diye açıkça etiketlenir.
//   • Zaman: sağlayıcı anları UTC'dir; gösterim seçilen IANA saat dilimine Intl ile çevrilir (yaz/kış saati dahil).

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

/** Bir takvim gününün seçilen saat dilimindeki 12:00 anı → UTC dakika ("YYYY-MM-DDTHH:MM"). */
export function middayUtcOf(day: string, tz: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isIanaZone(tz)) return null;
  // Yerel 12:00 için ofset: o günün 12:00 UTC anındaki ofset (öğle saatinde yaz/kış saati geçişi olmaz).
  const guess = Date.parse(`${day}T12:00:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const localAsUtc = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  const offset = localAsUtc - guess;
  return new Date(guess - offset).toISOString().slice(0, 16);
}

/** "YYYY-MM-DD" + n gün (UTC takvim aritmetiği). Geçersizse null. */
export function addDaysIso(iso: string, n: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(n)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? new Date(ms + n * 86_400_000).toISOString().slice(0, 10) : null;
}
/** İki gün arası gün sayısı, iki uç DAHİL (aynı gün = 1). */
export function daysBetweenIso(start: string, end: string): number | null {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && /^\d{4}-\d{2}-\d{2}$/.test(end) ? Math.round((b - a) / 86_400_000) + 1 : null;
}

/** Yerel duvar saati (o anki ofsetle) → UTC ms; DST geçişini iki adımda çözer. Yerel saat o gün yoksa (ileri alma boşluğu) null. */
function localWallToUtcMs(date: string, time: string, tz: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !isIanaZone(tz)) return null;
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall)) return null;
  const offAt = (ms: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - Math.floor(ms / 60_000) * 60_000;
  };
  // İlk yaşanan (earlier) eşleşme — sunucu `resolveAstroBirthTime(..., "earlier")` ile aynı tercih.
  // Aday ofsetler (±14 sa çevresi); u = wall − ofset, u anı o ofsetle gerçekten aynı duvar saatini veriyorsa geçerli.
  const offsets = [...new Set([offAt(wall - 14 * 3600_000), offAt(wall), offAt(wall + 14 * 3600_000)])];
  const cands = offsets.map((o) => wall - o).filter((u) => offAt(u) === wall - u);
  return cands.length ? Math.min(...cands) : null;
}

/** Ekran ön izlemesi: "Hesaplanacak an: 17.10.2026 09:00 UTC". Sunucu aynı kuralla doğrular. */
export function localToUtcPreview(date: string, time: string, tz: string): { ok: boolean; text: string } {
  const ms = localWallToUtcMs(date, time, tz);
  if (ms === null) return { ok: false, text: "Bu yerel saat bu tarihte yok (yaz saati geçişi) veya tarih geçersiz." };
  const iso = new Date(ms).toISOString();
  const y = Number(iso.slice(0, 4));
  if (y < 1600 || y > 2600) return { ok: false, text: "Tarih 1600–2600 aralığında olmalı." };
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
