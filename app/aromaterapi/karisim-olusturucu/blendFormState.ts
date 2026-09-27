/**
 * Karışım oluşturucu — form durumu anlık görüntüsü + BASELINE kıyaslı "kirli" (dirty) kararı.
 *
 * SAF (React/DB yok). Neden: eski kural (`ad/not/taşıyıcı dolu || yağ var`) kayıtlı bir
 * karışım yüklendiğinde hiçbir değişiklik yapılmasa bile "kaydedilmemiş" uyarısı veriyor,
 * resetForm ise taşıyıcı alanlarını temizlemediği için kayıttan sonra da kirli kalıyordu.
 * Yeni kural: form, en son yüklenen/kaydedilen/sıfırlanan baseline'dan farklıysa kirlidir.
 */

export type BlendFormItemSnapshot = {
  oil_id: string | null;
  oil_name: string;
  drops: number;
};

export type BlendFormSnapshot = {
  name: string;
  notes: string;
  carrierName: string;
  carrierId: string | null;
  carrierPhoto: string;
  carrierContra: string;
  carrierNotes: string;
  bottleMl: number;
  dilution: number;
  dropsPerMl: number;
  items: readonly BlendFormItemSnapshot[];
};

export const DEFAULT_BLEND_BOTTLE_ML = 30;
export const DEFAULT_BLEND_DILUTION = 2;

/** Yeni (boş) karışım formunun durumu. resetForm bu değerlere döner. */
export function emptyBlendSnapshot(defaultDropsPerMl: number): BlendFormSnapshot {
  return {
    name: "",
    notes: "",
    carrierName: "",
    carrierId: null,
    carrierPhoto: "unknown",
    carrierContra: "",
    carrierNotes: "",
    bottleMl: DEFAULT_BLEND_BOTTLE_ML,
    dilution: DEFAULT_BLEND_DILUTION,
    dropsPerMl: defaultDropsPerMl,
    items: [],
  };
}

/** Kararlı imza: metinler trim'lenir; yağ satırları kimlik + damla ile (sıra korunur). */
export function blendSignature(s: BlendFormSnapshot): string {
  return JSON.stringify({
    name: s.name.trim(),
    notes: s.notes.trim(),
    carrierName: s.carrierName.trim(),
    carrierId: s.carrierId ?? null,
    carrierPhoto: s.carrierPhoto,
    carrierContra: s.carrierContra.trim(),
    carrierNotes: s.carrierNotes.trim(),
    bottleMl: Number(s.bottleMl) || 0,
    dilution: Number(s.dilution) || 0,
    dropsPerMl: Number(s.dropsPerMl) || 0,
    items: s.items.map((it) => [it.oil_id ?? `name:${it.oil_name.trim()}`, Number(it.drops) || 0]),
  });
}

/** Form baseline'dan farklı mı? (yükleme/kayıt/sıfırlama sonrası baseline yenilenir). */
export function isBlendFormDirty(current: BlendFormSnapshot, baseline: BlendFormSnapshot): boolean {
  return blendSignature(current) !== blendSignature(baseline);
}
