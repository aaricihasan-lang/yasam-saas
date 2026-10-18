"use client";

// Human Design Transitleri — izole çalışma alanı (/human-design/transit).
//   • Günün Transitleri: seçilen anın genel transiti (doğum verisi yok, yerel doğrulanmış motor, Roxy çağrısı yok).
//   • Kişisel Transit (?gorunum=kisisel): kayıtlı danışan analizi üzerine transit (sunucu, doğrulanmış sağlayıcı yanıtı).
// Human Design ana sayfasına bağlantı ayrı owner kararıyla eklenecek (bu sayfa ana kart düzenini değiştirmez).

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import { GeneralTransitView } from "./GeneralTransitView";
import { PersonalTransitView } from "./PersonalTransitView";

export function HdTransitContent() {
  const sp = useSearchParams();
  const router = useRouter();
  const personal = sp.get("gorunum") === "kisisel";
  const tab = (on: boolean) => `min-h-[40px] flex-1 rounded-lg px-4 text-sm font-bold sm:flex-none ${on ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`;
  return (
    <HumanDesignShell maxWidthClass="max-w-[1480px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600">Human Design</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{personal ? "Kişisel Transit Analizi" : "Günün Human Design Transitleri"}</h1>
        </div>
        <Link href="/human-design" className="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 no-underline hover:bg-indigo-50">
          ← Human Design
        </Link>
      </div>
      <div role="tablist" className="mb-4 flex gap-1 rounded-xl bg-slate-100/80 p-1" data-hd-transit-tabs>
        <button type="button" role="tab" aria-selected={!personal} className={tab(!personal)} onClick={() => router.push("/human-design/transit")} data-hd-transit-tab="general">
          Günün Transitleri
        </button>
        <button type="button" role="tab" aria-selected={personal} className={tab(personal)} onClick={() => router.push("/human-design/transit?gorunum=kisisel")} data-hd-transit-tab="personal">
          Kişisel Transit
        </button>
      </div>
      {personal ? <PersonalTransitView /> : <GeneralTransitView />}
    </HumanDesignShell>
  );
}
