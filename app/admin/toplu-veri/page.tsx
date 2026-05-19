"use client";

import { Upload } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

export default function TopluVeriPage() {
  return (
    <AdminModuleLayout
      title="Toplu Veri Aktarımı"
      description="JSON ve toplu veri içe aktarma merkezi"
      Icon={Upload}
      theme={{
        headerGradient: "from-slate-900 via-violet-900 to-purple-800",
        headerLabelClass: "text-violet-200/90",
        iconWrap: "from-violet-500 to-purple-600",
      }}
      demoCards={[
        { title: "JSON içe aktarma kuyruğu" },
        { title: "Son aktarım tarihi" },
        { title: "Başarılı kayıt sayısı" },
        { title: "Hatalı kayıt sayısı" },
      ]}
      footerNote="Toplu Veri Aktarımı · admin modül önizlemesi"
    />
  );
}
