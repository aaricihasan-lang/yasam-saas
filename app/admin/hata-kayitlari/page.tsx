"use client";

import { AlertTriangle } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

export default function HataKayitlariPage() {
  return (
    <AdminModuleLayout
      title="Hata Kayıtları"
      description="Sistem hataları ve kritik olay günlükleri"
      Icon={AlertTriangle}
      theme={{
        headerGradient: "from-slate-900 via-rose-900 to-red-800",
        headerLabelClass: "text-rose-200/90",
        iconWrap: "from-rose-500 to-red-600",
      }}
      demoCards={[
        { title: "Son hata" },
        { title: "Kritik hata sayısı" },
        { title: "Servis log durumu" },
        { title: "Son 24 saat uyarı" },
      ]}
      footerNote="Hata Kayıtları · admin modül önizlemesi"
    />
  );
}
