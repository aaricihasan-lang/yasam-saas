// HD — harita görseli depolama yaşam döngüsü (server-only, service_role).
//
// P2-1  Profesyonel rapor oluşturulurken BodyGraph görseli rapora ait DONMUŞ bir kopyaya
//       alınır (`{tenant}/report-snapshots/{reportId}.{ext}`); kaynak görsel sonradan
//       değişse/silinse de eski rapor görselini kaybetmez.
// P2-10 Danışan silinince `{tenant}/{client}/` altındaki görseller temizlenir; ancak eski
//       (snapshot kopyası öncesi) bir profesyonel rapor hâlâ bu yolu kullanıyorsa o nesne
//       KORUNUR (referans sahipliği). Storage hatası DB işlemini geri almaz → yeniden deneme
//       + yapılandırılmış log (`[hd-storage-cleanup-failed]`) ile görünür kalır.
// Telafi: cleanupOrphanHdImages — kalan yetim görselleri ilişkilerden yeniden türetip temizler.
//
// Bucket private'tır; tüm yollar tenant önekiyle doğrulanır, istemciden yol ALINMAZ.

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "./tenantScope";
import {
  HD_REPORT_SNAPSHOT_DIR,
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

// ─────────────────────────────────────────────────────────────────────────────
// Yetim görsel temizliği (profil silme sonrası storage hatasının TELAFİSİ)
// ─────────────────────────────────────────────────────────────────────────────
//
// Profil silindikten sonra storage silme başarısız olursa dosyalar kalabilir ve profil artık
// olmadığı için aynı "Sil" tekrar çalıştırılamaz. Bu tarama ek tablo/kuyruk OLMADAN, yalnız
// tenant + kayıt ilişkilerinden yetim dosyaları YENİDEN TÜRETİR (idempotent, tekrar çalıştırılabilir):
//   • `{tenant}/{uuid}/…`         → uuid bu tenant'ta MEVCUT bir profil DEĞİLSE aday;
//   • `{tenant}/report-snapshots/{uuid}.{ext}` → uuid bu tenant'ta MEVCUT bir rapor DEĞİLSE aday.
// Aday ASLA silinmez eğer:
//   • herhangi bir profil (chart_image_url), analiz (chart_image_url) ya da rapor snapshot'ı
//     (snapshot.chartImage.storagePath) bu yolu hâlâ kullanıyorsa (ortak/eski görsel);
//   • dosya ORPHAN_MIN_AGE_MS'den yeniyse ya da yaşı bilinmiyorsa (Word oluşturma PNG'yi rapor
//     satırından ÖNCE yükler — yarışta yeni rapor görseli silinmesin);
//   • başka tenant öneki, güvenli olmayan yol, UUID olmayan klasör (ör. `.restore-tmp`) ise.
// Okuma hatasında güvenli taraf: hiçbir şey silinmez. Log'a yalnız SAYILAR yazılır (yol/PII yok).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ORPHAN_MIN_AGE_MS = 15 * 60 * 1000;
const ORPHAN_MAX_FOLDERS = 200;
const ORPHAN_MAX_TOP_ENTRIES = 5000;
const ORPHAN_MAX_OBJECTS = 1000;
const LIST_PAGE = 100;
const REMOVE_BATCH = 100;

type StorageEntry = { name: string; id: string | null; created_at?: string | null };

async function listAll(db: SupabaseClient, prefix: string, cap: number): Promise<{ entries: StorageEntry[]; error: boolean }> {
  const out: StorageEntry[] = [];
  for (let offset = 0; out.length < cap; offset += LIST_PAGE) {
    const { data, error } = await db.storage
      .from(HD_CHART_IMAGE_BUCKET)
      .list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) return { entries: [], error: true };
    if (!data || data.length === 0) break;
    out.push(...(data as StorageEntry[]));
    if (data.length < LIST_PAGE) break;
  }
  return { entries: out.slice(0, cap), error: false };
}

async function tenantIds(db: SupabaseClient, table: string, tenantId: string): Promise<Set<string> | null> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await withTenant(db.from(table).select("id"), tenantId, `orphanCleanup.${table}`)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return null;
    for (const r of (data ?? []) as { id: string }[]) out.add(r.id);
    if (!data || data.length < 1000) return out;
  }
}

/** Bu tenant'ta HERHANGİ bir kaydın hâlâ kullandığı görsel yolları (profil, analiz, rapor snapshot). */
async function tenantImagesInUse(db: SupabaseClient, tenantId: string): Promise<Set<string> | null> {
  const used = new Set<string>();
  const sources: Array<[string, string, string]> = [
    ["human_design_clients", "chart_image_url", "chart_image_url"],
    ["human_design_charts", "chart_image_url", "chart_image_url"],
    ["human_design_reports", "snapshot->chartImage->>storagePath", "storagePath"],
  ];
  for (const [table, col, key] of sources) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await withTenant(db.from(table).select(`id, ${col}`), tenantId, `orphanCleanup.inUse.${table}`)
        .not(col, "is", null)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) return null;
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        const v = r[key];
        if (typeof v === "string" && v.trim()) used.add(v.trim());
      }
      if (!data || data.length < 1000) break;
    }
  }
  return used;
}

export type OrphanCleanupResult = { ok: boolean; removed: number; candidates: number; failed: number };

/**
 * Tenant kapsamlı yetim HD görsel temizliği (yalnız server; tenantId YALNIZ guard'dan).
 * Tekrar çalıştırmak güvenlidir: her çalıştırma ilişkileri baştan okur; silinmiş dosya bir
 * daha aday olmaz, kullanılan dosya hiç aday olmaz.
 */
export async function cleanupOrphanHdImages(
  db: SupabaseClient,
  tenantId: string,
  opts: { now?: number; minAgeMs?: number } = {},
): Promise<OrphanCleanupResult> {
  const fail: OrphanCleanupResult = { ok: false, removed: 0, candidates: 0, failed: 0 };
  if (!tenantId || !UUID_RE.test(tenantId)) return fail;
  const now = opts.now ?? Date.now();
  const minAge = opts.minAgeMs ?? ORPHAN_MIN_AGE_MS;

  const [profiles, reports, inUse] = await Promise.all([
    tenantIds(db, "human_design_clients", tenantId),
    tenantIds(db, "human_design_reports", tenantId),
    tenantImagesInUse(db, tenantId),
  ]);
  if (!profiles || !reports || !inUse) {
    console.error("[hd-orphan-cleanup] ilişki okunamadı; hiçbir şey silinmedi");
    return fail;
  }

  // Kök: mevcut profil klasörleri de listelenir → büyük tenant'ta yetimler kaçmasın diye geniş sınır.
  const top = await listAll(db, tenantId, ORPHAN_MAX_TOP_ENTRIES);
  if (top.error) {
    console.error("[hd-orphan-cleanup] listeleme başarısız; hiçbir şey silinmedi");
    return fail;
  }
  const oldEnough = (e: StorageEntry) => {
    const t = e.created_at ? Date.parse(e.created_at) : NaN;
    return Number.isFinite(t) && now - t >= minAge;
  };
  const candidates: string[] = [];
  let folders = 0;
  for (const f of top.entries) {
    if (f.id !== null || !f.name || candidates.length >= ORPHAN_MAX_OBJECTS) continue; // yalnız klasörler
    if (f.name === HD_REPORT_SNAPSHOT_DIR) {
      const snaps = await listAll(db, `${tenantId}/${HD_REPORT_SNAPSHOT_DIR}`, ORPHAN_MAX_OBJECTS);
      if (snaps.error) return fail;
      for (const o of snaps.entries) {
        if (o.id === null) continue;
        const reportId = o.name.replace(/\.[a-z0-9]{2,5}$/i, "");
        if (!UUID_RE.test(reportId) || reports.has(reportId) || !oldEnough(o)) continue;
        candidates.push(`${tenantId}/${HD_REPORT_SNAPSHOT_DIR}/${o.name}`);
      }
      continue;
    }
    if (!UUID_RE.test(f.name) || profiles.has(f.name) || folders >= ORPHAN_MAX_FOLDERS) continue;
    folders++;
    const files = await listAll(db, `${tenantId}/${f.name}`, ORPHAN_MAX_OBJECTS);
    if (files.error) return fail;
    for (const o of files.entries) {
      if (o.id === null || !oldEnough(o)) continue; // alt klasör / yeni dosya → dokunma
      candidates.push(`${tenantId}/${f.name}/${o.name}`);
    }
  }

  const removable = [...new Set(candidates)]
    .filter((p) => p.startsWith(`${tenantId}/`) && isSafeStoragePath(p) && !inUse.has(p))
    .slice(0, ORPHAN_MAX_OBJECTS);
  let removed = 0;
  let failed = 0;
  for (let i = 0; i < removable.length; i += REMOVE_BATCH) {
    const batch = removable.slice(i, i + REMOVE_BATCH);
    const rm = await removeHdStorageObjects(db, batch, "orphan-cleanup");
    if (rm.ok) removed += batch.length;
    else failed += batch.length;
  }
  if (removable.length > 0) console.info(`[hd-orphan-cleanup] aday=${removable.length} silinen=${removed} başarısız=${failed}`);
  return { ok: failed === 0, removed, candidates: removable.length, failed };
}
