"use client";

import type { ProtocolGroupedView, ProtocolStepGroupKey } from "../lib/protocolStepGroups";
import {
  hasGroupedProtocolContent,
  resolveDisplayGroups,
} from "../lib/protocolStepGroups";

const clinicalCardClass =
  "rounded-xl border border-slate-200/70 bg-white/85 p-4 shadow-sm";

const bodyTextClass =
  "text-[14px] font-medium leading-relaxed text-slate-800 sm:text-[15px]";

type GroupStyle = {
  wrap: string;
  label: string;
  bullet: string;
};

const GROUP_STYLES: Record<ProtocolStepGroupKey, GroupStyle> = {
  preparation: {
    wrap: "rounded-lg border border-cyan-200/70 bg-cyan-50/50 px-3 py-2.5",
    label: "text-cyan-600",
    bullet: "bg-cyan-500",
  },
  leftRegion: {
    wrap: "rounded-lg border border-violet-200/70 bg-violet-50/50 px-3 py-2.5",
    label: "text-violet-600",
    bullet: "bg-violet-600",
  },
  rightRegion: {
    wrap: "rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-3 py-2.5",
    label: "text-emerald-600",
    bullet: "bg-emerald-600",
  },
  warnings: {
    wrap: "rounded-lg border border-amber-200/70 bg-amber-50/50 px-3 py-2.5",
    label: "text-amber-600",
    bullet: "bg-amber-600",
  },
  extra: {
    wrap: "rounded-lg border border-slate-200/70 bg-slate-50/50 px-3 py-2.5",
    label: "text-slate-500",
    bullet: "bg-slate-500",
  },
};

const introWrapClass =
  "rounded-lg border border-violet-200/70 bg-violet-50/50 px-3 py-2.5";

function BulletList({ items, bulletClass }: { items: string[]; bulletClass: string }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item, index) => (
        <li key={`${index}-${item.slice(0, 20)}`} className="flex gap-2.5">
          <span
            className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${bulletClass}`}
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
      <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${style.label}`}>{group.title}</h3>
      <BulletList items={group.items} bulletClass={style.bullet} />
    </div>
  );
}

type ClinicalProtocolStepsCardProps = {
  grouped: ProtocolGroupedView;
};

export function ClinicalProtocolStepsCard({ grouped }: ClinicalProtocolStepsCardProps) {
  const displayGroups = resolveDisplayGroups(grouped);
  const hasSteps = displayGroups.some((g) => g.items.length > 0);

  if (!hasGroupedProtocolContent(grouped) && !hasSteps) return null;

  const showIntro = Boolean(grouped.intro?.trim()) && !grouped.useFlatFallback;

  return (
    <section className={clinicalCardClass}>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet-600">Uygulama Adımları</h2>

      <div className="space-y-2.5">
        {showIntro ? (
          <div className={introWrapClass}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
              Protokol Aciklamasi
            </h3>
            <p className={`mt-1.5 ${bodyTextClass}`}>{grouped.intro}</p>
          </div>
        ) : null}

        {displayGroups.map((group) => (
          <StepGroupSection key={`${group.key}-${group.title}`} group={group} />
        ))}
      </div>
    </section>
  );
}
