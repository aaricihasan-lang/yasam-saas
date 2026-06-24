// Dijital İçerik Merkezi — demo hesap ortak uyarı metinleri ve yardımcıları.
//
// ÖNEMLİ: Bu modülde blur / DemoGate / DemoBlur KULLANILMAZ.
// Amaç içerik gizlemek değil; demo hesabın işlem (yükleme, oluşturma,
// dönüştürme, çeviri, AI işlemi, indirme, dışa aktarma) yapmasını engellemektir.
// Demo kullanıcı tüm ekranları ve iş akışlarını gezebilir.

export const DIGITAL_CONTENT_DEMO_TITLE = "Demo Hesabı";

/** İşlem denendiğinde gösterilen standart uyarı (toast message). */
export const DIGITAL_CONTENT_DEMO_MESSAGE =
  "Bu özellik demo hesapta pasiftir. Dijital İçerik Merkezi araçlarını kullanmak için uzman hesabınızla giriş yapmanız gerekir. Demo hesapta yalnızca ekranlar ve iş akışları görüntülenebilir.";

/** Modül girişinde gösterilen standart Demo Banner metni (DemoModuleBanner). */
export const DIGITAL_CONTENT_DEMO_BANNER =
  "Dijital İçerik Merkezi'ni demo olarak inceliyorsunuz. Tüm ekranları ve iş akışlarını gezebilirsiniz; dosya yükleme, dönüştürme, çeviri, AI işlemleri, kayıt oluşturma ve indirme demo hesapta pasiftir.";

type ToastFn = (o: {
  title?: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
}) => void;

/** ToastProvider showToast ile standart demo uyarısını gösterir. */
export function notifyDigitalContentDemo(showToast: ToastFn): void {
  showToast({
    title: DIGITAL_CONTENT_DEMO_TITLE,
    message: DIGITAL_CONTENT_DEMO_MESSAGE,
    type: "info",
    duration: 6000,
  });
}
