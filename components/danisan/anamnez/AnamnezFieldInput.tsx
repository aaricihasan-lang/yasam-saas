"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { fieldOptions, optionSetLabels, type EffectiveField } from "@/lib/danisan/anamnez/schema";
import type { TemplateCatalog } from "@/lib/danisan/anamnez/template/stdV1.i18n";
import type { AnamnezTemplate, AnswerValue, RowColumn, RowValue, YndValue } from "@/lib/danisan/anamnez/types";
import { aChip, aGhostBtn, aInput, aTextarea } from "./styles";

type Props = {
  field: EffectiveField;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  disabled: boolean;
  template: AnamnezTemplate;
  catalog: TemplateCatalog;
  inputId: string;
  labelledBy: string;
};

let rowCounter = 0;
function newRowId(): string {
  rowCounter = (rowCounter + 1) % 1_000_000;
  return `r${Date.now().toString(36)}${rowCounter.toString(36)}`;
}

function YesNo({ value, onChange, disabled, labelledBy }: { value: boolean | null; onChange: (v: boolean | null) => void; disabled: boolean; labelledBy: string }) {
  const t = useTranslations("clients.anamnez.field");
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {([true, false] as const).map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(value === v ? null : v)}
          className={`${aChip(value === v)} min-w-[84px]`}
        >
          {v ? t("yes") : t("no")}
        </button>
      ))}
    </div>
  );
}

function Scale10({ value, onChange, disabled, labelledBy }: { value: number | null; onChange: (v: number | null) => void; disabled: boolean; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-6 gap-1.5 sm:flex sm:flex-wrap">
      {Array.from({ length: 11 }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          disabled={disabled}
          onClick={() => onChange(value === i ? null : i)}
          className={`${aChip(value === i)} h-10 w-full px-0 sm:w-10`}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function RowsInput({
  columns, rows, onChange, disabled, template, catalog,
}: {
  columns: readonly RowColumn[];
  rows: RowValue[];
  onChange: (rows: RowValue[]) => void;
  disabled: boolean;
  template: AnamnezTemplate;
  catalog: TemplateCatalog;
}) {
  const t = useTranslations("clients.anamnez.field");
  const setCell = (id: string, key: string, v: string | number | null) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [key]: v } : r)));
  return (
    <div className="space-y-2">
      {rows.length === 0 ? <p className="text-[13px] font-medium text-slate-400">{t("noRows")}</p> : null}
      {rows.map((r, idx) => (
        <div key={r.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((c) => {
              const colLabel = catalog.columns[c.key] ?? c.key;
              const cell = r[c.key];
              return (
                <label key={c.key} className="block min-w-0">
                  <span className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{colLabel}</span>
                  {c.type === "single" ? (
                    <select
                      disabled={disabled}
                      value={typeof cell === "string" ? cell : ""}
                      onChange={(e) => setCell(r.id, c.key, e.target.value || null)}
                      className={`${aInput} mt-0.5`}
                    >
                      <option value="">{t("select")}</option>
                      {optionSetLabels(template, catalog, c.options).map((o) => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                  ) : c.type === "number" ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      disabled={disabled}
                      min={c.min}
                      max={c.max}
                      value={typeof cell === "number" ? cell : ""}
                      onChange={(e) => setCell(r.id, c.key, e.target.value === "" ? null : Number(e.target.value))}
                      className={`${aInput} mt-0.5`}
                    />
                  ) : (
                    <input
                      type="text"
                      disabled={disabled}
                      maxLength={300}
                      value={typeof cell === "string" ? cell : ""}
                      onChange={(e) => setCell(r.id, c.key, e.target.value)}
                      className={`${aInput} mt-0.5`}
                    />
                  )}
                </label>
              );
            })}
          </div>
          {!disabled ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                aria-label={`${t("removeRow")} ${idx + 1}`}
                className="rounded-lg px-2 py-1 text-[12px] font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-700"
              >
                {t("removeRow")}
              </button>
            </div>
          ) : null}
        </div>
      ))}
      {!disabled && rows.length < 30 ? (
        <button type="button" onClick={() => onChange([...rows, { id: newRowId() }])} className={aGhostBtn}>
          {t("addRow")}
        </button>
      ) : null}
    </div>
  );
}

function AnamnezFieldInputImpl({ field, value, onChange, disabled, template, catalog, inputId, labelledBy }: Props) {
  const t = useTranslations("clients.anamnez.field");
  const type = field.kind === "template" ? field.field.type : field.custom.type;
  const tf = field.kind === "template" ? field.field : null;

  switch (type) {
    case "yn":
      return <YesNo value={typeof value === "boolean" ? value : null} onChange={(v) => onChange(v)} disabled={disabled} labelledBy={labelledBy} />;
    case "ynd": {
      const v: YndValue = value && typeof value === "object" && !Array.isArray(value) ? (value as YndValue) : { v: null, d: "" };
      return (
        <div className="space-y-2">
          <YesNo value={v.v} onChange={(nv) => onChange({ ...v, v: nv })} disabled={disabled} labelledBy={labelledBy} />
          <textarea
            id={inputId}
            disabled={disabled}
            maxLength={4000}
            placeholder={t("detail")}
            aria-label={t("detail")}
            value={v.d}
            onChange={(e) => onChange({ ...v, d: e.target.value })}
            className={`${aTextarea} min-h-[54px]`}
          />
        </div>
      );
    }
    case "single": {
      const opts = fieldOptions(field, template, catalog);
      const cur = typeof value === "string" ? value : null;
      return (
        <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={cur === o.key}
              disabled={disabled}
              onClick={() => onChange(cur === o.key ? null : o.key)}
              className={aChip(cur === o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    }
    case "multi": {
      const opts = fieldOptions(field, template, catalog);
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
          {opts.map((o) => {
            const on = cur.includes(o.key);
            return (
              <button
                key={o.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={() => onChange(on ? cur.filter((x) => x !== o.key) : [...cur, o.key])}
                className={aChip(on)}
              >
                {on ? "✓ " : ""}{o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "text":
      return (
        <input id={inputId} type="text" disabled={disabled} maxLength={300} value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)} className={aInput} />
      );
    case "textarea":
      return (
        <textarea id={inputId} disabled={disabled} maxLength={4000} value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)} className={aTextarea} />
      );
    case "date":
      return (
        <input id={inputId} type="date" disabled={disabled} value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)} className={`${aInput} sm:max-w-[220px]`} />
      );
    case "time":
      return (
        <input id={inputId} type="time" disabled={disabled} value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)} className={`${aInput} sm:max-w-[160px]`} />
      );
    case "number": {
      const unit = tf?.unit ? catalog.units[tf.unit] : null;
      return (
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            disabled={disabled}
            min={tf?.min}
            max={tf?.max}
            step={tf?.step ?? "any"}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => {
              const n = e.target.value === "" ? null : Number(e.target.value);
              onChange(n !== null && Number.isFinite(n) ? n : null);
            }}
            className={`${aInput} max-w-[180px]`}
          />
          {unit ? <span className="text-[13px] font-bold text-slate-500">{unit}</span> : null}
        </div>
      );
    }
    case "scale10":
      return <Scale10 value={typeof value === "number" ? value : null} onChange={(v) => onChange(v)} disabled={disabled} labelledBy={labelledBy} />;
    case "rows":
      return (
        <RowsInput
          columns={tf?.columns ?? []}
          rows={Array.isArray(value) ? (value as RowValue[]) : []}
          onChange={(rows) => onChange(rows)}
          disabled={disabled}
          template={template}
          catalog={catalog}
        />
      );
    default:
      return null;
  }
}

export const AnamnezFieldInput = memo(AnamnezFieldInputImpl);
