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

export type AutoCalcRow = {
  id: string;
  birth_date: string | null;
  birth_time?: string | null;
  birth_place: string | null;
  timezone: string | null;
  engine_version?: string | null;
  created_at?: string;
};

export type AutoCalcLocation = { id: string; label: string; tz: string };

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

  const match = roxy.find(
    (r) => (r.birth_date ?? "").slice(0, 10) === date && hms(r.birth_time) === time && r.birth_place === location.label && r.timezone === location.tz,
  );
  if (match) return { kind: "open", location, chartId: match.id };
  if (roxy.length > 0) return { kind: "changed", location, previousId: roxy[0].id };
  return { kind: "new", location };
}
