"use client";

import OilsPage from "@/app/aromaterapi/_components/OilsPage";
import { useTranslations } from "next-intl";

export default function YaglarPage() {
  const t = useTranslations("aromatherapy.oils.pages.all");
  return (
    <OilsPage
      basePath="/aromaterapi/yaglar"
      pageTitle={t("title")}
      pageSubtitle={t("subtitle")}
      pageDescription={t("description")}
    />
  );
}
