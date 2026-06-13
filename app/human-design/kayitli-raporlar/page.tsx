import { Suspense } from "react";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { HdRaporListesi } from "./components/HdRaporListesi";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function KayitliRaporlarPage() {
  return (
    <HumanDesignShell>
      <BfcacheRefreshHandler />
      {/* Başlık */}
      <div className="mb-5 rounded-2xl border border-fuchsia-200/80 bg-white/90 px-5 py-5 shadow-[0_6px_24px_-8px_rgba(168,85,247,0.18)] ring-1 ring-fuchsia-200/60 backdrop-blur-xl">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Kayıtlı Human Design Raporları
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Oluşturulan danışan raporlarını görüntüleyin, düzenleyin veya silin.
        </p>
      </div>

      {/* Liste */}
      <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Yükleniyor...</div>}>
        <HdRaporListesi />
      </Suspense>
    </HumanDesignShell>
  );
}
