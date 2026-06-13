import { Suspense } from "react";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { HdRaporContent } from "./components/HdRaporContent";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function HdRaporOlusturPage() {
  return (
    <HumanDesignShell>
      <BfcacheRefreshHandler />
      {/* Başlık */}
      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Human Design — Rapor Oluştur
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Danışanın harita değerleriyle Bilgi Bankası'ndaki yorumları eşleştir,
          raporu düzenle ve kaydet.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center rounded-2xl border border-indigo-100/80 bg-white/80 py-20 text-sm text-slate-500">
            Yükleniyor...
          </div>
        }
      >
        <HdRaporContent />
      </Suspense>
    </HumanDesignShell>
  );
}
