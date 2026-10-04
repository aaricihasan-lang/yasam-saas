import { Layers } from "lucide-react";
import DigitalContentDemoBanner from "./DigitalContentDemoBanner";
import DigitalContentModuleGrid from "./DigitalContentModuleGrid";

export default function DigitalContentPage() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#edf5ff_0%,#f4f5ff_35%,#fff2fa_100%)] text-slate-900 antialiased">
      <div
        className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-blue-400/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 top-[15%] h-80 w-80 rounded-full bg-indigo-300/12 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 pt-4 pb-16 lg:px-8 xl:px-10">
        <DigitalContentDemoBanner />
        {/* Başlık */}
        <div className="mt-5 mb-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow-md">
              <Layers className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">
                Yaşam Sistemi
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                Dijital İçerik Merkezi
              </h1>
            </div>
          </div>
          <p className="mt-2.5 max-w-lg text-sm font-medium text-slate-600 sm:text-base">
            Kişisel arşiv ve dijital içerik yönetimi
          </p>
          <div className="mt-3 h-px w-full bg-gradient-to-r from-indigo-200/80 via-sky-200/60 to-transparent" />
        </div>

        {/* Modül kartları — AI alt modülleri (video/ders notu) yalnız yöneticiye (istemci bileşeni) */}
        <DigitalContentModuleGrid />
      </div>
    </main>
  );
}
