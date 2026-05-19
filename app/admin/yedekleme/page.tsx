"use client";

import { CloudUpload } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

export default function YedeklemePage() {
  return (
    <AdminModuleLayout
      title="Yedekleme Merkezi"
      description="Veri yedekleme ve geri yükleme işlemleri"
      Icon={CloudUpload}
      theme={{
        headerGradient: "from-slate-900 via-sky-900 to-cyan-800",
        headerLabelClass: "text-sky-200/90",
        iconWrap: "from-sky-500 to-cyan-600",
      }}
      demoCards={[
        { title: "Son yedek" },
        { title: "Son geri yükleme" },
        { title: "Storage durumu" },
        { title: "Otomatik yedek planı" },
      ]}
      footerNote="Yedekleme Merkezi · admin modül önizlemesi"
    />
  );
}
