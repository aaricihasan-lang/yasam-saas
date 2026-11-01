// Gökyüzü Atlası — PROFESYONEL EV SİSTEMLERİ: yerel doğum girdisi → UTC → evler (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Yerel saat çözümü mevcut ortak `resolveAstroBirthTime` (IANA + backzone katmanı) ile yapılır — yeni zaman kodu YOK.
// Sessiz tahmin YOK: DST belirsizliği (geri alma) `dstChoice` verilmeden hesaplanmaz; yaşanmamış saat (ileri alma) reddedilir.
// Güven işaretleri yalnız BİLGİ amaçlıdır; hesabı değiştirmez.

import { resolveAstroBirthTime, type DstChoice } from "../../birth/timeResolution";
import { computeHousesAt, type ProHouseSystem, type ProHousesResult } from "./engine";

export type BirthHousesInput = {
  system: ProHouseSystem;
  /** YYYY-MM-DD (yerel, proleptik Gregoryen). */
  date: string;
  /** HH:MM veya HH:MM:SS (yerel duvar saati). */
  time: string;
  /** IANA saat dilimi. */
  timeZone: string;
  dstChoice?: DstChoice;
  latitude: number;
  longitude: number;
};

export type ConfidenceFlag =
  /** Kullanıcı DST belirsizliğinde açıkça erken/geç seçti. */
  | "dst_choice_applied"
  /** 1970 öncesi: IANA tzdata kaydı sınırlı/temsilî (yerel ortalama saat, savaş saatleri) → saat ofsetini kaynakla teyit edin. */
  | "historical_timezone"
  /** Ofset tam dakika değil (LMT): saat dilimi yerine yerel ortalama saat uygulanmış. */
  | "non_minute_offset";

export type BirthHousesResult =
  | { kind: "ok"; utcIso: string; offsetSeconds: number; houses: ProHousesResult; confidence: { flags: ConfidenceFlag[] } }
  | { kind: "ambiguous"; options: { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number }[] }
  | { kind: "gap" }
  | { kind: "invalid"; reason: "date" | "time" | "timezone" | "coordinates" };

export function birthHouses(x: BirthHousesInput): BirthHousesResult {
  if (![x.latitude, x.longitude].every(Number.isFinite) || Math.abs(x.latitude) > 90 || Math.abs(x.longitude) > 180) return { kind: "invalid", reason: "coordinates" };
  const t = resolveAstroBirthTime(x.date, x.time, x.timeZone, x.dstChoice ?? "auto");
  if (t.kind === "invalid") return { kind: "invalid", reason: t.reason };
  if (t.kind === "gap") return { kind: "gap" };
  if (t.kind === "ambiguous") return { kind: "ambiguous", options: t.options };
  const flags: ConfidenceFlag[] = [];
  if (t.ambiguousResolved) flags.push("dst_choice_applied");
  if (Number(x.date.slice(0, 4)) < 1970) flags.push("historical_timezone");
  if (t.offsetSeconds % 60 !== 0) flags.push("non_minute_offset");
  const houses = computeHousesAt(x.system, Date.parse(t.utcIso), x.latitude, x.longitude);
  // `sky` iç çerçevesi dışarı taşınmaz (kanonik çıktı yalnız ProHousesResult).
  const { sky: _sky, ...rest } = houses as ProHousesResult & { sky?: unknown };
  void _sky;
  return { kind: "ok", utcIso: t.utcIso, offsetSeconds: t.offsetSeconds, houses: rest as ProHousesResult, confidence: { flags } };
}
