import { YasamHafizasiSectionShell } from "./components/YasamHafizasiSectionShell";
import { ResultsSkeleton } from "./components/WorkspaceStates";

/** BF-13 — route Suspense fallback (kabuk + iskelet; layout-shift önler). */
export default function YasamHafizasiLoading() {
  return (
    <YasamHafizasiSectionShell
      title="Yaşam Hafızası"
      subtitle="Farklı modüllerdeki mesleki bilgi ve içeriklerinizi tek yerden arayın."
    >
      <div className="mb-5 h-12 w-full animate-pulse rounded-2xl border border-white/80 bg-white/70" />
      <ResultsSkeleton />
    </YasamHafizasiSectionShell>
  );
}
