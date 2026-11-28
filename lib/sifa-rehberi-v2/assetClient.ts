/**
 * Şifa Rehberi V2 — görsel İSTEMCİ hattı (yalnız tarayıcı).
 *
 * Yükleme (canlı): dosya tarayıcıda küçültülür (JPEG; küçük PNG olduğu gibi) → POST assets/prepare
 * (yol + kısa ömürlü yükleme jetonu SUNUCUDAN) → imzalı yükleme (özel bucket) → POST assets/finalize
 * (sunucu nesneyi indirip baytları doğrular, sonra kaydeder) → içerikte YALNIZ `sifa-asset:<uuid>`.
 * İçerik JSON'una base64 YAZILMAZ. Finalize olmadan yarım kalan nesne assets/discard ile silinir.
 *
 * Gösterim: `sifa-asset:<uuid>` → POST assets/signed-urls (sunucu YALNIZ görebileceğiniz görselleri imzalar;
 * kısa ömürlü). Bağlantılar yalnız bellekte tutulur; süresi dolmadan yenilenir; yüklenemezse yeniden istenir.
 * Kalıcı yere (DB/localStorage) bağlantı yazılmaz.
 */
import { ASSET_SRC_RE } from "@/lib/sifa-rehberi-v2/contentSafety";

export const SIFA_ASSET_BUCKET = "sifa-arastirma";
/** Tarayıcıya verilen ham dosya üst sınırı (küçültmeden önce). */
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;
/** Sunucu sınırı (storage.ts MAX_IMAGE_BYTES ile aynı). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1800;
const PNG_KEEP_BYTES = 3 * 1024 * 1024;
/** Bağlantının bitişine bu kadar kala yenilenir. */
const REFRESH_MARGIN_MS = 45_000;
/** Yüklenmeyen/boş görsel yer tutucusu (1×1 saydam). */
export const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

type Config = { base: string; headers: () => Record<string, string> };
let config: Config | null = null;

/** Canlı sayfa bir kez yapılandırır (API kökü + oturum başlıkları). Yapılandırılmamışsa yükleme yok. */
export function configureAssetClient(c: Config | null) {
  config = c;
}
export function assetUploadAvailable(): boolean {
  return config !== null;
}

export function assetIdOf(src: unknown): string | null {
  const m = ASSET_SRC_RE.exec(String(src ?? ""));
  return m ? m[1] : null;
}

// ── İmzalı bağlantı önbelleği ───────────────────────────────────────────────
type Entry = { url: string; exp: number } | { failed: true; at: number };
const cache = new Map<string, Entry>();
const pending = new Set<string>();
const inflight = new Set<string>();
const retries = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  version += 1;
  for (const l of listeners) l();
}
export function subscribeAssets(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function assetsVersion(): number {
  return version;
}

function schedule() {
  if (flushTimer || !config) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 30);
}

async function flush() {
  const c = config;
  if (!c) return;
  const ids = [...pending].filter((id) => !inflight.has(id)).slice(0, 200);
  for (const id of ids) {
    pending.delete(id);
    inflight.add(id);
  }
  if (!ids.length) return;
  try {
    const res = await fetch(`${c.base}/assets/signed-urls`, {
      method: "POST",
      headers: { "content-type": "application/json", ...c.headers() },
      body: JSON.stringify({ ids }),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; urls?: Record<string, string>; ttlSec?: number } | null;
    const ttl = Math.max(30, Number(j?.ttlSec ?? 300)) * 1000;
    const now = Date.now();
    for (const id of ids) {
      const u = res.ok && j?.ok ? j.urls?.[id] : undefined;
      // Görünmeyen/başkasına ait görsel → sunucu bağlantı vermez → "görüntülenemiyor" (varlık sızmaz).
      cache.set(id, u ? { url: u, exp: now + ttl } : { failed: true, at: now });
    }
  } catch {
    const now = Date.now();
    for (const id of ids) cache.set(id, { failed: true, at: now });
  } finally {
    for (const id of ids) inflight.delete(id);
    if (pending.size) schedule();
    emit();
  }
}

/**
 * Görsel kaynağını çözer: base64/https olduğu gibi; sifa-asset → geçerli imzalı bağlantı ya da (istek
 * kuyruğa alınıp) null. `failed` = sunucu bu görseli vermedi.
 */
export function resolveAssetSrc(src: unknown): { url: string | null; failed: boolean } {
  const id = assetIdOf(src);
  if (!id) return { url: typeof src === "string" ? src : null, failed: false };
  const e = cache.get(id);
  const now = Date.now();
  if (e && "url" in e) {
    if (e.exp - now < REFRESH_MARGIN_MS) {
      pending.add(id);
      schedule();
    }
    if (e.exp > now) return { url: e.url, failed: false };
    return { url: null, failed: false };
  }
  if (e && "failed" in e) {
    // 20 sn sonra bir kez daha dene (geçici ağ hatası); sürekli deneme yok.
    if (now - e.at > 20_000 && (retries.get(id) ?? 0) < 3) {
      retries.set(id, (retries.get(id) ?? 0) + 1);
      cache.delete(id);
      pending.add(id);
      schedule();
    }
    return { url: null, failed: true };
  }
  pending.add(id);
  schedule();
  return { url: null, failed: false };
}

/** <img> yüklenemedi (ör. bağlantı süresi doldu) → bağlantıyı unut ve yenisini iste. */
export function invalidateAsset(id: string) {
  const e = cache.get(id);
  if (e && "url" in e && !e.url.startsWith("blob:")) {
    const n = (retries.get(id) ?? 0) + 1;
    retries.set(id, n);
    if (n > 3) {
      cache.set(id, { failed: true, at: Date.now() });
      emit();
      return;
    }
    cache.delete(id);
    pending.add(id);
    schedule();
  }
}

/** Yeni yüklenen görseli hemen göstermek için yerel önizleme (yalnız bu sekmede, bellekte). */
function seedPreview(id: string, blob: Blob) {
  cache.set(id, { url: URL.createObjectURL(blob), exp: Date.now() + 30 * 60_000 });
  emit();
}

/** Yalnız test/geliştirme kancası: önbelleği boşaltır. */
export function __resetAssetCacheForTests() {
  cache.clear();
  pending.clear();
  retries.clear();
  emit();
}

// ── Yükleme ─────────────────────────────────────────────────────────────────
export class AssetUploadError extends Error {}

async function sniffPng(file: Blob): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return b.length === 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

/** Küçültme: en uzun kenar ≤ MAX_EDGE, JPEG 0.85 (Word ile uyumlu). Küçük PNG (çizim/tablo) olduğu gibi. */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.size <= 0) throw new AssetUploadError("Dosya boş.");
  if (file.size > MAX_INPUT_BYTES) throw new AssetUploadError("Görsel çok büyük (en fazla 30 MB seçilebilir).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AssetUploadError("Dosya geçerli bir görsel değil. PNG, JPEG, WebP veya GIF seçin.");
  }
  const edge = Math.max(bitmap.width, bitmap.height);
  if ((await sniffPng(file)) && file.size <= PNG_KEEP_BYTES && edge <= MAX_EDGE) {
    bitmap.close?.();
    return new Blob([await file.arrayBuffer()], { type: "image/png" });
  }
  const scale = Math.min(1, MAX_EDGE / edge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const g = canvas.getContext("2d");
  if (!g) throw new AssetUploadError("Görsel işlenemedi.");
  g.fillStyle = "#ffffff"; // saydam alan JPEG'de siyah olmasın
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob || blob.type !== "image/jpeg") throw new AssetUploadError("Görsel işlenemedi.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new AssetUploadError("Görsel en fazla 10 MB olabilir.");
  return blob;
}

async function postJson(path: string, body: unknown): Promise<{ res: Response; j: Record<string, unknown> | null }> {
  const c = config!;
  const res = await fetch(`${c.base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...c.headers() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { res, j };
}

/** Görseli Storage'a yükler; içerikte kullanılacak kaynak `sifa-asset:<uuid>` döner. Hata → AssetUploadError. */
export async function uploadSifaImage(file: File, caption = ""): Promise<{ src: string; assetId: string }> {
  if (!config) throw new AssetUploadError("Görsel yükleme bu ekranda kullanılamıyor.");
  const blob = await prepareImage(file);
  const mimeType = blob.type;
  let prep;
  try {
    prep = await postJson("/assets/prepare", { mimeType, size: blob.size });
  } catch {
    throw new AssetUploadError("Sunucuya ulaşılamadı; görsel yüklenmedi.");
  }
  const p = prep.j as { ok?: boolean; assetId?: string; path?: string; token?: string; error?: string } | null;
  if (!prep.res.ok || !p?.ok || !p.assetId || !p.path || !p.token) {
    // 401 = oturum kapanmış: ham "Yetki gerekli." gösterilmez (WT4 kuralı; SifaRehberi.tsx ile aynı metin).
    if (prep.res.status === 401) throw new AssetUploadError("Oturumunuz sona ermiş görünüyor; yeniden giriş yapın");
    throw new AssetUploadError(p?.error ?? `Görsel yüklenemedi (HTTP ${prep.res.status}).`);
  }
  // Supabase istemcisi yalnız yüklemede (tembel) — modül, sunucu/test içe aktarımında ortam istemez.
  const { supabase } = await import("@/lib/supabase");
  const { error: upErr } = await supabase.storage
    .from(SIFA_ASSET_BUCKET)
    .uploadToSignedUrl(p.path, p.token, blob, { contentType: mimeType, upsert: false });
  if (upErr) {
    void discard(p.assetId, p.path);
    throw new AssetUploadError("Görsel depoya yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.");
  }
  let fin;
  try {
    fin = await postJson("/assets/finalize", { assetId: p.assetId, path: p.path, caption: caption.slice(0, 500) });
  } catch {
    void discard(p.assetId, p.path);
    throw new AssetUploadError("Sunucuya ulaşılamadı; görsel kaydedilmedi.");
  }
  const f = fin.j as { ok?: boolean; src?: string; error?: string } | null;
  if (!fin.res.ok || !f?.ok || !f.src || assetIdOf(f.src) !== p.assetId) {
    void discard(p.assetId, p.path);
    throw new AssetUploadError(f?.error ?? `Görsel kaydedilemedi (HTTP ${fin.res.status}).`);
  }
  seedPreview(p.assetId, blob);
  return { src: f.src, assetId: p.assetId };
}

/** Finalize edilmemiş (DB kaydı olmayan) kendi yüklemesini siler; kayıtlı görsele sunucu dokunmaz. */
async function discard(assetId: string, path: string) {
  try {
    await postJson("/assets/discard", { assetId, path });
  } catch {
    /* sessiz: yarım nesne sunucu temizliğine kalır (rapora bkz.) */
  }
}
