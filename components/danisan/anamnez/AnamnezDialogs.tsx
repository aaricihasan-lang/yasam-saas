"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { fieldLabel, getCatalog, type AnamnezLocale } from "@/lib/danisan/anamnez/schema";
import { displayAnswer, formatIsoDate, todayIsoIstanbul } from "@/lib/danisan/anamnez/format";
import { anamnezBase, anamnezFetch } from "@/lib/danisan/anamnez/client";
import type { ConflictChoice, ImportConflict, SourceChange } from "@/lib/danisan/anamnez/sources";
import { CUSTOM_FIELD_TYPES, type AnamnezSectionKey, type AnamnezSummary, type CustomFieldType, type RowValue } from "@/lib/danisan/anamnez/types";
import { aHint, aInput, aLabel, aTextarea } from "./styles";

// ─── Modal kabuğu ────────────────────────────────────────────────────────────

export function AnamnezModal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const t = useTranslations("clients.anamnez");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9990] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-white/40 bg-white shadow-2xl sm:rounded-[24px] ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-[17px] font-black text-slate-800">{title}</h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label={t("changes.close")}
            className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const cancelCls =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-5 text-[14px] font-black text-slate-700 hover:bg-slate-200";

// ─── Yeni anamnez ────────────────────────────────────────────────────────────

type NewAnamnezDialogProps = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  completed: AnamnezSummary[];
  locale: AnamnezLocale;
  onCreated: (id: string) => void;
  onDraftExists: (draftId: string | null) => void;
};

/** Yalnız açıkken mount edilir → her açılışta durum temiz başlar (reset effect'i yok). */
export function NewAnamnezDialog(props: NewAnamnezDialogProps) {
  return props.open ? <NewAnamnezDialogBody {...props} /> : null;
}

function NewAnamnezDialogBody({ open, onClose, clientId, completed, locale, onCreated, onDraftExists }: NewAnamnezDialogProps) {
  const t = useTranslations("clients.anamnez");
  const [date, setDate] = useState(() => todayIsoIstanbul());
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"standard" | "previous">(completed.length ? "previous" : "standard");
  const [fromId, setFromId] = useState<string>(completed[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await anamnezFetch<{ anamnesis: { id: string } }>(anamnezBase(clientId), {
      method: "POST",
      body: {
        mode,
        fromId: mode === "previous" ? fromId : null,
        assessmentDate: date,
        title: title.trim() || null,
        requestId,
      },
    });
    setBusy(false);
    if (res.ok) {
      onCreated(res.data.anamnesis.id);
      return;
    }
    if (res.code === "DRAFT_EXISTS") {
      onDraftExists(typeof res.data.draftId === "string" ? res.data.draftId : null);
      return;
    }
    setError(t(`errors.${errorKey(res.code)}`));
  }

  return (
    <AnamnezModal
      open={open}
      onClose={onClose}
      title={t("create.title")}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelCls}>{t("create.cancel")}</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !date || (mode === "previous" && !fromId)}
            className="btn-secondary min-h-[44px] disabled:opacity-60"
          >
            {busy ? t("create.creating") : t("create.submit")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={aLabel}>{t("create.date")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${aInput} mt-1`} />
          </label>
          <label className="block">
            <span className={aLabel}>{t("create.titleLabel")}</span>
            <input
              type="text"
              value={title}
              maxLength={120}
              placeholder={t("create.titlePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
              className={`${aInput} mt-1`}
            />
          </label>
        </div>

        {completed.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className={aLabel}>{t("create.modeLabel")}</legend>
            <ModeOption
              checked={mode === "standard"}
              onChange={() => setMode("standard")}
              title={t("create.modeStandard")}
              hint={t("create.modeStandardHint")}
            />
            <ModeOption
              checked={mode === "previous"}
              onChange={() => setMode("previous")}
              title={t("create.modePrevious")}
              hint={t("create.modePreviousHint")}
            />
            {mode === "previous" ? (
              <label className="block pl-1 pt-1">
                <span className={aLabel}>{t("create.previousLabel")}</span>
                <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={`${aInput} mt-1`}>
                  {completed.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatIsoDate(c.assessment_date, locale)} — {c.title || t(`kind.${c.kind}`)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </fieldset>
        ) : (
          <p className={aHint}>{t("create.modeStandardHint")}</p>
        )}

        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">{error}</p> : null}
      </div>
    </AnamnezModal>
  );
}

function ModeOption({ checked, onChange, title, hint }: { checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors ${
        checked ? "border-teal-500 bg-teal-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-1 h-4 w-4 accent-teal-600" />
      <span>
        <span className="block text-[14px] font-extrabold text-slate-800">{title}</span>
        <span className={`${aHint} mt-0.5 block`}>{hint}</span>
      </span>
    </label>
  );
}

export function errorKey(code: string): string {
  const known = [
    "NOT_FOUND", "INVALID", "DEMO_READ_ONLY", "NOT_READY", "LOCKED", "CONFLICT", "DRAFT_EXISTS",
    "PREVIOUS_REQUIRED", "CONFIRM_REQUIRED", "LIMIT_REACHED", "INVALID_TYPE", "TOO_LARGE", "EMPTY",
    "UPLOAD_MISSING", "STORAGE_FAILED", "RATE_LIMITED",
  ];
  return known.includes(code) ? code : "generic";
}

// ─── Çakışma (Mevcut Bilgileri Getir) ────────────────────────────────────────

function ValueBox({ label, value, tone }: { label: string; value: string; tone: "slate" | "teal" }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone === "teal" ? "border-teal-200 bg-teal-50/60" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 whitespace-pre-line break-words text-[14px] font-semibold text-slate-800">{value || "—"}</div>
    </div>
  );
}

function rowsText(rows: RowValue[] | undefined): string {
  return (rows ?? []).map((r) => String(r.trigger ?? r.ref ?? "")).filter(Boolean).join(", ");
}

type ImportConflictDialogProps = {
  open: boolean;
  conflicts: ImportConflict[];
  version: string;
  locale: AnamnezLocale;
  labelFor: (key: string) => string;
  onApply: (choices: Record<string, ConflictChoice>) => void;
  onCancel: () => void;
};

/** Yalnız açıkken mount edilir → her açılışta durum temiz başlar (reset effect'i yok). */
export function ImportConflictDialog(props: ImportConflictDialogProps) {
  return props.open ? <ImportConflictDialogBody {...props} /> : null;
}

function ImportConflictDialogBody({ open, conflicts, version, locale, labelFor, onApply, onCancel }: ImportConflictDialogProps) {
  const t = useTranslations("clients.anamnez");
  const yn = { yes: t("field.yes"), no: t("field.no") };
  // Varsayılan seçim: Mevcudu Koru (sessiz overwrite yok).
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>(() =>
    Object.fromEntries(conflicts.map((c) => [c.key, "keep" as ConflictChoice])),
  );
  const setAll = (c: ConflictChoice) => setChoices(Object.fromEntries(conflicts.map((x) => [x.key, c])));

  return (
    <AnamnezModal
      open={open}
      onClose={onCancel}
      wide
      title={t("conflict.title")}
      footer={
        <>
          <button type="button" onClick={onCancel} className={cancelCls}>{t("conflict.cancel")}</button>
          <button type="button" onClick={() => onApply(choices)} className="btn-secondary min-h-[44px]">{t("conflict.apply")}</button>
        </>
      }
    >
      <p className={aHint}>{t("conflict.intro")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAll("keep")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50">{t("conflict.keepAll")}</button>
        <button type="button" onClick={() => setAll("use")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50">{t("conflict.useAll")}</button>
      </div>
      <ul className="mt-3 space-y-3">
        {conflicts.map((c) => {
          const choice = choices[c.key] ?? "keep";
          const current = c.addRows ? rowsText(c.current as RowValue[]) : displayAnswer(c.current, c.field, version, locale, yn);
          const incoming = c.addRows ? rowsText(c.addRows) : displayAnswer(c.incoming, c.field, version, locale, yn);
          return (
            <li key={c.key} className="rounded-2xl border border-slate-200 p-3">
              <div className="text-[14px] font-extrabold text-slate-800">{labelFor(c.key)}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <ValueBox label={t("conflict.inAnamnesis")} value={current} tone="slate" />
                <ValueBox label={c.addRows ? t("conflict.addRows") : t("conflict.inClient")} value={incoming} tone="teal" />
              </div>
              {c.addRows ? <p className={`${aHint} mt-1.5`}>{t("conflict.rowsNote")}</p> : null}
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={labelFor(c.key)}>
                {(["keep", "use"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={choice === opt}
                    onClick={() => setChoices((p) => ({ ...p, [c.key]: opt }))}
                    className={`min-h-[42px] rounded-xl border px-2 text-[13px] font-extrabold transition-colors ${
                      choice === opt ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {opt === "keep" ? t("conflict.keep") : t("conflict.use")}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </AnamnezModal>
  );
}

// ─── Değişiklikleri Gör ──────────────────────────────────────────────────────

type ChangesDialogProps = {
  open: boolean;
  changes: SourceChange[];
  version: string;
  locale: AnamnezLocale;
  locked: boolean;
  labelFor: (key: string) => string;
  busy?: boolean;
  onApply?: (choices: Record<string, ConflictChoice>) => void;
  onStartNew?: () => void;
  onClose: () => void;
};

/** Yalnız açıkken mount edilir → her açılışta durum temiz başlar (reset effect'i yok). */
export function ChangesDialog(props: ChangesDialogProps) {
  return props.open ? <ChangesDialogBody {...props} /> : null;
}

function ChangesDialogBody({ open, changes, version, locale, locked, labelFor, busy, onApply, onStartNew, onClose }: ChangesDialogProps) {
  const t = useTranslations("clients.anamnez");
  const yn = { yes: t("field.yes"), no: t("field.no") };
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>(() =>
    Object.fromEntries(changes.map((c) => [c.key, "keep" as ConflictChoice])),
  );

  return (
    <AnamnezModal
      open={open}
      onClose={onClose}
      wide
      title={t("changes.title")}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelCls}>{t("changes.close")}</button>
          {locked && onStartNew ? (
            <button type="button" disabled={busy} onClick={onStartNew} className="btn-secondary min-h-[44px] disabled:opacity-60">{t("changes.startNew")}</button>
          ) : null}
          {!locked && onApply && changes.length > 0 ? (
            <button type="button" onClick={() => onApply(choices)} className="btn-secondary min-h-[44px]">{t("conflict.apply")}</button>
          ) : null}
        </>
      }
    >
      <p className={aHint}>{t("changes.intro")}</p>
      {locked ? <p className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-[12px] font-bold text-slate-600">🔒 {t("changes.lockedNote")}</p> : null}
      {changes.length === 0 ? <p className="mt-3 text-[14px] font-semibold text-slate-600">{t("changes.none")}</p> : null}
      <ul className="mt-3 space-y-3">
        {changes.map((c) => {
          const isRows = c.field.type === "rows";
          const before = displayAnswer(c.anamnesisValue, c.field, version, locale, yn);
          const after = isRows ? rowsText(c.addedRows) : displayAnswer(c.sourceValue, c.field, version, locale, yn);
          const choice = choices[c.key] ?? "keep";
          return (
            <li key={c.key} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
              <div className="text-[14px] font-extrabold text-slate-800">{labelFor(c.key)}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <ValueBox label={t("conflict.inAnamnesis")} value={before} tone="slate" />
                <ValueBox label={isRows ? t("changes.added") : t("conflict.inClient")} value={after} tone="teal" />
              </div>
              {!locked && onApply ? (
                <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={labelFor(c.key)}>
                  {(["keep", "use"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={choice === opt}
                      onClick={() => setChoices((p) => ({ ...p, [c.key]: opt }))}
                      className={`min-h-[42px] rounded-xl border px-2 text-[13px] font-extrabold ${
                        choice === opt ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {opt === "keep" ? t("changes.keepOld") : t("changes.applyNew")}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </AnamnezModal>
  );
}

// ─── Soru ekle ───────────────────────────────────────────────────────────────

type AddFieldDialogProps = {
  open: boolean;
  section: AnamnezSectionKey | null;
  sectionTitle: string;
  onAdd: (input: { section: AnamnezSectionKey; type: CustomFieldType; label: string; options: string[] }) => void;
  onClose: () => void;
};

/** Yalnız açıkken mount edilir → her açılışta durum temiz başlar (reset effect'i yok). */
export function AddFieldDialog(props: AddFieldDialogProps) {
  return props.open ? <AddFieldDialogBody {...props} /> : null;
}

function AddFieldDialogBody({ open, section, sectionTitle, onAdd, onClose }: AddFieldDialogProps) {
  const t = useTranslations("clients.anamnez");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("textarea");
  const [options, setOptions] = useState("");
  const [error, setError] = useState(false);
  const needsOptions = type === "single" || type === "multi";

  function submit() {
    const opts = options.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!section || !label.trim() || label.trim().length > 200 || (needsOptions && (opts.length < 2 || opts.length > 20))) {
      setError(true);
      return;
    }
    onAdd({ section, type, label: label.trim(), options: needsOptions ? opts.map((o) => o.slice(0, 100)) : [] });
  }

  return (
    <AnamnezModal
      open={open}
      onClose={onClose}
      title={`${t("custom.addTitle")} — ${sectionTitle}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelCls}>{t("custom.cancel")}</button>
          <button type="button" onClick={submit} className="btn-secondary min-h-[44px]">{t("custom.add")}</button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className={aLabel}>{t("custom.label")}</span>
          <input type="text" value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} className={`${aInput} mt-1`} />
        </label>
        <label className="block">
          <span className={aLabel}>{t("custom.type")}</span>
          <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)} className={`${aInput} mt-1`}>
            {CUSTOM_FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>{t(`custom.types.${ft}`)}</option>
            ))}
          </select>
        </label>
        {needsOptions ? (
          <label className="block">
            <span className={aLabel}>{t("custom.options")}</span>
            <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={4} className={`${aTextarea} mt-1`} />
            <span className={aHint}>{t("custom.optionsHint")}</span>
          </label>
        ) : null}
        <p className={`${aHint} rounded-xl bg-slate-50 px-3 py-2`}>{t("custom.scopeNote")}</p>
        {error ? <p role="alert" className="text-[13px] font-bold text-rose-700">{t("custom.invalid")}</p> : null}
      </div>
    </AnamnezModal>
  );
}

// ─── Başlık düzenle ──────────────────────────────────────────────────────────

type LabelEditDialogProps = {
  open: boolean;
  current: string;
  /** Kanonik alanlarda standart başlık (null → özel soru). */
  standard: string | null;
  onSave: (label: string | null) => void;
  onClose: () => void;
};

/** Yalnız açıkken mount edilir → her açılışta durum temiz başlar (reset effect'i yok). */
export function LabelEditDialog(props: LabelEditDialogProps) {
  return props.open ? <LabelEditDialogBody {...props} /> : null;
}

function LabelEditDialogBody({ open, current, standard, onSave, onClose }: LabelEditDialogProps) {
  const t = useTranslations("clients.anamnez");
  const [value, setValue] = useState(current);
  const valid = value.trim().length > 0 && value.trim().length <= 200;
  return (
    <AnamnezModal
      open={open}
      onClose={onClose}
      title={t("custom.labelTitle")}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelCls}>{t("custom.cancel")}</button>
          {standard !== null ? (
            <button type="button" onClick={() => onSave(null)} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 px-4 text-[14px] font-bold text-slate-600 hover:bg-slate-50">
              {t("custom.resetLabel")}
            </button>
          ) : null}
          <button type="button" disabled={!valid} onClick={() => onSave(value.trim())} className="btn-secondary min-h-[44px] disabled:opacity-60">
            {t("custom.saveLabel")}
          </button>
        </>
      }
    >
      <label className="block">
        <span className={aLabel}>{t("custom.label")}</span>
        <input type="text" value={value} maxLength={200} onChange={(e) => setValue(e.target.value)} className={`${aInput} mt-1`} />
      </label>
      {standard !== null ? <p className={`${aHint} mt-2`}>{t("field.standardLabel", { label: standard })}</p> : null}
      <p className={`${aHint} mt-2 rounded-xl bg-slate-50 px-3 py-2`}>{t("custom.scopeNote")}</p>
    </AnamnezModal>
  );
}

/** Kanonik + özel alan başlığını çözen yardımcı (diyaloglar için). */
export function makeLabelResolver(
  version: string,
  locale: AnamnezLocale,
  labels: Record<string, string>,
  custom: Array<{ key: string; label: string }>,
): (key: string) => string {
  const catalog = getCatalog(version, locale);
  return (key: string) => {
    const c = custom.find((x) => x.key === key);
    if (c) return c.label;
    return fieldLabel({ kind: "template", key, field: { key, type: "text" }, labelOverride: labels[key] ?? null, hidden: false }, catalog);
  };
}
