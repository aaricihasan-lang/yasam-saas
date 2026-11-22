/**
 * Şifa Rehberi V2 — Çöp Kutusu kalıcı temizliği (30 gün). Zamanlanmış işten çağrılır.
 * Sıra (veri kaybını ve yetim nesneyi önler):
 *   1) DB'den adaylar (yalnız KİŞİSEL kayıtlar; kurum kayıtlarına dokunulmaz),
 *   2) adayların YÜKLENMİŞ görsel nesneleri Storage'dan silinir,
 *   3) yalnız nesnesi GERÇEKTEN silinen görsellerin satırları + görselsiz kalan kutu/konular silinir.
 * Nesnesi silinemeyen görselin kutusu bu turda KALIR (sonraki tur yeniden dener) → DB'de iz kaybolmaz.
 */
import type { SifaV2Db } from "@/lib/sifa-rehberi-v2/server/service";
import type { SifaV2Storage } from "@/lib/sifa-rehberi-v2/server/storage";

export const TRASH_RETENTION_DAYS = 30;

export type PurgeReport = { candidates: { topics: number; blocks: number; assets: number }; removedObjects: number; failedObjects: number; deleted: { assets: number; blocks: number; topics: number } };

export async function purgeTrash(db: SifaV2Db, storage: SifaV2Storage, now = new Date()): Promise<PurgeReport> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const cand = (await db.rpc("sifa_v2_trash_candidates", { p_cutoff: cutoff })) as {
    topics: string[];
    blocks: string[];
    assets: { id: string; bucket: string; storage_path: string }[];
  };
  const removedIds: string[] = [];
  let failed = 0;
  const byBucket = new Map<string, { id: string; path: string }[]>();
  for (const a of cand.assets ?? []) {
    const arr = byBucket.get(a.bucket) ?? [];
    arr.push({ id: a.id, path: a.storage_path });
    byBucket.set(a.bucket, arr);
  }
  for (const [bucket, items] of byBucket) {
    const removed = new Set(await storage.remove(bucket, items.map((x) => x.path)));
    for (const it of items) {
      if (removed.has(it.path)) removedIds.push(it.id);
      else failed++;
    }
  }
  const del = (await db.rpc("sifa_v2_trash_purge", { p_cutoff: cutoff, p_removed_assets: removedIds })) as PurgeReport["deleted"];
  return {
    candidates: { topics: cand.topics?.length ?? 0, blocks: cand.blocks?.length ?? 0, assets: cand.assets?.length ?? 0 },
    removedObjects: removedIds.length,
    failedObjects: failed,
    deleted: del,
  };
}
