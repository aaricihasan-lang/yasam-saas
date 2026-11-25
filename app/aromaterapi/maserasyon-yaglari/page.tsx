"use client";

import OilsPage from "@/app/aromaterapi/_components/OilsPage";
import { useTranslations } from "next-intl";

export default function MiserasyonYaglariPage() {
  const t = useTranslations("aromatherapy.oils.pages.maceration");
  return (
    <OilsPage
      fixedOilType="maceration"
      basePath="/aromaterapi/maserasyon-yaglari"
      pageTitle={t("title")}
      pageSubtitle={t("subtitle")}
      pageDescription={t("description")}
    />
  );
}
