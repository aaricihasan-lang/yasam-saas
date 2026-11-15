// Astroloji — KP Ruling Planets ZAMAN ARALIĞI TARAMASI: seçenek normalizasyonu + gözlem yeri ofseti (SAF; 2026-10-22).
//
// Seçenek: başlangıç anı (UTC dakika; "şimdi" = UTC saat başı — transit ile aynı normalizasyon), süre (dk), adım (dk), KP ayanamsa,
// düğüm, gözlem yeri kimliği (yoksa doğum yeri). Sağlayıcı aralık için TEK ofset kullanır → ofset gözlem yerinin pencere
// başlangıcındaki ofsetidir; pencere içinde (yaz/kış saati) değişirse istek GÖNDERİLMEZ (service.ts).

import { resolveAstroBirthTime, wallClockAt } from "../birth/timeResolution";
import { kpIntervalWindowOk } from "../model/kpRulingInterval";

export type KpRiOptions = { atUtc: string; durationMinutes: number; intervalMinutes: number; ayanamsa: string; nodeType: string; placeLocationId: string | null };

export function parseKpRulingIntervalOptions(
  r: Record<string, unknown>,
  deps: { atUtc: string | null; ayanamsa: string | null; nodeType: string | null; place: string | null | undefined },
): KpRiOptions | null {
  const { atUtc, ayanamsa, nodeType, place } = deps;
  if (!atUtc || !ayanamsa || !nodeType || place === undefined) return null;
  const y = Number(atUtc.slice(0, 4));
  if (!(y >= 1900 && y <= 2100)) return null;
  const d = typeof r.durationMinutes === "number" ? r.durationMinutes : NaN;
  const i = typeof r.intervalMinutes === "number" ? r.intervalMinutes : NaN;
  if (!kpIntervalWindowOk(d, i)) return null;
  return { atUtc, durationMinutes: d, intervalMinutes: i, ayanamsa, nodeType, placeLocationId: place };
}

/**
 * Bir UTC anında IANA bölgesinin ofseti (saniye). Duvar saati ürünün tarihsel ofset kaynağından (wallClockAt: backzone + Intl),
 * ardından ürünün çözümleyicisiyle (tarihsel kurallar) TEYİT. 14.11.2026 (ATL-B03): duvar saati eskiden yalnız Intl'den
 * alınıyordu → backzone bölgelerinde (ör. Europe/Oslo 1965) teyit tutmuyor ve ofset "çözülemedi" sayılıyordu (istek
 * engelleniyordu). Teyit kuralı aynen; daha önce çözülen anların sonucu değişmez.
 */
export function offsetSecondsAtUtc(timeZone: string, utcMs: number): number | null {
  const w = wallClockAt(utcMs, timeZone);
  if (!w) return null;
  for (const choice of ["earlier", "later"] as const) {
    const res = resolveAstroBirthTime(w.date, w.time, timeZone, choice);
    if (res.kind === "ok" && Date.parse(res.utcIso) === utcMs) return res.offsetSeconds;
  }
  return null;
}

/** Pencere boyunca tek ofset (saat) — başlangıç ve bitişte aynı değilse "changes"; çözülemezse "unresolved". */
export function kpIntervalOffset(timeZone: string | null, startUtc: string, durationMinutes: number): { kind: "ok"; hours: number } | { kind: "changes" } | { kind: "unresolved" } {
  if (!timeZone) return { kind: "unresolved" };
  const s = Date.parse(`${startUtc}:00Z`);
  const a = offsetSecondsAtUtc(timeZone, s);
  const b = offsetSecondsAtUtc(timeZone, s + durationMinutes * 60_000);
  if (a === null || b === null) return { kind: "unresolved" };
  if (a !== b) return { kind: "changes" };
  return { kind: "ok", hours: Math.round((a / 3600) * 1e6) / 1e6 };
}
