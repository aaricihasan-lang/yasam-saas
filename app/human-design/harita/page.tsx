"use client";

// FAZ 5 / ADIM 3a — Human Design Haritası sayfası.
// Doğrulanmış HD motoru üzerinden (POST /api/hd/compute) harita oluşturur.
// DB kayıt / PDF / Word / SVG bodygraph / yorum YOK.

import { HumanDesignShell } from "../components/HumanDesignShell";
import { HdHaritaContent } from "./components/HdHaritaContent";

export default function HdHaritaPage() {
  return (
    <HumanDesignShell>
      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Human Design Haritası
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Doğum tarihi, saat ve konum bilgileriyle doğrulanmış Human Design motoru
          üzerinden harita oluştur.
        </p>
      </div>

      <HdHaritaContent />
    </HumanDesignShell>
  );
}
