// Astroloji — F1/F2 (14.11.2026): secondary progression düğüm / natal ev notları (SAF METİN; istemci + sunucu + Word/PDF AYNI metin).
// Hesap ve kanıt: progressionNodes.ts (yalnız sunucu; yerel efemeris). Bu dosya hiçbir hesap modülü import etmez (istemci paketi).

/** Kutup eşiği — ürünün natal kutup engeliyle AYNI (engine/service.ts POLAR_HOUSE_LATITUDE; statik testle eşitlenir). */
export const PROGRESSION_POLAR_LATITUDE = 66.5;

export const MEAN_NODE_LOCAL_NOTE =
  "Ortalama düğüm: hesaplama hizmeti bu teknikte ortalama düğüm yerine gerçek düğüm döndürdüğü için Kuzey/Güney düğüm ilerletilmiş anda yerel olarak hesaplandı (Meeus 47.7 ortalama düğüm polinomu + boylamda nütasyon (IAU 2000B); tarihin gerçek ekinoksu). Bağımsız doğrulama: 1940–2026 arası 500 ilerletilmiş anda Swiss Ephemeris ortalama düğümüyle en fazla 0,3″ fark. Düğümlerin natal ev numarası hizmetten gelmediği için natal ev sütununda düğümler, uyumlu natal analiz yoksa boş kalır.";

export const LEGACY_MEAN_NODE_WARNING =
  "Bu kayıtta ortalama düğüm (mean) istendi, ancak kayıttaki Kuzey/Güney düğüm değerleri hesaplama hizmetinin döndürdüğü GERÇEK (true) düğümdür; ortalama düğümden yaklaşık 1,7°'ye kadar farklı olabilir (ölçülen 10 yanıtta 0,3°–1,6°). Düğüme bağlı açılar ve evler de bu gerçek düğüm değerine göredir. Değerler kayıt anındaki gibidir, değiştirilmedi; ortalama düğüm için yeniden hesaplayıp yeni kayıt oluşturun.";

export function polarNatalHouseNote(latitude: number | null): string {
  const at = latitude === null ? "" : ` (enlem ${latitude.toFixed(1)}°)`;
  return `Doğum yeri kutup dairesi ötesinde${at}: natal Placidus ev başları bu enlemde tanımsızdır, bu nedenle natal ev sütunu gösterilmez. Natal ev için Tam burç veya Eşit ev sistemli bir Natal analizi kaydedin; ilerletilmiş gezegen konumları ve ilerletilmiş harita evi (tam burç) etkilenmez.`;
}

export const LEGACY_POLAR_NATAL_HOUSE_LABEL = "Natal ev (hizmet değeri — Placidus değil)";
export const LEGACY_POLAR_NATAL_HOUSE_WARNING =
  "Bu kayıttaki natal ev sütunu Placidus DEĞİLDİR: doğum yeri kutup dairesi ötesinde, Placidus bu enlemde tanımsız; hesaplama hizmeti bu durumda sessizce tam burç evlerine geçiyor (ölçülen 2/2 yanıtta 14/14 tam burç). Değerler kayıt anındaki gibidir, değiştirilmedi.";
