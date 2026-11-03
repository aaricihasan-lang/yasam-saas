/**
 * KAMPANYA MERKEZİ — ücretsiz analiz formunda veriler alınmadan ÖNCE gösterilen kısa aydınlatma (KVKK md.10).
 * SAF modül (istemci + sunucu). Metin, kodun gerçek veri akışıyla eşlenmiştir:
 *   - Klasik Numeroloji (numk:*): ad soyad + doğum tarihi hesaplama sağlayıcısına gider (lib/numeroloji-klasik/server/service.ts).
 *   - Human Design / Gökyüzü Atlası (provider): doğum tarihi, saati, koordinat ve saat dilimi gider; ad GİTMEZ
 *     (lib/campaign/visitor/runners/hd.ts, atlas.ts).
 *   - Yerel teknikler (Bütüncül Numeroloji, Lilly horary, Kozmik Takvim): dış hesaplama sağlayıcısına veri gitmez.
 * Aydınlatma bir onay kutusuna BAĞLANMAZ (Kurul İlke Kararı 2026/347); açık rıza istenmez — analiz, ziyaretçinin talep
 * ettiği hizmetin ifası için işlenir. Yurt dışı aktarım dayanağı açık rıza DEĞİLDİR (bkz. docs/campaign/kvkk/).
 * Sağlayıcı marka adı kullanıcıya gösterilmez (marka kuralı); alıcı grubu belirtilir.
 */
export const CAMPAIGN_NOTICE_HREF = "/ucretsiz-analiz-aydinlatma";

export type VisitorDataNotice = { sentToProvider: boolean; text: string };

export function visitorDataNotice(tech: { key: string; kind: "local" | "provider" | "client" }): VisitorDataNotice {
  if (tech.kind !== "provider") {
    return {
      sentToProvider: false,
      text: "Girdiğiniz bilgiler yalnız bu analizi hesaplamak için sunucumuzda (Almanya) işlenir; dış hesaplama hizmetine gönderilmez, kaydedilmez.",
    };
  }
  const sent = tech.key.startsWith("numk:")
    ? "adınız soyadınız ve doğum tarihiniz"
    : "doğum tarihiniz, saatiniz ve doğum yerinizin koordinatları (adınız gönderilmez)";
  return {
    sentToProvider: true,
    text: `Bu analizi hesaplamak için ${sent}, sunucuları Almanya'da bulunan yurt dışı yerleşik hesaplama hizmet sağlayıcımıza iletilir. Bilgileriniz kaydedilmez; sonuç ve rapor yalnız size gösterilir.`,
  };
}
