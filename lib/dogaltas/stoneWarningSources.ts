/**
 * Doğaltaş — taşın ETKİN güvenlik uyarı metni (TAS-03 / TAS-05b). SUNUCU yardımcısı.
 *
 * Neden: Bilgi kaydı modeli (20271016000000) ile "Uyarılar" alanı üç yerde yaşayabilir:
 *   1) stones.warning_text            — eski birincil metin (henüz dönüştürülmemiş)
 *   2) stone_sources.warning_text     — eski ek kaynak metinleri (WT9)
 *   3) stone_entries (field_key = 'warning_text') — yeni bilgi kayıtları
 * Eski metin düzenlenince dogaltas_stone_legacy_entry() onu (3)'e taşır ve (1)/(2)'yi NULL yapar.
 * Uyarıyı yalnız (1)'den okuyan tüketiciler (danışana taş atama uyarısı, kombinasyon sepeti,
 * "yalnız uyarılı" filtresi) bu yüzden uyarıyı kaybediyordu. Bu yardımcı üçünü BİRLİKTE okur;
 * VERİ DEĞİŞTİRMEZ, yeni metin ÜRETMEZ — yalnız uzmanın kaydettiği metinleri aynen birleştirir.
 *
 * Sıra: Doğaltaş detay gösterimiyle aynı (lib/dogaltas/stoneEntries.ts): eski birincil
 * (LEGACY_PRIMARY_ORDER) → eski ek kaynaklar (kaynak sırasıyla) → kayıtlar (sort_order).
 *
 * Tenant: her sorgu `.in("tenant_id", tenantIds)` — çağıran oturumdan türetilmiş listeyi verir
 * (stoneReadTenantIds). Migration öncesi şema (tablo yok) → o kaynak boş sayılır (eski davranış).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, fetchAllRowsByIds, type PageQueryResult } from "@/lib/dogaltas/fetchAllRows";
import { isEntriesSchemaMissing } from "@/lib/dogaltas/stoneEntriesServer";
import { isSourcesSchemaMissing } from "@/lib/dogaltas/stoneSourcesServer";
import { LEGACY_PRIMARY_ORDER, legacySortOrder } from "@/lib/dogaltas/stoneEntries";

type PgErr = { code?: string; message?: string } | null | undefined;

export type WarningPart = { order: number; text: string };

/**
 * Uyarı parçalarını gösterim sırasıyla tek metne çevirir. Boş/yalnız boşluk parçalar atlanır,
 * aynı metin (boşluk farkı yok sayılarak) bir kez yazılır. Hiç metin yoksa null.
 */
export function mergeWarningTexts(parts: readonly WarningPart[]): string | null {
  const sorted = parts
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => a.order - b.order || a.i - b.i);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of sorted) {
    const text = typeof p.text === "string" ? p.text.trim() : "";
    if (!text) continue;
    const key = text.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.length ? out.join("\n\n") : null;
}

/** Taşın birincil warning_text'i + ek parçaları → etkin uyarı metni (yoksa null). */
export function effectiveWarningText(primary: unknown, extra: readonly WarningPart[] | undefined): string | null {
  const parts: WarningPart[] = [];
  if (typeof primary === "string") parts.push({ order: LEGACY_PRIMARY_ORDER, text: primary });
  if (extra?.length) parts.push(...extra);
  return mergeWarningTexts(parts);
}

function push(map: Map<string, WarningPart[]>, stoneId: string, part: WarningPart) {
  const list = map.get(stoneId);
  if (list) list.push(part);
  else map.set(stoneId, [part]);
}

/**
 * Taşların EK uyarı parçaları (stone_sources + stone_entries; birincil hariç).
 * `stoneIds` verilirse yalnız o taşlar (150'lik parçalar), null ise tenant'ların tamamı.
 * Şema eksikse o kaynak atlanır; diğer DB hataları fırlatılır (uyarı sessizce kaybolmasın).
 */
export async function loadExtraWarningParts(
  db: SupabaseClient,
  tenantIds: readonly string[],
  stoneIds: readonly string[] | null,
): Promise<Map<string, WarningPart[]>> {
  const out = new Map<string, WarningPart[]>();
  if (tenantIds.length === 0 || (stoneIds && stoneIds.length === 0)) return out;
  const tenants = [...tenantIds];

  const read = <T>(table: "stone_sources" | "stone_entries", select: string, warningField: boolean) => {
    const page = (chunk: string[] | null, from: number, to: number): PromiseLike<PageQueryResult> => {
      let q = db.from(table).select(select).in("tenant_id", tenants);
      if (chunk) q = q.in("stone_id", chunk);
      if (warningField) q = q.eq("field_key", "warning_text");
      return q.order("stone_id", { ascending: true }).order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
    };
    return stoneIds
      ? fetchAllRowsByIds<T>(stoneIds, (chunk, from, to) => page(chunk, from, to))
      : fetchAllRows<T>((from, to) => page(null, from, to));
  };

  // (2) Eski ek kaynaklar — sıra indeksi taşın TÜM ek kaynakları üzerinden (detay gösterimiyle aynı).
  const src = await read<{ stone_id: unknown; warning_text: unknown }>(
    "stone_sources", "id, stone_id, sort_order, created_at, warning_text", false,
  );
  if (!src.ok) {
    if (!isSourcesSchemaMissing(src.error as PgErr)) throw src.error;
  } else {
    const idx = new Map<string, number>();
    for (const r of src.rows) {
      const k = String(r.stone_id);
      const i = idx.get(k) ?? 0;
      idx.set(k, i + 1);
      if (typeof r.warning_text === "string" && r.warning_text.trim()) {
        push(out, k, { order: legacySortOrder(i), text: r.warning_text });
      }
    }
  }

  // (3) Bilgi kayıtları — yalnız "Uyarılar" alanı.
  const ent = await read<{ stone_id: unknown; content: unknown; sort_order: unknown }>(
    "stone_entries", "id, stone_id, sort_order, created_at, content", true,
  );
  if (!ent.ok) {
    if (!isEntriesSchemaMissing(ent.error as PgErr)) throw ent.error;
  } else {
    for (const r of ent.rows) {
      if (typeof r.content !== "string" || !r.content.trim()) continue;
      const order = Number(r.sort_order);
      push(out, String(r.stone_id), { order: Number.isFinite(order) ? order : 0, text: r.content });
    }
  }

  return out;
}
