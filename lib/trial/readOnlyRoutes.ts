/**
 * TRIAL7 — Salt-okunur (süresi dolmuş / durdurulmuş deneme) modda GET dışı yöntemle çağrılmasına
 * İZİN VERİLEN uçlar. Yalnız kayıtlı veriden dışa aktarma / indirme bağlantısı / arama-sayım /
 * önizleme yapan, HİÇBİR ŞEY YAZMAYAN ve ücretli sağlayıcı (Roxy/OpenAI) ÇAĞIRMAYAN POST uçları.
 *
 * Bilinçli olarak DIŞARIDA: yeni hesaplama (astroloji efemeris/ay-derece, horary western, hd/compute,
 * horary western/report POST — gövdeden yeniden hesaplar), Roxy/OpenAI çağıranlar, yükleme / kayıt /
 * silme yapan her uç, Dijital İçerik ailesi (zaten deneme modül allowlist'inde yok).
 *
 * Tam yol eşleşmesi (dinamik segment = tek segment). Liste dışı her GET-dışı istek → 403
 * TRIAL_EXPIRED (fail-closed). Yeni bir dışa aktarma ucu eklenirse buraya bilinçli olarak eklenir.
 */
const SEG = "[^/]+";

const PATTERNS: readonly RegExp[] = [
  /^\/api\/ajanda\/word-report$/,
  /^\/api\/aromaterapi\/(?:[^/]+\/)*word-report$/,
  /^\/api\/biyoenerji\/(?:chakra|energy-body|imagination|session|subconscious|symbol)-report$/,
  /^\/api\/biyoenerji\/chakra-blocks\/count$/,
  new RegExp(`^/api/clients/${SEG}/word-report$`),
  /^\/api\/clients\/word-report-bulk$/,
  new RegExp(`^/api/clients/${SEG}/numerology-summary$`),
  new RegExp(`^/api/clients/${SEG}/stone-photos/signed-urls$`),
  /^\/api\/dogaltas\/(?:word-report|knowledge-report|mineral-report|combinations\/word-report)$/,
  new RegExp(`^/api/dogaltas/(?:stones|minerals)/${SEG}/word-report$`),
  /^\/api\/dogaltas\/stones\/photos\/signed-urls$/,
  /^\/api\/dogaltas\/stones\/condition-search$/,
  /^\/api\/hacamat\/(?:pdf-report|word-report)$/,
  /^\/api\/numeroloji\/(?:word-report|knowledge-report)$/,
  /^\/api\/refleksoloji\/(?:atlas-report|protocol-report)$/,
  /^\/api\/sifa-rehberi\/word-report$/,
  /^\/api\/sifa-rehberi\/photos\/signed-urls$/,
  /^\/api\/urun-stok\/stock-report$/,
  new RegExp(`^/api/beslenme/plans/${SEG}/word$`),
  /^\/api\/hd\/reports\/professional\/download$/,
  new RegExp(`^/api/hd/relations/reports/${SEG}/download$`),
  /^\/api\/hd\/charts\/variables\/saved$/,
  /^\/api\/numeroloji-klasik\/(?:rapor|rapor\/gorsel|karsilastirma\/hizala)$/,
  /^\/api\/astroloji\/analyses\/preview$/,
  /^\/api\/astroloji\/engine\/view$/,
];

/** pathname (sorgu dizesi hariç, sondaki "/" yok sayılır) salt-okunur modda POST'a açık mı? */
export function isTrialReadOnlyExportPath(pathname: string): boolean {
  const p = String(pathname ?? "").replace(/\/+$/, "");
  return PATTERNS.some((re) => re.test(p));
}
