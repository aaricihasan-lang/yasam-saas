/**
 * Karışım oluşturucu — taşıyıcı (sabit) yağ seçimi yarış koruması (AROMA-1).
 *
 * SAF (React/DB yok). Sorun: her taşıyıcı değişiminde fetchOilDetail çağrılıyor ve yanıt
 * hangi seçime ait olduğuna bakılmadan uygulanıyordu → A'nın yavaş yanıtı, kullanıcı B'yi
 * (veya serbest metin) seçtikten SONRA gelirse A'nın fotosensitivite/kontrendikasyon/güvenlik
 * notları B'nin adı altında görünüyor, kayıt snapshot'ına / yazdırmaya / Word'e akıyordu.
 *
 * Çözüm: her seçim yeni bir istek belirteci (token) alır; yanıt YALNIZ token hâlâ güncelse VE
 * aynı taşıyıcı id'sine aitse uygulanır. Serbest metin / boş seçim / kayıt yükleme / form
 * sıfırlama da yeni token açar → bekleyen tüm eski yanıtlar yok sayılır.
 */

import { derivePhotosensitivity, type PhotosensitivityStatus } from "@/lib/aromaterapi/oilFields";

/** Taşıyıcı güvenlik snapshot'ı + hangi taşıyıcı id'sine ait olduğu (`forId`). */
export type CarrierSafety = {
  forId: string | null;
  photo: PhotosensitivityStatus;
  contra: string;
  notes: string;
};

/** Bilinmeyen / yüklenemeyen / serbest metin taşıyıcı → 'unknown' + boş (güvenli DEMEZ). */
export function emptyCarrierSafety(forId: string | null): CarrierSafety {
  return { forId, photo: "unknown", contra: "", notes: "" };
}

type CarrierOilLike = {
  is_photosensitive?: unknown;
  photosensitivity_status?: unknown;
  contraindications?: string | null;
  safety_notes?: string | null;
};

export function carrierSafetyFromOil(forId: string, oil: CarrierOilLike | null): CarrierSafety {
  if (!oil) return emptyCarrierSafety(forId);
  return {
    forId,
    photo: derivePhotosensitivity(oil),
    contra: oil.contraindications ?? "",
    notes: oil.safety_notes ?? "",
  };
}

/** İstek sırası kapısı: son seçim dışındaki tüm yanıtlar geçersizdir. */
export type CarrierSelectionGate = {
  /** Yeni seçim başlat (id null = serbest metin/boş). Önceki bekleyen yanıtlar geçersizleşir. */
  begin(carrierId: string | null): number;
  /** Bu token + id hâlâ güncel seçim mi? */
  isCurrent(token: number, carrierId: string | null): boolean;
  /** Güncel token için yanıt bekleniyor mu? */
  isPending(): boolean;
  /** Güncel token'ın yanıtı geldi (uygulandı). */
  settle(token: number): void;
  /** Kayıt yükleme / form sıfırlama: bekleyen TÜM yanıtları geçersiz kıl (fetch yok). */
  invalidate(): void;
};

export function createCarrierSelectionGate(): CarrierSelectionGate {
  let seq = 0;
  let currentId: string | null = null;
  let pendingToken: number | null = null;
  return {
    begin(carrierId) {
      seq += 1;
      currentId = carrierId;
      pendingToken = carrierId ? seq : null;
      return seq;
    },
    isCurrent(token, carrierId) {
      return token === seq && carrierId === currentId;
    },
    isPending() {
      return pendingToken !== null && pendingToken === seq;
    },
    settle(token) {
      if (token === pendingToken) pendingToken = null;
    },
    invalidate() {
      seq += 1;
      currentId = null;
      pendingToken = null;
    },
  };
}

type DetailLoader = (id: string) => Promise<{ oil: CarrierOilLike | null; error: string | null }>;

/**
 * Taşıyıcı seçimini çözer: id yoksa hemen boş snapshot uygular; id varsa detayı yükler ve
 * YALNIZ hâlâ güncel ise `apply` çağırır. Dönüş: "applied" | "ignored" (eski yanıt) | "none".
 * Ağ hatası (`load` throw) da 'unknown' snapshot olarak uygulanır (güncelse) — asla eski veri.
 */
export async function resolveCarrierSelection(
  gate: CarrierSelectionGate,
  carrierId: string | null,
  load: DetailLoader,
  apply: (safety: CarrierSafety) => void,
): Promise<"applied" | "ignored" | "none"> {
  const token = gate.begin(carrierId);
  if (!carrierId) {
    apply(emptyCarrierSafety(null));
    return "none";
  }
  let safety: CarrierSafety;
  try {
    const { oil, error } = await load(carrierId);
    safety = error || !oil ? emptyCarrierSafety(carrierId) : carrierSafetyFromOil(carrierId, oil);
  } catch {
    safety = emptyCarrierSafety(carrierId);
  }
  if (!gate.isCurrent(token, carrierId)) return "ignored"; // kullanıcı bu arada başka seçim yaptı
  gate.settle(token);
  apply(safety);
  return "applied";
}

/**
 * Kayıt/yazdırma kapısı: taşıyıcı güvenlik verisi yükleniyorsa veya snapshot seçili taşıyıcıya
 * ait değilse işlem engellenir (yanlış eşleşmiş güvenlik verisi kalıcılaşmasın). null = izinli.
 */
export function carrierSaveBlockReason(s: {
  carrierId: string | null;
  carrierLoading: boolean;
  carrierSafetyFor: string | null;
}): string | null {
  if (s.carrierLoading) {
    return "Taşıyıcı yağın güvenlik bilgisi yükleniyor. Birkaç saniye sonra tekrar deneyin.";
  }
  if ((s.carrierId ?? null) !== (s.carrierSafetyFor ?? null)) {
    return "Taşıyıcı yağın güvenlik bilgisi seçili yağla eşleşmiyor. Taşıyıcıyı yeniden seçip tekrar deneyin.";
  }
  return null;
}
