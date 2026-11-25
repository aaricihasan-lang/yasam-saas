"use client";

import { useTranslations } from "next-intl";
import { KupaShell } from "../components/KupaShell";
import { TechniqueWorkspace } from "./components/TechniqueWorkspace";

/**
 * KUPA TEKNİKLERİ — reader-first çalışma alanı (FAZ 4 / 2B).
 *
 * Index route: liste-önce. <1024px yalnız liste; >=1024px liste + "teknik seçin"
 * boş sağ panel. Teknik seçimi /kupa/teknikler/[id] deep-link'idir. Eski generic
 * form-tabanlı düzenleme ekranı KALDIRILDI (reader-first workspace ile değiştirildi).
 */
export default function TekniklerPage() {
  const t = useTranslations("cupping.techniques");
  return (
    <KupaShell
      title={t("list.title")}
      subtitle={t("page.subtitle")}
      breadcrumb={[{ label: t("list.title") }]}
    >
      <TechniqueWorkspace selectedId={null}>
        <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
          <p className="text-[14px] text-slate-400">{t("page.selectHint")}</p>
        </div>
      </TechniqueWorkspace>
    </KupaShell>
  );
}
