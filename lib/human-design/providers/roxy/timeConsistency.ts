// HD-15 — Roxy doğum anı tutarlılık denetimi (SAF, server-only, sağlayıcıya ÇAĞRI YOK).
//
// SORUN: Yaşam Sistemi doğum anını (UTC) IANA saat dilimiyle KENDİSİ çözer; Roxy'ye ise yerel
// saat + IANA adı gönderilir ve Roxy kendi saat dilimi çözümlemesini yapar. Roxy yanıtında doğum
// anının UTC değeri YOKTUR (resmî OpenAPI: yalnız `designInstantUtc`). Bu yüzden doğrudan
// "birthUtc == birthUtc" karşılaştırması mümkün değildir.
//
// ÇÖZÜM (dolaylı ama kesin): Design anı tanım gereği "Güneş'in doğum boylamından 88° geride
// olduğu an"dır. Sunucunun KENDİ doğum anından (birthUtcIso) bağımsız bir efemerisle
// (astronomy-engine; Roxy'den ve dahili HD motorundan bağımsız) beklenen Design anı hesaplanır
// ve Roxy'nin `designInstantUtc`'si ile karşılaştırılır. Roxy farklı bir doğum anı kullandıysa
// (yanlış tz/DST yorumu) Design anı da yaklaşık aynı süre kayar (1 sa doğum kayması → ~1 sa).
//
// Hesap matematiği DEĞİŞMEZ: bu yalnız bir tutarlılık kapısıdır; Roxy sonucu üretilmez/düzeltilmez.
// Kendi hesabımız başarısız olursa (kütüphane hatası) karar "unverifiable" — çağıran kaydı
// ENGELLEMEZ (yalnız loglar); anlamlı UYUŞMAZLIK ise kayıt yapılmamasına yol açar.

import * as Astronomy from "astronomy-engine";

/**
 * Tolerans (dakika). Ölçüm (2026-10-14/15, canlı Roxy yanıtları, 1935–2020): bu modülün beklenen
 * Design anı ile Roxy arasındaki fark ≤ 0,4 dk; bağımsız Swiss Ephemeris ile ≤ 2 sn.
 * 1 saatlik tz/DST hatası ≈ 58–64 dk sapma üretir. 10 dk: yanlış alarm riski ihmal edilebilir,
 * 15 dk'dan büyük her tz/DST hatası (Türkiye ve dünya ofsetlerinin tamamı ≥ 15 dk) yakalanır.
 */
export const HD_DESIGN_INSTANT_TOLERANCE_MINUTES = 10;

const DAY_MS = 86_400_000;

export type DesignInstantCheck =
  | { status: "consistent"; expectedDesignUtcIso: string; deltaMinutes: number }
  | { status: "mismatch"; expectedDesignUtcIso: string; deltaMinutes: number }
  | { status: "unverifiable"; reason: string };

function sunLongitude(date: Date): number {
  // Görünür ekliptik boylam (tarihin ekinoksu) — HD mandalasıyla aynı referans çerçevesi.
  return Astronomy.SunPosition(date).elon;
}

/** Sunucunun doğum anından bağımsız olarak beklenen Design anı (UTC ISO) — bulunamazsa null. */
export function expectedDesignInstantUtc(birthUtcIso: string): string | null {
  const birthMs = Date.parse(birthUtcIso);
  if (!Number.isFinite(birthMs)) return null;
  const target = (((sunLongitude(new Date(birthMs)) - 88) % 360) + 360) % 360;
  // Design anı doğumdan ~85–93 gün önce; arama penceresi 100 gün öncesinden 30 gün.
  const found = Astronomy.SearchSunLongitude(target, new Date(birthMs - 100 * DAY_MS), 30);
  if (!found) return null;
  return found.date.toISOString();
}

export function checkDesignInstantConsistency(
  birthUtcIso: string,
  providerDesignUtcIso: string,
  toleranceMinutes: number = HD_DESIGN_INSTANT_TOLERANCE_MINUTES,
): DesignInstantCheck {
  const providerMs = Date.parse(providerDesignUtcIso);
  if (!Number.isFinite(providerMs)) return { status: "unverifiable", reason: "provider_design_invalid" };
  let expectedIso: string | null;
  try {
    expectedIso = expectedDesignInstantUtc(birthUtcIso);
  } catch {
    return { status: "unverifiable", reason: "ephemeris_error" };
  }
  if (!expectedIso) return { status: "unverifiable", reason: "search_failed" };
  const deltaMinutes = Math.abs(Date.parse(expectedIso) - providerMs) / 60_000;
  const rounded = Math.round(deltaMinutes * 1000) / 1000;
  return deltaMinutes <= toleranceMinutes
    ? { status: "consistent", expectedDesignUtcIso: expectedIso, deltaMinutes: rounded }
    : { status: "mismatch", expectedDesignUtcIso: expectedIso, deltaMinutes: rounded };
}
