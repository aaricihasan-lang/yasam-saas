import { Suspense } from "react";
import { BolgeHaritasiClient } from "./components/BolgeHaritasiClient";

export default function BolgeHaritasiPage() {
  return (
    <Suspense
      fallback={
        <main className="flex h-screen w-screen items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
          <p className="text-sm font-semibold text-violet-900">Yükleniyor…</p>
        </main>
      }
    >
      <BolgeHaritasiClient />
    </Suspense>
  );
}
