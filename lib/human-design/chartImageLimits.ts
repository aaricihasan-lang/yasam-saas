// HD harita görseli yükleme sınırları — istemci + sunucu TEK kaynak (P2-6).
//
// Vercel fonksiyon istek gövdesi ~4.5 MB'ta kesilir (FUNCTION_PAYLOAD_TOO_LARGE, ham 413).
// Eski 5 MB sınırı bu yüzden 4.5–5 MB arası dosyalarda anlamsız bir hata üretiyordu.
// Gerçek sınır multipart ek yükü için pay bırakılarak 4 MB'tır; daha büyük fotoğraflar
// istemcide yüklemeden önce otomatik küçültülür (bkz. HdChartImageUpload).

export const HD_CHART_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const HD_CHART_IMAGE_MAX_LABEL = "4 MB";
export const HD_CHART_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const HD_CHART_IMAGE_TOO_LARGE_MESSAGE =
  `Görsel en fazla ${HD_CHART_IMAGE_MAX_LABEL} olabilir. Lütfen daha küçük bir dosya seçin.`;
export const HD_CHART_IMAGE_TYPE_MESSAGE = "Sadece JPG, PNG veya WebP yüklenebilir.";
