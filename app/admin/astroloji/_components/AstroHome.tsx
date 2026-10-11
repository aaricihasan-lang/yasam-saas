"use client";

/**
 * Gökyüzü Atlası — ana ekran "Son çalışmalar" şeridi (yalnız sunum). Kahraman sahnenin devamı olarak koyu zemin
 * üzerinde okunaklı kartlar. Veri: mevcut profil listesi ucu (sort=recent); yalnız GERÇEK alanlar gösterilir
 * (ad, doğum tarihi/saat, yer, kayıtlı analiz sayısı ve son analiz tarihi). Yeni veri/iş mantığı YOK.
 */
import { useEffect, useState } from "react";
import { astroFetch } from "../_lib/api";
import type { ClientListItem } from "./ClientList";

const fmtDay = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "—");

export default function AstroHome({ onNewProfile, onOpenArchive, onOpenProfile }: { onNewProfile: () => void; onOpenArchive: () => void; onOpenProfile: (id: string) => void }) {
  const [recent, setRecent] = useState<ClientListItem[] | "error" | null>(null);

  useEffect(() => {
    let alive = true;
    void astroFetch<{ profiles: ClientListItem[] }>("/api/admin/astroloji/profiles?limit=6&offset=0&sort=recent").then((r) => {
      if (alive) setRecent(r.ok ? r.data.profiles : "error");
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-labelledby="atlas-recent" className="relative pb-12" data-testid="astro-home">
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-8">
        <div>
          <h2 id="atlas-recent" className="text-xl font-light tracking-[0.04em] text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-2xl">
            Son çalışmalar
          </h2>
          <p className="mt-1.5 text-sm text-[#F6F2EA]/72">En son işlem yapılan doğum profilleri — kaldığınız yerden devam edin.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNewProfile}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D9B56F]/50 px-4 py-2 text-sm font-medium text-[#F6E7C3] transition hover:border-[#D9B56F] hover:bg-[#D9B56F]/10"
          >
            <span aria-hidden="true">＋</span> Yeni doğum profili
          </button>
          <button type="button" onClick={onOpenArchive} className="rounded-full px-3 py-2 text-sm font-semibold text-[#F6F2EA]/80 transition hover:text-[#D9B56F]">
            Arşivin tamamı →
          </button>
        </div>
      </div>

      {recent === null ? (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[104px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
          ))}
        </ul>
      ) : recent === "error" ? (
        <p className="mt-5 rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">Liste yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>
      ) : recent.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-10 text-center">
          <p className="font-medium text-[#F6F2EA]">Henüz doğum profili yok</p>
          <p className="mt-1 text-sm text-[#F6F2EA]/72">İlk danışanınızın doğum bilgilerini girerek başlayın.</p>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {recent.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenProfile(p.id)}
                className="group flex h-full w-full items-center gap-4 rounded-2xl border border-white/10 bg-[#F6F2EA]/[0.06] p-4 text-left backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:border-[#D9B56F]/50 hover:bg-[#F6F2EA]/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D9B56F] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#D9B56F]/60 text-base font-light text-[#F6E7C3] [font-family:var(--font-atlas-display)]">
                  <span className="absolute inset-1 rounded-full border border-[#D9B56F]/20" />
                  {p.label.trim().charAt(0).toLocaleUpperCase("tr-TR") || "✦"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold tracking-[0.005em] text-[#F6F2EA]">{p.label}</span>
                  {p.current ? (
                    <span className="mt-0.5 block truncate text-xs text-[#F6F2EA]/78">
                      {fmtDay(p.current.birthDate)} · {p.current.timeKnown ? p.current.birthTime?.slice(0, 5) : "saat bilinmiyor"} · {p.current.locationLabel}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-xs text-[#F6F2EA]/78">Doğum bilgisi yok</span>
                  )}
                  <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#D9B56F]/90">
                    {p.analysisCount > 0 ? `${p.analysisCount} kayıtlı analiz · son ${fmtDay(p.lastAnalysisAt)}` : "Henüz kayıtlı analiz yok"}
                  </span>
                </span>
                <span className="shrink-0 text-[#F6F2EA]/40 transition group-hover:translate-x-0.5 group-hover:text-[#D9B56F]" aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
