"use client";

import { Database } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

export default function KullanimTakibiPage() {
  return (
    <AdminModuleLayout
      title="Kullanım Takibi"
      description="Modül kullanımı ve oturum istatistikleri"
      Icon={Database}
      theme={{
        headerGradient: "from-slate-900 via-fuchsia-900 to-pink-800",
        headerLabelClass: "text-fuchsia-200/90",
        iconWrap: "from-fuchsia-500 to-pink-600",
      }}
      demoCards={[
        { title: "Günlük aktif kullanıcı" },
        { title: "Bu ay giriş sayısı" },
        { title: "En yoğun modül" },
        { title: "Ortalama oturum süresi" },
      ]}
      footerNote="Kullanım Takibi · admin modül önizlemesi"
    />
  );
}
