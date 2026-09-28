"use client";

import { memo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { fieldLabel, type EffectiveSection } from "@/lib/danisan/anamnez/schema";
import type { TemplateCatalog } from "@/lib/danisan/anamnez/template/stdV1.i18n";
import type { AnamnezTemplate, AnswerValue, Answers, FieldSourceState } from "@/lib/danisan/anamnez/types";
import { AnamnezFieldInput } from "./AnamnezFieldInput";
import { aHint } from "./styles";

export function SourceBadge({ state }: { state: FieldSourceState }) {
  const t = useTranslations("clients.anamnez.source");
  if (state === "none") return null;
  const cls =
    state === "changed"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : state === "available"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const icon = state === "changed" ? "⚠" : state === "available" ? "🔔" : "✓";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${cls}`}>
      <span aria-hidden>{icon}</span>
      {t(state)}
    </span>
  );
}

type Props = {
  section: EffectiveSection;
  template: AnamnezTemplate;
  catalog: TemplateCatalog;
  answers: Answers;
  fieldStates: Record<string, FieldSourceState>;
  importedKeys: Set<string>;
  sectionState: FieldSourceState;
  progress: { filled: number; total: number };
  expanded: boolean;
  locked: boolean;
  extraTop?: ReactNode;
  sourceMetaFor?: (key: string) => string | null;
  onToggle: (key: string) => void;
  onAnswer: (key: string, value: AnswerValue) => void;
  onImport: (section: string) => void;
  onViewChanges: () => void;
  onToggleSection: (section: string, enabled: boolean) => void;
  onRemoveField: (key: string) => void;
  onEditLabel: (key: string) => void;
  onDeleteCustom: (key: string) => void;
  onAddField: (section: string) => void;
};

function AnamnezSectionCardImpl(p: Props) {
  const t = useTranslations("clients.anamnez");
  const { section: s, catalog } = p;
  const title = catalog.sections[s.key]?.title ?? s.key;
  const hint = catalog.sections[s.key]?.hint ?? "";
  const visible = s.fields.filter((f) => !f.hidden);
  const panelId = `anamnez-sec-${s.key}`;
  const complete = p.progress.total > 0 && p.progress.filled === p.progress.total;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={p.expanded}
          aria-controls={panelId}
          onClick={() => p.onToggle(s.key)}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-slate-50 sm:px-4"
        >
          <span
            aria-hidden
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-black ${
              complete ? "bg-emerald-600 text-white" : "bg-teal-50 text-teal-700"
            }`}
          >
            {s.key}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold text-slate-800">{title}</span>
            <span className="block truncate text-[12px] font-medium text-slate-500">{hint}</span>
            {p.sectionState !== "none" ? (
              <span className="mt-1 block sm:hidden"><SourceBadge state={p.sectionState} /></span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden sm:inline-flex"><SourceBadge state={p.sectionState} /></span>
            {s.enabled ? (
              <span className="text-[12px] font-bold tabular-nums text-slate-500">
                {p.progress.filled}/{p.progress.total}
              </span>
            ) : null}
          </span>
          <span aria-hidden className={`shrink-0 text-slate-400 transition-transform ${p.expanded ? "rotate-180" : ""}`}>▾</span>
        </button>
      </h3>

      {p.expanded ? (
        <div id={panelId} className="space-y-4 border-t border-slate-100 px-3.5 pb-4 pt-3 sm:px-4">
          {s.optional ? (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className={aHint}>{s.enabled ? t("section.optionalOff") : t("section.disabledNote")}</p>
              {!p.locked ? (
                <button
                  type="button"
                  onClick={() => p.onToggleSection(s.key, !s.enabled)}
                  className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-teal-300 bg-white px-3 text-[13px] font-extrabold text-teal-700 hover:bg-teal-50"
                >
                  {s.enabled ? t("section.disable") : t("section.enable")}
                </button>
              ) : null}
            </div>
          ) : null}

          {s.enabled ? (
            <>
              {p.extraTop}
              {!p.locked && p.sectionState === "available" ? (
                <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] font-bold text-sky-900">🔔 {t("import.available")}</p>
                  <button
                    type="button"
                    onClick={() => p.onImport(s.key)}
                    className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl bg-sky-700 px-3 text-[13px] font-extrabold text-white hover:bg-sky-800"
                  >
                    {t("import.action")}
                  </button>
                </div>
              ) : null}
              {p.sectionState === "changed" ? (
                <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] font-bold text-amber-900">
                    ⚠ {p.locked ? t("changes.bannerCompleted") : t("changes.bannerDraft")}
                  </p>
                  <button
                    type="button"
                    onClick={p.onViewChanges}
                    className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-amber-400 bg-white px-3 text-[13px] font-extrabold text-amber-800 hover:bg-amber-100"
                  >
                    {t("changes.view")}
                  </button>
                </div>
              ) : null}

              {visible.length === 0 ? <p className={aHint}>{t("section.noVisible")}</p> : null}

              {visible.map((f) => {
                const label = fieldLabel(f, catalog);
                const labelId = `anamnez-l-${f.key.replace(/\./g, "-")}`;
                const inputId = `anamnez-i-${f.key.replace(/\./g, "-")}`;
                const state = p.fieldStates[f.key] ?? "none";
                const meta = p.sourceMetaFor?.(f.key) ?? null;
                const isCustom = f.kind === "custom";
                const edited = f.kind === "template" && f.labelOverride !== null;
                const fieldHint = f.kind === "template" ? catalog.fields[f.key]?.hint : undefined;
                return (
                  <div key={f.key} className="border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                    <div className="mb-1.5 flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <label id={labelId} htmlFor={inputId} className="block text-[14px] font-extrabold leading-snug text-slate-800">
                          {label}
                        </label>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {isCustom ? (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">{t("field.customTag")}</span>
                          ) : null}
                          {edited ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{t("field.labelEdited")}</span>
                          ) : null}
                          {p.importedKeys.has(f.key) && state === "current" ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">✓ {t("source.fromClient")}</span>
                          ) : state === "changed" || state === "available" ? (
                            <SourceBadge state={state} />
                          ) : null}
                          {meta ? <span className="text-[11px] font-medium text-slate-500">{meta}</span> : null}
                          {fieldHint ? <span className="text-[12px] font-medium text-slate-500">{fieldHint}</span> : null}
                        </div>
                      </div>
                      {!p.locked ? (
                        <details className="relative shrink-0">
                          <summary
                            aria-label={t("field.menu")}
                            className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-lg font-black text-slate-400 hover:bg-slate-100 hover:text-slate-600 [&::-webkit-details-marker]:hidden"
                          >
                            ⋯
                          </summary>
                          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                            <MenuItem onClick={() => p.onEditLabel(f.key)}>{t("field.editLabel")}</MenuItem>
                            <MenuItem onClick={() => p.onRemoveField(f.key)}>{t("field.removeFromClient")}</MenuItem>
                            {isCustom ? (
                              <MenuItem danger onClick={() => p.onDeleteCustom(f.key)}>{t("field.deleteCustom")}</MenuItem>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                    <AnamnezFieldInput
                      field={f}
                      value={p.answers[f.key]}
                      onChange={(v) => p.onAnswer(f.key, v)}
                      disabled={p.locked}
                      template={p.template}
                      catalog={catalog}
                      inputId={inputId}
                      labelledBy={labelId}
                    />
                  </div>
                );
              })}

              {!p.locked ? (
                <button
                  type="button"
                  onClick={() => p.onAddField(s.key)}
                  className="inline-flex min-h-[40px] items-center rounded-xl border border-dashed border-teal-300 px-3 text-[13px] font-extrabold text-teal-700 hover:bg-teal-50"
                >
                  {t("section.addField")}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MenuItem({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
        onClick();
      }}
      className={`block w-full px-3 py-2.5 text-left text-[13px] font-bold ${danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

export const AnamnezSectionCard = memo(AnamnezSectionCardImpl);
