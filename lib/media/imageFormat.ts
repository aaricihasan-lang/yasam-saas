/**
 * Görsel biçim algılama + optimizasyon kararı — SAF (DOM yok), birim test edilebilir.
 *
 * Tarayıcıdaki sıkıştırma akışı (lib/media/imageOptimize.ts) kararlarını buradan alır:
 *   - Dosyanın GERÇEK biçimi baş baytlardan okunur (MIME/uzantı beyanına güvenilmez).
 *   - Animasyonlu görseller (GIF, animasyonlu WebP, APNG) ASLA yeniden kodlanmaz → tek kareye
 *     düşme riski yok.
 *   - PNG (ekran görüntüsü, şema, tablo, ince çizgi, yazı) varsayılan olarak ORİJİNAL kalır;
 *     yalnız modül boyut sınırını aşıyorsa yüksek kaliteli yeniden kodlamaya izin verilir.
 *   - Biçim tanınmıyorsa veya emin olunamıyorsa → orijinal korunur.
 */

export type SniffedImageFormat = "jpeg" | "png" | "webp" | "gif" | "heic" | "unknown";

export type ImageSniff = {
  format: SniffedImageFormat;
  /** true → çok kareli (animasyonlu). "unknown" belirsizlik durumunda da true kabul edilir. */
  animated: boolean;
  /** Animasyon tespiti kesin mi? (PNG'de IDAT'a ulaşılamadıysa false) */
  certain: boolean;
};

/** Baş baytlarda aranacak üst sınır: APNG `acTL` ilk IDAT'tan önce gelir; büyük iCCP için pay. */
export const SNIFF_BYTES = 512 * 1024;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return "";
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

/** PNG chunk yürüyüşü: IDAT'tan önce `acTL` varsa APNG'dir. */
function sniffPngAnimation(bytes: Uint8Array): { animated: boolean; certain: boolean } {
  let offset = 8; // imza
  while (offset + 8 <= bytes.length) {
    const length = readU32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") return { animated: true, certain: true };
    if (type === "IDAT" || type === "IEND") return { animated: false, certain: true };
    offset += 12 + length; // length + type + data + crc
  }
  // Okunan dilimde IDAT'a ulaşılamadı → emin değiliz (güvenli taraf: animasyonlu say).
  return { animated: true, certain: false };
}

/** WebP: RIFF....WEBPVP8X + bayrak baytında animasyon biti (0x02). VP8/VP8L tek karedir. */
function sniffWebpAnimation(bytes: Uint8Array): { animated: boolean; certain: boolean } {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 " || chunk === "VP8L") return { animated: false, certain: true };
  if (chunk === "VP8X") {
    if (bytes.length < 21) return { animated: true, certain: false };
    return { animated: (bytes[20] & 0x02) !== 0, certain: true };
  }
  return { animated: true, certain: false };
}

export function sniffImageBytes(bytes: Uint8Array): ImageSniff {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { format: "jpeg", animated: false, certain: true };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { format: "png", ...sniffPngAnimation(bytes) };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { format: "webp", ...sniffWebpAnimation(bytes) };
  }
  const gif = ascii(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") {
    // GIF hiçbir zaman yeniden kodlanmaz (animasyon olabilir; tek kare GIF'ler de küçüktür).
    return { format: "gif", animated: true, certain: false };
  }
  // ISO-BMFF ftyp: heic/heix/mif1/msf1 vb. (HEIC/HEIF).
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(brand)) {
      // msf1/hevc → görüntü dizisi (animasyon) olabilir.
      const sequence = brand === "msf1" || brand === "hevc" || brand === "hevx";
      return { format: "heic", animated: sequence, certain: !sequence };
    }
  }
  return { format: "unknown", animated: true, certain: false };
}

export type OptimizeProfile =
  /** Ürün / doğal taş / danışan fotoğrafı: yüksek kaliteli WebP, PNG korunur. */
  | "photo"
  /** Belge/şema içerebilir: yalnız sınır aşılırsa yeniden kodla. */
  | "preserve";

export type OptimizePlanInput = {
  sniff: ImageSniff;
  bytes: number;
  profile: OptimizeProfile;
  /** Modülün kabul ettiği tek dosya sınırı (yoksa sınırsız). */
  maxBytes?: number;
  /** Bu boyutun altındaki fotoğraflara dokunulmaz (gereksiz kayıp önlenir). */
  skipBelowBytes: number;
};

export type OptimizePlan =
  | { action: "keep"; reason: "animated" | "unsupported" | "small" | "png-preserve" | "within-limit" }
  | { action: "reencode"; reason: "photo" | "over-limit" | "heic-convert" };

/**
 * Yeniden kodlama gerekli mi? Kayıp yaratabilecek her işlem burada gerekçelendirilir.
 * Boyutlar (piksel) bilinmeden karar verilir; piksel sınırı aşımı tarayıcı katmanında eklenir.
 */
export function planImageOptimization(input: OptimizePlanInput): OptimizePlan {
  const { sniff, bytes, profile, maxBytes, skipBelowBytes } = input;
  const overLimit = typeof maxBytes === "number" && bytes > maxBytes;

  if (sniff.format === "unknown" || sniff.format === "gif") {
    return { action: "keep", reason: sniff.format === "gif" ? "animated" : "unsupported" };
  }
  if (sniff.animated) return { action: "keep", reason: "animated" };

  // HEIC: çoğu tarayıcı/WebView sunucunun kabul ettiği biçimlerden biri değildir; tarayıcı
  // çözebiliyorsa dönüştürmeyi dene (çözemezse orijinal kalır, sunucu net hata verir).
  if (sniff.format === "heic") return { action: "reencode", reason: "heic-convert" };

  if (sniff.format === "png") {
    // PNG = yazı/çizgi/şeffaflık olasılığı yüksek → sınır aşılmadıkça orijinal.
    return overLimit ? { action: "reencode", reason: "over-limit" } : { action: "keep", reason: "png-preserve" };
  }

  if (profile === "preserve") {
    return overLimit ? { action: "reencode", reason: "over-limit" } : { action: "keep", reason: "within-limit" };
  }

  // photo profili: JPEG / statik WebP.
  if (overLimit) return { action: "reencode", reason: "over-limit" };
  if (bytes <= skipBelowBytes) return { action: "keep", reason: "small" };
  return { action: "reencode", reason: "photo" };
}

/**
 * Kalite merdiveni: önce yüksek kalite + tam (sınırlı) çözünürlük; sınır aşılırsa kaliteyi
 * ölçülü düşür, sonra çözünürlüğü kademeli azalt. Asla `minQuality` / `minDimension` altına inmez.
 */
export function qualityLadder(opts: {
  quality: number;
  minQuality: number;
  maxDimension: number;
  minDimension: number;
}): { quality: number; maxDimension: number }[] {
  const steps: { quality: number; maxDimension: number }[] = [];
  const qualities: number[] = [];
  for (let q = opts.quality; q >= opts.minQuality - 1e-9; q = Math.round((q - 0.04) * 100) / 100) {
    qualities.push(q);
  }
  if (qualities.length === 0) qualities.push(opts.minQuality);
  for (const q of qualities) steps.push({ quality: q, maxDimension: opts.maxDimension });
  let dim = opts.maxDimension;
  while (dim > opts.minDimension) {
    dim = Math.max(opts.minDimension, Math.round(dim * 0.85));
    steps.push({ quality: opts.minQuality, maxDimension: dim });
  }
  return steps;
}

/** Uzun kenarı `maxDimension` ile sınırlayan, oranı koruyan hedef boyut. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
