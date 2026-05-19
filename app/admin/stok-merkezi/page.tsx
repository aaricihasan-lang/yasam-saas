"use client";

import { Package } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

export default function StokMerkeziPage() {
  return (
    <AdminModuleLayout
      title="Ürün & Stok Sistem Araçları"
      description="Merkezi stok, satış ve envanter yönetim araçları"
      Icon={Package}
      theme={{
        headerGradient: "from-slate-900 via-amber-900 to-orange-800",
        headerLabelClass: "text-amber-200/90",
        iconWrap: "from-amber-500 to-orange-500",
      }}
      demoCards={[
        { title: "Toplam stok kalemi" },
        { title: "Bu ay satış hareketi" },
        { title: "Düşük stok uyarısı" },
        { title: "Aktif ürün kategorisi" },
      ]}
      footerNote="Ürün & Stok Merkezi · admin modül önizlemesi"
    />
  );
}
