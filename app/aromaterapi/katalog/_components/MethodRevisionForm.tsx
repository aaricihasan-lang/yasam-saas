"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  AromaterapiFormShell,
  AromaterapiMutationNotice,
  AromaterapiReasonField,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { MethodContentSections } from "@/app/aromaterapi/katalog/_components/MethodContentSections";
import {
  toStepsBody,
  type MethodContentState,
  type StepDraft,
} from "@/app/aromaterapi/katalog/_components/MethodStepsEditor";
import { appendMethodRevision } from "@/lib/aromaterapi/methodWrite";
import { writeMessageForCode } from "@/lib/aromaterapi/catalogWrite";
import type { MethodRevisionDetail } from "@/lib/aromaterapi/readTypes";

/**
 * C3D-B2B — Yeni immutable revizyon (append-only). Mevcut en güncel revizyondan ön-doldurulur;
 * kullanıcı düzenler. reason zorunlu; expected_latest_revision optimistic concurrency içindir
 * (araya yeni revizyon girdiyse 409). İçerik son revizyonla birebir aynıysa server kontrollü
 * no-op döner (yeni revizyon üretilmez).
 */

function contentFrom(base: MethodRevisionDetail): MethodContentState {
  return {
    plant_part_used: base.plant_part_used ?? "",
    material_state: base.material_state ?? "",
    method_text: base.method_text,
    equipment: base.equipment ?? "",
    amount_ratio: base.amount_ratio ?? "",
    solvent_carrier: base.solvent_carrier ?? "",
    duration_text: base.duration_text ?? "",
    temperature_text: base.temperature_text ?? "",
    filtration: base.filtration ?? "",
    resting: base.resting ?? "",
    storage: base.storage ?? "",
    quality_notes: base.quality_notes ?? "",
    safety_notes: base.safety_notes ?? "",
  };
}

function stepsFrom(base: MethodRevisionDetail): StepDraft[] {
  return (base.steps ?? []).map((s, i) => ({ key: i + 1, text: s.text }));
}

export function MethodRevisionForm({
  seriesId,
  preparationId,
  expectedLatestRevision,
  base,
  isDemo,
}: {
  seriesId: string;
  preparationId: string;
  expectedLatestRevision: number;
  base: MethodRevisionDetail;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState<MethodContentState>(() => contentFrom(base));
  const [steps, setSteps] = useState<StepDraft[]>(() => stepsFrom(base));
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [noop, setNoop] = useState(false);
  const [done, setDone] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const setField = (k: keyof MethodContentState, v: string) => {
    setContent((c) => ({ ...c, [k]: v }));
    setTouched(true);
    setNoop(false);
    setConflict(false);
    setErrorCode(null);
  };
  const updateSteps = (next: StepDraft[]) => {
    setSteps(next);
    setTouched(true);
    setNoop(false);
  };

  useAromaterapiDirtyGuard(touched && !isDemo && !done);

  const methodTextError = triedSubmit && content.method_text.trim() === "" ? "Ana yöntem metni zorunludur." : null;
  const reasonError = triedSubmit && reason.trim() === "" ? "Gerekçe zorunludur." : null;
  const hasErrors = useMemo(
    () => content.method_text.trim() === "" || reason.trim() === "",
    [content.method_text, reason],
  );

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (isDemo || submitting) return;
    setTriedSubmit(true);
    if (hasErrors) return;

    setSubmitting(true);
    setErrorCode(null);
    setConflict(false);
    const nz = (s: string) => (s.trim() === "" ? null : s);

    const result = await appendMethodRevision(seriesId, {
      plant_part_used: nz(content.plant_part_used),
      material_state: nz(content.material_state),
      method_text: content.method_text,
      equipment: nz(content.equipment),
      amount_ratio: nz(content.amount_ratio),
      solvent_carrier: nz(content.solvent_carrier),
      duration_text: nz(content.duration_text),
      temperature_text: nz(content.temperature_text),
      steps: toStepsBody(steps),
      filtration: nz(content.filtration),
      resting: nz(content.resting),
      storage: nz(content.storage),
      quality_notes: nz(content.quality_notes),
      safety_notes: nz(content.safety_notes),
      expected_latest_revision: expectedLatestRevision,
      reason,
    });
    setSubmitting(false);

    if (result.ok) {
      if (result.noop) {
        setNoop(true);
        return;
      }
      setDone(true);
      return;
    }
    if (result.stale) setConflict(true);
    setErrorCode(result.errorCode);
  }

  if (done) {
    const seriesHref = `/aromaterapi/katalog/preparatlar/${preparationId}/yontemler/${seriesId}`;
    return (
      <div className="mx-auto w-full max-w-4xl space-y-3">
        <AromaterapiMutationNotice tone="success">Yeni revizyon eklendi.</AromaterapiMutationNotice>
        <a href={seriesHref} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-[13px] font-black text-white shadow-md transition hover:brightness-105">
          Yönteme dön →
        </a>
      </div>
    );
  }

  const generalError = errorCode && !conflict ? writeMessageForCode(errorCode) : null;

  return (
    <AromaterapiFormShell
      mode="edit"
      wide
      title="Yeni Revizyon"
      description={`Bu yöntemin ${expectedLatestRevision}. revizyonundan yola çıkıyorsunuz. Değişiklikler yeni bir revizyon olarak eklenir; önceki revizyonlar değişmez.`}
      onSubmit={onSubmit}
      onCancel={() => router.back()}
      submitting={submitting}
      isDemo={isDemo}
      dirty={touched}
      conflict={conflict}
      errorMessage={generalError}
      submitLabel="Yeni revizyon oluştur"
      reason={
        <AromaterapiReasonField value={reason} onChange={(v) => { setReason(v); setNoop(false); }} required error={reasonError} />
      }
    >
      {noop ? (
        <AromaterapiMutationNotice tone="info">
          İçerik son revizyonla birebir aynı; yeni revizyon oluşturulmadı. Bir değişiklik yapıp tekrar deneyin.
        </AromaterapiMutationNotice>
      ) : null}
      <MethodContentSections
        content={content}
        setField={setField}
        steps={steps}
        setSteps={updateSteps}
        disabled={isDemo}
        methodTextError={methodTextError}
      />
    </AromaterapiFormShell>
  );
}
