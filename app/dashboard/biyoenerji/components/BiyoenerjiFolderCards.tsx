import Link from "next/link";
import { BIOENERJI_FOLDER_CARDS } from "../biyoenerjiFolderConfig";

export default function BiyoenerjiFolderCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {BIOENERJI_FOLDER_CARDS.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className={`group flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${card.gradient} ${card.border}`}
        >
          <div className="flex flex-1 flex-col">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-xl shadow-sm ring-1 ring-white/80 transition group-hover:scale-105"
              aria-hidden
            >
              {card.icon}
            </span>
            <span
              className={`mt-2 inline-flex w-fit rounded-full bg-white/65 px-2.5 py-0.5 text-[10px] font-black tracking-wide backdrop-blur-sm ${card.accent}`}
            >
              {card.badge}
            </span>
            <h2
              className={`mt-1.5 text-sm font-black leading-tight tracking-tight ${card.accent}`}
            >
              {card.title}
            </h2>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-700/80">
              {card.desc}
            </p>
          </div>
          <span
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-slate-900/90 py-1.5 text-xs font-bold text-white shadow-sm transition group-hover:bg-slate-950"
          >
            {"Çalışma alanına git →"}
          </span>
        </Link>
      ))}
    </div>
  );
}
