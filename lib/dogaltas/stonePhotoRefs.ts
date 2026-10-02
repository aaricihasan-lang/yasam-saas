/**
 * lib/dogaltas/stonePhotoRefs.ts — SUNUCU tarafı fotoğraf referans kontrolü (P2-05).
 *
 * Kural: bir dogaltas-photos nesnesi fiziksel olarak YALNIZ tenant'taki hiçbir taş kaydı
 * (images[] — nesne `{file_path}` veya legacy düz string) onu referans etmiyorsa silinir.
 *
 * Neden: fotoğraf kaldırma artık "önce DB, sonra storage" sırasıyla çalışır. Araya başka
 * sekme/oturum aynı dosyayı yeniden referans etmişse (ör. eski state ile kaydetme) ya da
 * başka bir taş aynı yolu taşıyorsa dosya SİLİNMEZ → kayıt asla silinmiş dosyaya bakmaz.
 *
 * Fail-safe: referans sorgusu hata verirse dosya "referanslı" sayılır (silinmez) ve
 * sunucu loguna yazılır; en kötü durum orphan dosyadır, veri kaybı değil.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isStonePhotoReferenced(
  db: SupabaseClient,
  tenantId: string,
  filePath: string,
): Promise<boolean> {
  const asObject = await db
    .from("stones").select("id")
    .eq("tenant_id", tenantId)
    .contains("images", JSON.stringify([{ file_path: filePath }])) // jsonb @> (JSON metni)
    .limit(1);
  if (asObject.error) {
    console.error("[stonePhotoRefs] referans kontrolü hatası (nesne):", asObject.error.message);
    return true;
  }
  if ((asObject.data ?? []).length > 0) return true;

  const asString = await db
    .from("stones").select("id")
    .eq("tenant_id", tenantId)
    .contains("images", JSON.stringify([filePath]))
    .limit(1);
  if (asString.error) {
    console.error("[stonePhotoRefs] referans kontrolü hatası (string):", asString.error.message);
    return true;
  }
  return (asString.data ?? []).length > 0;
}

/** Yalnız artık hiçbir taşın referans etmediği yolları döndürür (sıra korunur). */
export async function filterUnreferencedStonePhotoPaths(
  db: SupabaseClient,
  tenantId: string,
  paths: readonly string[],
): Promise<{ removable: string[]; referenced: string[] }> {
  const removable: string[] = [];
  const referenced: string[] = [];
  for (const p of paths) {
    if (await isStonePhotoReferenced(db, tenantId, p)) referenced.push(p);
    else removable.push(p);
  }
  return { removable, referenced };
}
