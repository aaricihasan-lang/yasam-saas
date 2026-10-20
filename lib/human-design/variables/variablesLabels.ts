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
  "Kesinleştirilemedi: bu okun kaynağı bir Color veya Tone sınırına çok yakın; daha hassas bir doğum saati ok yönünü veya rengini değiştirebilir. Kesin yorum olarak kullanmayın.";
export const VARIABLES_ALL_UNCERTAIN_NOTE = "Dört okun tamamı kesin değil: aşağıda kesinleştirilemeyen oklar ayrıca işaretlendi.";
export const VARIABLES_SOURCE_NOTE =
  "Açıklamalar hesaplama servisinin metinleridir (Türkçe çevirisi yoksa özgün İngilizce gösterilir). Sonuç, Yaşam Sistemi'nin bağımsız hesabıyla tutarlılık açısından kontrol edildi.";
