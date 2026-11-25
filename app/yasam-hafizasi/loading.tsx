import { useTranslations } from "next-intl";
import { YasamHafizasiSectionShell } from "./components/YasamHafizasiSectionShell";
import { ResultsSkeleton } from "./components/WorkspaceStates";

/** BF-13 — route Suspense fallback (kabuk + iskelet; layout-shift önler). */
export default function YasamHafizasiLoading() {
  const t = useTranslations("system.loading.yasamHafizasi");
  return (
    <YasamHafizasiSectionShell
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <div className="mb-5 h-12 w-full animate-pulse rounded-2xl border border-white/80 bg-white/70" />
      <ResultsSkeleton />
    </YasamHafizasiSectionShell>
  );
}
