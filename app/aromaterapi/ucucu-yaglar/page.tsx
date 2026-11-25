"use client";

import OilsPage from "@/app/aromaterapi/_components/OilsPage";
import { useTranslations } from "next-intl";

export default function UcucuYaglarPage() {
  const t = useTranslations("aromatherapy.oils.pages.essential");
  return (
    <OilsPage
      fixedOilType="essential"
      basePath="/aromaterapi/ucucu-yaglar"
      pageTitle={t("title")}
      pageSubtitle={t("subtitle")}
      pageDescription={t("description")}
    />
  );
}
