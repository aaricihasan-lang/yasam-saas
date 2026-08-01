"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  AromaterapiFormSection,
  AromaterapiFormShell,
  AromaterapiMutationNotice,
  AromaterapiReasonField,
} from "@/app/aromaterapi/_components/write/AromaterapiFormShell";
import { EnumSelect, enumOptions } from "@/app/aromaterapi/_components/write/KnowledgeRecordFields";
import { EntitySearchPicker, type PickerItem } from "@/app/aromaterapi/_components/write/EntitySearchPicker";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import {
  MethodContentSections,
} from "@/app/aromaterapi/katalog/_components/MethodContentSections";
import {
  emptyMethodContent,
  toStepsBody,
  type MethodContentState,
  type StepDraft,
} from "@/app/aromaterapi/katalog/_components/MethodStepsEditor";
import { createMethodSeries } from "@/lib/aromaterapi/methodWrite";
import { writeMessageForCode } from "@/lib/aromaterapi/catalogWrite";
import { fetchSourceList, fetchSourcePassageList } from "@/lib/aromaterapi/sourceData";
import { METHOD_KIND_TR } from "@/lib/aromaterapi/readLabels";
import type { ListResult } from "@/lib/aromaterapi/readClient";
import type { PassageListItem, SourceListItem } from "@/lib/aromaterapi/readTypes";

/**
 * C3D-B2B — Yeni Üretim/Elde Ediliş Yöntemi (seri + ilk revizyon, atomik draft).
 *
 * Seri kimliği immutable: method_kind/kaynak/pasaj/dil sonradan değişemez (içerik değişimi
 * "yeni revizyon"). "Kaynağa Sadık Yöntem" için kaynak zorunlu, pasaj opsiyonel ve yalnız
 * seçilen kaynağa göre filtrelenir; kaynak değişince uyumsuz pasaj temizlenir. Editoryal/
 * Uzman yönteminde kaynak/pasaj gösterilmez.
 */

const KIND_OPTIONS = enumOptions(["faithful_source", "editorial", "expert"], METHOD_KIND_TR);
const LANG_OPTIONS = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "İngilizce" },
  { value: "la", label: "Latince" },
  { value: "fr", label: "Fransızca" },
  { value: "de", label: "Almanca" },
  { value: "ar", label: "Arapça" },
  { value: "el", label: "Yunanca" },
];

export function MethodSeriesForm({
  preparationId,
  isDemo,
}: {
  preparationId: string;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [methodKind, setMethodKind] = useState("");
  const [methodLang, setMethodLang] = useState("tr");
  const [sourceItem, setSourceItem] = useState<PickerItem | null>(null);
  const [passageItem, setPassageItem] = useState<PickerItem | null>(null);
  const [content, setContent] = useState<MethodContentState>(emptyMethodContent);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successSeriesId, setSuccessSeriesId] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const isFaithful = methodKind === "faithful_source";

  const setField = (k: keyof MethodContentState, v: string) => {
    setContent((c) => ({ ...c, [k]: v }));
    setErrorCode(null);
  };

  const dirty =
    methodKind !== "" || content.method_text.trim() !== "" || steps.some((s) => s.text.trim() !== "");
  useAromaterapiDirtyGuard(dirty && !isDemo && successSeriesId === null);

  const methodKindError = triedSubmit && methodKind === "" ? "Yöntem türü zorunludur." : null;
  const methodTextError = triedSubmit && content.method_text.trim() === "" ? "Ana yöntem metni zorunludur." : null;
  const sourceError = triedSubmit && isFaithful && !sourceItem ? "Kaynağa Sadık Yöntem için kaynak seçin." : null;

  // Pasaj araması yalnız seçili kaynağa göre.
  const passageSearch = useCallback(
    (params: URLSearchParams, signal: AbortSignal): Promise<ListResult<PassageListItem>> =>
      sourceItem
        ? fetchSourcePassageList(sourceItem.id, params, signal)
        : Promise.resolve({ ok: true, envelope: { rows: [], page: 1, limit: 20, total: 0 }, errorCode: null }),
    [sourceItem],
  );

  const onKindChange = (v: string) => {
    setMethodKind(v);
    setErrorCode(null);
    if (v !== "faithful_source") {
      setSourceItem(null);
      setPassageItem(null);
    }
  };

  const hasErrors = useMemo(
    () => methodKind === "" || content.method_text.trim() === "" || (isFaithful && !sourceItem),
    [methodKind, content.method_text, isFaithful, sourceItem],
  );

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (isDemo || submitting) return;
    setTriedSubmit(true);
    if (hasErrors) return;

    setSubmitting(true);
    setErrorCode(null);
    const nz = (s: string) => (s.trim() === "" ? null : s);

    const result = await createMethodSeries(preparationId, {
      method_kind: methodKind,
      method_lang: methodLang,
      source_id: isFaithful ? sourceItem?.id ?? null : null,
      passage_id: isFaithful && sourceItem ? passageItem?.id ?? null : null,
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
      reason: nz(reason),
    });
    setSubmitting(false);

    if (result.ok) {
      setSuccessSeriesId(result.seriesId ?? result.entityId ?? null);
      return;
    }
    setErrorCode(result.errorCode);
  }

  if (successSeriesId) {
    const base = `/aromaterapi/katalog/preparatlar/${preparationId}`;
    return (
      <div className="mx-auto w-full max-w-4xl space-y-3">
        <AromaterapiMutationNotice tone="success">
          Üretim yöntemi oluşturuldu (ilk revizyon taslak olarak eklendi).
        </AromaterapiMutationNotice>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a href={`${base}/yontemler/${successSeriesId}`} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 text-[13px] font-black text-white shadow-md transition hover:brightness-105">
            Yöntemi aç →
          </a>
          <a href={base} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800">
            Preparata dön
          </a>
        </div>
      </div>
    );
  }

  const generalError = errorCode ? writeMessageForCode(errorCode) : null;

  return (
    <AromaterapiFormShell
      mode="create"
      wide
      title="Yeni Üretim Yöntemi"
      description="Yöntem türü ve dili seçildikten sonra değiştirilemez; içerik değişiklikleri yeni revizyon olarak eklenir."
      onSubmit={onSubmit}
      onCancel={() => router.back()}
      submitting={submitting}
      isDemo={isDemo}
      dirty={dirty}
      errorMessage={generalError}
      reason={
        <AromaterapiReasonField value={reason} onChange={setReason} required={false} />
      }
    >
      <AromaterapiFormSection title="Yöntem Türü ve Bağlam" hint="Bu seçimler seri kimliğidir ve sonradan değiştirilemez.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <EnumSelect label="Yöntem Türü" value={methodKind} onChange={onKindChange} options={KIND_OPTIONS} required error={methodKindError} disabled={isDemo} />
          <EnumSelect label="Yöntem Dili" value={methodLang} onChange={setMethodLang} options={LANG_OPTIONS} required disabled={isDemo} allLabel="Seçin…" />
        </div>
        {isFaithful ? (
          <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
            <p className="text-[12px] font-bold text-teal-800">
              Kaynağa Sadık Yöntem: yöntem birebir bir kaynağa dayanır. Kaynak zorunludur; pasaj isteğe bağlıdır ve yalnız seçilen kaynağa göre listelenir.
            </p>
            <EntitySearchPicker<SourceListItem>
              label="Kaynak"
              placeholder="Kaynak başlığı ara…"
              selected={sourceItem}
              onSelect={(it) => {
                setSourceItem(it);
                setPassageItem(null);
                setErrorCode(null);
              }}
              onClear={() => {
                setSourceItem(null);
                setPassageItem(null);
              }}
              search={fetchSourceList}
              toItem={(row) => ({ id: row.id, label: row.title, sublabel: undefined })}
              required
              disabled={isDemo}
            />
            {sourceError ? <p role="alert" className="text-[12px] font-bold text-rose-600">{sourceError}</p> : null}
            {sourceItem ? (
              <EntitySearchPicker<PassageListItem>
                label="Pasaj (opsiyonel)"
                placeholder="Pasaj konumu ara…"
                selected={passageItem}
                onSelect={(it) => setPassageItem(it)}
                onClear={() => setPassageItem(null)}
                search={passageSearch}
                toItem={(row) => ({ id: row.id, label: row.locator_label })}
                disabled={isDemo}
              />
            ) : null}
          </div>
        ) : methodKind ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-[12px] font-medium text-slate-500">
            {methodKind === "editorial" ? "Editoryal" : "Uzman"} yöntemi doğrudan bir kaynağa bağlı değildir; kaynak/pasaj seçimi gerekmez.
          </p>
        ) : null}
      </AromaterapiFormSection>

      <MethodContentSections
        content={content}
        setField={setField}
        steps={steps}
        setSteps={setSteps}
        disabled={isDemo}
        methodTextError={methodTextError}
      />
    </AromaterapiFormShell>
  );
}
