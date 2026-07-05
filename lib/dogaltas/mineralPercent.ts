/**
 * lib/dogaltas/mineralPercent.ts — Mineral yüzde (oran) validasyonu (DT-P0-4).
 *
 * Kural: Mineral yüzdesi yalnız 0 ile 100 arasında olabilir.
 *   - BOŞ oran GEÇERLİDİR (opsiyonel — mevcut davranış korunur; oran çoğu veride boştur).
 *   - Doluysa: virgül→nokta çevrilir, sayı olmalı, 0..100 aralığında olmalı.
 *   - NaN / Infinity / harf / çöp / çok büyük sayı reddedilir.
 *   - Toplam %100 zorunluluğu YOKTUR (bu fazın kapsamı dışı).
 *
 * assignments.Mineraller yapısı: string[][] — her satır [mineralAdı, "Oran %"].
 * Oran 2. sütundur. Yalnız "Mineraller" bölümü kontrol edilir.
 */

export const MINERAL_PERCENT_ERROR = "Mineral yüzdesi 0 ile 100 arasında olmalıdır.";

export type MineralPercentResult = { ok: boolean; value: string; error?: string };

/**
 * Tek oran değerini doğrular ve normalleştirir.
 * Boş/yalnız-boşluk → { ok:true, value:"" } (oran yok — kabul).
 * Doluysa 0..100 sayı olmalı; değilse { ok:false, error }.
 * Başarılıysa value virgül→nokta normalleştirilmiş string döner.
 */
export function parseMineralPercent(raw: unknown): MineralPercentResult {
  if (raw == null) return { ok: true, value: "" };
  const s = String(raw).trim();
  if (s === "") return { ok: true, value: "" };

  const normalized = s.replace(",", ".");
  // Yalnız sayı formatı: opsiyonel işaret + (12 | 12.5 | .5 | 12.). Harf/boşluk/çift-nokta reddedilir.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) {
    return { ok: false, value: s, error: MINERAL_PERCENT_ERROR };
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { ok: false, value: s, error: MINERAL_PERCENT_ERROR };
  }
  return { ok: true, value: normalized };
}

/**
 * assignments.Mineraller içindeki tüm oran (2. sütun) değerlerini doğrular.
 * Geçersiz oran varsa { ok:false, error }. Başarılıysa oranları normalleştirilmiş
 * yeni assignments nesnesi döner (diğer bölümlere/sütunlara dokunmadan).
 * Mineraller yoksa / assignments geçersizse → { ok:true } (dokunmaz).
 */
export function validateMineralAssignments(
  assignments: unknown,
): { ok: boolean; error?: string; value?: unknown } {
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
    return { ok: true, value: assignments };
  }
  const obj = assignments as Record<string, unknown>;
  const mineraller = obj["Mineraller"];
  if (!Array.isArray(mineraller)) return { ok: true, value: assignments };

  const nextRows: unknown[] = [];
  for (const row of mineraller) {
    if (!Array.isArray(row)) {
      nextRows.push(row);
      continue;
    }
    const parsed = parseMineralPercent(row[1]);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const nextRow = [...row];
    if (nextRow.length > 1) nextRow[1] = parsed.value; // normalize oran (virgül→nokta), boşsa ""
    nextRows.push(nextRow);
  }
  return { ok: true, value: { ...obj, Mineraller: nextRows } };
}
