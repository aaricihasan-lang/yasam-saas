/**
 * Admin → Uzman Veri Aktarım Merkezi — M:N (junction) ara tablo FK REMAP saf mantığı.
 *
 * NEDEN AYRI/SAF: junction remap kararı (iki FK'yi de hedef snapshot id'lerine çevir;
 * iki parent'tan biri batch'te yoksa dangling ÜRETME → atla) DB'siz birim test edilebilsin
 * diye saf fonksiyona ayrıldı. Route (cloneJunctionGroup) bunu kullanır; harness bunu
 * doğrudan import edip davranışsal test eder (mevcut relational FK-remap deseninin M:N
 * uzantısıdır — YENİ ürün davranışı değil).
 *
 * BAĞLAYICI: hedef payload'da KAYNAK UUID kalmaz — her iki FK de aynı batch'te oluşturulan
 * uzman kayıtlarının id'lerine remap edilir (mapA/mapB, kaynak→hedef).
 */

export type JunctionRemapInput = {
  /** Kaynak junction satırları (SELECT *). */
  rows: Record<string, unknown>[];
  /** Yalnız bu meta alanları kopyalanır (FK'ler + tenant/provenance ayrıca yazılır). */
  copyFields: readonly string[];
  /** Birinci FK kolon adı (ör. point_id). */
  fkA: string;
  /** İkinci FK kolon adı (ör. topic_id). */
  fkB: string;
  /** fkA için kaynak→hedef id haritası (parent grubun bu batch'teki readback'i). */
  mapA: Map<string, string>;
  /** fkB için kaynak→hedef id haritası. */
  mapB: Map<string, string>;
  targetTenantId: string;
  batchId: string;
  nowIso: string;
};

export type JunctionRemapResult = {
  /** INSERT edilecek hedef payload'lar (kaynak UUID İÇERMEZ). */
  payloads: Record<string, unknown>[];
  /** İşlenen kaynak satır sayısı. */
  requested: number;
  /** İki parent'tan biri batch'te yok → dangling üretmemek için ATLANAN satır sayısı. */
  skipped: number;
};

/**
 * Junction satırlarını hedef tenant için remap eder.
 *
 * DAVRANIŞ (mevcut relational-child fk-remap ile aynı ilke):
 *   - Her iki FK de mapA/mapB'de bulunmalı → aksi halde satır ATLANIR (skip++), asla
 *     source UUID veya cross-tenant/dangling bağ üretilmez.
 *   - Bulunanlarda: copy[fkA]=hedefA, copy[fkB]=hedefB, tenant_id=hedef, iç provenance
 *     (origin_source_id/batch/transferred_at) yazılır (rollback + audit için).
 */
export function remapJunctionRows(input: JunctionRemapInput): JunctionRemapResult {
  const { rows, copyFields, fkA, fkB, mapA, mapB, targetTenantId, batchId, nowIso } = input;
  const payloads: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of rows) {
    const srcA = typeof row[fkA] === "string" ? (row[fkA] as string) : null;
    const srcB = typeof row[fkB] === "string" ? (row[fkB] as string) : null;
    const tgtA = srcA ? mapA.get(srcA) : undefined;
    const tgtB = srcB ? mapB.get(srcB) : undefined;

    // İki parent mapping de mevcut değilse: dangling FK / source UUID / cross-tenant YOK → atla.
    if (!tgtA || !tgtB) {
      skipped++;
      continue;
    }

    const copy: Record<string, unknown> = {};
    for (const key of copyFields) {
      if (Object.prototype.hasOwnProperty.call(row, key)) copy[key] = row[key];
    }
    // FK REMAP — her iki taraf da YENİ hedef id'ye bağlanır (kaynak id'ye DEĞİL).
    copy[fkA] = tgtA;
    copy[fkB] = tgtB;
    copy.tenant_id = targetTenantId;
    // İç audit/rollback metadata (görünür origin_type/label YAZILMAZ — ürün kuralı).
    copy.origin_source_id = typeof row.id === "string" ? row.id : null;
    copy.origin_transfer_batch_id = batchId;
    copy.transferred_at = nowIso;
    payloads.push(copy);
  }

  return { payloads, requested: rows.length, skipped };
}
