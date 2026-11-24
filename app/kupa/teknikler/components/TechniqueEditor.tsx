"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useKupaErrorText } from "@/app/kupa/lib/errorText";
import { useCuppingVocab } from "@/app/kupa/lib/useCuppingVocab";
import { kupaBtnGhost, kupaBtnSuccess, kupaInput } from "../../components/KupaShell";
import { BigNoteEditorDialog } from "../../components/BigNoteEditorDialog";
import { KupaConfirmDialog } from "../../components/ConfirmDialog";
import { normalizeMasterName } from "../../protokoller/components/QuickCreateMasterForm";
import { createTechnique, updateTechnique, type CuppingTechnique } from "../../lib/api";
import { MOVEMENT_OPTIONS, TYPE_OPTIONS } from "../lib/labels";
import { useReportDirty } from "../../protokoller/hooks/protocolDirty";

/**
 * Teknik oluşturma/düzenleme formu (FAZ 4 / 2B) — /yeni ve reader edit modu paylaşır.
 *
 * Alanlar: name (zorunlu), technique_type, movement_style, description ("Bu teknik nedir?"),
 * application_info ("Genel Uygulama Yaklaşımı" — description'dan AYRI), safety_note,
 * practitioner_note ("Uzman Notum"), is_active. GÖNDERİLMEZ: kind / source_note / sort_order.
 * PATCH yalnız bu form alanlarını yollar → legacy kind/source_note DEĞİŞMEZ (null'lanmaz).
 */

const fieldLabel = "block text-[12px] font-semibold text-slate-600";

export function TechniqueEditor({
  initial,
  existing,
  onSaved,
  onCancel,
}: {
  initial?: CuppingTechnique;
  /** Create modunda advisory duplicate için mevcut teknik adları. */
  existing?: { id: string; label: string }[];
  onSaved: (t: CuppingTechnique) => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const t = useTranslations("cupping.techniques");
  const tc = useTranslations("cupping.common");
  const errText = useKupaErrorText();
  const vocab = useCuppingVocab();
  const [techniqueType, setTechniqueType] = useState(initial?.technique_type ?? "");
  const [movementStyle, setMovementStyle] = useState(initial?.movement_style ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [applicationInfo, setApplicationInfo] = useState(initial?.application_info ?? "");
  const [safetyNote, setSafetyNote] = useState(initial?.safety_note ?? "");
  const [practitionerNote, setPractitionerNote] = useState(initial?.practitioner_note ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== (initial?.name ?? "") ||
    techniqueType !== (initial?.technique_type ?? "") ||
    movementStyle !== (initial?.movement_style ?? "") ||
    description !== (initial?.description ?? "") ||
    applicationInfo !== (initial?.application_info ?? "") ||
    safetyNote !== (initial?.safety_note ?? "") ||
    practitionerNote !== (initial?.practitioner_note ?? "") ||
    isActive !== (initial?.is_active ?? true);
  // FINAL-A1: sayfa geneli çıkış koruması (KupaUnsavedGuardScope; link / geri / yenileme).
  useReportDirty("technique-editor", dirty);

  const normName = normalizeMasterName(name);
  const duplicate = useMemo(
    () => (!isEdit && normName ? existing?.find((e) => normalizeMasterName(e.label) === normName) ?? null : null),
    [isEdit, normName, existing],
  );

  // Kirli editörde "Vazgeç": native window.confirm YERİNE Kupa app-standart modal
  // (KupaConfirmDialog). Temizken doğrudan onCancel() — modal açılmaz.
  const cancel = () => {
    if (dirty) {
      setConfirmCancelOpen(true);
      return;
    }
    onCancel();
  };

  const save = async () => {
    if (!name.trim()) {
      setError(t("editor.nameRequired"));
      return;
    }
    setError(null);
    setBusy(true);
    const payload = {
      name: name.trim(),
      technique_type: techniqueType || null,
      movement_style: movementStyle || null,
      description: description.trim() || null,
      application_info: applicationInfo.trim() || null,
      safety_note: safetyNote.trim() || null,
      practitioner_note: practitionerNote.trim() || null,
      is_active: isActive,
    };
    try {
      const saved = isEdit
        ? await updateTechnique(initial.id, payload)
        : await createTechnique(payload);
      onSaved(saved);
    } catch (e) {
      setError(errText(e, tc("saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black tracking-tight text-slate-900">
          {isEdit ? t("editor.editTitle") : t("page.newTitle")}
        </h2>
      </div>

      <label className="block">
        <span className={fieldLabel}>{t("editor.nameLabel")}</span>
        <input
          autoFocus
          className={`mt-1 ${kupaInput}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("editor.namePlaceholder")}
          aria-label={t("editor.nameAria")}
        />
      </label>

      {duplicate ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[13px] text-amber-800">
            {t("editor.duplicatePrefix")} <b>{duplicate.label}</b>
          </p>
          <p className="mt-1 text-[12px] text-amber-700">
            {t("editor.duplicateHint")}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabel}>{t("editor.typeLabel")}</span>
          <select
            className={`mt-1 ${kupaInput}`}
            value={techniqueType}
            onChange={(e) => setTechniqueType(e.target.value)}
            aria-label={t("editor.typeLabel")}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{vocab.techniqueType(o.value || null)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={fieldLabel}>{t("editor.movementLabel")}</span>
          <select
            className={`mt-1 ${kupaInput}`}
            value={movementStyle}
            onChange={(e) => setMovementStyle(e.target.value)}
            aria-label={t("editor.movementAria")}
          >
            {MOVEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{vocab.movementStyle(o.value || null)}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={fieldLabel}>{t("fields.summary")}</span>
        <textarea
          className={`mt-1 ${kupaInput}`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("editor.summaryPlaceholder")}
          aria-label={t("editor.summaryAria")}
        />
      </label>

      <label className="block">
        <span className={fieldLabel}>{t("fields.approach")}</span>
        <textarea
          className={`mt-1 ${kupaInput}`}
          rows={3}
          value={applicationInfo}
          onChange={(e) => setApplicationInfo(e.target.value)}
          placeholder={t("editor.approachPlaceholder")}
          aria-label={t("editor.approachAria")}
        />
      </label>

      <label className="block">
        <span className={fieldLabel}>{t("editor.safetyLabel")}</span>
        <textarea
          className={`mt-1 ${kupaInput}`}
          rows={2}
          value={safetyNote}
          onChange={(e) => setSafetyNote(e.target.value)}
          placeholder={t("editor.safetyPlaceholder")}
          aria-label={t("editor.safetyAria")}
        />
      </label>

      <div>
        <span className={fieldLabel}>{t("fields.practitionerNote")}</span>
        <div className="mt-1 rounded-xl border border-slate-200 bg-white p-3">
          {practitionerNote.trim() ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{practitionerNote}</p>
          ) : (
            <p className="text-[13px] text-slate-400">{t("editor.noteHint")}</p>
          )}
          <button type="button" className={`mt-2 ${kupaBtnGhost}`} onClick={() => setNoteEditorOpen(true)}>
            {practitionerNote.trim() ? t("editor.noteEdit") : t("editor.noteAdd")}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          aria-label={tc("active")}
        />
        <span className="text-[13px] font-semibold text-slate-600">{tc("active")}</span>
      </label>

      {error ? <p className="text-[13px] font-medium text-rose-600">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" className={kupaBtnGhost} onClick={cancel} disabled={busy}>
          {tc("cancel")}
        </button>
        <button type="button" className={kupaBtnSuccess} onClick={save} disabled={busy}>
          {isEdit ? tc("save") : t("editor.create")}
        </button>
      </div>

      <BigNoteEditorDialog
        open={noteEditorOpen}
        title={t("fields.practitionerNote")}
        value={practitionerNote}
        placeholder={t("editor.notePlaceholder")}
        onSave={(text) => {
          setPractitionerNote(text);
          setNoteEditorOpen(false);
        }}
        onCancel={() => setNoteEditorOpen(false)}
      />

      <KupaConfirmDialog
        open={confirmCancelOpen}
        title={t("editor.discardTitle")}
        description={t("editor.discardBody")}
        confirmLabel={t("editor.discardConfirm")}
        cancelLabel={t("editor.discardCancel")}
        onConfirm={() => {
          setConfirmCancelOpen(false);
          onCancel();
        }}
        onClose={() => setConfirmCancelOpen(false)}
      />
    </div>
  );
}
