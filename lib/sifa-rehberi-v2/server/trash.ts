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

/** Kaydedilmemiş / içerikten çıkarılmış görsel için bekleme (gün). Açık editörde uzun süre bekleyen yükleme korunur. */
export const ORPHAN_UPLOAD_GRACE_DAYS = 7;

export type LifecycleOptions = {
  now?: Date;
  /** Varsayılan TRUE: yalnız aday raporu; hiçbir nesne/satır silinmez. */
  dryRun?: boolean;
  /** Yalnız bu tenant (kademeli açılış). Verilmezse tüm tenant'lar. */
  tenantId?: string | null;
  graceDays?: number;
  limit?: number;
};

export type LifecycleReport = PurgeReport & { dryRun: boolean; strayObjects: number; removedStray: number };

const OWN_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;

/**
 * Görsel yaşam döngüsü (migration 20280124000000): çöp süresi dolan kişisel kayıtlar + KULLANILMAYAN yüklemeler +
 * DB satırı olmayan yarım nesneler. Koruma: aynı sahibin canlı ya da geri yüklenebilir (çöpte, süresi dolmamış)
 * herhangi bir kutusunda `sifa-asset:<id>` geçen görsel ASLA aday olmaz (DB kuralı: sifa_v2__asset_in_use).
 * Zamanlanmış iş KURULMAZ; Owner onayıyla elle/cron ile çağrılır. Varsayılan kuru çalışmadır.
 */
export async function runAssetLifecycle(db: SifaV2Db, storage: SifaV2Storage, opts: LifecycleOptions = {}): Promise<LifecycleReport> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun !== false;
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  const uploadCutoff = new Date(now.getTime() - (opts.graceDays ?? ORPHAN_UPLOAD_GRACE_DAYS) * 86_400_000).toISOString();
  const tenant = opts.tenantId ?? null;
  const cand = (await db.rpc("sifa_v2_gc_candidates", { p_cutoff: cutoff, p_upload_cutoff: uploadCutoff, p_tenant: tenant, p_limit: opts.limit ?? 500 })) as {
    topics: string[];
    blocks: string[];
    assets: { id: string; bucket: string; storage_path: string }[];
    stray_objects: string[];
  };
  const assets = (cand.assets ?? []).filter((a) => a.bucket === "sifa-arastirma" && OWN_PATH.test(a.storage_path));
  const stray = (cand.stray_objects ?? []).filter((p) => OWN_PATH.test(p));
  const base = {
    candidates: { topics: cand.topics?.length ?? 0, blocks: cand.blocks?.length ?? 0, assets: assets.length },
    strayObjects: stray.length,
  };
  if (dryRun) {
    return { ...base, dryRun: true, removedObjects: 0, failedObjects: 0, removedStray: 0, deleted: { assets: 0, blocks: 0, topics: 0 } };
  }
  const removed = new Set(assets.length ? await storage.remove("sifa-arastirma", assets.map((a) => a.storage_path)) : []);
  const removedIds = assets.filter((a) => removed.has(a.storage_path)).map((a) => a.id);
  const removedStray = stray.length ? (await storage.remove("sifa-arastirma", stray)).length : 0;
  const del = (await db.rpc("sifa_v2_gc_purge", { p_cutoff: cutoff, p_tenant: tenant, p_removed_assets: removedIds })) as PurgeReport["deleted"];
  return { ...base, dryRun: false, removedObjects: removedIds.length, failedObjects: assets.length - removedIds.length, removedStray, deleted: del };
}
