"use client";

// Human Design Transitleri — izole çalışma alanı (/human-design/transit).
//   • Günün Transitleri: seçilen anın genel transiti (doğum verisi yok, yerel doğrulanmış motor, Roxy çağrısı yok).
// Human Design ana sayfasına bağlantı ayrı owner kararıyla eklenecek (bu sayfa ana kart düzenini değiştirmez).

import Link from "next/link";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import { GeneralTransitView } from "./GeneralTransitView";

export function HdTransitContent() {
  return (
    <HumanDesignShell maxWidthClass="max-w-[1480px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600">Human Design</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Günün Human Design Transitleri</h1>
        </div>
        <Link href="/human-design" className="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 no-underline hover:bg-indigo-50">
          ← Human Design
        </Link>
      </div>
      <GeneralTransitView />
    </HumanDesignShell>
  );
}
