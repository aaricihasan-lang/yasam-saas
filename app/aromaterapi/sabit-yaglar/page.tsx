"use client";

import OilsPage from "@/app/aromaterapi/_components/OilsPage";
import { useTranslations } from "next-intl";

export default function SabitYaglarPage() {
  const t = useTranslations("aromatherapy.oils.pages.carrier");
  return (
    <OilsPage
      fixedOilType="carrier"
      basePath="/aromaterapi/sabit-yaglar"
      pageTitle={t("title")}
      pageSubtitle={t("subtitle")}
      pageDescription={t("description")}
    />
  );
}
