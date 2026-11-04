/**
 * KAMPANYA MERKEZİ — ücretsiz analiz formunda veriler alınmadan ÖNCE gösterilen kısa aydınlatma (KVKK md.10).
 * SAF modül (istemci + sunucu). Metin: Owner onaylı kısa bilgilendirme (03.11.2026); ayrıntı /ucretsiz-analiz-aydinlatma.
 * Gerçek akış (metnin dayanağı): Klasik Numeroloji'de ad soyad + doğum tarihi, HD / Gökyüzü Atlası'nda doğum tarihi, saati,
 * koordinat ve saat dilimi hesaplama sağlayıcısına gider; Bütüncül Numeroloji yereldir.
 * Aydınlatma bir onay kutusuna BAĞLANMAZ; açık rıza istenmez. Sağlayıcı marka adı kullanıcıya gösterilmez.
 */
export const CAMPAIGN_NOTICE_HREF = "/ucretsiz-analiz-aydinlatma";

export const VISITOR_DATA_NOTICE_TEXT =
  "Yaşam Sistemi, girdiğiniz bilgileri seçtiğiniz ücretsiz analizi hesaplamak ve sonucu size sunmak amacıyla işler. Kullanılan tekniğe göre gerekli bilgiler yurt dışındaki hesaplama sağlayıcısına aktarılabilir. Kullanım hakları ve güvenlik için sınırlı teknik kayıtlar tutulur.";

export type VisitorDataNotice = { sentToProvider: boolean; text: string };

export function visitorDataNotice(tech: { key: string; kind: "local" | "provider" | "client" }): VisitorDataNotice {
  return { sentToProvider: tech.kind === "provider", text: VISITOR_DATA_NOTICE_TEXT };
}
