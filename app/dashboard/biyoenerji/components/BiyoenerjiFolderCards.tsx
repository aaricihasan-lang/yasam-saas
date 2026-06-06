import Link from "next/link";
import { BIOENERJI_FOLDER_CARDS } from "../biyoenerjiFolderConfig";

export default function BiyoenerjiFolderCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {BIOENERJI_FOLDER_CARDS.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className={`group flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition duration-300 hover:scale-[1.02] hover:-translate-y-0.5 ${card.gradient} ${card.border} ${card.glow} hover:shadow-lg`}
        >
          <div className="flex flex-1 flex-col">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-2xl shadow-sm ring-1 ring-white/80 transition group-hover:scale-105"
              aria-hidden
            >
              {card.icon}
            </span>
            <span
              className={`mt-3 inline-flex w-fit rounded-full bg-white/65 px-2.5 py-0.5 text-[10px] font-black tracking-wide backdrop-blur-sm ${card.accent}`}
            >
              {card.badge}
            </span>
            <h2
              className={`mt-2 text-base font-black leading-tight tracking-tight ${card.accent}`}
            >
              {card.title}
            </h2>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-700/90">
              {card.desc}
            </p>
          </div>
          <span
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-slate-900/90 py-2 text-xs font-black text-white shadow-sm transition group-hover:bg-slate-950"
          >
            {"Çalışma alanına git →"}
          </span>
        </Link>
      ))}
    </div>
  );
}
