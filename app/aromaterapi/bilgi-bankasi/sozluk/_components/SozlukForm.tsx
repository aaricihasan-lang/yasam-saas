"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AromaterapiFormShell,
  AromaterapiFormSection,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { TextField, EnumSelect, enumOptions } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { GLOSSARY_STATUS_TR } from "@/lib/aromaterapi/readLabels";
import { GLOSSARY_STATUS_VALUES } from "@/lib/aromaterapi/glossaryFields";
import {
  createGlossaryTerm,
  updateGlossaryTerm,
  glossaryMessageForCode,
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

  const termError = triedSubmit && f.canonical_term_tr.trim() === "" ? "Terim (TR) zorunludur." : null;
  const defError = triedSubmit && f.short_definition_tr.trim() === "" ? "Kısa tanım zorunludur." : null;

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
      title={mode === "create" ? "Yeni Sözlük Terimi" : "Terimi Düzenle"}
      description="Aromaterapi terimlerinizi kendi kütüphanenize ekleyin; yalnız size görünür."
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitting={submitting}
      isDemo={isDemo}
      dirty={dirty}
      errorMessage={errorCode ? glossaryMessageForCode(errorCode) : null}
    >
      <AromaterapiFormSection title="Terim">
        <TextField
          label="Terim (TR)"
          value={f.canonical_term_tr}
          onChange={(v) => set("canonical_term_tr", v)}
          required
          disabled={isDemo}
          maxLength={200}
          error={termError}
        />
        <TextField
          label="Terim (EN)"
          value={f.canonical_term_en}
          onChange={(v) => set("canonical_term_en", v)}
          disabled={isDemo}
          maxLength={200}
          hint="İsteğe bağlı."
        />
        <TextField
          label="Kısa Tanım"
          value={f.short_definition_tr}
          onChange={(v) => set("short_definition_tr", v)}
          required
          disabled={isDemo}
          multiline
          rows={2}
          error={defError}
        />
        <TextField
          label="Profesyonel Tanım"
          value={f.professional_definition_tr}
          onChange={(v) => set("professional_definition_tr", v)}
          disabled={isDemo}
          multiline
          rows={4}
          hint="İsteğe bağlı — ayrıntılı editöryal tanım."
        />
        <EnumSelect
          label="Durum"
          value={f.status}
          onChange={(v) => set("status", v || "draft")}
          options={enumOptions(GLOSSARY_STATUS_VALUES, GLOSSARY_STATUS_TR)}
          disabled={isDemo}
          allLabel="Taslak"
        />
      </AromaterapiFormSection>
    </AromaterapiFormShell>
  );
}
