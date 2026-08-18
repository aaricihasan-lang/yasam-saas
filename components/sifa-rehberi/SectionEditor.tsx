"use client";

/**
 * Şifa Rehberi — Section-Native Editör (FAZ 2).
 *
 * Production'daki KARMAŞIK/imported section kayıtları (herbal, hacamat_suluk,
 * bilincalti, source'lu…) 21-alanlı forma geri-map ZORUNLULUĞU OLMADAN doğrudan
 * düzenlenir. section_type/mode/title/note/source/source_kind/expert_note/attention/
 * images KAYIPSIZ taşınır; sıra ↑↓ ile kalıcı değişir (drag YOK → WebView güvenli).
 */

import { useCallback, useState } from "react";
import {
  MODALITIES,
  MODE_LABEL,
  SECTION_TYPE_LABEL,
  SOURCE_KINDS,
  modalityById,
  normalizeModeKey,
  type Modality,
} from "@/lib/sifa-rehberi/sectionModel";
import {
  emptyEditableSection,
  type EditableSection,
} from "@/lib/sifa-rehberi/sectionEditorModel";

export type { EditableSection } from "@/lib/sifa-rehberi/sectionEditorModel";
export {
  sectionRowToEditable,
  editableToPayload,
  emptyEditableSection,
} from "@/lib/sifa-rehberi/sectionEditorModel";

const KEEP = "__keep__";

function keepLabel(s: EditableSection): string {
  const modeKey = normalizeModeKey(s.mode);
  return (
    (modeKey && MODE_LABEL[modeKey]) ||
    SECTION_TYPE_LABEL[s.section_type] ||
    s.section_type ||
    "Mevcut bölüm"
  );
}

function currentModalityValue(s: EditableSection): string {
  const m = modalityById(s.mode);
  // Modalite yalnız mode + section_type birlikte eşleşiyorsa "resolved" sayılır;
  // aksi halde mevcut (section_type,mode) KAYIPSIZ korunur (__keep__).
  if (m && m.section_type === s.section_type) return m.id;
  return KEEP;
}

const fieldBase =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100";
const labelBase = "text-[11px] font-bold uppercase tracking-wide text-emerald-700";
const ctrlBtn =
  "inline-flex h-9 min-w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

// MODALITIES'i görünüm grubuna göre optgroup'la (bitkisel section_type=herbal korunur).
const MODALITY_GROUPS: { label: string; items: Modality[] }[] = [
  { label: "Nedenler / Sebepler", items: MODALITIES.filter((m) => m.group === "reasons") },
  { label: "Uygulamalar / Yöntemler", items: MODALITIES.filter((m) => m.group === "applications") },
  { label: "Doğaltaş", items: MODALITIES.filter((m) => m.group === "stones_details") },
  { label: "İslami Öneriler", items: MODALITIES.filter((m) => m.group === "islamic_suggestions") },
  { label: "Destekleyici", items: MODALITIES.filter((m) => m.group === "supportive") },
];

export function SectionEditor({
  value,
  onChange,
  disabled,
}: {
  value: EditableSection[];
  onChange: (next: EditableSection[]) => void;
  disabled?: boolean;
}) {
  // FAZ 3: yanlış dokunmaya karşı satır-içi silme onayı (ağır modal YOK).
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const update = useCallback(
    (key: string, patch: Partial<EditableSection>) => {
      onChange(value.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    },
    [value, onChange],
  );

  const move = useCallback(
    (index: number, dir: -1 | 1) => {
      const j = index + dir;
      if (j < 0 || j >= value.length) return;
      const next = value.slice();
      [next[index], next[j]] = [next[j], next[index]];
      onChange(next);
    },
    [value, onChange],
  );

  const remove = useCallback(
    (key: string) => {
      setConfirmKey(null);
      onChange(value.filter((s) => s.key !== key));
    },
    [value, onChange],
  );

  const add = useCallback(() => {
    setConfirmKey(null);
    onChange([...value, emptyEditableSection()]);
  }, [value, onChange]);

  const onModalityChange = useCallback(
    (s: EditableSection, selected: string) => {
      if (selected === KEEP) return; // mevcut section_type/mode kayıpsız korunur
      const m = modalityById(selected);
      if (!m) return;
      update(s.key, { section_type: m.section_type, mode: m.id });
    },
    [update],
  );

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-600">Henüz bölüm yok</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Aşağıdan yeni bir bölüm ekleyerek içerik oluşturabilirsiniz.
          </p>
        </div>
      ) : null}

      {value.map((s, i) => {
        const modalityValue = currentModalityValue(s);
        return (
          <article
            key={s.key}
            className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm"
          >
            {/* Üst kontrol satırı — modalite + ↑↓ + sil */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Bölüm türü"
                disabled={disabled}
                value={modalityValue}
                onChange={(e) => onModalityChange(s, e.target.value)}
                className={`${fieldBase} h-9 flex-1 min-w-[160px] py-0 font-semibold`}
              >
                {modalityValue === KEEP ? (
                  <option value={KEEP}>{keepLabel(s)} (mevcut)</option>
                ) : null}
                {MODALITY_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.icon} {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Yukarı taşı"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                  className={ctrlBtn}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Aşağı taşı"
                  disabled={disabled || i === value.length - 1}
                  onClick={() => move(i, 1)}
                  className={ctrlBtn}
                >
                  ↓
                </button>
                {confirmKey === s.key ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[11px] font-bold text-rose-600">Silinsin mi?</span>
                    <button
                      type="button"
                      aria-label="Silmeyi onayla"
                      disabled={disabled}
                      onClick={() => remove(s.key)}
                      className={`${ctrlBtn} border-rose-300 bg-rose-600 text-white hover:bg-rose-700`}
                    >
                      Evet
                    </button>
                    <button
                      type="button"
                      aria-label="Silmeyi iptal et"
                      disabled={disabled}
                      onClick={() => setConfirmKey(null)}
                      className={ctrlBtn}
                    >
                      Vazgeç
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label="Bölümü sil"
                    disabled={disabled}
                    onClick={() => setConfirmKey(s.key)}
                    className={`${ctrlBtn} border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100`}
                  >
                    Sil
                  </button>
                )}
              </div>
            </div>

            {/* Başlık (opsiyonel override) */}
            <div className="mt-3">
              <label className={labelBase}>Başlık (opsiyonel)</label>
              <input
                disabled={disabled}
                value={s.title ?? ""}
                onChange={(e) => update(s.key, { title: e.target.value || null })}
                placeholder="Boş bırakılırsa tür etiketi kullanılır"
                className={`${fieldBase} mt-1`}
              />
            </div>

            {/* Ana içerik (limitsiz) */}
            <div className="mt-3">
              <label className={labelBase}>İçerik</label>
              <textarea
                disabled={disabled}
                value={s.note}
                onChange={(e) => update(s.key, { note: e.target.value })}
                rows={6}
                className={`${fieldBase} mt-1 resize-y leading-6`}
                placeholder="Profesyonel içerik (uzunluk sınırı yoktur)…"
              />
            </div>

            {/* Kaynak / Kaynak Türü */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelBase}>Kaynak Türü (opsiyonel)</label>
                <select
                  disabled={disabled}
                  value={s.source_kind}
                  onChange={(e) => update(s.key, { source_kind: e.target.value })}
                  className={`${fieldBase} mt-1 h-9 py-0`}
                >
                  <option value="">—</option>
                  {SOURCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelBase}>Kaynak (opsiyonel)</label>
                <input
                  disabled={disabled}
                  value={s.source}
                  onChange={(e) => update(s.key, { source: e.target.value })}
                  placeholder="Kitap/eğitim/kaynak adı…"
                  className={`${fieldBase} mt-1`}
                />
              </div>
            </div>

            {/* Uzman Notu — canonical içerikten AYRI */}
            <div className="mt-3">
              <label className={`${labelBase} text-violet-700`}>Uzman Notu (opsiyonel)</label>
              <textarea
                disabled={disabled}
                value={s.expert_note}
                onChange={(e) => update(s.key, { expert_note: e.target.value })}
                rows={3}
                className={`${fieldBase} mt-1 resize-y leading-6`}
                placeholder="Kendi deneyim / gözlem / uygulama notunuz (kaynaktan ayrı)…"
              />
            </div>

            {/* Dikkat Edilmesi Gerekenler — opsiyonel, boş olabilir */}
            <div className="mt-3">
              <label className={`${labelBase} text-amber-700`}>
                Dikkat Edilmesi Gerekenler (opsiyonel)
              </label>
              <textarea
                disabled={disabled}
                value={s.attention}
                onChange={(e) => update(s.key, { attention: e.target.value })}
                rows={2}
                className={`${fieldBase} mt-1 resize-y leading-6`}
                placeholder="Bu bölüme özel dikkat notu (zorunlu değildir)…"
              />
            </div>
          </article>
        );
      })}

      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
      >
        + Yeni Bölüm Ekle
      </button>
    </div>
  );
}
