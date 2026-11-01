import "server-only";
/**
 * KİŞİSEL DİJİTAL OFİS — SAATLİK geçici yükleme temizliği (server-only, scheduled; Owner mimari kararı B, 2026-11-01).
 * ============================================================================
 *
 * Tamamlama / iptal yolu geçici parçaları kendisi siler; bu iş kaçırılanları toplar:
 *   - süresi (15 dk) geçmiş AÇIK oturumlar ve kilidi düşmüş (çökmüş) İŞLENEN oturumlar → iptal + staging parçaları silinir,
 *   - tamamlanmış / iptal edilmiş ama geçici dosyası silinememiş oturumlar → staging parçaları silinir.
 * Yalnız `expert-workspace-staging` bucket'ına ve upload satırına dokunur; kalıcı görsellere (expert-workspace) ASLA.
 *
 * - Saatlik off-minute (UTC xx:23) · concurrency 1 · retries 3: herhangi bir silme başarısızsa iş sonunda hata fırlatılır →
 *   Inngest yeniden dener (iş idempotent; zaten silinen / kapanan oturum tekrar işlenmez).
 * - Migration henüz uygulanmamışsa (tablo yok) sessizce { status: "not_ready" } döner (yeniden deneme / gürültü yok).
 * - Tek çalıştırmada sınırlı iş (MAX_UPLOADS); kalan bir sonraki saatte.
 * - Log'da yalnız sayılar — yol / kullanıcı / tenant LOGLANMAZ.
 */
import { inngest } from "@/lib/inngest/client";
import { getServerDb } from "@/lib/supabase-server";
import { cleanupStaging } from "@/lib/workspace/assets";

export const WORKSPACE_STAGING_CLEANUP_CRON = "23 * * * *";
export const WORKSPACE_STAGING_CLEANUP_RETRIES = 3;
const MAX_UPLOADS = 500;

const isMissingTable = (cause: unknown) => {
  const c = cause as { code?: string; message?: string } | null;
  return c?.code === "42P01" || c?.code === "PGRST205" || /does not exist|schema cache/i.test(String(c?.message ?? ""));
};

/** Inngest dışında da çağrılabilen çekirdek (test / elle çalıştırma). Hata varsa fırlatır → Inngest yeniden dener. */
export async function runWorkspaceStagingCleanup() {
  const db = getServerDb();
  const r = await cleanupStaging(db, { limit: MAX_UPLOADS });
  if (!("scanned" in r)) {
    if (isMissingTable(r.cause)) return { status: "not_ready" as const };
    console.error("[workspace-staging-cleanup] liste okunamadı");
    throw new Error("workspace-staging-cleanup: liste okunamadı");
  }
  console.log(`[workspace-staging-cleanup] taranan=${r.scanned} iptal=${r.aborted} temizlenen=${r.cleared} hata=${r.failed}`);
  if (r.failed > 0) throw new Error(`workspace-staging-cleanup: ${r.failed} oturum temizlenemedi (yeniden denenecek)`);
  return { status: "ok" as const, ...r };
}

export const workspaceStagingCleanupFunction = inngest.createFunction(
  {
    id: "workspace-staging-hourly-cleanup",
    name: "Kişisel Ofis Geçici Yükleme Saatlik Temizlik",
    concurrency: 1,
    retries: WORKSPACE_STAGING_CLEANUP_RETRIES,
    triggers: [{ cron: WORKSPACE_STAGING_CLEANUP_CRON }],
  },
  async () => runWorkspaceStagingCleanup(),
);
