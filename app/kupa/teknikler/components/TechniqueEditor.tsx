"use client";

import { useMemo, useState } from "react";
import { kupaBtnGhost, kupaBtnSuccess, kupaInput } from "../../components/KupaShell";
import { BigNoteEditorDialog } from "../../components/BigNoteEditorDialog";
import { normalizeMasterName } from "../../protokoller/components/QuickCreateMasterForm";
import { createTechnique, updateTechnique, type CuppingTechnique } from "../../lib/api";
import { MOVEMENT_OPTIONS, TYPE_OPTIONS } from "../lib/labels";

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
  const [techniqueType, setTechniqueType] = useState(initial?.technique_type ?? "");
  const [movementStyle, setMovementStyle] = useState(initial?.movement_style ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [applicationInfo, setApplicationInfo] = useState(initial?.application_info ?? "");
  const [safetyNote, setSafetyNote] = useState(initial?.safety_note ?? "");
  const [practitionerNote, setPractitionerNote] = useState(initial?.practitioner_note ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
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

  const normName = normalizeMasterName(name);
  const duplicate = useMemo(
    () => (!isEdit && normName ? existing?.find((e) => normalizeMasterName(e.label) === normName) ?? null : null),
    [isEdit, normName, existing],
  );

  const cancel = () => {
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikler var. Vazgeçilsin mi?")) return;
    onCancel();
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Teknik adı gerekli.");
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
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black tracking-tight text-slate-900">
          {isEdit ? "Tekniği Düzenle" : "Yeni Teknik"}
        </h2>
      </div>

      <label className="block">
        <span className={fieldLabel}>Teknik Adı *</span>
        <input
          autoFocus
          className={`mt-1 ${kupaInput}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn. Sabit kuru kupa"
          aria-label="Teknik adı"
        />
      </label>

      {duplicate ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[13px] text-amber-800">
            Benzer teknik zaten var: <b>{duplicate.label}</b>
          </p>
          <p className="mt-1 text-[12px] text-amber-700">
            Mevcut tekniği açabilir ya da yine de yeni bir kayıt oluşturabilirsiniz.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabel}>Tür</span>
          <select
            className={`mt-1 ${kupaInput}`}
            value={techniqueType}
            onChange={(e) => setTechniqueType(e.target.value)}
            aria-label="Tür"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={fieldLabel}>Uygulama Biçimi (opsiyonel)</span>
          <select
            className={`mt-1 ${kupaInput}`}
            value={movementStyle}
            onChange={(e) => setMovementStyle(e.target.value)}
            aria-label="Uygulama biçimi"
          >
            {MOVEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={fieldLabel}>Teknik Özeti</span>
        <textarea
          className={`mt-1 ${kupaInput}`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Bu teknik nedir? Kısa, okunabilir genel açıklama."
          aria-label="Teknik özeti"
        />
      </label>

      <label className="block">
        <span className={fieldLabel}>Genel Uygulama Yaklaşımı</span>
        <textarea
          className={`mt-1 ${kupaInput}`}
          rows={3}
          value={applicationInfo}
          onChange={(e) => setApplicationInfo(e.target.value)}
          placeholder="Tekniğin genel uygulama yaklaşımı. Belirli bir protokole özel notları ilgili protokolde tutun."
          aria-label="Genel uygulama yaklaşımı"
        />
      </label>

      <label className="block">
        <span className={fieldLabel}>Güvenlik / Dikkat</span>
        <textarea
          className={`mt-1 ${kupaInput}`}
          rows={2}
          value={safetyNote}
          onChange={(e) => setSafetyNote(e.target.value)}
          placeholder="Tekniğe özel kısa dikkat notu (opsiyonel)."
          aria-label="Güvenlik dikkat notu"
        />
      </label>

      <div>
        <span className={fieldLabel}>Uzman Notum</span>
        <div className="mt-1 rounded-xl border border-slate-200 bg-white p-3">
          {practitionerNote.trim() ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{practitionerNote}</p>
          ) : (
            <p className="text-[13px] text-slate-400">Kişisel mesleki notunuz (formal kaynak değildir).</p>
          )}
          <button type="button" className={`mt-2 ${kupaBtnGhost}`} onClick={() => setNoteEditorOpen(true)}>
            {practitionerNote.trim() ? "Uzman Notunu Düzenle" : "Uzman Notu Ekle"}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          aria-label="Aktif"
        />
        <span className="text-[13px] font-semibold text-slate-600">Aktif</span>
      </label>

      {error ? <p className="text-[13px] font-medium text-rose-600">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" className={kupaBtnGhost} onClick={cancel} disabled={busy}>
          Vazgeç
        </button>
        <button type="button" className={kupaBtnSuccess} onClick={save} disabled={busy}>
          {isEdit ? "Kaydet" : "Oluştur"}
        </button>
      </div>

      <BigNoteEditorDialog
        open={noteEditorOpen}
        title="Uzman Notum"
        value={practitionerNote}
        placeholder="Kişisel mesleki notunuz…"
        onSave={(text) => {
          setPractitionerNote(text);
          setNoteEditorOpen(false);
        }}
        onCancel={() => setNoteEditorOpen(false)}
      />
    </div>
  );
}
