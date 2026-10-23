"use client";

import { memo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { fieldLabel, type EffectiveSection } from "@/lib/danisan/anamnez/schema";
import type { TemplateCatalog } from "@/lib/danisan/anamnez/template/stdV1.i18n";
import type { AnamnezTemplate, AnswerValue, Answers, FieldSourceState } from "@/lib/danisan/anamnez/types";
import { AnamnezFieldInput } from "./AnamnezFieldInput";
import { aHint } from "./styles";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

export function SourceBadge({ state }: { state: FieldSourceState }) {
  const t = useTranslations("clients.anamnez.source");
  if (state === "none") return null;
  const cls =
    state === "changed"
      ? "border-[#f0dfb8] bg-[#fdf6e7] text-[#9a6100]"
      : state === "available"
        ? "border-[#d3dff0] bg-[#eaf0f8] text-[#2c5aa0]"
        : "border-[#cfe7d8] bg-[#ebf6ef] text-[#17703f]";
  const icon = state === "changed" ? "⚠" : state === "available" ? "🔔" : "✓";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
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
    <section className={`${dyp.kCard} overflow-hidden !p-0`}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={p.expanded}
          aria-controls={panelId}
          onClick={() => p.onToggle(s.key)}
          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[#f8f9fb] sm:px-4"
        >
          <span
            aria-hidden
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[13px] font-extrabold ${
              complete ? "border-[#0f6e6e] bg-[#0f6e6e] text-white" : "border-[#d4dae3] bg-[#f8f9fb] text-[#13284b]"
            }`}
          >
            {s.key}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`${dyp.kSubtitle} block truncate`}>{title}</span>
            <span className={`${dyp.kMeta} block truncate !font-medium`}>{hint}</span>
            {p.sectionState !== "none" ? (
              <span className="mt-1 block sm:hidden"><SourceBadge state={p.sectionState} /></span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="hidden sm:inline-flex"><SourceBadge state={p.sectionState} /></span>
            {s.enabled ? (
              <span className={`${dyp.kChip} tabular-nums`}>
                {p.progress.filled}/{p.progress.total}
              </span>
            ) : null}
          </span>
          <span aria-hidden className={`shrink-0 text-[#8592a6] transition-transform ${p.expanded ? "rotate-180" : ""}`}>▾</span>
        </button>
      </h3>

      {p.expanded ? (
        <div id={panelId} className="space-y-4 border-t border-[#e3e7ee] px-3.5 pb-4 pt-3 sm:px-4">
          {s.optional ? (
            <div className={`${dyp.kField} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
              <p className={aHint}>{s.enabled ? t("section.optionalOff") : t("section.disabledNote")}</p>
              {!p.locked ? (
                <button
                  type="button"
                  onClick={() => p.onToggleSection(s.key, !s.enabled)}
                  className={`${dyp.kBtnSecondary} inline-flex min-h-[40px] shrink-0 items-center justify-center`}
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
                <div className={`${dyp.kAlert} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
                  <p className="font-bold">🔔 {t("import.available")}</p>
                  <button
                    type="button"
                    onClick={() => p.onImport(s.key)}
                    className={`${dyp.kBtnPrimary} inline-flex min-h-[40px] shrink-0 items-center justify-center`}
                  >
                    {t("import.action")}
                  </button>
                </div>
              ) : null}
              {p.sectionState === "changed" ? (
                <div className={`${dyp.kAlertWarn} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
                  <p className="font-bold">
                    ⚠ {p.locked ? t("changes.bannerCompleted") : t("changes.bannerDraft")}
                  </p>
                  <button
                    type="button"
                    onClick={p.onViewChanges}
                    className={`${dyp.kBtnSecondary} inline-flex min-h-[40px] shrink-0 items-center justify-center`}
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
                  <div key={f.key} className="border-b border-[#e3e7ee] pb-4 last:border-b-0 last:pb-0">
                    <div className="mb-1.5 flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <label id={labelId} htmlFor={inputId} className="block text-[14px] font-bold leading-snug text-[#0f1d36]">
                          {label}
                        </label>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {isCustom ? (
                            <span className={dyp.kChipBlue}>{t("field.customTag")}</span>
                          ) : null}
                          {edited ? (
                            <span className={dyp.kChip}>{t("field.labelEdited")}</span>
                          ) : null}
                          {p.importedKeys.has(f.key) && state === "current" ? (
                            <span className={dyp.kChipOk}>✓ {t("source.fromClient")}</span>
                          ) : state === "changed" || state === "available" ? (
                            <SourceBadge state={state} />
                          ) : null}
                          {meta ? <span className="text-[11px] font-medium text-[#55637a]">{meta}</span> : null}
                          {fieldHint ? <span className="text-[12px] font-medium text-[#55637a]">{fieldHint}</span> : null}
                        </div>
                      </div>
                      {!p.locked ? (
                        <details className="relative shrink-0">
                          <summary
                            aria-label={t("field.menu")}
                            className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-[10px] text-lg font-bold text-[#8592a6] hover:bg-[#f2f4f7] hover:text-[#1f3050] [&::-webkit-details-marker]:hidden"
                          >
                            ⋯
                          </summary>
                          <div className={`${dyp.kModal} absolute right-0 z-20 mt-1 w-56 overflow-hidden !rounded-[10px] py-1`}>
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
                  className={`${dyp.kBtnGhost} inline-flex min-h-[40px] items-center !border-dashed !border-[#d4dae3]`}
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
      className={`block w-full px-3 py-2.5 text-left text-[13px] font-semibold ${danger ? "text-[#b42318] hover:bg-[#fdf1f0]" : "text-[#1f3050] hover:bg-[#f8f9fb]"}`}
    >
      {children}
    </button>
  );
}

export const AnamnezSectionCard = memo(AnamnezSectionCardImpl);
