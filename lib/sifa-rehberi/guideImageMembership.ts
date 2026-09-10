/**
 * lib/sifa-rehberi/guideImageMembership.ts — Şifa Rehberi görsel AUTHORITATIVE membership (P1 PHASE A).
 *
 * NEDEN (contract bug düzeltmesi): Şifa canonical veri modelinde görsel metadata'sı YALNIZ
 * `healing_guides.images` (top-level) değil, `healing_guide_sections.images` (section) da
 * taşır. signed-read / delete yetkilendirmesi bu İKİ kaynağı BİRLEŞİK authoritative set
 * olarak değerlendirmelidir; aksi hâlde section görselleri imzalanamaz/silinemez ve
 * create-flow'da persist edilen staging file_path'ler lifecycle dışında kalır.
 *
 * GÜVENLİK SÖZLEŞMESİ:
 *   - Parent guide ÖNCE tenant-owned doğrulanır (healing_guides.id + tenant_id).
 *   - `healing_guide_sections` tablosu tenant_id TAŞIMAZ; guide_id ile bağlıdır. Parent guide
 *     tenant-owned doğrulandıktan SONRA yalnız o guide'ın section satırları okunur → cross-tenant
 *     sızıntı yok.
 *   - Her file_path `resolveHealingImagePath` ile tenant-owned doğrulanır (traversal/cross-tenant/
 *     arbitrary dış URL asla kabul edilmez). Bir path yalnız bu set'te varsa AUTHORITATIVE'dir;
 *     tenant/staging önekini bilmek TEK BAŞINA yetmez (file_path authorization proof DEĞİL).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveHealingImagePath,
  storageHostFromEnv,
  type HealingImageLike,
} from "@/lib/sifa-rehberi/stonePhotoStorage";

/** Görsel metadata girdisi (top-level veya section) — opsiyonel stabil `id` taşıyabilir. */
export type MembershipImage = HealingImageLike & { id?: unknown };

export type GuideImageMembership = {
  /** AUTHORITATIVE tenant-owned storage path seti (top-level + section BİRLEŞİK). */
  paths: Set<string>;
  /** Stabil imageId → resolved path (yalnız id taşıyan görseller). */
  pathByImageId: Map<string, string>;
};

/**
 * PURE: top-level + section görsel dizilerinden AUTHORITATIVE tenant-owned path seti kurar.
 * DB'ye dokunmaz → harness bunu gerçek davranışla (ağ/DB olmadan) doğrular.
 */
export function computeGuideImageMembership(
  topLevelImages: unknown,
  sectionImageArrays: unknown[],
  tenantId: string,
  allowedHost: string,
): GuideImageMembership {
  const paths = new Set<string>();
  const pathByImageId = new Map<string, string>();

  const ingest = (images: unknown): void => {
    if (!Array.isArray(images)) return;
    for (const raw of images as MembershipImage[]) {
      const path = resolveHealingImagePath(raw, tenantId, allowedHost);
      if (!path) continue;
      paths.add(path);
      if (typeof raw.id === "string" && raw.id && !pathByImageId.has(raw.id)) {
        pathByImageId.set(raw.id, path);
      }
    }
  };

  ingest(topLevelImages);
  for (const arr of sectionImageArrays) ingest(arr);

  return { paths, pathByImageId };
}

export type MembershipResult =
  | { ok: true; membership: GuideImageMembership }
  | { ok: false; reason: "not_found" | "error" };

/**
 * DB: parent guide (tenant-owned) + o guide'ın section'ları → AUTHORITATIVE image membership.
 *
 * `not_found`  → guide bu tenant'a ait değil / yok (çağıran 404 döner).
 * `error`      → DB hatası (çağıran 500 döner; ham hata SIZMAZ).
 */
export async function loadGuideImageMembership(
  db: SupabaseClient,
  tenantId: string,
  guideId: string,
): Promise<MembershipResult> {
  // 1) Parent guide tenant ownership + top-level images.
  const { data: guide, error: guideErr } = await db
    .from("healing_guides")
    .select("id, images")
    .eq("id", guideId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (guideErr) return { ok: false, reason: "error" };
  if (!guide) return { ok: false, reason: "not_found" };

  // 2) Bu guide'ın section görselleri (tablo tenant_id taşımaz → guide_id ile bağlı; parent
  //    guide zaten tenant-owned doğrulandı).
  const { data: sections, error: secErr } = await db
    .from("healing_guide_sections")
    .select("images")
    .eq("guide_id", guideId);
  if (secErr) return { ok: false, reason: "error" };

  const allowedHost = storageHostFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const sectionArrays = ((sections ?? []) as { images?: unknown }[]).map((s) => s.images);
  const membership = computeGuideImageMembership(
    (guide as { images?: unknown }).images,
    sectionArrays,
    tenantId,
    allowedHost,
  );
  return { ok: true, membership };
}
