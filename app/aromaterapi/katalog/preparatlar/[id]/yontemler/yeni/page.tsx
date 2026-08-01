"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { MethodSeriesForm } from "@/app/aromaterapi/katalog/_components/MethodSeriesForm";
import { readYasamUser } from "@/lib/auth/yasamUser";

/** C3D-B2B — Yeni Üretim/Elde Ediliş Yöntemi (preparata bağlı seri + ilk revizyon). */
export default function YeniYontemPage() {
  const params = useParams<{ id: string }>();
  const preparationId = typeof params?.id === "string" ? params.id : "";
  const isDemo = readYasamUser()?.is_demo_account === true;

  return (
    <AromaterapiSectionShell
      title="Yeni Üretim Yöntemi"
      subtitle="Bu preparatın nasıl elde edildiğini kaynağıyla birlikte tanımlayın."
      icon="🧪"
      breadcrumbLeaf="Yeni Yöntem"
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
      <MethodSeriesForm preparationId={preparationId} isDemo={isDemo} />
    </AromaterapiSectionShell>
  );
}
