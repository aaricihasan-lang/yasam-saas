"use client";

import { useTranslations } from "next-intl";
import { useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import { useMemo, useState, type FormEvent } from "react";
import {
  AromaterapiFormShell,
  AromaterapiFormSection,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { TextField, EnumSelect } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { GLOSSARY_STATUS_TR } from "@/lib/aromaterapi/readLabels";
import { GLOSSARY_STATUS_VALUES } from "@/lib/aromaterapi/glossaryFields";
import {
  createGlossaryTerm,
  updateGlossaryTerm,
  type GlossaryTermBody,
} from "@/lib/aromaterapi/glossaryWrite";
import type { GlossaryTermListItem } from "@/lib/aromaterapi/readTypes";

/**
 * Sözlük terim oluşturma/düzenleme formu (hafif yazma). AromaterapiFormShell +
 * paylaşılan alan primitifleriyle C3D tasarım diline uyumlu. Kaydedince onSaved(id).
 */

type FormState = {
  canonical_term_tr: string;
  canonical_term_en: string;
  short_definition_tr: string;
  professional_definition_tr: string;
  status: string;
};

function toState(row?: GlossaryTermListItem | null): FormState {
  return {
    canonical_term_tr: row?.canonical_term_tr ?? "",
    canonical_term_en: row?.canonical_term_en ?? "",
    short_definition_tr: row?.short_definition_tr ?? "",
    professional_definition_tr: row?.professional_definition_tr ?? "",
    status: row?.status ?? "draft",
  };
}

export function SozlukForm({
  mode,
  initial,
  isDemo = false,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: GlossaryTermListItem | null;
  isDemo?: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const initialState = useMemo(() => toState(initial), [initial]);
  const [f, setF] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrorCode(null);
  };

  const dirty = useMemo(
    () => (Object.keys(f) as (keyof FormState)[]).some((k) => f[k] !== initialState[k]),
    [f, initialState],
  );
  useAromaterapiDirtyGuard(dirty && !isDemo);
  const t = useTranslations("aromatherapy.glossary");
  const tf = useTranslations("aromatherapy.glossary.form");
  const enumOptionsI18n = useEnumOptions();

  const termError = triedSubmit && f.canonical_term_tr.trim() === "" ? tf("termRequired") : null;
  const defError = triedSubmit && f.short_definition_tr.trim() === "" ? tf("defRequired") : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isDemo || submitting) return;
    setTriedSubmit(true);
    if (f.canonical_term_tr.trim() === "" || f.short_definition_tr.trim() === "") return;

    const body: GlossaryTermBody = {
      canonical_term_tr: f.canonical_term_tr.trim(),
      canonical_term_en: f.canonical_term_en.trim() || null,
      short_definition_tr: f.short_definition_tr.trim(),
      professional_definition_tr: f.professional_definition_tr.trim() || null,
      status: f.status,
    };

    setSubmitting(true);
    setErrorCode(null);
    const res =
      mode === "create"
        ? await createGlossaryTerm(body)
        : await updateGlossaryTerm(initial?.id ?? "", body);
    setSubmitting(false);

    if (res.ok) {
      onSaved(res.id ?? initial?.id ?? "");
      return;
    }
    setErrorCode(res.errorCode);
  }

  return (
    <AromaterapiFormShell
      mode={mode}
      title={mode === "create" ? tf("createTitle") : tf("editTitle")}
      description={tf("description")}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitting={submitting}
      isDemo={isDemo}
      dirty={dirty}
      errorMessage={errorCode ? (t.has(`errors.${errorCode}`) ? t(`errors.${errorCode}`) : t("errors.generic")) : null}
    >
      <AromaterapiFormSection title={tf("section")}>
        <TextField
          label={tf("termTr")}
          value={f.canonical_term_tr}
          onChange={(v) => set("canonical_term_tr", v)}
          required
          disabled={isDemo}
          maxLength={200}
          error={termError}
        />
        <TextField
          label={tf("termEn")}
          value={f.canonical_term_en}
          onChange={(v) => set("canonical_term_en", v)}
          disabled={isDemo}
          maxLength={200}
          hint={tf("optional")}
        />
        <TextField
          label={tf("shortDef")}
          value={f.short_definition_tr}
          onChange={(v) => set("short_definition_tr", v)}
          required
          disabled={isDemo}
          multiline
          rows={2}
          error={defError}
        />
        <TextField
          label={tf("proDef")}
          value={f.professional_definition_tr}
          onChange={(v) => set("professional_definition_tr", v)}
          disabled={isDemo}
          multiline
          rows={4}
          hint={tf("proDefHint")}
        />
        <EnumSelect
          label={tf("status")}
          value={f.status}
          onChange={(v) => set("status", v || "draft")}
          options={enumOptionsI18n(GLOSSARY_STATUS_VALUES, GLOSSARY_STATUS_TR)}
          disabled={isDemo}
          allLabel={tf("statusDefault")}
        />
      </AromaterapiFormSection>
    </AromaterapiFormShell>
  );
}
