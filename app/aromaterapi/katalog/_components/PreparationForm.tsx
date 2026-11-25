"use client";

import { useTranslations } from "next-intl";
import { useCatalogWriteError } from "@/lib/aromaterapi/useAromaterapiModuleText";
import { useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AromaterapiFormSection,
  AromaterapiFormShell,
  AromaterapiMutationNotice,
  AromaterapiReasonField,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { EnumSelect, TextField } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { EntitySearchPicker, type PickerItem } from "@/app/aromaterapi/_components/write/EntitySearchPicker";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { createPreparation, updatePreparation } from "@/lib/aromaterapi/catalogWrite";
import { fetchPlantTaxaList } from "@/lib/aromaterapi/catalogData";
import { fetchMethodSeriesList } from "@/lib/aromaterapi/methodData";
import { CATALOG_STATUS_TR, PREPARATION_TYPE_TR } from "@/lib/aromaterapi/readLabels";
import type { PlantTaxonListItem, PreparationDetail } from "@/lib/aromaterapi/readTypes";

/**
 * C3D-B2B — Preparat oluştur/düzenle formu (full-width).
 *
 * Bir preparata üretim yöntemi eklendiyse temel kimlik alanları (bitki/tür/kısım/kemotip)
 * artık değiştirilemez: UI bunu ÖNCEDEN kilitli sunar (backend 409 identity-lock'a ek
 * savunma). Status ve gerekçe her zaman düzenlenebilir. Bilimsel ad picker'ı tenant-scoped
 * C3C read API'sini tüketir.
 */

const PREP_TYPE_VALUES = Object.keys(PREPARATION_TYPE_TR);

type CoreState = {
  taxon_id: string;
  preparation_type: string;
  plant_part: string;
  chemotype: string;
  status: string;
};

function fromInitial(initial?: PreparationDetail): CoreState {
  return {
    taxon_id: initial?.taxon_id ?? "",
    preparation_type: initial?.preparation_type ?? "",
    plant_part: initial?.plant_part ?? "",
    chemotype: initial?.chemotype ?? "",
    status: initial?.status ?? "draft",
  };
}

function statusValues(current: string): string[] {
  const allowed =
    current === "draft"
      ? ["draft", "verified"]
      : current === "verified"
        ? ["verified", "approved"]
        : ["approved"];
  return allowed;
}

export function PreparationForm({
  mode,
  initial,
  isDemo,
}: {
  mode: "create" | "edit";
  initial?: PreparationDetail;
  isDemo: boolean;
}) {
  const enumOptionsI18n = useEnumOptions();
  const tf = useTranslations("aromatherapy.catalog.form");
  const tp = useTranslations("aromatherapy.catalog.form.prep");
  const writeError = useCatalogWriteError();
  const router = useRouter();
  const [core, setCore] = useState<CoreState>(() => fromInitial(initial));
  const [taxonItem, setTaxonItem] = useState<PickerItem | null>(
    initial?.taxon
      ? { id: initial.taxon.id, label: initial.taxon.canonical_name, sublabel: initial.taxon.family }
      : null,
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [noop, setNoop] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [hasMethods, setHasMethods] = useState(false);

  // Edit: yöntem serisi var mı? → kimlik alanlarını önceden kilitle.
  useEffect(() => {
    if (mode !== "edit" || !initial) return;
    const controller = new AbortController();
    fetchMethodSeriesList(initial.id, controller.signal).then((r) => {
      if (controller.signal.aborted) return;
      if (r.ok && Array.isArray(r.data)) setHasMethods(r.data.length > 0);
    });
    return () => controller.abort();
  }, [mode, initial]);

  const identityLocked = mode === "edit" && hasMethods;

  const set = <K extends keyof CoreState>(k: K, v: CoreState[K]) => {
    setCore((c) => ({ ...c, [k]: v }));
    setNoop(false);
    setConflict(false);
    setErrorCode(null);
  };

  const initialState = useMemo(() => fromInitial(initial), [initial]);
  const dirty = useMemo(() => {
    if (mode === "create") {
      return core.taxon_id !== "" || core.preparation_type !== "" || core.plant_part.trim() !== "";
    }
    return (Object.keys(core) as (keyof CoreState)[]).some((k) => core[k] !== initialState[k]);
  }, [core, initialState, mode]);

  useAromaterapiDirtyGuard(dirty && !isDemo && successId === null);

  const fieldErrors = useMemo(() => {
    const e: Partial<Record<string, string>> = {};
    if (core.taxon_id === "") e.taxon_id = tp("taxonRequired");
    if (core.preparation_type === "") e.preparation_type = tp("typeRequired");
    if (core.plant_part.trim() === "") e.plant_part = tp("partRequired");
    if (mode === "edit" && reason.trim() === "") e.reason = tf("reasonRequired");
    return e;
  }, [core, reason, mode, tf, tp]);

  const hasErrors = Object.keys(fieldErrors).length > 0;
  const err = (k: string) => (triedSubmit ? fieldErrors[k] ?? null : null);

  function selectTaxon(item: PickerItem) {
    setTaxonItem(item);
    set("taxon_id", item.id);
  }
  function clearTaxon() {
    setTaxonItem(null);
    set("taxon_id", "");
  }

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
        ? await createPreparation({
            taxon_id: core.taxon_id,
            preparation_type: core.preparation_type,
            plant_part: core.plant_part,
            chemotype: nz(core.chemotype),
            reason: nz(reason),
          })
        : await updatePreparation(initial!.id, {
            taxon_id: core.taxon_id,
            preparation_type: core.preparation_type,
            plant_part: core.plant_part,
            chemotype: nz(core.chemotype),
            status: core.status,
            expected_updated_at: initial!.updated_at,
            reason,
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
        href={`/aromaterapi/katalog/preparatlar/${successId}`}
        onCreateAnother={() => {
          setCore(fromInitial());
          setTaxonItem(null);
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

      {identityLocked ? (
        <AromaterapiMutationNotice tone="warning">
          {tp("locked")}
        </AromaterapiMutationNotice>
      ) : null}

      <AromaterapiFormSection title={tf("identity")} hint={tp("identityHint")}>
        {identityLocked ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <span className="block text-[11px] font-black uppercase tracking-wide text-slate-400">{tp("plant")}</span>
            <span className="block text-[14px] font-black italic text-slate-800 [overflow-wrap:anywhere]">
              {taxonItem?.label ?? initial?.taxon_canonical_name ?? "—"}
            </span>
          </div>
        ) : (
          <EntitySearchPicker<PlantTaxonListItem>
            label={tp("plantPicker")}
            placeholder={tp("plantPickerPh")}
            selected={taxonItem}
            onSelect={selectTaxon}
            onClear={clearTaxon}
            search={fetchPlantTaxaList}
            toItem={(row) => ({ id: row.id, label: row.canonical_name, sublabel: row.family })}
            required
            disabled={isDemo}
          />
        )}
        {!identityLocked && triedSubmit && err("taxon_id") ? (
          <p role="alert" className="text-[12px] font-bold text-rose-600">{err("taxon_id")}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EnumSelect label={tp("type")} value={core.preparation_type} onChange={(v) => set("preparation_type", v)} options={enumOptionsI18n(PREP_TYPE_VALUES, PREPARATION_TYPE_TR)} required error={err("preparation_type")} disabled={isDemo || identityLocked} />
          <TextField label={tp("part")} value={core.plant_part} onChange={(v) => set("plant_part", v)} required error={err("plant_part")} disabled={isDemo || identityLocked} maxLength={120} placeholder={tp("partPh")} />
          <TextField label={tp("chemotype")} value={core.chemotype} onChange={(v) => set("chemotype", v)} disabled={isDemo || identityLocked} maxLength={120} hint={tp("chemotypeHint")} />
        </div>
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
  const tp = useTranslations("aromatherapy.catalog.form.prep");
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
          <a href="/aromaterapi/katalog?tab=preparatlar" className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800">
            {tf("backCatalog")}
          </a>
        )}
      </div>
    </div>
  );
}
