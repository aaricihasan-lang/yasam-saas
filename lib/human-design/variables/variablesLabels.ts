// Human Design Variables — Türkçe arayüz terimleri ve sabit notlar (SAF sunum; hesap yok).
// Terim deseni mevcut HD arayüzüyle aynı: "Türkçe (özgün terim)". Sağlayıcının Türkçe adları (nameLocalized:
// Belirlenim / Ortam / Motivasyon / Bakış Açısı) alt satırda gösterilir.

import type { VariableKey } from "./variablesMath";

/** Özellik anahtarı (geri dönüş: false → sekme gösterilmez; uç ayrı olduğundan başka akış etkilenmez). */
export const HD_VARIABLES_ENABLED = true;

export const VARIABLES_TITLE = "Dört Ok ve PHS";
export const VARIABLES_SUBTITLE = "Human Design İleri Analiz";

export const ARROW_TITLE_TR: Readonly<Record<VariableKey, string>> = Object.freeze({
  determination: "Sindirim / PHS (Determination)",
  environment: "Çevre (Environment)",
  motivation: "Motivasyon (Motivation)",
  perspective: "Bakış Açısı (Perspective / View)",
});

export const ARROW_PLACE_TR: Readonly<Record<VariableKey, string>> = Object.freeze({
  determination: "Sol üst · Tasarım (Design) Güneş",
  environment: "Sol alt · Tasarım (Design) Kuzey Ay Düğümü",
  motivation: "Sağ üst · Kişilik (Personality) Güneş",
  perspective: "Sağ alt · Kişilik (Personality) Kuzey Ay Düğümü",
});

export const COGNITION_TITLE = "Bilişsel Algı (Cognition)";
export const DIRECTION_TR = { left: "Sol", right: "Sağ" } as const;

export const VARIABLES_INTRO =
  "Dört Ok, Human Design'ın ileri katmanıdır: sol oklar (Tasarım tarafı) Birincil Sağlık Sistemi'ni (PHS), sağ oklar (Kişilik tarafı) Rave Psikolojisi'ni anlatır. Her ok, kaynak gezegen aktivasyonunun Color, Tone ve Base alt yapısından hesaplanır.";
export const VARIABLES_PRECISION_NOTE =
  "Bu katman doğum saatine çok duyarlıdır: birkaç dakikalık fark Tone'u ve okun yönünü değiştirebilir. Sonuç, kayıtlı doğum saatinin kesin olduğu varsayımıyla hesaplanır; saat tahminiyse sonucu kesin kabul etmeyin.";
export const VARIABLES_BASE_NOTE =
  "Base, normal doğum saatinin çözebileceğinden daha ince bir alt bölümdür; yalnız bilgilendirme amaçlı gösterilir ve anlamı yorumlanmaz.";
export const VARIABLES_HEALTH_NOTE =
  "PHS ve Çevre açıklamaları Human Design öğretisine ait yorumlardır; tıbbi teşhis, tedavi, diyet veya beslenme tavsiyesi değildir.";
export const VARIABLES_UNCERTAIN_NOTE =
  "Olası sonuç: bu okun kaynağı bir Color veya Tone sınırına çok yakın. Gösterilen değerler kayıtlı saatle hesaplandı; gerçek doğum anı birkaç saniye ya da dakika farklıysa komşu Color / Tone ve ok yönü geçerli olabilir. Bu yüzden Color, Tone ve yön anlamları bu okta gösterilmez; kesin yorum olarak kullanmayın.";
/** Kesin ↔ olası farkı (yalnız en az bir ok kesinleştirilemediğinde genel uyarının altında gösterilir). */
export const VARIABLES_CERTAINTY_EXPLAINER: readonly { term: string; text: string }[] = Object.freeze([
  { term: "Kesin", text: "Değer Color / Tone sınırından yeterince uzak; kayıtlı doğum saati birkaç dakika kaysa da Color, Tone ve ok yönü değişmez. Anlamları gösterilir." },
  { term: "Olası", text: "Kayıtlı saatle hesaplanan değer, ancak sınıra çok yakın; gerçek doğum anına göre komşu değer de geçerli olabilir. Değerler “?” ve kesikli çizgiyle işaretlenir, anlamları yorum olarak verilmez." },
]);
export const VARIABLES_UNCERTAIN_ADVICE =
  "Olası okları kesinleştirmek için doğum saatini resmî kayıt veya belgeyle doğrulayın; saat belgeliyse ve sonuç yine olası çıkıyorsa, bu ok için kesin yorum yapılamaz.";
export const VARIABLES_HISTORICAL_OFFSET_NOTE =
  "Bu doğum, standart saat uygulamasından önceki yerel ortalama saat dönemine düşüyor. Hesaplama servisi o dönemin saat farkını saniyeleri atarak kullandığından sonuç bir dakikaya kadar kayabilir: Base değerleri kesinleştirilemedi ve sınıra yakın oklar kesin sayılmadı.";
export const VARIABLES_BASE_UNCERTAIN = "kesinleştirilemedi";
export const VARIABLES_ALL_UNCERTAIN_NOTE = "Dört okun tamamı kesin değil: aşağıda kesinleştirilemeyen oklar “Olası” olarak ayrıca işaretlendi.";
export const VARIABLES_SOURCE_NOTE =
  "Açıklamalar hesaplama servisinin metinleridir (Türkçe çevirisi yoksa özgün İngilizce gösterilir). Sonuç, Yaşam Sistemi'nin bağımsız hesabıyla tutarlılık açısından kontrol edildi.";
