"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { KaynakForm } from "@/app/aromaterapi/kaynaklar/_components/KaynakForm";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";

/**
 * Kaynağı düzenle — tam sayfa (bitkiler/duzenle deseni). KaynakForm edit modunda tam
 * künyeyi kendisi çeker (out-of-tenant/eksik → form içi hata + geri dön); iyimser
 * eşzamanlılık (updated_at) ve zorunlu gerekçe korunur.
 */
export default function KaynakDuzenlePage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const router = useRouter();
  const { showToast } = useToast();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const detailHref = id ? `/aromaterapi/kaynaklar/${id}` : "/aromaterapi/kaynaklar";

  return (
    <AromaterapiSectionShell
      title="Kaynağı Düzenle"
      subtitle="Değişiklik yaparken bir gerekçe girmeniz gerekir."
      icon="📜"
      breadcrumbLeaf="Düzenle"
      actions={
        <Link
          href={detailHref}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          ← Kaynağa dön
        </Link>
      }
    >
      {id ? (
        <KaynakForm
          mode="edit"
          sourceId={id}
          isDemo={isDemo}
          onSaved={() => {
            showToast({ title: "Başarılı", message: "Kaynak güncellendi.", type: "success" });
            router.push(detailHref);
          }}
          onCancel={() => router.push(detailHref)}
        />
      ) : null}
    </AromaterapiSectionShell>
  );
}
