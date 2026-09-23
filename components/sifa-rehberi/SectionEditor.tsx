"use client";

/**
 * Şifa Rehberi — Section-Native Not Editörü (Premium UX V2).
 *
 * Premium UX V2:
 *  - KONU-KAPSAMLI kullanım (create): tür sabittir (soldaki konu ağacından gelir),
 *    kart-üstü modalite dropdown'u GÖSTERİLMEZ → "türü değiştir" ile "yeni not" karışmaz.
 *  - Her not KENDİ fotoğraflarını taşır (section.images) — konular arası karışmaz.
 *  - Belirgin "+ Yeni Not Ekle" (başlıkta + altta) → yeni bağımsız not eklemek görünür.
 *  - Geniş editör modalindeki buton "Forma Uygula" (DB'ye YAZMAZ; yalnız form taslağına).
 *
 * DB sözleşmesi değişmez: section_type/mode/title/note/source/source_kind/expert_note/
 * attention/images KAYIPSIZ taşınır; sıra ↑↓ ile kalıcı (drag YOK → WebView güvenli).
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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

/** Not fotoğrafı — section.images elemanı (photos/finalize ile aynı şekil). */
export type NoteImage = {
  id: string;
  name?: string;
  file_path?: string;
  url?: string;
  section?: string;
};

export type UploadedImage = { id: string; name: string; file_path: string; previewUrl: string };

function asNoteImages(images: unknown[]): NoteImage[] {
  return (Array.isArray(images) ? images : []).filter(
    (x): x is NoteImage => Boolean(x) && typeof x === "object",
  );
}

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
  if (m && m.section_type === s.section_type) return m.id;
  return KEEP;
}

const fieldBase =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100";
const labelBase = "text-[11px] font-bold uppercase tracking-wide text-emerald-700";
const ctrlBtn =
  "inline-flex h-9 min-w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
const primaryAddBtn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 text-[13px] font-black text-white shadow-md ring-1 ring-emerald-500/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";

function ExpandableTextarea({
  value,
  onExpand,
  rows,
  placeholder,
  disabled,
}: {
  value: string;
  onExpand: () => void;
  rows: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative mt-1">
      <textarea
        readOnly
        disabled={disabled}
        value={value}
        rows={rows}
        placeholder={placeholder}
        title="Düzenlemek için tıklayın veya Enter'a basın"
        role="button"
        aria-haspopup="dialog"
        onClick={() => {
          if (!disabled) onExpand();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExpand();
          }
        }}
        className={`${fieldBase} cursor-pointer resize-none pr-11 leading-6`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={onExpand}
        title="Geniş düzenleyicide aç"
        aria-label="Geniş düzenleyicide aç"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300/60 bg-white/95 text-base font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⤢
      </button>
    </div>
  );
}

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
  makeNewSection,
  allowedModalityIds,
  title,
  subtitle,
  addLabel = "+ Yeni Not Ekle",
  emptyHint = "Bu konu için henüz not yok. Yukarıdaki “Yeni Not Ekle” ile bağımsız bir not oluşturabilirsiniz.",
  onUploadImage,
  onRemoveImage,
  imageUrls,
}: {
  value: EditableSection[];
  onChange: (next: EditableSection[]) => void;
  disabled?: boolean;
  makeNewSection?: () => EditableSection;
  allowedModalityIds?: string[];
  /** Verilirse üstte "Konu başlığı · N not · + Yeni Not Ekle" başlığı gösterilir. */
  title?: string;
  subtitle?: string;
  addLabel?: string;
  emptyHint?: string;
  /** Verilirse her notta fotoğraf ekleme/görüntüleme/silme kontrolleri açılır. */
  onUploadImage?: (file: File) => Promise<UploadedImage>;
  onRemoveImage?: (image: NoteImage) => Promise<void> | void;
  /** imageId → görüntülenecek (signed/preview) URL. */
  imageUrls?: Record<string, string>;
}) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  type LargeField = "note" | "expert_note" | "attention";
  const [large, setLarge] = useState<{ key: string; field: LargeField; label: string } | null>(null);
  const [largeValue, setLargeValue] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Fotoğraf: tek gizli input; hangi notun fotoğrafı yükleniyor (key) izlenir.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetKey, setUploadTargetKey] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [imgLightbox, setImgLightbox] = useState<{ url: string; name?: string } | null>(null);

  useEffect(() => {
    if (large === null && returnFocusRef.current) {
      const el = returnFocusRef.current;
      returnFocusRef.current = null;
      requestAnimationFrame(() => el.focus());
    }
  }, [large]);

  const openLarge = useCallback((key: string, field: LargeField, label: string, current: string) => {
    returnFocusRef.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    setLarge({ key, field, label });
    setLargeValue(current);
  }, []);
  const closeLarge = useCallback(() => {
    setLarge(null);
    setLargeValue("");
  }, []);

  const onModalKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        closeLarge();
        return;
      }
      if (e.key !== "Tab") return;
      const root = modalRef.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>("textarea, button"),
      ).filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex !== -1);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [closeLarge],
  );

  const update = useCallback(
    (key: string, patch: Partial<EditableSection>) => {
      onChange(value.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    },
    [value, onChange],
  );

  const saveLarge = useCallback(() => {
    if (large) update(large.key, { [large.field]: largeValue } as Partial<EditableSection>);
    setLarge(null);
    setLargeValue("");
  }, [large, largeValue, update]);

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
    onChange([...value, (makeNewSection ?? emptyEditableSection)()]);
  }, [value, onChange, makeNewSection]);

  const onModalityChange = useCallback(
    (s: EditableSection, selected: string) => {
      if (selected === KEEP) return;
      const m = modalityById(selected);
      if (!m) return;
      update(s.key, { section_type: m.section_type, mode: m.id });
    },
    [update],
  );

  // ── Fotoğraf işlemleri ─────────────────────────────────────────────────────
  const photosEnabled = Boolean(onUploadImage);

  const triggerPhotoPick = useCallback((key: string) => {
    setUploadTargetKey(key);
    fileInputRef.current?.click();
  }, []);

  const onPhotoFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const key = uploadTargetKey;
      e.target.value = "";
      setUploadTargetKey(null);
      if (!file || !key || !onUploadImage) return;
      const target = value.find((s) => s.key === key);
      if (!target) return;
      setUploadingKey(key);
      try {
        const uploaded = await onUploadImage(file);
        setPreviewUrls((prev) => ({ ...prev, [uploaded.id]: uploaded.previewUrl }));
        const entry: NoteImage = { id: uploaded.id, name: uploaded.name, file_path: uploaded.file_path };
        const nextImages = [...asNoteImages(target.images), entry];
        update(key, { images: nextImages });
      } catch {
        /* hata: sessizce yut (üst katman kendi mesajını gösterebilir) */
      } finally {
        setUploadingKey(null);
      }
    },
    [uploadTargetKey, onUploadImage, value, update],
  );

  const removePhoto = useCallback(
    (key: string, img: NoteImage) => {
      const target = value.find((s) => s.key === key);
      if (!target) return;
      const nextImages = asNoteImages(target.images).filter((i) => i.id !== img.id);
      update(key, { images: nextImages });
      if (onRemoveImage) void Promise.resolve(onRemoveImage(img)).catch(() => {});
    },
    [value, update, onRemoveImage],
  );

  const photoUrl = useCallback(
    (img: NoteImage): string => previewUrls[img.id] ?? imageUrls?.[img.id] ?? img.url ?? "",
    [previewUrls, imageUrls],
  );

  const scopedModalities: Modality[] | null =
    allowedModalityIds && allowedModalityIds.length > 0
      ? MODALITIES.filter((m) => allowedModalityIds.includes(m.id))
      : null;
  const singleModality = scopedModalities !== null && scopedModalities.length === 1;

  const noteCount = value.length;

  return (
    <div className="space-y-3">
      {photosEnabled ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPhotoFileChange}
        />
      ) : null}

      {/* Konu başlığı + not sayısı + belirgin "Yeni Not Ekle" (Premium UX V2). */}
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40 p-3.5 shadow-sm">
          <div className="min-w-0">
            <h3 className="text-[15px] font-black tracking-tight text-slate-950">{title}</h3>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">
              {subtitle ? `${subtitle} · ` : ""}
              {noteCount > 0 ? `${noteCount} not` : "Not yok"}
            </p>
          </div>
          <button type="button" disabled={disabled} onClick={add} className={primaryAddBtn}>
            <span aria-hidden>＋</span> {addLabel.replace(/^\+\s*/, "")}
          </button>
        </div>
      ) : null}

      {value.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-600">Henüz not yok</p>
          <p className="mt-1 text-[12px] text-slate-500">{emptyHint}</p>
        </div>
      ) : null}

      {value.map((s, i) => {
        const modalityValue = currentModalityValue(s);
        const imgs = asNoteImages(s.images);
        return (
          <article
            key={s.key}
            className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm"
          >
            {/* Üst kontrol satırı — içerik türü + ↑↓ + sil */}
            <div className="flex flex-wrap items-center gap-2">
              {singleModality ? (
                <span
                  className="flex h-9 flex-1 min-w-[160px] items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 text-[13px] font-black text-emerald-800"
                  aria-label="Bölüm türü"
                >
                  <span aria-hidden>{scopedModalities![0].icon}</span>
                  {scopedModalities![0].label}
                </span>
              ) : (
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
                  {scopedModalities ? (
                    scopedModalities.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.icon} {m.label}
                      </option>
                    ))
                  ) : (
                    MODALITY_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.items.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.icon} {m.label}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
              )}
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
                    aria-label="Notu sil"
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
              <ExpandableTextarea
                disabled={disabled}
                value={s.note}
                onExpand={() => openLarge(s.key, "note", "İçerik", s.note)}
                rows={6}
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

            {/* Uzman Notu */}
            <div className="mt-3">
              <label className={`${labelBase} text-violet-700`}>Uzman Notu (opsiyonel)</label>
              <ExpandableTextarea
                disabled={disabled}
                value={s.expert_note}
                onExpand={() => openLarge(s.key, "expert_note", "Uzman Notu", s.expert_note)}
                rows={3}
                placeholder="Kendi deneyim / gözlem / uygulama notunuz (kaynaktan ayrı)…"
              />
            </div>

            {/* Dikkat Edilmesi Gerekenler */}
            <div className="mt-3">
              <label className={`${labelBase} text-amber-700`}>
                Dikkat Edilmesi Gerekenler (opsiyonel)
              </label>
              <ExpandableTextarea
                disabled={disabled}
                value={s.attention}
                onExpand={() => openLarge(s.key, "attention", "Dikkat Edilmesi Gerekenler", s.attention)}
                rows={2}
                placeholder="Bu nota özel dikkat notu (zorunlu değildir)…"
              />
            </div>

            {/* Bu NOTA ait fotoğraflar (Premium UX V2) — notlar arası karışmaz. */}
            {photosEnabled ? (
              <div className="mt-3 rounded-xl border border-emerald-100/80 bg-emerald-50/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className={labelBase}>Fotoğraflar (bu nota ait)</label>
                  <button
                    type="button"
                    disabled={disabled || uploadingKey === s.key}
                    onClick={() => triggerPhotoPick(s.key)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-[12px] font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:opacity-60"
                  >
                    <span aria-hidden>📷</span>
                    {uploadingKey === s.key ? "Yükleniyor…" : "Foto Ekle"}
                  </button>
                </div>
                {imgs.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {imgs.map((img) => (
                      <div key={img.id} className="relative w-[72px] shrink-0 rounded-lg border border-emerald-100 bg-white p-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setImgLightbox({ url: photoUrl(img), name: img.name })}
                          className="block w-full overflow-hidden rounded-md"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl(img)} alt={img.name ?? ""} className="aspect-square h-16 w-full object-cover" />
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label="Fotoğrafı kaldır"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            removePhoto(s.key, img);
                          }}
                          className="absolute right-0 top-0 rounded bg-rose-600 px-1 text-[8px] font-black text-white shadow disabled:opacity-50"
                        >
                          Sil
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] font-medium text-slate-400">Bu nota henüz fotoğraf eklenmedi.</p>
                )}
              </div>
            ) : null}
          </article>
        );
      })}

      <button type="button" disabled={disabled} onClick={add} className={`${primaryAddBtn} w-full`}>
        {addLabel}
      </button>

      {/* Geniş düzenleyici modal — uzun metinleri rahat yazmak için (DB'ye YAZMAZ). */}
      {large ? (
        <div
          ref={modalRef}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={large.label}
          onKeyDown={onModalKeyDown}
        >
          <div className="flex h-[85vh] max-h-[85vh] w-full max-w-[1040px] flex-col rounded-[28px] bg-white p-4 shadow-[0_35px_90px_rgba(15,23,42,0.22)] sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1.5 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                  Geniş Düzenleyici
                </div>
                <h2 className="truncate text-[20px] font-black text-slate-950 sm:text-[24px]">{large.label}</h2>
                <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                  Uzun metni buradan rahat yazın. “Forma Uygula” yalnız taslağa aktarır; kalıcı kayıt için sayfadaki Kaydet’i kullanın.
                </p>
              </div>
              <button
                type="button"
                onClick={closeLarge}
                aria-label="Kapat"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-[20px] font-black text-slate-600 transition hover:bg-slate-200"
              >
                ×
              </button>
            </div>

            <textarea
              value={largeValue}
              onChange={(e) => setLargeValue(e.target.value)}
              placeholder="Profesyonel içerik (uzunluk sınırı yoktur)…"
              className="min-h-0 flex-1 resize-none rounded-2xl border-2 border-emerald-200 bg-white/90 p-4 text-[15px] font-medium leading-7 text-slate-800 shadow-inner outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30 sm:p-5"
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={closeLarge}
                className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={saveLarge}
                className="inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 text-[13px] font-black text-white shadow-md transition hover:brightness-105"
              >
                Forma Uygula
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Fotoğraf önizleme (lightbox) */}
      {imgLightbox ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onClick={() => setImgLightbox(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[min(960px,96vw)] rounded-[24px] bg-white p-3 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Fotoğraf önizleme"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgLightbox.url}
              alt={imgLightbox.name ?? ""}
              className="max-h-[min(78vh,720px)] w-auto max-w-full rounded-2xl object-contain"
            />
            <button
              type="button"
              onClick={() => setImgLightbox(null)}
              className="absolute right-3 top-3 rounded-xl bg-slate-950 px-3 py-1.5 text-[11px] font-black text-white"
            >
              Kapat
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
