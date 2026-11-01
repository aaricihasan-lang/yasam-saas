/**
 * KİŞİSEL DİJİTAL OFİS — görsel varlık servisi (YALNIZ SUNUCU; service-role db + private bucket).
 *
 * - Storage yolu istemciden ASLA alınmaz: <tenant>/<kullanıcı>/<assetId>/{desktop,mobile}.webp sunucuda üretilir ve
 *   expert_workspace_assets satırında kalıcı tutulur. İstemci yalnız assetId (uuid) görür.
 * - Her okuma / silme: tenant_id + user_id + deleted_at IS NULL ile sahiplik doğrulanır (başka uzman → 404).
 * - Yükleme sunucu rotası üzerinden parçalı (≤ 3 MB); ham parçalar private STAGING bucket'ta (PostgreSQL'de DEĞİL) tutulur,
 *   tamamlama / iptal / saatlik temizlikte silinir. Doğrulanmamış içerik hiçbir okuma ucundan çıkmaz.
 * - Silme yalnız açık kullanıcı eylemiyle (DELETE + confirm) ve görsel tasarımın uygulanan / taslak / geçmiş
 *   sürümlerinin HİÇBİRİNDE geçmiyorsa yapılır; satır silinmez, deleted_at işaretlenir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ASSET_BUCKET, ASSET_KINDS, ASSET_MAX_BYTES, PROCESSING_LEASE_MS, STAGING_BUCKET, UPLOAD_CHUNK_BYTES, type AssetKind } from "./catalog";
import { checkDeclared, processImage, type ImageErrorCode } from "./imageProcess";
import type { WorkspaceDesign } from "./schema";
import { DESIGNS_TABLE, type Owner } from "./service";

assertServerOnly("lib/workspace/assets");

export const ASSETS_TABLE = "expert_workspace_assets";
export const UPLOADS_TABLE = "expert_workspace_uploads";

const ASSET_COLS = "id, kind, original_format, original_bytes, original_width, original_height, desktop_path, desktop_width, desktop_height, desktop_bytes, mobile_path, mobile_width, mobile_height, mobile_bytes, sha256, created_at";
type AssetRow = {
  id: string; kind: AssetKind; original_format: string; original_bytes: number; original_width: number; original_height: number;
  desktop_path: string; desktop_width: number; desktop_height: number; desktop_bytes: number;
  mobile_path: string; mobile_width: number; mobile_height: number; mobile_bytes: number; sha256: string; created_at: string;
};
export type AssetView = {
  id: string; kind: AssetKind; createdAt: string;
  original: { format: string; bytes: number; width: number; height: number };
  desktop: { width: number; height: number; bytes: number; url: string };
  mobile: { width: number; height: number; bytes: number; url: string };
};

const view = (r: AssetRow): AssetView => ({
  id: r.id,
  kind: r.kind,
  createdAt: r.created_at,
  original: { format: r.original_format, bytes: r.original_bytes, width: r.original_width, height: r.original_height },
  desktop: { width: r.desktop_width, height: r.desktop_height, bytes: r.desktop_bytes, url: `/api/settings/workspace/assets/${r.id}?v=desktop` },
  mobile: { width: r.mobile_width, height: r.mobile_height, bytes: r.mobile_bytes, url: `/api/settings/workspace/assets/${r.id}?v=mobile` },
});

export type Fail = { ok: false; status: number; code: string; error: string; cause?: unknown };
const f = (status: number, code: string, error: string, cause?: unknown): Fail => ({ ok: false, status, code, error, cause });
const pgMsg = (e: unknown) => String((e as { message?: string } | null)?.message ?? "");

/** Sunucunun ürettiği yollar (istemci girdisi içermez). */
export function assetPaths(o: Owner, assetId: string) {
  const base = `${o.tenantId}/${o.userId}/${assetId}`;
  return { desktop: `${base}/desktop.webp`, mobile: `${base}/mobile.webp` };
}

export async function listAssets(db: SupabaseClient, o: Owner): Promise<{ ok: true; assets: AssetView[] } | Fail> {
  const { data, error } = await db.from(ASSETS_TABLE).select(ASSET_COLS).eq("tenant_id", o.tenantId).eq("user_id", o.userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) return f(500, "db", "Görseller okunamadı.", error);
  return { ok: true, assets: ((data ?? []) as AssetRow[]).map(view) };
}

async function ownAsset(db: SupabaseClient, o: Owner, assetId: string): Promise<{ ok: true; row: AssetRow | null } | Fail> {
  const { data, error } = await db.from(ASSETS_TABLE).select(ASSET_COLS).eq("id", assetId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).is("deleted_at", null).maybeSingle();
  if (error) return f(500, "db", "Görsel okunamadı.", error);
  return { ok: true, row: (data as AssetRow | null) ?? null };
}

// ── Yükleme (ham parçalar private STAGING bucket'ta; yalnız sunucu yazar/okur) ─────────────────────────────

/** Dosya adı yalnız görüntü/denetim içindir; yol olarak KULLANILMAZ. Dizin, kontrol karakteri ve yön işareti atılır. */
export function cleanFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const base = raw.split(/[\\/]/).pop()!.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "").trim();
  return base.length >= 1 && base.length <= 200 ? base : null;
}

type UploadRow = {
  id: string; kind: AssetKind; declared_mime: string; file_name: string; declared_bytes: number; chunk_size: number; chunk_count: number;
  status: "open" | "processing" | "completed" | "aborted"; expires_at: string; asset_id: string | null; processing_started_at: string | null;
  staging_cleared_at: string | null;
};
const UPLOAD_COLS = "id, kind, declared_mime, file_name, declared_bytes, chunk_size, chunk_count, status, expires_at, asset_id, processing_started_at, staging_cleared_at";

/** Geçici parça yolu: <tenant>/<kullanıcı>/<uploadId>/<n>.part — tenant öneki purge / kapasite raporu ile uyumlu. */
export function stagingPrefix(o: Owner, uploadId: string) {
  return `${o.tenantId}/${o.userId}/${uploadId}/`;
}
const chunkPath = (o: Owner, uploadId: string, i: number) => `${stagingPrefix(o, uploadId)}${i}.part`;

async function ownUpload(db: SupabaseClient, o: Owner, uploadId: string): Promise<{ ok: true; row: UploadRow } | Fail> {
  const { data, error } = await db.from(UPLOADS_TABLE).select(UPLOAD_COLS).eq("id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).maybeSingle();
  if (error) return f(500, "db", "Yükleme okunamadı.", error);
  if (!data) return f(404, "not_found", "Yükleme bulunamadı.");
  return { ok: true, row: data as UploadRow };
}

/** Oturumun geçici dosyalarını siler; başarılıysa staging_cleared_at işaretlenir (başarısızsa saatlik temizlik dener). */
async function clearStaging(db: SupabaseClient, o: Owner, uploadId: string, chunkCount: number): Promise<boolean> {
  const paths = Array.from({ length: chunkCount }, (_, i) => chunkPath(o, uploadId, i));
  const rm = await db.storage.from(STAGING_BUCKET).remove(paths);
  if (rm.error) return false;
  await db.from(UPLOADS_TABLE).update({ staging_cleared_at: new Date().toISOString() }).eq("id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).is("staging_cleared_at", null);
  return true;
}

async function setStatus(db: SupabaseClient, o: Owner, uploadId: string, from: UploadRow["status"], to: UploadRow["status"], extra: Record<string, unknown> = {}) {
  return db.from(UPLOADS_TABLE).update({ status: to, ...extra }).eq("id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).eq("status", from).select("id");
}

export type StartInput = { kind?: unknown; fileName?: unknown; mimeType?: unknown; size?: unknown };
export async function startUpload(db: SupabaseClient, o: Owner, input: StartInput): Promise<{ ok: true; uploadId: string; chunkSize: number; chunkCount: number; expiresAt: string } | Fail> {
  if (!ASSET_KINDS.includes(input.kind as AssetKind)) return f(400, "invalid_kind", "Görsel türü logo veya photo olmalı.");
  const kind = input.kind as AssetKind;
  const fileName = cleanFileName(input.fileName);
  if (!fileName) return f(400, "invalid_name", "Dosya adı geçersiz.");
  if (typeof input.mimeType !== "string") return f(400, "invalid_type", "Dosya türü eksik.");
  const size = input.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) return f(400, "invalid_size", "Dosya boyutu geçersiz.");
  if (size > ASSET_MAX_BYTES[kind]) return f(413, "too_large", kind === "logo" ? "Logo en fazla 2 MB olabilir." : "Fotoğraf en fazla 10 MB olabilir.");
  const declared = checkDeclared({ fileName, mime: input.mimeType });
  if (!declared.ok) return f(declared.code === "type_mismatch" ? 400 : 415, declared.code, declared.error);
  // Bu uzmanın süresi geçmiş oturumları hemen toparlanır (saatlik temizliği beklemeden; sınırlı iş).
  await cleanupStaging(db, { owner: o, limit: 10 });
  const chunkCount = Math.ceil(size / UPLOAD_CHUNK_BYTES);
  const { data, error } = await db
    .from(UPLOADS_TABLE)
    .insert({ tenant_id: o.tenantId, user_id: o.userId, kind, declared_mime: input.mimeType.toLowerCase(), file_name: fileName, declared_bytes: size, chunk_size: UPLOAD_CHUNK_BYTES, chunk_count: chunkCount })
    .select("id, expires_at")
    .single();
  if (error) {
    if (pgMsg(error).includes("EXPERT_WORKSPACE_UPLOAD_CAP")) return f(429, "upload_cap", "Aynı anda en fazla 5 yükleme açık olabilir. Biraz bekleyip yeniden deneyin.");
    return f(500, "db", "Yükleme başlatılamadı.", error);
  }
  const row = data as { id: string; expires_at: string };
  return { ok: true, uploadId: row.id, chunkSize: UPLOAD_CHUNK_BYTES, chunkCount, expiresAt: row.expires_at };
}

const notExpired = (u: UploadRow) => new Date(u.expires_at).getTime() > Date.now();
const isDuplicate = (e: unknown) => {
  const x = e as { statusCode?: string | number; message?: string; error?: string } | null;
  return String(x?.statusCode ?? "") === "409" || /already exists|duplicate/i.test(`${x?.message ?? ""} ${x?.error ?? ""}`);
};

/**
 * Parça yazma. Güvenli yeniden deneme: aynı parça zaten yazıldıysa 409 chunk_exists döner (istemci "tamam" sayar);
 * Storage hatasında hiçbir şey yazılmamıştır → aynı parça yeniden gönderilebilir.
 */
export async function putChunk(db: SupabaseClient, o: Owner, uploadId: string, index: number, bytes: Uint8Array): Promise<{ ok: true; index: number } | Fail> {
  const u = await ownUpload(db, o, uploadId);
  if (!u.ok) return u;
  if (u.row.status !== "open" || !notExpired(u.row)) return f(410, "upload_closed", "Yükleme süresi doldu veya kapandı. Yeniden başlatın.");
  if (!Number.isInteger(index) || index < 0 || index >= u.row.chunk_count) return f(400, "invalid_index", "Parça numarası geçersiz.");
  const expected = index < u.row.chunk_count - 1 ? u.row.chunk_size : u.row.declared_bytes - u.row.chunk_size * (u.row.chunk_count - 1);
  if (bytes.length !== expected) return f(400, "chunk_size", "Parça boyutu beyan edilen dosya boyutuyla uyuşmuyor.");
  const up = await db.storage.from(STAGING_BUCKET).upload(chunkPath(o, uploadId, index), Buffer.from(bytes), { contentType: "application/octet-stream", upsert: false });
  if (up.error) {
    if (isDuplicate(up.error)) return f(409, "chunk_exists", "Bu parça zaten yüklendi.");
    return f(502, "storage", "Parça kaydedilemedi. Aynı parçayı yeniden gönderin.", up.error);
  }
  return { ok: true, index };
}

export async function abortUpload(db: SupabaseClient, o: Owner, uploadId: string): Promise<{ ok: true } | Fail> {
  const u = await ownUpload(db, o, uploadId);
  if (!u.ok) return u;
  if (u.row.status !== "open") return f(409, "upload_closed", u.row.status === "processing" ? "Yükleme şu an işleniyor." : "Yükleme zaten kapalı.");
  const r = await setStatus(db, o, uploadId, "open", "aborted");
  if (r.error) return f(500, "db", "Yükleme iptal edilemedi.", r.error);
  await clearStaging(db, o, uploadId, u.row.chunk_count);
  return { ok: true };
}

const IMAGE_STATUS: Record<ImageErrorCode, number> = {
  unsupported_type: 415, heic_unsupported: 415, type_mismatch: 400, corrupt: 400, trailing_data: 400, animated: 400,
  too_large_pixels: 400, too_small: 400, variant_too_large: 422, process_failed: 422,
};

/** İşleme kilidini atomik alır: open → processing; ya da süresi geçmiş (çökmüş) processing kilidini yeniler. */
async function claim(db: SupabaseClient, o: Owner, uploadId: string): Promise<boolean> {
  const now = new Date();
  const a = await setStatus(db, o, uploadId, "open", "processing", { processing_started_at: now.toISOString() });
  if (!a.error && (a.data ?? []).length === 1) return true;
  const stale = new Date(now.getTime() - PROCESSING_LEASE_MS).toISOString();
  const b = await db
    .from(UPLOADS_TABLE)
    .update({ status: "processing", processing_started_at: now.toISOString() })
    .eq("id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).eq("status", "processing").lt("processing_started_at", stale)
    .select("id");
  return !b.error && (b.data ?? []).length === 1;
}

/**
 * Tamamlama: kilit → staging parçaları sırayla indirilir (≤ 4 × 3 MB) → içerik doğrulama + yeniden kodlama → yalnız WebP
 * varyantları kalıcı bucket'a → kayıt (assetId = uploadId) → geçici dosyalar silinir.
 * - İki kez çağrılırsa: tamamlanmışsa aynı görsel döner (200); işleniyorsa 409; aynı anda iki işlem tek görsel üretir
 *   (kilit + assetId = uploadId birincil anahtar + upsert:false).
 * - Geçici hata (eksik parça / Storage / DB) → oturum yeniden 'open' → güvenli yeniden deneme.
 * - Doğrulama hatası → oturum 'aborted', geçici dosyalar silinir (yeni yükleme gerekir).
 * Yanıt yalnız görsel üst verisidir (birkaç KB); ham dosya istemciye ASLA dönmez.
 */
export async function completeUpload(db: SupabaseClient, o: Owner, uploadId: string): Promise<{ ok: true; asset: AssetView; reused?: boolean } | Fail> {
  const u = await ownUpload(db, o, uploadId);
  if (!u.ok) return u;
  const up = u.row;
  if (up.status === "completed" && up.asset_id) {
    const a = await ownAsset(db, o, up.asset_id);
    if (!a.ok) return a;
    if (a.row) return { ok: true, asset: view(a.row), reused: true };
    return f(410, "asset_deleted", "Bu yüklemenin görseli silinmiş.");
  }
  if (up.status === "aborted") return f(410, "upload_closed", "Yükleme iptal edildi. Yeniden başlatın.");
  if (up.status === "open" && !notExpired(up)) return f(410, "upload_closed", "Yükleme süresi doldu. Yeniden başlatın.");
  if (!(await claim(db, o, uploadId))) {
    const again = await ownUpload(db, o, uploadId);
    if (again.ok && again.row.status === "completed" && again.row.asset_id) return completeUpload(db, o, uploadId);
    return f(409, "processing", "Yükleme şu an işleniyor. Birkaç saniye sonra yeniden deneyin.");
  }
  const release = () => setStatus(db, o, uploadId, "processing", "open");
  const abortWith = async (fail: Fail) => {
    await setStatus(db, o, uploadId, "processing", "aborted");
    await clearStaging(db, o, uploadId, up.chunk_count);
    return fail;
  };

  // Parçalar: sırayla indir (bellek: en fazla 10 MB + birleştirme), eksik varsa listele.
  const staging = db.storage.from(STAGING_BUCKET);
  const parts: Buffer[] = [];
  const missing: number[] = [];
  for (let i = 0; i < up.chunk_count; i++) {
    const d = await staging.download(chunkPath(o, uploadId, i));
    if (d.error || !d.data) { missing.push(i); continue; }
    parts.push(Buffer.from(await d.data.arrayBuffer()));
  }
  if (missing.length) {
    await release();
    return { ...f(409, "incomplete", "Bazı parçalar eksik; eksik parçaları yeniden gönderip tamamlayın."), missing } as Fail & { missing: number[] };
  }
  const bytes = Buffer.concat(parts);
  parts.length = 0;
  if (bytes.length !== up.declared_bytes) return abortWith(f(400, "size_mismatch", "Yüklenen veri beyan edilen boyutla uyuşmuyor."));
  const declared = checkDeclared({ fileName: up.file_name, mime: up.declared_mime });
  if (!declared.ok) return abortWith(f(IMAGE_STATUS[declared.code], declared.code, declared.error));
  const img = await processImage(bytes, up.kind, declared.format);
  if (!img.ok) return abortWith(f(IMAGE_STATUS[img.code], img.code, img.error));

  const assetId = uploadId; // aynı yükleme iki görsel üretemez
  const paths = assetPaths(o, assetId);
  const bucket = db.storage.from(ASSET_BUCKET);
  for (const [path, v] of [[paths.desktop, img.desktop], [paths.mobile, img.mobile]] as const) {
    const r = await bucket.upload(path, v.data, { contentType: "image/webp", upsert: false });
    // Duplicate: aynı oturumun önceki (çökmüş) denemesi aynı girdiden aynı varyantı yazmış → kabul.
    if (r.error && !isDuplicate(r.error)) {
      await release();
      return f(502, "storage", "Görsel kaydedilemedi. Lütfen yeniden deneyin.", r.error);
    }
  }
  const ins = await db
    .from(ASSETS_TABLE)
    .insert({
      id: assetId, tenant_id: o.tenantId, user_id: o.userId, kind: up.kind, original_format: img.format, original_bytes: bytes.length,
      original_width: img.originalWidth, original_height: img.originalHeight,
      desktop_path: paths.desktop, desktop_width: img.desktop.width, desktop_height: img.desktop.height, desktop_bytes: img.desktop.bytes,
      mobile_path: paths.mobile, mobile_width: img.mobile.width, mobile_height: img.mobile.height, mobile_bytes: img.mobile.bytes,
      sha256: img.sha256,
    })
    .select(ASSET_COLS)
    .single();
  let assetRow: AssetRow | null = (ins.data as AssetRow | null) ?? null;
  if (ins.error) {
    if ((ins.error as { code?: string }).code === "23505") {
      const ex = await ownAsset(db, o, assetId); // önceki deneme kaydı yazmış → aynı görsel
      if (!ex.ok) { await release(); return ex; }
      assetRow = ex.row;
    } else if (pgMsg(ins.error).includes("EXPERT_WORKSPACE_ASSET_CAP")) {
      await bucket.remove([paths.desktop, paths.mobile]); // kayıt yoksa dosya da kalmaz
      return abortWith(f(409, "asset_cap", "En fazla 60 görsel saklanabilir. Kullanılmayan bir görseli silip yeniden deneyin."));
    } else {
      await release();
      return f(500, "db", "Görsel kaydedilemedi.", ins.error);
    }
  }
  if (!assetRow) { await release(); return f(500, "db", "Görsel kaydı okunamadı."); }
  await setStatus(db, o, uploadId, "processing", "completed", { asset_id: assetId });
  await clearStaging(db, o, uploadId, up.chunk_count);
  return { ok: true, asset: view(assetRow) };
}

// ── Saatlik geçici dosya temizliği (Inngest) + başlatmada uzman bazlı toparlama ─────────────────────────────

export type CleanupResult = { scanned: number; aborted: number; cleared: number; failed: number };

/**
 * Süresi geçmiş açık / kilidi düşmüş işlenen oturumları iptal eder; kapalı (tamamlanan / iptal) ama geçici dosyası
 * silinmemiş oturumların parçalarını siler. Yalnız staging bucket'a ve upload satırına dokunur — kalıcı görsellere ASLA.
 * İdempotent; tek çalıştırmada sınırlı iş. `owner` verilirse yalnız o uzmanın oturumları.
 */
export async function cleanupStaging(db: SupabaseClient, opts: { owner?: Owner; limit?: number; now?: Date } = {}): Promise<CleanupResult | Fail> {
  const now = opts.now ?? new Date();
  const res: CleanupResult = { scanned: 0, aborted: 0, cleared: 0, failed: 0 };
  let q = db.from(UPLOADS_TABLE).select(`tenant_id, user_id, ${UPLOAD_COLS}`).is("staging_cleared_at", null).order("expires_at", { ascending: true }).limit(opts.limit ?? 200);
  if (opts.owner) q = q.eq("tenant_id", opts.owner.tenantId).eq("user_id", opts.owner.userId);
  const { data, error } = await q;
  if (error) return f(500, "db", "Temizlik listesi okunamadı.", error);
  const staleLease = now.getTime() - PROCESSING_LEASE_MS;
  for (const r of (data ?? []) as (UploadRow & { tenant_id: string; user_id: string })[]) {
    const o: Owner = { tenantId: r.tenant_id, userId: r.user_id };
    const expired = new Date(r.expires_at).getTime() <= now.getTime();
    let terminal = r.status === "completed" || r.status === "aborted";
    if (!terminal && expired) {
      const leaseOk = r.status === "processing" && r.processing_started_at && new Date(r.processing_started_at).getTime() > staleLease;
      if (leaseOk) continue; // süren işleme dokunulmaz
      res.scanned++;
      const s = await setStatus(db, o, r.id, r.status, "aborted");
      if (s.error) { res.failed++; continue; }
      if ((s.data ?? []).length === 1) { res.aborted++; terminal = true; }
    }
    if (!terminal) continue;
    if (r.status === "completed" || r.status === "aborted") res.scanned++;
    if (await clearStaging(db, o, r.id, r.chunk_count)) res.cleared++;
    else res.failed++;
  }
  return res;
}

// ── Okuma ────────────────────────────────────────────────────────────────────

export async function readAssetVariant(db: SupabaseClient, o: Owner, assetId: string, variant: "desktop" | "mobile"): Promise<{ ok: true; bytes: Buffer; sha256: string } | Fail> {
  const a = await ownAsset(db, o, assetId);
  if (!a.ok) return a;
  if (!a.row) return f(404, "not_found", "Görsel bulunamadı.");
  const { data, error } = await db.storage.from(ASSET_BUCKET).download(variant === "desktop" ? a.row.desktop_path : a.row.mobile_path);
  if (error || !data) return f(502, "storage", "Görsel okunamadı.", error);
  return { ok: true, bytes: Buffer.from(await data.arrayBuffer()), sha256: a.row.sha256 };
}

// ── Referans kontrolü + silme ───────────────────────────────────────────────

/** Görselin uzmanın tasarım satırında (uygulanan / taslak / geçmiş) geçtiği yerler. Ham JSON taranır → şemaya uymayan eski kayıt da korunur. */
export async function assetReferences(db: SupabaseClient, o: Owner, assetId: string): Promise<{ ok: true; where: string[] } | Fail> {
  const { data, error } = await db.from(DESIGNS_TABLE).select("applied, draft, history").eq("tenant_id", o.tenantId).eq("user_id", o.userId).maybeSingle();
  if (error) return f(500, "db", "Tasarım okunamadı.", error);
  if (!data) return { ok: true, where: [] };
  const row = data as { applied: unknown; draft: unknown; history: unknown };
  const has = (v: unknown) => v !== null && v !== undefined && JSON.stringify(v).includes(assetId);
  const where: string[] = [];
  if (has(row.applied)) where.push("uygulanan tasarım");
  if (has(row.draft)) where.push("taslak");
  if (Array.isArray(row.history)) row.history.forEach((h, i) => { if (has(h)) where.push(`geçmiş tasarım ${i + 1}`); });
  else if (has(row.history)) where.push("geçmiş");
  return { ok: true, where };
}

export async function deleteAsset(db: SupabaseClient, o: Owner, assetId: string): Promise<{ ok: true } | Fail> {
  const a = await ownAsset(db, o, assetId);
  if (!a.ok) return a;
  if (!a.row) return f(404, "not_found", "Görsel bulunamadı.");
  const refs = await assetReferences(db, o, assetId);
  if (!refs.ok) return refs;
  if (refs.where.length) return { ...f(409, "asset_in_use", `Bu görsel kullanılıyor (${refs.where.join(", ")}); önce tasarımdan kaldırın.`), where: refs.where } as Fail & { where: string[] };
  const rm = await db.storage.from(ASSET_BUCKET).remove([a.row.desktop_path, a.row.mobile_path]);
  if (rm.error) return f(502, "storage", "Görsel dosyası silinemedi; kayıt korundu. Yeniden deneyin.", rm.error);
  const upd = await db.from(ASSETS_TABLE).update({ deleted_at: new Date().toISOString(), deleted_by: o.userId }).eq("id", assetId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).is("deleted_at", null).select("id");
  if (upd.error) return f(500, "db", "Görsel kaydı güncellenemedi.", upd.error);
  return { ok: true };
}

/** Tasarımdaki görsel kimlikleri bu uzmana ait, silinmemiş ve doğru türde olmalı (logo ↔ logo, arka plan ↔ photo). */
export async function verifyDesignAssets(db: SupabaseClient, o: Owner, d: WorkspaceDesign): Promise<{ ok: true } | Fail> {
  const need: { id: string; kind: AssetKind; path: string }[] = [];
  if (d.logo.assetId) need.push({ id: d.logo.assetId, kind: "logo", path: "design.logo.assetId" });
  if (d.bg.photoAssetId) need.push({ id: d.bg.photoAssetId, kind: "photo", path: "design.bg.photoAssetId" });
  for (const n of need) {
    const a = await ownAsset(db, o, n.id);
    if (!a.ok) return a;
    if (!a.row) return f(400, "asset_not_found", `Görsel bulunamadı veya size ait değil (${n.path}).`);
    if (a.row.kind !== n.kind) return f(400, "asset_kind", `Görsel türü uygun değil (${n.path}).`);
  }
  return { ok: true };
}
