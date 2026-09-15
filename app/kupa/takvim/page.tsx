"use client";

import { KupaShell } from "@/app/kupa/components/KupaShell";
import { CalendarWorkspace } from "./components/CalendarWorkspace";

/**
 * KUPA & HACAMAT — FAZ 5 / AŞAMA 3 — Hacamat Takvimi kullanıcı çalışma alanı.
 *
 * Profesyonel KENDİ yıllık hacamat takvimini oluşturur, aylık takvimde Gregoryen + Hicrî
 * tarihleri birlikte görür, uygulama günlerini KENDİSİ seçer/kaydeder. Sistem "doğru gün"
 * EMPOZE ETMEZ. Kozmik Hacamat AYRI referans (yalnız link; veri aktarımı YOK). Word bu
 * aşamada YOK. Tüm yazma işlemleri mevcut tenant-güvenli /api/kupa/* uçlarından geçer.
 */
export default function KupaTakvimPage() {
  return (
    <KupaShell
      title="Hacamat Takvimi"
      subtitle="Kendi yıllık hacamat çalışma takviminizi oluşturun; Gregoryen ve Hicrî tarihleri birlikte görün, uygulama günlerinizi kendiniz belirleyin."
      badge="Profesyonel Çalışma Alanı"
      breadcrumb={[{ label: "Hacamat Takvimi" }]}
    >
      <CalendarWorkspace />
    </KupaShell>
  );
}
