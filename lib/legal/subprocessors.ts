/**
 * Alt işleyici (sub-processor) listesi (P1-6 — nihai ürün metni).
 *
 * Yalnız kodda GERÇEKTEN kullanılan hizmetler listelenir; kapsam ifadeleri mevcut
 * davranışa göre yazılmıştır:
 *   - OpenAI yalnız yönetici modüllerinde (lib/auth/moduleAccessCore.ts ADMIN_ONLY_MODULE_KEYS);
 *   - Inngest, yönetici belge çevirisi işinde metin parçalarını adım sonucu olarak geçici taşır
 *     (lib/inngest/functions/pdfTranslate.ts);
 *   - Google Analytics yalnız onay veren, oturumsuz ziyaretçinin herkese açık sayfalarında.
 * Veri konumu koda yazılmaz → lib/legal/dataResidency.ts. Sağlayıcıların kendi veri
 * konumu / saklama süresi hakkında doğrulanmamış taahhüt YAZILMAZ.
 */

export type Subprocessor = {
  name: string;
  purpose: string;
  dataScope: string;
  scopeNote?: string;
};

export const SUBPROCESSORS: ReadonlyArray<Subprocessor> = [
  {
    name: "Supabase",
    purpose: "Veritabanı ve dosya depolama",
    dataScope:
      "Hesap ve üyelik bilgileri ile uzmanların kendi çalışma alanlarına girdiği kayıtlar (danışan kayıtları, notlar, analizler, raporlar, yüklenen dosyalar).",
    scopeNote:
      "Çalışma alanı dosyaları özel depolama alanlarında tutulur ve kısa süreli bağlantılarla açılır; yalnız mağaza vitrinindeki ürün görselleri herkese açıktır.",
  },
  {
    name: "Vercel",
    purpose: "Uygulama barındırma ve çerezsiz performans/ziyaret ölçümü",
    dataScope:
      "Uygulamaya yapılan istekler ve teknik kayıtlar. Vercel Analytics / Speed Insights'a giden sayfa adreslerinde kimlik numaraları maskelenir, sorgu parametreleri gönderilmez.",
  },
  {
    name: "Inngest",
    purpose: "Arka plan işleri (zamanlanmış ve uzun süren işlemler)",
    dataScope:
      "İş tetikleme bilgileri (ör. iş veya kayıt kimliği). Yönetici belge çevirisi işlerinde, iş tamamlanana kadar çevrilecek metin parçaları da geçici olarak işlenir.",
  },
  {
    name: "OpenAI",
    purpose: "Yapay zekâ destekli belge, ders notu ve video işleme",
    dataScope: "Yalnız yönetici modüllerinde, yöneticinin işlediği belge/video içeriği.",
    scopeNote: "Uzman hesaplarında yapay zekâ özellikleri kapalıdır; uzmanların danışan verileri OpenAI'a gönderilmez.",
  },
  {
    name: "Google Analytics",
    purpose: "Herkese açık sayfaların ziyaret istatistikleri",
    dataScope:
      "Yalnız onay veren ve oturum açmamış ziyaretçilerin herkese açık sayfa ziyaretleri (ana sayfa, hukuki sayfalar, iletişim, kayıt). Uygulama içi sayfalar ve oturum açmış kullanıcılar ölçülmez.",
    scopeNote: "Onay verilmezse Google Analytics yüklenmez ve çerez oluşturmaz.",
  },
];
