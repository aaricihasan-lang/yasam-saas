"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { MethodSeriesDetail } from "@/app/aromaterapi/katalog/_components/MethodSeriesDetail";
import { readYasamUser } from "@/lib/auth/yasamUser";

/** C3D-B2B — Üretim yöntemi serisi detayı + revizyon geçmişi + durum aksiyonları. */
export default function YontemDetayPage() {
  const params = useParams<{ id: string; seriesId: string }>();
  const preparationId = typeof params?.id === "string" ? params.id : "";
  const seriesId = typeof params?.seriesId === "string" ? params.seriesId : "";
  const isDemo = readYasamUser()?.is_demo_account === true;

  return (
    <AromaterapiSectionShell
      title="Üretim Yöntemi"
      subtitle="Yöntem içeriği, durumu ve revizyon geçmişi."
      icon="🧪"
      breadcrumbLeaf="Yöntem"
      showNav={false}
      actions={
        <Link
          href={preparationId ? `/aromaterapi/katalog/preparatlar/${preparationId}` : "/aromaterapi/katalog?tab=preparatlar"}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          ← Preparata dön
        </Link>
      }
    >
      <MethodSeriesDetail preparationId={preparationId} seriesId={seriesId} isDemo={isDemo} />
    </AromaterapiSectionShell>
  );
}
