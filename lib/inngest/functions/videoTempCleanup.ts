import "server-only";

/**
 * FAZ1 FINAL HARDENING (AUTH / item 11) — GÜNLÜK video-temp TEMİZLİĞİ (server-only, scheduled).
 * ============================================================================
 *
 * Transcribe route'u işi bitirince (başarı/hata) geçici nesneyi `finally` içinde siler ve
 * `video_deleted_at` yazar. Bu iş, o yolun kaçırdığı durumları toplar:
 *   - 24 saatten eski, `video_deleted_at` boş işler (yükleme sonrası hiç işlenmemiş / zaman
 *     aşımına uğramış) → sahip-önek doğrulanmış nesne silinir + `video_deleted_at` set,
 *   - bucket'ta 24 saatten eski SAHİPSİZ/eski nesneler → silinir (son 24 saatte oluşturulmuş
 *     bir işe ait nesneye DOKUNULMAZ). Seçim SAF: lib/video-ceviri/videoTempPath.planVideoTempCleanup.
 *
 * BAĞLAYICI:
 *   - PRODUCTION VARSAYILAN KAPALI: `VIDEO_TEMP_CLEANUP_ENABLED === "true"` değilse hiçbir
 *     DB/IO yapmadan { status: "disabled" } döner (expertStorageSnapshot deseni). Prod'daki
 *     eski nesnelerin silinmesi AŞAMA 3 owner kararıdır → env açılınca ilk çalıştırmada
 *     24 saatten eski TÜM video-temp nesneleri silinir.
 *   - Günde bir off-minute (UTC 04:17) · concurrency 1 · retries 0 (idempotent).
 *   - Tek çalıştırmada sınırlı iş (MAX_JOBS / MAX_OBJECTS) — kalan ertesi gün.
 *   - Log'da yalnız sayılar — yol/PII LOGLANMAZ.
 */

import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import {
  planVideoTempCleanup,
  VIDEO_TEMP_BUCKET,
  VIDEO_TEMP_MAX_AGE_MS,
  type CleanupJob,
  type CleanupObject,
} from "@/lib/video-ceviri/videoTempPath";

export const VIDEO_TEMP_CLEANUP_CRON = "17 4 * * *";
export const VIDEO_TEMP_CLEANUP_ENABLE_FLAG = "VIDEO_TEMP_CLEANUP_ENABLED";
const MAX_JOBS = 500;
const MAX_OBJECTS = 1000;
const LIST_PAGE = 100;
const REMOVE_BATCH = 100;

export function isVideoTempCleanupEnabled(): boolean {
  return process.env[VIDEO_TEMP_CLEANUP_ENABLE_FLAG] === "true";
}

type Db = ReturnType<typeof getServerDb>;

type StorageEntry = { name: string; id: string | null; created_at?: string | null };

/** Bir klasörün TÜM girdilerini sayfalı listeler (boş sayfaya kadar). */
async function listAll(db: Db, prefix: string, cap: number): Promise<StorageEntry[]> {
  const out: StorageEntry[] = [];
  for (let offset = 0; out.length < cap; offset += LIST_PAGE) {
    const { data, error } = await db.storage
      .from(VIDEO_TEMP_BUCKET)
      .list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data || data.length === 0) break;
    out.push(...(data as StorageEntry[]));
    if (data.length < LIST_PAGE) break;
  }
  return out;
}

/** `tenant/job/dosya` üç seviyeli nesneleri toplar (klasörlerin id'si null'dır). */
async function collectObjects(db: Db): Promise<CleanupObject[]> {
  const objects: CleanupObject[] = [];
  const tenants = await listAll(db, "", MAX_OBJECTS);
  for (const t of tenants) {
    if (objects.length >= MAX_OBJECTS) break;
    if (t.id !== null) {
      // Kökte dosya (beklenmeyen) → yaşa göre değerlendirilir.
      objects.push({ path: t.name, created_at: t.created_at ?? null });
      continue;
    }
    const jobs = await listAll(db, t.name, MAX_OBJECTS);
    for (const j of jobs) {
      if (objects.length >= MAX_OBJECTS) break;
      if (j.id !== null) {
        objects.push({ path: `${t.name}/${j.name}`, created_at: j.created_at ?? null });
        continue;
      }
      const files = await listAll(db, `${t.name}/${j.name}`, MAX_OBJECTS);
      for (const f of files) {
        if (f.id === null) continue; // daha derin klasör beklenmez; atla
        objects.push({ path: `${t.name}/${j.name}/${f.name}`, created_at: f.created_at ?? null });
      }
    }
  }
  return objects;
}

export const videoTempCleanupFunction = inngest.createFunction(
  {
    id: "video-temp-daily-cleanup",
    name: "Video Geçici Dosya Günlük Temizlik",
    concurrency: 1,
    retries: 0,
    triggers: [{ cron: VIDEO_TEMP_CLEANUP_CRON }],
  },
  async () => {
    if (!isVideoTempCleanupEnabled()) {
      return { status: "disabled" as const };
    }

    const db = getServerDb();
    const now = Date.now();
    const cutoffIso = new Date(now - VIDEO_TEMP_MAX_AGE_MS).toISOString();

    const { data: staleJobs, error: jobErr } = await db
      .from("video_transcription_jobs")
      .select("id, tenant_id, video_temp_path, video_deleted_at, created_at")
      .is("video_deleted_at", null)
      .lt("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS);
    if (jobErr) {
      console.error("[video-temp-cleanup] job query failed");
      return { status: "error" as const };
    }

    const objects = await collectObjects(db);

    // Bucket'taki nesnelerin ait olduğu SON 24 saatlik işler korunur.
    const objectJobIds = [...new Set(objects.map((o) => o.path.split("/")[1]).filter(Boolean))];
    const recentJobs: CleanupJob[] = [];
    for (let i = 0; i < objectJobIds.length; i += REMOVE_BATCH) {
      const ids = objectJobIds.slice(i, i + REMOVE_BATCH);
      const { data, error } = await db
        .from("video_transcription_jobs")
        .select("id, tenant_id, video_temp_path, video_deleted_at, created_at")
        .in("id", ids)
        .gte("created_at", cutoffIso);
      if (error) {
        // Hangi nesnenin taze işe ait olduğu bilinemiyorsa hiçbir nesne SİLİNMEZ (güvenli taraf).
        console.error("[video-temp-cleanup] recent-job query failed");
        return { status: "error" as const };
      }
      recentJobs.push(...((data ?? []) as CleanupJob[]));
    }

    const plan = planVideoTempCleanup(
      [...((staleJobs ?? []) as CleanupJob[]), ...recentJobs],
      objects,
      now,
    );

    let deletedObjects = 0;
    let failedBatches = 0;
    for (let i = 0; i < plan.objectPathsToDelete.length; i += REMOVE_BATCH) {
      const batch = plan.objectPathsToDelete.slice(i, i + REMOVE_BATCH);
      const { error } = await db.storage.from(VIDEO_TEMP_BUCKET).remove(batch);
      if (error) failedBatches += 1;
      else deletedObjects += batch.length;
    }

    let markedJobs = 0;
    // Silme hatası olduysa işaretleme yapılmaz → ertesi gün yeniden denenir.
    if (failedBatches === 0) {
      for (let i = 0; i < plan.jobIdsToMark.length; i += REMOVE_BATCH) {
        const ids = plan.jobIdsToMark.slice(i, i + REMOVE_BATCH);
        const { error } = await db
          .from("video_transcription_jobs")
          .update({ video_deleted_at: new Date().toISOString() })
          .in("id", ids)
          .is("video_deleted_at", null);
        if (!error) markedJobs += ids.length;
      }
    }

    console.info(
      "[video-temp-cleanup]",
      JSON.stringify({ status: "ok", deletedObjects, markedJobs, failedBatches }),
    );
    return { status: "ok" as const, deletedObjects, markedJobs, failedBatches };
  },
);
