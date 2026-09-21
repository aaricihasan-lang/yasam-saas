/**
 * lib/clients/stonePhotoStorage.ts — Danışan Yolculuğu taş fotoğrafı depolama sözleşmesi
 * (DYA-07 PHASE B, Client Stones tarafı).
 *
 * BAĞLAM: `stone-photos` bucket PUBLIC ve anon ALL policy taşıyor; eski Client Stones akışı
 * tarayıcıdan anon `.upload()/.getPublicUrl()/.remove()` kullanıyordu. Path client-kurulu
 * olduğundan anon herkes keyfi tenant öneki altına yükleyebiliyor / path'i bilinen başka
 * tenant objesini silebiliyordu. Bu sözleşme Client Stones tarafını SUNUCU-YETKİLİ,
 * private-ready modele taşır (Şifa Rehberi PHASE A ile aynı desen — kardeş modül).
 *
 * NİHAİ MODEL:
 *   - Yükleme SUNUCU-YETKİLİ signed upload (prepare → uploadToSignedUrl → POST verify+insert).
 *   - Okuma yalnız kısa ömürlü signed URL (client_stone_photos DB metadata'sından türetilir).
 *   - Silme SUNUCU-YETKİLİ (service_role + path-ownership guard).
 *   - tenant SUNUCUDAN (guard) alınır; client'tan tenant/path/dosya-adı KABUL EDİLMEZ.
 *   - Obje yolu SUNUCUDA üretilir (uuid + trusted-MIME uzantı).
 *
 * VERİ KORUMA: Mevcut path formatı (`{tenant}/{client}/{stone}/…`) KORUNUR — yeni objeler
 * aynı önek altına uuid.ext olarak yazılır; eski objeler yerinde kalır, taşınmaz/silinmez.
 * Bucket bu fazda PUBLIC kalır; private geçiş AYRI onay gerektirir (bu dosya her iki durumda çalışır).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Client Stones ile Şifa Rehberi'nin PAYLAŞTIĞI fiziksel bucket (bu fazda public kalır). */
export const STONE_PHOTO_BUCKET = "stone-photos";

/** Görsel yükleme boyut tavanı (server tarafı zorlanır). */
export const STONE_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Signed READ URL TTL (kısa ömürlü; kalıcı public URL yerine). */
export const STONE_PHOTO_SIGNED_TTL_SECONDS = 3600;

/**
 * Güvenilir MIME → uzantı. Uzantı client dosya adından DEĞİL, doğrulanmış MIME'den
 * türetilir → path enjeksiyonu / çift-uzantı imkânsız. (Mevcut stone-photos allow-list
 * ile hizalı: png/jpeg/webp/gif.)
 */
export const STONE_PHOTO_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** İzin verilen görsel MIME allow-list → uzantı; geçersizse null. */
export function extForMime(mime: unknown): string | null {
  if (typeof mime !== "string") return null;
  const key = mime.split(";")[0].trim().toLowerCase();
  return STONE_PHOTO_MIME_EXT[key] ?? null;
}

/** UUID biçim doğrulaması (client'tan gelen stoneId path segmentine girmeden önce). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** client-scoped önek: `{tenant}/{client}/`. */
export function clientPhotoPrefix(tenantId: string, clientId: string): string {
  return `${tenantId}/${clientId}/`;
}

/** stone-scoped önek: `{tenant}/{client}/{stone}/`. */
export function stonePhotoPrefix(tenantId: string, clientId: string, stoneId: string): string {
  return `${tenantId}/${clientId}/${stoneId}/`;
}

/**
 * Stone-scoped obje yolu — SUNUCUDA üretilir. Segmentler doğrulanmış kaynaklardan
 * (server tenant, owned client/stone id, uuid, trusted ext). Mevcut format korunur.
 */
export function buildStonePhotoPath(
  tenantId: string,
  clientId: string,
  stoneId: string,
  uuid: string,
  ext: string,
): string {
  return `${stonePhotoPrefix(tenantId, clientId, stoneId)}${uuid}.${ext}`;
}

/**
 * Path güvenli mi (traversal / mutlak URL / backslash / mutlak yol reddi). Yalnız
 * startsWith'e güvenmez — encoded traversal ve şema/host enjeksiyonunu da eler.
 */
function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || !path) return false;
  // decode edilmiş biçimde de `..` kaçışını yakala
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  for (const candidate of [path, decoded]) {
    if (candidate.includes("..")) return false;
    if (candidate.includes("://")) return false;
    if (candidate.startsWith("/") || candidate.startsWith("\\") || candidate.includes("\\")) return false;
  }
  return true;
}

/**
 * Bir file_path bu tenant + client (ve verilirse stone) öneki altında mı?
 * service_role storage silme / signed-url üretimi öncesi ZORUNLU ownership guard'ı.
 * Segment sınırı da doğrulanır (önek sonunda `/`). stoneId verilirse path yalnız
 * `{tenant}/{client}/{stone}/` altında olabilir (taş-kapsamlı silme için).
 */
export function isOwnedClientStonePhotoPath(
  path: unknown,
  tenantId: string,
  clientId: string,
  stoneId?: string | null,
): path is string {
  if (!isSafeRelativePath(path)) return false;
  const prefix = stoneId
    ? stonePhotoPrefix(tenantId, clientId, stoneId)
    : clientPhotoPrefix(tenantId, clientId);
  if (!path.startsWith(prefix)) return false;
  // Önek sonrası en az bir dosya segmenti olmalı (boş dizin değil).
  return path.length > prefix.length;
}

/**
 * Bir dizi (client_stone_photos) file_path değerinden YALNIZ bu tenant+client (ve
 * verilirse stone) önekine ait güvenli path'leri süzer. Yabancı-tenant/client/stone,
 * traversal, bozuk path'ler elenir → service_role `storage.remove` ASLA yabancı objeye
 * dokunmaz. Sonuç deduplicate edilir.
 */
export function filterOwnedStonePhotoPaths(
  paths: unknown[],
  tenantId: string,
  clientId: string,
  stoneId?: string | null,
): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (isOwnedClientStonePhotoPath(p, tenantId, clientId, stoneId)) out.add(p);
  }
  return [...out];
}

/** Aday path'lerden HÂLÂ referans edilenleri çıkarır → fiziksel silinecek path seti.
 *  (Ortak dosyayı kullanan başka kayıt varsa o obje SİLİNMEZ.) PURE — test edilebilir. */
export function pathsToPhysicallyRemove(
  candidatePaths: string[],
  stillReferenced: ReadonlySet<string>,
): string[] {
  return candidatePaths.filter((p) => !stillReferenced.has(p));
}

/** StonePhoto benzeri kayıt (yalnız id + image_url ilgilenir). */
export type StonePhotoLike = { id: string; image_url: string;[k: string]: unknown };

/**
 * Fotoğraf kayıtlarına signed READ URL uygular. image_url artık kalıcı public URL
 * DEĞİL — signed URL varsa onunla DOLDURULUR; yoksa BOŞ bırakılır (eski public URL
 * veya geçersiz relative file_path RENDER EDİLMEZ → bucket private olduğunda kırık
 * görsel gösterilmez). PURE — test edilebilir.
 */
export function applySignedPhotoUrls<T extends StonePhotoLike>(
  photos: T[],
  byId: Record<string, string>,
): T[] {
  return photos.map((p) => ({ ...p, image_url: byId[p.id] ?? "" }));
}

/**
 * client_stone_photos silme çekirdeği — DB-FIRST + referans-güvenli storage temizliği.
 * Tüm client stone-photo silme yolları (tekil foto / taş-kapsamlı / tümü) bunu kullanır.
 *
 * GÜVENLİK & VERİ BÜTÜNLÜĞÜ:
 *   - Yalnız tenant+client (verilirse +stone) önekindeki path'ler değerlendirilir → yabancı
 *     obje ASLA silinmez.
 *   - DB-FIRST: önce DB satırları silinir; DB silme hata verirse storage'a DOKUNULMAZ
 *     (obje kaybı yok, güvenli). DB başarılıysa storage best-effort temizlenir (storage
 *     hatası → yetim blob; geri kazanılabilir, kullanıcı veri kaybı değil).
 *   - REFERANS-GÜVENLİ: bir obje HÂLÂ hayatta kalan başka bir kayıt tarafından
 *     referans ediliyorsa (ortak file_path / mükerrer satır) FİZİKSEL OLARAK SİLİNMEZ.
 *   - Referans doğrulaması yapılamazsa (sorgu hatası) fiziksel silme YAPILMAZ (güvenli taraf).
 *
 * NOT: DB ile Storage arasında gerçek atomik transaction YOKTUR; DB-first sıralama en
 * kötü ihtimali "yetim blob"a indirir, fakat tümüyle ortadan kaldırmaz.
 */
export async function deleteStonePhotoRecords(
  db: SupabaseClient,
  opts: {
    bucket: string;
    tenantId: string;
    clientId: string;
    stoneId?: string | null;
    photoId?: string | null;
    all?: boolean;
  },
): Promise<{ deleted: number; removed: string[]; error: string | null }> {
  const { bucket, tenantId, clientId } = opts;
  const stoneId = opts.stoneId ?? null;
  const photoId = opts.photoId ?? null;

  // 1) Hedef satırları seç (silmeden ÖNCE path'leri topla).
  let sel = db
    .from("client_stone_photos")
    .select("id, file_path")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (stoneId) sel = sel.eq("stone_id", stoneId);
  if (photoId) sel = sel.eq("id", photoId);
  const { data: rows, error: selErr } = await sel;
  if (selErr) return { deleted: 0, removed: [], error: selErr.message };

  const targetRows = (rows ?? []) as Array<{ id: string; file_path?: unknown }>;
  const candidates = filterOwnedStonePhotoPaths(
    targetRows.map((r) => r.file_path),
    tenantId,
    clientId,
    stoneId,
  );

  // 2) DB-FIRST silme (aynı filtre). Hata → storage'a dokunulmaz.
  let del = db
    .from("client_stone_photos")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (stoneId) del = del.eq("stone_id", stoneId);
  if (photoId) del = del.eq("id", photoId);
  const { data: deletedRows, error: delErr } = await del.select("id");
  if (delErr) return { deleted: 0, removed: [], error: delErr.message };
  const deleted = (deletedRows ?? []).length;

  // 3) Referans-güvenli fiziksel silme.
  let removed: string[] = [];
  if (candidates.length > 0) {
    const { data: refRows, error: refErr } = await db
      .from("client_stone_photos")
      .select("file_path")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId)
      .in("file_path", candidates);
    if (refErr) {
      // Referans doğrulanamadı → güvenli taraf: fiziksel silme yapma (yetim temizliği sonra).
      return { deleted, removed: [], error: null };
    }
    const referenced = new Set<string>(
      (refRows ?? [])
        .map((r) => (r as { file_path?: unknown }).file_path)
        .filter((p): p is string => typeof p === "string"),
    );
    const toRemove = pathsToPhysicallyRemove(candidates, referenced);
    if (toRemove.length > 0) {
      const { error: rmErr } = await db.storage.from(bucket).remove(toRemove);
      if (rmErr) {
        // Yetim blob (geri kazanılabilir); DB zaten tutarlı → fatal değil.
        console.error("[client stone-photos] storage remove:", rmErr.message);
      } else {
        removed = toRemove;
      }
    }
  }
  return { deleted, removed, error: null };
}
