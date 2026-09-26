"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AromaterapiFormShell,
  AromaterapiFormSection,
  AromaterapiReasonField,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { TextField, EnumSelect, NumberField, enumOptions } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { SOURCE_TYPE_TR, SOURCE_STATUS_TR } from "@/lib/aromaterapi/readLabels";
import { fetchSource } from "@/lib/aromaterapi/sourceData";
import {
  createSource,
  updateSource,
  sourceMessageForCode,
} from "@/lib/aromaterapi/sourceWrite";

/**
 * Kaynak künye oluşturma/düzenleme formu (RPC + audit yolu). Düzenlemede tam künye
 * fetch edilir (liste satırında olmayan doi/notes vb.) ve iyimser eşzamanlılık için
 * updated_at taşınır. reason düzenlemede zorunludur.
 */

const SOURCE_TYPE_VALUES = Object.keys(SOURCE_TYPE_TR);
const SOURCE_STATUS_VALUES = Object.keys(SOURCE_STATUS_TR);

type FormState = {
  source_type: string;
  title: string;
  authors: string;
  organization: string;
  publication_year: string;
  doi: string;
  pmid: string;
  isbn: string;
  url: string;
  document_no: string;
  notes: string;
  status: string;
};

const EMPTY_STATE: FormState = {
  source_type: "",
  title: "",
  authors: "",
  organization: "",
  publication_year: "",
  doi: "",
  pmid: "",
  isbn: "",
  url: "",
  document_no: "",
  notes: "",
  status: "draft",
};

function s(v: string | null | undefined): string {
  return v ?? "";
}

export function KaynakForm({
  mode,
  sourceId,
  isDemo = false,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  sourceId?: string;
  isDemo?: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(EMPTY_STATE);
  const [initialState, setInitialState] = useState<FormState>(EMPTY_STATE);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);

  // Düzenleme: tam künyeyi çek.
  useEffect(() => {
    if (mode !== "edit" || !sourceId) return;
    // loading zaten mode==="edit" ile true başlar; effect gövdesinde senkron setState YOK.
    const controller = new AbortController();
    fetchSource(sourceId, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok && res.data) {
        const st: FormState = {
          source_type: s(res.data.source_type),
          title: s(res.data.title),
          authors: s(res.data.authors),
          organization: s(res.data.organization),
          publication_year: res.data.publication_year != null ? String(res.data.publication_year) : "",
          doi: s(res.data.doi),
          pmid: s(res.data.pmid),
          isbn: s(res.data.isbn),
          url: s(res.data.url),
          document_no: s(res.data.document_no),
          notes: s(res.data.notes),
          status: s(res.data.status) || "draft",
        };
        setF(st);
        setInitialState(st);
        setExpectedUpdatedAt(res.data.updated_at);
        setLoading(false);
      } else if (res.errorCode !== null) {
        setLoadError(res.errorCode);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [mode, sourceId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrorCode(null);
  };

  const dirty = useMemo(() => {
    const fieldsDirty = (Object.keys(f) as (keyof FormState)[]).some((k) => f[k] !== initialState[k]);
    return fieldsDirty || (mode === "edit" && reason.trim() !== "");
  }, [f, initialState, reason, mode]);
  useAromaterapiDirtyGuard(dirty && !isDemo);

  const typeError = triedSubmit && f.source_type.trim() === "" ? "Kaynak türü zorunludur." : null;
  const titleError = triedSubmit && f.title.trim() === "" ? "Başlık zorunludur." : null;
  const yearError =
    triedSubmit && f.publication_year.trim() !== "" && !/^\d{4}$/.test(f.publication_year.trim())
      ? "Yıl 1400–2100 aralığında 4 haneli olmalıdır."
      : null;
  const reasonError =
    triedSubmit && mode === "edit" && reason.trim() === "" ? "Gerekçe zorunludur." : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isDemo || submitting) return;
    setTriedSubmit(true);
    if (f.source_type.trim() === "" || f.title.trim() === "") return;
    if (yearError) return;
    if (mode === "edit" && reason.trim() === "") return;

    const year = f.publication_year.trim() === "" ? null : Number(f.publication_year.trim());
    if (year !== null && (!Number.isInteger(year) || year < 1400 || year > 2100)) {
      setTriedSubmit(true);
      return;
    }

    const common = {
      source_type: f.source_type,
      title: f.title.trim(),
      authors: f.authors.trim() || null,
      organization: f.organization.trim() || null,
      publication_year: year,
      doi: f.doi.trim() || null,
      pmid: f.pmid.trim() || null,
      isbn: f.isbn.trim() || null,
      url: f.url.trim() || null,
      document_no: f.document_no.trim() || null,
      notes: f.notes.trim() || null,
    };

    setSubmitting(true);
    setErrorCode(null);
    const res =
      mode === "create"
        ? await createSource({ ...common, reason: reason.trim() || null })
        : await updateSource(sourceId ?? "", {
            ...common,
            status: f.status,
            expected_updated_at: expectedUpdatedAt ?? "",
            reason: reason.trim(),
          });
    setSubmitting(false);

    if (res.ok) {
      onSaved(res.entityId ?? sourceId ?? "");
      return;
    }
    setErrorCode(res.errorCode);
  }

  if (loading) {
    return <p className="py-8 text-center text-[13px] font-medium text-slate-500">Kaynak yükleniyor…</p>;
  }
  if (loadError) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] font-bold text-rose-600">{sourceMessageForCode(loadError)}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm"
        >
          Geri dön
        </button>
      </div>
    );
  }

  return (
    <AromaterapiFormShell
      mode={mode}
      wide
      title={mode === "create" ? "Yeni Kaynak" : "Kaynağı Düzenle"}
      description="Kaynak künyenizi kendi kütüphanenize ekleyin; yalnız size görünür."
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitting={submitting}
      isDemo={isDemo}
      dirty={dirty}
      conflict={errorCode === "AROMA_STALE"}
      errorMessage={errorCode ? sourceMessageForCode(errorCode) : null}
      reason={
        <AromaterapiReasonField
          value={reason}
          onChange={(v) => {
            setReason(v);
            setErrorCode(null);
          }}
          required={mode === "edit"}
          error={reasonError}
        />
      }
    >
      <AromaterapiFormSection title="Künye">
        <EnumSelect
          label="Kaynak Türü"
          value={f.source_type}
          onChange={(v) => set("source_type", v)}
          options={enumOptions(SOURCE_TYPE_VALUES, SOURCE_TYPE_TR)}
          required
          disabled={isDemo}
          error={typeError}
        />
        <TextField label="Başlık" value={f.title} onChange={(v) => set("title", v)} required disabled={isDemo} error={titleError} />
        <TextField label="Yazar(lar)" value={f.authors} onChange={(v) => set("authors", v)} disabled={isDemo} />
        <TextField label="Kurum / Yayınevi" value={f.organization} onChange={(v) => set("organization", v)} disabled={isDemo} />
        <NumberField
          label="Yayın Yılı"
          value={f.publication_year}
          onChange={(v) => set("publication_year", v)}
          min={1400}
          max={2100}
          disabled={isDemo}
          placeholder="örn. 2019"
        />
        {yearError ? <p className="text-[12px] font-bold text-rose-600">{yearError}</p> : null}
      </AromaterapiFormSection>

      <AromaterapiFormSection title="Tanımlayıcılar" hint="İsteğe bağlı — varsa doldurun.">
        <TextField label="DOI" value={f.doi} onChange={(v) => set("doi", v)} disabled={isDemo} mono />
        <TextField label="PMID" value={f.pmid} onChange={(v) => set("pmid", v)} disabled={isDemo} mono />
        <TextField label="ISBN" value={f.isbn} onChange={(v) => set("isbn", v)} disabled={isDemo} mono />
        <TextField label="URL" value={f.url} onChange={(v) => set("url", v)} disabled={isDemo} />
        <TextField label="Belge No" value={f.document_no} onChange={(v) => set("document_no", v)} disabled={isDemo} />
        <TextField label="Notlar" value={f.notes} onChange={(v) => set("notes", v)} disabled={isDemo} multiline rows={3} />
      </AromaterapiFormSection>

      {mode === "edit" ? (
        <AromaterapiFormSection title="Durum" hint="Geçişler: Taslak → Doğrulanmış / Arşivlenmiş; Doğrulanmış → Arşivlenmiş.">
          <EnumSelect
            label="Durum"
            value={f.status}
            onChange={(v) => set("status", v || "draft")}
            options={enumOptions(SOURCE_STATUS_VALUES, SOURCE_STATUS_TR)}
            disabled={isDemo}
            allLabel="Taslak"
          />
        </AromaterapiFormSection>
      ) : null}
    </AromaterapiFormShell>
  );
}
