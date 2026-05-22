import Link from "next/link";
import { BIOENERJI_FOLDER_CARDS } from "../biyoenerjiFolderConfig";

export default function BiyoenerjiFolderCards() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 2xl:grid-cols-3">
      {BIOENERJI_FOLDER_CARDS.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className={`group flex min-h-[280px] flex-col overflow-hidden rounded-3xl border bg-gradient-to-br p-7 transition duration-300 hover:scale-[1.02] hover:-translate-y-1 ${card.gradient} ${card.border} ${card.glow} hover:shadow-xl sm:min-h-[300px] sm:p-8`}
        >
          <div className="flex flex-1 flex-col">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/70 text-4xl shadow-sm ring-1 ring-white/80 transition group-hover:scale-105 sm:h-[4.5rem] sm:w-[4.5rem] sm:text-5xl"
              aria-hidden
            >
              {card.icon}
            </span>
            <span
              className={`mt-5 inline-flex w-fit rounded-full bg-white/65 px-3.5 py-1 text-xs font-black tracking-wide backdrop-blur-sm ${card.accent}`}
            >
              {card.badge}
            </span>
            <h2
              className={`mt-4 text-2xl font-black leading-tight tracking-tight sm:text-[1.65rem] ${card.accent}`}
            >
              {card.title}
            </h2>
            <p className="mt-3 max-w-md text-base font-medium leading-relaxed text-slate-700/90 sm:text-[1.05rem]">
              {card.desc}
            </p>
          </div>
          <span
            className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900/90 py-3.5 text-sm font-black text-white shadow-md transition group-hover:bg-slate-950 sm:text-base`}
          >
            Çalışma alanına git →
          </span>
        </Link>
      ))}
    </div>
  );
}
