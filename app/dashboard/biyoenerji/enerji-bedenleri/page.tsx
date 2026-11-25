import { useTranslations } from "next-intl";
import EnerjiBedenleri from "../components/EnerjiBedenleri";
import EnerjiBedenleriShell from "@/app/_premium/biyoenerji/enerji-bedenleri/EnerjiBedenleriShell";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function EnerjiBedenleriPage() {
  const t = useTranslations("bioenergy.pages");
  return (
    <EnerjiBedenleriShell
      badge={t("enerji-bedenleri.badge")}
      title={t("enerji-bedenleri.title")}
      subtitle={t("enerji-bedenleri.subtitle")}
    >
      <BfcacheRefreshHandler />
      <EnerjiBedenleri />
    </EnerjiBedenleriShell>
  );
}
