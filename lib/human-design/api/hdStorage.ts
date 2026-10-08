// HD — harita görseli depolama yaşam döngüsü (server-only, service_role).
//
// P2-1  Profesyonel rapor oluşturulurken BodyGraph görseli rapora ait DONMUŞ bir kopyaya
//       alınır (`{tenant}/report-snapshots/{reportId}.{ext}`); kaynak görsel sonradan
//       değişse/silinse de eski rapor görselini kaybetmez.
// P2-10 Danışan silinince `{tenant}/{client}/` altındaki görseller temizlenir; ancak eski
//       (snapshot kopyası öncesi) bir profesyonel rapor hâlâ bu yolu kullanıyorsa o nesne
//       KORUNUR (referans sahipliği). Storage hatası DB işlemini geri almaz → yeniden deneme
//       + yapılandırılmış log (`[hd-storage-cleanup-failed]`) ile görünür kalır.
//
// Bucket private'tır; tüm yollar tenant önekiyle doğrulanır, istemciden yol ALINMAZ.

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "./tenantScope";
import {
  isOwnedChartImagePath,
  isOwnedReportSnapshotPath,
  isSafeStoragePath,
  reportSnapshotImagePath,
} from "./chartImagePath";

export const HD_CHART_IMAGE_BUCKET = "hd-chart-images";

async function withRetry<T>(fn: () => Promise<T>, ok: (v: T) => boolean, attempts = 2): Promise<T> {
  let last = await fn();
  for (let i = 1; i < attempts && !ok(last); i++) {
    await new Promise((r) => setTimeout(r, 250 * i));
    last = await fn();
  }
  return last;
}

/**
 * Danışan görselini rapora ait snapshot yoluna kopyalar. Kaynak bu tenant+danışana ait ve
 * güvenli olmalı. Hedef zaten varsa (aynı rapor kimliğiyle eşzamanlı istek) başarı sayılır.
 */
export async function copyChartImageToReportSnapshot(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  sourcePath: string,
  reportId: string,
): Promise<{ path: string | null; error: string | null }> {
  if (!isOwnedChartImagePath(sourcePath, tenantId, clientId) || !isSafeStoragePath(sourcePath.trim())) {
    return { path: null, error: "Görsel yolu doğrulanamadı." };
  }
  const ext = (sourcePath.split(".").pop() ?? "png").toLowerCase();
  const target = reportSnapshotImagePath(tenantId, reportId, ext);
  const res = await withRetry(
    () => db.storage.from(HD_CHART_IMAGE_BUCKET).copy(sourcePath.trim(), target),
    (r) => !r.error || /exist|duplicate/i.test(r.error.message),
  );
  if (res.error && !/exist|duplicate/i.test(res.error.message)) {
    console.error("[hd-storage] snapshot kopyalanamadı:", res.error.message);
    return { path: null, error: "Harita görseli rapora kopyalanamadı." };
  }
  return { path: target, error: null };
}

/**
 * AŞAMA 4B — tarayıcıda üretilip SUNUCUDA doğrulanmış (validateBodygraphPng) BodyGraph PNG'sini
 * rapora ait snapshot yoluna yazar: `{tenant}/report-snapshots/{reportId}.png`. Yol istemciden
 * ALINMAZ (tenant guard'dan, reportId sunucuda türetilir). Aynı rapor kimliğiyle eşzamanlı
 * istek → hedef zaten var → başarı (üzerine yazma YOK; ilk yazılan görsel donmuş kalır).
 */
export async function uploadReportSnapshotPng(
  db: SupabaseClient,
  tenantId: string,
  reportId: string,
  png: Buffer,
): Promise<{ path: string | null; error: string | null }> {
  const target = reportSnapshotImagePath(tenantId, reportId, "png");
  if (!isOwnedReportSnapshotPath(target, tenantId)) return { path: null, error: "Görsel yolu doğrulanamadı." };
  const res = await withRetry(
    () => db.storage.from(HD_CHART_IMAGE_BUCKET).upload(target, png, { contentType: "image/png", upsert: false }),
    (r) => !r.error || /exist|duplicate/i.test(r.error.message),
  );
  if (res.error && !/exist|duplicate/i.test(res.error.message)) {
    console.error("[hd-storage] BodyGraph PNG yüklenemedi:", res.error.message);
    return { path: null, error: "BodyGraph görseli rapora kaydedilemedi." };
  }
  return { path: target, error: null };
}

/** Nesneleri sil (yeniden denemeli). Başarısızlık yapılandırılmış olarak loglanır. */
export async function removeHdStorageObjects(
  db: SupabaseClient,
  paths: string[],
  context: string,
): Promise<{ ok: boolean; failed: number }> {
  const list = [...new Set(paths.filter(Boolean))];
  if (list.length === 0) return { ok: true, failed: 0 };
  const res = await withRetry(
    () => db.storage.from(HD_CHART_IMAGE_BUCKET).remove(list),
    (r) => !r.error,
  );
  if (res.error) {
    console.error(`[hd-storage-cleanup-failed] ${context}: ${list.length} nesne silinemedi: ${res.error.message}`);
    return { ok: false, failed: list.length };
  }
  return { ok: true, failed: 0 };
}

/** Bir danışanın görsel klasöründeki nesne yolları (`{tenant}/{client}/…`). */
export async function listClientImageObjects(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ paths: string[]; error: string | null }> {
  const prefix = `${tenantId}/${clientId}`;
  const { data, error } = await db.storage.from(HD_CHART_IMAGE_BUCKET).list(prefix, { limit: 1000 });
  if (error) return { paths: [], error: error.message };
  const paths = (data ?? [])
    .filter((o) => o && o.name && o.id !== null) // klasör girdileri (id=null) hariç
    .map((o) => `${prefix}/${o.name}`);
  return { paths, error: null };
}

/**
 * Bu tenant'taki raporların DONMUŞ snapshot'larının referans verdiği görsel yolları
 * (verilen önek altında). Eski raporlar canlı danışan yolunu kullanıyor olabilir → bu
 * yollar silinmemeli/üzerine yazılmamalıdır.
 */
export async function reportReferencedImagePaths(
  db: SupabaseClient,
  tenantId: string,
  prefix: string,
): Promise<{ paths: Set<string>; error: string | null }> {
  const { data, error } = await withTenant(
    db.from("human_design_reports").select("snapshot->chartImage->>storagePath"),
    tenantId,
    "reportReferencedImagePaths",
  ).like("snapshot->chartImage->>storagePath", `${prefix}%`);
  if (error) return { paths: new Set(), error: error.message };
  const out = new Set<string>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const v = r.storagePath;
    if (typeof v === "string" && v) out.add(v);
  }
  return { paths: out, error: null };
}

/** Raporun kendi snapshot görselini (varsa) sil — rapor silindikten sonra çağrılır. */
export async function removeReportSnapshotImage(
  db: SupabaseClient,
  tenantId: string,
  storagePath: string | null | undefined,
): Promise<void> {
  if (!storagePath || !isOwnedReportSnapshotPath(storagePath, tenantId)) return;
  await removeHdStorageObjects(db, [storagePath], "report-delete");
}
