/**
 * Kişisel Arşiv — yükleme politikası (DIJ-03 + BUG-020, satış öncesi AŞAMA 1).
 *
 * Önceki durum: boyut yalnız istemci beyanıydı ve opsiyoneldi; dosya türü hiç denetlenmiyordu
 * (.exe kabul ediliyordu); tenant kotası yoktu.
 *
 * Kural (owner kararları 2026-10-20):
 *   - Tenant başına toplam 2 GB (= 2 × 1024³ = 2 147 483 648 bayt), dosya başına 50 MB (52 428 800 bayt).
 *   - Kota DB'de, tenant başına danışma kilidi altında ATOMİK uygulanır:
 *       hazırlık (signed URL)  → personal_archive_reserve_upload: gerçek depo baytı + bekleyen
 *                                rezervasyonlar + yeni beyan ≤ kota ise rezervasyon yazılır;
 *       finalize               → personal_archive_commit_upload: nesnenin GERÇEK boyut/türü
 *                                storage.objects'ten okunur, tekil sınır + kota yeniden denetlenir.
 *     Böylece eşzamanlı yüklemeler kotayı birlikte aşamaz ve istemcinin beyanına güvenilmez.
 *   - FAIL-CLOSED: RPC yoksa (migration 20271120001200 uygulanmamış) veya hata verirse YENİ yükleme
 *     durdurulur. Mevcut dosyaların listelenmesi/indirilmesi/silinmesi bu modülü kullanmaz → etkilenmez.
 *   - Yürütülebilir / betik / tarayıcıda çalışan (html, svg, xml) dosyalar uzantı VEYA MIME ile reddedilir.
 *     Diğer türler bugünkü gibi kabul edilir; tam beyaz liste owner kararına bırakıldı.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSONAL_ARCHIVE_BUCKET, PERSONAL_ARCHIVE_MAX_BYTES } from "./storagePath";

export const PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (2 147 483 648 bayt)
/** Aynı tenant için aynı anda bekleyebilecek (yüklenmemiş) hazırlık sayısı. UI sıralı yükler. */
export const PERSONAL_ARCHIVE_MAX_PENDING_UPLOADS = 5;
/**
 * Supabase imzalı YÜKLEME URL'leri 2 saat geçerlidir (storage-js createSignedUploadUrl; kısaltma seçeneği yok).
 * Rezervasyon belirteçten ÖNCE düşerse belirteç kotasız yükleme yapabilirdi.
 */
export const PERSONAL_ARCHIVE_SIGNED_UPLOAD_TOKEN_SECONDS = 2 * 60 * 60;
/**
 * finalize sahiplenme payı: rezervasyonun bitmesine bu süreden az kalmışsa finalize SAHİPLENEMEZ. Bir istek
 * sahiplenme ile kayıt yazma arasında bu süreden uzun kalamaz (Vercel fonksiyon azami süresi 800 s < 900 s);
 * böylece süpürmenin "eski" saydığı bir nesne için kayıt yazma aşamasında finalize bulunamaz (sınır yarışı).
 */
export const PERSONAL_ARCHIVE_FINALIZE_CLAIM_MARGIN_SECONDS = 15 * 60;
/** Rezervasyon = belirteç ömrü + 5 dk + sahiplenme payı → belirteç ömrü içinde yüklenen her dosya finalize edilebilir. */
export const PERSONAL_ARCHIVE_RESERVATION_TTL_SECONDS =
  PERSONAL_ARCHIVE_SIGNED_UPLOAD_TOKEN_SECONDS + 5 * 60 + PERSONAL_ARCHIVE_FINALIZE_CLAIM_MARGIN_SECONDS;
/** Süpürme / "taze" sınırı: rezervasyon süresi + 5 dk saat farkı payı. Daha genç nesnelere süpürme dokunmaz. */
export const PERSONAL_ARCHIVE_SWEEP_MIN_AGE_SECONDS = PERSONAL_ARCHIVE_RESERVATION_TTL_SECONDS + 5 * 60;
/**
 * Kota KESİN tavan: imzalı URL istemcinin beyanından bağımsız olarak bucket tavanı kadar (50 MB) yükleyebilir.
 * Bu yüzden her hazırlık EN KÖTÜ DURUM (50 MB) ile rezerve edilir → kullanım + açık rezervasyonlar ≤ 2 GB iken
 * gerçek depo da hiçbir anda 2 GB'ı aşamaz. Bedeli: yeni yükleme için en az 50 MB boş alan gerekir.
 */
export const PERSONAL_ARCHIVE_RESERVATION_BYTES = PERSONAL_ARCHIVE_MAX_BYTES;

export const QUOTA_UNAVAILABLE_MESSAGE =
  "Depolama kotası şu anda doğrulanamıyor; yükleme yapılamadı. Mevcut dosyalarınız etkilenmez, lütfen daha sonra tekrar deneyin.";
export const QUOTA_EXCEEDED_MESSAGE = "Arşiv depolama kotası (2 GB) doldu.";
/** Hazırlık reddi: en kötü durum rezervasyonu (50 MB) kalan alana sığmıyor. */
export const QUOTA_NO_ROOM_MESSAGE =
  "Arşiv depolama kotasında (2 GB) yeni yükleme için yeterli alan yok: her yükleme için en az 50 MB boş alan gerekir.";

/** Her durumda reddedilen uzantılar (yürütülebilir, betik, kurulum paketi, tarayıcıda çalışan). */
export const PERSONAL_ARCHIVE_BLOCKED_EXT: ReadonlySet<string> = new Set([
  "exe", "msi", "msp", "bat", "cmd", "com", "scr", "pif", "cpl", "dll", "sys", "drv", "ocx",
  "ps1", "psm1", "psd1", "vbs", "vbe", "js", "jse", "mjs", "cjs", "wsf", "wsh", "wsc", "hta", "jar",
  "apk", "aab", "xapk", "ipa", "sh", "bash", "zsh", "csh", "run", "bin", "app", "dmg", "pkg", "deb", "rpm",
  "lnk", "reg", "inf", "scf", "url", "gadget", "msc", "appx", "msix", "appxbundle",
  "html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "xsl", "php", "asp", "aspx", "jsp", "py", "pl", "rb",
]);

/** Her durumda reddedilen MIME türleri (tarayıcının bildirdiği / deponun kaydettiği). */
const BLOCKED_MIME: ReadonlySet<string> = new Set([
  "application/x-msdownload", "application/x-ms-installer", "application/x-msi", "application/x-dosexec",
  "application/x-executable", "application/x-sh", "application/x-csh", "application/x-bat",
  "application/vnd.microsoft.portable-executable", "application/java-archive", "application/x-java-archive",
  "application/vnd.android.package-archive", "application/x-apple-diskimage", "application/javascript",
  "text/javascript", "application/x-javascript", "text/html", "application/xhtml+xml", "image/svg+xml",
  "application/hta", "application/x-ms-shortcut", "application/xml", "text/xml",
]);

export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).trim().toLowerCase() : "";
}

/** BUG-020: dosya adı ve (varsa) MIME türü kabul edilebilir mi. */
export function isAllowedPersonalArchiveFile(fileName: string, mime: string | null | undefined): boolean {
  const ext = fileExtension(fileName);
  if (ext && PERSONAL_ARCHIVE_BLOCKED_EXT.has(ext)) return false;
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m && BLOCKED_MIME.has(m)) return false;
  return true;
}

export type ReserveResult =
  | { readonly kind: "ok" }
  | { readonly kind: "quota" }
  | { readonly kind: "pending_limit" }
  | { readonly kind: "unavailable" };

/**
 * Hazırlık: atomik kota rezervasyonu. RPC yok/hata/beklenmeyen yanıt → unavailable (fail-closed).
 * İstemcinin beyan ettiği boyut kullanılmaz: rezervasyon her zaman PERSONAL_ARCHIVE_RESERVATION_BYTES (50 MB).
 */
export async function reservePersonalArchiveUpload(
  db: SupabaseClient,
  tenantId: string,
  path: string,
): Promise<ReserveResult> {
  try {
    const { data, error } = await db.rpc("personal_archive_reserve_upload", {
      p_tenant_id: tenantId,
      p_path: path,
      p_bytes: PERSONAL_ARCHIVE_RESERVATION_BYTES,
      p_quota: PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES,
      p_max_pending: PERSONAL_ARCHIVE_MAX_PENDING_UPLOADS,
      p_ttl_seconds: PERSONAL_ARCHIVE_RESERVATION_TTL_SECONDS,
    });
    if (error || !data || typeof data !== "object") return { kind: "unavailable" };
    const d = data as { ok?: unknown; reason?: unknown };
    if (d.ok === true) return { kind: "ok" };
    if (d.reason === "quota") return { kind: "quota" };
    if (d.reason === "pending_limit") return { kind: "pending_limit" };
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

export type CommitResult =
  | { readonly kind: "ok"; readonly size: number; readonly mimetype: string | null }
  | { readonly kind: "rejected"; readonly reason: "too_large" | "quota" | "missing" | "size_unknown"; readonly mimetype: string | null }
  | { readonly kind: "unavailable" };

/** Finalize: depodaki GERÇEK boyut/tür + atomik kota denetimi. RPC yok/hata → unavailable (fail-closed). */
export async function commitPersonalArchiveUpload(
  db: SupabaseClient,
  tenantId: string,
  path: string,
  maxFileBytes: number,
): Promise<CommitResult> {
  try {
    const { data, error } = await db.rpc("personal_archive_commit_upload", {
      p_tenant_id: tenantId,
      p_path: path,
      p_quota: PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES,
      p_max_file: maxFileBytes,
    });
    if (error || !data || typeof data !== "object") return { kind: "unavailable" };
    const d = data as { ok?: unknown; reason?: unknown; size?: unknown; mimetype?: unknown };
    const mimetype = typeof d.mimetype === "string" ? d.mimetype : null;
    if (d.ok === true && typeof d.size === "number" && Number.isFinite(d.size)) {
      return { kind: "ok", size: d.size, mimetype };
    }
    if (d.reason === "too_large" || d.reason === "quota" || d.reason === "missing" || d.reason === "size_unknown") {
      return { kind: "rejected", reason: d.reason, mimetype };
    }
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * Güvence rezervasyonu bayt değeri: YÜKLEME rezervasyonundan (tam 50 MB) AYIRT EDİLİR. finalize / cleanup yalnız
 * tam 50 MB'lık yükleme rezervasyonunu sahiplenebilir; güvence satırı hiçbir zaman "kaydedilebilir yükleme" sayılmaz.
 */
export const PERSONAL_ARCHIVE_GUARD_BYTES = PERSONAL_ARCHIVE_RESERVATION_BYTES + 1;

export type ClaimedPersonalArchiveReservation = {
  path: string;
  tenant_id: string;
  declared_bytes: number;
  created_at: string;
  expires_at: string;
};

/**
 * Yolun CANLI YÜKLEME rezervasyonunu atomik olarak sahiplenir (tek DELETE … RETURNING).
 * finalize, cleanup ve geriye dönük JSON hattı aynı satır için yarışır; satırı YALNIZ biri alır. Sahiplenemeyen
 * taraf nesneye DOKUNMAZ ve kayıt YAZMAZ → "kayıt yok gördüm → arada finalize kaydetti → ben sildim / ezdim"
 * yarışı yapısal olarak imkânsızdır. Dönüş: satır = sahiplenildi; false = başkası aldı / süresi doldu; null = DB hatası.
 */
export async function claimPersonalArchiveUpload(
  db: SupabaseClient,
  tenantId: string,
  path: string,
  minRemainingSeconds = 0,
): Promise<ClaimedPersonalArchiveReservation | false | null> {
  try {
    const { data, error } = await db
      .from("personal_archive_upload_reservations")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("path", path)
      .eq("declared_bytes", PERSONAL_ARCHIVE_RESERVATION_BYTES)
      .gt("expires_at", new Date(Date.now() + minRemainingSeconds * 1000).toISOString())
      .select("path, tenant_id, declared_bytes, created_at, expires_at");
    if (error || !Array.isArray(data)) return null;
    return data.length === 1 ? (data[0] as ClaimedPersonalArchiveReservation) : false;
  } catch {
    return null;
  }
}

/** Kota doğrulanamadıysa (RPC hatası) sahiplenilen satır AYNEN geri konur → nesneye dokunulmaz, yeniden denenebilir. */
export async function restorePersonalArchiveClaim(db: SupabaseClient, row: ClaimedPersonalArchiveReservation): Promise<boolean> {
  try {
    const { error } = await db.from("personal_archive_upload_reservations").insert(row);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Sahiplenilmiş (artık hiçbir finalize'ın kaydedemeyeceği) yolun nesnesini elden çıkarır. Savunma: yol yine de
 * kayıtlıysa (ya da kayıt doğrulanamazsa) DOKUNULMAZ. Ardından retirePersonalArchivePaths (güvence + silme ya da
 * 0 B yer tutucu). Dönüş false → güvenli elden çıkarma yapılamadı (nesne olduğu gibi kaldı; kotada sayılır).
 */
export async function disposeClaimedPersonalArchivePaths(
  db: SupabaseClient,
  tenantId: string,
  paths: readonly string[],
): Promise<boolean> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return true;
  try {
    const { data: regs, error: regErr } = await db
      .from("personal_archive_files")
      .select("file_path")
      .eq("tenant_id", tenantId)
      .in("file_path", unique);
    if (regErr || !Array.isArray(regs)) return false;
    const registered = new Set(regs.map((r) => (r as { file_path?: unknown }).file_path));
    return await retirePersonalArchivePaths(db, tenantId, unique.filter((p) => !registered.has(p)));
  } catch {
    return false;
  }
}

/** Güvence rezervasyonları en fazla bu kadar bekleme yuvası kullanır (UI sıralı yükler; ≥2 yuva gerçek yüklemelere kalır). */
const GUARD_MAX_PENDING = PERSONAL_ARCHIVE_MAX_PENDING_UPLOADS - 2;

/** Atomik güvence rezervasyonu (aynı RPC, aynı danışma kilidi; 50 MB + 1 bayt): kotaya sığarsa true. */
async function reserveTokenGuard(db: SupabaseClient, tenantId: string, path: string): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("personal_archive_reserve_upload", {
      p_tenant_id: tenantId,
      p_path: path,
      p_bytes: PERSONAL_ARCHIVE_GUARD_BYTES,
      p_quota: PERSONAL_ARCHIVE_TENANT_QUOTA_BYTES,
      p_max_pending: GUARD_MAX_PENDING,
      p_ttl_seconds: PERSONAL_ARCHIVE_RESERVATION_TTL_SECONDS,
    });
    return !error && !!data && typeof data === "object" && (data as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

/**
 * Belirteci hâlâ canlı olabilecek yolları serbest bırakır (YOL BAŞINA, sırayla — bekleme yuvası denetimi doğru kalsın).
 * ÖN KOŞUL: yol ya sahiplenilmiş (kaydedilemez) ya da kullanıcı tarafından silinmek üzere seçilmiş kayıtlı dosyadır.
 *   - atomik güvence rezervasyonu alınabilirse nesne SİLİNİR (kullanım + rezervasyon ≤ kota; eski bağlantı 404);
 *   - alınamazsa (kota dolu / yuva yok / RPC hatası) 0 baytlık YER TUTUCU (belirteç yükleyemez, kota 0 sayar).
 */
export async function retirePersonalArchivePaths(db: SupabaseClient, tenantId: string, paths: readonly string[]): Promise<boolean> {
  let ok = true;
  for (const p of paths) {
    if (await reserveTokenGuard(db, tenantId, p)) {
      const { error } = await db.storage.from(PERSONAL_ARCHIVE_BUCKET).remove([p]);
      if (error) ok = false;
    } else if (!(await occupyPersonalArchivePaths(db, [p]))) {
      ok = false;
    }
  }
  return ok;
}

/** Yolları 0 baytlık yer tutucuyla doldurur (upsert): belirteç yeniden yükleyemez, kota 0 bayt sayar. */
export async function occupyPersonalArchivePaths(db: SupabaseClient, paths: readonly string[]): Promise<boolean> {
  let ok = true;
  for (const p of paths) {
    const { error } = await db.storage
      .from(PERSONAL_ARCHIVE_BUCKET)
      .upload(p, new Uint8Array(0), { upsert: true, contentType: "application/octet-stream" });
    if (error) ok = false;
  }
  return ok;
}

type ListedObject = { path: string; touchedAt: number };

async function listArchiveFolder(db: SupabaseClient, tenantId: string, archiveId: string): Promise<ListedObject[] | null> {
  const folder = `${tenantId}/${archiveId}`;
  const out: ListedObject[] = [];
  try {
    for (let offset = 0; offset < 100_000; offset += 1000) {
      const { data, error } = await db.storage.from(PERSONAL_ARCHIVE_BUCKET).list(folder, { limit: 1000, offset });
      if (error || !Array.isArray(data)) return null;
      for (const o of data) {
        const x = o as { name?: string; id?: string | null; created_at?: string | null; updated_at?: string | null };
        if (!x.name || x.id === null) continue; // alt klasör
        const t = Math.max(Date.parse(x.created_at ?? "") || 0, Date.parse(x.updated_at ?? "") || 0);
        out.push({ path: `${folder}/${x.name}`, touchedAt: t || Number.NaN });
      }
      if (data.length < 1000) break;
    }
  } catch {
    return null;
  }
  return out;
}

/**
 * Kayıtlı dosya silinirken: belirteci hâlâ canlı olabilecek (yakın zamanda yüklenmiş) nesneler silinmez, retire edilir.
 * Nesnenin oluşturulma zamanı ≥ belirtecin verilme zamanı olduğundan "oluşturulma + rezervasyon süresi" belirteç
 * ömrünün güvenli üst sınırıdır. Liste alınamazsa null (fail-closed).
 */
export async function splitFreshPersonalArchivePaths(
  db: SupabaseClient,
  tenantId: string,
  archiveId: string,
  paths: readonly string[],
): Promise<{ fresh: string[]; old: string[] } | null> {
  const listed = await listArchiveFolder(db, tenantId, archiveId);
  if (!listed) return null;
  const touched = new Map(listed.map((o) => [o.path, o.touchedAt]));
  const cutoff = Date.now() - PERSONAL_ARCHIVE_SWEEP_MIN_AGE_SECONDS * 1000;
  const fresh: string[] = [];
  const old: string[] = [];
  for (const p of paths) {
    if (!touched.has(p)) continue; // depoda yok → silinecek nesne yok
    const t = touched.get(p)!;
    if (Number.isFinite(t) && t < cutoff) old.push(p);
    else fresh.push(p); // zaman bilinmiyorsa taze say (güvenli taraf)
  }
  return { fresh, old };
}

/**
 * Fırsatçı süpürme (arşiv klasörü): kaydı OLMAYAN, CANLI rezervasyonu OLMAYAN ve son dokunuşu
 * PERSONAL_ARCHIVE_SWEEP_MIN_AGE_SECONDS'tan (2 sa 25 dk) ESKİ nesneleri (terk edilmiş yüklemeler + 0 B yer tutucular) siler.
 * Sınır güvenliği: finalize yalnız bitişe ≥15 dk kalan rezervasyonu sahiplenebilir → sahiplenmiş bir finalize'ın nesnesi
 * en az 20 dk daha "taze"dir; o sürede istek ya kaydı yazmış ya da (fonksiyon süresi aşımıyla) hiç yazamamıştır.
 * Güvenlik: böyle bir yolun belirteci ölmüştür ve sahiplenilebilir yükleme rezervasyonu yoktur → hiçbir finalize
 * onu kaydedemez; kayıtlı dosyalar ve canlı belirteçli yollar hiçbir koşulda silinmez. En iyi çaba; hata yutulur.
 */
export async function sweepPersonalArchiveFolder(db: SupabaseClient, tenantId: string, archiveId: string): Promise<number> {
  try {
    const listed = await listArchiveFolder(db, tenantId, archiveId);
    if (!listed) return 0;
    const cutoff = Date.now() - PERSONAL_ARCHIVE_SWEEP_MIN_AGE_SECONDS * 1000;
    const stale = listed.filter((o) => Number.isFinite(o.touchedAt) && o.touchedAt < cutoff).map((o) => o.path);
    let removed = 0;
    for (let i = 0; i < stale.length; i += 100) {
      const batch = stale.slice(i, i + 100);
      const { data: regs, error: regErr } = await db
        .from("personal_archive_files").select("file_path").eq("tenant_id", tenantId).in("file_path", batch);
      if (regErr || !Array.isArray(regs)) return removed;
      const { data: live, error: resErr } = await db
        .from("personal_archive_upload_reservations").select("path").eq("tenant_id", tenantId).in("path", batch)
        .gt("expires_at", new Date().toISOString());
      if (resErr || !Array.isArray(live)) return removed;
      const keep = new Set([...regs.map((r) => (r as { file_path?: unknown }).file_path), ...live.map((r) => (r as { path?: unknown }).path)]);
      const victims = batch.filter((p) => !keep.has(p));
      if (victims.length === 0) continue;
      const { error } = await db.storage.from(PERSONAL_ARCHIVE_BUCKET).remove(victims);
      if (!error) removed += victims.length;
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Kullanılmayan rezervasyonu bırak (best-effort; süre dolunca zaten düşer). */
export async function releasePersonalArchiveReservation(db: SupabaseClient, tenantId: string, path: string): Promise<void> {
  try {
    await db.from("personal_archive_upload_reservations").delete().eq("path", path).eq("tenant_id", tenantId);
  } catch {
    // best-effort
  }
}
