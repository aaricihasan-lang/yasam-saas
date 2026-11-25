"use client";

import { useTranslations } from "next-intl";
import { useEnumOptions } from "@/lib/aromaterapi/useEnumLabel";
import { AromaterapiFormSection } from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { EnumSelect, TextField } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { MATERIAL_STATE_TR } from "@/lib/aromaterapi/readLabels";
import {
  MethodStepsEditor,
  type MethodContentState,
  type StepDraft,
} from "@/app/aromaterapi/katalog/_components/MethodStepsEditor";

/**
 * C3D-B2B — Üretim/Elde Ediliş yöntemi İÇERİK bölümleri (seri oluşturma + yeni revizyon ortak).
 * Progressive disclosure: kritik alan (Ana Yöntem Metni) her zaman görünür; ayrıntılar
 * mantıklı bölümlerde gruplanır. Masaüstünde 2 kolon, mobilde tek kolon.
 */

const MATERIAL_STATE_VALUES = ["fresh", "dried", "other"];

export function MethodContentSections({
  content,
  setField,
  steps,
  setSteps,
  disabled = false,
  methodTextError,
}: {
  content: MethodContentState;
  setField: (k: keyof MethodContentState, v: string) => void;
  steps: StepDraft[];
  setSteps: (next: StepDraft[]) => void;
  disabled?: boolean;
  methodTextError?: string | null;
}) {
  const enumOptionsI18n = useEnumOptions();
  const t = useTranslations("aromatherapy.catalog.methodForm.content");
  return (
    <>
      <AromaterapiFormSection title={t("summary")} hint={t("summaryHint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label={t("plantPartUsed")} value={content.plant_part_used} onChange={(v) => setField("plant_part_used", v)} disabled={disabled} maxLength={160} placeholder={t("plantPartUsedPh")} />
          <EnumSelect label={t("materialState")} value={content.material_state} onChange={(v) => setField("material_state", v)} options={enumOptionsI18n(MATERIAL_STATE_VALUES, MATERIAL_STATE_TR)} disabled={disabled} allLabel={t("notSpecified")} />
        </div>
        <TextField label={t("methodText")} value={content.method_text} onChange={(v) => setField("method_text", v)} required error={methodTextError} disabled={disabled} multiline rows={5} maxLength={8000} hint={t("methodTextHint")} />
      </AromaterapiFormSection>

      <AromaterapiFormSection title={t("details")} hint={t("detailsHint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label={t("equipment")} value={content.equipment} onChange={(v) => setField("equipment", v)} disabled={disabled} maxLength={500} placeholder={t("equipmentPh")} />
          <TextField label={t("amountRatio")} value={content.amount_ratio} onChange={(v) => setField("amount_ratio", v)} disabled={disabled} maxLength={500} placeholder={t("amountRatioPh")} />
          <TextField label={t("solventCarrier")} value={content.solvent_carrier} onChange={(v) => setField("solvent_carrier", v)} disabled={disabled} maxLength={500} placeholder={t("solventCarrierPh")} />
          <TextField label={t("duration")} value={content.duration_text} onChange={(v) => setField("duration_text", v)} disabled={disabled} maxLength={500} placeholder={t("durationPh")} />
          <TextField label={t("temperature")} value={content.temperature_text} onChange={(v) => setField("temperature_text", v)} disabled={disabled} maxLength={500} placeholder={t("temperaturePh")} />
        </div>
      </AromaterapiFormSection>

      <AromaterapiFormSection title={t("steps")} hint={t("stepsHint")}>
        <MethodStepsEditor steps={steps} onChange={setSteps} disabled={disabled} />
      </AromaterapiFormSection>

      <AromaterapiFormSection title={t("storageQuality")} hint={t("storageQualityHint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label={t("filtration")} value={content.filtration} onChange={(v) => setField("filtration", v)} disabled={disabled} maxLength={500} />
          <TextField label={t("resting")} value={content.resting} onChange={(v) => setField("resting", v)} disabled={disabled} maxLength={500} />
          <TextField label={t("storage")} value={content.storage} onChange={(v) => setField("storage", v)} disabled={disabled} maxLength={500} placeholder={t("storagePh")} />
        </div>
        <TextField label={t("qualityNotes")} value={content.quality_notes} onChange={(v) => setField("quality_notes", v)} disabled={disabled} multiline rows={3} maxLength={4000} />
      </AromaterapiFormSection>

      <AromaterapiFormSection title={t("safety")} hint={t("safetyHint")}>
        <TextField label={t("safetyNotes")} value={content.safety_notes} onChange={(v) => setField("safety_notes", v)} disabled={disabled} multiline rows={3} maxLength={4000} />
      </AromaterapiFormSection>
    </>
  );
}
