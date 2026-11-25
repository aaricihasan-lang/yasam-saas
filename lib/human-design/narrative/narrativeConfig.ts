// HD ANLATI DİLİ (I18N-F1-R5 / A6) — dil başına Roxy anlatı (yorum metni) deposu: TEK YAPILANDIRMA NOKTASI. SAF.
//
// SAĞLAYICI GERÇEĞİ (25.11.2026, kanıtlı — bkz. C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25/ajan-raporlari/hd.md §A6):
//   • RoxyAPI'de KAYITLI bir haritanın yorumunu başka dilde veren "yalnız anlatı" ucu YOK. Kişiye özel yorum (tip/otorite/
//     profil/tanım/merkez/kanal/aktivasyon çizgi anlamları) yalnız POST /human-design/bodygraph?lang=<dil> yanıtında gelir;
//     bu uç doğum verisinden haritayı sağlayıcı tarafında YENİDEN hesaplar ve 1 ücretli istek sayılır.
//   • GET /human-design/gates/{number}?lang= ve GET /human-design/centers/{id}?lang= yalnız GENEL sözlük metnidir (kişiye
//     özel değil); sistem yorumunun tamamını karşılamaz (tip/otorite/profil/kanal/çizgi yok).
//
// MİMARİ (bayrak AÇIK iken; varsayılan KAPALI = bugünkü davranış birebir):
//   • Kanonik harita (human_design_charts satırı, computed_result, provider_raw[TR]) bir kez hesaplanır ve DEĞİŞMEZ.
//   • EN (TR dışı) anlatı yalnız AÇIK bir üretim isteğiyle (generateChartNarrative) ve ayrı tabloya
//     (human_design_chart_narratives — migration TASLAĞI) yazılır; harita satırına HİÇBİR yazım yapılmaz.
//   • Sağlayıcının yeni yanıtı, kayıtlı haritanın kanonik özetiyle (aktivasyonlar + uygulama kodları + haç kapıları)
//     BİREBİR aynı değilse anlatı REDDEDİLİR (kaydedilmez, gösterilmez).
//   • Önbellek anahtarı: anlatı sürümü + sağlayıcı + uç + adaptör sürümü + düğüm türü + DİL + tenant + harita + input_hash
//     + kayıtlı UTC doğum anı. Aynı dilin tekrarı depodan okunur → ücretli çağrı YOK.
//   • Okuma (gösterim) ASLA sağlayıcı çağırmaz; kayıt yoksa TR anlatı + "istenen dil yok" bilgisi döner.

/** Özellik bayrağı (sunucu ortam değişkeni). Yalnız tam olarak "on" açar; diğer her değer / yokluk = KAPALI. */
export const HD_NARRATIVE_FLAG_ENV = "HD_NARRATIVE_I18N" as const;

export function isHdNarrativeI18nEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[HD_NARRATIVE_FLAG_ENV] ?? "").trim() === "on";
}

/** Anlatı sözleşme sürümü — değişirse anahtar değişir (eski kayıt eşleşmez; yeniden üretim açık istekle). */
export const HD_NARRATIVE_VERSION = "hd-narrative-1" as const;

/** Kaynak (kanonik) anlatı dili: human_design_charts.provider_raw (I18N-0005: harita kimliği dili). AYRI SAKLANMAZ. */
export const HD_NARRATIVE_SOURCE_LANG = "tr" as const;

/** Ayrı üretilebilen anlatı dilleri (Owner: yalnız TR + EN; başka dil YOK). */
export const HD_NARRATIVE_LANGS = Object.freeze(["en"] as const);
export type HdNarrativeLang = (typeof HD_NARRATIVE_LANGS)[number];

export function isHdNarrativeLang(v: unknown): v is HdNarrativeLang {
  return typeof v === "string" && (HD_NARRATIVE_LANGS as readonly string[]).includes(v);
}

/** Kalıcı depo tablosu (migration TASLAĞI: hd-anlati-*; repoya / prod'a uygulanmadı). */
export const HD_NARRATIVE_TABLE = "human_design_chart_narratives" as const;

/** Saklanan ham yanıt üst sınırı (bayt, JSON) — tablo CHECK'iyle aynı. */
export const HD_NARRATIVE_MAX_RAW_BYTES = 1_048_576;
