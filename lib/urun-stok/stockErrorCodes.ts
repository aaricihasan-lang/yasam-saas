/**
 * stockErrorCodes.ts — Ürün & Stok I18N: dil-bağımsız hata/mesaj KODLARI (SAF; next/server, DB, React YOK).
 *
 * Kural (F1-R3 brifing 3–4): sunucu ve lib Türkçe metinleri AYNEN kalır (testlerce kilitli). Bu dosya
 * yalnız yanına dil-bağımsız kod üretir:
 *  - `saleRpcErrorCode`  : atomik satış RPC SQLSTATE → STK_* (salesErrors.mapSaleRpcError ile AYNI dallar)
 *  - `stockMessageCode`  : lib/sunucu Türkçe metni → { code, params } (yalnız GÖSTERİM eşlemesi için;
 *                          kontrol akışı bu fonksiyona BAĞLANMAZ). Bilinmeyen metin → null.
 * İstemci: TR'de metin birebir; diğer dilde `stock.errors.codes.<KOD>` (+ params), yoksa çağıranın yedeği.
 */

export type StockMessageCode = { code: string; params: Record<string, string> };

/** salesErrors.mapSaleRpcError ile aynı SQLSTATE dalları → dil-bağımsız kod. */
export function saleRpcErrorCode(err: { code?: string | null } | null | undefined): string {
  switch ((err?.code ?? "").toString()) {
    case "45001": return "STK_SALE_PRODUCT_NOT_FOUND";
    case "45002": return "STK_SALE_INSUFFICIENT_STOCK";
    case "45003": return "STK_SALE_NOT_FOUND";
    case "45010": return "STK_SALE_DUPLICATE_LINE";
    case "45011": return "STK_INVALID_CATEGORY";
    case "45012": return "STK_INVALID_QUANTITY";
    case "45013": return "STK_INVALID_SALE_PRICE";
    case "45014": return "STK_INVALID_SALE_REQUEST";
    default: return "STK_SALE_FAILED";
  }
}

/** Sabit Türkçe metin → kod (lib + API yanıtları; birebir eşleşme). */
const EXACT: Record<string, string> = {
  // API (app/api/urun-stok) + guardedStockPatch
  "Stok listesi okunamadı. Lütfen tekrar deneyin.": "STK_LIST_READ_FAILED",
  "Geçersiz istek gövdesi.": "STK_INVALID_BODY",
  "Bu kayıt zaten mevcut.": "STK_DUPLICATE",
  "Kayıt eklenemedi. Lütfen tekrar deneyin.": "STK_CREATE_FAILED",
  "id zorunludur.": "STK_ID_REQUIRED",
  "Geçersiz kayıt kimliği.": "STK_INVALID_ID",
  "Kayıt silinemedi. Lütfen tekrar deneyin.": "STK_DELETE_FAILED",
  "Stok kaydı bulunamadı veya bu tenant'a ait değil.": "STK_NOT_FOUND",
  "Stok miktarı geçersiz.": "STK_INVALID_STOCK",
  "Stok kaydı güncellenemedi.": "STK_UPDATE_FAILED",
  "Stok güncellemesi için mevcut stok bilgisi gerekli. Sayfayı yenileyip tekrar deneyin.": "stock_expected_required",
  "Stok bu arada başka bir işlemle değişti. Güncel stok yüklendi; lütfen tekrar deneyin.": "stock_conflict",
  "Geçersiz işlem anahtarı.": "STK_INVALID_IDEMPOTENCY_KEY",
  "Satış satırı gerekli.": "STK_SALE_LINES_REQUIRED",
  "Çok fazla satış satırı.": "STK_SALE_TOO_MANY_LINES",
  "Geçersiz ürün kategorisi.": "STK_INVALID_CATEGORY",
  "Geçersiz ürün kimliği.": "STK_INVALID_PRODUCT_ID",
  "Satılacak miktar geçersiz.": "STK_INVALID_QUANTITY",
  "Kâr oranı geçersiz.": "STK_INVALID_MARKUP",
  "Satış fiyatı geçersiz.": "STK_INVALID_SALE_PRICE",
  "Katalog okunamadı.": "STK_CATALOG_READ_FAILED",
  "Geçersiz işlem.": "STK_INVALID_ACTION",
  "Geçersiz satış kimliği.": "STK_INVALID_SALE_ID",
  "İşlem tamamlanamadı. Lütfen tekrar deneyin.": "STK_ACTION_FAILED",
  "Stok verisi okunamadı.": "STK_STOCK_READ_FAILED",
  "Kritik stokta ürün bulunamadı.": "STK_REPORT_NO_CRITICAL",
  "Kayıtlı ürün bulunamadı.": "STK_REPORT_NO_PRODUCTS",
  "Demo hesabında bu işlem kullanılamaz.": "STK_DEMO_FORBIDDEN",
  "Geçersiz sayfa imleci.": "STK_INVALID_CURSOR",
  "Satış geçmişi okunamadı.": "STK_HISTORY_READ_FAILED",
  // salesErrors.mapSaleRpcError
  "Ürün bulunamadı veya bu çalışma alanına ait değil.": "STK_SALE_PRODUCT_NOT_FOUND",
  "Yetersiz stok. Stok bilgisi yenilendi.": "STK_SALE_INSUFFICIENT_STOCK",
  "Satış kaydı bulunamadı.": "STK_SALE_NOT_FOUND",
  "Aynı ürün sepette birden fazla satır olamaz.": "STK_SALE_DUPLICATE_LINE",
  "Geçersiz satış isteği.": "STK_INVALID_SALE_REQUEST",
  "Satış işlenemedi. Lütfen tekrar deneyin.": "STK_SALE_FAILED",
  // *StockLogic / generalSalesLogic / liveStockLogic / calculateCurrencyCost (istemci doğrulama)
  "Ürün adı boş olamaz.": "STK_NAME_REQUIRED",
  "Taş adı boş olamaz.": "STK_STONE_NAME_REQUIRED",
  "Stok miktarı 0 olamaz.": "STK_STOCK_ZERO",
  "Stok eksiye düşemez.": "STK_STOCK_NEGATIVE",
  "Yeni kayıt için negatif stok girilemez.": "STK_NEW_STOCK_NEGATIVE",
  "Yeni kayıt için pozitif stok girin.": "STK_NEW_STOCK_POSITIVE",
  "Satış birimi ürün ölçü tipi ile uyumlu değil.": "STK_SALE_UNIT_MISMATCH",
  "Satılacak miktar 0'dan büyük olmalı.": "STK_SALE_QTY_POSITIVE",
  "Satılacak adet 0'dan büyük olmalı.": "STK_SALE_PIECES_POSITIVE",
  "Satış miktarı 0'dan büyük olmalı.": "STK_SALE_QTY_POSITIVE",
  "Birim maliyet hesaplanamadı.": "STK_UNIT_COST_UNAVAILABLE",
  "Sepet boş.": "STK_BASKET_EMPTY",
  "Geçerli bir miktar girin.": "STK_ENTER_VALID_QTY",
  "Satış kaydedilemedi.": "STK_SALE_SAVE_FAILED",
  "Bulut güncellenemedi.": "STK_CLOUD_UPDATE_FAILED",
  "Kayıt bulunamadı.": "STK_RECORD_NOT_FOUND",
  "Ürün stokta bulunamadı. Stok bilgisi yenilendi.": "STK_PRODUCT_NOT_IN_STOCK",
  "İptal edilecek satış bulunamadı.": "STK_CANCEL_SALE_NOT_FOUND",
  "Lütfen güncel dolar kurunu giriniz.": "STK_USD_RATE_REQUIRED",
  "Lütfen güncel euro kurunu giriniz.": "STK_EUR_RATE_REQUIRED",
  "Stok adedi 0 olduğu için birim maliyet hesaplanamadı.": "STK_UNIT_COST_ZERO_STOCK",
  "Fotoğraf listesi geçersiz.": "STK_PHOTOS_INVALID",
  "Yalnızca JPEG, PNG veya WebP fotoğraf yükleyebilirsiniz.": "STK_PHOTO_TYPE",
  "Ölçü tipi ile birim uyumsuz.": "STK_MEASURE_UNIT_MISMATCH",
  "Ölçü tipi ve birim birlikte gönderilmelidir.": "STK_MEASURE_UNIT_TOGETHER",
  "Oturum bulunamadı. Lütfen tekrar giriş yapın.": "STK_SESSION_MISSING",
};

/** Parametreli Türkçe metinler (kalıp → kod + adlandırılmış parametreler). Sıra önemlidir (ilk eşleşen). */
const PATTERNS: { re: RegExp; code: string; keys: string[] }[] = [
  { re: /^Yetersiz stok\. Mevcut: (.+)$/, code: "STK_INSUFFICIENT_STOCK", keys: ["available"] },
  { re: /^Tür \/ grup \/ ambalaj \/ malzeme alanı en fazla (\d+) karakter olabilir\.$/, code: "STK_FREE_TEXT_TOO_LONG", keys: ["max"] },
  { re: /^1–(\d+) satış seçilmelidir\.$/, code: "STK_VISIBILITY_SELECTION_RANGE", keys: ["max"] },
  { re: /^En fazla (\d+) fotoğraf kaydedilebilir\.$/, code: "STK_PHOTOS_TOO_MANY", keys: ["max"] },
  { re: /^En fazla (\d+) fotoğraf ekleyebilirsiniz\.$/, code: "STK_PHOTO_MAX_FILES", keys: ["max"] },
  { re: /^HEIC\/HEIF biçimi bu cihazda dönüştürülemedi: (.*)\. Fotoğrafı JPEG olarak paylaşın\.$/, code: "STK_PHOTO_HEIC", keys: ["file"] },
  { re: /^Fotoğraf kalite korunarak (\d+) MB sınırına sığdırılamadı: (.*)\. Daha küçük bir fotoğraf seçin\.$/, code: "STK_PHOTO_TOO_LARGE", keys: ["max", "file"] },
  { re: /^Toplam fotoğraf boyutu en fazla (\d+) MB olabilir\.$/, code: "STK_PHOTO_TOTAL_TOO_LARGE", keys: ["max"] },
  { re: /^Ölçü tipi \((.+)\) ile seçilen birim uyumsuz\.$/, code: "STK_MEASURE_UNIT_MISMATCH", keys: ["measure"] },
];

/**
 * Türkçe lib/sunucu metni → dil-bağımsız kod (+ parametreler). YALNIZ gösterim eşlemesi içindir.
 * Parametre değerleri (ör. "5 adet") olduğu gibi döner; birim çevirisi istemcide (stock.units).
 */
export function stockMessageCode(text: string | null | undefined): StockMessageCode | null {
  if (typeof text !== "string" || !text) return null;
  const exact = EXACT[text];
  if (exact) return { code: exact, params: {} };
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (m) {
      const params: Record<string, string> = {};
      p.keys.forEach((k, i) => { params[k] = m[i + 1] ?? ""; });
      return { code: p.code, params };
    }
  }
  return null;
}

/** API yanıt koduyla Türkçe metin karşılığı aynı tablodan: sabit metinler için (sunucu rotaları kullanır). */
export function stockCodeForText(text: string): string | null {
  return EXACT[text] ?? null;
}

/**
 * liveStockLogic başarılı satış notunu ("Satış kaydedildi: <miktar> <birim> · ₺<tutar>") parçalarına ayırır
 * (QS-01). YALNIZ gösterim içindir; tutar lib'in TR biçiminden (₺1.234,50) sayıya geri okunur, hesaplanmaz.
 * Eşleşmezse null (çağıran yedek metni gösterir).
 */
export function saleRecordedParts(message: string | null | undefined): { qty: string; unit: string; total: number } | null {
  if (typeof message !== "string") return null;
  const m = /^Satış kaydedildi: (\S+) (\S+) · ₺(-?[\d.]+,\d{2})$/.exec(message);
  if (!m) return null;
  const total = Number(m[3]!.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(total) ? { qty: m[1]!, unit: m[2]!, total } : null;
}

/** salesVisibility plan* uygun-olmama gerekçeleri (lib Türkçe) → dil-bağımsız anahtar (onay diyaloğu gösterimi). */
const INELIGIBLE_REASON: Record<string, string> = {
  "zaten iptal edilmiş": "alreadyCancelled",
  "satış kimliği yok": "noSaleId",
  "zaten listeden silinmiş": "alreadyHidden",
  "listede zaten görünüyor": "alreadyVisible",
};
export function ineligibleReasonKey(reason: string): string | null {
  return Object.prototype.hasOwnProperty.call(INELIGIBLE_REASON, reason) ? INELIGIBLE_REASON[reason]! : null;
}
