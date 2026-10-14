/**
 * Kalite koruyan görsel optimizasyonu (tarayıcı) — tüm görsel yükleme ekranlarının ortak yolu.
 *
 * Amaç körlemesine küçültmek DEĞİL, görüntü kalitesini koruyarak gereksiz boyutu azaltmaktır:
 *   - Karar `lib/media/imageFormat.ts` (saf) içindedir: animasyonlu görseller, PNG (yazı/çizgi/
 *     şeffaflık) ve tanınmayan biçimler ORİJİNAL kalır.
 *   - Yeniden kodlama yüksek kaliteli WebP ile yapılır (varsayılan q=0.90, uzun kenar ≤ 2560 px);
 *     sınır aşılırsa kalite en fazla 0.80'e, çözünürlük en fazla 1600 px'e iner — daha aşağı İNMEZ.
 *   - EXIF yön bilgisi çözümlemede uygulanır (createImageBitmap imageOrientation:"from-image";
 *     yedek yolda <img> zaten EXIF'e göre döndürür) → çıktı doğru yönde, EXIF'e ihtiyaç duymaz.
 *   - Büyük küçültmelerde kademeli (yarıya) ölçekleme → ince çizgiler ve yazılar aliasing ile
 *     kaybolmaz.
 *   - Çıktı orijinalden büyük/eşitse, çözümleme ya da kodlama başarısızsa → ORİJİNAL kullanılır.
 *   - Sınır aşılıyor ve kalite merdiveni bitiyorsa `tooLarge: true` döner → çağıran sessizce
 *     yüklemez, kullanıcıya açık hata gösterir.
 * Belgelere (PDF/Word/JSON/TXT) hiçbir zaman uygulanmaz: görsel olmayan dosya aynen döner.
 */
import {
  SNIFF_BYTES,
  fitWithin,
  planImageOptimization,
  qualityLadder,
  sniffImageBytes,
  type OptimizePlan,
  type OptimizeProfile,
  type SniffedImageFormat,
} from "@/lib/media/imageFormat";

export type ImageOptimizeOptions = {
  profile?: OptimizeProfile;
  /** Modülün tek dosya sınırı (bayt). Aşılırsa kalite merdiveni devreye girer. */
  maxBytes?: number;
  /** Uzun kenar üst sınırı (px). Varsayılan 2560. */
  maxDimension?: number;
  /** Merdivenin inebileceği en küçük uzun kenar (px). Varsayılan 1600. */
  minDimension?: number;
  /** Başlangıç WebP kalitesi. Varsayılan 0.90. */
  quality?: number;
  /** En düşük kalite. Varsayılan 0.80. */
  minQuality?: number;
  /** Bu boyutun altındaki fotoğraflar (ve piksel sınırı içindekiler) aynen kalır. Varsayılan 400 KB. */
  skipBelowBytes?: number;
};

export type ImageOptimizeResult = {
  file: File;
  optimized: boolean;
  /** Karar gerekçesi (teşhis/test için). */
  reason: string;
  format: SniffedImageFormat | "not-image";
  originalBytes: number;
  finalBytes: number;
  /** true → dosya modül sınırına sığdırılamadı; çağıran yüklemeyi DURDURUP hata göstermeli. */
  tooLarge: boolean;
};

const DEFAULTS = {
  maxDimension: 2560,
  minDimension: 1600,
  quality: 0.9,
  minQuality: 0.8,
  skipBelowBytes: 400 * 1024,
};

const MIME_BY_FORMAT: Partial<Record<SniffedImageFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const IMAGE_NAME_RE =/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i;

/** Dosya görsel mi? (Bazı Android seçicileri MIME'ı boş döndürür → uzantıya bakılır.) */
export function looksLikeImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith("image/");
  return IMAGE_NAME_RE.test(file.name);
}

function keepResult(
  file: File,
  reason: string,
  format: ImageOptimizeResult["format"],
  maxBytes?: number,
): ImageOptimizeResult {
  return {
    file,
    optimized: false,
    reason,
    format,
    originalBytes: file.size,
    finalBytes: file.size,
    tooLarge: typeof maxBytes === "number" && file.size > maxBytes,
  };
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decodeImage(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* <img> yoluna düş */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = "async";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Kademeli yüksek kaliteli küçültme: her adımda en fazla yarıya iner. */
function drawScaled(decoded: Decoded, target: { width: number; height: number }): HTMLCanvasElement | null {
  let src: CanvasImageSource = decoded.source;
  let w = decoded.width;
  let h = decoded.height;
  while (w / 2 >= target.width && h / 2 >= target.height) {
    const nw = Math.round(w / 2);
    const nh = Math.round(h / 2);
    const step = makeCanvas(nw, nh);
    const sctx = step.getContext("2d");
    if (!sctx) return null;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
    src = step;
    w = nw;
    h = nh;
  }
  const out = makeCanvas(target.width, target.height);
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h, 0, 0, target.width, target.height);
  return out;
}

function canvasHasAlpha(canvas: HTMLCanvasElement): boolean {
  try {
    const sample = makeCanvas(Math.min(64, canvas.width), Math.min(64, canvas.height));
    const ctx = sample.getContext("2d");
    if (!ctx) return true;
    ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = ctx.getImageData(0, 0, sample.width, sample.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    return true; // emin değilsek şeffaflığı varsay (JPEG'e düşme)
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** WebP kodlama yoksa (eski Safari) şeffaflık yoksa JPEG; şeffaflık varsa null (orijinal kalır). */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && webp.type === "image/webp" && webp.size > 0) return webp;
  if (canvasHasAlpha(canvas)) return null;
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  return jpeg && jpeg.type === "image/jpeg" && jpeg.size > 0 ? jpeg : null;
}

function renamed(file: File, blob: Blob): File {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^/.]+$/, "") || "gorsel";
  return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: file.lastModified });
}

/**
 * Tek görseli kalite koruyarak optimize eder. Hata atmaz: her başarısızlıkta orijinal döner.
 */
export async function optimizeImageFile(input: File, options: ImageOptimizeOptions = {}): Promise<ImageOptimizeResult> {
  let file = input;
  const opts = { ...DEFAULTS, ...options, profile: options.profile ?? "photo" };
  if (!looksLikeImageFile(file)) return keepResult(file, "not-image", "not-image", opts.maxBytes);
  if (typeof document === "undefined") return keepResult(file, "no-dom", "unknown", opts.maxBytes);

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  } catch {
    return keepResult(file, "unreadable", "unknown", opts.maxBytes);
  }
  const sniff = sniffImageBytes(head);
  // Bazı Android seçicileri geçerli görsel için boş MIME döndürür → gerçek biçimden doldur
  // (sunucu prepare/MIME allow-list'i beyan edilen türe bakar; içerik değişmez).
  const sniffedMime = MIME_BY_FORMAT[sniff.format];
  if (!file.type && sniffedMime) {
    file = new File([file], file.name, { type: sniffedMime, lastModified: file.lastModified });
  }
  const plan: OptimizePlan = planImageOptimization({
    sniff,
    bytes: file.size,
    profile: opts.profile,
    maxBytes: opts.maxBytes,
    skipBelowBytes: opts.skipBelowBytes,
  });

  const decoded =
    plan.action === "reencode" || sniff.format === "jpeg" || (sniff.format === "webp" && !sniff.animated)
      ? await decodeImage(file)
      : null;

  if (plan.action === "keep") {
    // Küçük/sınır içi fotoğraf piksel olarak çok büyükse (ör. 8000 px) yine de makul boyuta indir.
    const oversized =
      decoded && (sniff.format === "jpeg" || sniff.format === "webp") && !sniff.animated &&
      Math.max(decoded.width, decoded.height) > opts.maxDimension && opts.profile === "photo";
    if (!oversized) {
      decoded?.close();
      return keepResult(file, plan.reason, sniff.format, opts.maxBytes);
    }
  }
  if (!decoded) {
    return keepResult(file, sniff.format === "heic" ? "heic-undecodable" : "decode-failed", sniff.format, opts.maxBytes);
  }

  try {
    const overLimit = typeof opts.maxBytes === "number" && file.size > opts.maxBytes;
    const ladder = overLimit
      ? qualityLadder({
          quality: opts.quality,
          minQuality: opts.minQuality,
          maxDimension: opts.maxDimension,
          minDimension: Math.min(opts.minDimension, opts.maxDimension),
        })
      : [{ quality: opts.quality, maxDimension: opts.maxDimension }];

    let lastSize = Number.POSITIVE_INFINITY;
    for (const step of ladder) {
      const target = fitWithin(decoded.width, decoded.height, step.maxDimension);
      const canvas = drawScaled(decoded, target);
      if (!canvas) break;
      const blob = await encode(canvas, step.quality);
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) break;
      lastSize = blob.size;
      const fits = typeof opts.maxBytes !== "number" || blob.size <= opts.maxBytes;
      if (!fits) continue;
      // Kazanç yoksa ve orijinal zaten uygunsa orijinali koru (gereksiz kayıplı kodlama yok).
      if (!overLimit && sniff.format !== "heic" && blob.size >= file.size) {
        return keepResult(file, "no-gain", sniff.format, opts.maxBytes);
      }
      const out = renamed(file, blob);
      return {
        file: out,
        optimized: true,
        reason: plan.action === "reencode" ? plan.reason : "oversized-pixels",
        format: sniff.format,
        originalBytes: file.size,
        finalBytes: out.size,
        tooLarge: false,
      };
    }
    const result = keepResult(file, overLimit ? "ladder-exhausted" : "encode-failed", sniff.format, opts.maxBytes);
    if (overLimit && Number.isFinite(lastSize)) result.finalBytes = lastSize;
    return result;
  } finally {
    decoded.close();
  }
}

/** Sırayla (bellek dostu) çoklu optimizasyon. */
export async function optimizeImageFiles(files: File[], options: ImageOptimizeOptions = {}): Promise<ImageOptimizeResult[]> {
  const out: ImageOptimizeResult[] = [];
  for (const f of files) out.push(await optimizeImageFile(f, options));
  return out;
}

/** Kullanıcıya gösterilecek açık hata metni (sessiz hata yok). */
export function describeOptimizeProblem(result: ImageOptimizeResult, maxBytes?: number): string | null {
  const name = result.file.name;
  if (result.reason === "heic-undecodable") {
    return `${name}: HEIC/HEIF biçimi bu cihazda dönüştürülemedi. Lütfen fotoğrafı JPEG olarak paylaşın veya kamera ayarından "En uyumlu" biçimi seçin.`;
  }
  if (result.tooLarge) {
    const mb = typeof maxBytes === "number" ? `${Math.round((maxBytes / (1024 * 1024)) * 10) / 10} MB` : "izin verilen";
    return `${name}: görsel kalite korunarak ${mb} sınırına sığdırılamadı. Daha küçük bir fotoğraf seçin.`;
  }
  return null;
}
