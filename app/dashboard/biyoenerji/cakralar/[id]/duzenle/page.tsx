"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import ChakraContentEditor from "../../../components/ChakraContentEditor";
import BiyoenerjiSectionShell from "../../../components/BiyoenerjiSectionShell";
import { safeChakraId } from "@/lib/bioenergy/chakrasRoutes";

/**
 * FAZ 2 — Çakra İçerik Editörü (dedicated page; küçük legacy modal DEĞİL).
 * Admin ve uzman AYNI editörü kullanır (tenant sahipliği + energy_body izni).
 */
export default function ChakraEditorPage() {
  const t = useTranslations("bioenergy.pages");
  const params = useParams();
  const safeId = safeChakraId(params?.id);
  return (
    <BiyoenerjiSectionShell
      headerVariant="detail"
      badge={t("cakralar.edit.badge")}
      title={t("cakralar.edit.title")}
      subtitle={t("cakralar.edit.subtitle")}
    >
      <div className="w-full min-w-0 max-w-6xl">
        <ChakraContentEditor id={safeId} />
      </div>
    </BiyoenerjiSectionShell>
  );
}
