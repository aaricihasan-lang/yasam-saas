"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { KnowledgeRecordForm } from "@/app/aromaterapi/_components/write/KnowledgeRecordForm";
import { readYasamUser } from "@/lib/auth/yasamUser";

/**
 * Yeni Bilgi Kaydı — C3D-D oluşturma ekranı (bağımsız route; modal değil).
 * Mevcut C2S/C2T POST motorunu kullanır; yeni backend YOK. Admin ve uzman aynı deneyim.
 */
export default function YeniBilgiKaydiPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const t = useTranslations("aromatherapy.knowledge.form.pages");
  return (
    <AromaterapiSectionShell
      title={t("newTitle")}
      subtitle={t("newSubtitle")}
      icon="📑"
      breadcrumbLeaf={t("newLeaf")}
      actions={
        <Link
          href="/aromaterapi/bilgi-kayitlari"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/85 px-3.5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
        >
          {t("backList")}
        </Link>
      }
    >
      <KnowledgeRecordForm mode="create" isDemo={isDemo} />
    </AromaterapiSectionShell>
  );
}
