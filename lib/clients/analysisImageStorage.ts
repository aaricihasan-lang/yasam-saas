/**
 * lib/clients/analysisImageStorage.ts — Danışan analiz görseli depolama sözleşmesi (yalnız sunucu).
 *
 * Obje yolu upload-image route'u ile AYNI ve sunucu üretimlidir: `{tenant}/{client}/{analysisId}.png`.
 * Bucket yalnız danışan analiz görsellerine ayrılmıştır (stone-photos gibi ortak DEĞİL); yine de
 * yalnız `{tenant}/{client}/` öneki altındaki DÜZ dosyalar hedeflenir → yabancı tenant/danışan objesine
 * ve alt klasörlere dokunulmaz.
 *
 * AŞAMA 2 / D1 (DY-01): eski danışan silme akışı listeleme yerine yalnız `image_url` dolu DB satırlarını
 * kullanıyor ve okuma hatasını boş liste sayıp silmeye devam ediyordu → görseller yetim kalıyordu.
 * Bu modül önek listesini FAIL-CLOSED döndürür: listeleme doğrulanamazsa `ok:false`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const ANALYSIS_IMAGE_BUCKET = "client-analysis-images";

const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // 50.000 obje / danışan — güvenlik tavanı (aşılırsa fail-closed)

function isBucketNotFound(err: unknown): boolean {
  const msg = String((err as { message?: unknown } | null)?.message ?? "");
  return /^bucket not found$/i.test(msg.trim());
}

/** Tek analiz görselinin deterministik yolu (upload-image ile aynı). */
export function analysisImagePath(tenantId: string, clientId: string, analysisId: string): string {
  return `${tenantId}/${clientId}/${analysisId}.png`;
}

/**
 * Danışanın analiz klasöründeki TÜM düz objeleri listeler (yetim yüklemeler dahil).
 * Hata / beklenmeyen yanıt / sayfa tavanı → `{ ok: false }` (çağıran silmeyi durdurur).
 */
export async function listClientAnalysisImagePaths(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ ok: true; paths: string[] } | { ok: false }> {
  const prefix = `${tenantId}/${clientId}`;
  const paths: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db.storage
      .from(ANALYSIS_IMAGE_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset: page * PAGE_SIZE, sortBy: { column: "name", order: "asc" } });
    if (error) {
      // Bucket HİÇ yoksa nesne de yoktur (şema düzeyi; örn. eski/izole ortam) → boş. Diğer her hata fail-closed.
      if (isBucketNotFound(error)) return { ok: true, paths };
      return { ok: false };
    }
    if (!Array.isArray(data)) return { ok: false };
    for (const entry of data) {
      const name = (entry as { name?: unknown }).name;
      const id = (entry as { id?: unknown }).id;
      // Klasör girdilerinin id'si null'dır → yalnız düz dosyalar; ad güvenli (ayraç yok).
      if (typeof name !== "string" || !name || id == null) continue;
      if (name.includes("/") || name.includes("\\") || name === "." || name === "..") continue;
      paths.push(`${prefix}/${name}`);
    }
    if (data.length < PAGE_SIZE) return { ok: true, paths };
  }
  return { ok: false };
}
