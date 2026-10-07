/**
 * OWNER-ONLY ARŞİV UZMAN KALICI SİLME — politika + saf yardımcılar + Storage temizliği.
 *
 * YETKİ KURALI (Hasan Hoca, 2026-10-07):
 *   - Kalıcı uzman silme YALNIZ sistem sahibindedir: public.users.is_super_admin = true
 *     (sistemde en fazla 1; uq_users_single_super_admin). Kontrol hem route'ta (requireMainAdmin)
 *     hem DB fonksiyonunda (admin_purge_archived_expert → UP003) yapılır.
 *   - "admin" rolü bu yetkiyi VERMEZ. Normal admin arşivleyebilir / yeniden aktifleştirebilir,
 *     kalıcı silemez (403).
 *   - Başka bir admine yetki açmak ancak bilinçli KOD + MIGRATION değişikliğiyle mümkündür;
 *     şu an hiçbir ek admin yetkili DEĞİLDİR.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { storagePrefix } from "@/lib/backup/storagePaths";

/** Arşiv kapsamı (GET /api/admin/users/archive ile aynı): onaylı, pasif uzman. */
export type PurgeTargetRow = {
  role?: unknown;
  approval_status?: unknown;
  active?: unknown;
  is_super_admin?: unknown;
  is_demo_account?: unknown;
};

export type PurgeEligibility = { ok: true } | { ok: false; status: number; error: string };

export function checkPurgeEligibility(row: PurgeTargetRow): PurgeEligibility {
  if (String(row.role ?? "").trim().toLowerCase() !== "expert" || row.is_super_admin === true) {
    return { ok: false, status: 400, error: "Yalnız uzman hesapları kalıcı olarak silinebilir." };
  }
  if (String(row.approval_status ?? "") !== "approved" || row.active !== false) {
    return { ok: false, status: 409, error: "Yalnız arşivdeki (pasife alınmış) uzmanlar kalıcı olarak silinebilir." };
  }
  if (row.is_demo_account === true) {
    return { ok: false, status: 400, error: "Demo hesabı kalıcı olarak silinemez." };
  }
  return { ok: true };
}

/** E-posta doğrulaması: baş/son boşluk + büyük/küçük harf farkı yok sayılır. */
export function normalizePurgeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function purgeEmailMatches(typed: unknown, actual: unknown): boolean {
  const a = normalizePurgeEmail(actual);
  return a.length > 0 && normalizePurgeEmail(typed) === a;
}

/** Owner'ın yazması gereken son onay ifadesi (aşama 3). */
export const PURGE_FINAL_PHRASE = "KALICI OLARAK SİL";

/** DB fonksiyonu hata kodu → HTTP durum + kullanıcı mesajı (ham SQL hatası sızmaz). */
export function purgeRpcError(error: unknown): { status: number; error: string } {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  switch (code) {
    case "UP001":
      return { status: 400, error: "Eksik veya geçersiz istek." };
    case "UP002":
      return { status: 400, error: "Kendi hesabınızı silemezsiniz." };
    case "UP003":
      return { status: 403, error: "Kalıcı uzman silme yalnızca sistem sahibine açıktır." };
    case "UP004":
      return { status: 404, error: "Kullanıcı bulunamadı." };
    case "UP005":
      return { status: 400, error: "Yalnız uzman hesapları kalıcı olarak silinebilir." };
    case "UP006":
      return { status: 409, error: "Uzman artık arşivde değil (yeniden aktifleştirilmiş olabilir). Sayfayı yenileyin." };
    case "UP007":
      return { status: 400, error: "Demo hesabı kalıcı olarak silinemez." };
    case "UP008":
      return { status: 400, error: "E-posta doğrulaması uyuşmadı." };
    case "UP009":
    case "UP010":
      return { status: 409, error: "Bu uzmanın çalışma alanı paylaşımlı/sistem alanı olduğu için kalıcı silme yapılamaz." };
    case "UP020":
    case "UP021":
    case "UP022":
    case "UP023":
      return {
        status: 409,
        error: "Kalıcı silme güvenlik kontrolünden geçemedi; HİÇBİR veri silinmedi (işlem geri alındı).",
      };
    default:
      return { status: 500, error: "Kalıcı silme tamamlanamadı; hiçbir veri silinmedi." };
  }
}

/**
 * Uzman tenant'ına ait Storage önekleri (bucket → önek). Yollar YALNIZ sunucuda, tenant id'den
 * türetilir (lib/backup/storagePaths ile aynı şema) → başka tenant'a dokunulamaz.
 */
export function tenantStorageTargets(tenantId: string): { bucket: string; prefix: string }[] {
  const own = storagePrefix("tenant", tenantId);
  const buckets = [
    "stone-photos",
    "dogaltas-photos",
    "client-analysis-images",
    "client-anamnesis-files",
    "hd-chart-images",
    "personal-archive",
    "belge-ceviri",
    "video-temp",
  ];
  return [
    ...buckets.map((bucket) => ({ bucket, prefix: own })),
    { bucket: "stone-photos", prefix: storagePrefix("catalog_tenant", tenantId) },
    { bucket: "stone-photos", prefix: storagePrefix("healing_tenant", tenantId) },
    { bucket: "dogaltas-photos", prefix: storagePrefix("catalog_tenant", tenantId) },
  ];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listRecursive(
  db: SupabaseClient,
  bucket: string,
  dir: string,
  out: string[],
  depth: number,
): Promise<string | null> {
  if (depth > 8 || out.length > 20000) return null;
  let offset = 0;
  for (;;) {
    const { data, error } = await db.storage.from(bucket).list(dir.replace(/\/$/, ""), { limit: 1000, offset });
    if (error) return error.message;
    const items = data ?? [];
    for (const it of items) {
      const full = `${dir}${it.name}`;
      // Klasör girdilerinde id yoktur.
      if (it.id) out.push(full);
      else {
        const err = await listRecursive(db, bucket, `${full}/`, out, depth + 1);
        if (err) return err;
      }
    }
    if (items.length < 1000) return null;
    offset += items.length;
  }
}

export type StorageCleanupResult = { removed: number; failures: string[] };

/** DB purge COMMIT'inden SONRA çağrılır; en iyi çaba — hatalar raporlanır, gizlenmez. */
export async function purgeTenantStorage(db: SupabaseClient, tenantId: string): Promise<StorageCleanupResult> {
  if (!UUID_RE.test(tenantId)) return { removed: 0, failures: ["geçersiz tenant"] };
  let removed = 0;
  const failures: string[] = [];
  for (const { bucket, prefix } of tenantStorageTargets(tenantId)) {
    if (!prefix.includes(tenantId)) continue; // savunma: önek daima tenant id içerir
    const paths: string[] = [];
    const listErr = await listRecursive(db, bucket, prefix, paths, 0);
    if (listErr) {
      // Var olmayan bucket "not found" döner → temizlenecek dosya yok sayılır.
      if (!/not\s*found/i.test(listErr)) failures.push(`${bucket}: ${listErr}`);
      continue;
    }
    for (let i = 0; i < paths.length; i += 500) {
      const chunk = paths.slice(i, i + 500).filter((p) => p.startsWith(prefix));
      if (chunk.length === 0) continue;
      const { error } = await db.storage.from(bucket).remove(chunk);
      if (error) failures.push(`${bucket}: ${error.message}`);
      else removed += chunk.length;
    }
  }
  return { removed, failures };
}
