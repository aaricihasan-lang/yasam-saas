import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  BIOENERJI_GROUP_ORDER,
  BIOENERJI_SECTIONS_IN_ORDER,
  type BiyoenerjiGroupId,
} from "../biyoenerjiFolderConfig";

/**
 * FAZ 2 landing — kompakt profesyonel çalışma merkezi.
 * 6 alan TEK canonical grid'te (masaüstü 3×2, tablet 2, mobil 1). IA grubu artık
 * ayrı büyük section'lar yerine her kartın içindeki küçük kategori etiketiyle
 * taşınır. Kartlar tek kaynaktan (folderConfig) beslenir; placeholder yok.
 */
const GROUP_TITLE: Record<BiyoenerjiGroupId, string> = BIOENERJI_GROUP_ORDER.reduce(
  (acc, g) => {
    acc[g.id] = g.title;
    return acc;
  },
  {} as Record<BiyoenerjiGroupId, string>,
);

export default function BiyoenerjiFolderCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {BIOENERJI_SECTIONS_IN_ORDER.map((card) => {
        const { Icon } = card;
        return (
          <Link
            key={card.href}
            href={card.href}
            className={`group flex h-full flex-col rounded-2xl border bg-gradient-to-br p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${card.gradient} ${card.border}`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm transition group-hover:scale-105 ${card.iconBox}`}
                aria-hidden
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span
                className={`text-[9px] font-black uppercase tracking-[0.14em] ${card.accent} opacity-80`}
              >
                {GROUP_TITLE[card.group]}
              </span>
            </div>

            <h3 className={`mt-2.5 text-[15px] font-black leading-tight tracking-tight ${card.accent}`}>
              {card.title}
            </h3>
            <p className="mt-1 flex-1 text-xs font-medium leading-relaxed text-slate-700/80">
              {card.desc}
            </p>

            <span
              className={`mt-3 inline-flex items-center gap-1 self-end text-[12px] font-black ${card.accent} opacity-70 transition group-hover:opacity-100`}
            >
              Aç
              <ArrowRight
                className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
                strokeWidth={2.5}
                aria-hidden
              />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
