"use client";

import { FileJson } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

export default function DogaltasImportPage() {
  return (
    <AdminModuleLayout
      title="Doğaltaş JSON Import"
      description="Taş veritabanı toplu JSON aktarımı (yalnızca admin)"
      Icon={FileJson}
      theme={{
        headerGradient: "from-slate-900 via-cyan-900 to-teal-800",
        headerLabelClass: "text-cyan-200/90",
        iconWrap: "from-cyan-500 to-teal-500",
      }}
      demoCards={[
        { title: "Son import dosyası" },
        { title: "İşlenen taş sayısı" },
        { title: "Bekleyen kayıt" },
        { title: "Doğrulama durumu" },
      ]}
      footerNote="Doğaltaş JSON Import · admin modül önizlemesi"
    />
  );
}
