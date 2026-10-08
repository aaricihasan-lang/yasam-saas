// Danışan Detayı → otomatik hesaplama paneli DURUM KARARI (SAF; istemci + test).
//
// Roxy'ye istek atmadan, kayıtlı hesaplanmış haritalarla açık danışanın KAYITLI doğum verisini
// karşılaştırır:
//   missing_birth  → doğum tarihi/saati eksik
//   need_location  → doğum yeri listeden seçilmemiş (serbest metin tz kabul edilmez)
//   open           → aynı girdiyle hesaplanmış harita VAR → "Profesyonel haritayı aç" (kredi yok)
//   changed        → önceki Roxy haritası var ama girdi farklı → "Yeniden hesapla"
//   new            → hiç Roxy haritası yok → "Hesapla"
// Sunucu ayrıca idempotent (input_hash); bu fonksiyon yalnız doğru düğmeyi seçer.

import { toHms } from "../api/birthTimeResolution";
import { sameHdLocationId } from "../location/trDistrictIndex";

export type AutoCalcRow = {
  id: string;
  location_id?: string | null;
  birth_date: string | null;
  birth_time?: string | null;
  birth_place: string | null;
  timezone: string | null;
  engine_version?: string | null;
  created_at?: string;
};

/** id: hesap ucuna gönderilen referans; locationId: kalıcı konum kimliği (biliniyorsa). */
export type AutoCalcLocation = { id: string; label: string; tz: string; locationId?: string | null };

/** Konumun kalıcı kimliği: açık locationId > imzalı Roxy ref içindeki kimlik > yerel kimlik. */
export function stableLocationId(loc: AutoCalcLocation): string | null {
  if (loc.locationId) return loc.locationId;
  if (loc.id === "client" || loc.id.startsWith("chart:")) return null;
  if (loc.id.startsWith("rx1.")) {
    try {
      const body = loc.id.slice(4, loc.id.lastIndexOf("."));
      const b64 = body.replace(/-/g, "+").replace(/_/g, "/");
      const json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
      const arr = JSON.parse(decodeURIComponent(escape(json))) as unknown[];
      return typeof arr[0] === "string" ? arr[0] : null;
    } catch {
      return null;
    }
  }
  return loc.id;
}

export type AutoCalcState =
  | { kind: "missing_birth"; location: AutoCalcLocation | null }
  | { kind: "need_location"; location: null }
  | { kind: "open"; location: AutoCalcLocation; chartId: string }
  | { kind: "changed"; location: AutoCalcLocation; previousId: string }
  | { kind: "new"; location: AutoCalcLocation };

export const isRoxyRow = (r: AutoCalcRow) => (r.engine_version ?? "").startsWith("roxyapi");
const hms = (t: string | null | undefined) => (t ? toHms(t) : null);

export function resolveAutoCalcState(input: {
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  picked: AutoCalcLocation | null;
  rows: AutoCalcRow[];
}): AutoCalcState {
  // Liste API'si created_at azalan döner; yine de deterministik sırala.
  const roxy = input.rows.filter(isRoxyRow).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  // Kayıtlı doğum yeri etiketi önceki Roxy haritasıyla aynıysa o konum sunucuda yeniden kullanılır.
  const reuse = !input.picked && input.birthPlace
    ? roxy.find((r) => r.birth_place === input.birthPlace && r.timezone)
    : undefined;
  const location: AutoCalcLocation | null =
    input.picked ?? (reuse ? { id: `chart:${reuse.id}`, label: reuse.birth_place!, tz: reuse.timezone! } : null);

  const date = (input.birthDate ?? "").slice(0, 10);
  const time = hms(input.birthTime);
  if (!date || !time) return { kind: "missing_birth", location };
  if (!location) return { kind: "need_location", location: null };

  const locId = stableLocationId(location);
  // Aynı yer: kalıcı konum kimliği eşit (etiket biçimi değişse bile; eski Roxy/il kimliği ↔ yeni
  // ilçe kimliği doğrulanmış takma adla eşdeğer) VEYA etiket eşit; tz de eşit.
  const samePlace = (r: AutoCalcRow) =>
    r.timezone === location.tz && ((!!locId && sameHdLocationId(r.location_id, locId)) || r.birth_place === location.label);
  const match = roxy.find(
    (r) => (r.birth_date ?? "").slice(0, 10) === date && hms(r.birth_time) === time && samePlace(r),
  );
  if (match) return { kind: "open", location, chartId: match.id };
  if (roxy.length > 0) return { kind: "changed", location, previousId: roxy[0].id };
  return { kind: "new", location };
}
