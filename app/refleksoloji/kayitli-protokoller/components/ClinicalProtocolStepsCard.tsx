"use client";

import type { ProtocolGroupedView, ProtocolStepGroupKey } from "../lib/protocolStepGroups";
import { hasGroupedProtocolContent } from "../lib/protocolStepGroups";

const clinicalCardClass =
  "rounded-[28px] border-2 border-white/90 bg-white/85 p-6 shadow-[0_16px_44px_-18px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/70 backdrop-blur-md sm:p-8";

const bodyTextClass =
  "text-[17px] font-semibold leading-[1.85] text-slate-800 sm:text-[18px]";

type GroupStyle = {
  wrap: string;
  title: string;
  bullet: string;
};

const GROUP_STYLES: Record<ProtocolStepGroupKey, GroupStyle> = {
  preparation: {
    wrap: "rounded-2xl border border-cyan-200/90 bg-gradient-to-br from-cyan-50/95 to-sky-50/70 px-5 py-4 ring-1 ring-cyan-100/80",
    title: "text-cyan-950",
    bullet: "bg-cyan-500",
  },
  leftRegion: {
    wrap: "rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/95 to-fuchsia-50/65 px-5 py-4 ring-1 ring-violet-100/80",
    title: "text-violet-950",
    bullet: "bg-violet-600",
  },
  rightRegion: {
    wrap: "rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 to-teal-50/65 px-5 py-4 ring-1 ring-emerald-100/80",
    title: "text-emerald-950",
    bullet: "bg-emerald-600",
  },
  warnings: {
    wrap: "rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/70 px-5 py-4 ring-1 ring-amber-100/80",
    title: "text-amber-950",
    bullet: "bg-amber-600",
  },
  extra: {
    wrap: "rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/95 to-slate-100/80 px-5 py-4 ring-1 ring-slate-100/80",
    title: "text-slate-800",
    bullet: "bg-slate-500",
  },
};

const introWrapClass =
  "rounded-2xl border border-violet-200/80 bg-gradient-to-r from-violet-50/90 to-fuchsia-50/70 px-5 py-4 ring-1 ring-violet-100/70";

function BulletList({ items, bulletClass }: { items: string[]; bulletClass: string }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {items.map((item, index) => (
        <li key={`${index}-${item.slice(0, 20)}`} className="flex gap-3">
          <span
            className={`mt-[0.55rem] h-2 w-2 shrink-0 rounded-full ${bulletClass}`}
            aria-hidden
          />
          <span className={`min-w-0 flex-1 ${bodyTextClass}`}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StepGroupSection({ group }: { group: ProtocolGroupedView["groups"][number] }) {
  const style = GROUP_STYLES[group.key];
  return (
    <div className={style.wrap}>
      <h3 className={`text-lg font-black sm:text-xl ${style.title}`}>{group.title}</h3>
      <BulletList items={group.items} bulletClass={style.bullet} />
    </div>
  );
}

type ClinicalProtocolStepsCardProps = {
  grouped: ProtocolGroupedView;
};

export function ClinicalProtocolStepsCard({ grouped }: ClinicalProtocolStepsCardProps) {
  if (!hasGroupedProtocolContent(grouped)) return null;

  const showIntro = Boolean(grouped.intro?.trim());

  return (
    <section className={clinicalCardClass}>
      <h2 className="text-xl font-black text-violet-950 sm:text-2xl">Uygulama Adımları</h2>
      <p className="mt-1 text-[15px] font-semibold text-violet-800/80">
        Klinik protokol akışı — hazırlık, bölge çalışmaları ve uyarılar
      </p>

      <div className="mt-5 space-y-4">
        {showIntro ? (
          <div className={introWrapClass}>
            <h3 className="text-lg font-black text-violet-950 sm:text-xl">
              Protokol Başlığı / Kısa Açıklama
            </h3>
            <p className={`mt-3 ${bodyTextClass}`}>{grouped.intro}</p>
          </div>
        ) : null}

        {grouped.groups.map((group) => (
          <StepGroupSection key={group.key} group={group} />
        ))}
      </div>
    </section>
  );
}
