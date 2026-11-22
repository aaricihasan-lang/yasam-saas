/**
 * Şifa Rehberi V2 — Storage erişimi (yalnız sunucu, service_role istemcisi).
 *
 * Güvenlik:
 *  - Yeni görseller ÖZEL bucket 'sifa-arastirma'ya, sunucunun ürettiği '<tenant>/<uzman>/<uuid>.<uzantı>'
 *    yoluna yüklenir; istemci yol seçemez. Bucket public değildir → nesneye imzasız doğrudan erişim yok.
 *  - Kayıttan ÖNCE nesne indirilip baytları doğrulanır (PNG/JPEG/WebP/GIF sihirli baytları + boyut).
 *  - İmzalı okuma bağlantısı YALNIZ DB'nin "bu uzman görebilir" dediği görsel için, kısa süreli üretilir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SIFA_BUCKET = "sifa-arastirma";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_TTL_SEC = 300;
export const IMAGE_MIME_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export interface SifaV2Storage {
  signUpload(bucket: string, path: string): Promise<{ signedUrl: string; token: string } | null>;
  download(bucket: string, path: string): Promise<Uint8Array | null>;
  signRead(bucket: string, path: string, ttlSec: number): Promise<string | null>;
  remove(bucket: string, paths: string[]): Promise<string[]>;
}

export function supabaseStorage(client: SupabaseClient): SifaV2Storage {
  return {
    async signUpload(bucket, path) {
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
      return error || !data ? null : { signedUrl: data.signedUrl, token: data.token };
    },
    async download(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async signRead(bucket, path, ttlSec) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, ttlSec);
      return error || !data ? null : data.signedUrl;
    },
    async remove(bucket, paths) {
      if (!paths.length) return [];
      const { data, error } = await client.storage.from(bucket).remove(paths);
      if (error || !data) return [];
      return data.map((o) => o.name);
    },
  };
}

/** Bayt imzasından gerçek görsel türü (uzantıya/istemcinin söylediğine güvenilmez). */
export function sniffImageMime(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...b.slice(0, 6)))) return "image/gif";
  return null;
}

/** Bu kapsamın yükleme yolu mu? (tam biçim: <tenant>/<uzman>/<uuid>.<uzantı>) */
export function isOwnUploadPath(path: string, tenantId: string, userId: string): boolean {
  const re = new RegExp(`^${tenantId}/${userId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp|gif)$`, "i");
  return re.test(path);
}
