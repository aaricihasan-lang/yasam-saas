/**
 * Alt işleyici (sub-processor) listesi — TASLAK (FAZ1 FINAL HARDENING — INFRA).
 *
 * Yalnız kodda GERÇEKTEN kullanılan hizmetler listelenir; kapsam ifadeleri mevcut
 * davranışa göre yazılmıştır (ör. OpenAI yalnız yönetici hesabındaki yapay zekâ
 * özelliklerinde; Google Analytics yalnız herkese açık sayfalarda). Veri konumu
 * koda yazılmaz → lib/legal/dataResidency.ts.
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
      "Hesap bilgileri ve uzmanların kendi çalışma alanlarına girdiği kayıtlar (danışan kayıtları, notlar, analizler, yüklenen dosyalar).",
  },
  {
    name: "Vercel",
    purpose: "Uygulama barındırma ve anonim performans/ziyaret analitiği",
    dataScope:
      "Uygulamaya yapılan istekler ve teknik kayıtlar; Vercel Analytics / Speed Insights'a giden sayfa adreslerinde kimlik numaraları maskelenir.",
  },
  {
    name: "OpenAI",
    purpose: "Yapay zekâ destekli belge/video işleme",
    dataScope: "Yalnız yönetici hesabının kullandığı yapay zekâ özelliklerine gönderilen içerik.",
    scopeNote: "Uzman hesaplarında yapay zekâ özellikleri kapalıdır; uzman verisi OpenAI'a gönderilmez.",
  },
  {
    name: "Inngest",
    purpose: "Arka plan işleri (zamanlanmış/uzun süren işlemler)",
    dataScope: "İş tetikleme bilgileri (ör. iş kimliği); içerik, işin kendisine gerektiği ölçüde.",
  },
  {
    name: "Google Analytics",
    purpose: "Herkese açık sayfaların ziyaret istatistikleri",
    dataScope:
      "Yalnız oturum açılmamış ziyaretçilerin herkese açık sayfaları (ana sayfa, hukuki sayfalar, iletişim, kayıt). Uygulama içi sayfalar ve oturum açmış kullanıcılar ölçülmez.",
  },
];
