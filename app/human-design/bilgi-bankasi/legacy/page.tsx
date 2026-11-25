"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdKnowledgeWorkspace } from "../components/HdKnowledgeWorkspace";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

/**
 * Kişisel Bilgi Kayıtları (human_design_knowledge_records) — eski "legacy" adresi.
 *
 * P1-4: Uzman için ana /human-design/bilgi-bankasi sayfası artık aynı çalışma alanını
 * gösterir. Bu adres eski bağlantılar ve admin'in kişisel kayıtları için korunur; "Eski /
 * Yedek / rollback" ürün dili kaldırıldı (temel fonksiyon gizli bağlantıya bağlı değil).
 */
export default function HdBilgiBankasiLegacyPage() {
  useBfcacheRefresh();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const t = useTranslations("hd.knowledge.legacy");

  return (
    <HumanDesignShell>
      <Link
        href="/human-design/bilgi-bankasi"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
      </Link>

      {isDemo && (
        <DemoModuleBanner className="mb-3" message={t("demo")} />
      )}

      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          {t("title")}
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          {t("intro")}
        </p>
      </div>

      <HdKnowledgeWorkspace isDemo={isDemo} />
    </HumanDesignShell>
  );
}
