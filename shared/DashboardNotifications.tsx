/**
 * shared/DashboardNotifications.tsx — ESKİ global (position:fixed) randevu bildirimi.
 *
 * AŞAMA 2 · §4.4 (owner kararı: FAB / fixed bindirme YOK): zil artık header akışında
 * `components/notifications/NotificationBell` olarak render edilir (hub hero kümesi +
 * modül üst barı `AppLogoLink`). Bu dosya:
 *   1. Rota atlama kuralının TEK kaynağıdır (NotificationBell buradan içe aktarır),
 *   2. Geriye dönük uyumluluk için varsayılan export'u korur ama HİÇBİR ŞEY render etmez
 *      (app/layout.tsx'teki global mount kaldırılana kadar çift zil / fixed bindirme oluşmaz).
 */

/**
 * Bildirim isteği YAPILMAYAN rotalar.
 *
 * PERF-1: Doğaltaş modülü randevu verisi kullanmaz. Bu route'larda bildirim fetch'i ve
 * polling interval'ları hiç oluşturulmaz (cross-modül kuplajı kaldırılır).
 * ÜYE YÖNETİMİ FAZ 2 (MEM-020): admin yönetim ekranları (/admin/**) randevu bildirimi
 * kullanmaz → her admin sayfasında gereksiz /api/appointments çağrısı yapılmaz.
 */
export function shouldSkipAppointmentNotifications(pathname: string | null | undefined): boolean {
  return (
    pathname === "/dogaltas" ||
    (pathname ?? "").startsWith("/dogaltas/") ||
    pathname === "/admin" ||
    (pathname ?? "").startsWith("/admin/")
  );
}

/** Eski global mount — artık no-op (zil header akışında; bkz. NotificationBell). */
export default function DashboardNotifications() {
  return null;
}
