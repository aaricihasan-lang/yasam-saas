"use client";

import { useTranslations } from "next-intl";
import { useClaimWriteError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import { useEnumLabel, useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  AromaterapiFormSection,
  AromaterapiFormShell,
  AromaterapiMutationNotice,
  AromaterapiReasonField,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { EnumSelect, TextField } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { PreparationPicker } from "@/app/aromaterapi/_components/write/KnowledgeRecordPickers";
import { KnowledgeRecordChildEditors } from "@/app/aromaterapi/_components/write/KnowledgeRecordChildEditors";
import { useKnowledgeRecordForm, type FormMode } from "@/app/aromaterapi/_components/write/useKnowledgeRecordForm";
import type { KnowledgeRecordDetail } from "@/lib/aromaterapi/readTypes";
import {
  CLAIM_TYPES,
  CONCLUSION_PROVENANCES,
  EVIDENCE_LAYERS,
  RATIONALE_STATUSES,
  OUTCOME_TYPES,
  CLAIM_STATUSES,
  rationaleRequired,
  safetyTopicRequired,
} from "@/lib/aromaterapi/claimFormConfig";
import {
  CLAIM_TYPE_TR,
  CONCLUSION_PROVENANCE_TR,
  EVIDENCE_LAYER_TR,
  RATIONALE_STATUS_TR,
  OUTCOME_TYPE_TR,
  CLAIM_STATUS_TR,
  PREPARATION_TYPE_TR,
  } from "@/lib/aromaterapi/readLabels";

/**
 * Aromaterapi V2 — C3D-D Bilgi Kaydı oluşturma/düzenleme formu.
 * Mevcut C2S/C2T POST/PATCH motorunu tüketir. Kullanıcıya "claim" gösterilmez.
 * Preparat edit'te DEĞİŞMEZ (salt-okunur). status yalnız edit'te. Update reason zorunlu.
 */
export function KnowledgeRecordForm({
  mode,
  initial,
  isDemo,
}: {
  mode: FormMode;
  initial?: KnowledgeRecordDetail | null;
  isDemo: boolean;
}) {
  const enumLabel = useEnumLabel();
  const enumOptionsI18n = useEnumOptions();
  const router = useRouter();
  const t = useTranslations("aromatherapy.knowledge.form");
  const writeError = useClaimWriteError();
  const [successId, setSuccessId] = useState<string | null>(null);
  const [successWarnings, setSuccessWarnings] = useState<unknown[]>([]);

  const form = useKnowledgeRecordForm({
    mode,
    initial,
    isDemo,
    onCreated: (id, w) => { setSuccessId(id); setSuccessWarnings(w); },
    onUpdated: (id, w) => { setSuccessId(id); setSuccessWarnings(w); },
  });

  useAromaterapiDirtyGuard(form.dirty && !isDemo && successId === null);

  if (successId) {
    return (
      <SuccessPanel id={successId} mode={mode} warnings={successWarnings} />
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void form.submit();
  };

  const showErr = (k: string) => (form.triedSubmit ? form.fieldErrors[k] : undefined);
  const noop = form.result?.errorCode === "AROMA_NOOP";
  const generalError = form.result && !form.result.ok && !noop && !form.result.stale
    ? writeError(form.result.errorCode)
    : null;

  return (
    <AromaterapiFormShell
      mode={mode}
      title={mode === "create" ? t("newTitle") : t("editTitle")}
      description={
        mode === "create"
          ? t("newDescription")
          : t("editDescription")
      }
      onSubmit={onSubmit}
      onCancel={() => router.back()}
      submitting={form.submitting}
      isDemo={isDemo}
      dirty={form.dirty}
      conflict={form.result?.stale ?? false}
      errorMessage={generalError}
      submitLabel={mode === "create" ? t("submitCreate") : t("submitEdit")}
      reason={
        <AromaterapiReasonField
          value={form.reason}
          onChange={form.setReason}
          required={mode === "edit"}
          error={showErr("reason")}
        />
      }
    >
      {noop ? (
        <AromaterapiMutationNotice tone="info">
          {t("noop")}
        </AromaterapiMutationNotice>
      ) : null}

      <AromaterapiFormSection title={t("secConclusion")}>
        {mode === "create" ? (
          <PreparationPicker
            required
            disabled={isDemo}
            selected={form.core.preparation_id ? { id: form.core.preparation_id, label: form.core.preparation_label || t("selectedPrep") } : null}
            onSelect={(it) => {
              form.setCoreField("preparation_id", it.id);
              form.setCoreField("preparation_label", it.label);
            }}
            onClear={() => {
              form.setCoreField("preparation_id", "");
              form.setCoreField("preparation_label", "");
            }}
          />
        ) : (
          <div>
            <span className="block text-[12px] font-black uppercase tracking-wide text-slate-500">{t("preparation")}</span>
            <p className="mt-1 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-[14px] font-bold text-slate-700">
              {initial?.preparation ? enumLabel(PREPARATION_TYPE_TR, initial.preparation.preparation_type) : "—"}
              {initial?.preparation?.taxon_canonical_name ? (
                <span className="ml-1 text-[12px] font-semibold italic text-slate-400">
                  · {initial.preparation.taxon_canonical_name}
                </span>
              ) : null}
              <span className="ml-2 text-[11px] font-bold text-slate-400">{t("immutable")}</span>
            </p>
          </div>
        )}
        {form.triedSubmit && form.fieldErrors.preparation_id && mode === "create" ? (
          <p role="alert" className="text-[12px] font-bold text-rose-600">{form.fieldErrors.preparation_id}</p>
        ) : null}

        <EnumSelect
          label={t("claimType")}
          required
          disabled={isDemo}
          value={form.core.claim_type}
          error={showErr("claim_type")}
          options={enumOptionsI18n(CLAIM_TYPES, CLAIM_TYPE_TR)}
          onChange={(v) => form.setCoreField("claim_type", v)}
        />
        <TextField
          label={t("conclusion")}
          required
          multiline
          disabled={isDemo}
          value={form.core.conclusion}
          error={showErr("conclusion")}
          onChange={(v) => form.setCoreField("conclusion", v)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EnumSelect
            label={t("conclusionSource")}
            required
            disabled={isDemo}
            value={form.core.conclusion_provenance}
            error={showErr("conclusion_provenance")}
            options={enumOptionsI18n(CONCLUSION_PROVENANCES, CONCLUSION_PROVENANCE_TR)}
            onChange={(v) => form.setCoreField("conclusion_provenance", v)}
          />
          <EnumSelect
            label={t("evidenceLayer")}
            required
            disabled={isDemo}
            value={form.core.evidence_layer}
            error={showErr("evidence_layer")}
            options={enumOptionsI18n(EVIDENCE_LAYERS, EVIDENCE_LAYER_TR)}
            onChange={(v) => form.setCoreField("evidence_layer", v)}
          />
        </div>
        <EnumSelect
          label={t("rationaleStatus")}
          required
          disabled={isDemo}
          value={form.core.rationale_status}
          error={showErr("rationale_status")}
          options={enumOptionsI18n(RATIONALE_STATUSES, RATIONALE_STATUS_TR)}
          onChange={(v) => form.setCoreField("rationale_status", v)}
        />
        {rationaleRequired(form.core.rationale_status) ? (
          <TextField
            label={t("rationale")}
            required
            multiline
            disabled={isDemo}
            value={form.core.rationale}
            error={showErr("rationale")}
            onChange={(v) => form.setCoreField("rationale", v)}
          />
        ) : null}
        {safetyTopicRequired(form.core.claim_type) ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label={t("safetyTopic")}
              required
              mono
              disabled={isDemo}
              value={form.core.safety_topic}
              error={showErr("safety_topic")}
              placeholder={t("safetyTopicPh")}
              hint={t("safetyTopicHint")}
              onChange={(v) => form.setCoreField("safety_topic", v)}
            />
            <EnumSelect
              label={t("outcomeType")}
              required
              disabled={isDemo}
              value={form.core.outcome_type}
              error={showErr("outcome_type")}
              options={enumOptionsI18n(OUTCOME_TYPES, OUTCOME_TYPE_TR)}
              onChange={(v) => form.setCoreField("outcome_type", v)}
            />
          </div>
        ) : null}
        <TextField
          label={t("prepContext")}
          mono
          disabled={isDemo}
          value={form.core.preparation_context}
          error={showErr("preparation_context")}
          placeholder={t("prepContextPh")}
          hint={t("prepContextHint")}
          onChange={(v) => form.setCoreField("preparation_context", v)}
        />
        {mode === "edit" ? (
          <EnumSelect
            label={t("status")}
            disabled={isDemo}
            value={form.core.status}
            allLabel="—"
            options={enumOptionsI18n(CLAIM_STATUSES, CLAIM_STATUS_TR)}
            onChange={(v) => form.setCoreField("status", v)}
          />
        ) : null}
      </AromaterapiFormSection>

      <AromaterapiFormSection
        title={t("secEvidence")}
        hint={t("secEvidenceHint")}
      >
        <KnowledgeRecordChildEditors form={form} disabled={isDemo} />
      </AromaterapiFormSection>
    </AromaterapiFormShell>
  );
}

function SuccessPanel({ id, mode, warnings }: { id: string; mode: FormMode; warnings: unknown[] }) {
  const t = useTranslations("aromatherapy.knowledge.form");
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <AromaterapiMutationNotice tone="success">
        {mode === "create" ? t("created") : t("updated")}
      </AromaterapiMutationNotice>
      {Array.isArray(warnings) && warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
          <p className="text-[12px] font-black uppercase tracking-wide text-amber-700">{t("warnings")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] font-medium text-amber-800">
            {warnings.map((w, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">{typeof w === "string" ? w : JSON.stringify(w)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/aromaterapi/bilgi-kayitlari/${id}`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-[13px] font-black text-white shadow-md transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
        >
          {t("open")}
        </Link>
        <Link
          href="/aromaterapi/bilgi-kayitlari"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
        >
          {t("backList")}
        </Link>
      </div>
    </div>
  );
}
