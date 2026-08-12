import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getBiyoenerjiGroups } from "../biyoenerjiFolderConfig";

/**
 * FAZ 2 — Gruplu profesyonel bilgi hub'ı.
 * Kartlar tek canonical kaynaktan (folderConfig) beslenir; yalnız IA gruplaması
 * eklenir. Görünür alanlar mevcut 6 çalışma alanıyla sınırlıdır — Aura / Temel
 * Bilgiler gibi henüz veri modeli olmayan alanlar için placeholder GÖSTERİLMEZ.
 */
export default function BiyoenerjiFolderCards() {
  const groups = getBiyoenerjiGroups();

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`bio-group-${group.id}`}>
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <h2
              id={`bio-group-${group.id}`}
              className="text-[13px] font-black uppercase tracking-[0.16em] text-violet-800"
            >
              {group.title}
            </h2>
            <span className="hidden text-xs font-medium text-slate-400 sm:inline">
              {group.desc}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.cards.map((card) => {
              const { Icon } = card;
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`group flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${card.gradient} ${card.border}`}
                >
                  <div className="flex flex-1 flex-col">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg shadow-sm transition group-hover:scale-105 ${card.iconBox}`}
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span
                      className={`mt-2 inline-flex w-fit rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-black tracking-wide backdrop-blur-sm ${card.accent}`}
                    >
                      {card.badge}
                    </span>
                    <h3
                      className={`mt-1.5 text-sm font-black leading-tight tracking-tight ${card.accent}`}
                    >
                      {card.title}
                    </h3>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-700/80">
                      {card.desc}
                    </p>
                  </div>
                  <span className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900/90 py-1.5 text-xs font-bold text-white shadow-sm transition group-hover:bg-slate-950">
                    Çalışma alanına git
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
