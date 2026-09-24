import { Suspense } from "react";
import { BolgeHaritasiClient } from "./components/BolgeHaritasiClient";
import { RefleksolojiEditorLoading } from "@/app/refleksoloji/components/RefleksolojiSkeleton";

export default function BolgeHaritasiPage() {
  return (
    // REF-021: Suspense fallback route skeleton'ıyla tutarlı (düz "Yükleniyor…" değil).
    <Suspense fallback={<RefleksolojiEditorLoading />}>
      <BolgeHaritasiClient />
    </Suspense>
  );
}
