"use client";

import { useTranslations } from "next-intl";
import { useCatalogWriteError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import { useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  AromaterapiFormSection,
  AromaterapiFormShell,
  AromaterapiMutationNotice,
  AromaterapiReasonField,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { EnumSelect, TextField } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { createPlantTaxon, updatePlantTaxon } from "@/lib/aromaterapi/catalogWrite";
import { CATALOG_STATUS_TR, TAXON_RANK_TR } from "@/lib/aromaterapi/readLabels";
import type { PlantTaxonDetail } from "@/lib/aromaterapi/readTypes";

/**
 * C3D-B2B — Bitki (takson) oluştur/düzenle formu (full-width).
 *
 * C3D-B2A canlı writer'larını (catalogWrite) tüketir. tenant/actor/canonical_name
 * gövdeye konmaz; canonical_name salt-okunur türetilir. Edit'te reason + expected_updated_at
 * zorunlu; no-op ("Değişiklik bulunmadı") ve 409 conflict UI'da açıkça yönetilir.
 */

const RANK_VALUES = ["species", "subspecies", "variety", "forma"] as const;

type CoreState = {
  genus: string;
  species: string;
  taxon_rank: string;
  infraspecific_epithet: string;
  is_hybrid: boolean;
  author_citation: string;
  family: string;
  primary_common_name_tr: string;
  status: string;
};

function fromInitial(initial?: PlantTaxonDetail): CoreState {
  return {
    genus: initial?.genus ?? "",
    species: initial?.species ?? "",
    taxon_rank: initial?.taxon_rank ?? "",
    infraspecific_epithet: initial?.infraspecific_epithet ?? "",
    is_hybrid: initial?.is_hybrid ?? false,
    author_citation: initial?.author_citation ?? "",
    family: initial?.family ?? "",
    primary_common_name_tr: initial?.primary_common_name_tr ?? "",
    status: initial?.status ?? "draft",
  };
}

/** Duruma göre izinli sonraki durumlar (RPC matrisi: draft→verified→approved). */
function statusValues(current: string): string[] {
  const allowed =
    current === "draft"
      ? ["draft", "verified"]
      : current === "verified"
        ? ["verified", "approved"]
        : ["approved"];
  return allowed;
}

export function PlantTaxonForm({
  mode,
  initial,
  isDemo,
}: {
  mode: "create" | "edit";
  initial?: PlantTaxonDetail;
  isDemo: boolean;
}) {
  const enumOptionsI18n = useEnumOptions();
  const tf = useTranslations("aromatherapy.catalog.form");
  const tp = useTranslations("aromatherapy.catalog.form.plant");
  const writeError = useCatalogWriteError();
  const router = useRouter();
  const [core, setCore] = useState<CoreState>(() => fromInitial(initial));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [noop, setNoop] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const set = <K extends keyof CoreState>(k: K, v: CoreState[K]) => {
    setCore((c) => ({ ...c, [k]: v }));
    setNoop(false);
    setConflict(false);
    setErrorCode(null);
  };

  const initialState = useMemo(() => fromInitial(initial), [initial]);
  const dirty = useMemo(() => {
    if (mode === "create") {
      return (
        core.genus.trim() !== "" ||
        core.species.trim() !== "" ||
        core.family.trim() !== "" ||
        core.taxon_rank !== ""
      );
    }
    return (Object.keys(core) as (keyof CoreState)[]).some((k) => core[k] !== initialState[k]);
  }, [core, initialState, mode]);

  useAromaterapiDirtyGuard(dirty && !isDemo && successId === null);

  const fieldErrors = useMemo(() => {
    const e: Partial<Record<keyof CoreState | "reason", string>> = {};
    if (core.genus.trim() === "") e.genus = tp("genusRequired");
    if (core.species.trim() === "") e.species = tp("speciesRequired");
    if (core.taxon_rank === "") e.taxon_rank = tp("rankRequired");
    if (core.family.trim() === "") e.family = tp("familyRequired");
    if (mode === "edit" && reason.trim() === "") e.reason = tf("reasonRequired");
    return e;
  }, [core, reason, mode, tf, tp]);

  const hasErrors = Object.keys(fieldErrors).length > 0;
  const err = (k: keyof CoreState | "reason") => (triedSubmit ? fieldErrors[k] ?? null : null);

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (isDemo || submitting) return;
    setTriedSubmit(true);
    if (hasErrors) return;

    if (mode === "edit") {
      const changed = (Object.keys(core) as (keyof CoreState)[]).some(
        (k) => core[k] !== initialState[k],
      );
      if (!changed) {
        setNoop(true);
        return;
      }
    }

    setSubmitting(true);
    setErrorCode(null);
    setConflict(false);
    const nz = (s: string) => (s.trim() === "" ? null : s);

    const result =
      mode === "create"
        ? await createPlantTaxon({
            genus: core.genus,
            species: core.species,
            taxon_rank: core.taxon_rank,
            infraspecific_epithet: nz(core.infraspecific_epithet),
            is_hybrid: core.is_hybrid,
            author_citation: nz(core.author_citation),
            family: core.family,
            primary_common_name_tr: nz(core.primary_common_name_tr),
            reason: nz(reason),
          })
        : await updatePlantTaxon(initial!.id, {
            genus: core.genus,
            species: core.species,
            taxon_rank: core.taxon_rank,
            infraspecific_epithet: nz(core.infraspecific_epithet),
            is_hybrid: core.is_hybrid,
            author_citation: nz(core.author_citation),
            family: core.family,
            primary_common_name_tr: nz(core.primary_common_name_tr),
            status: core.status,
            expected_updated_at: initial!.updated_at,
            reason: reason,
          });
    setSubmitting(false);

    if (result.ok) {
      if (result.noop) {
        setNoop(true);
        return;
      }
      setSuccessId(result.entityId ?? initial?.id ?? null);
      return;
    }
    if (result.stale) setConflict(true);
    setErrorCode(result.errorCode);
  }

  if (successId) {
    return (
      <SuccessPanel
        mode={mode}
        href={`/aromaterapi/katalog/bitkiler/${successId}`}
        onCreateAnother={() => {
          setCore(fromInitial());
          setReason("");
          setSuccessId(null);
          setTriedSubmit(false);
        }}
      />
    );
  }

  const generalError = errorCode && !conflict ? writeError(errorCode) : null;

  return (
    <AromaterapiFormShell
      mode={mode}
      wide
      title={mode === "create" ? tp("newTitle") : tp("editTitle")}
      description={tp("description")}
      onSubmit={onSubmit}
      onCancel={() => router.back()}
      submitting={submitting}
      isDemo={isDemo}
      dirty={dirty}
      conflict={conflict}
      errorMessage={generalError}
      reason={
        <AromaterapiReasonField
          value={reason}
          onChange={(v) => {
            setReason(v);
            setNoop(false);
          }}
          required={mode === "edit"}
          error={err("reason")}
        />
      }
    >
      {noop ? (
        <AromaterapiMutationNotice tone="info">
          {tf("noop")}
        </AromaterapiMutationNotice>
      ) : null}

      <AromaterapiFormSection title={tf("identity")} hint={tp("identityHint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label={tp("genus")} value={core.genus} onChange={(v) => set("genus", v)} required error={err("genus")} disabled={isDemo} maxLength={120} placeholder={tp("genusPh")} />
          <TextField label={tp("species")} value={core.species} onChange={(v) => set("species", v)} required error={err("species")} disabled={isDemo} maxLength={120} placeholder={tp("speciesPh")} />
          <EnumSelect label={tp("rank")} value={core.taxon_rank} onChange={(v) => set("taxon_rank", v)} options={enumOptionsI18n(RANK_VALUES, TAXON_RANK_TR)} required error={err("taxon_rank")} disabled={isDemo} />
          <TextField label={tp("infra")} value={core.infraspecific_epithet} onChange={(v) => set("infraspecific_epithet", v)} disabled={isDemo} maxLength={120} hint={tp("infraHint")} />
          <TextField label={tp("family")} value={core.family} onChange={(v) => set("family", v)} required error={err("family")} disabled={isDemo} maxLength={120} placeholder={tp("familyPh")} />
          <TextField label={tp("commonName")} value={core.primary_common_name_tr} onChange={(v) => set("primary_common_name_tr", v)} disabled={isDemo} maxLength={160} placeholder={tp("commonNamePh")} />
        </div>
        <TextField label={tp("author")} value={core.author_citation} onChange={(v) => set("author_citation", v)} disabled={isDemo} maxLength={200} hint={tp("authorHint")} />
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-sm">
          <input
            type="checkbox"
            checked={core.is_hybrid}
            disabled={isDemo}
            onChange={(e) => set("is_hybrid", e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-300/50"
          />
          <span className="text-[13px] font-black text-slate-700">{tp("hybrid")}</span>
        </label>
        {(mode === "edit" ? initial?.canonical_name : null) ? (
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 px-3 py-2">
            <span className="block text-[11px] font-black uppercase tracking-wide text-teal-700">{tp("canonical")}</span>
            <span className="block text-[14px] font-black italic text-slate-800 [overflow-wrap:anywhere]">{initial!.canonical_name}</span>
          </div>
        ) : null}
      </AromaterapiFormSection>

      {mode === "edit" ? (
        <AromaterapiFormSection title={tf("status")} hint={tf("statusHint")}>
          <EnumSelect label={tf("recordStatus")} value={core.status} onChange={(v) => set("status", v)} options={enumOptionsI18n(statusValues(initialState.status), CATALOG_STATUS_TR)} required disabled={isDemo} allLabel={tf("choose")} />
        </AromaterapiFormSection>
      ) : null}
    </AromaterapiFormShell>
  );
}

function SuccessPanel({
  mode,
  href,
  onCreateAnother,
}: {
  mode: "create" | "edit";
  href: string;
  onCreateAnother: () => void;
}) {
  const tf = useTranslations("aromatherapy.catalog.form");
  const tp = useTranslations("aromatherapy.catalog.form.plant");
  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      <AromaterapiMutationNotice tone="success">
        {mode === "create" ? tp("created") : tp("updated")}
      </AromaterapiMutationNotice>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a href={href} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-[13px] font-black text-white shadow-md transition hover:brightness-105">
          {tp("open")}
        </a>
        {mode === "create" ? (
          <button type="button" onClick={onCreateAnother} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800">
            {tp("addAnother")}
          </button>
        ) : (
          <a href="/aromaterapi/katalog" className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800">
            {tf("backCatalog")}
          </a>
        )}
      </div>
    </div>
  );
}
