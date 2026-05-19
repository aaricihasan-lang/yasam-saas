"use client";

import { Activity } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

export default function SistemSagligiPage() {
  return (
    <AdminModuleLayout
      title="Sistem Sağlığı"
      description="Bağlantı, kullanım, performans ve güvenlik özeti"
      headerLabel="Admin · İzleme"
      Icon={Activity}
      theme={{
        headerGradient: "from-slate-900 via-emerald-900 to-teal-800",
        headerLabelClass: "text-emerald-200/90",
        iconWrap: "from-emerald-500 to-green-600",
      }}
      demoSectionTitle="Sistem metrikleri"
      demoSectionDesc="Platform genelinde kullanım ve durum göstergeleri"
      demoCards={[
        { title: "Toplam Kullanıcı" },
        { title: "Aktif Uzman" },
        { title: "Pasif / Bekleyen Kullanıcı" },
        { title: "Toplam Danışan" },
        { title: "Toplam Numeroloji Analizi" },
        { title: "Toplam Doğaltaş Kaydı" },
        { title: "Kişisel Arşiv Kayıtları" },
        { title: "Son Hata Kaydı" },
        { title: "Son Yedek Tarihi" },
        { title: "Sistem Durumu" },
      ]}
      footerNote="Sistem Sağlığı · admin modül önizlemesi"
    />
  );
}
